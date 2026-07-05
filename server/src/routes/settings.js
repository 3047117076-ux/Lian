/**
 * Settings routes — per-session settings management
 */
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

/**
 * GET /api/settings/:sessionId
 * Get settings for a specific session
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/settings/:sessionId
 * Update settings for a session
 */
router.put('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;

    const allowedFields = [
      'system_prompt', 'temperature', 'max_context_rounds',
      'max_context_tokens', 'compress_threshold', 'compress_keep_rounds',
      'max_reply_tokens', 'provider',
      'user_avatar', 'assistant_avatar', 'background_image',
    ];

    const filtered = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filtered[field] = updates[field];
      }
    }

    filtered.updated_at = new Date().toISOString();

    // Upsert: insert or update
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from('settings')
        .update(filtered)
        .eq('session_id', sessionId)
        .select()
        .single();
    } else {
      const { v4: uuidv4 } = require('uuid');
      filtered.id = uuidv4();
      filtered.session_id = sessionId;
      result = await supabase
        .from('settings')
        .insert(filtered)
        .select()
        .single();
    }

    if (result.error) throw result.error;
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
