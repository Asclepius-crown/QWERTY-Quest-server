const express = require('express');
const router = express.Router();
const Race = require('../models/Race');
const User = require('../models/User');
const auth = require('../middleware/auth');

// POST /api/races - Save race results
router.post('/', auth, async (req, res) => {
  try {
    const { textId, wpm, accuracy, errors, timeTaken, mode, language, isBlindMode } = req.body;

    // Create race
    const race = new Race({
      participants: [{
        userId: req.user.id,
        wpm,
        accuracy,
        errors,
        timeTaken,
        completedAt: new Date()
      }],
      text: textId,
      type: mode || 'solo',
      endTime: new Date()
    });

    await race.save();

    // Update user stats
    const user = await User.findById(req.user.id);
    const previousBestWPM = user.stats.bestWPM;
    user.stats.bestWPM = Math.max(user.stats.bestWPM, wpm);
    user.stats.racesWon += 1; // For solo, always "won"
    user.stats.xp += Math.floor(wpm / 10); // Simple XP system

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

    res.json({ 
      race, 
      updatedStats: user.stats,
      achievementProgress: user.achievementProgress
    });
  } catch (err) {
    console.error(err);
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

module.exports = router;