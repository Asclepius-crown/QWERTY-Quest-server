const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String, // 'login', 'signup', 'logout', 'mfa_enable', etc.
  ip: String,
  userAgent: String,
  success: { type: Boolean, default: true },
  details: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Log', LogSchema);