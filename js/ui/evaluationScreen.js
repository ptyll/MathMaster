/**
 * Obrazovka vyhodnocení mise (UCV-MISSION-002):
 * hvězdy 1-3, krystal, souhrn, tlačítka další/znovu/mapa.
 */

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object} options.summary z mission.getSummary()
 * @param {object} options.granted z applyMissionResult() { starsGranted, crystalGranted, bonusGranted }
 * @param {boolean} options.hasNextMission existuje další mise?
 * @param {() => void} options.onReplay hrát znovu
 * @param {() => void} options.onNext další mise
 * @param {() => void} options.onMap zpět na mapu
 */
export function createEvaluationScreen(container, { summary, granted, hasNextMission, onReplay, onNext, onMap }) {
  const root = document.createElement('div');
  root.className = 'evaluation';

  const h1 = document.createElement('h1');
  h1.textContent = 'Mise splněna!';

  // --- Hvězdy za TENTO běh (animované postupné přičtení) ---
  const stars = document.createElement('div');
  stars.className = 'eval-stars';
  stars.setAttribute('aria-label', `${summary.stars} ze 3 hvězd`);
  for (let i = 1; i <= 3; i++) {
    const star = document.createElement('span');
    star.className = 'eval-star' + (i <= summary.stars ? ' earned' : '');
    star.textContent = '★';
    star.style.animationDelay = `${i * 0.35}s`;
    stars.appendChild(star);
  }

  // Uložené maximum (když byl hráč dřív lepší, pochval se za něj).
  let maxNote = null;
  if (granted.starsGranted > summary.stars) {
    maxNote = document.createElement('p');
    maxNote.className = 'eval-max-note';
    maxNote.textContent = `Tvoje maximum v této misi: ${granted.starsGranted}★`;
  }

  // --- Krystal ---
  const crystal = document.createElement('div');
  crystal.className = 'eval-crystal';
  const crystalIcon = document.createElement('div');
  crystalIcon.className = `crystal crystal-${summary.crystalColor}`;
  const crystalText = document.createElement('p');
  if (granted.crystalGranted && granted.bonusGranted) {
    crystalText.textContent = `Získáváš 2 krystaly (${summary.crystalColor}) - jeden za misi a bonus za 3 hvězdy!`;
  } else if (granted.crystalGranted) {
    crystalText.textContent = `Získáváš ${summary.crystalColor} krystal!`;
  } else if (granted.bonusGranted) {
    crystalText.textContent = `Bonusový krystal za 3 hvězdy (${summary.crystalColor})!`;
  } else {
    crystalText.textContent = 'Krystal z této mise už máš. Zkus to na 3 hvězdy pro bonus!';
  }
  crystal.append(crystalIcon, crystalText);

  // --- Souhrn ---
  const stats = document.createElement('p');
  stats.className = 'eval-stats';
  stats.textContent = `Správně napoprvé: ${summary.firstTryCount}/${summary.total} · Chyby: ${summary.mistakes}`;

  // --- Tlačítka ---
  const actions = document.createElement('div');
  actions.className = 'eval-actions';

  if (hasNextMission) {
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-primary';
    nextBtn.textContent = 'Další mise';
    nextBtn.addEventListener('click', onNext);
    actions.appendChild(nextBtn);
  }

  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.className = 'btn';
  replayBtn.textContent = 'Hrát znovu';
  replayBtn.addEventListener('click', onReplay);

  const mapBtn = document.createElement('button');
  mapBtn.type = 'button';
  mapBtn.className = 'btn btn-ghost';
  mapBtn.textContent = 'Zpět na mapu';
  mapBtn.addEventListener('click', onMap);

  actions.append(replayBtn, mapBtn);
  root.append(h1, stars, crystal, stats, actions);
  if (maxNote) {
    stats.appendChild(document.createElement('br'));
    stats.appendChild(maxNote);
  }
  container.appendChild(root);

  return {
    element: root,
    destroy() {
      root.remove();
    },
  };
}
