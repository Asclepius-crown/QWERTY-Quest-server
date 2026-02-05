const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Log = require('../models/Log');
const auth = require('../middleware/auth');
const passport = require('passport');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const nodemailer = require('nodemailer');

const transporter = (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) 
  ? nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })
  : null;

const generateNetId = async () => {
  let id;
  let exists = true;
  while(exists) {
    const num = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    id = `${num.substring(0,3)}-${num.substring(3,6)}`;
    const user = await User.findOne({ netId: id });
    if (!user) exists = false;
  }
  return id;
};

// Register
router.post('/signup', [
  body('username').isLength({ min: 3, max: 30 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const netId = await generateNetId();

    // Create user
    user = new User({
      username,
      email,
      password: hashedPassword,
      netId
    });

    await user.save();

     // Create JWT
     const payload = { user: { id: user.id } };
     jwt.sign(payload, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' }, async (err, token) => {
       if (err) throw err;
        res.cookie('token', token, { 
          httpOnly: true, 
          secure: process.env.NODE_ENV === 'production', 
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        });
       await Log.create({ userId: user.id, action: 'signup', ip: req.ip, userAgent: req.get('User-Agent') });
       res.json({ user: { id: user.id, username: user.username, stats: user.stats, netId: user.netId } });
     });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', [
  body('email').notEmpty().trim(), // identifier
  body('password').notEmpty(),
  body('mfaToken').optional().isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { email, password, mfaToken } = req.body;

    // Check user
    let user = await User.findOne({ email });
    if (!user) {
      // Allow login with username too
      user = await User.findOne({ username: email });
      if (!user) {
        return res.status(400).json({ msg: 'Invalid Credentials' });
      }
    }

    // Check password
    if (!user.password) {
      return res.status(400).json({ msg: 'Please login with your social account' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    // Check MFA if enabled
    if (user.isMfaEnabled) {
      if (!mfaToken) {
        return res.json({ needMfa: true, user: { id: user.id, username: user.username } });
      }
      const mfaVerified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: mfaToken,
        window: 1
      });
      if (!mfaVerified) {
        return res.status(400).json({ msg: 'Invalid MFA token' });
      }
    }

     // Return JWT
     const payload = { user: { id: user.id } };
     jwt.sign(payload, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' }, async (err, token) => {
       if (err) throw err;
        res.cookie('token', token, { 
          httpOnly: true, 
          secure: process.env.NODE_ENV === 'production', 
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        });
       try {
         await Log.create({ userId: user.id, action: 'login', ip: req.ip, userAgent: req.get('User-Agent') });
       } catch (e) {
         console.error('Log error:', e);
       }
       res.json({ user: { id: user.id, username: user.username, stats: user.stats, netId: user.netId } });
     });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
  });
  res.json({ msg: 'Logged out' });
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    console.log('GET /me - Processing for user:', req.user);
    if (!req.user || !req.user.id) {
       console.log('GET /me - User ID missing in request');
       return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
        console.log('GET /me - Invalid ObjectId:', req.user.id);
        return res.status(400).json({ error: 'Invalid User ID' });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      console.log('GET /me - User not found in DB');
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('GET /me - User found, sending response');
    res.json(user);
  } catch (err) {
    console.error('Error in /me:', err);
    res.status(500).send('Server Error');
  }
});

// OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: process.env.CLIENT_URL + '/login' || 'http://localhost:5173/login' }), (req, res) => {
  const payload = { user: { id: req.user.id } };
  jwt.sign(payload, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' }, (err, token) => {
    if (err) throw err;
    res.cookie('token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
    });
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  });
});

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback', passport.authenticate('github', { failureRedirect: process.env.CLIENT_URL + '/login' || 'http://localhost:5173/login' }), (req, res) => {
  const payload = { user: { id: req.user.id } };
  jwt.sign(payload, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' }, (err, token) => {
    if (err) throw err;
    res.cookie('token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
    });
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  });
});

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', passport.authenticate('discord', { failureRedirect: process.env.CLIENT_URL + '/login' || 'http://localhost:5173/login' }), (req, res) => {
  const payload = { user: { id: req.user.id } };
  jwt.sign(payload, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' }, (err, token) => {
    if (err) throw err;
    res.cookie('token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production', 
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
    });
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  });
});

// WebAuthn Routes
router.post('/webauthn/register/start', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const options = generateRegistrationOptions({
      rpName: 'TypeMaster',
      rpID: process.env.RP_ID || 'localhost',
      userID: user._id.toString(),
      userName: user.username,
      userDisplayName: user.displayName || user.username,
      attestationType: 'direct',
      excludeCredentials: user.authenticators.map(auth => ({
        id: auth.credentialId,
        type: 'public-key',
        transports: auth.transports
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      }
    });
    user.challenge = options.challenge;
    await user.save();
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/webauthn/register/finish', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const verification = verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: user.challenge,
      expectedOrigin: process.env.ORIGIN || 'http://localhost:5000',
      expectedRPID: process.env.RP_ID || 'localhost'
    });
    if (verification.verified) {
      user.authenticators.push({
        credentialId: verification.registrationInfo.credentialID,
        publicKey: verification.registrationInfo.credentialPublicKey,
        counter: verification.registrationInfo.counter,
        transports: verification.registrationInfo.transports
      });
      user.challenge = undefined;
      await user.save();
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Verification failed' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/webauthn/authenticate/start', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.authenticators.length === 0) {
      return res.status(400).json({ error: 'No passkeys registered for this user' });
    }
    const options = generateAuthenticationOptions({
      rpID: process.env.RP_ID || 'localhost',
      allowCredentials: user.authenticators.map(auth => ({
        id: auth.credentialId,
        type: 'public-key',
        transports: auth.transports
      })),
      userVerification: 'preferred'
    });
    user.challenge = options.challenge;
    await user.save();
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/webauthn/authenticate/finish', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    const authenticator = user.authenticators.find(auth => auth.credentialId === req.body.id);
    if (!authenticator) {
      return res.status(400).json({ error: 'Authenticator not found' });
    }
    const verification = verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: user.challenge,
      expectedOrigin: process.env.ORIGIN || 'http://localhost:5000',
      expectedRPID: process.env.RP_ID || 'localhost',
      authenticator: {
        credentialID: authenticator.credentialId,
        credentialPublicKey: Buffer.from(authenticator.publicKey, 'base64url'),
        counter: authenticator.counter,
        transports: authenticator.transports
      }
    });
    if (verification.verified) {
      authenticator.counter = verification.authenticationInfo.newCounter;
      user.challenge = undefined;
      await user.save();
      const payload = { user: { id: user.id } };
     jwt.sign(payload, process.env.JWT_SECRET || 'secret123', { expiresIn: '1d' }, async (err, token) => {
       if (err) throw err;
        res.cookie('token', token, { 
          httpOnly: true, 
          secure: process.env.NODE_ENV === 'production', 
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        });
       await Log.create({ userId: user.id, action: 'login', ip: req.ip, userAgent: req.get('User-Agent') });
       res.json({ user: { id: user.id, username: user.username, stats: user.stats } });
     });
    } else {
      res.status(400).json({ error: 'Verification failed' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MFA Routes
router.post('/mfa/setup', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.isMfaEnabled) return res.status(400).json({ error: 'MFA already enabled' });
    const secret = speakeasy.generateSecret({
      name: `TypeMaster (${user.username})`,
      issuer: 'TypeMaster'
    });
    user.mfaSecret = secret.base32;
    await user.save();
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCodeUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/mfa/enable', auth, [
  body('token').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const user = await User.findById(req.user.id);
    const { token } = req.body;
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1
    });
    if (verified) {
      user.isMfaEnabled = true;
      await user.save();
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Invalid token' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/mfa/verify', auth, [
  body('token').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const user = await User.findById(req.user.id);
    const { token } = req.body;
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1
    });
    if (verified) {
      res.json({ verified: true });
    } else {
      res.status(400).json({ error: 'Invalid token' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Magic link login
router.get('/login', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('No token provided');
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(400).send('Invalid or expired token');
    jwt.sign({ user: { id: decoded.userId } }, process.env.JWT_SECRET, { expiresIn: '1d' }, (err, newToken) => {
      if (err) throw err;
      res.cookie('token', newToken, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      });
      res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
    });
  });
});

// Forgot password / magic link
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const magicLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login?token=${token}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'TypeMaster Magic Login Link',
      html: `<p>Click <a href="${magicLink}">here</a> to login to TypeMaster. This link expires in 15 minutes.</p>`
    };
    
    if (!transporter) {
      console.log('Email would be sent to:', email);
      console.log('Magic Link:', magicLink);
      return res.status(503).json({ error: 'Email service not configured. Check server logs for link (Dev Mode).' });
    }

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to send email' });
      }
      res.json({ message: 'Magic link sent to your email' });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
