/**
 * Logika volného zápisu rovnice na rozšířené klávesnici (UCV-INPUT-004).
 * Čistá logika bez DOM - testovatelná přes node --test (stejný vzor jako
 * js/ui/inputModel.js a js/ui/tileBuilderModel.js). DOM vrstva je
 * js/ui/freeEquationInput.js.
 *
 * Narozdíl od dlaždic (UCV-INPUT-003) je rovnítko běžná klávesa a klávesnice
 * má navíc zlomkovou čáru: hráč píše jednotlivé znaky do jednoho řádku,
 * rovnice může obsahovat zlomky (3/4) i 'x lomeno číslo' (x/4). Zápis je
 * jeden proud buněk; pozice rovnítka dělí levou a pravou stranu.
 *
 * Stav zápisu = seznam buněk:
 *   { kind: 'x', d?: string }            neznámá; po zlomkové čáře nese
 *                                        jmenovatele ('x/4'), '' = čára bez číslice
 *   { kind: 'num', n: string, d?: string }  číslo, případně zlomek '3/4'
 *   { kind: 'op', op: '+'|'-'|'*' }      operace
 *   { kind: 'lparen' } / { kind: 'rparen' }  závorky
 *   { kind: 'eq' }                       rovnítko - právě jedno, klávesa '='
 *                                        se po prvním použití vypne (dokud ho
 *                                        hráč případně nesmaže backspacem)
 *
 * Zlomek se zadává jako v UCV-INPUT-002: čitatel, zlomková čára, jmenovatel.
 * Klávesa '−' funguje na začátku strany (a za otevřenou závorkou) jako
 * unární mínus.
 *
 * Hotovo pouští stejný stav jako dlaždicový builder (js/ui/tileBuilderModel.js
 * - oba jsou dle DEC-015 zaměnitelné, takže musí i stejně gate-ovat): obě
 * strany neprázdné, každá končí hodnotou a má vyvážené závorky. Navíc tomuto
 * zápisu vlastní podmínky - rovnice musí obsahovat x a nesmí v ní zůstat
 * rozpracovaný zlomek bez jmenovatele. Nedopsaný výraz ('x = 2 +') se tak
 * k parseru vůbec nedostane a hráč místo hlášky 'nerozumím' vidí konkrétní,
 * co dopsat.
 *
 * Výstupem je seznam tokenů přesně dle kontraktu js/content/equationParse.js
 * - jediným konzumentem je parseEquation(). 'x/4' se přeloží na
 * [x, op '/'], num 4], tedy na totéž, co parser čte jako čtvrtinu z x.
 */

/** Kolik číslic může mít čitatel i jmenovatel (stejný limit jako dlaždice). */
export const MAX_NUM_DIGITS = 4;

/** Nápis u zablokovaného Hotova, když rovnice neobsahuje neznámou. */
export const HINT_NO_X = 'Rovnice musí obsahovat x';
const HINT_INCOMPLETE_FRACTION = 'Dopiš jmenovatele zlomku.';
const HINT_EMPTY_SIDE = 'Na obou stranách rovnice musí něco být.';
// Stejné texty jako v js/ui/tileBuilderModel.js - hráč přechází mezi buildery
// s obtížností úlohy a zablokované Hotovo mu má říkat totéž.
const HINT_UNCLOSED_PAREN = 'Zavři závorku - ke každé otevřené patří zavřená.';
const HINT_UNFINISHED = 'Rovnice není dopsaná - za znaménkem ještě něco chybí.';
const NOTE_QUADRATIC = 'Dvě x se nesmí násobit - mezi ně patří + nebo −.';

/** Buňka, za kterou může následovat znaménko nebo zavřená závorka. */
const isValueEnd = (cell) =>
  cell &&
  (cell.kind === 'x' || cell.kind === 'num' || cell.kind === 'rparen') &&
  cell.d !== ''; // rozpracovaná zlomková čára hodnotu ještě neuzavírá

/**
 * Rozdělí buňky jedné strany na top-level členy (dělítko + a − mimo závorky).
 * Nedopsaná závorka (kontrola běží i uprostřed psaní) drží zbytek strany
 * v sobě, takže se v ní nic nerozdělí - přesně jak to čte parser.
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
 * Násobí se v některém členu dvě x? ('x · x', 'x · (x + 1)', '2(x+1)(x+1)')
 * Parser by z toho udělal kvadratickou rovnici, kterou krokový režim neumí -
 * a dítě ji psát nechtělo. Hlídá se rekurzivně i uvnitř závorek; '(x + x)'
 * je naopak v pořádku, sčítání činitele nezdvojuje.
 * Stejné pravidlo má i js/ui/tileBuilderModel.js (jiný tvar buněk, shodná
 * logika) - oba buildery musí zakázat totéž.
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

export function createFreeEquationModel() {
  const cells = [];

  const last = () => cells[cells.length - 1] ?? null;
  const eqUsed = () => cells.some((c) => c.kind === 'eq');

  /**
   * Pozice rovnítka, nebo -1. Ručním cyklem, ne findLastIndex: ten je ES2023
   * a projekt běží bez build kroku - na starším tabletu (Chrome < 97,
   * Safari < 15.4) by celá obrazovka spadla na neznámé metodě.
   */
  const eqIndex = () => {
    for (let i = cells.length - 1; i >= 0; i -= 1) {
      if (cells[i].kind === 'eq') {
        return i;
      }
    }
    return -1;
  };

  /** Buňky aktuální strany (za rovnítkem, nebo celý zápis, když ještě není). */
  const currentSide = () => {
    const index = eqIndex();
    return index === -1 ? cells.slice() : cells.slice(index + 1);
  };

  /** Obě strany zvlášť - rovnítko je nejvýš jedno, takže dělí zápis napůl. */
  const sides = () => {
    const index = eqIndex();
    return index === -1
      ? { left: cells.slice(), right: [] }
      : { left: cells.slice(0, index), right: cells.slice(index + 1) };
  };

  /** Kolik závorek na dané straně čeká na zavření. */
  const openParensIn = (sideCells) =>
    sideCells.filter((c) => c.kind === 'lparen').length -
    sideCells.filter((c) => c.kind === 'rparen').length;

  /** Kolik závorek na AKTUÁLNÍ straně čeká na zavření. */
  const openParens = () => openParensIn(currentSide());

  const blocked = (note) => ({ status: 'blocked', note });
  const added = { status: 'added' };

  /**
   * Přidá číslici. Rozpracovanému zlomku se připíše do jmenovatele,
   * číslu do čitatele (víceciferné číslo, vedoucí nula se nahradí),
   * jinak založí novou buňku.
   */
  function pressDigit(digit) {
    if (!/^[0-9]$/.test(digit)) {
      return blocked('Tohle není číslice.');
    }
    const cell = last();
    // Rozpracovaná zlomková čára: číslice patří jmenovateli (u čísla i u x).
    if (cell && cell.d !== undefined) {
      if (cell.d.length >= MAX_NUM_DIGITS) {
        return blocked(`Jmenovatel může mít nejvýš ${MAX_NUM_DIGITS} číslice.`);
      }
      cell.d = cell.d === '0' ? digit : cell.d + digit;
      return added;
    }
    if (cell && cell.kind === 'num') {
      if (cell.n.length >= MAX_NUM_DIGITS) {
        return blocked(`Číslo může mít nejvýš ${MAX_NUM_DIGITS} číslice.`);
      }
      cell.n = cell.n === '0' ? digit : cell.n + digit;
      return added;
    }
    // 'x3' nebo '(x + 1)3' by parser četl jako násobení - hráč ale skoro
    // jistě chtěl '+ 3', takže ho na znaménko radši upozorníme.
    if (cell && (cell.kind === 'x' || cell.kind === 'rparen')) {
      return blocked('Mezi x a číslo polož znaménko.');
    }
    cells.push({ kind: 'num', n: digit });
    return added;
  }

  /** Neznámá x. Za číslem povolená ('4x' i '1/4 x' - implicitní násobení). */
  function pressX() {
    const cell = last();
    // 'x x' by znamenalo x·x (kvadratické), ')x' násobení závorek - obojí
    // by parser četl jinak, než hráč myslí.
    if (cell && (cell.kind === 'x' || cell.kind === 'rparen')) {
      return blocked('Dvě x vedle sebe nedávají smysl - napiš mezi ně znaménko.');
    }
    if (cell && cell.kind === 'num' && cell.d === '') {
      return blocked('Dopiš jmenovatele, pak teprve pokračuj.');
    }
    // 'x · x' i 'x · (x + 1)' by byla kvadratická rovnice. Blokujeme hned při
    // stisku, ne až u Hotova: dítě pochopí 'tohle nejde' u klávesy, na kterou
    // právě sáhlo, líp než u zšedlého tlačítka o pár znaků později.
    if (hasQuadraticTerm([...currentSide(), { kind: 'x' }])) {
      return blocked(NOTE_QUADRATIC);
    }
    cells.push({ kind: 'x' });
    return added;
  }

  /**
   * Binární znaménko + a ·. Potřebují hodnotu před sebou.
   * @param {'+'|'*'} op
   */
  function pressOp(op) {
    if (op !== '+' && op !== '*') {
      return blocked('Tuhle operaci neznám.');
    }
    if (!isValueEnd(last())) {
      return blocked('Znaménko patří až za číslo, x nebo závorku.');
    }
    cells.push({ kind: 'op', op });
    return added;
  }

  /**
   * Minus: za hodnotou binární, na začátku strany (nebo za otevřenou
   * závorkou) unární - tak jde napsat záporné číslo i '-x'.
   */
  function pressMinus() {
    const cell = last();
    if (isValueEnd(cell)) {
      cells.push({ kind: 'op', op: '-' });
      return added;
    }
    if (cell === null || cell.kind === 'eq' || cell.kind === 'lparen') {
      cells.push({ kind: 'op', op: '-' });
      return added;
    }
    return blocked('Znaménko patří až za číslo, x nebo závorku.');
  }

  /** Otevřená závorka - na začátku, za znaménkem nebo za číslem (2(x+1)). */
  function pressLparen() {
    const cell = last();
    // 'x(' a ')(' by bylo x·(...) nebo (...)·(...) - mimo rovnicovou hru.
    if (cell && (cell.kind === 'x' || cell.kind === 'rparen')) {
      return blocked('Závorku napiš na začátek, za znaménko nebo za číslo.');
    }
    cells.push({ kind: 'lparen' });
    return added;
  }

  /** Zavřená závorka - jen když je co zavírat a uvnitř je hodnota. */
  function pressRparen() {
    if (openParens() <= 0) {
      return blocked('Nejdřív závorku otevři.');
    }
    if (!isValueEnd(last())) {
      return blocked('Před zavřenou závorkou musí být číslo nebo x.');
    }
    cells.push({ kind: 'rparen' });
    return added;
  }

  /**
   * Zlomková čára: za číslem začne psát jmenovatele ('1/4'), za x taktéž
   * ('x/4' - klávesnice ho sestaví jako zlomek x lomeno 4, tokeny x, /, 4).
   */
  function pressFractionBar() {
    const cell = last();
    if (!cell || (cell.kind !== 'num' && cell.kind !== 'x')) {
      return blocked('Zlomek potřebuje čitatele - napiš nejdřív číslo nebo x.');
    }
    if (cell.d !== undefined) {
      return blocked('Zlomek už čáru má - dva zlomky v jednom čísle nejdou.');
    }
    cell.d = '';
    return added;
  }

  /**
   * Rovnítko. Klávesa '=' se po prvním použití do konce zápisu vypne -
   * dvě rovnítka za sebou nikdy nevzniknou.
   *
   * Rovnítko smí přijít jen za DOKONČENOU levou stranou. Backspace maže vždy
   * jen poslední znak, takže do levé strany se hráč po napsání '=' už nevrátí:
   * kdyby '=' prošlo za '2(x + 1' nebo za 'x +', vznikla by slepá ulička, ze
   * které vede jen mazání celého zbytku zápisu - a k tomu ještě protichůdné
   * hlášky (Hotovo hlásí chybějící závorku, klávesa ')' zároveň 'nejdřív
   * závorku otevři', protože ta otevřená zůstala na levé straně).
   */
  function pressEq() {
    if (eqUsed()) {
      return blocked('Rovnice má jen jedno rovnítko.');
    }
    if (cells.length === 0) {
      return blocked('Nejdřív napiš levou stranu rovnice.');
    }
    if (openParens() > 0) {
      return blocked('Nejdřív zavři závorku, teprve pak přijde rovnítko.');
    }
    const cell = last();
    if (cell && (cell.kind === 'num' || cell.kind === 'x') && cell.d === '') {
      return blocked('Dopiš jmenovatele zlomku, teprve pak přijde rovnítko.');
    }
    if (!isValueEnd(cell)) {
      return blocked('Rovnítko patří až za číslo, x nebo závorku.');
    }
    cells.push({ kind: 'eq' });
    return added;
  }

  /**
   * Smaže poslední znak. U rozpracovaného zlomku maže číslice jmenovatele,
   * pak zlomkovou čáru, pak číslice čitatele a teprve pak celou buňku.
   * Smazání rovnítka klávesu '=' zase zpřístupní.
   */
  function pressBackspace() {
    const cell = last();
    if (!cell) {
      return;
    }
    if ((cell.kind === 'num' || cell.kind === 'x') && cell.d !== undefined) {
      if (cell.d === '') {
        delete cell.d; // čára sama zmizí
        return;
      }
      cell.d = cell.d.slice(0, -1);
      return;
    }
    if (cell.kind === 'num') {
      cell.n = cell.n.slice(0, -1);
      if (cell.n === '') {
        cells.pop();
      }
      return;
    }
    cells.pop();
  }

  /**
   * Důvod, proč Hotovo (ještě) nejde odeslat, nebo null když je zápis
   * odeslatelný. Texty se ukazují u zablokovaného tlačítka Hotovo, takže
   * musí vždy říct KONKRÉTNĚ, co dopsat - nikdy neprozradí správnou rovnici.
   *
   * Gate je schválně stejně přísný jako u dlaždic (js/ui/tileBuilderModel.js):
   * obě strany neprázdné, každá končí hodnotou a má vyvážené závorky. Bez
   * toho by 'x = 2 +' nebo 'x + 7 = 2(3' došly až k parseru a hráč by dostal
   * jen 'tomu zápisu nerozumím'. Kvadratický zápis kontrolovat nemusíme -
   * ten blokuje už pressX a backspace maže jen z konce, takže nevznikne.
   */
  function submitHint() {
    if (cells.some((c) => (c.kind === 'num' || c.kind === 'x') && c.d === '')) {
      return HINT_INCOMPLETE_FRACTION;
    }
    const { left, right } = sides();
    if (!eqUsed() || left.length === 0 || right.length === 0) {
      return HINT_EMPTY_SIDE;
    }
    for (const sideCells of [left, right]) {
      if (openParensIn(sideCells) > 0) {
        return HINT_UNCLOSED_PAREN;
      }
      if (!isValueEnd(sideCells[sideCells.length - 1])) {
        return HINT_UNFINISHED;
      }
    }
    if (!cells.some((c) => c.kind === 'x')) {
      return HINT_NO_X;
    }
    return null;
  }

  /** Hotovo je povolené, až když submitHint nic nevrací. */
  function canSubmit() {
    return submitHint() === null;
  }

  /** Buňky jako tokeny pro parseEquation ('x/4' -> x, /, 4). */
  function getTokens() {
    const tokens = [];
    for (const cell of cells) {
      switch (cell.kind) {
        case 'num':
          // Nula ve jmenovateli není platný zlomkový token (parser by ho
          // odmítl jako neznámý), ale je to platné dělení nulou - pošleme ho
          // jako '3 / 0', ať hráč dostane stejné 'Nulou se nedělí.' jako u x/0.
          if (cell.d !== undefined && cell.d !== '' && Number(cell.d) === 0) {
            tokens.push({ kind: 'num', n: Number(cell.n) }, { kind: 'op', op: '/' }, { kind: 'num', n: 0 });
            break;
          }
          tokens.push({ kind: 'num', n: Number(cell.n), ...(cell.d ? { d: Number(cell.d) } : {}) });
          break;
        case 'x':
          tokens.push({ kind: 'x' });
          if (cell.d) {
            tokens.push({ kind: 'op', op: '/' }, { kind: 'num', n: Number(cell.d) });
          }
          break;
        default:
          tokens.push({ kind: cell.kind, ...(cell.op ? { op: cell.op } : {}) });
      }
    }
    return tokens;
  }

  /** Zápis pro zobrazení: 'x + 7 = 25', 'x/4 + 1/4 x = 5', rozpracované '3/'. */
  function getDisplayText() {
    const SYMBOLS = { '+': ' + ', '-': ' − ', '*': ' · ', eq: ' = ' };
    let text = '';
    cells.forEach((cell, index) => {
      switch (cell.kind) {
        case 'num':
          text += cell.n + (cell.d !== undefined ? `/${cell.d}` : '');
          break;
        case 'x':
          // Zlomek před x oddělíme mezerou ('1/4 x'), celé číslo ne ('4x').
          if (index > 0 && cells[index - 1].kind === 'num' && cells[index - 1].d) {
            text += ' ';
          }
          text += 'x' + (cell.d !== undefined ? `/${cell.d}` : '');
          break;
        case 'op': {
          // Unární znaménko (začátek zápisu, začátek pravé strany, hned za
          // otevřenou závorkou) se lepí k operandu: '−3', 'x = −5',
          // '2(−x + 4)'. Rozhoduje předchozí buňka, ne délka celého zápisu -
          // podle té by za rovnítkem vznikla dvojitá mezera.
          const prev = index > 0 ? cells[index - 1] : null;
          const unary = prev === null || prev.kind === 'eq' || prev.kind === 'lparen';
          text += unary ? SYMBOLS[cell.op].trim() : SYMBOLS[cell.op];
          break;
        }
        case 'eq':
          text += SYMBOLS.eq;
          break;
        default:
          text += cell.kind === 'lparen' ? '(' : ')';
      }
    });
    return text;
  }

  /** Snímek stavu pro vykreslení (kopie - vnější kód stav nemutuje). */
  function getState() {
    return {
      cells: cells.map((c) => ({ ...c })),
      displayText: getDisplayText(),
      eqUsed: eqUsed(),
      canSubmit: canSubmit(),
      submitHint: submitHint(),
    };
  }

  return {
    pressDigit,
    pressX,
    pressOp,
    pressMinus,
    pressLparen,
    pressRparen,
    pressFractionBar,
    pressEq,
    pressBackspace,
    canSubmit,
    submitHint,
    getTokens,
    getDisplayText,
    getState,
  };
}
