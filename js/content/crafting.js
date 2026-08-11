/**
 * Crafting (UCV-REWARD-002, UCV-REWARD-003): světelný meč, loď, droid
 * a světelné brnění z kyber krystalů.
 * Čistá logika nad stavem - kosmetická/motivační, neovlivňuje obtížnost
 * ani tituly. Krystaly se při stavbě spotřebují; postup je trvalý.
 *
 * Skupiny se odemykají v řetězu meč -> loď -> droid -> brnění a pořadí
 * určuje výhradně pole GROUPS. Odemčení se počítá z postavených dílů, ne
 * z uloženého příznaku, takže starý save nepotřebuje migraci: hráč, který
 * má hotový meč i loď, má droida rovnou odemčeného.
 */

/**
 * Skupiny dílů v pořadí odemykání. `buildHint` je 4. pád do hlášky
 * 'Postav nejdřív loď' u zamčené skupiny, `prompt` je pobídka v dílně.
 */
export const GROUPS = [
  {
    id: 'sword',
    name: 'Světelný meč',
    icon: '⚔️',
    buildHint: 'meč',
    prompt: 'Postav svůj světelný meč z kyber krystalů.',
  },
  {
    id: 'ship',
    name: 'Loď',
    icon: '🚀',
    buildHint: 'loď',
    prompt: '⚔️ Světelný meč je hotový! Teď loď.',
  },
  {
    id: 'droid',
    name: 'Droid',
    icon: '🤖',
    buildHint: 'droida',
    prompt: '🚀 Loď je kompletní! Postav si droida - poletí s tebou na mise.',
  },
  {
    id: 'armor',
    name: 'Světelné brnění',
    icon: '🛡️',
    buildHint: 'brnění',
    prompt: '🤖 Droid je hotový! Zbývá světelné brnění.',
  },
];

export const PARTS = [
  // Meč - potřebuje aspoň jeden krystal z každé planety
  { id: 'sword-hilt', group: 'sword', name: 'Rukojeť', requires: { 'modrý': 1 } },
  { id: 'sword-emitter', group: 'sword', name: 'Emitor', requires: { 'bílý': 1 } },
  { id: 'sword-blade', group: 'sword', name: 'Čepel', requires: { 'zelený': 1 } },
  { id: 'sword-heart', group: 'sword', name: 'Srdce meče', requires: { 'červený': 1, 'fialový': 1 } },
  // Loď - odemyká se hotovým mečem, žádá víc krystalů (opakování misí)
  { id: 'ship-hull', group: 'ship', name: 'Trup', requires: { 'modrý': 2, 'bílý': 2 } },
  { id: 'ship-engine', group: 'ship', name: 'Motor', requires: { 'zelený': 2 } },
  { id: 'ship-cockpit', group: 'ship', name: 'Kokpit', requires: { 'červený': 2 } },
  { id: 'ship-wings', group: 'ship', name: 'Křídla', requires: { 'fialový': 2 } },
  // Droid - odemyká se hotovou lodí, staví se z krystalů planet s mixem
  // témat (Bespin, Kamino, Mustafar), tedy až z endgame řetězu.
  { id: 'droid-head', group: 'droid', name: 'Hlava', requires: { 'oranžový': 2 } },
  { id: 'droid-body', group: 'droid', name: 'Trup', requires: { 'tyrkysový': 2, 'žlutý': 1 } },
  { id: 'droid-legs', group: 'droid', name: 'Nohy', requires: { 'žlutý': 2 } },
  // Světelné brnění - poslední odměna, z krystalů planet se slovními
  // úlohami (Endor, Geonosis, Dathomir).
  { id: 'armor-helmet', group: 'armor', name: 'Helma', requires: { 'růžový': 2 } },
  { id: 'armor-cloak', group: 'armor', name: 'Plášť', requires: { 'bronzový': 2, 'černý': 1 } },
  { id: 'armor-gloves', group: 'armor', name: 'Rukavice', requires: { 'černý': 2 } },
];

export function getPart(id) {
  return PARTS.find((p) => p.id === id) ?? null;
}

/** Díly jedné skupiny v pořadí, v jakém je hráč staví. */
export function partsOfGroup(groupId) {
  return PARTS.filter((p) => p.group === groupId);
}

/** Skupina, kterou je potřeba dokončit dřív, nebo null (první v řetězu). */
export function previousGroup(groupId) {
  const index = GROUPS.findIndex((g) => g.id === groupId);
  return index > 0 ? GROUPS[index - 1] : null;
}

/** Počet krystalů dané barvy v inventáři. */
export function crystalCount(state, color) {
  return state.inventory.crystals.find((c) => c.color === color)?.count ?? 0;
}

/** Je část postavená? */
export function isCrafted(state, partId) {
  return state.inventory.shipParts.includes(partId);
}

/** Má hráč celou skupinu (meč / loď / droida / brnění)? */
export function isGroupComplete(state, groupId) {
  const parts = partsOfGroup(groupId);
  return parts.length > 0 && parts.every((p) => isCrafted(state, p.id));
}

/** Kolik dílů skupiny už stojí (pro postup 2/3 v dílně). */
export function groupProgress(state, groupId) {
  const parts = partsOfGroup(groupId);
  return { built: parts.filter((p) => isCrafted(state, p.id)).length, total: parts.length };
}

/** Má hráč všechny části meče? */
export function hasSword(state) {
  return isGroupComplete(state, 'sword');
}

/** Má hráč postaveného droida? */
export function hasDroid(state) {
  return isGroupComplete(state, 'droid');
}

/**
 * Je skupina odemčená? Odemyká ji dokončení té předchozí v GROUPS -
 * meč -> loď -> droid -> brnění. Jediné místo, kde pravidlo řetězu žije;
 * dílna se ptá touhle funkcí, aby hlavička skupiny nemohla tvrdit něco
 * jiného než tlačítko na řádku.
 */
export function isGroupUnlocked(state, groupId) {
  const previous = previousGroup(groupId);
  return previous === null || isGroupComplete(state, previous.id);
}

/** Je část odemčená k stavbě? */
export function isUnlocked(state, part) {
  return isGroupUnlocked(state, part.group);
}

/** Chybějící krystaly pro část: { color: chybí } - prázdné = lze postavit. */
export function missingCrystals(state, part) {
  const missing = {};
  for (const [color, needed] of Object.entries(part.requires)) {
    const lack = needed - crystalCount(state, color);
    if (lack > 0) {
      missing[color] = lack;
    }
  }
  return missing;
}

export function canCraft(state, part) {
  return isUnlocked(state, part) && !isCrafted(state, part.id) && Object.keys(missingCrystals(state, part)).length === 0;
}

/**
 * Postaví část: odečte krystaly a přidá díl. Vrací true při úspěchu.
 */
export function craft(state, partId) {
  const part = getPart(partId);
  if (!part || !canCraft(state, part)) {
    return false;
  }
  for (const [color, needed] of Object.entries(part.requires)) {
    const entry = state.inventory.crystals.find((c) => c.color === color);
    entry.count -= needed;
  }
  state.inventory.crystals = state.inventory.crystals.filter((c) => c.count > 0);
  state.inventory.shipParts.push(part.id);
  return true;
}

/**
 * Co z postaveného je vidět na misi (UCV-REWARD-003): meč v ruce, droid
 * po boku a kusy brnění na postavičce. Jeden objekt místo rostoucího
 * seznamu parametrů - obrazovka mise se tak nemusí ptát na stav.
 */
export function cosmeticsFor(state) {
  return {
    saber: hasSword(state),
    droid: hasDroid(state),
    armor: {
      helmet: isCrafted(state, 'armor-helmet'),
      cloak: isCrafted(state, 'armor-cloak'),
      gloves: isCrafted(state, 'armor-gloves'),
    },
  };
}
