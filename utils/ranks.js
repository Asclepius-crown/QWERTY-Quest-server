const RANK_THRESHOLDS = [
  { rank: 'Apex', minElo: 2500, color: '#ef4444' },
  { rank: 'Legend', minElo: 2250, color: '#f97316' },
  { rank: 'Master', minElo: 2000, color: '#ec4899' },
  { rank: 'Diamond', minElo: 1750, color: '#a855f7' },
  { rank: 'Platinum', minElo: 1500, color: '#06b6d4' },
  { rank: 'Gold', minElo: 1300, color: '#eab308' },
  { rank: 'Silver', minElo: 1150, color: '#9ca3af' },
  { rank: 'Bronze', minElo: 0, color: '#b45309' }
];

const calculateRank = (elo) => {
  for (const threshold of RANK_THRESHOLDS) {
    if (elo >= threshold.minElo) {
      return threshold.rank;
    }
  }
  return 'Bronze';
};

const getRankInfo = (rankName) => {
  return RANK_THRESHOLDS.find(r => r.rank === rankName) || RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1];
};

const getNextRank = (currentRankName) => {
  const currentIndex = RANK_THRESHOLDS.findIndex(r => r.rank === currentRankName);
  if (currentIndex === -1 || currentIndex === 0) return null;
  return RANK_THRESHOLDS[currentIndex - 1];
};

const getProgressToNextRank = (elo, currentRankName) => {
  const currentRank = getRankInfo(currentRankName);
  const nextRank = getNextRank(currentRankName);

  if (!nextRank) {
    return { progress: 100, nextRank: null, eloNeeded: 0, currentRankMinElo: currentRank.minElo };
  }

  const range = nextRank.minElo - currentRank.minElo;
  const progress = Math.min(100, Math.max(0, Math.round(((elo - currentRank.minElo) / range) * 100)));

  return {
    progress,
    nextRank: nextRank.rank,
    nextRankElo: nextRank.minElo,
    eloNeeded: Math.max(0, nextRank.minElo - elo),
    currentRankMinElo: currentRank.minElo
  };
};

const getAllRanks = () => {
  return [...RANK_THRESHOLDS];
};

const calculateEloChange = (playerElo, opponentElo, result) => {
  const k = playerElo < 1400 ? 40 : playerElo < 1800 ? 32 : playerElo < 2200 ? 24 : 16;

  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actualScore = result;

  return Math.round(k * (actualScore - expectedScore));
};

module.exports = {
  RANK_THRESHOLDS,
  calculateRank,
  getRankInfo,
  getNextRank,
  getProgressToNextRank,
  getAllRanks,
  calculateEloChange
};
