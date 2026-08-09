/**
 * Rodičovská brána (UCV-STATS-001): tlačítko je nutné podržet 3 sekundy.
 * Není to zabezpečení - je to zábrana proti náhodnému vstupu dítěte.
 * Heslo záměrně ne: rodič ho zapomene a přehled je jen pro čtení.
 */

const HOLD_MS = 3000;

/**
 * @param {HTMLElement} container
 * @param {{ onUnlocked: () => void, label?: string }} options
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createParentGate(container, { onUnlocked, label = 'Pro rodiče' }) {
  const wrap = document.createElement('div');
  wrap.className = 'parent-gate';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-parent-gate';
  btn.textContent = label;
  btn.setAttribute('aria-label', `${label} - podrž tlačítko tři sekundy`);

  const fill = document.createElement('span');
  fill.className = 'parent-gate-fill';
  fill.setAttribute('aria-hidden', 'true');

  const status = document.createElement('span');
  status.className = 'parent-gate-status';
  status.setAttribute('role', 'status');

  btn.appendChild(fill);
  wrap.append(btn, status);
  container.appendChild(wrap);

  let timer = null;
  let startedAt = 0;
  let raf = null;

  function tick() {
    const progress = Math.min(1, (Date.now() - startedAt) / HOLD_MS);
    fill.style.width = `${progress * 100}%`;
    if (progress < 1) {
      raf = requestAnimationFrame(tick);
    }
  }

  function start(event) {
    // Jen hlavní tlačítko myši / dotyk; pravý klik nespouštíme.
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    if (timer !== null) {
      return;
    }
    event.preventDefault();
    startedAt = Date.now();
    status.textContent = 'Drž…';
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => {
      cancel({ silent: true });
      onUnlocked();
    }, HOLD_MS);
  }

  function cancel({ silent = false } = {}) {
    const wasHolding = timer !== null;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    fill.style.width = '0%';
    // Pustil dřív? Rodič jinak neví, proč se nic nestalo - krátký klik
    // vypadá jako rozbité tlačítko.
    status.textContent = wasHolding && !silent ? 'Podrž 3 s' : '';
  }

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  // Klávesnice: mezerník/Enter drží tlačítko stisknuté a opakuje keydown,
  // proto pojistka na timer !== null výše.
  btn.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      start(event);
    }
  });
  btn.addEventListener('keyup', cancel);
  btn.addEventListener('blur', cancel);

  return {
    element: wrap,
    destroy() {
      cancel();
      wrap.remove();
    },
  };
}
