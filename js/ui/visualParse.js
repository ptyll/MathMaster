/**
 * Parsování textových stran rovnice pro vizualizace (váha, osa).
 * Čisté funkce - testovatelné v nodu. Formáty pochází ze solveru
 * (formatExpr): '3x + 4', 'x', '-x', '(2/3)x - 1/2', '7', '-3', '0'.
 */

/**
 * Rozparsuje stranu rovnice na x-člen a konstantu.
 * @returns {{xTerm: null | {count: number, label: string}, constantText: string|null, negative: boolean}}
 *   count = počet pytlíků (u zlomkového koeficientu 1 pytlík s popiskem),
 *   constantText = text konstanty včetně znaménka ('4', '-5'), null = žádná
 */
export function parseSide(text) {
  const trimmed = text.trim();
  const result = { xTerm: null, constantText: null, negative: false };

  // čistá konstanta (číslo nebo zlomek, případně záporné)
  let m = trimmed.match(/^(-?\d+|-?\d+\/\d+)$/);
  if (m) {
    result.constantText = m[1];
    result.negative = m[1].startsWith('-');
    return result;
  }

  // x-člen: 'x', '-x', '3x', '(2/3)x' + volitelná konstanta
  m = trimmed.match(/^(-?)(\d*)x(?:\s*([+-])\s*(.+))?$/) ?? trimmed.match(/^(\(\d+\/\d+\))x(?:\s*([+-])\s*(.+))?$/);
  if (!m) {
    return result; // neznámý tvar - nic nekreslíme
  }

  if (m[0].startsWith('(')) {
    result.xTerm = { count: 1, label: `${m[1]}x` };
    result.constantText = m[3] ? (m[2] === '-' ? `-${m[3]}` : m[3]) : null;
  } else {
    const sign = m[1] === '-' ? -1 : 1;
    const count = m[2] === '' ? 1 : parseInt(m[2], 10);
    const xLabel = count === 1 ? 'x' : `${count}x`;
    result.xTerm = { count: Math.max(1, count), label: sign === -1 ? `-${xLabel}` : xLabel };
    result.negative = sign === -1;
    result.constantText = m[4] ? (m[3] === '-' ? `-${m[4]}` : m[4]) : null;
    if (result.constantText === '0') {
      result.constantText = null;
    }
  }
  return result;
}

/** Obsahuje některá strana některého kroku záporné číslo? Pak váhu vystřídá číselná osa. */
export function stepsHaveNegatives(steps) {
  return steps.some((s) => /(^|\s)-\d/.test(s.leftSide) || /(^|\s)-\d/.test(s.rightSide));
}

/** Vytáhne z textu všechny zlomky/čísla jako {n, d} pole (pro zlomkové pásy). */
export function extractFractions(text) {
  const found = [];
  for (const m of text.matchAll(/(-?\d+)(?:\/(\d+))?/g)) {
    found.push({ n: parseInt(m[1], 10), d: m[2] ? parseInt(m[2], 10) : 1 });
  }
  return found;
}

/**
 * Vybere režim vizualizace pro příklad.
 * 'bars' = zlomkové pásy (úlohy se zlomky),
 * 'numberline' = číselná osa (záporná čísla),
 * 'balance' = rovnoramenná váha (výchozí pro rovnice).
 */
export function pickVisualization(exercise) {
  if (exercise.topic === 'fractions') {
    return 'bars';
  }
  if (stepsHaveNegatives(exercise.steps)) {
    return 'numberline';
  }
  return 'balance';
}
