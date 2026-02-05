const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// GET /api/friends - Get all friends and requests
router.get('/', auth, async (req, res) => {
  try {
    console.log(`[GET /friends] Fetching for user: ${req.user.id}`);
    
    const user = await User.findById(req.user.id)
      .populate('friends.friendId', 'username avatar stats isMfaEnabled status netId') // Minimal fields
      .select('friends');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    console.log(`[GET /friends] Raw friends count: ${user.friends.length}`);
    console.log(`[GET /friends] Raw friends data:`, JSON.stringify(user.friends, null, 2));

    // Format for client
    const friends = user.friends
      .filter(f => f.friendId) // Ensure populated user exists
      .map(f => ({
        id: f.friendId._id,
        username: f.friendId.username,
        netId: f.friendId.netId,
        avatar: f.friendId.avatar,
        rank: f.friendId.stats?.rank || 'Unranked',
        status: f.status, // pending_sent, pending_received, accepted
        intimacy: f.intimacy,
        since: f.since
      }));
    
    const pendingReceived = friends.filter(f => f.status === 'pending_received');
    console.log(`[GET /friends] Pending received: ${pendingReceived.length}`);

    res.json(friends);
  } catch (err) {
    console.error('[GET /friends] Error:', err.message);
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

    const sender = await User.findById(senderId);
    
    // Check if target has blocked sender
    const isBlockedByTarget = target.blockedUsers.find(
      b => b.userId.toString() === senderId
    );
    if (isBlockedByTarget) {
      return res.status(403).json({ msg: 'Cannot send request to this user' });
    }
    
    // Check if sender has blocked target
    const hasBlockedTarget = sender.blockedUsers.find(
      b => b.userId.toString() === target._id.toString()
    );
    if (hasBlockedTarget) {
      return res.status(403).json({ msg: 'You have blocked this user. Unblock to send request.' });
    }

    // Check existing connection
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

// GET /api/friends/blocked - Get blocked users
router.get('/blocked', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('blockedUsers.userId', 'username avatar stats netId')
      .select('blockedUsers');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    const blockedUsers = user.blockedUsers
      .filter(b => b.userId)
      .map(b => ({
        id: b.userId._id,
        username: b.userId.username,
        netId: b.userId.netId,
        avatar: b.userId.avatar,
        reason: b.reason,
        blockedAt: b.blockedAt
      }));

    res.json(blockedUsers);
  } catch (err) {
    console.error('[GET /friends/blocked] Error:', err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/friends/block - Block a user
router.post('/block', auth, async (req, res) => {
  try {
    const { userId: targetUserId, reason = '' } = req.body;
    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ msg: 'Cannot block yourself' });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Check if already blocked
    const alreadyBlocked = currentUser.blockedUsers.find(
      b => b.userId.toString() === targetUserId
    );

    if (alreadyBlocked) {
      return res.status(400).json({ msg: 'User already blocked' });
    }

    // Remove from friends if they are friends
    await User.findByIdAndUpdate(currentUserId, { 
      $pull: { friends: { friendId: targetUserId } },
      $push: { blockedUsers: { userId: targetUserId, reason } }
    });

    await User.findByIdAndUpdate(targetUserId, { 
      $pull: { friends: { friendId: currentUserId } }
    });

    res.json({ msg: 'User blocked successfully' });
  } catch (err) {
    console.error('[POST /friends/block] Error:', err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/friends/unblock - Unblock a user
router.post('/unblock', auth, async (req, res) => {
  try {
    const { userId: targetUserId } = req.body;
    const currentUserId = req.user.id;

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { blockedUsers: { userId: targetUserId } }
    });

    res.json({ msg: 'User unblocked successfully' });
  } catch (err) {
    console.error('[POST /friends/unblock] Error:', err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/friends/report - Report a user
router.post('/report', auth, async (req, res) => {
  try {
    const { userId: reportedUserId, reason, details = '' } = req.body;
    const currentUserId = req.user.id;

    if (reportedUserId === currentUserId) {
      return res.status(400).json({ msg: 'Cannot report yourself' });
    }

    const currentUser = await User.findById(currentUserId);
    const reportedUser = await User.findById(reportedUserId);

    if (!reportedUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (!reason) {
      return res.status(400).json({ msg: 'Reason is required' });
    }

    // Check if already reported
    const alreadyReported = currentUser.reports.find(
      r => r.reportedUserId.toString() === reportedUserId
    );

    if (alreadyReported) {
      return res.status(400).json({ msg: 'You have already reported this user' });
    }

    currentUser.reports.push({
      reportedUserId,
      reason,
      details
    });

    await currentUser.save();

    res.json({ msg: 'Report submitted successfully' });
  } catch (err) {
    console.error('[POST /friends/report] Error:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
