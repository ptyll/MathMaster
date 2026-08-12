/**
 * Prohlížeč krokového řešení (UCV-LEARN-001).
 * Vybere vizualizaci podle příkladu (váha / číselná osa / zlomkové pásy)
 * a provede krok za krokem. Končí tlačítkem "Zkusím to znovu sám".
 */

import { pickVisualization, extractFractions } from './visualParse.js';
import { createBalanceScale } from './balanceScale.js';
import { createFractionBar, createNumberLine } from './fractionVisuals.js';

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object} options.exercise příklad z generátoru (s polem steps)
 * @param {() => void} options.onClose zavření (návrat k příkladu)
 * @param {number} [options.startStep] od kterého kroku začít (nápověda úrovně 2 = první krok)
 * @param {number} [options.maxSteps] kolik kroků maximálně zpřístupnit (vrstvená nápověda)
 */
export function createSolutionViewer(container, { exercise, onClose, startStep = 0, maxSteps = null }) {
  const mode = pickVisualization(exercise);
  const steps = exercise.steps;
  const lastAvailable = maxSteps === null ? steps.length - 1 : Math.min(maxSteps - 1, steps.length - 1);
  let index = Math.min(startStep, lastAvailable);

  const overlay = document.createElement('div');
  overlay.className = 'solution-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Krokové vysvětlení');

  const panel = document.createElement('div');
  panel.className = 'solution-panel';

  const title = document.createElement('h2');
  title.textContent = 'Pojďme na to krok za krokem';

  const vizHost = document.createElement('div');
  vizHost.className = 'solution-viz';

  const operationEl = document.createElement('p');
  operationEl.className = 'solution-operation';
  const explanationEl = document.createElement('p');
  explanationEl.className = 'solution-explanation';

  const nav = document.createElement('div');
  nav.className = 'solution-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn';
  prevBtn.textContent = '← Zpět';
  const stepIndicator = document.createElement('span');
  stepIndicator.className = 'solution-step-indicator';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-primary';
  nav.append(prevBtn, stepIndicator, nextBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary';
  closeBtn.textContent = 'Zkusím to znovu sám!';
  closeBtn.addEventListener('click', () => {
    destroy();
    onClose();
  });

  panel.append(title, vizHost, operationEl, explanationEl, nav, closeBtn);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  const scale = mode === 'balance' ? createBalanceScale() : null;

  function renderStep() {
    const step = steps[index];
    vizHost.innerHTML = '';

    if (mode === 'balance') {
      vizHost.appendChild(scale.element);
      scale.show(step.leftSide, step.rightSide);
    } else if (mode === 'numberline') {
      const value = extractFractions(step.rightSide)[0];
      const num = value ? value.n / value.d : 0;
      vizHost.appendChild(createNumberLine(num));
      const eq = document.createElement('p');
      eq.className = 'solution-equation';
      eq.textContent = `${step.leftSide} = ${step.rightSide}`;
      vizHost.appendChild(eq);
    } else {
      // bars: vizualizuj zlomky z pravé strany (aktuální výsledek kroku)
      const fractions = extractFractions(step.rightSide).filter((f) => f.d > 1);
      const show = fractions.length > 0 ? fractions : extractFractions(step.rightSide);
      for (const f of show.slice(0, 3)) {
        vizHost.appendChild(createFractionBar(f, f.d > 1 ? `${f.n}/${f.d}` : String(f.n)));
      }
      const eq = document.createElement('p');
      eq.className = 'solution-equation';
      eq.textContent = `${step.leftSide}  →  ${step.rightSide}`;
      vizHost.appendChild(eq);
    }

    operationEl.textContent = step.operation;
    explanationEl.textContent = step.explanation;
    stepIndicator.textContent = `Krok ${index + 1}/${lastAvailable + 1}`;

    prevBtn.disabled = index === 0;
    const isLast = index >= lastAvailable;
    nextBtn.textContent = isLast ? 'Hotovo' : 'Další krok →';
  }

  prevBtn.addEventListener('click', () => {
    if (index > 0) {
      index--;
      renderStep();
    }
  });
  nextBtn.addEventListener('click', () => {
    if (index >= lastAvailable) {
      destroy();
      onClose();
      return;
    }
    index++;
    renderStep();
  });

  renderStep();
  title.tabIndex = -1;
  title.focus();

  // Escape zavře, Tab cyklí jen uvnitř dialogu (focus trap).
  //
  // POZOR, tahle past NENÍ táž jako v js/ui/dialogA11y.js a je slabší: fokus
  // po otevření stojí na nadpisu (tabindex="-1", tedy mimo pořadí Tabu), a to
  // není ani `first`, ani `last`, a v panelu leží - takže Shift+Tab z něj
  // nespustí žádnou větev a odveze dítě na obrazovku mise POD dialogem. Tentýž
  // tvar vady se ve sdíleném rámci opravoval a je z něj vidět i oprava:
  // počítat pořadí Tabu (viz TAB_STOPS/FOCUSABLE tam) místo výčtu tlačítek.
  // Než se to sjednotí, neopisujte tenhle blok jinam.
  function close() {
    destroy();
    onClose();
  }

  function keyHandler(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(panel.querySelectorAll('button:not(:disabled)'));
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

  function destroy() {
    document.removeEventListener('keydown', keyHandler);
    overlay.remove();
  }

  return { destroy };
}
