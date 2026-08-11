/**
 * Obrazovka mise (UCV-MISSION-001): postup, příklad, vstup,
 * okamžitá zpětná vazba, avatar, přeskočení, kroky po 2. chybě.
 * DOM vrstva nad js/engine/mission.js.
 */

import { createAnswerInput } from './answerInput.js';
import { createAvatar, createBossArt } from './avatar.js';
import { createSolutionViewer } from './solutionViewer.js';
import { createStepSession } from '../engine/stepSession.js';
import { createStepInput } from './stepInput.js';
import { createTileEquationBuilder } from './tileEquationBuilder.js';
import { createFreeEquationInput } from './freeEquationInput.js';
import { formatExpr, solveLinearSteps } from '../content/solver.js';
import { equationInputKind, machineOperations } from '../content/wordProblems.js';

/**
 * Text vrstvené nápovědy ve fázi 'napiš rovnici' slovní úlohy (UCV-MISSION-003).
 * Čistá funkce kvůli testům - DOM vrstva ji jen zobrazí.
 * 1 = označ si neznámou x, 2 = nápověda k překladu fráze (writeHint z generátoru,
 * nikdy ne celá rovnice), 3 = ukázat rovnici.
 */
export function wordEquationHintText(exercise, hintLevel) {
  if (hintLevel <= 1) {
    return 'Co je neznámá? Označ si ji x.';
  }
  if (hintLevel === 2) {
    return exercise.writeHint ?? exercise.hint;
  }
  const { left, right } = exercise.equation;
  return `Rovnice je: ${formatExpr(left)} = ${formatExpr(right)}`;
}

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object} options.mission instance z createMission()
 * @param {() => void} options.onExit přerušení mise (návrat na mapu, postup se zahodí)
 * @param {(summary: object) => void} options.onFinish dokončení mise
 * @returns {{ destroy: () => void }}
 */
export function createMissionScreen(container, { mission, onExit, onFinish, hasSword = false }) {
  const isBoss = !!mission.isBoss;
  const root = document.createElement('div');
  root.className = 'mission' + (isBoss ? ' boss-fight' : '');

  // Skrytý nadpis pro focus management a screen reader.
  const h1 = document.createElement('h1');
  h1.className = 'visually-hidden';
  h1.textContent = mission.config.title ?? 'Mise';

  // --- Hlavička: postup (nebo boss HP) + opuštění ---
  const header = document.createElement('div');
  header.className = 'mission-header';
  const progressEl = document.createElement('span');
  progressEl.className = 'mission-progress';
  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'btn btn-ghost';
  exitBtn.textContent = 'Zpět na mapu';
  header.append(progressEl, exitBtn);

  // --- Boss panel (HP + štíty) ---
  let bossHpBar = null;
  let shieldsEl = null;
  let bossArt = null;
  if (isBoss) {
    bossArt = createBossArt();
    bossHpBar = document.createElement('div');
    bossHpBar.className = 'boss-hp';
    bossHpBar.setAttribute('role', 'img');
    shieldsEl = document.createElement('div');
    shieldsEl.className = 'player-shields';
    shieldsEl.setAttribute('role', 'img');
  }

  // --- Avatar + příklad ---
  const stage = document.createElement('div');
  stage.className = 'mission-stage';
  const avatar = createAvatar({ saber: hasSword });

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
  /**
   * Popisek nápovědy se mění podle úrovně - musí se měnit i přístupný
   * název, jinak čtečka pořád hlásí 'Nápověda' a uživatel se nedozví,
   * že tlačítko teď nabízí víc.
   */
  function setHintLabel(text) {
    hintBtn.textContent = `💡 ${text}`;
    hintBtn.setAttribute('aria-label', text);
  }
  setHintLabel('Nápověda');

  // --- Vstup (klávesnice nebo výběr pro compare) ---
  const inputHost = document.createElement('div');
  inputHost.className = 'mission-input';

  // --- Přeskočit (u bosse není - souboj se nedá přeskočit) ---
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn-ghost';
  skipBtn.textContent = 'Přeskočit';

  // Nápověda a přeskočení vedle sebe - nad sebou zabírají výšku, kterou
  // krokový režim potřebuje na rovnici a váhu.
  const footer = document.createElement('div');
  footer.className = 'mission-footer';
  footer.append(hintBtn, skipBtn);

  root.append(h1, header, stage, stepsPanel, inputHost, footer);
  if (isBoss) {
    // Boss: HP lišta nahoře, boss postava do stage, štíty hráče
    stage.prepend(bossArt);
    header.prepend(bossHpBar);
    header.insertBefore(shieldsEl, exitBtn);
    progressEl.hidden = true;
    skipBtn.hidden = true;
  }
  container.appendChild(root);

  let input = null;
  let timer = null;       // feedback pauza mezi příklady - ruší se v destroy()
  let accepting = true;   // zámek vstupu během feedback pauzy (dvojklik, skip)
  let hintLevel = 0;      // 0 = žádná, 1 = návod, 2 = první krok, 3 = celé řešení
  let viewer = null;
  let stepSession = null; // relace krokového řešení, null mimo krokový režim
  let stepUi = null;

  const stepModeEnabled = !!mission.config.stepMode;

  /**
   * Příklad pro vysvětlení. V krokovém režimu se kroky přepočítají z místa,
   * kde hráč právě stojí - jeho cesta se od té solverovy může lišit a ukázat
   * mu kanonické kroky původního zadání by bylo matoucí.
   */
  function exerciseForExplanation() {
    const exercise = mission.currentExercise;
    if (!stepSession || stepSession.isDone) {
      return exercise;
    }
    // Rovnicové relace (včetně delegace ze slovní úlohy) nesou aktuální stav;
    // ostatní relace (zlomky) kroky z generátoru používají přímo.
    const state = stepSession.equationState;
    if (!state) {
      return exercise;
    }
    return { ...exercise, steps: solveLinearSteps(state.left, state.right) };
  }

  function openSolutionViewer(startStep = 0, maxSteps = null) {
    closeViewer();
    viewer = createSolutionViewer(root, {
      exercise: exerciseForExplanation(),
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
    if (isBoss) {
      bossHpBar.innerHTML = '';
      bossHpBar.setAttribute('aria-label', `Boss HP: ${mission.hp} z ${mission.maxHp}`);
      for (let i = 0; i < mission.maxHp; i++) {
        const cell = document.createElement('span');
        cell.className = 'boss-hp-cell' + (i < mission.hp ? ' full' : '');
        bossHpBar.appendChild(cell);
      }
      shieldsEl.innerHTML = '';
      shieldsEl.setAttribute('aria-label', `Štíty: ${mission.shields} ze 3`);
      for (let i = 0; i < 3; i++) {
        const shield = document.createElement('span');
        shield.className = 'shield' + (i < mission.shields ? ' full' : '');
        shield.textContent = '🛡';
        shieldsEl.appendChild(shield);
      }
      return;
    }
    const { current, total } = mission.progress;
    progressEl.textContent = `Příklad ${current}/${total}`;
  }

  function destroyInput() {
    if (input) {
      input.destroy();
      input = null;
    }
    if (stepUi) {
      stepUi.destroy();
      stepUi = null;
    }
  }

  function renderExercise() {
    if (!accepting) {
      // renderExercise zrušeného timera by se neměl zavolat, ale pojistka:
      return;
    }
    const exercise = mission.currentExercise;
    exerciseEl.textContent = exercise.text;
    exerciseEl.hidden = false;
    exerciseEl.classList.remove('exercise-text--corner');
    feedback.textContent = '';
    stepsPanel.hidden = true;
    stepsPanel.innerHTML = '';
    hintLevel = 0;
    setHintLabel('Nápověda');
    hintBtn.classList.remove('attention');
    closeViewer();
    destroyInput();
    inputHost.innerHTML = '';

    // Krokový režim je u slovních úloh VŽDY zapnutý (DEC-010) - příznak
    // stepMode v konfiguraci mise je pro ně bez významu.
    const wantsSteps = stepModeEnabled || exercise.topic === 'wordProblems';
    stepSession = wantsSteps ? createStepSession(exercise) : null;
    root.classList.toggle('mission--step', !!(stepSession && stepSession.isActive));
    const isWordSetup =
      !!stepSession && stepSession.kind === 'wordProblem' && stepSession.phase === 'writeEquation';
    root.classList.toggle('mission--word', isWordSetup);
    if (isWordSetup) {
      // Fáze 'napiš rovnici': zadání velkým písmem renderuje builder, karta
      // by ho zdvojovala - a po validaci se zmenší do rohu (enterWordSteps).
      exerciseEl.hidden = true;
      const ops = machineOperations(exercise);
      if (ops) {
        inputHost.appendChild(buildMachineDiagram(ops));
      }
      const createBuilder =
        equationInputKind(exercise.difficulty) === 'tiles'
          ? createTileEquationBuilder
          : createFreeEquationInput;
      input = createBuilder(inputHost, {
        problemText: exercise.text,
        expected: exercise.equation,
        onSubmit: handleEquationSubmit,
      });
      renderProgress();
      return;
    }
    if (stepSession && stepSession.isActive) {
      // Zadání ukazuje krokový vstup jako první položku cesty, karta by
      // ho zdvojovala - a její statický text by navíc zamrzl na původní rovnici.
      exerciseEl.hidden = true;
      stepUi = createStepInput(inputHost, {
        session: stepSession,
        onFeedback: handleStepFeedback,
        onSolved: handleStepSolved,
      });
      renderProgress();
      return;
    }

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

  /**
   * Početní stroj jako jednoduchý diagram šipek: vstup -> operace -> výstup.
   * Generuje se ze struktury úlohy (machineOperations), nekreslí se ručně.
   */
  function buildMachineDiagram(ops) {
    const diagram = document.createElement('div');
    diagram.className = 'machine-diagram';
    diagram.setAttribute('role', 'img');
    diagram.setAttribute(
      'aria-label',
      `Početní stroj: vstup, pak ${ops.map((op) => `${op.symbol} ${op.value}`).join(', pak ')}, výstup`
    );
    const node = (text, className) => {
      const el = document.createElement('span');
      el.className = className;
      el.textContent = text;
      return el;
    };
    const arrow = () => {
      const el = node('→', 'machine-arrow');
      el.setAttribute('aria-hidden', 'true');
      return el;
    };
    diagram.append(node('vstup', 'machine-node'));
    for (const op of ops) {
      diagram.append(arrow(), node(`${op.symbol} ${op.value}`, 'machine-op'));
    }
    diagram.append(arrow(), node('výstup', 'machine-node'));
    return diagram;
  }

  /**
   * Výsledek validace hráčovy rovnice z builderu (UCV-MISSION-003).
   * Builder hlášku i zatřesení ukáže sám; mise tu jen počítá chyby
   * (mismatch = equationSetup) a po uznání přechází do krokového režimu.
   */
  function handleEquationSubmit(result) {
    if (!accepting || viewer || !stepSession || stepSession.kind !== 'wordProblem') {
      return;
    }
    const recorded = stepSession.recordEquationResult(result);
    if (!recorded.advanced) {
      if (result.status === 'mismatch') {
        avatar.react('wrong');
        hintBtn.classList.add('attention');
      }
      // unparseable = nedopsaný zápis - jen hláška u builderu, žádná chyba.
      return;
    }
    avatar.react('correct');
    enterWordSteps();
  }

  /**
   * Přechod z fáze 'napiš rovnici' do krokového řešení: zadání se zmenší
   * do rohu karty (hráč ho může kdykoliv znovu přečíst) a obrazovka se
   * přepne na standardní krokový vstup (UCV-STEP-001) nad HRÁČOVOU
   * rovnicí - relace už startuje z multiTerm ?? canonical (DEC-011/012).
   */
  function enterWordSteps() {
    destroyInput();
    inputHost.innerHTML = '';
    root.classList.remove('mission--word');
    exerciseEl.hidden = false;
    exerciseEl.classList.add('exercise-text--corner');
    feedback.textContent = '';
    hintLevel = 0;
    setHintLabel('Nápověda');
    stepsPanel.hidden = true;
    stepsPanel.innerHTML = '';
    stepUi = createStepInput(inputHost, {
      session: stepSession.equationSession,
      onFeedback: handleStepFeedback,
      onSolved: handleStepSolved,
    });
  }

  /**
   * Zpětná vazba na jednotlivý krok - příklad tím ještě nekončí.
   * Text hlásí krokový vstup u tlačítka, kterým hráč právě klikal;
   * karta by ho jen zdvojila na druhém konci obrazovky.
   */
  function handleStepFeedback(result) {
    if (!accepting || viewer) {
      return;
    }
    if (result.status === 'accepted') {
      avatar.react('correct');
      return;
    }
    if (result.status === 'reverted' || result.status === 'invalid') {
      return;
    }
    avatar.react('wrong');
    if (stepSession.shouldOfferHint) {
      hintBtn.classList.add('attention');
    }
    if (stepSession.shouldShowHelp) {
      // Jen první krok z aktuálního stavu - celé řešení by prozradilo
      // odpověď kroku, který má hráč právě vyřešit (UCV-LEARN-001).
      openSolutionViewer(0, 1);
    }
  }

  /** Příklad dořešen po krocích - zápis do mise a přechod na další. */
  function handleStepSolved() {
    if (!accepting) {
      return;
    }
    accepting = false;
    const outcome = mission.recordStepResult(stepSession.getOutcome());
    avatar.react('correct');
    if (isBoss && bossArt) {
      bossArt.classList.remove('boss-hit');
      void bossArt.offsetWidth;
      bossArt.classList.add('boss-hit');
      feedback.textContent = outcome.missionDone ? 'Zásah! Boss padá!' : 'Zásah mečem! Vyřešeno!';
    } else {
      feedback.textContent = 'Vyřešeno krok za krokem! Krystal je blíž.';
    }
    renderProgress();
    if (outcome.missionDone) {
      timer = setTimeout(() => {
        timer = null;
        destroy();
        onFinish(mission.getSummary());
      }, 1100);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      accepting = true;
      renderExercise();
    }, 1100);
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
    const outcome = mission.recordAnswer(
      result.status === 'wrong' ? 'wrong' : 'correct',
      result.errorKind ?? null
    );

    if (outcome.outcome === 'correct') {
      accepting = false; // během pauzy se nepřijímá nic - ani skip, ani další klik
      avatar.react('correct');
      if (isBoss && bossArt) {
        bossArt.classList.remove('boss-hit');
        void bossArt.offsetWidth;
        bossArt.classList.add('boss-hit');
        feedback.textContent =
          result.status === 'correct-unsimplified' && result.note
            ? result.note
            : outcome.missionDone
              ? 'Zásah! Boss padá!'
              : 'Zásah mečem! Správně!';
      } else {
        feedback.textContent =
          result.status === 'correct-unsimplified' ? result.note : 'Správně! Krystal je blíž.';
      }
      renderProgress(); // boss HP se překreslí hned, ne až s dalším příkladem
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
    renderProgress(); // štíty se překreslí hned
    if (mission.shouldOfferHint) {
      hintBtn.classList.add('attention');
    }
    if (outcome.showSteps) {
      // Po 2. chybě u stejného příkladu automaticky krokové vysvětlení (UCV-LEARN-001).
      feedback.textContent =
        isBoss && outcome.healed
          ? 'Boss se uzdravil na polovinu HP! Koukneme se na to krok za krokem:'
          : 'Koukneme se na to krok za krokem:';
      openSolutionViewer();
    } else if (isBoss && outcome.healed) {
      feedback.textContent = 'Boss tě srazil a uzdravil se na polovinu HP! Nevzdávej to!';
    } else if (isBoss) {
      feedback.textContent = 'Bossův protiútok! Ztrácíš štít.';
    } else {
      feedback.textContent = 'To není ono - zkus to znovu.';
    }
  }

  // Vrstvená nápověda: 1 = návod, 2 = první krok, 3 = celé řešení (UCV-LEARN-002).
  // Ve fázi 'napiš rovnici' slovní úlohy jsou vrstvy jiné (UCV-MISSION-003):
  // 1 = označ si neznámou x, 2 = nápověda k překladu fráze, 3 = ukázat rovnici.
  hintBtn.addEventListener('click', () => {
    if (!accepting) {
      return;
    }
    mission.useHint();
    hintBtn.classList.remove('attention');
    hintLevel = Math.min(hintLevel + 1, 3);

    if (stepSession && stepSession.kind === 'wordProblem' && stepSession.phase === 'writeEquation') {
      const exercise = mission.currentExercise;
      stepsPanel.innerHTML = '';
      const p = document.createElement('p');
      if (hintLevel === 1) {
        p.textContent = wordEquationHintText(exercise, 1);
        setHintLabel('Víc pomoct');
      } else if (hintLevel === 2) {
        // Nápověda k překladu konkrétní fráze - text nese generátor (writeHint),
        // nikdy ne celá rovnice (tu ukáže až vrstva 3).
        p.textContent = wordEquationHintText(exercise, 2);
        setHintLabel('Ukaž rovnici');
      } else {
        // Teprve třetí vrstva prozradí správnou rovnici.
        p.textContent = wordEquationHintText(exercise, 3);
        setHintLabel('Nápověda');
      }
      stepsPanel.appendChild(p);
      stepsPanel.hidden = false;
      return;
    }

    // V krokovém režimu se druhá úroveň počítá z místa, kde hráč stojí.
    const exercise = exerciseForExplanation();

    if (hintLevel === 1) {
      stepsPanel.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = exercise.hint;
      stepsPanel.appendChild(p);
      stepsPanel.hidden = false;
      setHintLabel('Víc pomoct');
    } else if (hintLevel === 2) {
      stepsPanel.innerHTML = '';
      const first = exercise.steps[0];
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = first.operation;
      p.append(strong, document.createTextNode(`  ${first.leftSide} = ${first.rightSide}`));
      stepsPanel.appendChild(p);
      stepsPanel.hidden = false;
      setHintLabel('Ukaž celé řešení');
    } else {
      stepsPanel.hidden = true;
      setHintLabel('Nápověda');
      openSolutionViewer();
    }
  });

  exitBtn.addEventListener('click', () => {
    destroy();
    onExit();
  });

  if (!isBoss) {
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
  }

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
