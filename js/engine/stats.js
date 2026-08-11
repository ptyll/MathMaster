/**
 * Vyhodnocení statistik pro rodičovský přehled (UCV-STATS-001).
 * Čisté funkce nad herním stavem - testovatelné přes node --test.
 * Data nikdy neopouštějí zařízení, tohle je jen čtení uloženého stavu.
 */

import { describeError } from '../content/errorKinds.js';

/** Pod tímhle počtem příkladů nemá smysl nic vyhodnocovat. */
export const MIN_EXERCISES_FOR_REPORT = 20;

export const TOPIC_LABELS = Object.freeze({
  equations: 'Rovnice',
  fractions: 'Zlomky',
  fractionEquations: 'Rovnice se zlomky',
  wordProblems: 'Slovní úlohy',
});

/**
 * Souhrn pro obrazovku přehledu.
 * @param {object} state herní stav
 */
export function summarizeStats(state) {
  const stats = state.stats;
  const topics = Object.keys(TOPIC_LABELS).map((key) => {
    const topic = stats.perTopic[key] ?? { solved: 0, attempts: 0, errors: {} };
    const attempts = topic.attempts ?? 0;
    const solved = topic.solved ?? 0;
    return {
      key,
      label: TOPIC_LABELS[key],
      solved,
      attempts,
      // Úspěšnost = podíl vyřešených na pokusech. Bez pokusů nehlásíme 0 %,
      // ale null - nula by vypadala jako selhání, ne jako 'nehráno'.
      successRate: attempts > 0 ? solved / attempts : null,
      errors: topic.errors ?? {},
    };
  });

  const errorTotals = new Map();
  for (const topic of topics) {
    for (const [kind, count] of Object.entries(topic.errors)) {
      errorTotals.set(kind, (errorTotals.get(kind) ?? 0) + count);
    }
  }
  const topErrors = [...errorTotals.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => ({ kind, count, ...describeError(kind) }));

  const totalAttempts = stats.totalAttempts ?? 0;
  return {
    hasEnoughData: totalAttempts >= MIN_EXERCISES_FOR_REPORT,
    totalSolved: stats.totalSolved ?? 0,
    totalAttempts,
    missionsCompleted: stats.missionsCompleted ?? 0,
    totalTimeMs: stats.totalTimeMs ?? 0,
    overallSuccessRate: totalAttempts > 0 ? (stats.totalSolved ?? 0) / totalAttempts : null,
    topics,
    topErrors,
    recommendations: buildRecommendations(topics, topErrors),
  };
}

/**
 * Doporučení: nejdřív téma s nejnižší úspěšností, pak nejčastější druh chyby.
 * Držíme to na dvou větách - rodič nemá číst esej.
 */
function buildRecommendations(topics, topErrors) {
  const out = [];
  const played = topics.filter((t) => t.attempts > 0);

  if (played.length > 0) {
    const weakest = played.reduce((a, b) => (a.successRate <= b.successRate ? a : b));
    if (weakest.successRate < 0.7) {
      out.push(
        `Nejvíc zaváhá u tématu ${weakest.label} (úspěšnost ${formatPercent(weakest.successRate)}). Tam se vyplatí přidat.`
      );
    } else {
      out.push(`Všechna procvičovaná témata zvládá nad 70 %. Klidně přitvrďte v obtížnosti.`);
    }
  }

  if (topErrors.length > 0) {
    out.push(`Nejčastější chyba: ${topErrors[0].label.toLowerCase()}. ${topErrors[0].advice}`);
  }

  const untouched = topics.filter((t) => t.attempts === 0);
  if (untouched.length > 0 && played.length > 0) {
    out.push(`Zatím nezkoušel: ${untouched.map((t) => t.label).join(', ')}.`);
  }

  return out;
}

/** '73 %' - pro null vrací pomlčku. */
export function formatPercent(rate) {
  return rate === null || rate === undefined ? '–' : `${Math.round(rate * 100)} %`;
}

/** '1 h 24 min', '12 min', 'méně než minuta'. */
export function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) {
    return 'méně než minuta';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
