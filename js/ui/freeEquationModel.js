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
 * unární mínus. Hotovo je zablokované, dokud není na obou stranách aspoň
 * jeden člen, rovnice neobsahuje x ('Rovnice musí obsahovat x') nebo je
 * rozpracovaný zlomek bez jmenovatele.
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

/** Buňka, za kterou může následovat znaménko nebo zavřená závorka. */
const isValueEnd = (cell) =>
  cell &&
  (cell.kind === 'x' || cell.kind === 'num' || cell.kind === 'rparen') &&
  cell.d !== ''; // rozpracovaná zlomková čára hodnotu ještě neuzavírá

export function createFreeEquationModel() {
  const cells = [];

  const last = () => cells[cells.length - 1] ?? null;
  const eqUsed = () => cells.some((c) => c.kind === 'eq');

  /** Buňky aktuální strany (za posledním rovnítkem, nebo celý zápis). */
  const currentSide = () => {
    const eqIndex = cells.findLastIndex((c) => c.kind === 'eq');
    return eqIndex === -1 ? cells : cells.slice(eqIndex + 1);
  };

  /** Kolik závorek na AKTUÁLNÍ straně čeká na zavření. */
  const openParens = () =>
    currentSide().filter((c) => c.kind === 'lparen').length -
    currentSide().filter((c) => c.kind === 'rparen').length;

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
   * dvě rovnítka za sebou nikdy nevzniknou. Levá strana nesmí být prázdná.
   */
  function pressEq() {
    if (eqUsed()) {
      return blocked('Rovnice má jen jedno rovnítko.');
    }
    if (cells.length === 0) {
      return blocked('Nejdřív napiš levou stranu rovnice.');
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
   * odeslatelný. Texty se ukazují u zablokovaného tlačítka Hotovo.
   */
  function submitHint() {
    if (cells.some((c) => (c.kind === 'num' || c.kind === 'x') && c.d === '')) {
      return HINT_INCOMPLETE_FRACTION;
    }
    if (!eqUsed() || currentSide().length === 0) {
      return HINT_EMPTY_SIDE;
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
        case 'op':
          // Unární znaménko na začátku strany bez mezery před sebou ('− 3').
          text += text === '' ? SYMBOLS[cell.op].trimStart() : SYMBOLS[cell.op];
          break;
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
