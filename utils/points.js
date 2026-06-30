const User = require('../models/User');
const logger = require('./logger');

/**
 * Adds points to a player by their Roblox ID.
 * If the user does not exist in the database, a new record is created.
 * 
 * @param {string} robloxId - The Roblox UserId
 * @param {number} amount - The number of points to add (must be positive)
 * @returns {Promise<object>} The updated user document
 */
async function addPoints(robloxId, amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  try {
    // Atomically increment points or create user if not exists
    const user = await User.findOneAndUpdate(
      { robloxId },
      { $inc: { points: amount } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    logger.info(`Added ${amount} points to Roblox ID: ${robloxId}. New balance: ${user.points}`);
    return user;
  } catch (error) {
    logger.error(`Error adding points to Roblox ID ${robloxId}: ${error.message}`);
    throw error;
  }
}

/**
 * Removes points from a player by their Roblox ID.
 * Prevents points from going negative.
 * 
 * @param {string} robloxId - The Roblox UserId
 * @param {number} amount - The number of points to remove (must be positive)
 * @returns {Promise<object>} The updated user document
 * @throws {Error} If points are insufficient or user is not found
 */
async function removePoints(robloxId, amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  try {
    // Atomically decrement points only if the player has at least 'amount' points
    const user = await User.findOneAndUpdate(
      { robloxId, points: { $gte: amount } },
      { $inc: { points: -amount } },
      { new: true }
    );

    if (!user) {
      // Check if user exists at all to throw a specific error
      const existingUser = await User.findOne({ robloxId });
      if (!existingUser) {
        throw new Error('User not found');
      } else {
        throw new Error(`Insufficient points. Current balance: ${existingUser.points}, attempted to remove: ${amount}`);
      }
    }

    logger.info(`Removed ${amount} points from Roblox ID: ${robloxId}. New balance: ${user.points}`);
    return user;
  } catch (error) {
    logger.error(`Error removing points from Roblox ID ${robloxId}: ${error.message}`);
    throw error;
  }
}

/**
 * Retrieves the point balance of a player by Roblox ID.
 * Returns 0 if the user does not exist.
 * 
 * @param {string} robloxId - The Roblox UserId
 * @returns {Promise<number>} The player's point balance
 */
async function getPoints(robloxId) {
  try {
    const user = await User.findOne({ robloxId });
    return user ? user.points : 0;
  } catch (error) {
    logger.error(`Error getting points for Roblox ID ${robloxId}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  addPoints,
  removePoints,
  getPoints
};
