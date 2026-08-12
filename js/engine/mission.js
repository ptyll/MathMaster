/**
 * Logika mise (UCV-MISSION-001, UCV-MISSION-002) - čistá, bez DOM.
 * Řídí posloupnost příkladů, adaptivní obtížnost, počítání chyb
 * a hvězdy. Renderování řeší js/ui/missionScreen.js.
 */

import { generateSimpleEquation, generateLinearEquation } from '../content/equations.js';
import { generateFractionExercise } from '../content/fractionExercises.js';
import { generateFractionEquation } from '../content/fractionEquations.js';
import { generateWordProblem } from '../content/wordProblems.js';
import { nextDifficulty, shouldOfferHint } from '../content/adaptive.js';

/**
 * Druhy zlomkových úloh se v misi střídají, aby to nebyla nuda.
 *
 * TICHÁ VAZBA: druh se cyklí TÝMŽ indexem jako téma (viz spawn níž), takže na
 * víctematické planetě padnou jen druhy ze zbytkové třídy toho tématu a zbytek
 * je tam NEDOSAŽITELNÝ NAVŽDY. Naměřeno simulací skutečné mise (bezchybná hra):
 * Mustafar 1-3 jen subtract, Bespin 1-3 subtract+equivalent, Kamino 1-3
 * add+simplify, Coruscant subtract+equivalent resp. subtract+compare,
 * jednotematický Dagobah pět ze šesti. Kdo změní exerciseCount nebo počet témat
 * planety, mění tím MNOŽINU druhů, které tam dítě kdy uvidí - proti tomu drží
 * tabulka v testu „UCN-CLEAN-001: množiny zlomkových druhů na misích drží".
 *
 * `expand` (index 5) je v CELÉ HŘE mimo dosah dítěte, které nechybuje, a je to
 * STRUKTURÁLNÍ, ne důsledek zbytkových tříd: žádná mise nemá exerciseCount větší
 * než 5 (max ze 42 misí) a boss končí po pěti správných odpovědích, takže index
 * 5 nepadne NIKDE. Potká ho jen dítě, kterému se v boss souboji nedaří - boss
 * nemá exerciseCount a index roste jen za správné odpovědi, takže souboj se po
 * chybách protahuje. Bezchybná hra ukáže pět ze šesti druhů.
 * POZOR na zdánlivě levnou opravu: přeskládat pořadí v tomhle poli problém jen
 * PŘESUNE na ten druh, který skončí na indexu 5. Dosažitelnost drží délka misí,
 * ne pořadí druhů.
 *
 * ROZHODNUTÍ UCN-CLEAN-001: NECHÁVÁME to tak. Změřeny byly DVĚ varianty opravy,
 * obě na sondě mimo strom:
 *  - vlastní počítadlo pro fractions (od nuly v každé misi): přerovná 15 z 19
 *    misí, a nekoupí NIC - pestrost se zvedne na 0 planetách, na Coruscantu
 *    KLESNE ze 3 druhů na 2. Uvnitř jedné mise je totiž vázaným zdrojem POČET
 *    zlomkových příkladů (Mustafar 1, ostatní víctematické 2), ne způsob indexace.
 *  - počítadlo + posun podle mise: tohle by fungovalo - 4 planety pestřejší,
 *    žádná horší, a bezchybné dítě by poprvé vidělo všech šest druhů (dnes pět).
 *    Cena je 16 z 19 misí s jinou množinou druhů, tedy rozejité seedy.
 * Nebrání tomu ta cena, ale to, že u druhé varianty rozhoduje o tom, KTERÝ druh
 * dítě na které misi potká, hash id mise - `expand` by padl na Coruscant 1
 * (obtížnost 2) a `equivalent` na Mustafar 3. To je rozhodnutí o skladbě učiva,
 * ne o indexaci, a patří tomu, kdo navrhuje matematickou posloupnost. Dnešní
 * přiřazení je stejně nahodilé (zbytková třída), ale je odzkoušené a popsané.
 * Čistá oprava proto vede přes skladbu misí - výslovný seznam druhů u mise nebo
 * víc zlomkových příkladů - ne přes tenhle výraz.
 */
const FRACTION_KINDS = ['add', 'subtract', 'simplify', 'equivalent', 'compare', 'expand'];

/**
 * Strop obtížnosti podle tématu - nad ním už žádný generátor nic nového nemá.
 * Endgame Mustafar startuje na 7 (UCV-MAP-002): to není nová úroveň příkladů,
 * ale pokyn "každé téma na svém maximu". Kdo strop posune, musí zároveň
 * dodat generátoru novou formu, jinak je vyšší číslo jen kosmetika.
 */
const TOPIC_MAX_DIFFICULTY = Object.freeze({
  equations: 6,
  fractions: 6,
  fractionEquations: 6,
  wordProblems: 6,
});

/**
 * Sjednocený generátor: téma + obtížnost -> příklad.
 * equations: 1-2 jednoduché, 3-6 s násobením (mapováno na jeho 1-4,
 *   tedy až po závorky a x na obou stranách).
 * fractions: druhy se cyklí podle indexu, obtížnost 1-6 (4: celé číslo se
 *   zlomkem, 5: nepravý operand, 6: nepravý operand a nutné krácení).
 * fractionEquations: obtížnost 1-6 (4: dva x-členy, 5: x na obou stranách,
 *   6: obě strany i konstanty zlomkové).
 * wordProblems: 2-6 (generátor si spodní kraj hlídá i sám).
 * Obtížnost mimo rozsah se ořízne na strop tématu - mise ani adaptivita
 * pak nemusí vědět, kde má které téma konec.
 */
export function generateForTopic(topic, seed, difficulty, index = 0) {
  const d = clampDifficulty(topic, difficulty);
  if (topic === 'equations') {
    return d <= 2 ? generateSimpleEquation(seed, d) : generateLinearEquation(seed, d - 2);
  }
  if (topic === 'fractions') {
    return generateFractionExercise(seed, FRACTION_KINDS[index % FRACTION_KINDS.length], d);
  }
  if (topic === 'fractionEquations') {
    return generateFractionEquation(seed, d);
  }
  if (topic === 'wordProblems') {
    return generateWordProblem(seed, d);
  }
  throw new Error(`Neznámé téma: ${topic}`);
}

/**
 * Ořízne obtížnost do rozsahu, který téma umí. Nečíselnou hodnotu (rozbitý
 * uložený stav, mise bez startDifficulty) srazí na nejlehčí úroveň - NaN by
 * se jinak propsalo až do vygenerovaného příkladu a rozbilo mu zadání.
 */
function clampDifficulty(topic, difficulty) {
  const max = TOPIC_MAX_DIFFICULTY[topic] ?? 6;
  const value = Math.trunc(Number(difficulty));
  return Number.isNaN(value) ? 1 : Math.min(Math.max(value, 1), max);
}

/**
 * @param {object} config { id, planetId, crystalColor, topic, exerciseCount, startDifficulty, seed }
 */
export function createMission(config) {
  const now = config.clock ?? (() => Date.now());
  const startedAt = now();
  const errors = {};     // { druhChyby: počet } pro rodičovský přehled
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
    // Mixované mise (Coruscant) cyklí témata podle indexu příkladu. TÝŽ `index`
    // jde i do generateForTopic jako pořadí druhu zlomkové úlohy - to je ta tichá
    // vazba popsaná u FRACTION_KINDS výš (rozhodnutí UCN-CLEAN-001: ponecháno).
    // POZOR: tyhle dva řádky jsou v souboru DVAKRÁT, druhá kopie je ve
    // createBossMission. Kdo sáhne jen na jednu, rozejde běžnou misi s bossem TIŠE.
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
    /**
     * @param {'correct'|'correct-unsimplified'|'wrong'} status
     * @param {string|null} [errorKind] druh chyby pro rodičovský přehled
     */
    recordAnswer(status, errorKind = null) {
      attemptsOnCurrent++;
      if (status === 'wrong') {
        wrongOnCurrent++;
        mistakes++;
        countError(errorKind ?? 'arithmetic');
        history.push({ correct: false, hintUsed: hintUsedOnCurrent });
        return {
          outcome: 'wrong',
          firstTry: false,
          missionDone: false,
          showSteps: mission.shouldShowSteps,
        };
      }
      if (errorKind) {
        // Např. nezkrácený zlomek: odpověď se uznává, ale rodiče to zajímá.
        countError(errorKind);
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
    recordStepResult({ mistakes: stepMistakes, errors: stepErrors }) {
      attemptsOnCurrent++;
      const firstTry = stepMistakes === 0;
      if (firstTry) {
        firstTryCount++;
      } else {
        mistakes++;
      }
      // Druhy chyb se sčítají všechny - agregace na jednu chybu platí
      // pro hvězdy, ne pro rodičovský přehled, kde jde právě o to, ČEHO
      // se dítě dopouští.
      for (const [kind, count] of Object.entries(stepErrors ?? {})) {
        countError(kind, count);
      }
      solvedCount++;
      history.push({ correct: firstTry, hintUsed: hintUsedOnCurrent });
      return mission._advance({ outcome: 'correct', firstTry, showSteps: false });
    },

    /** Přeskočení příkladu - počítá se jako nezodpovězený (chyba pro hvězdy). */
    skip() {
      mistakes++;
      countError('skipped');
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
        errors: { ...errors },
        durationMs: Math.max(0, now() - startedAt),
        // Nápověda u všech příkladů -> doporučit lehčí mise (UCV-LEARN-002).
        recommendEasier: hintsUsed >= config.exerciseCount,
      };
    },
  };

  function countError(kind, count = 1) {
    if (!kind) {
      return;
    }
    errors[kind] = (errors[kind] ?? 0) + count;
  }

  return mission;
}

/**
 * Boss souboj (UCV-BOSS-001): boss má HP, hráč 3 štíty. Správná odpověď
 * = -1 HP bossovi, špatná = -1 štít. Ztráta všech štítů = boss se uzdraví
 * na polovinu HP a souboj pokračuje (žádný game over). Příklady se generují
 * do nekonečna, dokud boss nepadne. Žádné hvězdy - jen výhra.
 */
export function createBossMission(config) {
  const now = config.clock ?? (() => Date.now());
  const startedAt = now();
  const errors = {};
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
    // DRUHÁ KOPIE pravidla z createMission, znak po znaku tatáž: `index` cyklí
    // téma A ZÁROVEŇ druh zlomkové úlohy (tichá vazba popsaná u FRACTION_KINDS,
    // rozhodnutí UCN-CLEAN-001: ponecháno). Boss navíc nemá exerciseCount a index
    // roste jen za správné odpovědi, takže souboj se po chybách protahuje - proto
    // je `expand` (index 5) dostupný jen tady, a jen dítěti, kterému se nedaří.
    // Kdo mění tohle, musí změnit i createMission, jinak se obojí rozejde TIŠE.
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
    recordStepResult({ mistakes: stepMistakes, errors: stepErrors }) {
      attemptsOnCurrent++;
      for (const [kind, count] of Object.entries(stepErrors ?? {})) {
        countError(kind, count);
      }
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

    recordAnswer(status, errorKind = null) {
      attemptsOnCurrent++;
      if (status === 'wrong') {
        wrongOnCurrent++;
        mistakes++;
        countError(errorKind ?? 'arithmetic');
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
      if (errorKind) {
        countError(errorKind);
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
        errors: { ...errors },
        durationMs: Math.max(0, now() - startedAt),
        recommendEasier: false,
      };
    },
  };

  function countError(kind, count = 1) {
    if (!kind) {
      return;
    }
    errors[kind] = (errors[kind] ?? 0) + count;
  }

  return boss;
}
