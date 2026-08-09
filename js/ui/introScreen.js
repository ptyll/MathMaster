/**
 * Úvodní obrazovka a vytvoření profilu padawana (UCV-START-001).
 * Jméno je pouze lokální (localStorage), nikdy se neposílá na server.
 */

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {(name: string) => void} options.onStart zavolá se se jménem (max 20 znaků, výchozí 'Padawan')
 */
export function createIntroScreen(container, { onStart }) {
  const root = document.createElement('div');
  root.className = 'intro';

  const h1 = document.createElement('h1');
  h1.textContent = 'MathMaster';

  const story = document.createElement('p');
  story.className = 'intro-story';
  story.textContent =
    'Řád rytířů potřebuje tvoji pomoc. Síla plyne skrz matematiku - ' +
    'vyřeš rovnice a zlomky, sesbírej kyber krystaly z pěti planet ' +
    'a postav svůj světelný meč.';

  const form = document.createElement('div');
  form.className = 'intro-form';

  const label = document.createElement('label');
  label.className = 'intro-label';
  label.setAttribute('for', 'padawan-name');
  label.textContent = 'Jak se jmenuješ, padawane?';

  const input = document.createElement('input');
  input.id = 'padawan-name';
  input.className = 'intro-input';
  input.type = 'text';
  input.maxLength = 20;
  input.placeholder = 'Padawan';
  input.autocomplete = 'off';

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn-primary';
  startBtn.textContent = 'Začít výcvik';

  function start() {
    // Oříznutí po znacích (ne UTF-16 jednotkách) - emoji ve jméně neroztrhne pár.
    const name = [...input.value.trim()].slice(0, 20).join('') || 'Padawan';
    onStart(name);
  }

  startBtn.addEventListener('click', start);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      start();
    }
  });

  form.append(label, input, startBtn);
  root.append(h1, story, form);
  container.appendChild(root);

  return {
    element: root,
    destroy() {
      root.remove();
    },
  };
}
