/**
 * Testy modelu kaskády (test/cssCascade.js). Na tomhle souboru dnes stojí
 * záruky o omezeném pohybu, o čitelnosti a o rozložení - když mlčí on,
 * mlčí i ony, a nikdo se nedozví proč.
 *
 * Proč vznikly: `compound()` uměl ze selektoru vytáhnout jen třídy, typ a
 * pseudoelement. Selektor, který nemá ani jedno (`#app`, `[hidden]`, `:root`),
 * z toho vyšel jako 'bez omezení' a sedl na KAŽDÝ cíl. `#app{display:flex}`
 * má specificitu 10000 a `[hidden]{display:none!important}` je important,
 * takže přebily cokoliv a dotaz na display vracel jejich hodnotu. Testy pak
 * byly zelené i nad smazaným pravidlem - proto se tady měří i to, co model
 * odmítne, ne jen to, co spočítá.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseCss,
  parseDecls,
  specificity,
  compound,
  applies,
  mediaActive,
  resolveValue,
  animationName,
  resolveAnimation,
} from './cssCascade.js';

const cssText = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');

test('parseCss rozebere pravidla i s @media obalem, pořadím a komentáři', () => {
  const rules = parseCss(`
    /* .zakomentovany { display: none } */
    .a, .b { color: red; }
    @media (prefers-reduced-motion: reduce) {
      .a { color: blue; }
    }
    @keyframes pulse { from { opacity: 0 } to { opacity: 1 } }
  `);
  assert.deepEqual(
    rules.map((r) => r.selector),
    ['.a', '.b', '.a'],
    'seznam selektorů nesedí - buď se ztratila čárka, nebo prolezl @keyframes'
  );
  assert.deepEqual(rules[0].media, [], 'pravidlo mimo @media dostalo obal');
  assert.deepEqual(rules[2].media, ['@media (prefers-reduced-motion: reduce)']);
  assert.deepEqual(
    rules.map((r) => r.order),
    [0, 1, 2],
    'pořadí v souboru se neuchovalo - poslední slovo by měl kdokoliv'
  );
  assert.equal(rules[0].decls.get('color').value, 'red');
  // Komentář ani @keyframes se nesmí protlačit mezi pravidla: vnitřek
  // @keyframes vypadá jako selektory ('from', 'to') a udělal by z modelu guláš.
  assert.equal(
    rules.some((r) => r.selector.includes('zakomentovany') || ['from', 'to'].includes(r.selector)),
    false
  );
});

test('parseDecls odliší !important a nespadne na prázdném zápisu', () => {
  const decls = parseDecls('display: none !important; color: red; ; broken; margin:;');
  assert.equal(decls.get('display').value, 'none');
  assert.equal(decls.get('display').important, true);
  assert.equal(decls.get('color').value, 'red');
  assert.equal(decls.get('color').important, false);
  assert.equal(decls.has('broken'), false);
  assert.equal(decls.has('margin'), false, 'vlastnost bez hodnoty se tváří jako nastavená');
});

test('specificita se počítá po vrstvách jako v prohlížeči', () => {
  assert.equal(specificity('*'), 0, 'univerzální selektor specificitu nezvyšuje');
  assert.equal(specificity('div'), 1);
  assert.equal(specificity('div span'), 2);
  assert.equal(specificity('.a'), 100);
  assert.equal(specificity('[hidden]'), 100, 'atribut váží jako třída');
  assert.equal(specificity(':hover'), 100, 'pseudotřída váží jako třída');
  assert.equal(specificity('::before'), 1, 'pseudoelement váží jako typ');
  assert.equal(specificity('#app'), 10000);
  assert.equal(specificity('.a.b'), 200);
  assert.equal(specificity('#app .a div::after'), 10102);
  // Vrstvy se nesmí sčítat napříč: deset tříd nikdy nepřebije jedno id.
  assert.ok(specificity('#app') > specificity('.a'.repeat(10)));
  // Třídy s diakritikou jsou v téhle hře běžné (.crystal-bílý) a musí se
  // rozseknout celé - jinak by z ohryzku 'ílý' vypadl falešný typ navíc.
  assert.equal(specificity('.crystal-bílý'), 100);
  assert.equal(specificity('.crystal-žlutý.locked'), 200);
});

test('compound rozebere složku selektoru na části a přizná, čemu nerozumí', () => {
  assert.deepEqual(compound('.a.b'), {
    tag: null,
    universal: false,
    ids: [],
    classes: ['a', 'b'],
    attrs: [],
    pseudoClasses: [],
    pseudoEl: null,
    unknown: null,
  });
  assert.equal(compound('#app').ids[0], '#app');
  assert.equal(compound('[hidden]').attrs[0], '[hidden]');
  assert.equal(compound(':root').pseudoClasses[0], ':root');
  assert.equal(compound('*').universal, true);
  assert.equal(compound('input.field:disabled::before').tag, 'input');
  assert.deepEqual(compound('input.field:disabled::before').pseudoClasses, [':disabled']);
  assert.equal(compound('input.field:disabled::before').pseudoEl, '::before');
  assert.equal(compound('.crystal-bílý').classes[0], 'crystal-bílý', 'třída s diakritikou se ořízla');
  // Uvozovky v atributu jsou zápis, ne význam.
  assert.deepEqual(compound(`[aria-pressed='true']`).attrs, compound('[aria-pressed="true"]').attrs);
  // A co se rozebrat nedá, to se přizná - tady začínala celá vada.
  assert.equal(compound('.a %%%').unknown?.trim(), '%%%');
  assert.ok(compound('').unknown, 'prázdná složka se tváří jako "bez omezení"');
});

test('selektor bez třídy a bez typu nesmí sednout na cokoliv', () => {
  // Jádro vady: `#app`, `[hidden]`, `:root` ani `.a[hidden]` nemají třídu
  // ani typ. Když se z nich vyčte 'žádné omezení', platí na každý prvek.
  for (const rule of ['#app', '[hidden]', ':root', '.a[hidden]', '.a:hover', 'div']) {
    assert.equal(applies(rule, '.confetti'), false, `${rule} sedl na .confetti, kde nemá co dělat`);
  }
  // A naopak: na svůj vlastní cíl sednout musí, jinak by model jen mlčel.
  assert.equal(applies('#app', '#app'), true);
  assert.equal(applies('[hidden]', '.planet-detail[hidden]'), true);
  assert.equal(applies(':root', ':root'), true);
  assert.equal(applies('.a:hover', '.a:hover'), true);
  // Univerzální selektor je jediný, který smí platit všude - je to jeho práce.
  assert.equal(applies('*', '.confetti'), true);
  assert.equal(applies('*::before', '.confetti::before'), true);
  assert.equal(applies('*::before', '.confetti'), false, 'pravidlo pro ::before se svezlo na prvek sám');
});

test('applies drží úzký model: třídy podmnožinou, pseudoelement a předci sedí', () => {
  assert.equal(applies('.a', '.a.b'), true, 'pravidlo na .a neplatí na prvek s .a i .b');
  assert.equal(applies('.a.b', '.a'), false, 'pravidlo chtělo dvě třídy a stačila mu jedna');
  assert.equal(applies('div.a', '.a'), false, 'typ v pravidle se přehlédl');
  assert.equal(applies('div.a', 'div.a'), true);
  assert.equal(applies('.a::before', '.a'), false);
  assert.equal(applies('.a', '.a::before'), false, 'pravidlo pro prvek se svezlo na jeho ::before');
  assert.equal(applies('.wrap .a', '.wrap .a'), true);
  assert.equal(applies('.wrap .a', '.a'), false, 'předek v pravidle se nehlídá - hádali bychom strom');
  assert.equal(applies('.a', '.wrap .a'), true, 'pravidlo bez předků musí platit i na vnořený prvek');
});

test('čemu model nerozumí, to nikdy neplatí všude - a v dotazu se ozve nahlas', () => {
  // Pravidlo ze souboru radši vynecháme: falešně zelený test je horší než
  // pravidlo, které se do modelu nevešlo.
  assert.equal(applies('.a %%%', '.a'), false);
  const rules = parseCss('.a %%% { display: none } .a { display: flex }');
  assert.equal(resolveValue(rules, '.a', 'display'), 'flex');

  // Cíl ale píše autor testu - tam je nesrozumitelný selektor vada dotazu
  // a tichá odpověď 'null' by z něj udělala černou skříňku.
  assert.throws(() => applies('.a', '.a %%%'), /nerozumím/);
  assert.throws(() => resolveValue(rules, '', 'display'), /nerozumím/);
});

test('vyhrává !important, pak specificita, pak pořadí v souboru', () => {
  // Pořadí: při shodné specificitě má poslední slovo pravidlo níž v souboru.
  assert.equal(resolveValue(parseCss('.a { color: red } .a { color: blue }'), '.a', 'color'), 'blue');
  // Specificita přebije pořadí, i když stojí výš.
  assert.equal(resolveValue(parseCss('.a.b { color: red } .a { color: blue }'), '.a.b', 'color'), 'red');
  // !important přebije specificitu i pořadí.
  assert.equal(
    resolveValue(parseCss('.a { color: red !important } #app.a { color: blue }'), '#app.a', 'color'),
    'red'
  );
  // Vlastnost, kterou nikdo nenastavuje, je null - ne 'nějaká cizí hodnota'.
  assert.equal(resolveValue(parseCss('.a { color: red }'), '.b', 'color'), null);
});

test('@media se bere v úvahu podle omezeného pohybu, šířková pravidla platí vždy', () => {
  assert.equal(mediaActive([], false), true);
  assert.equal(mediaActive(['@media (max-width: 600px)'], false), true, 'šířkové pravidlo je pro nějaké okno živé');
  assert.equal(mediaActive(['@media (prefers-reduced-motion: reduce)'], false), false);
  assert.equal(mediaActive(['@media (prefers-reduced-motion: reduce)'], true), true);
  assert.equal(mediaActive(['@media (prefers-reduced-motion: no-preference)'], true), false);

  const rules = parseCss(`
    .a { animation: pulse 2s infinite; display: block }
    @media (prefers-reduced-motion: reduce) {
      .a { animation: none; display: none }
    }
  `);
  assert.equal(resolveValue(rules, '.a', 'display', false), 'block');
  assert.equal(resolveValue(rules, '.a', 'display', true), 'none');
  assert.equal(resolveAnimation(rules, '.a', false), 'pulse');
  assert.equal(resolveAnimation(rules, '.a', true), 'none');

  // Vada, kvůli které model vznikl: blok pro omezený pohyb ležel v souboru
  // PŘED pravidly, která animace zapínají, a @media specificitu nezvyšuje.
  const beforeAfter = parseCss(`
    @media (prefers-reduced-motion: reduce) { .a { animation: none } }
    .a { animation: pulse 2s infinite }
  `);
  assert.equal(resolveAnimation(beforeAfter, '.a', true), 'pulse', 'pozdější pravidlo v souboru neprošlo');
});

test('animationName vytáhne jméno ze zkratky i z longhandu', () => {
  assert.equal(animationName('pulse 2s ease-in-out infinite'), 'pulse');
  assert.equal(animationName('2s infinite pulse'), 'pulse', 'jméno až za časem se nenašlo');
  assert.equal(animationName('none'), 'none');
  assert.equal(animationName(null), 'none', 'nenastavená animace není animace');
  assert.equal(animationName('1.5s cubic-bezier(0.4, 0, 1, 1) infinite shake'), 'shake');
  // Longhand přebije zkratku, i když je zkratka specifičtější zápis.
  const rules = parseCss('.a { animation: pulse 2s } .a { animation-name: none }');
  assert.equal(resolveAnimation(rules, '.a', false), 'none');
});

test('model sedí na skutečném css/main.css a rozumí každému jeho selektoru', () => {
  const rules = parseCss(cssText);
  assert.ok(rules.length > 100, `parser našel jen ${rules.length} pravidel - model by nehlídal nic`);

  // Kdyby do souboru přibyl selektor, který model neumí rozebrat, tiše by
  // vypadl z kaskády a záruky nad ním by přestaly platit beze slova.
  const nerozumi = [
    ...new Set(
      rules
        .map((r) => r.selector)
        .filter((s) => s.split(/\s*[>+~]\s*|\s+/).some((chunk) => compound(chunk).unknown))
    ),
  ];
  assert.deepEqual(nerozumi, [], `těmhle selektorům model nerozumí, takže je z kaskády vynechává: ${nerozumi}`);

  // Hodnoty naměřené v Chrome (headless nad pracovním stromem). Dokud
  // #app a [hidden] sedaly na všechno, vracel model u všech tří 'none'.
  assert.equal(resolveValue(rules, '.confetti', 'display', false), null, 'konfety vypnuté i bez omezení pohybu');
  assert.equal(resolveValue(rules, '.confetti', 'display', true), 'none');
  assert.equal(resolveValue(rules, '.stats-profile', 'display'), 'flex');
  assert.equal(resolveValue(rules, '.council-badge', 'display'), null, 'odznak je <span>, display mu nikdo nenastavuje');
  assert.equal(resolveValue(rules, '.map-player', 'min-height'), null, 'na panel hráče se svezla výška z #app');
  // A #app i [hidden] si svoje pravidlo dál nesou - nejsou vyřazené, jen zúžené.
  assert.equal(resolveValue(rules, '#app', 'display'), 'flex');
  assert.equal(resolveValue(rules, '[hidden]', 'display'), 'none');
});
