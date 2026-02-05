const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  netId: {
    type: String,
    unique: true,
    sparse: true // Allows null/undefined values to exist without violating uniqueness
  },
  password: {
    type: String,
    required: false,
    minlength: 6
  },
  provider: {
    type: String,
    enum: ['google', 'github', 'discord']
  },
  providerId: {
    type: String
  },
  displayName: {
    type: String
  },
  authenticators: [{
    credentialId: { type: String, required: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, default: 0 },
    transports: [String]
  }],
  challenge: String,
  mfaSecret: String,
  isMfaEnabled: { type: Boolean, default: false },
  avatar: {
    type: String,
    default: 'avatar1'
  },
  stats: {
    racesCompleted: { type: Number, default: 0 },
    racesWon: { type: Number, default: 0 },
    bestWPM: { type: Number, default: 0 },
    avgWPM: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    rank: { type: String, default: 'Bronze' },
    level: { type: Number, default: 1 }
  },
  achievements: [
    {
      id: { type: String, required: true },
      unlockedAt: { type: Date, default: Date.now }
    }
  ],
  friends: [{
    friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending_sent', 'pending_received', 'accepted'], default: 'pending_sent' },
    intimacy: { type: Number, default: 0 },
    since: { type: Date, default: Date.now }
  }],
  blockedUsers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, default: '' },
    blockedAt: { type: Date, default: Date.now }
  }],
  reports: [{
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true },
    details: { type: String, default: '' },
    reportedAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);
