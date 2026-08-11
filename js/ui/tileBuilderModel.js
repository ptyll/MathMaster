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
 * sebe, 'x x', závorka bez otevření, ...), takže 'unparseable' z parseru
 * prakticky nenastane. Dělení v paletě není - slovní úlohy obtížnosti 1-3
 * (x + a = b, x - a = b, ax + b = c) ho nepotřebují; implicitní násobení
 * '4x' parser zvládne (stejně jako '4 · x').
 *
 * Výstupem je seznam tokenů přesně dle kontraktu js/content/equationParse.js:
 * [tokeny levé strany..., { kind: 'eq' }, tokeny pravé strany...] - jediným
 * konzumentem je parseEquation().
 */

/** Kolik číslic může mít jedno číslo (stejný limit jako číselná klávesnice). */
export const MAX_NUM_DIGITS = 4;

const SIDES = Object.freeze(['left', 'right']);

/** Buňka, za kterou může následovat znaménko nebo zavřená závorka. */
const isValueEnd = (cell) => cell && (cell.kind === 'x' || cell.kind === 'num' || cell.kind === 'rparen');

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
        if (last && (last.kind === 'x' || last.kind === 'rparen')) {
          return { status: 'blocked', note: 'Dvě x vedle sebe nedávají smysl - polož mezi ně znaménko.' };
        }
        cells.push({ kind: 'x' });
        return { status: 'added' };
      case '+':
      case '-':
      case '*':
        // Znaménko potřebuje operand před sebou - jinak by vzniklo '++'
        // nebo strana začínající znaménkem.
        if (!isValueEnd(last)) {
          return { status: 'blocked', note: 'Znaménko patří až za číslo, x nebo závorku.' };
        }
        cells.push({ kind: 'op', op: symbol });
        return { status: 'added' };
      case '(':
        // '2(' je implicitní násobení 2·(x + 1) - povolíme. 'x(' a ')('
        // by bylo x·(...) nebo (...)·(...) - to je mimo rovnicovou hru.
        if (last && (last.kind === 'x' || last.kind === 'rparen')) {
          return { status: 'blocked', note: 'Závorku polož na začátek, za znaménko nebo za číslo.' };
        }
        cells.push({ kind: 'lparen' });
        return { status: 'added' };
      case ')': {
        if (openParens(cells) <= 0) {
          return { status: 'blocked', note: 'Nejdřív závorku otevři.' };
        }
        if (!isValueEnd(last)) {
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
    if (last && (last.kind === 'x' || last.kind === 'rparen')) {
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
   * Hotovo je povolené, až když jsou obě strany neprázdné a každá z nich
   * tvoří úplný výraz - končí hodnotou (x, číslo, ')') a má vyvážené
   * závorky. Strana končící znaménkem nebo s neuzavřenou závorkou by
   * v parseEquation skončila 'unparseable', což má u dlaždic prakticky
   * nenastat - submit gate to proto vyloučí už tady (removeCell může
   * takový stav vytvořit, dokud hráč stranu nedokončí, Hotovo je mimo hru).
   */
  function canSubmit() {
    return SIDES.every((name) => {
      const cells = sides[name];
      return cells.length > 0 && isValueEnd(lastCell(cells)) && openParens(cells) === 0;
    });
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
    };
  }

  return {
    pressTile,
    pressDigit,
    removeCell,
    clearSide,
    setActiveSide,
    canSubmit,
    getTokens,
    getState,
  };
}
