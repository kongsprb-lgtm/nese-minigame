require('dotenv').config();
if (process.env.USE_MOCK_DB === 'true') {
  require('./database/mockMongoose');
}
const { connectDatabase } = require('./database/connection');
const { createServer } = require('./server');
const { startBot } = require('./bot');
const ShopItem = require('./models/ShopItem');
const logger = require('./utils/logger');

// Default shop items to seed if database is empty
const defaultShopItems = [
  {
    id: 'sword_01',
    name: 'Bronze Sword',
    description: 'A reliable sword forged from bronze. Good for beginners.',
    price: 100,
    category: 'Weapons'
  },
  {
    id: 'shield_01',
    name: 'Wooden Shield',
    description: 'A basic shield to block light attacks.',
    price: 50,
    category: 'Armor'
  },
  {
    id: 'potion_health',
    name: 'Health Potion',
    description: 'Restores 50 health points instantly.',
    price: 25,
    category: 'Consumables'
  },
  {
    id: 'wings_neon',
    name: 'Neon Angel Wings',
    description: 'Beautiful, glowing neon wings that allow you to hover.',
    price: 500,
    category: 'Accessories'
  },
  {
    id: 'slot_13',
    name: 'Title Slot 13',
    description: 'Unlocks Slot 13 in the custom Title Editor.',
    price: 25,
    category: 'Slots'
  },
  {
    id: 'slot_15',
    name: 'Title Slot 15',
    description: 'Unlocks Slot 15 in the custom Title Editor.',
    price: 50,
    category: 'Slots'
  }
];

// Seed shop items into database if they do not exist
async function seedShopItems() {
  try {
    logger.info('Checking and seeding default shop items...');
    for (const item of defaultShopItems) {
      await ShopItem.updateOne(
        { id: item.id },
        { $setOnInsert: item },
        { upsert: true }
      );
    }
    logger.info('Default shop items seeding check complete.');
  } catch (error) {
    logger.error(`Failed to seed shop items: ${error.message}`);
  }
}

async function main() {
  logger.info('Starting Discord-Roblox Integration Backend...');

  // 1. Connect to MongoDB
  await connectDatabase();

  // 2. Seed default shop items
  await seedShopItems();

  // 3. Initialize and start Web Server
  const app = createServer();
  const port = process.env.PORT || 3000;
  
  app.listen(port, () => {
    logger.info(`Web API Server running on port ${port}`);
  });

  // 4. Initialize and start Discord Bot
  await startBot();
}

main().catch(error => {
  logger.error(`Critical startup error: ${error.message}`);
  process.exit(1);
});
