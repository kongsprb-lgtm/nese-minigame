const express = require('express');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');

function createServer() {
  const app = express();

  // Middleware to parse JSON payloads
  app.use(express.json());

  // Error handling middleware for malformed JSON
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON payload' });
    }
    next();
  });

  // Mount API routes directly at root to match specified endpoint structures
  app.use('/', apiRoutes);

  // Global catch-all route for unhandled paths
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}

module.exports = { createServer };
