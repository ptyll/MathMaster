/**
 * Kaskáda CSS pro testy: co v prohlížeči doopravdy platí, ne co je
 * v souboru napsané. Sdílené mezi testy obrazovek (dílna, mapa) - jeden
 * model kaskády, ať se vada nedá schovat do souboru, kde se zrovna neměří.
 */

/* --- Kaskáda CSS: co doopravdy platí, ne co je v souboru napsané ---------
 *
 * Blok pro omezený pohyb vyjmenovával .droid-art i .saber-blade a stejně
 * nic nevypnul: ležel v souboru PŘED pravidly, která ty animace zapínají,
 * a @media specificitu nezvyšuje. Test hledající selektor v textu CSS
 * (cssText.includes) takovou vadu nikdy neuvidí - zápis tam je. Proto se
 * tady kaskáda dopočítá: !important, pak specificita, pak pořadí v souboru.
 */

/** Rozebere CSS na pravidla i s @media obalem a pořadím v souboru. */
export function parseCss(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  (function scan(body, media) {
    let i = 0;
    while (i < body.length) {
      const open = body.indexOf('{', i);
      if (open < 0) {
        return;
      }
      const prelude = body.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') depth--;
        j++;
      }
      const inner = body.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) {
        scan(inner, [...media, prelude]); // @keyframes a spol. nás nezajímají
      } else if (!prelude.startsWith('@')) {
        for (const selector of prelude.split(',').map((s) => s.trim()).filter(Boolean)) {
          rules.push({ selector, media, decls: parseDecls(inner), order: rules.length });
        }
      }
      i = j;
    }
  })(text, []);
  return rules;
}

export function parseDecls(body) {
  const decls = new Map();
  for (const piece of body.split(';')) {
    const at = piece.indexOf(':');
    if (at < 0) {
      continue;
    }
    const prop = piece.slice(0, at).trim();
    const raw = piece.slice(at + 1).trim();
    if (!prop || !raw) {
      continue;
    }
    decls.set(prop, { value: raw.replace(/\s*!important$/, '').trim(), important: /!important$/.test(raw) });
  }
  return decls;
}

/* Jméno v selektoru: kromě [\w-] i písmena s diakritikou - třídy jako
 * .crystal-bílý jsou v tomhle projektu běžné a rozseknout se musí celé. */
const NAME = String.raw`[-\w\p{L}]+`;
const PART = new RegExp(
  String.raw`^(?:(::${NAME})|(:${NAME}(?:\([^)]*\))?)|(#${NAME})|(\.${NAME})|(\[[^\]]*\]))`,
  'u'
);

/** Atribut na porovnatelný tvar: [aria-pressed='true'] == [aria-pressed="true"]. */
const normAttr = (attr) => attr.replace(/\s+/g, '').replace(/["']/g, '');

/**
 * Rozebere jednu složku selektoru (`.a.b`, `#app`, `input[hidden]:disabled`)
 * na části. Co se rozebrat nepodařilo, zůstane ve `unknown` - volající to
 * NESMÍ brát jako "žádné omezení", jinak by takový selektor sedl na cokoliv.
 */
export function compound(chunk) {
  const out = {
    tag: null,
    universal: false,
    ids: [],
    classes: [],
    attrs: [],
    pseudoClasses: [],
    pseudoEl: null,
    unknown: null,
  };
  let rest = chunk.trim();
  if (!rest) {
    out.unknown = '(prázdná složka selektoru)';
    return out;
  }
  const head = /^(?:\*|[a-z][-\w\p{L}]*)/iu.exec(rest); // typ i * smí stát jen na začátku
  if (head) {
    if (head[0] === '*') out.universal = true;
    else out.tag = head[0];
    rest = rest.slice(head[0].length);
  }
  while (rest) {
    const [match, pseudoEl, pseudoClass, id, cls, attr] = PART.exec(rest) ?? [];
    if (!match) {
      out.unknown = rest;
      return out;
    }
    if (pseudoEl) {
      if (out.pseudoEl) {
        out.unknown = rest; // dva pseudoelementy na jednom prvku neumíme
        return out;
      }
      out.pseudoEl = pseudoEl;
    } else if (pseudoClass) out.pseudoClasses.push(pseudoClass);
    else if (id) out.ids.push(id);
    else if (cls) out.classes.push(cls.slice(1));
    else out.attrs.push(normAttr(attr));
    rest = rest.slice(match.length);
  }
  return out;
}

const split = (selector) => selector.trim().split(/\s*[>+~]\s*|\s+/).map(compound);

/** Specificita jako v prohlížeči: id, pak třídy/atributy/pseudotřídy, pak typy. */
export function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let types = 0;
  for (const c of split(selector)) {
    ids += c.ids.length;
    classes += c.classes.length + c.attrs.length + c.pseudoClasses.length;
    types += (c.tag ? 1 : 0) + (c.pseudoEl ? 1 : 0);
  }
  return ids * 10000 + classes * 100 + types;
}

/**
 * Platí pravidlo na prvek popsaný cílovým selektorem? Model je záměrně
 * úzký: prvek popisuje poslední složka selektoru, předky uznáme jen když
 * je cíl vypisuje taky (jinak bychom hádali strom dokumentu).
 *
 * Neznámé selektory tu kdysi sedly na všechno: `#app` ani `[hidden]` nemá
 * třídu ani typ, takže z nich resolver vyčetl "bez omezení" a jejich
 * `display` přebil cokoliv (spec. 10000, resp. !important). Testy pak byly
 * zelené i nad smazaným pravidlem. Proto se každá složka rozebírá celá a
 * zbytek, kterému nerozumíme, pravidlo vyřadí místo aby ho pustil všude.
 */
export function applies(ruleSelector, targetSelector) {
  const rule = split(ruleSelector);
  const target = split(targetSelector);
  const badTarget = target.find((c) => c.unknown);
  if (badTarget) {
    // Cíl píše autor testu - když mu nerozumíme, je to vada dotazu, ne CSS,
    // a tichá odpověď by z testu udělala černou skříňku.
    throw new Error(`cssCascade: cílovému selektoru '${targetSelector}' nerozumím u '${badTarget.unknown}'`);
  }
  if (rule.some((c) => c.unknown)) {
    return false; // pravidlo ze souboru raději nepoužijeme, než aby platilo všude
  }
  const r = rule[rule.length - 1];
  const t = target[target.length - 1];
  if (r.pseudoEl !== t.pseudoEl) {
    return false;
  }
  if (r.tag && r.tag !== t.tag) {
    return false;
  }
  if (
    !r.classes.every((c) => t.classes.includes(c)) ||
    !r.ids.every((i) => t.ids.includes(i)) ||
    !r.attrs.every((a) => t.attrs.includes(a)) ||
    !r.pseudoClasses.every((p) => t.pseudoClasses.includes(p))
  ) {
    return false;
  }
  const ancestors = targetSelector.trim().split(/\s*[>+~]\s*|\s+/).slice(0, -1);
  return ruleSelector
    .trim()
    .split(/\s*[>+~]\s*|\s+/)
    .slice(0, -1)
    .every((ancestor) => ancestors.includes(ancestor));
}

/**
 * Je @media obal v platnosti? Šířkové dotazy bereme jako platné - pravidlo
 * schované v `max-width: 600px` je pro nějaký tablet pořád živé.
 */
export function mediaActive(media, reduce) {
  return media.every((m) => {
    if (!/prefers-reduced-motion/.test(m)) {
      return true;
    }
    // Hledat 'reduce' v celém dotazu nejde - to slovo je i v názvu vlastnosti
    // ('prefers-reduced-motion'), takže by i blok pro 'no-preference' vyšel
    // jako blok pro omezený pohyb. Bereme proto hodnotu za dvojtečkou;
    // samotné `(prefers-reduced-motion)` bez hodnoty znamená 'reduce'.
    const value = /prefers-reduced-motion\s*:\s*([\w-]+)/.exec(m)?.[1] ?? 'reduce';
    return (value === 'reduce') === reduce;
  });
}

/** Hodnota vlastnosti, která na daném prvku vyhraje (null = nikdo ji nenastavuje). */
export function resolveValue(rules, targetSelector, prop, reduce = false) {
  const winner = rules
    .filter((r) => r.decls.has(prop) && mediaActive(r.media, reduce) && applies(r.selector, targetSelector))
    .sort((a, b) => {
      const A = a.decls.get(prop);
      const B = b.decls.get(prop);
      return A.important - B.important || specificity(a.selector) - specificity(b.selector) || a.order - b.order;
    })
    .pop();
  return winner ? winner.decls.get(prop).value : null;
}

const ANIM_KEYWORDS = new Set([
  'none', 'ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end',
  'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse',
  'forwards', 'backwards', 'both', 'running', 'paused', 'initial', 'inherit', 'unset',
]);

/** Jméno animace ze zkratky `animation` i z `animation-name`. */
export function animationName(value) {
  if (value === null) {
    return 'none';
  }
  return (
    value
      .split(/\s+/)
      .find((t) => !ANIM_KEYWORDS.has(t) && !/^[\d.]/.test(t) && !/^(cubic-bezier|steps)\(/.test(t)) ?? 'none'
  );
}

export function resolveAnimation(rules, selector, reduce) {
  const shorthand = resolveValue(rules, selector, 'animation', reduce);
  const longhand = resolveValue(rules, selector, 'animation-name', reduce);
  return animationName(longhand ?? shorthand);
}
