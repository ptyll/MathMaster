/**
 * Obrazovka mise (UCV-MISSION-001): postup, příklad, vstup,
 * okamžitá zpětná vazba, avatar, přeskočení, kroky po 2. chybě.
 * DOM vrstva nad js/engine/mission.js.
 */

import { createAnswerInput } from './answerInput.js';
import { createAvatar } from './avatar.js';
import { createSolutionViewer } from './solutionViewer.js';

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object} options.mission instance z createMission()
 * @param {() => void} options.onExit přerušení mise (návrat na mapu, postup se zahodí)
 * @param {(summary: object) => void} options.onFinish dokončení mise
 * @returns {{ destroy: () => void }}
 */
export function createMissionScreen(container, { mission, onExit, onFinish }) {
  const root = document.createElement('div');
  root.className = 'mission';

  // Skrytý nadpis pro focus management a screen reader.
  const h1 = document.createElement('h1');
  h1.className = 'visually-hidden';
  h1.textContent = mission.config.title ?? 'Mise';

  // --- Hlavička: postup + opuštění ---
  const header = document.createElement('div');
  header.className = 'mission-header';
  const progressEl = document.createElement('span');
  progressEl.className = 'mission-progress';
  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'btn btn-ghost';
  exitBtn.textContent = 'Zpět na mapu';
  header.append(progressEl, exitBtn);

  // --- Avatar + příklad ---
  const stage = document.createElement('div');
  stage.className = 'mission-stage';
  const avatar = createAvatar();

  const card = document.createElement('div');
  card.className = 'mission-card';
  const exerciseEl = document.createElement('p');
  exerciseEl.className = 'exercise-text';
  exerciseEl.setAttribute('aria-live', 'polite');
  const feedback = document.createElement('p');
  feedback.className = 'answer-feedback';
  feedback.setAttribute('aria-live', 'polite');
  card.append(exerciseEl, feedback);
  stage.append(avatar.element, card);

  // --- Kroky řešení / nápověda (text) ---
  const stepsPanel = document.createElement('div');
  stepsPanel.className = 'steps-panel';
  stepsPanel.hidden = true;

  // --- Tlačítko nápovědy (UCV-LEARN-002) ---
  const hintBtn = document.createElement('button');
  hintBtn.type = 'button';
  hintBtn.className = 'btn btn-hint';
  hintBtn.textContent = '💡 Nápověda';
  hintBtn.setAttribute('aria-label', 'Nápověda');

  // --- Vstup (klávesnice nebo výběr pro compare) ---
  const inputHost = document.createElement('div');
  inputHost.className = 'mission-input';

  // --- Přeskočit ---
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn-ghost';
  skipBtn.textContent = 'Přeskočit';

  root.append(h1, header, stage, stepsPanel, inputHost, hintBtn, skipBtn);
  container.appendChild(root);

  let input = null;
  let timer = null;       // feedback pauza mezi příklady - ruší se v destroy()
  let accepting = true;   // zámek vstupu během feedback pauzy (dvojklik, skip)
  let hintLevel = 0;      // 0 = žádná, 1 = návod, 2 = první krok, 3 = celé řešení
  let viewer = null;

  function openSolutionViewer(startStep = 0, maxSteps = null) {
    closeViewer();
    viewer = createSolutionViewer(root, {
      exercise: mission.currentExercise,
      startStep,
      maxSteps,
      onClose: () => {
        viewer = null;
        hintBtn.focus();
      },
    });
  }

  function closeViewer() {
    if (viewer) {
      viewer.destroy();
      viewer = null;
    }
  }

  function renderProgress() {
    const { current, total } = mission.progress;
    progressEl.textContent = `Příklad ${current}/${total}`;
  }

  function destroyInput() {
    if (input) {
      input.destroy();
      input = null;
    }
  }

  function renderExercise() {
    if (!accepting) {
      // renderExercise zrušeného timera by se neměl zavolat, ale pojistka:
      return;
    }
    const exercise = mission.currentExercise;
    exerciseEl.textContent = exercise.text;
    feedback.textContent = '';
    stepsPanel.hidden = true;
    stepsPanel.innerHTML = '';
    hintLevel = 0;
    hintBtn.textContent = '💡 Nápověda';
    hintBtn.classList.remove('attention');
    closeViewer();
    destroyInput();
    inputHost.innerHTML = '';

    if (exercise.answer.kind === 'choice') {
      // Porovnávání zlomků: dvě velká tlačítka místo klávesnice.
      const wrap = document.createElement('div');
      wrap.className = 'choice-buttons';
      exercise.answer.options.forEach((option, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-choice';
        btn.textContent = option;
        btn.addEventListener('click', () => {
          if (!accepting) {
            return;
          }
          const value = i === 0 ? 'left' : 'right';
          handleResult({
            status: value === exercise.answer.value ? 'correct' : 'wrong',
            note: null,
          });
        });
        wrap.appendChild(btn);
      });
      inputHost.appendChild(wrap);
    } else {
      input = createAnswerInput(inputHost, {
        expected: exercise.answer,
        mode: exercise.answer.kind === 'fraction' ? 'fraction' : 'int',
        onSubmit: handleResult,
      });
    }
    renderProgress();
  }

  function handleResult(result) {
    if (!accepting || viewer) {
      // viewer = otevřené krokové vysvětlení - vstup za ním nesmí reagovat
      return;
    }
    if (result.status === 'invalid') {
      feedback.textContent = result.note;
      return;
    }
    const outcome = mission.recordAnswer(result.status === 'wrong' ? 'wrong' : 'correct');

    if (outcome.outcome === 'correct') {
      accepting = false; // během pauzy se nepřijímá nic - ani skip, ani další klik
      avatar.react('correct');
      feedback.textContent =
        result.status === 'correct-unsimplified' ? result.note : 'Správně! Krystal je blíž.';
      if (outcome.missionDone) {
        timer = setTimeout(() => {
          timer = null;
          destroy();
          onFinish(mission.getSummary());
        }, 900);
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        accepting = true;
        renderExercise();
      }, 900);
      return;
    }

    // Špatně - nic se neodebírá, jen se sníží hvězdy na konci.
    avatar.react('wrong');
    if (mission.shouldOfferHint) {
      hintBtn.classList.add('attention');
    }
    if (outcome.showSteps) {
      // Po 2. chybě u stejného příkladu automaticky krokové vysvětlení (UCV-LEARN-001).
      feedback.textContent = 'Koukneme se na to krok za krokem:';
      openSolutionViewer();
    } else {
      feedback.textContent = 'To není ono - zkus to znovu.';
    }
  }

  // Vrstvená nápověda: 1 = návod, 2 = první krok, 3 = celé řešení (UCV-LEARN-002).
  hintBtn.addEventListener('click', () => {
    if (!accepting) {
      return;
    }
    mission.useHint();
    hintBtn.classList.remove('attention');
    hintLevel = Math.min(hintLevel + 1, 3);
    const exercise = mission.currentExercise;

    if (hintLevel === 1) {
      stepsPanel.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = exercise.hint;
      stepsPanel.appendChild(p);
      stepsPanel.hidden = false;
      hintBtn.textContent = '💡 Víc pomoct';
    } else if (hintLevel === 2) {
      stepsPanel.innerHTML = '';
      const first = exercise.steps[0];
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = first.operation;
      p.append(strong, document.createTextNode(`  ${first.leftSide} = ${first.rightSide}`));
      stepsPanel.appendChild(p);
      stepsPanel.hidden = false;
      hintBtn.textContent = '💡 Ukaž celé řešení';
    } else {
      stepsPanel.hidden = true;
      hintBtn.textContent = '💡 Nápověda';
      openSolutionViewer();
    }
  });

  exitBtn.addEventListener('click', () => {
    destroy();
    onExit();
  });

  skipBtn.addEventListener('click', () => {
    if (!accepting) {
      return;
    }
    const result = mission.skip();
    if (result.missionDone) {
      destroy();
      onFinish(mission.getSummary());
    } else {
      renderExercise();
    }
  });

  renderExercise();

  function destroy() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    accepting = false;
    closeViewer();
    destroyInput();
    root.remove();
  }

  return { destroy };
}
