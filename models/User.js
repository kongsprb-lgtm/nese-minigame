const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String },
  purchasedAt: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  discordId: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null/undefined values if not linked yet
    index: true
  },
  robloxId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  username: {
    type: String
  },
  points: {
    type: Number,
    default: 0,
    min: 0 // Points cannot be negative
  },
  inventory: [InventoryItemSchema],
  linked: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);
