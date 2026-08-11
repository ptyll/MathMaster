/**
 * Druhy chyb pro rodičovský přehled (UCV-STATS-001).
 *
 * Rodiče nezajímá, kolik chyb dítě udělalo, ale JAKÝCH - jiná pomoc
 * potřebuje dítě, které si plete znaménka, a jiné, které nechápe,
 * proč se úprava dělá na obou stranách. Proto každý druh nese
 * konkrétní doporučení, ne jen popisek.
 */

import { EQUATION_SETUP_ERROR } from './equationParse.js';

export const ERROR_KINDS = Object.freeze({
  ARITHMETIC: 'arithmetic',
  STRATEGY: 'strategy',
  SIGN: 'sign',
  UNSIMPLIFIED: 'unsimplified',
  COMMON_DENOMINATOR: 'commonDenominator',
  EXPAND: 'expand',
  SKIPPED: 'skipped',
  EQUATION_SETUP: EQUATION_SETUP_ERROR,
});

const CATALOG = {
  [ERROR_KINDS.ARITHMETIC]: {
    label: 'Chyba ve výpočtu',
    hint: 'Postup zná, ale ujede mu počítání.',
    advice: 'Procvičte počítání zpaměti s menšími čísly - násobilku a odčítání přes desítku.',
  },
  [ERROR_KINDS.STRATEGY]: {
    label: 'Zvolil úpravu, která nevede k cíli',
    hint: 'Neví, co s rovnicí udělat, i když počítá správně.',
    advice: 'Projděte spolu, proč se čísla stěhují na jednu stranu a x na druhou. Pomůže krokový režim s váhou.',
  },
  [ERROR_KINDS.SIGN]: {
    label: 'Správné číslo, špatné znaménko',
    hint: 'Plete si plus a minus, hodnotu má jinak dobře.',
    advice: 'Zaměřte se na záporná čísla - číselná osa a úlohy typu "kolik chybí do nuly".',
  },
  [ERROR_KINDS.UNSIMPLIFIED]: {
    label: 'Nezkrácený zlomek',
    hint: 'Výsledek je správný, jen není v základním tvaru.',
    advice: 'Připomeňte krácení: hledat číslo, kterým jde vydělit čitatel i jmenovatel.',
  },
  [ERROR_KINDS.COMMON_DENOMINATOR]: {
    label: 'Špatný společný jmenovatel',
    hint: 'Nenajde jmenovatele, kterým jdou vydělit oba zlomky.',
    advice: 'Procvičte násobky: vypisovat řady 3, 6, 9... a 4, 8, 12... a hledat první společné číslo.',
  },
  [ERROR_KINDS.EXPAND]: {
    label: 'Chyba při rozšiřování zlomku',
    hint: 'Společný jmenovatel najde, ale čitatel přepočítá špatně.',
    advice: 'Ukažte, že se čitatel i jmenovatel násobí stejným číslem - hodnota zlomku se tím nemění.',
  },
  [ERROR_KINDS.SKIPPED]: {
    label: 'Přeskočený příklad',
    hint: 'Příklad vzdal, aniž by ho zkusil dořešit.',
    advice: 'Přeskakované příklady bývají nad aktuální úrovní - zkuste s ním projít jeden společně.',
  },
  [ERROR_KINDS.EQUATION_SETUP]: {
    label: 'Rovnice nesedí na zadání',
    hint: 'Počítá dobře, ale ze slovního zadání sestaví špatnou rovnici.',
    advice: 'Procvičte překlad zadání na rovnici: co je neznámá x a co se s ní postupně děje, krok za krokem.',
  },
};

/** Popis druhu chyby, nebo obecný záznam pro neznámý kód. */
export function describeError(kind) {
  return CATALOG[kind] ?? { label: kind, hint: '', advice: '' };
}

export function allErrorKinds() {
  return Object.keys(CATALOG);
}
