const mongoose = require('mongoose');

// Rank thresholds based on ELO
const RANK_THRESHOLDS = [
  { rank: 'Apex', minElo: 2000, color: '#ef4444' },
  { rank: 'Diamond', minElo: 1750, color: '#a855f7' },
  { rank: 'Platinum', minElo: 1500, color: '#06b6d4' },
  { rank: 'Gold', minElo: 1300, color: '#eab308' },
  { rank: 'Silver', minElo: 1150, color: '#9ca3af' },
  { rank: 'Bronze', minElo: 0, color: '#b45309' }
];

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
    default: 'cat'
  },
  stats: {
    racesCompleted: { type: Number, default: 0 },
    racesWon: { type: Number, default: 0 },
    bestWPM: { type: Number, default: 0 },
    avgWPM: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    rank: { type: String, default: 'Bronze' },
    level: { type: Number, default: 1 },
    elo: { type: Number, default: 1000 },
    rankedWins: { type: Number, default: 0 },
    rankedLosses: { type: Number, default: 0 },
    rankedDraws: { type: Number, default: 0 },
    highestElo: { type: Number, default: 1000 }
  },
  achievements: [
    {
      id: { type: String, required: true },
      unlockedAt: { type: Date, default: Date.now }
    }
  ],
  achievementProgress: {
    perfectRaces: { type: Number, default: 0 },
    highAccuracyRaces: { type: Number, default: 0 },
    zeroErrorRaces: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    dailyStreak: { type: Number, default: 0 },
    nightRaces: { type: Number, default: 0 },
    morningRaces: { type: Number, default: 0 },
    languagesUsed: { type: Number, default: 0 },
    languagesList: [{ type: String }],
    underdogWins: { type: Number, default: 0 },
    comebackWins: { type: Number, default: 0 },
    personalBestStreak: { type: Number, default: 0 },
    blindModeHighWPM: { type: Number, default: 0 },
    lastRaceDate: { type: Date },
    consecutivePB: { type: Number, default: 0 }
  },
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

// Method to calculate rank based on ELO
UserSchema.methods.calculateRank = function() {
  const elo = this.stats.elo || 1000;
  for (const threshold of RANK_THRESHOLDS) {
    if (elo >= threshold.minElo) {
      return threshold.rank;
    }
  }
  return 'Bronze';
};

// Pre-save hook to update rank based on ELO
UserSchema.pre('save', function(next) {
  if (this.isModified('stats.elo')) {
    const newRank = this.calculateRank();
    const oldRank = this.stats.rank;
    this.stats.rank = newRank;
    
    // Track highest ELO
    if (this.stats.elo > (this.stats.highestElo || 1000)) {
      this.stats.highestElo = this.stats.elo;
    }
    
    // You could emit an event here for rank promotion
    if (newRank !== oldRank && this._rankChanged) {
      this._rankChanged({ oldRank, newRank, userId: this._id });
    }
  }
  next();
});

// Static method to calculate ELO change
UserSchema.statics.calculateEloChange = function(playerElo, opponentElo, result) {
  // ELO K-factor (higher for lower-rated players)
  const k = playerElo < 1400 ? 40 : playerElo < 1800 ? 32 : 24;
  
  // Expected score
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  
  // Actual score (1 = win, 0.5 = draw, 0 = loss)
  const actualScore = result;
  
  // ELO change
  return Math.round(k * (actualScore - expectedScore));
};

module.exports = mongoose.model('User', UserSchema);
module.exports.RANK_THRESHOLDS = RANK_THRESHOLDS;
