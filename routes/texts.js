const express = require('express');
const router = express.Router();
const Text = require('../models/Text');
const { getRandomCodeSnippet } = require('../utils/github');

const FALLBACK_WORDS = (
  'the and for with that this from they have you our when what about time work people make take into ' +
  'year your good some could them see other than then now look only come its over think also back after ' +
  'use two how first well way even new want because any these give day said each which their still should'
).split(' ');

const buildFallbackText = (length) => {
  let text = '';
  while (text.length < length) {
    text += (text ? ' ' : '') + FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
  }
  return text.slice(0, text.lastIndexOf(' '));
};

// GET /api/texts/random - Get fresh real-world text sized to the race
router.get('/random', async (req, res) => {
  try {
    const { difficulty = 'medium', duration = 60 } = req.query;
    const charsPerSecond = { easy: 3, medium: 4, hard: 5 }[difficulty] || 4;
    const targetLength = Math.min(1200, Math.max(80, Number(duration) * charsPerSecond));

    try {
      const snippet = await getRandomCodeSnippet(targetLength);
      return res.json({ text: { _id: null, ...snippet } });
    } catch (err) {
      // Offline fallback: still new text each race, never a memorized stored passage
      return res.json({ text: { _id: null, content: buildFallbackText(targetLength), language: 'plain', source: 'generated', difficulty } });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/texts/github - Fetch a live code snippet from GitHub
router.get('/github', async (req, res) => {
  try {
    const snippet = await getRandomCodeSnippet();
    
    // Optionally save to DB for future use
    const newText = new Text({
      content: snippet.content,
      category: 'code',
      language: snippet.language,
      source: snippet.source,
      difficulty: snippet.difficulty
    });
    await newText.save();

    res.json({ text: newText });
  } catch (err) {
    console.error('GitHub fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch GitHub snippet', details: err.message });
  }
});

// GET /api/texts - Get all texts (admin)
router.get('/', async (req, res) => {
  try {
    const texts = await Text.find().sort({ createdAt: -1 });
    res.json({ texts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;