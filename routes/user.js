const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer Config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    // Ensure user ID is available (auth middleware should run before this if placed correctly in route)
    const userId = req.user ? req.user.id : 'unknown';
    cb(null, 'avatar-' + userId + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpeg, jpg, png, gif) are allowed!'));
  }
});

const generateNetId = async () => {
  let id;
  let exists = true;
  while(exists) {
    const num = Math.floor(100000 + Math.random() * 900000).toString(); 
    id = `${num.substring(0,3)}-${num.substring(3,6)}`;
    const user = await User.findOne({ netId: id });
    if (!user) exists = false;
  }
  return id;
};

// Get current user info
router.get('/me', auth, async (req, res) => {
  try {
    let user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Lazy migration for Net-ID
    if (!user.netId) {
        user.netId = await generateNetId();
        await user.save();
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Update user avatar
router.put('/avatar', [
  auth,
  body('avatar').isString().isLength({ min: 1, max: 200 }) // Increased max length for URLs
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { avatar } = req.body;
    console.log('Updating avatar for user:', req.user.id, 'to:', avatar);
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar },
      { new: true }
    ).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Upload custom avatar
router.post('/avatar/upload', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Find user to check for existing custom avatar
    const currentUser = await User.findById(req.user.id);
    if (currentUser && currentUser.avatar && currentUser.avatar.startsWith('/uploads/')) {
      const oldAvatarPath = path.join(__dirname, '..', currentUser.avatar); // go up from 'routes' to root
      
      // Check if file exists before trying to delete
      if (fs.existsSync(oldAvatarPath)) {
        try {
           fs.unlinkSync(oldAvatarPath);
           console.log(`Deleted old avatar: ${oldAvatarPath}`);
        } catch(unlinkErr) {
           console.error("Error deleting old avatar:", unlinkErr);
           // Continue even if delete fails
        }
      }
    }
    
    // Construct URL
    // Use environment variable for base URL if available, otherwise relative path
    const avatarUrl = `/uploads/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Unlock achievement
router.post('/achievements', auth, async (req, res) => {
  try {
    const { achievementId } = req.body;
    
    if (!achievementId) {
      return res.status(400).json({ error: 'Achievement ID is required' });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already unlocked
    const alreadyUnlocked = user.achievements.some(a => a.id === achievementId);
    if (alreadyUnlocked) {
      return res.json({ message: 'Achievement already unlocked', user });
    }

    // Add achievement
    user.achievements.push({
      id: achievementId,
      unlockedAt: new Date()
    });

    await user.save();
    
    res.json({ 
      message: 'Achievement unlocked successfully',
      achievement: { id: achievementId, unlockedAt: new Date() },
      totalUnlocked: user.achievements.length
    });
  } catch (err) {
    console.error('Achievement unlock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update achievement progress
router.put('/achievement-progress', auth, async (req, res) => {
  try {
    const updates = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update achievement progress fields
    if (!user.achievementProgress) {
      user.achievementProgress = {};
    }

    Object.keys(updates).forEach(key => {
      if (key === 'languagesList') {
        // Handle languages array specially to avoid duplicates
        const newLangs = updates[key];
        user.achievementProgress.languagesList = [
          ...new Set([...(user.achievementProgress.languagesList || []), ...newLangs])
        ];
        user.achievementProgress.languagesUsed = user.achievementProgress.languagesList.length;
      } else {
        user.achievementProgress[key] = updates[key];
      }
    });

    await user.save();
    
    res.json({ 
      message: 'Progress updated successfully',
      achievementProgress: user.achievementProgress
    });
  } catch (err) {
    console.error('Progress update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's achievement stats
router.get('/achievement-stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('stats achievements achievementProgress');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = {
      bestWPM: user.stats?.bestWPM || 0,
      totalRaces: user.stats?.racesCompleted || 0,
      racesWon: user.stats?.racesWon || 0,
      level: user.stats?.level || 1,
      rank: user.stats?.rank || 'Bronze',
      perfectRaces: user.achievementProgress?.perfectRaces || 0,
      highAccuracyRaces: user.achievementProgress?.highAccuracyRaces || 0,
      zeroErrorRaces: user.achievementProgress?.zeroErrorRaces || 0,
      winStreak: user.achievementProgress?.winStreak || 0,
      dailyStreak: user.achievementProgress?.dailyStreak || 0,
      nightRaces: user.achievementProgress?.nightRaces || 0,
      morningRaces: user.achievementProgress?.morningRaces || 0,
      languagesUsed: user.achievementProgress?.languagesUsed || 0,
      underdogWins: user.achievementProgress?.underdogWins || 0,
      comebackWins: user.achievementProgress?.comebackWins || 0,
      personalBestStreak: user.achievementProgress?.personalBestStreak || 0,
      blindModeHighWPM: user.achievementProgress?.blindModeHighWPM || 0
    };

    res.json({
      stats,
      achievements: user.achievements || [],
      totalUnlocked: user.achievements?.length || 0
    });
  } catch (err) {
    console.error('Achievement stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's ranked stats
router.get('/ranked-stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('stats username');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { RANK_THRESHOLDS } = require('../models/User');
    const currentElo = user.stats?.elo || 1000;
    const currentRank = user.stats?.rank || 'Bronze';
    
    // Find next rank
    const currentRankIndex = RANK_THRESHOLDS.findIndex(r => r.rank === currentRank);
    const nextRank = currentRankIndex > 0 ? RANK_THRESHOLDS[currentRankIndex - 1] : null;
    const currentRankData = RANK_THRESHOLDS[currentRankIndex] || RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1];
    
    // Calculate progress to next rank
    let progressToNext = 100;
    if (nextRank) {
      const range = nextRank.minElo - currentRankData.minElo;
      const progress = currentElo - currentRankData.minElo;
      progressToNext = Math.round((progress / range) * 100);
    }

    const stats = {
      elo: currentElo,
      rank: currentRank,
      highestElo: user.stats?.highestElo || 1000,
      rankedWins: user.stats?.rankedWins || 0,
      rankedLosses: user.stats?.rankedLosses || 0,
      rankedDraws: user.stats?.rankedDraws || 0,
      totalRankedMatches: (user.stats?.rankedWins || 0) + (user.stats?.rankedLosses || 0) + (user.stats?.rankedDraws || 0),
      winRate: (user.stats?.rankedWins || 0) > 0 
        ? Math.round((user.stats?.rankedWins || 0) / ((user.stats?.rankedWins || 0) + (user.stats?.rankedLosses || 0)) * 100)
        : 0,
      nextRank: nextRank?.rank || null,
      nextRankElo: nextRank?.minElo || null,
      progressToNext,
      rankColor: currentRankData?.color || '#b45309'
    };

    res.json(stats);
  } catch (err) {
    console.error('Ranked stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get ranked leaderboard
router.get('/ranked-leaderboard', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const users = await User.find({ 'stats.elo': { $exists: true } })
      .select('username avatar stats.elo stats.rank stats.rankedWins stats.rankedLosses')
      .sort({ 'stats.elo': -1 })
      .limit(parseInt(limit));

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      userId: user._id,
      username: user.username,
      avatar: user.avatar,
      elo: user.stats?.elo || 1000,
      rankTier: user.stats?.rank || 'Bronze',
      wins: user.stats?.rankedWins || 0,
      losses: user.stats?.rankedLosses || 0,
      winRate: (user.stats?.rankedWins || 0) + (user.stats?.rankedLosses || 0) > 0
        ? Math.round((user.stats?.rankedWins || 0) / ((user.stats?.rankedWins || 0) + (user.stats?.rankedLosses || 0)) * 100)
        : 0
    }));

    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;