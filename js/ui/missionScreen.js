/**
 * Obrazovka mise (UCV-MISSION-001): postup, příklad, vstup,
 * okamžitá zpětná vazba, avatar, přeskočení, kroky po 2. chybě.
 * DOM vrstva nad js/engine/mission.js.
 */

import { createAnswerInput } from './answerInput.js';
import { createAvatar } from './avatar.js';

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

  // --- Kroky řešení (po 2. chybě) ---
  const stepsPanel = document.createElement('div');
  stepsPanel.className = 'steps-panel';
  stepsPanel.hidden = true;

  // --- Vstup (klávesnice nebo výběr pro compare) ---
  const inputHost = document.createElement('div');
  inputHost.className = 'mission-input';

  // --- Přeskočit ---
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn-ghost';
  skipBtn.textContent = 'Přeskočit';

  root.append(h1, header, stage, stepsPanel, inputHost, skipBtn);
  container.appendChild(root);

  let input = null;
  let timer = null;       // feedback pauza mezi příklady - ruší se v destroy()
  let accepting = true;   // zámek vstupu během feedback pauzy (dvojklik, skip)

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
    if (!accepting) {
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
    if (outcome.showSteps) {
      feedback.textContent = 'Koukneme se na to krok za krokem:';
      renderSteps(mission.currentExercise.steps);
    } else {
      feedback.textContent = 'To není ono - zkus to znovu.';
    }
  }

  function renderSteps(steps) {
    stepsPanel.innerHTML = '';
    stepsPanel.hidden = false;
    const list = document.createElement('ol');
    for (const step of steps) {
      const li = document.createElement('li');
      const op = document.createElement('strong');
      op.textContent = step.operation;
      const eq = document.createElement('span');
      eq.textContent = `  ${step.leftSide} = ${step.rightSide}`;
      li.append(op, eq);
      list.appendChild(li);
    }
    stepsPanel.appendChild(list);
  }

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
    destroyInput();
    root.remove();
  }

  return { destroy };
}
