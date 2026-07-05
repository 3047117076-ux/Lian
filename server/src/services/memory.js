/**
 * Memory Service — 智能记忆库
 * Auto-extracts important facts from conversations and maintains a living memory bank
 */

const supabase = require('./supabase');
const OpenAI = require('openai');

function getAIClient() {
  const key = process.env.OPENAI_API_KEY;
  const url = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: url });
}

/**
 * Get all memories for a session, newest first
 */
async function getMemories(sessionId, limit = 30) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse(); // chronological
  } catch (err) {
    console.error('Error fetching memories:', err.message);
    return [];
  }
}

/**
 * Save a memory entry
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
 * Use AI to extract key memories from recent conversation
 */
async function extractMemoriesWithAI(sessionId, messages) {
  const client = getAIClient();
  if (!client) {
    console.warn('No AI client available for memory extraction');
    return [];
  }

  const convoText = messages
    .map(m => `[${m.role === 'user' ? '悦宝' : 'Elliott'}]: ${(m.content || '').substring(0, 500)}`)
    .join('\n');

  const prompt = `分析以下对话，提取关于"悦宝"的所有重要信息。每条一行，用第三人称。包括：
- 她的喜好、习惯、日常生活
- 她提到的情绪、感受、想法
- 重要的决定、计划、事件
- 她对Elliott说的话、对关系的期望
- 她喜欢被怎样称呼、对待

输出格式（每条一行）：
- [记忆内容]

对话：
${convoText.substring(convoText.length - 4000)}

请输出提取的关键记忆（用中文）：`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const text = response.choices[0]?.message?.content || '';
    // Parse bullet points
    const memories = text
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(m => m.length > 5);

    return memories;
  } catch (err) {
    console.error('Memory extraction error:', err.message);
    return [];
  }
}

/**
 * Smart compression: use AI to summarize old messages into memories
 */
async function smartCompress(sessionId, settings, messageCount) {
  const threshold = settings.compress_threshold || 20; // lower threshold = more frequent
  const keepRounds = settings.compress_keep_rounds || 8;

  if (messageCount <= threshold * 2) return false;

  try {
    // Get old messages that can be compressed
    const cutoff = messageCount - keepRounds * 2;
    const { data: oldMessages } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true })
      .limit(cutoff);

    if (!oldMessages || oldMessages.length < 10) return false;

    // Extract memories with AI
    const memories = await extractMemoriesWithAI(sessionId, oldMessages);

    if (memories.length > 0) {
      // Save extractions
      for (const mem of memories) {
        await saveMemory(sessionId, mem);
      }
      console.log(`🧠 Saved ${memories.length} memories for session ${sessionId}`);
    } else {
      // Fallback: save summary
      const summary = oldMessages.slice(-20)
        .map(m => `[${m.role === 'user' ? '悦宝' : 'Elliott'}]: ${(m.content || '').substring(0, 200)}`)
        .join(' | ');
      await saveMemory(sessionId, `对话片段: ${summary.substring(0, 500)}`);
      console.log(`📝 Fallback summary saved for session ${sessionId}`);
    }

    // Mark compressed messages as invisible
    const oldIds = oldMessages.map(m => m.id);
    await supabase.from('messages').update({ visible: false }).in('id', oldIds);

    return true;
  } catch (err) {
    console.error('Compress error:', err.message);
    return false;
  }
}

module.exports = {
  getMemories,
  saveMemory,
  smartCompress,
};
