/**
 * Upload route — store files to Supabase Storage
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const ext = req.file.originalname.split('.').pop() || 'png';
    const filename = `avatars/${uuidv4()}.${ext}`;

    const { data, error } = await supabase.storage
      .from('images')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('images').getPublicUrl(filename);
    res.json({ url: urlData.publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
