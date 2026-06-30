const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectDatabase() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roblox-discord';
  
  try {
    mongoose.connection.on('connected', () => {
      logger.info('Successfully connected to MongoDB database.');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection lost.');
    });

    await mongoose.connect(mongoUri);
  } catch (error) {
    logger.error(`Failed to establish initial MongoDB connection: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { connectDatabase };
