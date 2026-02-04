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

module.exports = router;