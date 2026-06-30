const User = require('../models/User');
const PendingSync = require('../models/PendingSync');
const ShopItem = require('../models/ShopItem');
const pointsService = require('../utils/points');
const logger = require('../utils/logger');

// Generate a random 6-character alphanumeric code
function generateSyncCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * POST /sync
 * Generates a 6-character code to synchronize Roblox account profiles.
 * Body parameters: robloxId, username
 */
async function generateSync(req, res) {
  const { robloxId, username } = req.body;

  if (!robloxId || !username) {
    return res.status(400).json({ error: 'Missing robloxId or username in request body' });
  }

  try {
    // Generate a unique code (retry if code already exists to avoid collisions)
    let code;
    let existingSync;
    let attempts = 0;

    do {
      code = generateSyncCode();
      existingSync = await PendingSync.findOne({ code });
      attempts++;
    } while (existingSync && attempts < 5);

    if (existingSync) {
      logger.error('Failed to generate a unique synchronization code after multiple attempts');
      return res.status(500).json({ error: 'Failed to generate synchronization code. Please try again.' });
    }

    // Save pending synchronization code, upserting for this specific robloxId if they request a code again
    await PendingSync.findOneAndUpdate(
      { robloxId },
      { code, username, createdAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info(`Generated synchronization code ${code} for Roblox ID: ${robloxId} (${username})`);
    return res.status(200).json({
      success: true,
      code,
      robloxId,
      username
    });
  } catch (error) {
    logger.error(`Error in generateSync: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /player/:robloxId
 * Returns the player details (points, inventory, sync status, etc.)
 */
async function getPlayer(req, res) {
  const { robloxId } = req.params;

  if (!robloxId) {
    return res.status(400).json({ error: 'Missing robloxId parameter' });
  }

  try {
    const user = await User.findOne({ robloxId });

    if (!user) {
      return res.status(404).json({ error: 'Player not found in database' });
    }

    return res.status(200).json({
      success: true,
      player: {
        robloxId: user.robloxId,
        discordId: user.discordId,
        username: user.username,
        points: user.points,
        inventory: user.inventory,
        linked: user.linked,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error(`Error in getPlayer: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /inventory/:robloxId
 * Returns the player's inventory array
 */
async function getInventory(req, res) {
  const { robloxId } = req.params;

  if (!robloxId) {
    return res.status(400).json({ error: 'Missing robloxId parameter' });
  }

  try {
    const user = await User.findOne({ robloxId });

    if (!user) {
      return res.status(404).json({ error: 'Player not found in database' });
    }

    return res.status(200).json({
      success: true,
      inventory: user.inventory
    });
  } catch (error) {
    logger.error(`Error in getInventory: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /addpoints
 * Adds points to a player.
 * Body parameters: robloxId, amount
 */
async function addPoints(req, res) {
  const { robloxId, amount } = req.body;

  if (!robloxId || amount === undefined) {
    return res.status(400).json({ error: 'Missing robloxId or amount in request body' });
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const user = await pointsService.addPoints(robloxId, numericAmount);
    return res.status(200).json({
      success: true,
      robloxId: user.robloxId,
      points: user.points
    });
  } catch (error) {
    logger.error(`Error in addPoints API: ${error.message}`);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /removepoints
 * Removes points from a player.
 * Body parameters: robloxId, amount
 */
async function removePoints(req, res) {
  const { robloxId, amount } = req.body;

  if (!robloxId || amount === undefined) {
    return res.status(400).json({ error: 'Missing robloxId or amount in request body' });
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const user = await pointsService.removePoints(robloxId, numericAmount);
    return res.status(200).json({
      success: true,
      robloxId: user.robloxId,
      points: user.points
    });
  } catch (error) {
    logger.error(`Error in removePoints API: ${error.message}`);
    
    if (error.message.includes('Insufficient points') || error.message.includes('User not found')) {
      return res.status(400).json({ error: error.message });
    }
    
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /redeem
 * Redeems/purchases a shop item for a player.
 * Body parameters: robloxId, itemId
 */
async function redeemItem(req, res) {
  const { robloxId, itemId } = req.body;

  if (!robloxId || !itemId) {
    return res.status(400).json({ error: 'Missing robloxId or itemId in request body' });
  }

  try {
    // 1. Fetch item details
    const item = await ShopItem.findOne({ id: itemId });
    if (!item) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    // 2. Atomically check points and deduct, then push the item to inventory
    // To ensure the user exists, we first find them.
    const userCheck = await User.findOne({ robloxId });
    if (!userCheck) {
      return res.status(404).json({ error: 'Player not found in database' });
    }

    if (userCheck.points < item.price) {
      return res.status(400).json({ 
        error: `Insufficient points. Item cost: ${item.price}, player balance: ${userCheck.points}` 
      });
    }

    // Atomically purchase
    const user = await User.findOneAndUpdate(
      { robloxId, points: { $gte: item.price } },
      {
        $inc: { points: -item.price },
        $push: {
          inventory: {
            id: item.id,
            name: item.name,
            price: item.price,
            category: item.category,
            purchasedAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!user) {
      // Race condition safety fallback
      return res.status(400).json({ error: 'Purchase failed (insufficient points/race condition)' });
    }

    logger.info(`Roblox ID ${robloxId} purchased item: ${item.name} (${item.id}) for ${item.price} points.`);

    return res.status(200).json({
      success: true,
      robloxId: user.robloxId,
      points: user.points,
      purchasedItem: {
        id: item.id,
        name: item.name,
        price: item.price,
        category: item.category
      }
    });
  } catch (error) {
    logger.error(`Error in redeemItem: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  generateSync,
  getPlayer,
  getInventory,
  addPoints,
  removePoints,
  redeemItem
};
