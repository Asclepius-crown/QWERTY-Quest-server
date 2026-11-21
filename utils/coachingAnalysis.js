const mongoose = require('mongoose');

const formatPairLabel = (pair) =>
  pair.includes(' ')
    ? pair.split('').map(char => (char === ' ' ? 'Space' : char.toUpperCase())).join(' + ')
    : pair.toUpperCase();

const PRACTICE_WORDS = (
  'the that this these those they them their there then than think thing things time timer tiny tired title today ' +
  'together tonight tomorrow took tool total touch town track trade train travel tree trial trip trouble true trust ' +
  'try turn type with within without will wind window winter wire wise wish word work world would write hand have ' +
  'here help high home house hour how who when what where why which while white whole and land stand understand ' +
  'demand command band brand grand sand end send spend friend blend bend tend trend mind find kind behind remind ' +
  'bind point print spring string bring ring sing wing king morning evening running planning inside item into ' +
  'input start state stay step still stop story study such sure system table take talk task teach team tell test ' +
  'text third about after again all also always another any around because been before being both call came come ' +
  'could day did does down each even every first from get give going good great had has her him his just know ' +
  'like little long look made make many may more most much must name new now number off old one only or other our ' +
  'out over part people place put right said same say see she should show small some something under up use very ' +
  'want water way we well were year you your'
).split(' ');

// Coaching Analysis Engine
class CoachingAnalysis {
  constructor() {
    this.commonKeyPairs = [
      'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
      'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
      'st', 'to', 'nt', 'ng', 'se', 'ha', 'as', 'ou', 'io', 'le',
      've', 'co', 'me', 'de', 'hi', 'ri', 'ro', 'ic', 'ne', 'ea',
      'ra', 'ce', 'li', 'ch', 'll', 'be', 'ma', 'si', 'om', 'ur'
    ];
  }

  // Analyze replay data for patterns and weaknesses
  analyzeReplayData(replayData, coachingData = {}) {
    if (!replayData || !Array.isArray(replayData)) {
      return { weaknesses: [], recommendations: [], insights: {} };
    }

    const analysis = {
      weaknesses: [],
      recommendations: [],
      insights: {
        avgTransitionTime: 0,
        errorRate: 0,
        slowestPairs: [],
        mostErrorPronePairs: [],
        improvementAreas: []
      }
    };

    // Analyze key pair transitions
    const pairStats = this.analyzeKeyPairs(replayData, coachingData.keyTransitionTimes || {});
    analysis.insights.slowestPairs = pairStats.slowestPairs;
    analysis.insights.mostErrorPronePairs = pairStats.mostErrorPronePairs;

    // Calculate overall metrics
    const totalTime = replayData.length > 0 ? replayData[replayData.length - 1].time : 0;
    const totalChars = replayData.filter(entry => !entry.isError).length;
    analysis.insights.avgTransitionTime = totalChars > 0 ? totalTime / totalChars : 0;
    analysis.insights.errorRate = replayData.length > 0 ? (replayData.filter(entry => entry.isError).length / replayData.length) * 100 : 0;

    // Identify weaknesses
    analysis.weaknesses = this.identifyWeaknesses(pairStats, coachingData.errorLocations || []);

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis.weaknesses, analysis.insights);

    return analysis;
  }

  // Analyze key pair performance
  analyzeKeyPairs(replayData, transitionTimes) {
    const pairPerformance = {};

    // Process replay data for pair transitions
    for (let i = 1; i < replayData.length; i++) {
      const current = replayData[i];
      const previous = replayData[i - 1];

      if (!current.isError && !previous.isError) {
        const pairKey = `${previous.keyPressed}${current.keyPressed}`.toLowerCase();

        if (!pairPerformance[pairKey]) {
          pairPerformance[pairKey] = {
            pair: pairKey,
            transitionTimes: [],
            errorCount: 0,
            totalOccurrences: 0,
            avgTime: 0
          };
        }

        pairPerformance[pairKey].transitionTimes.push(current.transitionTime || 0);
        pairPerformance[pairKey].totalOccurrences++;
      }
    }

    // Merge with coaching data transition times
    Object.keys(transitionTimes).forEach(pair => {
      const lowerPair = pair.toLowerCase();
      if (!pairPerformance[lowerPair]) {
        pairPerformance[lowerPair] = {
          pair: lowerPair,
          transitionTimes: [],
          errorCount: 0,
          totalOccurrences: 0,
          avgTime: 0
        };
      }
      pairPerformance[lowerPair].transitionTimes.push(...transitionTimes[pair]);
      pairPerformance[lowerPair].totalOccurrences += transitionTimes[pair].length;
    });

    // Calculate averages and identify problem pairs
    const slowestPairs = [];
    const mostErrorPronePairs = [];

    Object.values(pairPerformance).forEach(pair => {
      if (pair.transitionTimes.length > 0) {
        pair.avgTime = pair.transitionTimes.reduce((a, b) => a + b, 0) / pair.transitionTimes.length;

        // Only consider pairs with multiple occurrences
        if (pair.totalOccurrences >= 3) {
          slowestPairs.push(pair);
          mostErrorPronePairs.push(pair);
        }
      }
    });

    // Sort and limit results
    slowestPairs.sort((a, b) => b.avgTime - a.avgTime);
    mostErrorPronePairs.sort((a, b) => b.errorCount - a.errorCount);

    return {
      slowestPairs: slowestPairs.slice(0, 10),
      mostErrorPronePairs: mostErrorPronePairs.slice(0, 10),
      allPairs: pairPerformance
    };
  }

  // Identify user weaknesses
  identifyWeaknesses(pairStats, errorLocations) {
    const weaknesses = [];

    // Slow transition weaknesses
    pairStats.slowestPairs.slice(0, 5).forEach(pair => {
      if (pair.avgTime > 200) { // More than 200ms average
        weaknesses.push({
          type: 'slow_transition',
          pair: pair.pair,
          severity: pair.avgTime > 300 ? 'high' : 'medium',
          avgTime: pair.avgTime,
          description: `Slow transition on "${formatPairLabel(pair.pair)}" combination`
        });
      }
    });

    // Error-prone combinations
    pairStats.mostErrorPronePairs.slice(0, 5).forEach(pair => {
      if (pair.errorCount > 0) {
        weaknesses.push({
          type: 'error_prone',
          pair: pair.pair,
          severity: pair.errorCount > 2 ? 'high' : 'medium',
          errorCount: pair.errorCount,
          description: `Frequent errors on "${formatPairLabel(pair.pair)}" combination`
        });
      }
    });

    // Common finger transitions (simplified)
    const fingerTransitions = {
      leftToRight: ['qw', 'we', 'er', 'rt', 'as', 'sd', 'df', 'fg', 'zx', 'xc', 'cv'],
      rightToLeft: ['yu', 'ui', 'io', 'op', 'hj', 'jk', 'kl', 'nm', 'nb', 'bv', 'mn']
    };

    Object.keys(fingerTransitions).forEach(direction => {
      const problematicPairs = pairStats.slowestPairs.filter(pair =>
        fingerTransitions[direction].includes(pair.pair)
      );

      if (problematicPairs.length > 2) {
        weaknesses.push({
          type: 'finger_transition',
          direction: direction,
          severity: 'medium',
          pairs: problematicPairs.slice(0, 3),
          description: `Difficulty with ${direction.replace(/([A-Z])/g, ' $1').toLowerCase()} finger movements`
        });
      }
    });

    return weaknesses;
  }

  // Generate practice recommendations
  generateRecommendations(weaknesses, insights) {
    const recommendations = [];

    // General recommendations based on insights
    if (insights.errorRate > 15) {
      recommendations.push({
        type: 'general',
        priority: 'high',
        title: 'Focus on Accuracy',
        description: 'Your error rate is above 15%. Practice accuracy-focused drills.',
        practiceType: 'accuracy_drills'
      });
    }

    if (insights.avgTransitionTime > 150) {
      recommendations.push({
        type: 'general',
        priority: 'high',
        title: 'Improve Speed',
        description: 'Your average key transition time is slow. Focus on smooth, quick movements.',
        practiceType: 'speed_drills'
      });
    }

    // Specific recommendations based on weaknesses
    weaknesses.forEach(weakness => {
      switch (weakness.type) {
        case 'slow_transition':
          recommendations.push({
            type: 'specific',
            priority: weakness.severity === 'high' ? 'high' : 'medium',
            title: `Practice "${formatPairLabel(weakness.pair)}" Transitions`,
            description: `Spend time practicing the "${formatPairLabel(weakness.pair)}" key combination. Average time: ${Math.round(weakness.avgTime)}ms`,
            practiceType: 'pair_drills',
            targetPair: weakness.pair
          });
          break;

        case 'error_prone':
          recommendations.push({
            type: 'specific',
            priority: weakness.severity === 'high' ? 'high' : 'medium',
            title: `Master "${formatPairLabel(weakness.pair)}" Combination`,
            description: `This combination causes ${weakness.errorCount} errors. Practice carefully.`,
            practiceType: 'error_correction',
            targetPair: weakness.pair
          });
          break;

        case 'finger_transition':
          recommendations.push({
            type: 'specific',
            priority: 'medium',
            title: `Improve ${weakness.direction} Movements`,
            description: `Practice smooth finger transitions from ${weakness.direction.replace(/([A-Z])/g, ' $1').toLowerCase()}.`,
            practiceType: 'finger_drills',
            direction: weakness.direction
          });
          break;
      }
    });

    // Always include some general practice
    if (recommendations.length < 3) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        title: 'General Practice',
        description: 'Continue with regular typing practice to maintain skills.',
        practiceType: 'general_practice'
      });
    }

    return recommendations;
  }

  // Generate practice text based on weaknesses
  generatePracticeText(weaknesses = [], length = 200) {
    const targets = (weaknesses || [])
      .map(w => w.targetPair || w.pair)
      .filter(Boolean)
      .map(pair => pair.toLowerCase());

    // Space pairs mean "word starts/ends with this letter"
    const matches = (word) => targets.some(pair => {
      if (pair.startsWith(' ')) return word.startsWith(pair.trim());
      if (pair.endsWith(' ')) return word.endsWith(pair.trim());
      return word.includes(pair);
    });

    let pool = targets.length > 0 ? PRACTICE_WORDS.filter(matches) : [];
    if (pool.length < 10) pool = PRACTICE_WORDS;

    let practiceText = '';
    while (practiceText.length < length) {
      practiceText += (practiceText ? ' ' : '') + pool[Math.floor(Math.random() * pool.length)];
    }

    return practiceText.slice(0, practiceText.lastIndexOf(' ')) || practiceText;
  }

  // Aggregate analysis across multiple races for user profile
  aggregateUserProfile(races) {
    if (!races || races.length === 0) {
      return { profile: {}, trends: [] };
    }

    const profile = {
      avgWpm: 0,
      avgAccuracy: 0,
      commonWeaknesses: {},
      improvementTrends: [],
      skillLevel: 'beginner'
    };

    let totalWpm = 0;
    let totalAccuracy = 0;
    let totalRaces = 0;

    // Collect weaknesses across races
    const allWeaknesses = {};

    races.forEach(race => {
      const participant = race.participants?.find(p => p.replayData);
      if (participant) {
        totalWpm += participant.wpm || 0;
        totalAccuracy += participant.accuracy || 0;
        totalRaces++;

        // Analyze this race if we have coaching data
        if (participant.replayData && participant.coachingData) {
          const analysis = this.analyzeReplayData(participant.replayData, participant.coachingData);

          analysis.weaknesses.forEach(weakness => {
            const key = `${weakness.type}_${weakness.pair || weakness.direction}`;
            if (!allWeaknesses[key]) {
              allWeaknesses[key] = { ...weakness, occurrences: 0 };
            }
            allWeaknesses[key].occurrences++;
          });
        }
      }
    });

    if (totalRaces > 0) {
      profile.avgWpm = Math.round(totalWpm / totalRaces);
      profile.avgAccuracy = Math.round(totalAccuracy / totalRaces);
      profile.skillLevel = this.determineSkillLevel(profile.avgWpm, profile.avgAccuracy);

      // Get most common weaknesses
      profile.commonWeaknesses = Object.values(allWeaknesses)
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 5);
    }

    return { profile, trends: [] }; // Trends would need time-series data
  }

  // Determine skill level based on performance
  determineSkillLevel(avgWpm, avgAccuracy) {
    if (avgWpm >= 80 && avgAccuracy >= 95) return 'expert';
    if (avgWpm >= 60 && avgAccuracy >= 90) return 'advanced';
    if (avgWpm >= 40 && avgAccuracy >= 85) return 'intermediate';
    if (avgWpm >= 25 && avgAccuracy >= 80) return 'beginner';
    return 'novice';
  }
}

module.exports = new CoachingAnalysis();