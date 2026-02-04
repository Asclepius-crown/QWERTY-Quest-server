const mongoose = require('mongoose');

const TextSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['general', 'quotes', 'code', 'poetry'],
    default: 'general'
  },
  language: {
    type: String,
    default: 'plain'
  },
  source: {
    type: String
  },
  length: {
    type: Number,
    default: function() { return this.content.length; }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Text', TextSchema);