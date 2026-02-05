const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// GET /api/friends - Get all friends and requests
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('friends.friendId', 'username avatar stats isMfaEnabled status netId') // Minimal fields
      .select('friends');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Format for client
    const friends = user.friends
      .filter(f => f.friendId) // Ensure populated user exists
      .map(f => ({
        id: f.friendId._id,
        username: f.friendId.username,
        netId: f.friendId.netId,
        avatar: f.friendId.avatar,
        rank: f.friendId.stats.rank,
        status: f.status, // pending_sent, pending_received, accepted
        intimacy: f.intimacy,
        since: f.since
      }));

    res.json(friends);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/friends/request - Send Friend Request
router.post('/request', auth, async (req, res) => {
  try {
    const { username } = req.body; // Can be username OR netId
    const senderId = req.user.id;
    
    console.log(`[Friend Request] From: ${senderId}, To: ${username}`);

    // Determine query type
    const isNetId = /^\d{3}-\d{3}$/.test(username);
    const query = isNetId ? { netId: username } : { username };

    // Find Target
    const target = await User.findOne(query);
    if (!target) {
        console.log(`[Friend Request] Target not found: ${username}`);
        return res.status(404).json({ msg: 'User not found' });
    }
    
    console.log(`[Friend Request] Target found: ${target._id} (${target.username})`);

    if (target._id.toString() === senderId) return res.status(400).json({ msg: 'Cannot add yourself' });

    // Check existing connection
    const sender = await User.findById(senderId);
    const existing = sender.friends.find(f => f.friendId.toString() === target._id.toString());
    
    if (existing) {
      if (existing.status === 'accepted') return res.status(400).json({ msg: 'Already friends' });
      if (existing.status === 'pending_sent') return res.status(400).json({ msg: 'Request already sent' });
      if (existing.status === 'pending_received') return res.status(400).json({ msg: 'This user already sent you a request. Accept it!' });
    }

    // Update Sender
    sender.friends.push({ friendId: target._id, status: 'pending_sent' });
    await sender.save();

    // Update Receiver
    target.friends.push({ friendId: senderId, status: 'pending_received' });
    await target.save();

    res.json({ msg: 'Handshake broadcasted' });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/friends/accept - Accept Request
router.post('/accept', auth, async (req, res) => {
  try {
    const { friendId } = req.body; // Target's ID
    const userId = req.user.id;

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!friend) return res.status(404).json({ msg: 'User not found' });

    // Update User
    const userRel = user.friends.find(f => f.friendId.toString() === friendId);
    if (!userRel) return res.status(400).json({ msg: 'No request found' });
    userRel.status = 'accepted';

    // Update Friend
    const friendRel = friend.friends.find(f => f.friendId.toString() === userId);
    if (friendRel) friendRel.status = 'accepted';

    await user.save();
    await friend.save();

    res.json({ msg: 'Link established' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/friends/reject - Reject/Remove
router.post('/reject', auth, async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, { $pull: { friends: { friendId: friendId } } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: { friendId: userId } } });

    res.json({ msg: 'Connection severed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
