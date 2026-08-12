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
      const focusables = Array.from(panel.querySelectorAll('button:not(:disabled), input, [tabindex="-1"]'));
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
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
