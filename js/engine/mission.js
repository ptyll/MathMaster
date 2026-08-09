/**
 * Logika mise (UCV-MISSION-001, UCV-MISSION-002) - čistá, bez DOM.
 * Řídí posloupnost příkladů, adaptivní obtížnost, počítání chyb
 * a hvězdy. Renderování řeší js/ui/missionScreen.js.
 */

import { generateSimpleEquation, generateLinearEquation } from '../content/equations.js';
import { generateFractionExercise } from '../content/fractionExercises.js';
import { generateFractionEquation } from '../content/fractionEquations.js';
import { nextDifficulty, shouldOfferHint } from '../content/adaptive.js';

/** Druhy zlomkových úloh se v misi střídají, aby to nebyla nuda. */
const FRACTION_KINDS = ['add', 'subtract', 'simplify', 'equivalent', 'compare', 'expand'];

/**
 * Sjednocený generátor: téma + obtížnost (1-4) -> příklad.
 * equations: 1-2 jednoduché, 3-4 s násobením (mapováno na jeho 1-4).
 * fractions: druhy se cyklí podle indexu, obtížnost max 3.
 * fractionEquations: obtížnost max 3.
 */
export function generateForTopic(topic, seed, difficulty, index = 0) {
  if (topic === 'equations') {
    return difficulty <= 2
      ? generateSimpleEquation(seed, difficulty)
      : generateLinearEquation(seed, Math.min(difficulty - 2, 4) || 1);
  }
  if (topic === 'fractions') {
    return generateFractionExercise(seed, FRACTION_KINDS[index % FRACTION_KINDS.length], Math.min(difficulty, 3));
  }
  if (topic === 'fractionEquations') {
    return generateFractionEquation(seed, Math.min(difficulty, 3));
  }
  throw new Error(`Neznámé téma: ${topic}`);
}

/**
 * @param {object} config { id, planetId, crystalColor, topic, exerciseCount, startDifficulty, seed }
 */
export function createMission(config) {
  let index = 0;
  let mistakes = 0;      // špatné odpovědi + přeskočení (pro hvězdy)
  let solvedCount = 0;   // skutečně vyřešené příklady (správná odpověď)
  let firstTryCount = 0;
  let hintsUsed = 0;           // počet příkladů, u kterých hráč použil nápovědu
  let hintUsedOnCurrent = false;
  let history = [];      // pro adaptivitu: { correct, hintUsed }
  let currentDifficulty = config.startDifficulty;
  let attemptsOnCurrent = 0;
  let wrongOnCurrent = 0;
  let current = null;

  function spawn() {
    // Mixované mise (Coruscant) cyklí témata podle indexu příkladu.
    const topic = config.topics ? config.topics[index % config.topics.length] : config.topic;
    current = generateForTopic(topic, config.seed + index * 101, currentDifficulty, index);
    attemptsOnCurrent = 0;
    wrongOnCurrent = 0;
    hintUsedOnCurrent = false;
  }
  spawn();

  const mission = {
    get config() {
      return config;
    },
    get currentExercise() {
      return current;
    },
    get progress() {
      return { current: Math.min(index + 1, config.exerciseCount), total: config.exerciseCount };
    },
    get isDone() {
      return index >= config.exerciseCount;
    },
    /** Po 2. chybě u stejného příkladu nabídnout krokové vysvětlení (jen jednou). */
    get shouldShowSteps() {
      return wrongOnCurrent === 2;
    },
    get shouldOfferHint() {
      return shouldOfferHint(history);
    },
    get attemptsOnCurrent() {
      return attemptsOnCurrent;
    },

    /** Zaznamená použití nápovědy u aktuálního příkladu (UCV-LEARN-002). */
    useHint() {
      if (!hintUsedOnCurrent) {
        hintUsedOnCurrent = true;
        hintsUsed++;
      }
    },

    /**
     * Zapíše výsledek odpovědi.
     * @param {'correct'|'correct-unsimplified'|'wrong'} status z model.evaluate()
     * @returns {{outcome: 'correct'|'wrong', firstTry: boolean, missionDone: boolean, showSteps: boolean}}
     */
    recordAnswer(status) {
      attemptsOnCurrent++;
      if (status === 'wrong') {
        wrongOnCurrent++;
        mistakes++;
        history.push({ correct: false, hintUsed: hintUsedOnCurrent });
        return {
          outcome: 'wrong',
          firstTry: false,
          missionDone: false,
          showSteps: mission.shouldShowSteps,
        };
      }
      const firstTry = attemptsOnCurrent === 1;
      if (firstTry) {
        firstTryCount++;
      }
      solvedCount++;
      history.push({ correct: true, hintUsed: hintUsedOnCurrent });
      return mission._advance({ outcome: 'correct', firstTry, showSteps: false });
    },

    /**
     * Zápis příkladu vyřešeného po krocích (UCN-STEP-002).
     * Chyby z jednotlivých kroků se agregují na JEDEN výsledek za příklad:
     * do hvězd se počítá nejvýš jedna chyba a adaptivita dostane jeden
     * záznam. Bez toho by krokový režim rozbil obojí.
     * @param {{mistakes: number}} outcome souhrn z relace
     */
    recordStepResult({ mistakes: stepMistakes }) {
      attemptsOnCurrent++;
      const firstTry = stepMistakes === 0;
      if (firstTry) {
        firstTryCount++;
      } else {
        mistakes++;
      }
      solvedCount++;
      history.push({ correct: firstTry, hintUsed: hintUsedOnCurrent });
      return mission._advance({ outcome: 'correct', firstTry, showSteps: false });
    },

    /** Přeskočení příkladu - počítá se jako nezodpovězený (chyba pro hvězdy). */
    skip() {
      mistakes++;
      history.push({ correct: false, hintUsed: hintUsedOnCurrent });
      return mission._advance({ outcome: 'skipped', firstTry: false, showSteps: false });
    },

    _advance(result) {
      index++;
      const missionDone = index >= config.exerciseCount;
      if (!missionDone) {
        currentDifficulty = nextDifficulty(history, currentDifficulty);
        spawn();
      }
      return { ...result, missionDone };
    },

    /**
     * Hvězdy: 3 = vše napoprvé bez nápověd, 2 = málo chyb, 1 = dokončeno.
     * Práh pro 2 hvězdy roste s délkou mise - mise mají 4 až 9 příkladů
     * a pevná dvojka by delší mise trestala nesrovnatelně přísněji.
     */
    getStars() {
      if (mistakes === 0 && firstTryCount === config.exerciseCount && hintsUsed === 0) {
        return 3;
      }
      const allowed = Math.max(2, Math.round(config.exerciseCount / 3));
      return mistakes <= allowed ? 2 : 1;
    },

    getSummary() {
      return {
        missionId: config.id,
        planetId: config.planetId,
        crystalColor: config.crystalColor,
        topic: config.topic ?? null,
        topics: config.topics ?? [config.topic],
        stars: mission.getStars(),
        mistakes,
        firstTryCount,
        solved: solvedCount,
        total: config.exerciseCount,
        hintsUsed,
        // Nápověda u všech příkladů -> doporučit lehčí mise (UCV-LEARN-002).
        recommendEasier: hintsUsed >= config.exerciseCount,
      };
    },
  };

  return mission;
}

/**
 * Boss souboj (UCV-BOSS-001): boss má HP, hráč 3 štíty. Správná odpověď
 * = -1 HP bossovi, špatná = -1 štít. Ztráta všech štítů = boss se uzdraví
 * na polovinu HP a souboj pokračuje (žádný game over). Příklady se generují
 * do nekonečna, dokud boss nepadne. Žádné hvězdy - jen výhra.
 */
export function createBossMission(config) {
  const maxHp = 5;
  let hp = maxHp;
  let shields = 3;
  let healedCount = 0;
  let index = 0;
  let mistakes = 0;
  let solvedCount = 0;
  let hintsUsed = 0;
  let hintUsedOnCurrent = false;
  let history = [];
  let currentDifficulty = config.startDifficulty;
  let attemptsOnCurrent = 0;
  let wrongOnCurrent = 0;
  let done = false;
  let firstTryCount = 0;
  let current = null;

  function spawn() {
    const topic = config.topics ? config.topics[index % config.topics.length] : config.topic;
    current = generateForTopic(topic, config.seed + index * 101, currentDifficulty, index);
    attemptsOnCurrent = 0;
    wrongOnCurrent = 0;
    hintUsedOnCurrent = false;
  }
  spawn();

  const boss = {
    get config() {
      return config;
    },
    get isBoss() {
      return true;
    },
    get currentExercise() {
      return current;
    },
    get hp() {
      return hp;
    },
    get maxHp() {
      return maxHp;
    },
    get shields() {
      return shields;
    },
    get isDone() {
      return done;
    },
    get shouldShowSteps() {
      return wrongOnCurrent === 2;
    },
    get shouldOfferHint() {
      return shouldOfferHint(history);
    },

    useHint() {
      if (!hintUsedOnCurrent) {
        hintUsedOnCurrent = true;
        hintsUsed++;
      }
    },

    /**
     * Zápis příkladu vyřešeného po krocích (UCN-STEP-002).
     * Chyby v krocích se agregují: hráč přijde nejvýš o jeden štít za
     * příklad, jinak by ho krokový souboj sundal během jediné rovnice.
     */
    recordStepResult({ mistakes: stepMistakes }) {
      attemptsOnCurrent++;
      let healed = false;
      if (stepMistakes > 0) {
        mistakes++;
        shields--;
        if (shields <= 0) {
          hp = Math.max(hp, Math.ceil(maxHp / 2));
          shields = 3;
          healedCount++;
          healed = true;
        }
      } else {
        firstTryCount++;
      }
      solvedCount++;
      history.push({ correct: stepMistakes === 0, hintUsed: hintUsedOnCurrent });
      hp--;
      index++;
      done = hp <= 0;
      if (!done) {
        currentDifficulty = nextDifficulty(history, currentDifficulty);
        spawn();
      }
      return { outcome: 'correct', missionDone: done, healed, hp, shields };
    },

    recordAnswer(status) {
      attemptsOnCurrent++;
      if (status === 'wrong') {
        wrongOnCurrent++;
        mistakes++;
        history.push({ correct: false, hintUsed: hintUsedOnCurrent });
        shields--;
        let healed = false;
        if (shields <= 0) {
          // Boss se uzdraví na polovinu, štíty se obnoví - žádný game over.
          hp = Math.max(hp, Math.ceil(maxHp / 2));
          shields = 3;
          healedCount++;
          healed = true;
        }
        return {
          outcome: 'wrong',
          missionDone: false,
          showSteps: boss.shouldShowSteps,
          healed,
          hp,
          shields,
        };
      }
      if (attemptsOnCurrent === 1) {
        firstTryCount++;
      }
      solvedCount++;
      history.push({ correct: true, hintUsed: hintUsedOnCurrent });
      hp--;
      index++;
      done = hp <= 0;
      if (!done) {
        currentDifficulty = nextDifficulty(history, currentDifficulty);
        spawn();
      }
      return { outcome: 'correct', missionDone: done, healed: false, hp, shields };
    },

    getSummary() {
      return {
        missionId: config.id,
        planetId: config.planetId,
        crystalColor: config.crystalColor,
        topic: config.topic ?? null,
        topics: config.topics ?? [config.topic],
        boss: true,
        stars: 1, // boss nemá hvězdy - 1 slouží jen jako značka 'dokončeno' pro odemykání
        mistakes,
        firstTryCount,
        solved: solvedCount,
        total: solvedCount + mistakes,
        hintsUsed,
        healedCount,
        recommendEasier: false,
      };
    },
  };

  return boss;
}
