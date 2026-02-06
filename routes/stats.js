const express = require('express');
const router = express.Router();
const Race = require('../models/Race');
const User = require('../models/User');

// Simple in-memory tracking for matchmaking times
let matchmakingTimes = [];
let lastMatchmakingAvg = 0.02; // Default fallback

// Track a new matchmaking time (in seconds)
const trackMatchmakingTime = (timeInSeconds) => {
  matchmakingTimes.push(timeInSeconds);
  // Keep only last 100 entries for rolling average
  if (matchmakingTimes.length > 100) {
    matchmakingTimes.shift();
  }
  // Recalculate average
  const avg = matchmakingTimes.reduce((a, b) => a + b, 0) / matchmakingTimes.length;
  lastMatchmakingAvg = Math.max(0.02, avg); // Minimum 0.02s
};

// GET /api/stats - Get all landing page statistics
router.get('/', async (req, res) => {
  try {
    // Get online users count from app.locals (set in server.js)
    const connectedUsers = req.app.locals.connectedUsers || new Map();
    const onlinePlayers = connectedUsers.size;

    // Get total races count
    const totalRaces = await Race.countDocuments();

    // Get unique countries (based on email domains as proxy since we don't track actual countries)
    // This is a creative solution - we count unique email domain TLDs
    const users = await User.find({}, 'email');
    const tlds = new Set();
    users.forEach(user => {
      if (user.email) {
        const domain = user.email.split('@')[1];
        if (domain) {
          const tld = domain.split('.').pop();
          if (tld) tlds.add(tld.toLowerCase());
        }
      }
    });
    const countriesCount = Math.max(tlds.size, 1); // At least 1

    // Calculate average matchmaking time
    let matchmakingTime = lastMatchmakingAvg;
    if (matchmakingTimes.length > 0) {
      matchmakingTime = matchmakingTimes.reduce((a, b) => a + b, 0) / matchmakingTimes.length;
    }

    res.json({
      onlinePlayers,
      totalRaces,
      countries: countriesCount,
      matchmakingTime: Math.round(matchmakingTime * 100) / 100 // Round to 2 decimals
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      onlinePlayers: 0,
      totalRaces: 0,
      countries: 0,
      matchmakingTime: 0.02
    });
  }
});

// Export both the router and the tracking function
module.exports = router;
module.exports.trackMatchmakingTime = trackMatchmakingTime;
