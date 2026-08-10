/**
 * Relace krokového řešení jednoho příkladu (UCN-STEP-002).
 * Čistá logika bez DOM - stejný vzor jako js/engine/mission.js.
 *
 * Mise dál pracuje v jednotkách příkladů: chyby z jednotlivých kroků
 * se agregují a mission.recordAnswer() se volá až po dokončení celého
 * příkladu. Jinak by se rozbila adaptivní obtížnost i hvězdy.
 *
 * Dva druhy relace:
 *  - 'equation'  rovnice: hráč volí operaci a pak dopočítá, co zbude
 *  - 'fraction'  sčítání/odčítání zlomků: společný jmenovatel -> čitatelé -> krácení
 * Úlohy s jediným krokem (simplify, expand, equivalent) a tlačítková
 * volba (compare) krokový režim nepoužívají - isActive je false.
 */

import {
  applyOperation,
  checkStep,
  isSolved,
  askedParts,
  partValue,
  partQuestion,
  describeOperation,
  cloneState,
} from '../content/stepCheck.js';
import { formatExpr, isFactored } from '../content/solver.js';
import {
  makeFraction,
  fractionsEqual,
  isSimplified,
  formatNumber,
  lcm,
  gcd,
} from '../content/fractions.js';

/** Kolik chyb u jednoho kroku spustí automatické vysvětlení. */
const MISTAKES_BEFORE_HELP = 2;
/** Kolik kroků bez pokroku za sebou zvýrazní nápovědu. */
const NO_PROGRESS_BEFORE_HINT = 3;

/** Hodnota vstupu hráče jako zlomek, nebo null. */
function valueToFraction(value) {
  if (!value) {
    return null;
  }
  return value.kind === 'int' ? makeFraction(value.value) : makeFraction(value.n, value.d);
}

export function formatEquation(state) {
  return `${formatExpr(state.left)} = ${formatExpr(state.right)}`;
}

/** Stejná velikost, jiné znaménko - typická chyba se záporným číslem. */
function sameMagnitude(a, b) {
  return a.n !== 0 && Math.abs(a.n) * b.d === Math.abs(b.n) * a.d && a.n !== b.n;
}

/**
 * @param {object} exercise příklad z generátoru
 * @returns {object} relace; při isActive === false se příklad řeší zadáním výsledku
 */
export function createStepSession(exercise) {
  if (exercise.equation) {
    return createEquationSession(exercise);
  }
  if (exercise.topic === 'fractions' && (exercise.kind === 'add' || exercise.kind === 'subtract')) {
    return createFractionSession(exercise);
  }
  return { kind: 'none', isActive: false };
}

/* ------------------------------------------------------------------ */
/* Rovnice                                                             */
/* ------------------------------------------------------------------ */

function createEquationSession(exercise) {
  let state = cloneState(exercise.equation);
  const history = [];          // [{ operationText, equationText }]
  const committed = [cloneState(state)];  // stavy pro undo
  let mistakes = 0;
  let mistakesOnStep = 0;
  let noProgressStreak = 0;
  let done = false;
  const errors = {};   // druhy chyb pro rodičovský přehled (UCV-STATS-001)
  const countError = (kind) => {
    errors[kind] = (errors[kind] ?? 0) + 1;
  };

  // Rozpracovaná operace: hráč ji zvolil a teď dopočítává, co zbude.
  let pending = null;          // { operation, next, slots, slotIndex }

  const session = {
    kind: 'equation',
    isActive: true,

    get phase() {
      return done ? 'done' : pending ? 'values' : 'operation';
    },
    get equationText() {
      return formatEquation(state);
    },
    get equationState() {
      return cloneState(state);
    },
    /** Náhled rovnice s otazníky místo hodnot, které má hráč doplnit. */
    get pendingPreview() {
      if (!pending) {
        return null;
      }
      const shown = cloneState(pending.next);
      for (let i = pending.slotIndex; i < pending.slots.length; i++) {
        const [side, part] = pending.slots[i].split('.');
        shown[side][part] = null;
      }
      return {
        left: formatSideWithBlanks(shown.left),
        right: formatSideWithBlanks(shown.right),
      };
    },
    get pendingOperationText() {
      return pending ? describeOperation(pending.operation) : null;
    },
    /** Je na některé straně neroznásobená závorka? UI podle toho nabídne operaci. */
    get hasBracket() {
      return isFactored(state.left) || isFactored(state.right);
    },
    get question() {
      if (!pending || pending.slotIndex >= pending.slots.length) {
        return null;
      }
      const slot = pending.slots[pending.slotIndex];
      // Vždy 'int' s dostupným přepínačem na zlomek - kdybychom režim
      // odvodili z očekávané hodnoty, prozradíme tím tvar odpovědi.
      return {
        prompt: partQuestion(slot),
        mode: 'int',
      };
    },
    get history() {
      return history.map((h) => ({ ...h }));
    },
    get stepIndex() {
      return history.length;
    },
    get mistakes() {
      return mistakes;
    },
    get mistakesOnStep() {
      return mistakesOnStep;
    },
    get shouldOfferHint() {
      return noProgressStreak >= NO_PROGRESS_BEFORE_HINT || mistakesOnStep >= 1;
    },
    get shouldShowHelp() {
      return mistakesOnStep === MISTAKES_BEFORE_HELP;
    },
    get canUndo() {
      return committed.length > 1 && !done;
    },
    get isDone() {
      return done;
    },

    /**
     * Hráč zvolil operaci. Neprovede se hned - nejdřív musí dopočítat,
     * co po ní na stranách zbude.
     * @returns {{status: string, note: string|null}}
     */
    submitOperation(operation) {
      if (done || pending) {
        return { status: 'ignored', note: null };
      }
      const applied = applyOperation(state, operation);
      if (applied.status === 'invalid') {
        return { status: 'invalid', note: applied.note };
      }
      const verdict = checkStep(state, applied.next);
      if (verdict.status !== 'ok') {
        mistakes++;
        mistakesOnStep++;
        // Špatně zvolená úprava je chyba ve strategii, ne v počítání -
        // rodič z toho pozná, že dítě nechápe postup, ne že se přepočítalo.
        countError('strategy');
        if (verdict.status === 'noProgress') {
          noProgressStreak++;
        }
        return { status: verdict.status, note: verdict.note };
      }

      noProgressStreak = 0;
      const slots = askedParts(state, applied.next);
      pending = { operation, next: applied.next, slots, slotIndex: 0 };
      if (slots.length === 0) {
        // Čistě mechanický krok (např. x/3 = 5 -> x = 15 nemá co počítat).
        return commit();
      }
      return { status: 'ok', note: null, needsValues: true };
    },

    /**
     * Hráč doplnil hodnotu pro aktuální slot.
     * @param {{kind: string, value?: number, n?: number, d?: number}} value z inputModel.getValue()
     */
    submitValue(value) {
      if (done || !pending) {
        return { status: 'ignored', note: null };
      }
      const given = valueToFraction(value);
      const slot = pending.slots[pending.slotIndex];
      const expected = partValue(pending.next, slot);

      if (given === null || !fractionsEqual(given, expected)) {
        mistakes++;
        mistakesOnStep++;
        // Operaci zvolil správně, jen dopočítal špatně.
        countError(given !== null && sameMagnitude(given, expected) ? 'sign' : 'arithmetic');
        return { status: 'wrong', note: 'To nesedí - přepočítej to ještě jednou.' };
      }

      pending.slotIndex++;
      if (pending.slotIndex < pending.slots.length) {
        return { status: 'partial', note: null };
      }
      return commit();
    },

    /** Zrušení rozpracované operace - hráč si to rozmyslel. Bez postihu. */
    cancelOperation() {
      if (!done && pending) {
        pending = null;
      }
    },

    /** Krok zpět na předchozí potvrzený stav. Bez postihu. */
    undo() {
      if (!session.canUndo) {
        return;
      }
      pending = null;
      committed.pop();
      history.pop();
      state = cloneState(committed[committed.length - 1]);
      mistakesOnStep = 0;
    },

    getOutcome() {
      return { solved: done, mistakes, errors: { ...errors } };
    },
  };

  function commit() {
    state = pending.next;
    history.push({
      operationText: describeOperation(pending.operation),
      equationText: formatEquation(state),
    });
    committed.push(cloneState(state));
    pending = null;
    mistakesOnStep = 0;
    if (isSolved(state)) {
      done = true;
      return { status: 'solved', note: null };
    }
    return { status: 'committed', note: null };
  }

  return session;
}

/** Formátuje stranu rovnice, kde null znamená dosud nedoplněnou hodnotu. */
function formatSideWithBlanks(side) {
  // Maskovaná strana je vždy už roznásobená: závorka mění jen činitele,
  // a na ten se relace neptá. Proto tu činitele neřešíme.
  if (side.x === null || side.c === null) {
    const xPart = side.x === null ? '?x' : side.x.n === 0 ? '' : formatXTerm(side.x);
    const negative = side.c !== null && side.c.n < 0;
    const cPart =
      side.c === null
        ? '?'
        : side.c.n === 0
          ? ''
          : formatNumber({ n: Math.abs(side.c.n), d: side.c.d });
    if (xPart && cPart) {
      return `${xPart} ${negative ? '-' : '+'} ${cPart}`;
    }
    return xPart || (negative ? `-${cPart}` : cPart) || '0';
  }
  return formatExpr(side);
}

function formatXTerm(x) {
  if (x.n === 1 && x.d === 1) {
    return 'x';
  }
  if (x.n === -1 && x.d === 1) {
    return '-x';
  }
  return x.d === 1 ? `${x.n}x` : `(${formatNumber(x)})x`;
}

/* ------------------------------------------------------------------ */
/* Zlomky: sčítání a odčítání                                          */
/* ------------------------------------------------------------------ */

function createFractionSession(exercise) {
  const [a, b] = exercise.operands;
  const operation = exercise.kind === 'add' ? '+' : '-';

  let common = a.d === b.d ? a.d : null;  // null = hráč ho teprve zvolí
  let numerators = null;                  // [aN, bN] po rozšíření
  let combined = null;                    // čitatel výsledku
  let mistakes = 0;
  let mistakesOnStep = 0;
  let done = false;
  const history = [];
  const errors = {};   // druhy chyb pro rodičovský přehled (UCV-STATS-001)

  /** Fáze: 'denominator' -> 'numerator-a' -> 'numerator-b' -> 'combine' -> 'simplify' */
  let phase = common === null ? 'denominator' : 'combine';

  function recomputeAfterDenominator() {
    numerators = [a.n * (common / a.d), b.n * (common / b.d)];
  }
  if (common !== null) {
    recomputeAfterDenominator();
  }

  const session = {
    kind: 'fraction',
    isActive: true,

    get phase() {
      return done ? 'done' : 'values';
    },
    get fractionPhase() {
      return phase;
    },
    get history() {
      return history.map((h) => ({ ...h }));
    },
    get stepIndex() {
      return history.length;
    },
    get mistakes() {
      return mistakes;
    },
    get mistakesOnStep() {
      return mistakesOnStep;
    },
    get shouldOfferHint() {
      return mistakesOnStep >= 1;
    },
    get shouldShowHelp() {
      return mistakesOnStep === MISTAKES_BEFORE_HELP;
    },
    get canUndo() {
      return false;
    },
    get isDone() {
      return done;
    },
    get equationText() {
      return `${formatNumber(a)} ${operation} ${formatNumber(b)}`;
    },

    /** Zlomky k vykreslení pásy - vždy v tvaru, ve kterém hráč právě je. */
    get bars() {
      if (combined !== null) {
        return [{ n: combined, d: common }];
      }
      if (numerators === null) {
        return [{ ...a }, { ...b }];
      }
      return [
        { n: numerators[0], d: common },
        { n: numerators[1], d: common },
      ];
    },

    get question() {
      switch (phase) {
        case 'denominator':
          return {
            prompt: `Jaký je společný jmenovatel pro ${formatNumber(a)} a ${formatNumber(b)}?`,
            mode: 'int',
          };
        case 'numerator-a':
          return {
            prompt: `Přepiš ${formatNumber(a)} na jmenovatele ${common}. Jaký bude čitatel?`,
            mode: 'int',
          };
        case 'numerator-b':
          return {
            prompt: `Přepiš ${formatNumber(b)} na jmenovatele ${common}. Jaký bude čitatel?`,
            mode: 'int',
          };
        case 'combine':
          return {
            prompt:
              operation === '+'
                ? `Sečti čitatele: ${numerators[0]}/${common} + ${numerators[1]}/${common}. Jaký bude čitatel výsledku?`
                : `Odečti čitatele: ${numerators[0]}/${common} - ${numerators[1]}/${common}. Jaký bude čitatel výsledku?`,
            mode: 'int',
          };
        default:
          return {
            prompt: `Zkrať ${combined}/${common} do základního tvaru.`,
            mode: 'fraction',
          };
      }
    },

    submitValue(value) {
      if (done) {
        return { status: 'ignored', note: null };
      }
      const given = valueToFraction(value);
      if (given === null) {
        return { status: 'wrong', note: 'Napiš odpověď.' };
      }
      // Druh chyby se odvíjí od fáze - právě v tom je pro rodiče hodnota:
      // něco jiného je neumět najít společného jmenovatele a něco jiného
      // splést se ve sčítání čitatelů.
      const wrong = (note, kind) => {
        mistakes++;
        mistakesOnStep++;
        errors[kind] = (errors[kind] ?? 0) + 1;
        return { status: 'wrong', note };
      };

      if (phase === 'denominator') {
        // Uznáváme každý platný společný jmenovatel, nejen nejmenší -
        // jinak by režim byl frustrující (UCV-STEP-002).
        if (given.d !== 1 || given.n <= 0) {
          return wrong('Společný jmenovatel je celé kladné číslo.', 'commonDenominator');
        }
        if (given.n % a.d !== 0 || given.n % b.d !== 0) {
          return wrong(`Tímhle číslem nejde vydělit ${a.d} ani ${b.d}. Zkus jiné.`, 'commonDenominator');
        }
        common = given.n;
        recomputeAfterDenominator();
        const smallest = lcm(a.d, b.d);
        const note = common === smallest ? null : `Správně! Jde to i s menším: ${smallest}.`;
        history.push({ operationText: `Společný jmenovatel ${common}`, equationText: '' });
        phase = 'numerator-a';
        mistakesOnStep = 0;
        return { status: 'partial', note };
      }

      if (phase === 'numerator-a' || phase === 'numerator-b') {
        const index = phase === 'numerator-a' ? 0 : 1;
        const source = index === 0 ? a : b;
        if (given.d !== 1 || given.n !== numerators[index]) {
          return wrong(`Kolikrát se ${source.d} vejde do ${common}? Tím vynásob čitatele.`, 'expand');
        }
        history.push({
          operationText: `${formatNumber(source)} = ${numerators[index]}/${common}`,
          equationText: '',
        });
        phase = index === 0 ? 'numerator-b' : 'combine';
        mistakesOnStep = 0;
        return { status: 'partial', note: null };
      }

      if (phase === 'combine') {
        const expected = operation === '+' ? numerators[0] + numerators[1] : numerators[0] - numerators[1];
        if (given.d !== 1 || given.n !== expected) {
          return wrong('Jmenovatel zůstává stejný, pracuj jen s čitateli.', 'arithmetic');
        }
        combined = expected;
        history.push({ operationText: `${combined}/${common}`, equationText: '' });
        mistakesOnStep = 0;
        if (combined === 0 || gcd(combined, common) === 1) {
          // Nula se nekrátí a základní tvar už máme - hotovo.
          done = true;
          return { status: 'solved', note: null };
        }
        phase = 'simplify';
        return { status: 'partial', note: null };
      }

      // simplify
      const expected = makeFraction(combined, common);
      if (!fractionsEqual(given, expected)) {
        return wrong('To nesedí - zkus najít největšího společného dělitele.', 'arithmetic');
      }
      if (!isSimplified(given)) {
        return wrong('Skoro! Ještě to jde zkrátit.', 'unsimplified');
      }
      history.push({ operationText: `= ${formatNumber(expected)}`, equationText: '' });
      mistakesOnStep = 0;
      done = true;
      return { status: 'solved', note: null };
    },

    cancelOperation() {},
    undo() {},

    getOutcome() {
      return { solved: done, mistakes, errors: { ...errors } };
    },
  };

  return session;
}
