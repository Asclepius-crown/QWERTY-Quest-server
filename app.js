const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const DiscordStrategy = require('passport-discord-auth').Strategy;
const User = require('./models/User');
const path = require('path');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.CLIENT_URL,
    'https://qwerty-quest-client.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ].filter(Boolean),
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(cookieParser());

// Passport
app.use(passport.initialize());

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

// Passport Strategies
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ providerId: profile.id, provider: 'google' });
      if (!user) {
        const netId = await generateNetId();
        user = new User({
          username: profile.displayName.replace(/\s+/g, '').toLowerCase() || profile.emails[0].value.split('@')[0],
          email: profile.emails[0].value,
          provider: 'google',
          providerId: profile.id,
          displayName: profile.displayName,
          avatar: 'cat',
          netId
        });
        await user.save();
      }
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }));
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/github/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ providerId: profile.id, provider: 'github' });
      if (!user) {
        const netId = await generateNetId();
        user = new User({
          username: profile.username,
          email: profile.emails[0].value,
          provider: 'github',
          providerId: profile.id,
          displayName: profile.displayName,
          avatar: 'cat',
          netId
        });
        await user.save();
      }
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }));
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(new DiscordStrategy({
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackUrl: `${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/discord/callback`,
    scope: ['identify', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ providerId: profile.id, provider: 'discord' });
      if (!user) {
        const netId = await generateNetId();
        user = new User({
          username: profile.username,
          email: profile.email,
          provider: 'discord',
          providerId: profile.id,
          displayName: profile.username,
          avatar: 'cat',
          netId
        });
        await user.save();
      }
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }));
}

// Routes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/texts', require('./routes/texts'));
app.use('/api/races', require('./routes/races'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/stats', require('./routes/stats'));

// 404 handler (API only) - Let Vercel handle static assets or fallback
app.get('/', (req, res) => {
    res.send('TypeMaster API is running');
});

module.exports = app;