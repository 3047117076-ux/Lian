/**
 * Sessions routes — CRUD for chat sessions
 */
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/sessions
 * List all sessions, newest first
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions
 * Create a new session with default settings
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    // Create session
    const { error: sessErr } = await supabase.from('sessions').insert({
      id: sessionId,
      name: name || 'New Chat',
      created_at: now,
      updated_at: now,
    });
    if (sessErr) throw sessErr;

    // Create default settings
    const { error: setErr } = await supabase.from('settings').insert({
      id: uuidv4(),
      session_id: sessionId,
      system_prompt: null,
      temperature: 0.8,
      max_context_rounds: 50,
      max_context_tokens: 100000,
      compress_threshold: 50,
      compress_keep_rounds: 10,
      max_reply_tokens: 4096,
      updated_at: now,
    });
    if (setErr) throw setErr;

    res.status(201).json({ id: sessionId, name: name || 'New Chat', created_at: now, updated_at: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sessions/:id
 * Delete a session and its messages/memories/settings
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete related data
    await supabase.from('messages').delete().eq('session_id', id);
    await supabase.from('memories').delete().eq('session_id', id);
    await supabase.from('settings').delete().eq('session_id', id);

    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/:id/messages
 * Get messages for a session
 */
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', id)
      .eq('visible', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/sessions/:id
 * Rename a session
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const { data, error } = await supabase
      .from('sessions')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
