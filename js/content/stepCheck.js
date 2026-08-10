/**
 * Validace kroku úpravy rovnice (UCN-STEP-001).
 * Čisté funkce bez DOM - testovatelné přes node --test.
 *
 * Stav rovnice je { left, right }, kde každá strana je výraz
 * { x: {n,d}, c: {n,d} } ze solveru (koeficient u x + konstanta).
 *
 * Klíčové pravidlo: pořadí kroků NENÍ vynucené. 3x + 4 = 19 jde
 * legitimně řešit i dělením třemi jako první. Krok se posuzuje
 * podle toho, jestli rovnici přiblížil tvaru x = číslo, ne podle
 * toho, jestli se shoduje s krokem solveru.
 */

import {
  addFractions,
  subtractFractions,
  multiplyFractions,
  divideFractions,
  formatNumber,
} from './fractions.js';
import {
  cloneExpr,
  solvedValue,
  factorOf,
  isFactored,
  effectiveX,
  effectiveC,
  expandExpr,
} from './solver.js';

/**
 * Operace, které hráč může zvolit. Násobit/dělit lze jen číslem, ne x-členem.
 * 'expand' roznásobí závorku a operand nemá.
 */
export const OPERATION_KINDS = Object.freeze(['add', 'sub', 'mul', 'div', 'expand']);

const fractionsIdentical = (a, b) => a.n === b.n && a.d === b.d;

/** Je výraz tvaru samotné 'x' (koeficient 1, konstanta 0, bez závorky)? */
const isBareX = (e) => !isFactored(e) && e.x.n === 1 && e.x.d === 1 && e.c.n === 0;

/** Jednotková hodnota (koeficient 1) - cíl úprav u x-členu. */
const isUnit = (f) => f.n === 1 && f.d === 1;

/**
 * Aplikuje operaci na OBĚ strany rovnice - jednostranná úprava neexistuje,
 * v tom je celý didaktický smysl (UCV-STEP-001).
 *
 * @param {{left: object, right: object}} state
 * @param {{kind: string, operand: {n,d}, term?: 'const'|'x'}} operation
 * @returns {{status: 'ok'|'invalid', next: object|null, note: string|null}}
 */
export function applyOperation(state, operation) {
  const { kind, operand } = operation;
  const term = operation.term ?? 'const';

  if (!OPERATION_KINDS.includes(kind)) {
    throw new Error(`Neznámá operace: ${kind}`);
  }

  if (kind === 'expand') {
    if (!isFactored(state.left) && !isFactored(state.right)) {
      return { status: 'invalid', next: null, note: 'Tady žádná závorka k roznásobení není.' };
    }
    return {
      status: 'ok',
      next: { left: expandExpr(state.left), right: expandExpr(state.right) },
      note: null,
    };
  }

  // Přičítat a odečítat přes neroznásobenou závorku nejde - k(x+b) + n
  // už není součin a hráč by dostal tvar, který neumíme zobrazit.
  if (
    (kind === 'add' || kind === 'sub') &&
    (isFactored(state.left) || isFactored(state.right))
  ) {
    return {
      status: 'invalid',
      next: null,
      note: 'Přes závorku se přičítat nedá. Nejdřív ji roznásob, nebo obě strany vyděl číslem před ní.',
    };
  }
  if (term !== 'const' && term !== 'x') {
    throw new Error(`Neznámý druh operandu: ${term}`);
  }
  if ((kind === 'mul' || kind === 'div') && term === 'x') {
    // Násobení/dělení x-členem umí zavést falešná řešení - UI ho nenabízí.
    throw new Error('Násobit a dělit lze jen číslem, ne x-členem');
  }

  if (kind === 'div' && operand.n === 0) {
    return { status: 'invalid', next: null, note: 'Nulou se nedělí' };
  }
  if (kind === 'mul' && operand.n === 0) {
    return {
      status: 'invalid',
      next: null,
      note: 'Násobit nulou nemá smysl - z rovnice by zbylo jen 0 = 0.',
    };
  }
  if ((kind === 'add' || kind === 'sub') && operand.n === 0) {
    return {
      status: 'invalid',
      next: null,
      note: 'Přičíst nebo odečíst nulu rovnici nezmění.',
    };
  }

  const applyToSide = (side) => {
    const f = factorOf(side);
    switch (kind) {
      case 'add':
        return term === 'x'
          ? { f: { ...f }, x: addFractions(side.x, operand), c: { ...side.c } }
          : { f: { ...f }, x: { ...side.x }, c: addFractions(side.c, operand) };
      case 'sub':
        return term === 'x'
          ? { f: { ...f }, x: subtractFractions(side.x, operand), c: { ...side.c } }
          : { f: { ...f }, x: { ...side.x }, c: subtractFractions(side.c, operand) };
      case 'mul':
        // U závorky škálujeme činitele, ne její obsah - dělení činitelem
        // je pak přesně ta úprava, která závorku odstraní.
        return isFactored(side)
          ? { f: multiplyFractions(f, operand), x: { ...side.x }, c: { ...side.c } }
          : { f: { ...f }, x: multiplyFractions(side.x, operand), c: multiplyFractions(side.c, operand) };
      default:
        return isFactored(side)
          ? { f: divideFractions(f, operand), x: { ...side.x }, c: { ...side.c } }
          : { f: { ...f }, x: divideFractions(side.x, operand), c: divideFractions(side.c, operand) };
    }
  };

  const next = { left: applyToSide(state.left), right: applyToSide(state.right) };

  if (effectiveX(next.left).n === 0 && effectiveX(next.right).n === 0) {
    return {
      status: 'invalid',
      next: null,
      note: 'Takhle by ti x z rovnice úplně zmizelo - a to hledáme.',
    };
  }

  return { status: 'ok', next, note: null };
}

/**
 * Skóre vzdálenosti od tvaru x = číslo. Nižší je lepší, 0 = hotovo.
 * Deterministické, aby šel napsat jednoznačný test - žádná heuristika nad textem.
 * Počítá se pro obě orientace (x vlevo i vpravo) a bere se lepší z nich.
 *
 * x na obou stranách váží dvojnásobek: je to překážka, kterou je nutné
 * odstranit jako první, a bez tohoto váhování by se výměna 'x vpravo' za
 * 'konstanta u x' jevila jako krok bez pokroku (5x + 10 = 6x).
 */
export function progressScore(state) {
  // Neroznásobená závorka je práce navíc - bez tohohle členu by dělení
  // činitelem ani roznásobení nevyšlo jako pokrok a hra by se zasekla.
  const brackets = (isFactored(state.left) ? 1 : 0) + (isFactored(state.right) ? 1 : 0);

  // Velikost koeficientu a jeho znaménko se počítají zvlášť. Kdyby se
  // hodnotilo jen 'je koeficient přesně 1?', mělo by -3x stejné skóre
  // jako -x a vydělení třemi by vyšlo jako krok bez pokroku - přitom
  // pak stačí otočit znaménko a je hotovo.
  const sideScore = (withX, other) => {
    const coef = effectiveX(withX);
    const magnitudeOff = Math.abs(coef.n) === coef.d ? 0 : 1;
    const signOff = coef.n < 0 ? 1 : 0;
    return (
      2 * (effectiveX(other).n !== 0 ? 1 : 0) +
      (effectiveC(withX).n !== 0 ? 1 : 0) +
      magnitudeOff +
      signOff
    );
  };

  const options = [];
  if (effectiveX(state.left).n !== 0) {
    options.push(sideScore(state.left, state.right));
  }
  if (effectiveX(state.right).n !== 0) {
    options.push(sideScore(state.right, state.left));
  }
  return brackets + (options.length > 0 ? Math.min(...options) : 0);
}

/** Je rovnice vyřešená, tedy ve tvaru x = číslo (nebo číslo = x)? */
export function isSolved(state) {
  return (
    (isBareX(state.left) && effectiveX(state.right).n === 0) ||
    (isBareX(state.right) && effectiveX(state.left).n === 0)
  );
}

/** Řešení rovnice, nebo null když je stav degenerovaný (obranná pojistka). */
function safeSolvedValue(state) {
  try {
    return solvedValue(state.left, state.right);
  } catch {
    return null;
  }
}

/**
 * Posoudí krok z prev do next.
 * Neekvivalence je obranná pojistka: applyOperation upravuje obě strany
 * stejně, takže při správné implementaci nastat nemůže. Kdyby nastala,
 * je to chyba v kódu a krok se nesmí přijmout.
 *
 * @returns {{status: 'ok'|'noProgress'|'notEquivalent', solved: boolean, note: string|null}}
 */
export function checkStep(prev, next) {
  const before = safeSolvedValue(prev);
  const after = safeSolvedValue(next);
  if (before === null || after === null || !fractionsIdentical(before, after)) {
    return {
      status: 'notEquivalent',
      solved: false,
      note: 'Tahle úprava rovnici změnila - řešení už by vyšlo jiné.',
    };
  }

  const solved = isSolved(next);
  if (progressScore(next) >= progressScore(prev) && !solved) {
    return {
      status: 'noProgress',
      solved: false,
      note: 'Tohle je pravda, ale k výsledku tě to nepřiblíží.',
    };
  }
  return { status: 'ok', solved, note: null };
}

/**
 * Které části rovnice se krokem změnily a mají smysl jako otázka na hráče.
 * Vynechává výsledky, které hráč zvolením operace už předem zná:
 * konstantu vynulovanou odečtením a koeficient sražený na 1 dělením.
 *
 * @returns {('left.x'|'left.c'|'right.x'|'right.c')[]}
 */
export function askedParts(prev, next) {
  const slots = ['left.x', 'left.c', 'right.x', 'right.c'];
  return slots.filter((slot) => {
    const [side, part] = slot.split('.');
    const before = prev[side][part];
    const after = next[side][part];
    if (fractionsIdentical(before, after)) {
      return false;
    }
    if (after.n === 0) {
      return false; // cíl odečtení - hráč ho zvolil právě proto
    }
    if (part === 'x' && isUnit(after)) {
      return false; // cíl dělení koeficientem
    }
    return true;
  });
}

/** Hodnota části stavu podle identifikátoru slotu. */
export function partValue(state, slot) {
  const [side, part] = slot.split('.');
  return { ...state[side][part] };
}

/** Česká otázka na hodnotu slotu, např. 'Kolik zbude na pravé straně?'. */
export function partQuestion(slot) {
  const [side, part] = slot.split('.');
  const sideText = side === 'left' ? 'levé' : 'pravé';
  return part === 'x'
    ? `Kolik x zůstane na ${sideText} straně?`
    : `Jaké číslo zůstane na ${sideText} straně?`;
}

/** Text operace v metafoře váhy: 'Odečti 4 z obou stran'. */
export function describeOperation(operation) {
  if (operation.kind === 'expand') {
    return 'Roznásob závorku';
  }
  const term = operation.term ?? 'const';
  const amount =
    term === 'x'
      ? isUnit(operation.operand)
        ? 'x'
        : `${formatNumber(operation.operand)}x`
      : formatNumber(operation.operand);

  switch (operation.kind) {
    case 'add':
      return `Přičti ${amount} k oběma stranám`;
    case 'sub':
      return `Odečti ${amount} z obou stran`;
    case 'mul':
      return `Vynásob obě strany ${amount}`;
    default:
      return `Vyděl obě strany ${amount}`;
  }
}

/** Kopie stavu rovnice - relace si drží snímky, ne živé odkazy. */
export function cloneState(state) {
  return { left: cloneExpr(state.left), right: cloneExpr(state.right) };
}
