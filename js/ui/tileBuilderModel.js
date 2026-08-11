/**
 * Logika dlaždicového skládání rovnice (UCV-INPUT-003).
 * Čistá logika bez DOM - testovatelné přes node --test (stejný vzor jako
 * js/ui/inputModel.js). DOM vrstva je js/ui/tileEquationBuilder.js.
 *
 * Hráč sestaví rovnici klikáním na dlaždice do dvou schránek (levá a pravá
 * strana); rovnítko je pevně mezi nimi, není dlaždicí. Dlaždice se přidá na
 * konec AKTIVNÍ strany, kliknutím na dlaždici ve schránce se odebere.
 *
 * Stav strany = seznam buněk:
 *   { kind: 'x' }                      neznámá
 *   { kind: 'num', text: '123' }       číslo (číslice se do něj doplňují)
 *   { kind: 'op', op: '+'|'-'|'*' }    operace
 *   { kind: 'lparen' } / { kind: 'rparen' }  závorky
 *
 * Neplatné kombinace model zablokuje hned při kliku (dvě znaménka vedle
 * sebe, 'x x', 'x · x', závorka bez otevření, ...). Klik ale není jediná
 * cesta ke stavu strany - removeCell umí rozbít i sekvenci, která při
 * skládání prošla ('x + 7' bez x je '+ 7', '2x + 3x' bez '+' je '2x·3x'),
 * takže submit gate stejná pravidla ještě jednou přehraje nad celou stranou.
 * Teprve tím se 'unparseable' opravdu vyloučí - kromě rovnic, které jsou
 * napsané dobře, ale matematicky degenerované (x se vynuluje, dělení nulou);
 * ty gate bez počítání nepozná a parser na ně má vlastní hlášky, které dítě
 * něco naučí. Dělení v paletě není - slovní úlohy obtížnosti 1-3
 * (x + a = b, x - a = b, ax + b = c) ho nepotřebují; implicitní násobení
 * '4x' parser zvládne (stejně jako '4 · x').
 *
 * Výstupem je seznam tokenů přesně dle kontraktu js/content/equationParse.js:
 * [tokeny levé strany..., { kind: 'eq' }, tokeny pravé strany...] - jediným
 * konzumentem je parseEquation().
 */

/** Kolik číslic může mít jedno číslo (stejný limit jako číselná klávesnice). */
export const MAX_NUM_DIGITS = 4;

/**
 * Nápisy u zablokovaného Hotova - proč to (ještě) nejde odeslat. Stejné texty
 * jako v js/ui/freeEquationModel.js: buildery jsou dle DEC-015 zaměnitelné,
 * hráč mezi nimi přechází s obtížností úlohy a má slyšet totéž. Hlášky nikdy
 * neprozradí správnou rovnici - mluví jen o tvaru zápisu.
 */
export const HINT_NO_X = 'Rovnice musí obsahovat x';
const HINT_EMPTY_SIDE = 'Na obou stranách rovnice musí něco být.';
const HINT_UNCLOSED_PAREN = 'Zavři závorku - ke každé otevřené patří zavřená.';
const HINT_UNFINISHED = 'Rovnice není dopsaná - za znaménkem ještě něco chybí.';
const NOTE_QUADRATIC = 'Dvě x se nesmí násobit - mezi ně patří + nebo −.';

const SIDES = Object.freeze(['left', 'right']);

/** Buňka, za kterou může následovat znaménko nebo zavřená závorka. */
const isValueEnd = (cell) => cell && (cell.kind === 'x' || cell.kind === 'num' || cell.kind === 'rparen');

/**
 * Co smí následovat za čím - jediný zdroj pravdy pro pravidla skládání.
 * Používá ho pressTile/pressDigit při kliku i submit gate, který sekvenci
 * přehraje znovu (removeCell umí sekvenci rozbít doprostřed). Klíč je druh
 * předchozí buňky, 'start' je začátek strany.
 * 'num' smí následovat cokoliv hodnotového - '2x' i '2(x+1)' je implicitní
 * násobení, které parser čte tak, jak to hráč myslí.
 */
const CAN_FOLLOW = Object.freeze({
  start: ['x', 'num', 'lparen'],
  x: ['op', 'rparen'],
  num: ['x', 'num', 'op', 'lparen', 'rparen'],
  op: ['x', 'num', 'lparen'],
  lparen: ['x', 'num', 'lparen'],
  rparen: ['op', 'rparen'],
});

const canFollow = (prev, kind) => CAN_FOLLOW[prev ? prev.kind : 'start'].includes(kind);

/**
 * Rozdělí buňky jedné strany na top-level členy (dělítko + a − mimo závorky).
 * Nedopsaná závorka (kontrola běží i uprostřed skládání) drží zbytek strany
 * v sobě - přesně jak to čte parser.
 */
function splitTerms(cells) {
  const terms = [];
  let current = [];
  let depth = 0;
  for (const cell of cells) {
    if (depth === 0 && cell.kind === 'op' && (cell.op === '+' || cell.op === '-')) {
      terms.push(current);
      current = [];
      continue;
    }
    current.push(cell);
    if (cell.kind === 'lparen') {
      depth += 1;
    } else if (cell.kind === 'rparen') {
      depth -= 1;
    }
  }
  terms.push(current);
  return terms;
}

/** Rozdělí člen na činitele - dělí je '·' i prosté položení vedle sebe (2x, 2(x+1)). */
function splitFactors(term) {
  const factors = [];
  let current = [];
  let depth = 0;
  const endsFactor = () => {
    const tail = current[current.length - 1];
    return tail && (tail.kind === 'x' || tail.kind === 'num' || tail.kind === 'rparen');
  };
  for (const cell of term) {
    if (depth === 0) {
      if (cell.kind === 'op') {
        // '·' mezi činiteli; unární znaménko na začátku členu žádný neuzavírá.
        if (current.length > 0) {
          factors.push(current);
          current = [];
        }
        continue;
      }
      if (endsFactor()) {
        factors.push(current);
        current = [];
      }
    }
    current.push(cell);
    if (cell.kind === 'lparen') {
      depth += 1;
    } else if (cell.kind === 'rparen') {
      depth -= 1;
    }
  }
  if (current.length > 0) {
    factors.push(current);
  }
  return factors;
}

/**
 * Násobí se v některém členu dvě x? ('x · x', '2(x+1)(x+1)', po removeCell
 * i '2x 3x') Parser by z toho udělal kvadratickou rovnici, kterou krokový
 * režim neumí - a dítě ji skládat nechtělo. Hlídá se rekurzivně i uvnitř
 * závorek; '(x + x)' je naopak v pořádku, sčítání činitele nezdvojuje.
 * Stejné pravidlo má i js/ui/freeEquationModel.js - oba buildery zakazují
 * totéž, aby se hráči obtížností úlohy nezměnila pravidla pod rukama.
 */
function hasQuadraticTerm(cells) {
  for (const term of splitTerms(cells)) {
    let xFactors = 0;
    for (const factor of splitFactors(term)) {
      if (factor.some((c) => c.kind === 'x')) {
        xFactors += 1;
      }
      if (factor[0].kind === 'lparen') {
        const end = factor[factor.length - 1].kind === 'rparen' ? factor.length - 1 : factor.length;
        if (hasQuadraticTerm(factor.slice(1, end))) {
          return true;
        }
      }
    }
    if (xFactors >= 2) {
      return true;
    }
  }
  return false;
}

export function createTileBuilderModel() {
  const sides = { left: [], right: [] };
  let active = 'left';

  const side = (name) => sides[name ?? active];
  const lastCell = (cells) => cells[cells.length - 1] ?? null;

  /** Kolik závorek na straně čeká na zavření. */
  const openParens = (cells) =>
    cells.filter((c) => c.kind === 'lparen').length - cells.filter((c) => c.kind === 'rparen').length;

  /**
   * Položí dlaždici na konec aktivní strany.
   * @param {string} symbol 'x' | '+' | '-' | '*' | '(' | ')'
   * @returns {{ status: 'added' } | { status: 'blocked', note: string }}
   */
  function pressTile(symbol) {
    const cells = side();
    const last = lastCell(cells);
    switch (symbol) {
      case 'x':
        // 'x x' by znamenalo x·x (kvadratické) a 'x' za závorkou je stejně
        // podezřelé - obojí by parser četl jinak, než hráč myslí.
        if (!canFollow(last, 'x')) {
          return { status: 'blocked', note: 'Dvě x vedle sebe nedávají smysl - polož mezi ně znaménko.' };
        }
        // 'x · x' i '2(x+1)(x+1)' je kvadratická rovnice. Blokujeme ji hned
        // při kliku, ne až v gate: dítě pochopí 'tohle nejde' u dlaždice, na
        // kterou právě sáhlo, líp než u zšedlého Hotova o dva kroky později
        // (a dlaždici umí i rovnou odebrat kliknutím ve schránce).
        if (hasQuadraticTerm([...cells, { kind: 'x' }])) {
          return { status: 'blocked', note: NOTE_QUADRATIC };
        }
        cells.push({ kind: 'x' });
        return { status: 'added' };
      case '+':
      case '-':
      case '*':
        // Znaménko potřebuje operand před sebou - jinak by vzniklo '++'
        // nebo strana začínající znaménkem.
        if (!canFollow(last, 'op')) {
          return { status: 'blocked', note: 'Znaménko patří až za číslo, x nebo závorku.' };
        }
        cells.push({ kind: 'op', op: symbol });
        return { status: 'added' };
      case '(':
        // '2(' je implicitní násobení 2·(x + 1) - povolíme. 'x(' a ')('
        // by bylo x·(...) nebo (...)·(...) - to je mimo rovnicovou hru.
        if (!canFollow(last, 'lparen')) {
          return { status: 'blocked', note: 'Závorku polož na začátek, za znaménko nebo za číslo.' };
        }
        cells.push({ kind: 'lparen' });
        return { status: 'added' };
      case ')': {
        if (openParens(cells) <= 0) {
          return { status: 'blocked', note: 'Nejdřív závorku otevři.' };
        }
        if (!canFollow(last, 'rparen')) {
          return { status: 'blocked', note: 'Před zavřenou závorkou musí být číslo nebo x.' };
        }
        cells.push({ kind: 'rparen' });
        return { status: 'added' };
      }
      default:
        return { status: 'blocked', note: 'Tuhle dlaždici neznám.' };
    }
  }

  /**
   * Přidá číslici. Za číslem se připíše (skládá se víceciferné číslo,
   * vedoucí nula se nahradí), jinak založí novou buňku.
   * @param {string} digit '0'-'9'
   * @returns {{ status: 'added' } | { status: 'blocked', note: string }}
   */
  function pressDigit(digit) {
    if (!/^[0-9]$/.test(digit)) {
      return { status: 'blocked', note: 'Tohle není číslice.' };
    }
    const cells = side();
    const last = lastCell(cells);
    if (last && last.kind === 'num') {
      if (last.text.length >= MAX_NUM_DIGITS) {
        return { status: 'blocked', note: `Číslo může mít nejvýš ${MAX_NUM_DIGITS} číslice.` };
      }
      last.text = last.text === '0' ? digit : last.text + digit;
      return { status: 'added' };
    }
    // 'x3' nebo '(x + 1)3' by parser četl jako násobení - hráč ale skoro
    // jistě chtěl '+ 3', takže ho na znaménko radši upozorníme.
    if (!canFollow(last, 'num')) {
      return { status: 'blocked', note: 'Mezi x a číslo polož znaménko.' };
    }
    cells.push({ kind: 'num', text: digit });
    return { status: 'added' };
  }

  /**
   * Odebere buňku ze schránky (klik na dlaždici ve schránce).
   * @param {number} index pozice buňky
   * @param {'left'|'right'} [name] výchozí je aktivní strana
   */
  function removeCell(index, name) {
    const cells = side(name);
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) {
      return false;
    }
    cells.splice(index, 1);
    return true;
  }

  /** Vymaže celou stranu (výchozí aktivní). */
  function clearSide(name) {
    side(name).length = 0;
  }

  /** Přepne aktivní stranu (klepnutí na schránku). */
  function setActiveSide(name) {
    if (!SIDES.includes(name)) {
      return;
    }
    active = name;
  }

  /**
   * Proč strana ještě není hotová k odeslání, nebo null. Neprázdná, vyvážené
   * závorky, končí hodnotou (x, číslo, ')') a celá sekvence dodržuje stejná
   * pravidla jako klik - removeCell umí uprostřed nechat '+ 7' nebo '2x 3x'
   * a to už parser čte jako 'unparseable'.
   */
  function sideHint(cells) {
    if (cells.length === 0) {
      return HINT_EMPTY_SIDE;
    }
    if (openParens(cells) !== 0) {
      return HINT_UNCLOSED_PAREN;
    }
    if (!isValueEnd(lastCell(cells))) {
      return HINT_UNFINISHED;
    }
    let prev = null;
    for (const cell of cells) {
      if (!canFollow(prev, cell.kind)) {
        return HINT_UNFINISHED;
      }
      prev = cell;
    }
    if (hasQuadraticTerm(cells)) {
      return NOTE_QUADRATIC;
    }
    return null;
  }

  /**
   * Důvod, proč Hotovo (ještě) nejde odeslat, nebo null. Texty se ukazují
   * u zablokovaného tlačítka, takže musí vždy říct KONKRÉTNĚ, co doskládat -
   * nikdy neprozradí správnou rovnici.
   *
   * Podmínku 'rovnice musí obsahovat x' má stejnou i volný zápis
   * (js/ui/freeEquationModel.js): '3 + 5 = 8' není špatně sestavená rovnice,
   * ale rovnice bez neznámé - hráč ji má doskládat, ne za ni dostat chybu do
   * statistik. Oba buildery ho proto zastaví už před odesláním.
   */
  function submitHint() {
    for (const name of SIDES) {
      const hint = sideHint(sides[name]);
      if (hint) {
        return hint;
      }
    }
    if (!SIDES.some((name) => sides[name].some((c) => c.kind === 'x'))) {
      return HINT_NO_X;
    }
    return null;
  }

  /** Hotovo je povolené, až když submitHint nic nevrací. */
  function canSubmit() {
    return submitHint() === null;
  }

  /** Buňky jedné strany jako tokeny pro parseEquation. */
  function sideTokens(name) {
    return sides[name].map((cell) => {
      switch (cell.kind) {
        case 'num':
          return { kind: 'num', n: Number(cell.text) };
        case 'op':
          return { kind: 'op', op: cell.op };
        default:
          return { kind: cell.kind };
      }
    });
  }

  /**
   * Celá rovnice jako seznam tokenů dle kontraktu equationParse.js.
   * Rovnítko je právě jedno - schránky ho drží pevně mezi sebou, takže
   * dvě rovnítka v zápisu nikdy nevzniknou.
   */
  function getTokens() {
    return [...sideTokens('left'), { kind: 'eq' }, ...sideTokens('right')];
  }

  /** Snímek stavu pro vykreslení (kopie - vnější kód stav nemutuje). */
  function getState() {
    const copy = (cells) => cells.map((c) => ({ ...c }));
    return {
      left: copy(sides.left),
      right: copy(sides.right),
      active,
      canSubmit: canSubmit(),
      submitHint: submitHint(),
    };
  }

  return {
    pressTile,
    pressDigit,
    removeCell,
    clearSide,
    setActiveSide,
    canSubmit,
    submitHint,
    getTokens,
    getState,
  };
}
