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
        break;
      }
    }

    // Save assistant message
    const assistantMsgId = uuidv4();
    await supabase.from('messages').insert({
      id: assistantMsgId,
      session_id: sessionId,
      role: 'assistant',
      content: fullContent,
      reasoning_content: fullReasoning || null,
      visible: true,
      created_at: new Date().toISOString(),
    });

    res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMsgId })}\n\n`);
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
 * Delete last assistant reply and re-generate
 */
router.post('/regenerate', async (req, res) => {
  try {
    const { sessionId, provider, model } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    // Find and delete last assistant message
    const { data: lastAssistant } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .eq('visible', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (lastAssistant?.length > 0) {
      await supabase.from('messages').update({ visible: false }).eq('id', lastAssistant[0].id);
    }

    // Find last user message
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

    const message = lastUser[0].content;

    // Now do a normal send
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const { data: settingsRow } = await supabase.from('settings').select('*').eq('session_id', sessionId).maybeSingle();
    const settings = settingsRow || {};
    const { getMemories, smartCompress } = require('../services/memory');

    const memories = await getMemories(sessionId);
    const { data: history } = await supabase.from('messages').select('*').eq('session_id', sessionId).eq('visible', true).order('created_at', { ascending: true });

    const systemPrompt = (require('../services/ai').buildSystemPrompt)(settings.system_prompt, memories);
    const messages = (require('../services/ai').buildMessages)(history || [], settings.max_context_rounds);
    // Remove the last user message from history (we'll add it back)
    const lastIdx = messages.findLastIndex(m => m.role === 'user');
    if (lastIdx >= 0) messages.splice(lastIdx, 1);
    messages.push({ role: 'user', content: message });

    const aiSettings = { ...settings, provider: provider || settings.provider || 'openai', model: model || settings.model || 'claude-full' };
    const { streamAI } = require('../services/ai');

    let fullContent = '', fullReasoning = '';
    for await (const chunk of streamAI(systemPrompt, messages, aiSettings)) {
      if (chunk.type === 'text') { res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.text })}\n\n`); }
      else if (chunk.type === 'thinking') { res.write(`data: ${JSON.stringify({ type: 'thinking', text: chunk.text })}\n\n`); }
      else if (chunk.type === 'thinking_start') { res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`); }
      else if (chunk.type === 'thinking_end') { res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`); }
      else if (chunk.type === 'done') { fullContent = chunk.content; fullReasoning = chunk.reasoning; break; }
    }

    const assistantMsgId = uuidv4();
    await supabase.from('messages').insert({
      id: assistantMsgId, session_id: sessionId, role: 'assistant',
      content: fullContent, reasoning_content: fullReasoning || null,
      visible: true, created_at: new Date().toISOString(),
    });

    res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMsgId })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Regenerate error:', err);
    if (!res.headersSent) return res.status(500).json({ error: err.message });
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
