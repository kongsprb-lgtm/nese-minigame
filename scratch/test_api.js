// Mock Mongoose before requiring any other file to run in-memory without actual MongoDB
const mongoose = require('mongoose');

// Mock connect and connection
mongoose.connect = async () => {
  console.log('[MOCK DB] Successfully established mock database connection.');
};

mongoose.connection = {
  on: (event, cb) => {
    if (event === 'connected') {
      setTimeout(cb, 50);
    }
  },
  close: async () => {
    console.log('[MOCK DB] Closed mock database connection.');
  }
};

const modelsStore = {};
mongoose.model = (name, schema) => {
  if (modelsStore[name]) return modelsStore[name];

  const store = [];
  
  const mockModel = function(data) {
    Object.assign(this, data);
    this.save = async () => {
      const idx = store.findIndex(x => x === this || (this._id && x._id === this._id));
      if (idx >= 0) {
        store[idx] = this;
      } else {
        if (!this._id) this._id = Math.random().toString();
        store.push(this);
      }
      return this;
    };
  };

  mockModel.store = store;

  mockModel.find = async () => {
    return store.map(x => new mockModel(x));
  };

  mockModel.findOne = async (query) => {
    const doc = store.find(item => {
      for (const k in query) {
        // Special case: $ne
        if (query[k] && typeof query[k] === 'object' && '$ne' in query[k]) {
          const val = query[k]['$ne'];
          if (item[k] === val) return false;
          continue;
        }
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
    if (!doc) return null;
    return new mockModel(doc);
  };

  mockModel.findOneAndUpdate = async (filter, update, options) => {
    let idx = store.findIndex(item => {
      for (const k in filter) {
        // Special case: $gte
        if (filter[k] && typeof filter[k] === 'object' && '$gte' in filter[k]) {
          const val = filter[k]['$gte'];
          if ((item[k] || 0) < val) return false;
          continue;
        }
        if (item[k] !== filter[k]) return false;
      }
      return true;
    });

    let doc;
    if (idx >= 0) {
      doc = store[idx];
    } else if (options && options.upsert) {
      doc = { 
        _id: Math.random().toString(), 
        points: 0, 
        inventory: [], 
        linked: false, 
        createdAt: new Date() 
      };
      
      // Copy filter properties into new doc (if not special operator objects)
      for (const k in filter) {
        if (filter[k] && typeof filter[k] !== 'object') {
          doc[k] = filter[k];
        }
      }
      store.push(doc);
      idx = store.length - 1;
    } else {
      return null;
    }

    // Apply updates
    if (update.$inc) {
      for (const k in update.$inc) {
        doc[k] = (doc[k] || 0) + update.$inc[k];
      }
    }
    if (update.$push) {
      for (const k in update.$push) {
        doc[k] = doc[k] || [];
        doc[k].push(update.$push[k]);
      }
    }
    if (update.$set) {
      for (const k in update.$set) {
        doc[k] = update.$set[k];
      }
    }
    for (const k in update) {
      if (!k.startsWith('$')) {
        doc[k] = update[k];
      }
    }

    return new mockModel(doc);
  };

  mockModel.deleteOne = async (query) => {
    const idx = store.findIndex(item => {
      for (const k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
    if (idx >= 0) {
      store.splice(idx, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  };

  mockModel.countDocuments = async () => {
    return store.length;
  };

  mockModel.insertMany = async (arr) => {
    for (const item of arr) {
      store.push({ _id: Math.random().toString(), ...item });
    }
    return arr;
  };

  modelsStore[name] = mockModel;
  return mockModel;
};

// Now import the rest of the application
require('dotenv').config();
const { connectDatabase } = require('../database/connection');
const { createServer } = require('../server');
const User = mongoose.model('User');
const PendingSync = mongoose.model('PendingSync');
const ShopItem = mongoose.model('ShopItem');
const logger = require('../utils/logger');

const TEST_PORT = 3001;
const TEST_ROBLOX_ID = '1234567890';
const TEST_USERNAME = 'TestRobloxPlayer';
const API_URL = `http://127.0.0.1:${TEST_PORT}`;
const API_KEY = process.env.API_KEY || 'dev_api_key_123456';

// Helper to make fetch requests with API Key
async function apiRequest(endpoint, method = 'GET', body = null, useKey = true) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (useKey) {
    headers['x-api-key'] = API_KEY;
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${endpoint}`, options);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  logger.info('=== STARTING INTEGRATION TESTS (WITH MOCK DB) ===');

  // 1. Setup DB Connection (will hit our mock)
  await connectDatabase();

  // Clear existing mock data
  User.store.length = 0;
  PendingSync.store.length = 0;
  ShopItem.store.length = 0;
  logger.info('Cleared old test data from mock database.');

  // Seed shop items
  logger.info('Seeding test shop items...');
  await ShopItem.insertMany([
    { id: 'sword_01', name: 'Bronze Sword', price: 100, category: 'Weapons' },
    { id: 'wings_neon', name: 'Neon Angel Wings', price: 500, category: 'Accessories' }
  ]);

  // 2. Start Test server
  const server = createServer();
  const httpServer = server.listen(TEST_PORT, () => {
    logger.info(`Test server listening on port ${TEST_PORT}`);
  });

  let testPassed = true;

  try {
    // --- TEST 1: Security validation ---
    logger.info('Test 1: Verify API security...');
    const secRes = await apiRequest('/player/1234', 'GET', null, false);
    if (secRes.status !== 401) {
      logger.error(`❌ Security Test failed! Status: ${secRes.status}`);
      testPassed = false;
    } else {
      logger.info('✅ Security Test passed! (Block unauthorized requests)');
    }

    // --- TEST 2: Generate sync code ---
    logger.info('Test 2: Generate sync code...');
    const syncRes = await apiRequest('/sync', 'POST', {
      robloxId: TEST_ROBLOX_ID,
      username: TEST_USERNAME
    });
    
    if (syncRes.status !== 200 || !syncRes.data.code) {
      logger.error('❌ Sync generation failed!', syncRes);
      testPassed = false;
    } else {
      logger.info(`✅ Sync generation passed! Generated code: ${syncRes.data.code}`);
    }

    // --- TEST 3: Get non-existent player ---
    logger.info('Test 3: Fetch player detail before registration...');
    const playRes404 = await apiRequest(`/player/${TEST_ROBLOX_ID}`);
    if (playRes404.status !== 404) {
      logger.error(`❌ Fetch non-existent player failed! Status: ${playRes404.status}`);
      testPassed = false;
    } else {
      logger.info('✅ Fetch non-existent player passed! (Returns 404)');
    }

    // --- TEST 4: Add points (creates user via upsert) ---
    logger.info('Test 4: Add points to player...');
    const addRes = await apiRequest('/addpoints', 'POST', {
      robloxId: TEST_ROBLOX_ID,
      amount: 250
    });

    if (addRes.status !== 200 || addRes.data.points !== 250) {
      logger.error('❌ Add points failed!', addRes);
      testPassed = false;
    } else {
      logger.info(`✅ Add points passed! New balance: ${addRes.data.points}`);
    }

    // --- TEST 5: Get player details ---
    logger.info('Test 5: Fetch player detail after adding points...');
    const playRes = await apiRequest(`/player/${TEST_ROBLOX_ID}`);
    if (playRes.status !== 200 || playRes.data.player.points !== 250) {
      logger.error('❌ Fetch player details failed!', playRes);
      testPassed = false;
    } else {
      logger.info(`✅ Fetch player details passed! Balance: ${playRes.data.player.points}, Linked: ${playRes.data.player.linked}`);
    }

    // --- TEST 6: Remove points ---
    logger.info('Test 6: Remove points...');
    const remRes = await apiRequest('/removepoints', 'POST', {
      robloxId: TEST_ROBLOX_ID,
      amount: 50
    });

    if (remRes.status !== 200 || remRes.data.points !== 200) {
      logger.error('❌ Remove points failed!', remRes);
      testPassed = false;
    } else {
      logger.info(`✅ Remove points passed! New balance: ${remRes.data.points}`);
    }

    // --- TEST 7: Remove points insufficient balance ---
    logger.info('Test 7: Remove points with insufficient balance...');
    const remResFail = await apiRequest('/removepoints', 'POST', {
      robloxId: TEST_ROBLOX_ID,
      amount: 300
    });

    if (remResFail.status !== 400) {
      logger.error(`❌ Insufficient balance test failed! Status: ${remResFail.status}`);
      testPassed = false;
    } else {
      logger.info(`✅ Insufficient balance test passed! Error msg: ${remResFail.data.error}`);
    }

    // --- TEST 8: Redeem shop item (Bronze Sword, price 100) ---
    logger.info('Test 8: Redeem shop item (Bronze Sword)...');
    const redRes = await apiRequest('/redeem', 'POST', {
      robloxId: TEST_ROBLOX_ID,
      itemId: 'sword_01'
    });

    if (redRes.status !== 200 || redRes.data.points !== 100) {
      logger.error('❌ Redeem item failed!', redRes);
      testPassed = false;
    } else {
      logger.info(`✅ Redeem item passed! New balance: ${redRes.data.points}, Purchased item: ${redRes.data.purchasedItem.name}`);
    }

    // --- TEST 9: Get inventory ---
    logger.info('Test 9: Get player inventory...');
    const invRes = await apiRequest(`/inventory/${TEST_ROBLOX_ID}`);
    if (invRes.status !== 200 || invRes.data.inventory.length !== 1 || invRes.data.inventory[0].id !== 'sword_01') {
      logger.error('❌ Fetch inventory failed!', invRes);
      testPassed = false;
    } else {
      logger.info(`✅ Fetch inventory passed! Inventory item: ${invRes.data.inventory[0].name}`);
    }

    // --- TEST 10: Redeem shop item insufficient points (Neon wings, price 500) ---
    logger.info('Test 10: Redeem expensive shop item with insufficient points...');
    const redResFail = await apiRequest('/redeem', 'POST', {
      robloxId: TEST_ROBLOX_ID,
      itemId: 'wings_neon'
    });

    if (redResFail.status !== 400) {
      logger.error(`❌ Redeem expensive item validation failed! Status: ${redResFail.status}`);
      testPassed = false;
    } else {
      logger.info(`✅ Redeem expensive item validation passed! Error msg: ${redResFail.data.error}`);
    }

    // --- TEST 11: Save title configuration ---
    logger.info('Test 11: Save custom title configuration...');
    const saveTitleRes = await apiRequest(`/player/${TEST_ROBLOX_ID}/title`, 'POST', {
      slot: 13,
      titleText: 'Owner',
      font: 'GothamBold',
      mode: 'Mode1',
      textSize: 24,
      solidColor: { R: 255, G: 0, B: 0 }
    });

    if (saveTitleRes.status !== 200) {
      logger.error(`❌ Save title config failed! Status: ${saveTitleRes.status}`);
      testPassed = false;
    } else {
      logger.info('✅ Save title config passed!');
    }

    // Verify it is fetched with player details
    const playResWithTitles = await apiRequest(`/player/${TEST_ROBLOX_ID}`);
    if (playResWithTitles.status !== 200 || !playResWithTitles.data.player.titles || !playResWithTitles.data.player.titles['13']) {
      logger.error('❌ Fetching player did not return saved titles!', playResWithTitles.data);
      testPassed = false;
    } else {
      logger.info('✅ Fetching player with titles passed!');
    }

    // --- TEST 12: Delete title configuration ---
    logger.info('Test 12: Delete custom title configuration...');
    const deleteTitleRes = await apiRequest(`/player/${TEST_ROBLOX_ID}/title/13`, 'DELETE');
    if (deleteTitleRes.status !== 200) {
      logger.error(`❌ Delete title config failed! Status: ${deleteTitleRes.status}`);
      testPassed = false;
    } else {
      logger.info('✅ Delete title config passed!');
    }

    // Verify it is no longer in user object
    const playResWithoutTitles = await apiRequest(`/player/${TEST_ROBLOX_ID}`);
    if (playResWithoutTitles.status !== 200 || (playResWithoutTitles.data.player.titles && playResWithoutTitles.data.player.titles['13'])) {
      logger.error('❌ Fetching player still returned deleted title!', playResWithoutTitles.data);
      testPassed = false;
    } else {
      logger.info('✅ Verification of deleted title passed!');
    }

  } catch (error) {
    logger.error(`Test execution error: ${error.message}`);
    testPassed = false;
  } finally {
    // 3. Close server and connection
    httpServer.close();
    await mongoose.connection.close();
    logger.info('Server and mock DB connection closed.');
  }

  if (testPassed) {
    logger.info('=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ===');
    process.exit(0);
  } else {
    logger.error('=== SOME INTEGRATION TESTS FAILED. ===');
    process.exit(1);
  }
}

runTests();
