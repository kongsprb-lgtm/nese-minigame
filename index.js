require('dotenv').config();
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
  }
];

// Seed shop items into database if they do not exist
async function seedShopItems() {
  try {
    const count = await ShopItem.countDocuments();
    if (count === 0) {
      logger.info('ShopItem database is empty. Seeding default items...');
      await ShopItem.insertMany(defaultShopItems);
      logger.info(`Successfully seeded ${defaultShopItems.length} default shop items.`);
    } else {
      logger.debug('ShopItem database already has items. Seeding skipped.');
    }
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
