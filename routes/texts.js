const express = require('express');
const router = express.Router();
const Text = require('../models/Text');
const { getRandomCodeSnippet } = require('../utils/github');

// GET /api/texts/random - Get random text
router.get('/random', async (req, res) => {
  try {
    const { difficulty = 'medium', category } = req.query;
    let query = { difficulty };
    if (category) query.category = category;

    const texts = await Text.find(query);
    if (texts.length === 0) {
      // Fallback to any text
      const fallbackText = await Text.findOne();
      if (!fallbackText) {
        return res.status(404).json({ error: 'No texts available' });
      }
      return res.json({ text: fallbackText });
    }

    const randomIndex = Math.floor(Math.random() * texts.length);
    res.json({ text: texts[randomIndex] });
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