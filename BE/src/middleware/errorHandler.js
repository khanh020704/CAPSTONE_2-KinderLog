/**
 * Async error wrapper – avoids try/catch in every route handler
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Central error handler middleware (add at the end of app.js)
 */
function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err.status) return res.status(err.status).json({ error: err.message });
  res.status(500).json({ error: 'Internal server error.' });
}

/**
 * Create a 4xx HTTP error
 */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { asyncHandler, errorHandler, httpError };
