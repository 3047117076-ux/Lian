/**
 * Chat routes — SSE streaming chat endpoint
 */
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { streamAI, buildSystemPrompt, buildMessages } = require('../services/ai');
const { getMemories, smartCompress } = require('../services/memory');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/chat/send
 * Send a message and get AI reply via SSE streaming
 */
router.post('/send', async (req, res) => {
  try {
    const { sessionId, message, provider, model } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Get session settings
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    const settings = settingsRow || {};

    // Get memories
    const memories = await getMemories(sessionId);

    // Get message history
    const { data: history } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true });

    // Save user message
    const userMsgId = uuidv4();
    await supabase.from('messages').insert({
      id: userMsgId,
      session_id: sessionId,
      role: 'user',
      content: message,
      visible: true,
      reply_version: 0,
      created_at: new Date().toISOString(),
    });

    // Update session updated_at
    await supabase.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);

    // Build prompt and messages
    const systemPrompt = buildSystemPrompt(settings.system_prompt, memories);
    const messages = buildMessages(history || [], settings.max_context_rounds);
    messages.push({ role: 'user', content: message });

    // Stream AI response
    let fullContent = '';
    let fullReasoning = '';
    let tokenUsage = null;

    const aiSettings = {
      ...settings,
      provider: provider || settings.provider || 'openai',
      model: model || settings.model || 'claude-full',
    };

    for await (const chunk of streamAI(systemPrompt, messages, aiSettings)) {
      if (chunk.type === 'text') {
        res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.text })}\n\n`);
      } else if (chunk.type === 'thinking') {
        res.write(`data: ${JSON.stringify({ type: 'thinking', text: chunk.text })}\n\n`);
      } else if (chunk.type === 'thinking_start') {
        res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`);
      } else if (chunk.type === 'thinking_end') {
        res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`);
      } else if (chunk.type === 'done') {
        fullContent = chunk.content;
        fullReasoning = chunk.reasoning;
        if (chunk.usage) tokenUsage = chunk.usage;
        break;
      }
    }

    // Save assistant message(s) — split on --- for multi-bubble
    const parts = fullContent.split(/\n?---\n?/).filter(p => p.trim());
    const msgIds = [];
    const versionGroup = uuidv4(); // group all parts + regenerations together
    for (let i = 0; i < parts.length; i++) {
      const msgId = uuidv4();
      await supabase.from('messages').insert({
        id: msgId,
        session_id: sessionId,
        role: 'assistant',
        content: parts[i].trim(),
        reasoning_content: i === 0 ? (fullReasoning || null) : null,
        visible: true,
        reply_to: userMsgId,
        reply_version: i,
        version_group: versionGroup,
        usage: i === 0 ? tokenUsage : null,
        created_at: new Date(Date.now() + i * 100).toISOString(),
      });
      msgIds.push(msgId);
    }

    res.write(`data: ${JSON.stringify({ type: 'done', messageId: msgIds[0], multiParts: msgIds })}\n\n`);
    res.end();

    // Check if compression is needed (async, don't block response)
    const messageCount = (history?.length || 0) + 2; // +2 for the user+assistant just added
    smartCompress(sessionId, settings, messageCount).catch(err =>
      console.error('Compress error:', err.message)
    );

  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/chat/regenerate
 * Regenerate from a specific assistant message or the last one.
 * Body: { sessionId, provider, model, messageId? }
 * - If messageId is given: hide that assistant msg + everything after it, regenerate from the user msg before it.
 * - If no messageId: regenerate from the last user message.
 */
router.post('/regenerate', async (req, res) => {
  try {
    const { sessionId, provider, model, messageId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    let userMsgId, message;
    let deletedIds = [];

    if (messageId) {
      const { data: targetMsg } = await supabase
        .from('messages').select('*').eq('id', messageId).single();
      if (!targetMsg) return res.status(404).json({ error: 'Message not found' });

      const { data: userMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('role', 'user')
        .eq('visible', true)
        .lt('created_at', targetMsg.created_at)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!userMsg || userMsg.length === 0) {
        return res.status(400).json({ error: 'No user message found before this reply' });
      }

      userMsgId = userMsg[0].id;
      message = userMsg[0].content;

      // Hide target AI reply + everything after it (old branch)
      const { data: afterMsgs } = await supabase.from('messages')
        .select('id').eq('session_id', sessionId)
        .eq('visible', true).gte('created_at', targetMsg.created_at);
      if (afterMsgs?.length > 0) {
        deletedIds = afterMsgs.map(m => m.id);
        await supabase.from('messages').update({ visible: false }).in('id', deletedIds);
      }
    } else {
      // No messageId: regenerate from the last user message
      const { data: lastUser } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('role', 'user')
        .eq('visible', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!lastUser || lastUser.length === 0) {
        return res.status(400).json({ error: 'No user message to regenerate from' });
      }
      userMsgId = lastUser[0].id;
      message = lastUser[0].content;

      // Keep old reply — don't hide
    }

    // Find version number
    const { data: versions } = await supabase
      .from('messages')
      .select('reply_version')
      .eq('reply_to', userMsgId)
      .eq('role', 'assistant')
      .order('reply_version', { ascending: false })
      .limit(1);

    const nextVersion = (versions?.[0]?.reply_version ?? -1) + 1;

    // SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const { data: settingsRow } = await supabase.from('settings').select('*').eq('session_id', sessionId).maybeSingle();
    const settings = settingsRow || {};
    const { getMemories } = require('../services/memory');
    const { streamAI, buildSystemPrompt, buildMessages } = require('../services/ai');

    const memories = await getMemories(sessionId);
    const { data: history } = await supabase.from('messages').select('*').eq('session_id', sessionId).eq('visible', true).order('created_at', { ascending: true });

    const systemPrompt = buildSystemPrompt(settings.system_prompt, memories);
    const messages = buildMessages(history || [], settings.max_context_rounds);
    // Remove the triggering user message from history (will re-add)
    const lastIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastIdx >= 0) {
      const removeIdx = messages.length - 1 - lastIdx;
      if (messages[removeIdx]?.content === message) messages.splice(removeIdx, 1);
    }
    messages.push({ role: 'user', content: message });

    const aiSettings = { ...settings, provider: provider || settings.provider || 'openai', model: model || settings.model || 'claude-full' };

    let fullContent = '', fullReasoning = '';
    for await (const chunk of streamAI(systemPrompt, messages, aiSettings)) {
      if (chunk.type === 'text') { res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.text })}\n\n`); }
      else if (chunk.type === 'thinking') { res.write(`data: ${JSON.stringify({ type: 'thinking', text: chunk.text })}\n\n`); }
      else if (chunk.type === 'thinking_start') { res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`); }
      else if (chunk.type === 'thinking_end') { res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`); }
      else if (chunk.type === 'done') { fullContent = chunk.content; fullReasoning = chunk.reasoning; break; }
    }

    // Find version_group from old reply (if regenerating from a specific message)
    let existingVG = null;
    if (messageId) {
      const { data: oldReply } = await supabase.from('messages').select('version_group').eq('id', messageId).single();
      existingVG = oldReply?.version_group;
    }

    const assistantMsgId = uuidv4();
    await supabase.from('messages').insert({
      id: assistantMsgId, session_id: sessionId, role: 'assistant',
      content: fullContent, reasoning_content: fullReasoning || null,
      visible: true, reply_to: userMsgId, reply_version: nextVersion,
      version_group: existingVG || uuidv4(),
      created_at: new Date().toISOString(),
    });

    res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMsgId, replyVersion: nextVersion, deletedIds })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Regenerate error:', err);
    if (!res.headersSent) return res.status(500).json({ error: err.message });
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/chat/versions
 * Get all reply versions — by reply_to or by version_group
 */
router.get('/versions', async (req, res) => {
  try {
    const { reply_to, version_group } = req.query;
    let query;

    if (reply_to) {
      query = supabase.from('messages')
        .select('id, content, role, reply_version, created_at')
        .eq('reply_to', reply_to)
        .eq('visible', true)
        .order('reply_version', { ascending: true });
    } else if (version_group) {
      query = supabase.from('messages')
        .select('id, content, role, reply_version, visible, created_at')
        .eq('version_group', version_group)
        .order('reply_version', { ascending: false });
    } else {
      return res.status(400).json({ error: 'reply_to or version_group required' });
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/chat/edit-message
 * Edit a user message (creates new version)
 */
router.patch('/edit-message', async (req, res) => {
  try {
    const { messageId, newContent } = req.body;
    if (!messageId || !newContent) return res.status(400).json({ error: 'messageId and newContent required' });

    const { data: old } = await supabase.from('messages').select('*').eq('id', messageId).single();
    if (!old) return res.status(404).json({ error: 'Message not found' });

    // Create new version (keep old as hidden)
    const versionGroup = old.version_group || old.id;
    const nextVersion = (old.reply_version || 0) + 1;

    // Hide old user message
    await supabase.from('messages').update({ visible: false }).eq('id', messageId);

    // Create new version
    const newId = uuidv4();
    await supabase.from('messages').insert({
      id: newId, session_id: old.session_id, role: 'user',
      content: newContent, visible: true,
      version_group: versionGroup, reply_version: nextVersion,
      created_at: new Date().toISOString(),
    });

    // Mark old version with version_group
    if (!old.version_group) {
      await supabase.from('messages').update({ version_group: versionGroup, reply_version: 0 }).eq('id', messageId);
    }

    // Hide the AI reply after old msg + everything after it (the old branch)
    const { data: afterMsgs } = await supabase.from('messages')
      .select('id').eq('session_id', old.session_id)
      .eq('visible', true).gt('created_at', old.created_at);
    if (afterMsgs?.length > 0) {
      await supabase.from('messages').update({ visible: false })
        .in('id', afterMsgs.map(m => m.id));
    }

    res.json({ id: newId, content: newContent, versionGroup, replyVersion: nextVersion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/chat/delete-message
 * Soft delete a message
 */
router.patch('/delete-message', async (req, res) => {
  try {
    const { messageId } = req.body;
    if (!messageId) return res.status(400).json({ error: 'messageId required' });

    const { error } = await supabase.from('messages').update({ visible: false }).eq('id', messageId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chat/usage/:sessionId
 * Get token usage summary for a session
 */
router.get('/usage/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data, error } = await supabase
      .from('messages')
      .select('usage, created_at')
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .not('usage', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Aggregate usage
    let totalPrompt = 0, totalCompletion = 0, totalTokens = 0;
    const daily = {};
    for (const msg of (data || [])) {
      if (msg.usage) {
        totalPrompt += msg.usage.prompt_tokens || 0;
        totalCompletion += msg.usage.completion_tokens || 0;
        totalTokens += msg.usage.total_tokens || 0;
        const day = (msg.created_at || '').substring(0, 10);
        if (!daily[day]) daily[day] = { prompt: 0, completion: 0, total: 0, count: 0 };
        daily[day].prompt += msg.usage.prompt_tokens || 0;
        daily[day].completion += msg.usage.completion_tokens || 0;
        daily[day].total += msg.usage.total_tokens || 0;
        daily[day].count++;
      }
    }

    res.json({
      totalPrompt, totalCompletion, totalTokens,
      requestCount: data?.length || 0,
      daily,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
