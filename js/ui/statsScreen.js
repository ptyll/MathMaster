/**
 * Rodičovský přehled (UCV-STATS-001).
 * Střídmá obrazovka pro dospělého - žádné odměny a animace.
 *
 * Formy podle úlohy dat: souhrnná čísla jako dlaždice (ne graf o jednom
 * sloupci), úspěšnost per téma jako vodorovné pruhy v jednom odstínu
 * (jedna série = bez legendy, hodnoty přímo u pruhu), druhy chyb jako
 * tabulka - u sedmi kategorií s významem je tabulka čitelnější než graf.
 */

import { summarizeStats, formatPercent, formatDuration, MIN_EXERCISES_FOR_REPORT } from '../engine/stats.js';
import { titleFor, completedPlanetCount, COUNCIL_PLANET_COUNT } from '../engine/titles.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Barva pruhů: ověřená validátorem proti tmavému podkladu #161c3d. */
const BAR_COLOR = '#3b95e8';
const BAR_TRACK = '#232b57';

/**
 * @param {HTMLElement} container
 * @param {{ state: object, onBack: () => void }} options
 * @returns {{ destroy: () => void }}
 */
export function createStatsScreen(container, { state, onBack }) {
  const summary = summarizeStats(state);

  // Bez třídy 'screen' - tu už nese sekce z main.js a dvojité flex
  // centrování vysokého obsahu ořezává horní okraj.
  const root = document.createElement('div');
  root.className = 'stats-screen';

  const h1 = document.createElement('h1');
  h1.textContent = 'Přehled pro rodiče';
  h1.tabIndex = -1;

  const intro = document.createElement('p');
  intro.className = 'stats-intro';
  intro.textContent = 'Data zůstávají jen v tomhle prohlížeči, nikam se neodesílají.';

  // Profil hráče: jméno, titul a postup planetami (UCV-MAP-003). Stojí nad
  // podmínkou "dost dat" schválně - rodič se na titul může ptát dřív, než
  // se zapne vyhodnocení, a dítě se jím chlubí od první planety.
  const profile = document.createElement('p');
  profile.className = 'stats-profile';
  const playerName = document.createElement('span');
  playerName.className = 'stats-profile-name';
  playerName.textContent = state.profile?.name ?? 'Padawan';
  const rank = document.createElement('span');
  rank.className = 'stats-profile-title';
  rank.textContent = titleFor(state).label;
  const progress = document.createElement('span');
  progress.className = 'stats-profile-progress';
  // Počet bereme z téhož zdroje jako titul Rady (COUNCIL_PLANET_COUNT), ne
  // z PLANETS.length: dnes je to totéž, ale dvanáctá planeta by přehledu dala
  // '5 z 12', zatímco Rada by se pořád počítala z 11.
  progress.textContent = `${completedPlanetCount(state)} z ${COUNCIL_PLANET_COUNT} planet dokončeno`;
  profile.append(playerName, rank, progress);

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = 'Zpět na mapu';
  backBtn.addEventListener('click', onBack);

  root.append(h1, intro, profile);

  if (!summary.hasEnoughData) {
    const early = document.createElement('p');
    early.className = 'stats-early';
    early.textContent = `Zatím je brzy na vyhodnocení. Přehled se zapne po ${MIN_EXERCISES_FOR_REPORT} příkladech, zatím jich má ${summary.totalAttempts}.`;
    root.append(early, backBtn);
    container.appendChild(root);
    return { destroy: () => root.remove() };
  }

  root.append(
    buildSummaryTiles(summary),
    buildTopicChart(summary.topics),
    buildErrorTable(summary.topErrors),
    buildRecommendations(summary.recommendations),
    backBtn
  );
  container.appendChild(root);

  return {
    destroy() {
      root.remove();
    },
  };
}

/* --- Souhrnné dlaždice: pár čísel, ne graf --- */
function buildSummaryTiles(summary) {
  const wrap = document.createElement('div');
  wrap.className = 'stat-tiles';

  const tiles = [
    { value: String(summary.totalSolved), label: 'vyřešených příkladů' },
    { value: formatPercent(summary.overallSuccessRate), label: 'celková úspěšnost' },
    { value: String(summary.missionsCompleted), label: 'dokončených misí' },
    { value: formatDuration(summary.totalTimeMs), label: 'strávený čas' },
  ];

  for (const tile of tiles) {
    const el = document.createElement('div');
    el.className = 'stat-tile';
    const value = document.createElement('span');
    value.className = 'stat-tile-value';
    value.textContent = tile.value;
    const label = document.createElement('span');
    label.className = 'stat-tile-label';
    label.textContent = tile.label;
    el.append(value, label);
    wrap.appendChild(el);
  }
  return wrap;
}

/* --- Úspěšnost per téma: vodorovné pruhy, jedna série --- */
function buildTopicChart(topics) {
  const section = document.createElement('section');
  section.className = 'stats-section';

  const heading = document.createElement('h2');
  heading.textContent = 'Úspěšnost podle tématu';
  section.appendChild(heading);

  const rowHeight = 52;
  const barHeight = 18;
  const labelWidth = 170;
  const width = 560;
  // Vpravo musí zbýt místo na nejdelší popisek hodnoty ('nehráno'),
  // jinak text vyleze z výřezu a panel ho ořízne.
  const trackWidth = width - labelWidth - 105;
  const height = topics.length * rowHeight;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'stats-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    'Úspěšnost podle tématu: ' +
      topics
        .map((t) => `${t.label} ${t.successRate === null ? 'nehráno' : formatPercent(t.successRate)}`)
        .join(', ')
  );

  topics.forEach((topic, i) => {
    const y = i * rowHeight + rowHeight / 2;

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', 0);
    label.setAttribute('y', y + 5);
    label.setAttribute('class', 'stats-chart-label');
    label.textContent = topic.label;
    svg.appendChild(label);

    const track = document.createElementNS(SVG_NS, 'rect');
    track.setAttribute('x', labelWidth);
    track.setAttribute('y', y - barHeight / 2);
    track.setAttribute('width', trackWidth);
    track.setAttribute('height', barHeight);
    track.setAttribute('rx', 4);
    track.setAttribute('fill', BAR_TRACK);
    svg.appendChild(track);

    if (topic.successRate !== null) {
      const bar = document.createElementNS(SVG_NS, 'rect');
      bar.setAttribute('x', labelWidth);
      bar.setAttribute('y', y - barHeight / 2);
      bar.setAttribute('width', Math.max(4, trackWidth * topic.successRate));
      bar.setAttribute('height', barHeight);
      bar.setAttribute('rx', 4);
      bar.setAttribute('fill', BAR_COLOR);
      svg.appendChild(bar);
    }

    // Hodnota přímo u pruhu - jedna série se neznačí legendou.
    const value = document.createElementNS(SVG_NS, 'text');
    value.setAttribute('x', labelWidth + trackWidth + 10);
    value.setAttribute('y', y + 5);
    value.setAttribute('class', 'stats-chart-value');
    value.textContent = topic.successRate === null ? 'nehráno' : formatPercent(topic.successRate);
    svg.appendChild(value);

    const detail = document.createElementNS(SVG_NS, 'text');
    detail.setAttribute('x', 0);
    detail.setAttribute('y', y + 22);
    detail.setAttribute('class', 'stats-chart-detail');
    detail.textContent =
      topic.attempts === 0 ? '' : `${topic.solved} z ${topic.attempts} pokusů`;
    svg.appendChild(detail);
  });

  section.appendChild(svg);
  return section;
}

/* --- Druhy chyb: tabulka, ne graf --- */
function buildErrorTable(topErrors) {
  const section = document.createElement('section');
  section.className = 'stats-section';

  const heading = document.createElement('h2');
  heading.textContent = 'Nejčastější chyby';
  section.appendChild(heading);

  if (topErrors.length === 0) {
    const none = document.createElement('p');
    none.textContent = 'Zatím žádné zaznamenané chyby.';
    section.appendChild(none);
    return section;
  }

  const table = document.createElement('table');
  table.className = 'stats-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const text of ['Druh chyby', 'Počet', 'Co s tím']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  for (const error of topErrors.slice(0, 5)) {
    const tr = document.createElement('tr');

    const kind = document.createElement('th');
    kind.scope = 'row';
    const kindLabel = document.createElement('span');
    kindLabel.className = 'stats-error-label';
    kindLabel.textContent = error.label;
    const kindHint = document.createElement('span');
    kindHint.className = 'stats-error-hint';
    kindHint.textContent = error.hint;
    kind.append(kindLabel, kindHint);

    const count = document.createElement('td');
    count.className = 'stats-error-count';
    count.textContent = String(error.count);

    const advice = document.createElement('td');
    advice.textContent = error.advice;

    tr.append(kind, count, advice);
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  section.appendChild(table);
  return section;
}

function buildRecommendations(recommendations) {
  const section = document.createElement('section');
  section.className = 'stats-section stats-recommendations';

  const heading = document.createElement('h2');
  heading.textContent = 'Na co se zaměřit';
  section.appendChild(heading);

  const list = document.createElement('ul');
  for (const text of recommendations) {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}
