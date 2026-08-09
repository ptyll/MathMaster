/**
 * Dotyková číselná klávesnice (UCV-INPUT-001).
 * Mřížka 3x4: 1-9, minus, 0, guma. Potvrzení řeší answerInput.
 * Na PC funguje i hardwarová klávesnice (číslice, -, Backspace).
 */

/**
 * @param {HTMLElement} container kam se klávesnice vykreslí
 * @param {object} callbacks { onDigit, onMinus, onBackspace }
 * @returns {{ element: HTMLElement, attachKeyboard: (target: HTMLElement|Document) => void }}
 */
export function createKeypad(container, { onDigit, onMinus, onBackspace }) {
  const el = document.createElement('div');
  el.className = 'keypad';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Číselná klávesnice');

  const keys = [
    { label: '1', action: () => onDigit('1') },
    { label: '2', action: () => onDigit('2') },
    { label: '3', action: () => onDigit('3') },
    { label: '4', action: () => onDigit('4') },
    { label: '5', action: () => onDigit('5') },
    { label: '6', action: () => onDigit('6') },
    { label: '7', action: () => onDigit('7') },
    { label: '8', action: () => onDigit('8') },
    { label: '9', action: () => onDigit('9') },
    { label: '−', action: () => onMinus(), aria: 'Minus' },
    { label: '0', action: () => onDigit('0') },
    { label: '⌫', action: () => onBackspace(), aria: 'Smazat' },
  ];

  for (const key of keys) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keypad-key';
    btn.textContent = key.label;
    btn.setAttribute('aria-label', key.aria ?? key.label);
    btn.addEventListener('click', key.action);
    el.appendChild(btn);
  }

  container.appendChild(el);

  return {
    element: el,
    /**
     * Napojí hardwarovou klávesnici. Vrací funkci pro odpojení.
     * Enter zde záměrně neřešíme - potvrzení má na starosti answerInput.
     */
    attachKeyboard(target) {
      const handler = (event) => {
        if (/^[0-9]$/.test(event.key)) {
          onDigit(event.key);
          event.preventDefault();
        } else if (event.key === '-') {
          onMinus();
          event.preventDefault();
        } else if (event.key === 'Backspace') {
          onBackspace();
          event.preventDefault();
        }
      };
      target.addEventListener('keydown', handler);
      return () => target.removeEventListener('keydown', handler);
    },
  };
}
