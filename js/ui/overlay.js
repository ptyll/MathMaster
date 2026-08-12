/**
 * Sdílený rámec modálních overlayů nad mapou (dílna, inventář, slavnost
 * za titul). Jedno místo, kde se rozhoduje, KDE bydlí zavírací tlačítko -
 * a to je po revizi dílny podstatné: dokud rolovoval celý panel, končilo
 * 'Zavřít' na konci obsahu, tedy 490-820 px pod okrajem tabletu, kde na něj
 * dítě bez klávesnice vůbec nedosáhlo (Escape na dotyku není a klik na
 * pozadí schválně nezavírá). Kdo si tenhle rámec obejde vlastním panelem,
 * tu vadu si přinese zpátky.
 */

import { makeDialogAccessible } from './dialogA11y.js';

/**
 * Postaví overlay s nadpisem, rolujícím obsahem a patičkou se zavíracím
 * tlačítkem. Do dokumentu ho zavěsí až mount() - viz komentář u něj.
 *
 * @param {string} titleText nadpis dialogu (jde i do aria-label overlaye)
 * @param {() => void} [onClose] po zavření
 * @param {{ closeLabel?: string }} [options] popisek zavíracího tlačítka
 * @returns {{ overlay, panel, content, closeBtn, close, mount }}
 */
export function createOverlay(titleText, onClose, { closeLabel = 'Zavřít' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'solution-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', titleText);

  // --framed: roluje jen obsah, nadpis a patička se Zavřít zůstanou na místě.
  const panel = document.createElement('div');
  panel.className = 'solution-panel solution-panel--framed';

  const title = document.createElement('h2');
  title.textContent = titleText;

  const content = document.createElement('div');
  content.className = 'overlay-content';
  // Rolovatelná oblast musí být fokusovatelná, jinak se na nízkém okně
  // (1024x500) ke spodku obsahu nedá dostat klávesnicí: uvnitř není nic
  // fokusovatelného a nadpis i 'Zavřít' jsou jeho SOUROZENCI, takže se fokus
  // do rolovatelného prvku nemá jak dostat. Týká se celého sdíleného rámce -
  // dílna, inventář i žebříček titulů. Týž precedens má mapScreen.js u pásu
  // planet (strip.tabIndex = 0).
  content.tabIndex = 0;
  // A protože je to PRVNÍ tab stop dialogu, cyklí sem past fokusu z tlačítka
  // Zavřít (dialogA11y.js). Dřív past cyklila na nadpis a odečítač u toho
  // zopakoval, ve kterém dialogu dítě je; nadpis ale v pořadí Tabu není, takže
  // to byla vada, ne služba. Aby o tu orientaci nevidomé dítě nepřišlo, nese
  // jméno rovnou rolující oblast. Bez role by ho odečítač zahodil - `div` bez
  // role je obecný prvek a na ten se aria-label nevztahuje.
  content.setAttribute('role', 'group');
  content.setAttribute('aria-label', `${titleText} - obsah`);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary';
  closeBtn.textContent = closeLabel;

  // Zavřít bydlí v patičce mimo rolující obsah (.overlay-footer), takže je
  // vidět hned po otevření. Dílna se čtyřmi skupinami je vyšší než tablet a
  // tlačítko na konci obsahu bylo mimo obraz - hráč bez klávesnice neměl
  // z dialogu cestu ven. V DOM zůstává poslední, cyklení fokusu se nemění.
  const footer = document.createElement('div');
  footer.className = 'overlay-footer';
  footer.appendChild(closeBtn);

  panel.append(title, content, footer);
  overlay.appendChild(panel);

  let a11y = null;
  const close = () => {
    if (a11y) {
      a11y.detach();
      a11y = null;
    }
    overlay.remove();
    onClose?.();
  };
  closeBtn.addEventListener('click', close);

  /**
   * Zavěsí dialog do dokumentu a teprve pak zapne a11y obsluhu. Pořadí je
   * podstatné: makeDialogAccessible volá title.focus(), a focus() na dosud
   * odpojeném uzlu je v prohlížeči no-op - fokus by zůstal na tlačítku,
   * které dialog otevřelo, tedy mimo modál.
   */
  function mount(container) {
    container.appendChild(overlay);
    a11y = makeDialogAccessible(overlay, panel, close);
  }

  return { overlay, panel, content, closeBtn, close, mount };
}
