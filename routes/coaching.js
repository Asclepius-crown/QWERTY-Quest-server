const express = require('express');
const router = express.Router();
const Race = require('../models/Race');
const User = require('../models/User');
const auth = require('../middleware/auth');
const coachingAnalysis = require('../utils/coachingAnalysis');

// GET /api/coaching/profile - Get user's coaching profile
router.get('/profile', auth, async (req, res) => {
  try {
    // Get recent races for analysis
    const recentRaces = await Race.find({
      'participants.userId': req.user.id
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('participants.userId', 'stats');

    const { profile, trends } = coachingAnalysis.aggregateUserProfile(recentRaces);

    res.json({
      profile,
      trends,
      recentRaces: recentRaces.length
    });
  } catch (err) {
    console.error('Coaching profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/coaching/analysis/:raceId - Get detailed analysis for a specific race
router.get('/analysis/:raceId', auth, async (req, res) => {
  try {
    const race = await Race.findById(req.params.raceId);

    if (!race) {
      return res.status(404).json({ error: 'Race not found' });
    }

    // Check if user participated in this race
    const participant = race.participants.find(p => p.userId.toString() === req.user.id);
    if (!participant) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // If we don't have cached insights, analyze now
    let insights = participant.coachingInsights;
    if (!insights || !insights.weaknesses) {
      insights = coachingAnalysis.analyzeReplayData(participant.replayData, participant.coachingData);
    }

    res.json({
      raceId: req.params.raceId,
      insights,
      performance: {
        wpm: participant.wpm,
        accuracy: participant.accuracy,
        errors: participant.errors,
        timeTaken: participant.timeTaken
      }
    });
  } catch (err) {
    console.error('Coaching analysis error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/coaching/generate-practice - Generate personalized practice text
router.post('/generate-practice', auth, async (req, res) => {
  try {
    const { weaknesses, length = 200 } = req.body;

    let practiceText = '';

    if (weaknesses && weaknesses.length > 0) {
      // Generate practice text based on user's weaknesses
      practiceText = coachingAnalysis.generatePracticeText(weaknesses, length);
    } else {
      // Get user's recent weaknesses from their races
      const recentRaces = await Race.find({
        'participants.userId': req.user.id
      })
      .sort({ createdAt: -1 })
      .limit(5);

      const allWeaknesses = [];
      recentRaces.forEach(race => {
        const participant = race.participants.find(p => p.userId.toString() === req.user.id);
        if (participant && participant.coachingInsights && participant.coachingInsights.weaknesses) {
          allWeaknesses.push(...participant.coachingInsights.weaknesses);
        }
      });

      practiceText = coachingAnalysis.generatePracticeText(allWeaknesses, length);
    }

    res.json({
      practiceText,
      length: practiceText.length,
      generated: new Date()
    });
  } catch (err) {
    console.error('Practice generation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/coaching/insights - Get aggregated coaching insights
router.get('/insights', auth, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(period));

    const races = await Race.find({
      'participants.userId': req.user.id,
      createdAt: { $gte: cutoffDate }
    })
    .sort({ createdAt: -1 })
    .limit(50);

    // Aggregate insights across races
    const aggregatedInsights = {
      totalRaces: races.length,
      avgWpm: 0,
      avgAccuracy: 0,
      commonWeaknesses: {},
      skillProgression: [],
      recommendations: []
    };

    let totalWpm = 0;
    let totalAccuracy = 0;

    races.forEach(race => {
      const participant = race.participants.find(p => p.userId.toString() === req.user.id);
      if (participant) {
        totalWpm += participant.wpm || 0;
        totalAccuracy += participant.accuracy || 0;

        // Collect weaknesses
        if (participant.coachingInsights && participant.coachingInsights.weaknesses) {
          participant.coachingInsights.weaknesses.forEach(weakness => {
            const key = `${weakness.type}_${weakness.pair || weakness.direction}`;
            if (!aggregatedInsights.commonWeaknesses[key]) {
              aggregatedInsights.commonWeaknesses[key] = {
                ...weakness,
                occurrences: 0,
                races: []
              };
            }
            aggregatedInsights.commonWeaknesses[key].occurrences++;
            aggregatedInsights.commonWeaknesses[key].races.push({
              raceId: race._id,
              date: race.createdAt,
              wpm: participant.wpm,
              accuracy: participant.accuracy
            });
          });
        }

        // Track progression
        aggregatedInsights.skillProgression.push({
          date: race.createdAt,
          wpm: participant.wpm,
          accuracy: participant.accuracy,
          errors: participant.errors
        });
      }
    });

    if (races.length > 0) {
      aggregatedInsights.avgWpm = Math.round(totalWpm / races.length);
      aggregatedInsights.avgAccuracy = Math.round(totalAccuracy / races.length);

      // Sort weaknesses by frequency
      aggregatedInsights.commonWeaknesses = Object.values(aggregatedInsights.commonWeaknesses)
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 10);

      // Sort progression by date
      aggregatedInsights.skillProgression.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Generate top recommendations
      const topWeaknesses = aggregatedInsights.commonWeaknesses.slice(0, 3);
      aggregatedInsights.recommendations = coachingAnalysis.generateRecommendations(topWeaknesses, {
        avgTransitionTime: aggregatedInsights.skillProgression.reduce((sum, p) => sum + (p.wpm * 5 / 60 * 1000), 0) / aggregatedInsights.skillProgression.length,
        errorRate: (aggregatedInsights.skillProgression.reduce((sum, p) => sum + p.errors, 0) / aggregatedInsights.skillProgression.length) * 10
      });
    }

    res.json(aggregatedInsights);
  } catch (err) {
    console.error('Coaching insights error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;