/**
 * A11y obsluha modálních dialogů a fokus po přechodu mezi obrazovkami.
 * Používají to overlaye nad mapou (solutionViewer má vlastní ekvivalent)
 * a main.js při překreslení obrazovky.
 */

/**
 * Fokus po přechodu na novou obrazovku: nadpis h1, ať klávesový uživatel
 * i odečítač vědí, kde jsou. Výjimka je obrazovka, která si při vzniku
 * otevřela modální dialog - té fokus nepřebíjíme.
 *
 * @param {HTMLElement} el kořen nově vykreslené obrazovky
 */
export function focusNewScreen(el) {
  // Obrazovka si mohla fokus umístit sama - mapa po dokončení poslední
  // planety otevírá slavnost Rady Jedi (UCV-MAP-003) a ta je modální.
  // Přebít ji nadpisem by hráče postavilo POD otevřený dialog: čtečka i
  // Tab by pokračovaly v mapě, kterou překrývá overlay.
  const active = document.activeElement;
  if (active && el.contains(active) && active.closest?.('[role="dialog"]')) {
    return;
  }
  const heading = el.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

/**
 * Prvky v SEKVENČNÍM pořadí Tabu, tedy ty, mezi kterými prohlížeč klávesou
 * Tab přepíná. Past fokusu musí počítat s touž množinou, jinak se rozejde
 * s tím, co dítě klávesnicí opravdu obchází:
 * - `tabindex="-1"` sem NEPATŘÍ. Takový prvek je zaostřitelný jen programově
 *   (nadpis dialogu, na který míří fokus po otevření), v pořadí Tabu není.
 *   Dokud tu byl, vycházel první prvek pasti na nadpis, Shift+Tab z prvního
 *   SKUTEČNÉHO tab stopu se nepoznal a fokus utekl na mapu pod dialogem.
 * - `tabindex="0"` sem PATŘÍ. Rolovatelný `.overlay-content` (overlay.js) je
 *   tab stop a je v panelu první - past o něm dosud nevěděla vůbec.
 * Zakázané tlačítko tab stop není. Odkaz, `<select>` ani `contenteditable`
 * tu nejsou, protože je žádný z dialogů nemá - fokus na takovém prvku past
 * pozná (leží uvnitř panelu) a posun z něj nechá prohlížeči, takže na OKRAJI
 * panelu by jím fokus z dialogu vyšel ven. Kdo takový ovladač do dialogu
 * vloží, musí ho dopsat i sem.
 */
const TAB_STOPS = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

/**
 * Tab stopy PLUS prvky zaostřitelné jen programově - to je množina, na které
 * fokus uvnitř panelu běžně stojí. Potřebujeme ji kvůli pořadí: dílna po
 * postavení dílu posílá fokus na nadpis skupiny (`tabindex="-1"`) UPROSTŘED
 * panelu, takže „fokus není tab stop" samo o sobě neznamená „stojí před
 * vším ostatním".
 */
const FOCUSABLE = `${TAB_STOPS}, [tabindex="-1"]`;

/**
 * Je prvek v sekvenčním pořadí Tabu? Platí jen o prvcích vrácených hledáním
 * FOCUSABLE - jediná nesekvenční skupina je tam `tabindex="-1"`. Tím se
 * z pořadí vyřadí i `<button tabindex="-1">`, který sedí na obě skupiny.
 */
function isTabStop(el) {
  return el.getAttribute('tabindex') !== '-1';
}

/**
 * Tab stop, na který by prohlížeč z pozice `at` posunul fokus - `null`, když
 * už žádný ve směru není (tedy když by fokus vypadl z dialogu ven).
 *
 * @param {HTMLElement[]} order všechny zaostřitelné prvky panelu v pořadí DOM
 * @param {HTMLElement[]} cycle prvky, po kterých past cyklí (obvykle tab stopy)
 * @param {number} at pozice fokusu v `order`
 * @param {1 | -1} step směr: 1 pro Tab, -1 pro Shift+Tab
 */
function nextStop(order, cycle, at, step) {
  for (let i = at + step; i >= 0 && i < order.length; i += step) {
    if (cycle.includes(order[i])) {
      return order[i];
    }
  }
  return null;
}

/**
 * Escape zavře, Tab cyklí uvnitř, při otevření fokus do panelu.
 *
 * @param {HTMLElement} overlay prvek s overlay rolí
 * @param {HTMLElement} panel panel s tlačítky
 * @param {() => void} onClose zavření (Escape)
 * @returns {{ detach: () => void }}
 */
export function makeDialogAccessible(overlay, panel, onClose) {
  const title = panel.querySelector('h2, h1');
  if (title) {
    title.tabIndex = -1;
    title.focus();
  }

  function keyHandler(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      const order = Array.from(panel.querySelectorAll(FOCUSABLE));
      const stops = order.filter(isTabStop);
      // Panel bez jediného tab stopu (dialog složený jen z textu) drží fokus
      // na nadpisu - ten v `order` je, protože má tabindex="-1". Past se
      // proto nevypíná, jen cyklí po tom, co v panelu je; jinak by Tab dítě
      // odvedl na obrazovku POD otevřeným dialogem.
      const cycle = stops.length > 0 ? stops : order;
      if (cycle.length === 0) {
        return;
      }
      const at = order.indexOf(document.activeElement);
      if (at < 0 && panel.contains(document.activeElement)) {
        // Fokus stojí na prvku uvnitř panelu, který výčet výš nezná. Kam
        // odsud Tab vede, se tady nespočítá, takže posun necháme prohlížeči -
        // skok na začátek dialogu by dítěti sebral všechno, co je za tím
        // prvkem, včetně tlačítka Zavřít.
        return;
      }
      // Zasahujeme jen tam, kde by fokus z dialogu vypadl: na konci pořadí ve
      // směru Tabu a když fokus stojí mimo panel (`at < 0`). Uvnitř panelu
      // necháváme posun na prohlížeči - udělá přesně totéž.
      const step = event.shiftKey ? -1 : 1;
      if (at < 0 || nextStop(order, cycle, at, step) === null) {
        event.preventDefault();
        (step === -1 ? cycle[cycle.length - 1] : cycle[0]).focus();
      }
    }
  }
  document.addEventListener('keydown', keyHandler);

  return {
    detach() {
      document.removeEventListener('keydown', keyHandler);
    },
  };
}
