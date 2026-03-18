const express = require('express');
const router = express.Router();
const Race = require('../models/Race');
const User = require('../models/User');
const auth = require('../middleware/auth');
const coachingAnalysis = require('../utils/coachingAnalysis');
const { calculateEloChange, calculateRank } = require('../utils/ranks');

// POST /api/races - Save race results
router.post('/', auth, async (req, res) => {
  try {
    console.log('POST /races - Processing for user:', req.user?.id);
    if (!req.user || !req.user.id) {
      console.log('POST /races - No user authenticated');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { textId, wpm, accuracy, errors, timeTaken, mode, language, isBlindMode, replayData, coachingData, isSoloRanked } = req.body;

    // Validate required fields
    if (!wpm || !accuracy || timeTaken === undefined) {
      return res.status(400).json({ error: 'Missing required race data' });
    }

    // Analyze coaching data for insights
    const coachingInsights = coachingAnalysis.analyzeReplayData(replayData, coachingData);

    // Create race with coaching data
    const race = new Race({
      participants: [{
        userId: req.user.id,
        wpm,
        accuracy,
        errors,
        timeTaken,
        completedAt: new Date(),
        replayData,
        coachingData,
        coachingInsights
      }],
      text: textId,
      type: mode || 'solo',
      endTime: new Date()
    });

    await race.save();
    console.log('POST /races - Race saved for user:', req.user.id);

    // Update user stats
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('POST /races - User not found:', req.user.id);
      return res.status(404).json({ error: 'User not found' });
    }

    const previousBestWPM = user.stats.bestWPM || 0;
    user.stats.bestWPM = Math.max(user.stats.bestWPM || 0, wpm);
    user.stats.xp += Math.floor(wpm / 10); // Simple XP system

    // Handle solo ranked ELO updates
    let eloChange = 0;
    let isWin = false;
    if (isSoloRanked) {
      // Get current rank and tier averages
      const currentRank = user.stats.rank || 'Bronze';
      const usersInRank = await User.find({ 'stats.rank': currentRank });
      if (usersInRank.length > 0) {
        const userIds = usersInRank.map(u => u._id);
        const recentRaces = await Race.find({
          'participants.userId': { $in: userIds },
          type: { $in: ['solo', 'ranked'] }
        }).sort({ createdAt: -1 }).limit(100);

        let totalWpm = 0, totalAccuracy = 0, count = 0;
        recentRaces.forEach(r => {
          r.participants.forEach(p => {
            if (userIds.some(id => id.equals(p.userId))) {
              totalWpm += p.wpm || 0;
              totalAccuracy += p.accuracy || 0;
              count++;
            }
          });
        });

        const avgWpm = count > 0 ? totalWpm / count : 0;
        const avgAccuracy = count > 0 ? totalAccuracy / count : 0;

        isWin = (wpm >= avgWpm) && (accuracy >= 90);
        const result = isWin ? 1 : 0;

        // Estimate opponent ELO from tier (midpoint of rank range)
        const rankThresholds = [
          { rank: 'Apex', min: 2500, mid: 2750 },
          { rank: 'Legend', min: 2250, mid: 2375 },
          { rank: 'Master', min: 2000, mid: 2125 },
          { rank: 'Diamond', min: 1750, mid: 1875 },
          { rank: 'Platinum', min: 1500, mid: 1625 },
          { rank: 'Gold', min: 1300, mid: 1425 },
          { rank: 'Silver', min: 1150, mid: 1275 },
          { rank: 'Bronze', min: 0, mid: 575 }
        ];
        const tierInfo = rankThresholds.find(t => t.rank === currentRank) || rankThresholds[rankThresholds.length - 1];
        const opponentElo = tierInfo.mid;

        eloChange = calculateEloChange(user.stats.elo || 1000, opponentElo, result);
        user.stats.elo = Math.max(0, (user.stats.elo || 1000) + eloChange);
        user.stats.rank = calculateRank(user.stats.elo);

        // Update ranked stats
        user.stats.rankedWins = (user.stats.rankedWins || 0) + (isWin ? 1 : 0);
        user.stats.rankedLosses = (user.stats.rankedLosses || 0) + (isWin ? 0 : 1);
        user.stats.highestElo = Math.max(user.stats.highestElo || 0, user.stats.elo);
      }
    } else {
      // Regular solo race
      user.stats.racesWon += 1; // For solo, always "won"
    }

    // Update average WPM (using racesCompleted)
    if (user.stats.racesCompleted === undefined) user.stats.racesCompleted = 0;
    const previousTotal = user.stats.racesCompleted;
    user.stats.racesCompleted += 1;
    
    user.stats.avgWPM = Math.round(((user.stats.avgWPM * previousTotal) + wpm) / user.stats.racesCompleted);

    // Initialize achievementProgress if not exists
    if (!user.achievementProgress) {
      user.achievementProgress = {};
    }

    // Update achievement progress
    const currentHour = new Date().getHours();
    
    // Perfect race (100% accuracy)
    if (accuracy === 100) {
      user.achievementProgress.perfectRaces = (user.achievementProgress.perfectRaces || 0) + 1;
    }
    
    // High accuracy race (95%+ accuracy)
    if (accuracy >= 95) {
      user.achievementProgress.highAccuracyRaces = (user.achievementProgress.highAccuracyRaces || 0) + 1;
    }
    
    // Zero errors
    if (errors === 0) {
      user.achievementProgress.zeroErrorRaces = (user.achievementProgress.zeroErrorRaces || 0) + 1;
    }
    
    // Night owl (races between midnight and 4 AM)
    if (currentHour >= 0 && currentHour < 4) {
      user.achievementProgress.nightRaces = (user.achievementProgress.nightRaces || 0) + 1;
    }
    
    // Early bird (races before 8 AM)
    if (currentHour >= 4 && currentHour < 8) {
      user.achievementProgress.morningRaces = (user.achievementProgress.morningRaces || 0) + 1;
    }
    
    // Personal best streak
    if (wpm > previousBestWPM) {
      user.achievementProgress.consecutivePB = (user.achievementProgress.consecutivePB || 0) + 1;
    } else {
      user.achievementProgress.consecutivePB = 0;
    }
    user.achievementProgress.personalBestStreak = Math.max(
      user.achievementProgress.personalBestStreak || 0,
      user.achievementProgress.consecutivePB
    );
    
    // Blind mode high WPM (80+)
    if (isBlindMode && wpm >= 80) {
      user.achievementProgress.blindModeHighWPM = (user.achievementProgress.blindModeHighWPM || 0) + 1;
    }
    
    // Track languages
    if (language) {
      if (!user.achievementProgress.languagesList) {
        user.achievementProgress.languagesList = [];
      }
      if (!user.achievementProgress.languagesList.includes(language)) {
        user.achievementProgress.languagesList.push(language);
      }
      user.achievementProgress.languagesUsed = user.achievementProgress.languagesList.length;
    }

    await user.save();
    console.log('POST /races - User stats updated for:', req.user.id);

    res.json({ 
      race, 
      updatedStats: user.stats,
      achievementProgress: user.achievementProgress,
      coachingInsights,
      ...(isSoloRanked && { eloChanges: [{ userId: user._id, change: eloChange, newElo: user.stats.elo }], isWin })
    });
  } catch (err) {
    console.error('POST /races error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/races/history - Get user's race history
router.get('/history', auth, async (req, res) => {
  try {
    const races = await Race.find({
      'participants.userId': req.user.id
    })
    .populate('text')
    .sort({ createdAt: -1 })
    .limit(10);

    res.json({ races });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/races/leaderboard - Get global leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { language } = req.query;
    
    let pipeline = [
      // Unwind participants to treat each player in a race individually
      { $unwind: '$participants' },
      // Lookup text details early to filter if needed
      {
        $lookup: {
          from: 'texts',
          localField: 'text',
          foreignField: '_id',
          as: 'textDoc'
        }
      },
      { 
        $unwind: {
          path: '$textDoc',
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    // Add language filter if specified
    if (language && language !== 'all') {
      pipeline.push({
        $match: { 'textDoc.language': language }
      });
    }

    // Continue with grouping and projections
    pipeline = pipeline.concat([
      // Sort by WPM descending
      { $sort: { 'participants.wpm': -1 } },
      // Group by user to get their single best record
      {
        $group: {
          _id: '$participants.userId',
          wpm: { $first: '$participants.wpm' },
          accuracy: { $first: '$participants.accuracy' },
          textId: { $first: '$text' },
          language: { $first: '$textDoc.language' },
          date: { $first: '$createdAt' }
        }
      },
      // Lookup user details
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      // Unwind user array
      { $unwind: '$user' },
      // Lookup text details AGAIN (or just use fields from previous group)
      {
        $lookup: {
          from: 'texts',
          localField: 'textId',
          foreignField: '_id',
          as: 'text'
        }
      },
      { 
        $unwind: {
          path: '$text',
          preserveNullAndEmptyArrays: true
        }
      },
      // Project final fields
      {
        $project: {
          _id: 1, // userId
          username: '$user.username',
          avatar: '$user.avatar',
          rank: '$user.stats.rank',
          wpm: 1,
          accuracy: 1,
          textId: 1,
          language: 1,
          textTitle: { $ifNull: ['$text.category', 'Custom Text'] },
          textContent: '$text.content',
          date: 1
        }
      },
      // Sort final list by WPM again
      { $sort: { wpm: -1 } },
      // Limit to top 50
      { $limit: 50 }
    ]);

    const leaderboard = await Race.aggregate(pipeline);
    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/races/leaderboard/tier-averages - Get average stats for a rank tier
router.get('/leaderboard/tier-averages', auth, async (req, res) => {
  try {
    const { rank } = req.query;
    if (!rank) {
      return res.status(400).json({ error: 'Rank parameter required' });
    }

    // Get users in this rank
    const users = await User.find({ 'stats.rank': rank });
    if (users.length === 0) {
      return res.json({ avgWpm: 0, avgAccuracy: 0 });
    }

    const userIds = users.map(u => u._id);

    // Get recent races (last 10 per user) for tier averages
    const recentRaces = await Race.find({
      'participants.userId': { $in: userIds },
      type: { $in: ['solo', 'ranked'] } // Include both solo and ranked races
    })
    .sort({ createdAt: -1 })
    .limit(100); // Get up to 100 recent races

    if (recentRaces.length === 0) {
      return res.json({ avgWpm: 0, avgAccuracy: 0 });
    }

    let totalWpm = 0;
    let totalAccuracy = 0;
    let count = 0;

    // Aggregate stats from participants in this rank
    recentRaces.forEach(race => {
      race.participants.forEach(participant => {
        if (userIds.some(id => id.equals(participant.userId))) {
          totalWpm += participant.wpm || 0;
          totalAccuracy += participant.accuracy || 0;
          count++;
        }
      });
    });

    const avgWpm = count > 0 ? Math.round(totalWpm / count) : 0;
    const avgAccuracy = count > 0 ? Math.round(totalAccuracy / count) : 0;

    res.json({ avgWpm, avgAccuracy });
  } catch (err) {
    console.error('Tier averages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;