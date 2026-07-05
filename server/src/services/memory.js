/**
 * Memory Service — compress conversation history into summaries
 */

const supabase = require('./supabase');

/**
 * Get memories for a session, ordered by recency
 */
async function getMemories(sessionId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching memories:', err.message);
    return [];
  }
}

/**
 * Save a new memory
 */
async function saveMemory(sessionId, summary) {
  try {
    const { error } = await supabase
      .from('memories')
      .insert({
        session_id: sessionId,
        summary,
        timestamp: new Date().toISOString(),
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error saving memory:', err.message);
    return false;
  }
}

/**
 * Check if compression is needed and compress old messages into a memory summary.
 *
 * Strategy: When message count exceeds compress_threshold, take messages
 * before compress_keep_rounds and ask AI to summarize them, then store
 * the summary as a memory.
 */
async function maybeCompress(sessionId, settings, messageCount) {
  const threshold = settings.compress_threshold || 50;
  const keepRounds = settings.compress_keep_rounds || 10;
  const thresholdMessages = threshold * 2; // rounds -> messages

  if (messageCount <= thresholdMessages) return false;

  try {
    // Fetch old messages (before keep_rounds)
    const { data: oldMessages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true })
      .limit(messageCount - keepRounds * 2);

    if (error || !oldMessages || oldMessages.length === 0) return false;

    // Build a summary text
    const conversationText = oldMessages
      .map(m => `[${m.role === 'user' ? 'Bunny' : 'Elliott'}]: ${m.content}`)
      .join('\n');

    const summary = `Previous conversation summary (${oldMessages.length} messages):\n${conversationText.substring(0, 2000)}...`;

    // Mark old messages as invisible (soft delete)
    const oldIds = oldMessages.map(m => m.id);
    await supabase
      .from('messages')
      .update({ visible: false })
      .in('id', oldIds);

    // Save as memory
    await saveMemory(sessionId, summary);

    console.log(`📝 Compressed ${oldIds.length} messages → memory for session ${sessionId}`);
    return true;
  } catch (err) {
    console.error('Error compressing:', err.message);
    return false;
  }
}

module.exports = {
  getMemories,
  saveMemory,
  maybeCompress,
};
