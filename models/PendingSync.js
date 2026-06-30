const mongoose = require('mongoose');

const PendingSyncSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    uppercase: true
  },
  robloxId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // 10 minutes TTL index (documents expire after 10 minutes)
  }
});

module.exports = mongoose.model('PendingSync', PendingSyncSchema);
