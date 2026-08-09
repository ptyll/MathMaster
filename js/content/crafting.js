/**
 * Crafting (UCV-REWARD-002): světelný meč a loď z kyber krystalů.
 * Čistá logika nad stavem - kosmetická/motivační, neovlivňuje obtížnost.
 * Krystaly se při stavbě spotřebují; postup je trvalý.
 */

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
];

export function getPart(id) {
  return PARTS.find((p) => p.id === id) ?? null;
}

/** Počet krystalů dané barvy v inventáři. */
export function crystalCount(state, color) {
  return state.inventory.crystals.find((c) => c.color === color)?.count ?? 0;
}

/** Je část postavená? */
export function isCrafted(state, partId) {
  return state.inventory.shipParts.includes(partId);
}

/** Má hráč všechny části meče? */
export function hasSword(state) {
  return PARTS.filter((p) => p.group === 'sword').every((p) => isCrafted(state, p.id));
}

/** Má hráč celou loď? */
export function hasShip(state) {
  return PARTS.filter((p) => p.group === 'ship').every((p) => isCrafted(state, p.id));
}

/** Je část odemčená k stavbě? Loď až po hotovém meči. */
export function isUnlocked(state, part) {
  return part.group === 'sword' || hasSword(state);
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
