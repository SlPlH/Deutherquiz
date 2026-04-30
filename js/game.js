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
 */
function resolveRound(answers, question) {
  const scores = {};
  const expansions = {}; // playerId -> number of cities to conquer

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

    // Expansion logic based on points
    let exp = 0;
    if (s > 800) exp = 3;
    else if (s >= 500) exp = 2;
    else if (s >= 100) exp = 1;
    
    expansions[ans.playerId] = exp;
  }

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

function buildQuestionPool(questionsData) {
  let all = [];
  for (const cat of questionsData.categories) {
    for (const q of cat.questions) {
      all.push({ ...q, categoryName: cat.name, categoryIcon: cat.icon });
    }
  }
  return shuffle(all);
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
