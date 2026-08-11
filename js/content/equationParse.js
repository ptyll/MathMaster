/**
 * Parser a sémantická validace hráčem zadané rovnice (UCN-STEP-004, DEC-011).
 * Čisté funkce bez DOM - testovatelné přes node --test.
 *
 * Hráč sestaví rovnici ze zadání slovní úlohy (dlaždice UCV-INPUT-003 nebo
 * volný zápis UCV-INPUT-004). Oba vstupy produkují SEZNAM TOKENŮ - tento
 * modul žádný volný text nečte a češtinu zadání nikdy neparsuje. Rovnice se
 * kanonizuje na lineární tvar ax + b = cx + d se zlomkovými koeficienty
 * (výhradně přes fractions.js, žádné floaty) a porovnání s očekávanou
 * rovnicí z generátoru (UCN-MATH-007) je sémantické, ne textové. Žádný eval.
 *
 * Token = jeden symbol rovnice:
 *   { kind: 'x' }                          neznámá
 *   { kind: 'num', n, d? }                 číslo (d výchozí 1; zlomek n/d)
 *   { kind: 'op', op: '+'|'-'|'*'|'/' }    operace (UI normalizuje − · × ÷ :)
 *   { kind: 'lparen' } / { kind: 'rparen' }  závorky
 *   { kind: 'eq' }                         rovnítko
 *
 * Parser záměrně umí širší prostor, než generátor produkuje (DEC-011):
 * víc x-členů na straně (x − x/4), komutativitu (8 + x), implicitní násobení
 * (2x, 2(x + 10)) a dělení části strany (x/4 čti jako čtvrtinu z x).
 * Validace uzná i přehození stran a násobky rovnice (2x + 14 = 50 za
 * x + 7 = 25) - násobek dostane poznámku, že to jde i jednodušeji.
 *
 * Chybové hlášky NIKDY neprozradí správnou rovnici - jsou to pevné texty
 * bez čísel ze zadání. Neúplný zápis je 'unparseable' (nápověda, ne chyba
 * do statistik); dobře zapsaná rovnice, která nesedí na zadání, je 'mismatch'
 * s druhem chyby equationSetup (UCN-STATS-002).
 *
 * Kanonický výstup má tvar solverovského výrazu { f, x, c } s f = 1, takže
 * z něj krokový režim může přímo startovat (DEC-011: z HRÁČOVY rovnice).
 */

import {
  makeFraction,
  addFractions,
  subtractFractions,
  multiplyFractions,
  divideFractions,
  fractionsEqual,
} from './fractions.js';
import { effectiveX, effectiveC } from './solver.js';

/** Druh chyby pro rodičovský přehled (UCN-STATS-002): rovnice nesedí na zadání. */
export const EQUATION_SETUP_ERROR = 'equationSetup';

/** Poznámka u správné rovnice, která je násobkem jednoduššího tvaru. */
export const NOTE_SIMPLER = 'Správně! Jde to napsat i jednodušeji.';

// Pevné texty hlášek - konstanty, aby se do nich nikdy nemohla dostat čísla
// z očekávané rovnice.
const NOTE_MISMATCH =
  'Rovnice je zapsaná správně, ale nesedí na zadání. Přečti si ho ještě jednou a zkontroluj, co se s neznámou x stalo.';
const NOTE_EMPTY = 'Napiš rovnici podle zadání.';
const NOTE_NO_EQUALS = 'Rovnici poznáš podle rovnítka - napiš ji celou, i s =.';
const NOTE_TWO_EQUALS = 'Rovnice má jen jedno rovnítko.';
const NOTE_EMPTY_SIDE = 'Jedna strana rovnice je prázdná - doplň ji.';
const NOTE_NO_X = 'V rovnici chybí neznámá x - to je právě číslo, které hledáme.';
const NOTE_X_CANCELLED = 'Neznámá x se ti v rovnici vynulovala - zkontroluj znaménka a čísla.';
const NOTE_INCOMPLETE = 'Tahle rovnice je nedopsaná - zkontroluj znaménka, čísla a závorky.';
const NOTE_UNCLOSED_PAREN = 'Chybí ti zavřená závorka.';
const NOTE_DIV_ZERO = 'Nulou se nedělí.';
const NOTE_TOO_COMPLEX = 'Takhle zamotanou rovnici neumím přečíst - zkus jednodušší tvar s jedním x.';
const NOTE_UNKNOWN_TOKEN = 'Tomu zápisu nerozumím - zkus rovnici poskládat znovu.';

/** Chyba čtení tokenu - nese českou nápovědu pro hráče, ne stack pro programátora. */
class ParseError extends Error {}

const unparseable = (note) => ({ status: 'unparseable', canonical: null, note });

const mismatch = (canonical) => ({
  status: 'mismatch',
  canonical,
  note: NOTE_MISMATCH,
  errorKind: EQUATION_SETUP_ERROR,
});

// --- Lineární algebra nad jednou stranou rovnice --------------------------
// Strana se parsuje do tvaru { x, c } (zlomky): (koeficient u x) * x + konstanta.

const ZERO = Object.freeze({ n: 0, d: 1 });
const ONE = Object.freeze({ n: 1, d: 1 });

const linearConst = (f) => ({ x: { ...ZERO }, c: f });
const linearX = () => ({ x: makeFraction(1), c: { ...ZERO } });
const isConstLinear = (a) => a.x.n === 0;

const addLinear = (a, b) => ({ x: addFractions(a.x, b.x), c: addFractions(a.c, b.c) });
const subLinear = (a, b) => ({ x: subtractFractions(a.x, b.x), c: subtractFractions(a.c, b.c) });
const negateLinear = (a) => ({
  x: makeFraction(-a.x.n, a.x.d),
  c: makeFraction(-a.c.n, a.c.d),
});
const scaleLinear = (a, k) => ({ x: multiplyFractions(a.x, k), c: multiplyFractions(a.c, k) });

/** Násobení zůstane lineární jen tehdy, když jeden činitel je čisté číslo. */
function mulLinear(a, b) {
  if (isConstLinear(a)) {
    return scaleLinear(b, a.c);
  }
  if (isConstLinear(b)) {
    return scaleLinear(a, b.c);
  }
  // x · x už není lineární rovnice - tu krokový režim neumí a hráč ji
  // nejspíš nechtěl napsat.
  throw new ParseError(NOTE_TOO_COMPLEX);
}

/** Dělit lze jen nenulovým číslem, ne výrazem s x. */
function divLinear(a, b) {
  if (!isConstLinear(b)) {
    throw new ParseError(NOTE_TOO_COMPLEX);
  }
  if (b.c.n === 0) {
    throw new ParseError(NOTE_DIV_ZERO);
  }
  return { x: divideFractions(a.x, b.c), c: divideFractions(a.c, b.c) };
}

// --- Validace tokenů --------------------------------------------------------

const KNOWN_OPS = Object.freeze(['+', '-', '*', '/']);

function validateToken(t) {
  if (!t || typeof t !== 'object') {
    throw new ParseError(NOTE_UNKNOWN_TOKEN);
  }
  switch (t.kind) {
    case 'x':
    case 'eq':
    case 'lparen':
    case 'rparen':
      return;
    case 'num': {
      const d = t.d ?? 1;
      if (!Number.isInteger(t.n) || !Number.isInteger(d) || d < 1) {
        throw new ParseError(NOTE_UNKNOWN_TOKEN);
      }
      return;
    }
    case 'op':
      if (!KNOWN_OPS.includes(t.op)) {
        throw new ParseError(NOTE_UNKNOWN_TOKEN);
      }
      return;
    default:
      throw new ParseError(NOTE_UNKNOWN_TOKEN);
  }
}

// --- Rekurzivní sestupný parser jedné strany --------------------------------
// Gramatika:  expr := term (('+'|'-') term)*
//             term := factor (('*'|'/'|implicitně) factor)*
//             factor := num | x | '(' expr ')' | ('+'|'-') factor
// Vrací lineární tvar { x, c } nebo hází ParseError s českou nápovědou.

function parseSide(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (t, ...ops) => t && t.kind === 'op' && ops.includes(t.op);
  // Začátek dalšího činitele bez operátoru = implicitní násobení (2x, 2(x+1)).
  const startsFactor = (t) => t && (t.kind === 'num' || t.kind === 'x' || t.kind === 'lparen');

  function parseExpr() {
    let value = parseTerm();
    while (isOp(peek(), '+', '-')) {
      const op = tokens[pos++].op;
      const rhs = parseTerm();
      value = op === '+' ? addLinear(value, rhs) : subLinear(value, rhs);
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    for (;;) {
      if (isOp(peek(), '*')) {
        pos++;
        value = mulLinear(value, parseFactor());
      } else if (isOp(peek(), '/')) {
        pos++;
        value = divLinear(value, parseFactor());
      } else if (startsFactor(peek())) {
        value = mulLinear(value, parseFactor());
      } else {
        return value;
      }
    }
  }

  function parseFactor() {
    const t = peek();
    if (!t) {
      throw new ParseError(NOTE_INCOMPLETE);
    }
    if (isOp(t, '-')) {
      pos++;
      return negateLinear(parseFactor());
    }
    if (isOp(t, '+')) {
      pos++;
      return parseFactor();
    }
    if (t.kind === 'num') {
      pos++;
      return linearConst(makeFraction(t.n, t.d ?? 1));
    }
    if (t.kind === 'x') {
      pos++;
      return linearX();
    }
    if (t.kind === 'lparen') {
      pos++;
      const inner = parseExpr();
      if (!peek() || peek().kind !== 'rparen') {
        throw new ParseError(NOTE_UNCLOSED_PAREN);
      }
      pos++;
      return inner;
    }
    // rparen nebo eq na místě, kde čekáme činitel - zápis je nedopsaný.
    throw new ParseError(NOTE_INCOMPLETE);
  }

  const value = parseExpr();
  if (pos !== tokens.length) {
    throw new ParseError(NOTE_INCOMPLETE);
  }
  return value;
}

// --- Kanonizace --------------------------------------------------------------

/**
 * Převede výraz na kanonický solverovský tvar { f: 1, x, c } se zkrácenými
 * zlomky. Akceptuje lineární tvar parseru { x, c } i solverovský výraz
 * { f, x, c } - součinový tvar (závorku z generátoru) roznásobí.
 */
export function canonicalize(expr) {
  if (!expr || !expr.x || !expr.c) {
    throw new Error('canonicalize očekává výraz { x, c } nebo { f, x, c }');
  }
  const x = expr.f ? effectiveX(expr) : expr.x;
  const c = expr.f ? effectiveC(expr) : expr.c;
  return { f: { ...ONE }, x: makeFraction(x.n, x.d), c: makeFraction(c.n, c.d) };
}

/** Kanonizuje obě strany rovnice { left, right }. */
function canonicalEquation(equation) {
  return { left: canonicalize(equation.left), right: canonicalize(equation.right) };
}

// --- Veřejné API -------------------------------------------------------------

/**
 * Přečte seznam tokenů jako rovnici a vrátí její kanonický tvar.
 * S parametrem expected rovnou i sémanticky porovná s očekávanou rovnicí
 * z generátoru (ve tvaru { left, right } solverovských výrazů).
 *
 * @param {object[]} tokens seznam tokenů dle hlavičky souboru
 * @param {{left: object, right: object}} [expected] očekávaná rovnice (UCN-MATH-007)
 * @returns {{status: 'ok'|'match'|'mismatch'|'unparseable', canonical: {left, right}|null, note: string|null, errorKind?: string}}
 *   Bez expected: 'ok' nebo 'unparseable'. S expected: 'match' (note jen u
 *   násobku jednoduššího tvaru), 'mismatch' (errorKind equationSetup) nebo
 *   'unparseable' (nápověda, ne chyba do statistik).
 */
export function parseEquation(tokens, expected = null) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return unparseable(NOTE_EMPTY);
  }

  let eqIndex = -1;
  try {
    tokens.forEach((t, i) => {
      validateToken(t);
      if (t.kind === 'eq') {
        eqIndex = eqIndex === -1 ? i : -2; // druhé rovnítko
      }
    });
  } catch (e) {
    if (e instanceof ParseError) {
      return unparseable(e.message);
    }
    throw e;
  }

  if (eqIndex === -1) {
    return unparseable(NOTE_NO_EQUALS);
  }
  if (eqIndex === -2) {
    return unparseable(NOTE_TWO_EQUALS);
  }

  const leftTokens = tokens.slice(0, eqIndex);
  const rightTokens = tokens.slice(eqIndex + 1);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return unparseable(NOTE_EMPTY_SIDE);
  }

  let left;
  let right;
  try {
    left = parseSide(leftTokens);
    right = parseSide(rightTokens);
  } catch (e) {
    if (e instanceof ParseError) {
      return unparseable(e.message);
    }
    throw e;
  }

  // Rovnice bez neznámé (samotné číslo, 3 + 5 = 8) je nedopsaná, ne špatná.
  // Psané x, které se vynulovalo (x − x = 0), dostane přesnější hlášku.
  if (left.x.n === 0 && right.x.n === 0) {
    const wroteX = tokens.some((t) => t.kind === 'x');
    return unparseable(wroteX ? NOTE_X_CANCELLED : NOTE_NO_X);
  }

  const canonical = { left: canonicalize(left), right: canonicalize(right) };
  if (!expected) {
    return { status: 'ok', canonical, note: null };
  }
  const verdict = equationsMatch(canonical, expected);
  return { ...verdict, canonical };
}

/**
 * Sémanticky porovná dvě rovnice { left, right } (solverovské výrazy,
 * klidně se závorkou - ta se roznásobí).
 *
 * Každou rovnici ax + b = cx + d přepíše jako p·x = q (p = a − c, q = d − b).
 * Dvě rovnice jsou ekvivalentní, právě když (p₁, q₁) = k·(p₂, q₂) pro nenulové
 * k - to pokryje komutativitu, přehození stran i násobky rovnice.
 *
 * @returns {{status: 'match'|'mismatch', note: string|null, errorKind?: string}}
 *   'match' s note NOTE_SIMPLER, když |k| ≠ 1 (hráč napsal násobek);
 *   'mismatch' s errorKind equationSetup jinak.
 */
export function equationsMatch(given, expected) {
  const g = canonicalEquation(given);
  const e = canonicalEquation(expected);

  const gp = subtractFractions(g.left.x, g.right.x);
  const gq = subtractFractions(g.right.c, g.left.c);
  const ep = subtractFractions(e.left.x, e.right.x);
  const eq = subtractFractions(e.right.c, e.left.c);

  // Degenerovaná hráčova rovnice (x = x, x = x + 1): dobře napsaná,
  // ale k řešení slovní úlohy nevede - počítá se jako špatné sestavení.
  if (gp.n === 0) {
    return mismatch(g);
  }

  // Křížové vynásobení p₁·q₂ = p₂·q₁ - stejná řešovací přímka.
  const equivalent = fractionsEqual(multiplyFractions(gp, eq), multiplyFractions(ep, gq));
  if (!equivalent) {
    return mismatch(g);
  }

  // Ekvivalentní. Poměr k řekne, jestli hráč napsal přesně kanonický tvar,
  // nebo jeho násobek (k = −1 je prohození stran - to je čistý match).
  // Poznámka patří jen násobku (|k| > 1); |k| < 1 znamená, že hráč napsal
  // naopak JEDNODUŠŠÍ tvar než reference - to je čistý match bez poznámky.
  // Defensivita: degenerované expected (0x = 0) generátor nikdy nevrací,
  // ale kdyby se stalo, počítáme k = 1 (žádná poznámka) místo dělení nulou.
  const k = ep.n !== 0 ? divideFractions(gp, ep) : eq.n !== 0 ? divideFractions(gq, eq) : ONE;
  const simpler = Math.abs(k.n) > k.d;
  return { status: 'match', note: simpler ? NOTE_SIMPLER : null };
}
