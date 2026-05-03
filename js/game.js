/**
 * game.js — Core game engine
 * Scoring, round management, conquest logic
 */

const GameConfig = {
  MAX_PLAYERS: 25,
  MIN_PLAYERS: 2,
  ROUND_TRANSITION_MS: 4000,
  SCORE_BASE: 1000,
  SPEED_WEIGHT: 0.4,
  ACCURACY_WEIGHT: 0.6,
  STARTING_CITIES: 5,
  // Speed-based expansion: rank 1 = 3 regions, rank 2 = 2, rest correct = 1
  EXPANSION_BY_RANK: [3, 2, 1],
};

// ===== SCORING =====

function scoreMultipleChoice(correct, elapsed, duration) {
  if (!correct) return 0;
  const speedFactor = Math.max(0.3, 1 - (elapsed / duration) * 0.7);
  return Math.round(GameConfig.SCORE_BASE * speedFactor);
}

function scoreNumeric(given, correct, tolerance, elapsed, duration) {
  const diff = Math.abs(given - correct);
  const effectiveTolerance = tolerance === 0 ? 0 : tolerance;

  let accuracyFactor;
  if (effectiveTolerance === 0) {
    accuracyFactor = diff === 0 ? 1.0 : 0;
  } else {
    const relErr = diff / Math.abs(correct || 1);
    if (relErr === 0)          accuracyFactor = 1.0;
    else if (relErr <= 0.05)   accuracyFactor = 0.90;
    else if (relErr <= 0.10)   accuracyFactor = 0.75;
    else if (relErr <= 0.20)   accuracyFactor = 0.50;
    else if (relErr <= 0.35)   accuracyFactor = 0.25;
    else                        accuracyFactor = 0;
  }

  if (accuracyFactor === 0) return 0;

  const speedFactor = Math.max(0.3, 1 - (elapsed / duration) * 0.7);
  const score = GameConfig.SCORE_BASE
    * (GameConfig.ACCURACY_WEIGHT * accuracyFactor + GameConfig.SPEED_WEIGHT * speedFactor);
  return Math.round(score);
}

/**
 * Calculate scores and determine expansion powers.
 * Expansion is now SPEED-based: fastest correct answer wins most territory.
 * Rank 1 (fastest correct) = 3 regions, Rank 2 = 2, all others correct = 1.
 * Wrong answers = 0 expansion.
 */
function resolveRound(answers, question) {
  const scores = {};
  const expansions = {}; // playerId -> number of cities to conquer

  // Step 1: Calculate scores for all answers
  for (const ans of answers) {
    const elapsed = ans.timestamp - ans.startTime;
    const duration = question.duration * 1000;
    let s = 0;

    if (question.type === 'multiple_choice') {
      const correct = (parseInt(ans.value) === question.answer);
      s = scoreMultipleChoice(correct, elapsed, duration);
    } else {
      const val = parseFloat(ans.value);
      s = isNaN(val) ? 0 : scoreNumeric(val, question.answer, question.tolerance, elapsed, duration);
    }

    scores[ans.playerId] = s;
    expansions[ans.playerId] = 0; // default: no expansion
  }

  // Step 2: Speed-based expansion — only correct answers compete
  const correctAnswers = answers.filter(ans => scores[ans.playerId] > 0);

  // Sort by response time (fastest first)
  correctAnswers.sort((a, b) => {
    const elapsedA = a.timestamp - a.startTime;
    const elapsedB = b.timestamp - b.startTime;
    return elapsedA - elapsedB;
  });

  // Assign expansion by rank
  correctAnswers.forEach((ans, idx) => {
    const rank = idx; // 0-indexed
    if (rank < GameConfig.EXPANSION_BY_RANK.length) {
      expansions[ans.playerId] = GameConfig.EXPANSION_BY_RANK[rank];
    } else {
      expansions[ans.playerId] = 1; // everyone else who answered correctly gets 1
    }
  });

  return { scores, expansions };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestionPool(questionsData, selectedCategoryIds) {
  let all = [];
  for (const cat of questionsData.categories) {
    // Filter by selected categories if provided
    if (selectedCategoryIds && selectedCategoryIds.length > 0) {
      if (!selectedCategoryIds.includes(cat.id)) continue;
    }
    for (const q of cat.questions) {
      all.push({ ...q, categoryName: cat.name, categoryIcon: cat.icon, categoryDescription: cat.description || "" });
    }
  }
  return shuffle(all);
}

function getCategories(questionsData) {
  return questionsData.categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    description: cat.description || "",
    count: cat.questions.length
  }));
}

/**
 * Assign starting regions randomly to players
 */
function assignStartingRegions(playerIds, allRegionIds) {
  const assignments = {};
  playerIds.forEach(p => assignments[p] = []);
  
  const shuffledRegions = shuffle([...allRegionIds]);
  let regionIdx = 0;
  
  for (let i = 0; i < GameConfig.STARTING_CITIES; i++) {
    for (const pid of playerIds) {
      if (regionIdx < shuffledRegions.length) {
        assignments[pid].push(shuffledRegions[regionIdx]);
        regionIdx++;
      }
    }
  }
  return assignments;
}
