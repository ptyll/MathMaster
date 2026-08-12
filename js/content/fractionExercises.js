/**
 * Generátor úloh se zlomky (UCN-MATH-003).
 * Druhy: compare | add | subtract | simplify | expand | equivalent.
 * Jmenovatele do 12, výsledky vždy v základním tvaru.
 * Kroky řešení jsou datová struktura (stejný tvar jako u rovnic).
 */

import { createPrng } from './prng.js';
import {
  makeFraction,
  addFractions,
  subtractFractions,
  compareFractions,
  gcd,
  lcm,
  formatNumber,
} from './fractions.js';

/** Náhodný zlomek v základním tvaru, jmenovatel minD..maxD, hodnota < 1 (nebo i >= 1). */
function randomFraction(prng, maxD = 12, allowImproper = false, minD = 2) {
  for (let tries = 0; tries < 50; tries++) {
    const d = prng.int(minD, maxD);
    const n = prng.int(1, allowImproper ? 2 * d : d - 1);
    const f = makeFraction(n, d);
    // Mez se testuje AŽ PO zkrácení: z 3/6 je 1/2, takže losovaný jmenovatel
    // ještě nic negarantuje. Pro výchozí minD = 2 je to totéž co dřív.
    if (f.d >= minD) {
      return f;
    }
  }
  return makeFraction(1, 2);
}

/**
 * Krátící (rozšiřující) číslo pro stupně 4-6. Na 1-3 je vždy 2-6, tedy uvnitř
 * malé násobilky, kterou dítě zkouší jako první; tady začíná nad ní a s každým
 * stupněm roste, takže se stupně liší i mezi sebou, nejen proti trojce.
 */
const HARDER_FACTOR = Object.freeze({ 4: [7, 8], 5: [9, 10], 6: [11, 12] });

/**
 * Horní mez jmenovatele základního zlomku na stupních 4-6 - STEJNÁ jako na
 * 1-3. Zúžit ji by znamenalo, že vyšší stupeň losuje z MENŠÍHO prostoru než
 * nižší: obtížnost už nese krátící číslo (7-12, mimo malou násobilku) a pásmo
 * jmenovatelů k ní nemá co přidávat.
 */
const HARDER_BASE_MAX = () => 12;

/**
 * Nejvyšší jmenovatel, který smí skončit ve ZLOMKOVÉM PÁSU (UCV-LEARN-001).
 * NENÍ to obrana proti neplatnému SVG - tu má od téhle chvíle sama komponenta
 * (js/ui/fractionVisuals.js kreslí nad 24 dílků poměrově místo přihrádkově).
 * Je to vizuální OBÁLKA: 72 je strop, ve kterém se drží obsah stupňů 1-3
 * (equivalent 72, add/sub 60; jen compare z nich vybočuje až na 132), takže
 * nové stupně si nenastavují vlastní měřítko obrázku. Generátor o šířce
 * v pixelech vědět nemá, proto tu žádný pixel není.
 */
const MAX_BAR_DENOMINATOR = 72;

/**
 * Dvojice (základní zlomek, násobitel) pro rozšiřování na stupních 4-6.
 * Stupeň nese CÍLOVÝ JMENOVATEL: na 1-3 nepřesáhne 24, tady se pásma zvedají
 * a nikdy nepřelezou strop pásu. Vyjmenované, ne losované s odmítáním - úzká
 * podmínka a losování je kombinace, po které se ze zálohy stane hlavní zdroj.
 */
function expansionPairs([min, max]) {
  const pairs = [];
  for (let d = 2; d <= 12; d++) {
    for (let n = 1; n < d; n++) {
      const f = makeFraction(n, d);
      if (f.d !== d) {
        continue;
      }
      for (let k = 2; k <= 24; k++) {
        if (d * k >= min && d * k <= max) {
          pairs.push([f, k]);
        }
      }
    }
  }
  return Object.freeze(pairs);
}

/** Dvojice pro doplňování chybějícího čísla: násobitel z pásma, cíl pod stropem pásu. */
function equivalentPairs([minFactor, maxFactor]) {
  const pairs = [];
  for (let k = minFactor; k <= maxFactor; k++) {
    for (let d = 2; d <= Math.floor(MAX_BAR_DENOMINATOR / k); d++) {
      for (let n = 1; n < d; n++) {
        const f = makeFraction(n, d);
        if (f.d === d) {
          pairs.push([f, k]);
        }
      }
    }
  }
  return Object.freeze(pairs);
}

const EQUIVALENT_PAIRS = Object.freeze({
  4: equivalentPairs(HARDER_FACTOR[4]),
  5: equivalentPairs(HARDER_FACTOR[5]),
  6: equivalentPairs(HARDER_FACTOR[6]),
});

const EXPANSION_PAIRS = Object.freeze({
  4: expansionPairs([25, 40]),
  5: expansionPairs([41, 56]),
  6: expansionPairs([57, MAX_BAR_DENOMINATOR]),
});

/** Jak těsně u sebe mají být zlomky k porovnání: nejvýš 1/limit. */
const CLOSENESS = Object.freeze({ 4: 24, 5: 32, 6: 48 });

/**
 * Dvojice různých zlomků, které se liší nejvýš o 1/limit a mají různé jmenovatele.
 * Porovnat je od oka nejde - to je přesně ta dovednost, kterou má vyšší stupeň
 * chtít. Losování s odmítáním, deterministické jako všude jinde.
 */
function closePairs(limit) {
  const pairs = [];
  for (let dx = 2; dx <= 12; dx++) {
    for (let nx = 1; nx < dx; nx++) {
      const x = makeFraction(nx, dx);
      if (x.d !== dx) {
        continue;
      }
      for (let dy = 2; dy <= 12; dy++) {
        for (let ny = 1; ny < dy; ny++) {
          const y = makeFraction(ny, dy);
          const distance = Math.abs(x.n * y.d - y.n * x.d); // |x - y| = distance / (x.d * y.d)
          if (
            y.d === dy &&
            x.d !== y.d &&
            distance !== 0 &&
            distance * limit <= x.d * y.d &&
            lcm(x.d, y.d) <= MAX_BAR_DENOMINATOR
          ) {
            pairs.push([x, y]);
          }
        }
      }
    }
  }
  return Object.freeze(pairs);
}

const CLOSE_PAIRS = Object.freeze({
  4: closePairs(CLOSENESS[4]),
  5: closePairs(CLOSENESS[5]),
  6: closePairs(CLOSENESS[6]),
});

/** Celá část a zbytek nepravého zlomku, česky: '7/4' -> 'jeden celý a 3/4'. */
function describeImproper(f) {
  const wholes = Math.floor(f.n / f.d);
  const rest = f.n - wholes * f.d;
  const wholeText =
    wholes === 1 ? 'jeden celý' : `${wholes} ${wholes < 5 ? 'celé' : 'celých'}`;
  return rest === 0 ? wholeText : `${wholeText} a ${rest}/${f.d}`;
}

/**
 * Nápověda ke sčítání a odčítání. Jmenuje novinku daného stupně: celé číslo
 * (stupeň 4) nebo nepravý operand (stupně 5 a 6). Bez toho by dítě na vyšším
 * stupni dostalo přesně týž text jako na trojce.
 */
function addSubHint(a, b) {
  // Postup se říká až za novinkou: se stejnými jmenovateli se nehledá společný
  // jmenovatel, ale nepravý operand tam pořád JE a musí zaznít - jinak by
  // '7/5 + 1/5' na stupni 5 dostalo tutéž větu jako '1/5 + 2/5' na jedničce.
  const howTo =
    a.d === b.d
      ? 'Jmenovatele jsou stejné, stačí pracovat s čitateli.'
      : 'Najdi společného jmenovatele (nejmenší společný násobek obou jmenovatelů).';

  const whole = [a, b].find((f) => f.d === 1);
  if (whole) {
    return `Celé číslo se dá napsat jako zlomek: ${whole.n} = ${whole.n}/1. ${howTo}`;
  }
  const improper = [a, b].find((f) => f.n > f.d);
  if (improper) {
    return `${formatNumber(improper)} je víc než celek: ${describeImproper(improper)}. Počítá se s ním stejně jako s každým jiným zlomkem. ${howTo}`;
  }
  return a.d === b.d ? 'Jmenovatele jsou stejné - stačí pracovat s čitateli.' : `Nejdřív ${howTo.charAt(0).toLowerCase()}${howTo.slice(1)}`;
}

/** Vyjde součet/rozdíl mimo základní tvar, tedy s krokem 'Zkrať'? */
function needsReducing(a, b, kind) {
  const common = lcm(a.d, b.d);
  const aN = a.n * (common / a.d);
  const bN = b.n * (common / b.d);
  const combined = kind === 'add' ? aN + bN : aN - bN;
  return combined !== 0 && gcd(Math.abs(combined), common) > 1;
}

/**
 * VYJMENOVANÉ dvojice pro stupeň 6: nepravý první operand, různé jmenovatele
 * se společným dělitelem a výsledek, který jde zkrátit. Podmínka je tak úzká,
 * že losování s odmítáním ji netrefí spolehlivě - záloha by se stala hlavním
 * zdrojem a čtvrtina všech šestek by byl JEDEN tvar. Tabulka se počítá z týchž
 * podmínek, jaké kontroluje improperPair, aby nemohla utéct definici stupně.
 */
function reducingImproperPairs(kind) {
  const pairs = [];
  // Jmenovatel nepravého operandu až 12 a společný jmenovatel do 40: širší než
  // u losování (kde ho držel strop 8/36), protože vyjmenovaná tabulka nesmí být
  // úzká - pestrost NEJVYŠŠÍHO stupně je to, co tahle fáze hlídá.
  for (let d = 2; d <= 12; d++) {
    for (let n = d + 1; n <= 2 * d; n++) {
      const a = makeFraction(n, d);
      if (a.d !== d) {
        continue; // po zkrácení už to není zlomek s tímhle jmenovatelem
      }
      for (let e = 2; e <= 12; e++) {
        for (let m = 1; m < e; m++) {
          const b = makeFraction(m, e);
          const result = kind === 'add' ? addFractions(a, b) : subtractFractions(a, b);
          if (
            b.d === e &&
            a.d !== b.d &&
            gcd(a.d, b.d) > 1 &&
            lcm(a.d, b.d) <= 40 &&
            result.d > 1 &&
            needsReducing(a, b, kind)
          ) {
            pairs.push([a, b]);
          }
        }
      }
    }
  }
  return Object.freeze(pairs);
}

const REDUCING_IMPROPER_PAIRS = Object.freeze({
  add: reducingImproperPairs('add'),
  subtract: reducingImproperPairs('subtract'),
});

/**
 * Dvojice operandů, kde PRVNÍ je nepravý zlomek (čitatel > jmenovatel).
 * Druhý zůstává menší než celek, takže odčítání nikdy nedá záporný výsledek.
 * Losuje se s odmítáním: je to deterministické (týž seed = tytéž pokusy) a
 * čitelnější než dopočítávat operandy pozpátku z výsledku. Užší podmínku
 * (stupeň 6) takhle losovat NELZE - tam se ze zálohy stane hlavní zdroj,
 * proto má vyjmenovanou tabulku.
 */
function improperPair(prng, kind, second) {
  for (let tries = 0; tries < 60; tries++) {
    const a = randomFraction(prng, 8, true);
    const b = second();
    const result = kind === 'add' ? addFractions(a, b) : subtractFractions(a, b);
    if (
      a.n > a.d &&            // opravdu nepravý, ne jen zlomek s velkým čitatelem
      lcm(a.d, b.d) <= 36 &&  // společný jmenovatel, který dítě uveze
      result.d > 1            // '7/4 - 3/4 = 1' by novinku smazalo
    ) {
      return [a, b];
    }
  }
  // Záloha pro nepovedený los. Podmínka stupně 5 je široká (stačí nepravý
  // první operand), takže vyčerpat 60 pokusů je výjimečné - a tenhle tvar
  // stejně vychází i normálním losem, takže se ze zálohy nestane hlavní zdroj.
  // U užší podmínky to neplatí, viz REDUCING_IMPROPER_PAIRS.
  return [makeFraction(3, 2), makeFraction(5, 6)];
}

/**
 * Kroky pro sčítání/odčítání zlomků včetně společného jmenovatele.
 * Od stupně 4 nesou navíc větu o přesahu celku - tam je to nová myšlenka.
 * Na stupních 1-3 se text NESMÍ pohnout: nepravý výsledek tam vychází běžně
 * (necelá čtvrtina příkladů) a rozšíření nemá měnit, co dítě zná.
 */
function addSubSteps(a, b, operation, difficulty) {
  const steps = [];
  const common = lcm(a.d, b.d);
  const aN = a.n * (common / a.d);
  const bN = b.n * (common / b.d);

  if (a.d !== b.d) {
    steps.push({
      operation: `Najdi společného jmenovatele: ${common}`,
      leftSide: `${formatNumber(a)} ${operation} ${formatNumber(b)}`,
      rightSide: `${aN}/${common} ${operation} ${bN}/${common}`,
      explanation: `Zlomky rozšíříme tak, aby měly stejného jmenovatele (${common}). Rozšířit zlomek znamená vynásobit čitatele i jmenovatele stejným číslem - hodnota se nezmění.`,
    });
  }

  const resultN = operation === '+' ? aN + bN : aN - bN;
  steps.push({
    operation: `${operation === '+' ? 'Sečti' : 'Odečti'} čitatele`,
    leftSide: `${aN}/${common} ${operation} ${bN}/${common}`,
    rightSide: `${resultN}/${common}`,
    explanation: 'Jmenovatel zůstane stejný, pracujeme jen s čitateli.',
  });

  if (resultN === 0) {
    steps.push({
      operation: 'Výsledek je nula',
      leftSide: `0/${common}`,
      rightSide: '0',
      explanation: 'Nula děleno čímkoliv je nula - nula se nekrátí.',
    });
    return steps;
  }

  // Přesah celku řekneme i v krocích řešení - na rozdíl od hlášky v relaci
  // si nápovědu dítě otevře, kdy chce, a přečte si ji v klidu.
  const whole = (n, d) =>
    difficulty >= 4 && n > d
      ? ` Výsledek je větší než celek: ${Math.floor(n / d)} a k tomu ${n - Math.floor(n / d) * d}/${d}.`
      : '';

  const simplified = makeFraction(resultN, common);
  if (simplified.n !== resultN || simplified.d !== common) {
    const divisor = gcd(resultN, common);
    steps.push({
      operation: `Zkrať číslem ${divisor}`,
      leftSide: `${resultN}/${common}`,
      rightSide: formatNumber(simplified),
      explanation: `Výsledek vždy uvádíme v základním tvaru - čitatele i jmenovatele dělíme jejich největším společným dělitelem.${whole(simplified.n, simplified.d)}`,
    });
  } else {
    steps[steps.length - 1].explanation += whole(resultN, common);
  }

  return steps;
}

/**
 * @param {number} seed
 * @param {'compare'|'add'|'subtract'|'simplify'|'expand'|'equivalent'} kind
 * @param {number} difficulty 1-3 (1: stejní jmenovatelé, 2: jeden násobek druhého, 3: obecní)
 */
export function generateFractionExercise(seed, kind, difficulty = 1) {
  const prng = createPrng(seed);
  const base = { topic: 'fractions', kind, seed, difficulty };

  if (kind === 'compare') {
    let a = randomFraction(prng);
    let b = randomFraction(prng);
    if (difficulty >= 4) {
      // Zlomky tak blízko u sebe, že se nedají odhadnout okem - dítě je MUSÍ
      // převést na společného jmenovatele. Na stupních 1-3 se dvojice losuje
      // volně, takže tak těsná je jen zřídka.
      [a, b] = prng.pick(CLOSE_PAIRS[difficulty]).map((f) => ({ ...f }));
    } else if (compareFractions(a, b) === 0) {
      b = makeFraction(b.n + 1, b.d);
    }
    const common = lcm(a.d, b.d);
    const answer = compareFractions(a, b) > 0 ? 'left' : 'right';
    const steps = [];
    if (a.d !== b.d) {
      steps.push({
        operation: `Převeď na společného jmenovatele ${common}`,
        leftSide: formatNumber(a),
        rightSide: formatNumber(b),
        explanation: `${formatNumber(a)} = ${a.n * (common / a.d)}/${common} a ${formatNumber(b)} = ${b.n * (common / b.d)}/${common}. Větší je ten s větším čitatelem.`,
      });
    }
    steps.push({
      operation: 'Výsledek',
      leftSide: a.d !== b.d ? `${a.n * (common / a.d)}/${common}` : formatNumber(a),
      rightSide: a.d !== b.d ? `${b.n * (common / b.d)}/${common}` : formatNumber(b),
      explanation:
        a.d !== b.d
          ? `Větší je ${answer === 'left' ? formatNumber(a) : formatNumber(b)}.`
          : `Jmenovatele jsou stejné, stačí porovnat čitatele. Větší je ${answer === 'left' ? formatNumber(a) : formatNumber(b)}.`,
    });
    return {
      ...base,
      text: `Který zlomek je větší: ${formatNumber(a)} nebo ${formatNumber(b)}?`,
      answer: { kind: 'choice', value: answer, options: [formatNumber(a), formatNumber(b)] },
      steps,
      hint: 'Zlomky s rozdílnými jmenovateli nejdřív převeď na společného jmenovatele - pak stačí porovnat čitatele.',
    };
  }

  if (kind === 'add' || kind === 'subtract') {
    let a;
    let b;
    if (difficulty <= 1) {
      const d = prng.int(2, 12);
      a = makeFraction(prng.int(1, d - 1), d);
      b = makeFraction(prng.int(1, d - 1), d);
    } else if (difficulty === 2) {
      const d = prng.pick([2, 3, 4, 6]);
      const d2 = d * prng.int(2, Math.floor(12 / d));
      a = makeFraction(prng.int(1, d - 1), d);
      b = makeFraction(prng.int(1, d2 - 1), d2);
    } else if (difficulty === 3) {
      // obecní jmenovatelé, ale společný jmenovatel držíme rozumně malý
      let tries = 0;
      do {
        a = randomFraction(prng);
        b = randomFraction(prng);
        tries++;
      } while (lcm(a.d, b.d) > 60 && tries < 50);
      if (lcm(a.d, b.d) > 60) {
        a = makeFraction(1, 3);
        b = makeFraction(1, 4);
      }
    } else if (difficulty === 4) {
      // Celé číslo se zlomkem. Nová myšlenka: celek se dá napsat jako zlomek,
      // takže 2 - 3/4 je po přepisu 8/4 - 3/4. Na stupních 1-3 se celý operand
      // neobjeví ani jednou (randomFraction drží jmenovatele >= 2).
      a = makeFraction(prng.int(2, 5));
      b = randomFraction(prng);
    } else if (difficulty === 5) {
      // Nepravý operand: poprvé se počítá se zlomkem VĚTŠÍM než celek.
      // allowImproper existuje od začátku a nikdy se nepoužil (0 % na 1-3).
      [a, b] = improperPair(prng, kind, () => randomFraction(prng, 12));
    } else {
      // Nepravý operand A jmenovatelé se společným dělitelem, takže výsledek
      // jde vždycky zkrátit. Krok 'Zkrať' dnes s obtížností naopak UBÝVÁ,
      // takže tohle je i oprava, ne jen ztížení.
      [a, b] = prng.pick(REDUCING_IMPROPER_PAIRS[kind]).map((f) => ({ ...f }));
    }
    if (kind === 'subtract' && compareFractions(a, b) < 0) {
      [a, b] = [b, a];
    }
    const operation = kind === 'add' ? '+' : '-';
    const result = kind === 'add' ? addFractions(a, b) : subtractFractions(a, b);
    return {
      ...base,
      text: `Vypočítej: ${formatNumber(a)} ${operation} ${formatNumber(b)}`,
      answer: { kind: 'fraction', n: result.n, d: result.d },
      steps: addSubSteps(a, b, operation, difficulty),
      // Operandy pro krokové řešení (UCV-STEP-002) - UI je nesmí tahat z textu.
      operands: [{ ...a }, { ...b }],
      // Nápověda pojmenuje to, co je na příkladu NOVÉ. U celého čísla i u
      // nepravého zlomku je novinka v OPERANDU, ne ve výsledku: 4/3 - 1/2
      // má nepravý operand, ale výsledek pod celkem, takže vázat vysvětlení
      // na výsledek by dítě u odčítání nechalo bez jediného slova navíc.
      hint: addSubHint(a, b),
    };
  }

  if (kind === 'simplify') {
    // Na 4-6 je krátící číslo 7-12, tedy mimo malou násobilku, kterou dítě
    // zkouší jako první. Na stupních 1-3 je vždy 2-6, takže se nepotkají.
    // Jmenovatel 2 je z vyšších stupňů vyloučený: dal by tvar n/2n ('12/24'),
    // tedy 'zkrať na polovinu' - nejlehčí možné krácení na nejtěžším stupni.
    const f =
      difficulty >= 4
        ? randomFraction(prng, HARDER_BASE_MAX(), false, 3)
        : randomFraction(prng, 12);
    const k = difficulty >= 4 ? prng.int(...HARDER_FACTOR[difficulty]) : prng.int(2, 6);
    const given = { n: f.n * k, d: f.d * k };
    return {
      ...base,
      text: `Zkrať do základního tvaru: ${given.n}/${given.d}`,
      answer: { kind: 'fraction', n: f.n, d: f.d },
      steps: [
        {
          operation: `Najdi největšího společného dělitele: ${k}`,
          leftSide: `${given.n}/${given.d}`,
          rightSide: formatNumber(f),
          explanation: `Číslem ${k} vydělíme čitatele i jmenovatele: ${given.n} : ${k} = ${f.n}, ${given.d} : ${k} = ${f.d}.`,
        },
      ],
      // Rada "zkus 2, 3, 5" platí na stupních 1-3 v 58,8 % případů, ale od
      // stupně 4 je dělitel vždy z HARDER_FACTOR, tedy 7-12 - tam by neplatila
      // ANI JEDNOU. Nápověda, která vypadá, že pomáhá, a neukazuje nic, je
      // horší než mlčení: dítě, kterému to nejde, po ní rozumně usoudí, že to
      // neumí. Pásmo šesti čísel odpověď neprozradí, jen řekne, kde hledat.
      hint:
        difficulty >= 4
          ? 'Hledej číslo, kterým jde vydělit čitatele i jmenovatele beze zbytku. Tenhle dělitel je mimo malou násobilku - zkus 7, 8, 9, 10, 11 nebo 12.'
          : 'Hledej číslo, kterým jde vydělit čitatele i jmenovatele beze zbytku. Zkus 2, 3, 5...',
    };
  }

  if (kind === 'expand') {
    // Na 1-3 vyjde cílový jmenovatel nejvýš 24 (jmenovatel krát nejvýš dvojnásobek
    // toho, kolikrát se vejde do 12). Na 4-6 se pásma zvedají nad to, takže cíl
    // nejde uhodnout ze zvyku - a zároveň zůstávají pod stropem zlomkového pásu.
    const [f, k] =
      difficulty >= 4
        ? prng.pick(EXPANSION_PAIRS[difficulty])
        : [randomFraction(prng), 0];
    const factor = difficulty >= 4 ? k : prng.int(2, Math.max(2, Math.floor(12 / f.d) * 2));
    const target = { n: f.n * factor, d: f.d * factor };
    return {
      ...base,
      text: `Rozšiř zlomek ${formatNumber(f)} na jmenovatele ${target.d}`,
      answer: { kind: 'fraction', n: target.n, d: target.d },
      steps: [
        {
          operation: `Vynásob čitatele i jmenovatele ${factor}`,
          leftSide: formatNumber(f),
          rightSide: `${target.n}/${target.d}`,
          explanation: `${target.d} : ${f.d} = ${factor}, takže násobíme ${factor}. Rozšíření zlomku nemění jeho hodnotu.`,
        },
      ],
      hint: `Spočítej, kolikrát se ${f.d} vejde do ${target.d} - tím číslem pak vynásob čitatele.`,
    };
  }

  // equivalent: 1/2 = ?/8 nebo ?/6 = 2/3
  // Znak stupně je NÁSOBITEL: na 1-3 je vždy 2-6, tady 7-12. Základ se k němu
  // dopočítá tak, aby cíl zůstal pod stropem zlomkového pásu.
  const [f, k] =
    difficulty >= 4
      ? prng.pick(EQUIVALENT_PAIRS[difficulty])
      : [randomFraction(prng, 12), prng.int(2, 6)];
  const target = { n: f.n * k, d: f.d * k };
  const missingLeft = prng.next() < 0.5;
  return {
    ...base,
    text: missingLeft
      ? `Doplň chybějící číslo: ?/${target.d} = ${formatNumber(f)}`
      : `Doplň chybějící číslo: ${formatNumber(f)} = ?/${target.d}`,
    answer: { kind: 'int', value: target.n },
    steps: [
      {
        operation: `Rozšiř ${formatNumber(f)} číslem ${k}`,
        leftSide: formatNumber(f),
        rightSide: `${target.n}/${target.d}`,
        explanation: `${target.d} : ${f.d} = ${k}. Čitatele vynásobíme stejným číslem: ${f.n} × ${k} = ${target.n}.`,
      },
    ],
    hint: `Podívej se na jmenovatele: ${target.d} : ${f.d} = ?  Stejným číslem pak vynásob čitatele.`,
  };
}
