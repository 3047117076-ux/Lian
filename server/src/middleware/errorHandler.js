/**
 * Error handling middleware
 */
function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message);

  if (err.type === 'entity.too_large') {
    return res.status(413).json({ error: 'Request too large' });
  }

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

module.exports = errorHandler;
