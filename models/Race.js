const mongoose = require('mongoose');

const RaceSchema = new mongoose.Schema({
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    wpm: Number,
    accuracy: Number,
    errors: Number,
    timeTaken: Number, // seconds
    completedAt: Date,
    replayData: [{
      time: Number, // ms from start
      index: Number, // char index
      keyPressed: String,
      previousKey: String,
      transitionTime: Number,
      isError: Boolean,
      correctionTime: Number,
      errorLocation: Number
    }],
    coachingData: {
      keyTransitionTimes: mongoose.Schema.Types.Mixed, // Object with key pairs as keys
      errorLocations: [Number],
      correctionAttempts: Number
    },
    coachingInsights: {
      weaknesses: [{
        type: String,
        pair: String,
        severity: String,
        avgTime: Number,
        errorCount: Number,
        description: String
      }],
      recommendations: [{
        type: String,
        priority: String,
        title: String,
        description: String,
        practiceType: String,
        targetPair: String
      }],
      insights: {
        avgTransitionTime: Number,
        errorRate: Number,
        slowestPairs: [{
          pair: String,
          avgTime: Number,
          totalOccurrences: Number
        }],
        mostErrorPronePairs: [{
          pair: String,
          errorCount: Number,
          totalOccurrences: Number
        }],
        improvementAreas: [String]
      }
    }
  }],
  text: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Text',
    required: false
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: Date,
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['solo', 'multiplayer', 'ranked'],
    default: 'solo'
  },
  // Ranked match specific fields
  rankedData: {
    eloChanges: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      oldElo: Number,
      newElo: Number,
      change: Number
    }],
    averageElo: Number,
    rankTier: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Race', RaceSchema);