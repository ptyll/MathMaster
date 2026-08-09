/**
 * Sdílená a11y obsluha overlay dialogů: Escape zavře, Tab cyklí uvnitř,
 * při otevření fokus do panelu. Používají overlaye nad mapou
 * (solutionViewer má vlastní ekvivalent).
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
