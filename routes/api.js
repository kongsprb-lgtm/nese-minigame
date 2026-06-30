const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');
const authMiddleware = require('../middlewares/auth');

// Apply API Key security to all endpoints in this router
router.use(authMiddleware);

// Endpoint routes
router.post('/sync', playerController.generateSync);
router.get('/player/:robloxId', playerController.getPlayer);
router.post('/redeem', playerController.redeemItem);
router.get('/inventory/:robloxId', playerController.getInventory);
router.post('/addpoints', playerController.addPoints);
router.post('/removepoints', playerController.removePoints);

module.exports = router;
