const logger = require('../utils/logger');

/**
 * Middleware to authenticate requests via API Key.
 * Checks for the presence of x-api-key header and validates it.
 */
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    logger.error('API_KEY is not set in the environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    logger.warn(`Unauthorized API request blocked. IP: ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }

  next();
}

module.exports = authMiddleware;
