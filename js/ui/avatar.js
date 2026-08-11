/**
 * Postavička padawana - jednoduchá blocky SVG postava s reakcemi
 * (UCV-MISSION-001). Reakce = CSS animace (radost / zaváhání).
 * S postaveným mečem (UCV-REWARD-002) drží v ruce světlou čepel,
 * s díly světelného brnění (UCV-REWARD-003) má helmu, plášť a rukavice.
 *
 * SVG se skládá přes createElementNS (ne innerHTML), aby šla postavička
 * testovat prvek po prvku - odměna, kterou nikdo neuvidí, je vada.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.saber] zobrazit světelný meč v ruce
 * @param {{helmet?: boolean, cloak?: boolean, gloves?: boolean}} [options.armor]
 *        kusy světelného brnění - každý se ukáže hned, jak ho hráč postaví
 * @returns {{ element: HTMLElement, react: (kind: 'correct'|'wrong'|'idle') => void }}
 */
export function createAvatar({ saber = false, armor = {} } = {}) {
  const { helmet = false, cloak = false, gloves = false } = armor;

  const el = document.createElement('div');
  el.className = 'avatar';
  el.setAttribute('aria-hidden', 'true');

  const svg = svgEl('svg', { viewBox: '0 0 64 80', width: 96, height: 120, class: 'avatar-art' });

  // blocky postava: hlava, tělo, ruce, nohy
  svg.appendChild(svgEl('rect', { x: 20, y: 4, width: 24, height: 20, rx: 3, fill: '#e8b98a' }));
  if (helmet) {
    // Helma kryje vlasy a čelo, oči zůstávají vidět - postavička musí dál
    // koukat a reagovat, jinak přijde mise o svého průvodce.
    svg.appendChild(svgEl('rect', { class: 'armor-helmet', x: 18, y: 0, width: 28, height: 11, rx: 4, fill: '#ffd94d' }));
    // Tmavý lem odděluje helmu od obličeje: zlatá proti pleti má kontrast
    // 1.3:1, takže by okraj helmy nad čelem nebyl vidět. Sedí nad očima
    // (y 13-18), ne na nich - padawan musí koukat, ne mít hledí.
    svg.appendChild(svgEl('rect', { class: 'armor-helmet', x: 18, y: 8, width: 28, height: 3, fill: '#2b3252' }));
  } else {
    svg.appendChild(svgEl('rect', { x: 20, y: 4, width: 24, height: 8, rx: 3, fill: '#6b4a2b' }));
  }
  svg.appendChild(svgEl('rect', { x: 24, y: 13, width: 5, height: 5, fill: '#1b2340' }));
  svg.appendChild(svgEl('rect', { x: 35, y: 13, width: 5, height: 5, fill: '#1b2340' }));
  svg.appendChild(svgEl('rect', { class: 'avatar-mouth', x: 27, y: 20, width: 10, height: 2.5, rx: 1, fill: '#7a4b3a' }));

  svg.appendChild(svgEl('rect', { x: 16, y: 26, width: 32, height: 30, rx: 4, fill: '#7a5c3e' }));
  svg.appendChild(svgEl('rect', { x: 16, y: 26, width: 32, height: 6, fill: '#5d4630' }));
  if (cloak) {
    // Plášť visí po stranách trupu, aby nezakryl tvář ani ruce.
    svg.appendChild(svgEl('polygon', { class: 'armor-cloak', points: '16,26 10,60 20,60 20,26', fill: '#ffd94d' }));
    // Stinná strana pláště zůstává zlatá (3.2:1 proti hnědé tunice) - tmavší
    // odstín by na tunice zmizel.
    svg.appendChild(svgEl('polygon', { class: 'armor-cloak', points: '48,26 54,60 44,60 44,26', fill: '#e8b33a' }));
  }
  svg.appendChild(svgEl('rect', { x: 6, y: 28, width: 9, height: 24, rx: 3, fill: '#7a5c3e' }));
  svg.appendChild(svgEl('rect', { x: 49, y: 28, width: 9, height: 24, rx: 3, fill: '#7a5c3e' }));
  if (gloves) {
    svg.appendChild(svgEl('rect', { class: 'armor-gloves', x: 5, y: 44, width: 11, height: 10, rx: 3, fill: '#ffd94d' }));
    svg.appendChild(svgEl('rect', { class: 'armor-gloves', x: 48, y: 44, width: 11, height: 10, rx: 3, fill: '#ffd94d' }));
  }
  svg.appendChild(svgEl('rect', { x: 20, y: 58, width: 10, height: 18, rx: 3, fill: '#3d3d55' }));
  svg.appendChild(svgEl('rect', { x: 34, y: 58, width: 10, height: 18, rx: 3, fill: '#3d3d55' }));

  if (saber) {
    svg.appendChild(svgEl('rect', { x: 50, y: 20, width: 5, height: 10, rx: 2, fill: '#9aa3c7' }));
    svg.appendChild(svgEl('rect', { class: 'saber-blade', x: 51, y: 2, width: 3, height: 18, rx: 1.5, fill: '#6fd3ff' }));
  }

  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Padawan');
  el.appendChild(svg);

  return {
    element: el,
    react(kind) {
      el.classList.remove('avatar-correct', 'avatar-wrong');
      // restart animace
      void el.offsetWidth;
      if (kind === 'correct') {
        el.classList.add('avatar-correct');
      } else if (kind === 'wrong') {
        el.classList.add('avatar-wrong');
      }
    },
  };
}

/** Blocky boss postava (temný rytíř) s HP. */
export function createBossArt() {
  const el = document.createElement('div');
  el.className = 'boss-art';
  el.setAttribute('aria-hidden', 'true');

  const svg = svgEl('svg', { viewBox: '0 0 64 80', width: 80, height: 100, role: 'img', 'aria-label': 'Boss' });
  svg.appendChild(svgEl('rect', { x: 18, y: 6, width: 28, height: 22, rx: 4, fill: '#2b2f45' }));
  svg.appendChild(svgEl('rect', { x: 18, y: 6, width: 28, height: 7, rx: 3, fill: '#161929' }));
  svg.appendChild(svgEl('rect', { x: 24, y: 15, width: 6, height: 4, fill: '#ff4d4d' }));
  svg.appendChild(svgEl('rect', { x: 36, y: 15, width: 6, height: 4, fill: '#ff4d4d' }));
  svg.appendChild(svgEl('rect', { x: 14, y: 30, width: 36, height: 30, rx: 4, fill: '#23263a' }));
  svg.appendChild(svgEl('rect', { x: 4, y: 32, width: 9, height: 24, rx: 3, fill: '#23263a' }));
  svg.appendChild(svgEl('rect', { x: 51, y: 32, width: 9, height: 24, rx: 3, fill: '#23263a' }));
  svg.appendChild(svgEl('rect', { class: 'boss-blade', x: 52, y: 8, width: 4, height: 24, rx: 2, fill: '#ff4d4d' }));
  svg.appendChild(svgEl('rect', { x: 18, y: 62, width: 12, height: 16, rx: 3, fill: '#161929' }));
  svg.appendChild(svgEl('rect', { x: 34, y: 62, width: 12, height: 16, rx: 3, fill: '#161929' }));
  el.appendChild(svg);
  return el;
}
