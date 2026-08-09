/**
 * Postavička padawana - jednoduchá blocky SVG postava s reakcemi
 * (UCV-MISSION-001). Reakce = CSS animace (radost / zaváhání).
 * S postaveným mečem (UCV-REWARD-002) drží v ruce světlou čepel.
 */

/**
 * @param {object} [options]
 * @param {boolean} [options.saber] zobrazit světelný meč v ruce
 * @returns {{ element: HTMLElement, react: (kind: 'correct'|'wrong'|'idle') => void }}
 */
export function createAvatar({ saber = false } = {}) {
  const el = document.createElement('div');
  el.className = 'avatar';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <svg viewBox="0 0 64 80" width="96" height="120" role="img" aria-label="Padawan">
      <!-- blocky postava: hlava, tělo, ruce, nohy -->
      <rect x="20" y="4" width="24" height="20" rx="3" fill="#e8b98a"/>
      <rect x="20" y="4" width="24" height="8" rx="3" fill="#6b4a2b"/>
      <rect x="24" y="13" width="5" height="5" fill="#1b2340"/>
      <rect x="35" y="13" width="5" height="5" fill="#1b2340"/>
      <rect class="avatar-mouth" x="27" y="20" width="10" height="2.5" rx="1" fill="#7a4b3a"/>
      <rect x="16" y="26" width="32" height="30" rx="4" fill="#7a5c3e"/>
      <rect x="16" y="26" width="32" height="6" fill="#5d4630"/>
      <rect x="6" y="28" width="9" height="24" rx="3" fill="#7a5c3e"/>
      <rect x="49" y="28" width="9" height="24" rx="3" fill="#7a5c3e"/>
      <rect x="20" y="58" width="10" height="18" rx="3" fill="#3d3d55"/>
      <rect x="34" y="58" width="10" height="18" rx="3" fill="#3d3d55"/>
      ${saber ? `
      <rect x="50" y="20" width="5" height="10" rx="2" fill="#9aa3c7"/>
      <rect class="saber-blade" x="51" y="2" width="3" height="18" rx="1.5" fill="#6fd3ff"/>` : ''}
    </svg>
  `;

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
  el.innerHTML = `
    <svg viewBox="0 0 64 80" width="80" height="100" role="img" aria-label="Boss">
      <rect x="18" y="6" width="28" height="22" rx="4" fill="#2b2f45"/>
      <rect x="18" y="6" width="28" height="7" rx="3" fill="#161929"/>
      <rect x="24" y="15" width="6" height="4" fill="#ff4d4d"/>
      <rect x="36" y="15" width="6" height="4" fill="#ff4d4d"/>
      <rect x="14" y="30" width="36" height="30" rx="4" fill="#23263a"/>
      <rect x="4" y="32" width="9" height="24" rx="3" fill="#23263a"/>
      <rect x="51" y="32" width="9" height="24" rx="3" fill="#23263a"/>
      <rect x="52" y="8" width="4" height="24" rx="2" fill="#ff4d4d" class="boss-blade"/>
      <rect x="18" y="62" width="12" height="16" rx="3" fill="#161929"/>
      <rect x="34" y="62" width="12" height="16" rx="3" fill="#161929"/>
    </svg>
  `;
  return el;
}
