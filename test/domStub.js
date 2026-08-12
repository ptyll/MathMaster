/**
 * Minimální DOM stub pro testy UI vrstvy.
 *
 * Projekt nemá jsdom ani build krok, takže obrazovky (js/ui/*) byly dosud
 * netestované - a právě tam vznikly nejhorší nálezy revizí (chybějící
 * tlačítko, hláška, která se nikdy nezobrazí). Stub umí jen to, co
 * obrazovky opravdu volají: vytvořit prvek, třídy, atributy, text, klik
 * a pár jednoduchých selektorů. Kdo potřebuje víc, ať to sem dopíše -
 * cílem je zachytit "prvek existuje / je vidět / klik něco udělá",
 * ne emulovat prohlížeč. Jediná záměrná odchylka od DOM: querySelectorAll
 * vrací obyčejné pole (ne NodeList), aby se v testu dalo psát find/filter.
 *
 * Použití: `const dom = installDom();` na začátku testu.
 */

let currentDocument = null;

class StubElement {
  constructor(tagName, namespaceURI = null) {
    this.tagName = String(tagName).toUpperCase();
    this.namespaceURI = namespaceURI;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = 0;
    this.type = '';
    this._text = '';
    this._classes = new Set();
    this._listeners = new Map();
  }

  get className() {
    return [...this._classes].join(' ');
  }

  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get classList() {
    return {
      add: (...names) => names.forEach((n) => this._classes.add(n)),
      remove: (...names) => names.forEach((n) => this._classes.delete(n)),
      contains: (name) => this._classes.has(name),
      toggle: (name, force) => {
        const on = force ?? !this._classes.has(name);
        if (on) {
          this._classes.add(name);
        } else {
          this._classes.delete(name);
        }
        return on;
      },
    };
  }

  /** Je prvek zavěšený pod document.body? Odpojený podstrom nemá rozložení. */
  get isConnected() {
    let node = this;
    while (node.parentNode) {
      node = node.parentNode;
    }
    return node === currentDocument?.body;
  }

  /**
   * Rozložení stub neumí, takže posun jen zaznamená - testu stačí vědět,
   * na KTERÝ prvek se hra posunula (mapa scrolluje na rozehranou planetu).
   * Na ODPOJENÉM prvku ale posun zahodíme: prohlížeč tam nemá layout box a
   * scrollIntoView je podle specifikace no-op. Kdyby stub zaznamenával i
   * tenhle případ, test by zeleně kryl mapu, která se ve hře neposune.
   */
  scrollIntoView(options = {}) {
    if (!this.isConnected) {
      return;
    }
    this.scrolledIntoView = options;
  }

  /** Text celého podstromu - testy se ptají na obsah karty, ne jednoho uzlu. */
  get textContent() {
    return this._text + this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(value) {
    this._text = String(value);
    this.childNodes.forEach((c) => {
      c.parentNode = null;
    });
    this.childNodes = [];
  }

  get innerHTML() {
    return '';
  }

  /** Podporujeme jen `innerHTML = ''` - tedy vyprázdnění před překreslením. */
  set innerHTML(value) {
    if (String(value) !== '') {
      throw new Error('DOM stub: innerHTML umí jen vyprázdnění (hra HTML řetězce nevkládá)');
    }
    this.childNodes.forEach((c) => {
      c.parentNode = null;
    });
    this.childNodes = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  append(...nodes) {
    nodes.forEach((n) => this.appendChild(n));
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
      this.parentNode = null;
    }
  }

  /** Vloží uzly na začátek - boss obrazovka takhle staví HP lištu a bosse. */
  prepend(...nodes) {
    nodes.forEach((n, i) => {
      n.parentNode = this;
      this.childNodes.splice(i, 0, n);
    });
  }

  insertBefore(node, reference) {
    node.parentNode = this;
    const at = this.childNodes.indexOf(reference);
    this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, node);
    return node;
  }

  contains(node) {
    return node === this || this.descendants().includes(node);
  }

  /**
   * Nejbližší předek (včetně sebe), na který sedí selektor. Hra se tím ptá,
   * jestli je fokusovaný prvek uvnitř otevřeného modálu ([role="dialog"]).
   */
  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'tabindex') {
      this.tabIndex = Number(value);
    }
    if (name === 'class') {
      this.className = value;
    }
  }

  getAttribute(name) {
    if (name === 'tabindex' && !this.attributes.has('tabindex')) {
      return String(this.tabIndex);
    }
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this._listeners.get(type) ?? [];
    this._listeners.set(
      type,
      list.filter((h) => h !== handler)
    );
  }

  dispatch(type, event = {}) {
    const base = { type, target: this, preventDefault() {}, stopPropagation() {} };
    for (const handler of [...(this._listeners.get(type) ?? [])]) {
      handler({ ...base, ...event });
    }
  }

  click() {
    if (this.disabled) {
      return; // zakázané tlačítko v prohlížeči klik nespustí
    }
    this.dispatch('click');
  }

  /**
   * Na ODPOJENÉM prvku je focus() v prohlížeči no-op - stejně jako
   * scrollIntoView. Stub to musí modelovat, jinak by zeleně kryl dialog,
   * který si volá focus() dřív, než se vloží do dokumentu.
   */
  focus() {
    if (currentDocument && this.isConnected) {
      currentDocument.activeElement = this;
    }
  }

  descendants() {
    return this.childNodes.flatMap((c) => [c, ...c.descendants()]);
  }

  querySelectorAll(selector) {
    return this.descendants().filter((el) => matches(el, selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** Selektor: skupiny oddělené čárkou, uvnitř `tag`, `.trida`, `[attr="v"]`, `:not(:disabled)`. */
function matches(el, selector) {
  return String(selector)
    .split(',')
    .some((part) => matchesSingle(el, part.trim()));
}

function matchesSingle(el, selector) {
  if (selector === '') {
    return false;
  }
  if (selector.endsWith(':not(:disabled)')) {
    const base = selector.slice(0, -':not(:disabled)'.length);
    return !el.disabled && matchesSingle(el, base);
  }
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  if (selector.startsWith('[')) {
    const match = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (!match) {
      throw new Error(`DOM stub: nepodporovaný selektor ${selector}`);
    }
    const value = el.getAttribute(match[1]);
    return match[2] === undefined ? value !== null : value === match[2];
  }
  return el.tagName === selector.toUpperCase();
}

/**
 * Nasadí stub jako globální `document`. Vrací ho, aby si test mohl sáhnout
 * na activeElement nebo poslat klávesu (dispatch('keydown', { key: 'Escape' })).
 */
export function installDom() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    createElement: (tag) => new StubElement(tag),
    createElementNS: (ns, tag) => new StubElement(tag, ns),
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((h) => h !== handler)
      );
    },
    dispatch(type, event = {}) {
      const base = { type, preventDefault() {}, stopPropagation() {} };
      for (const handler of [...(listeners.get(type) ?? [])]) {
        handler({ ...base, ...event });
      }
    },
  };
  document.body = new StubElement('body');
  currentDocument = document;
  globalThis.document = document;
  return document;
}

/**
 * Kontejner pro render v testu. Zavěšený pod document.body, protože hra běží
 * v dokumentu - obrazovka renderovaná do odpojeného uzlu se chová jinak
 * (scrollIntoView je no-op) a test by kryl vadu, kterou hráč vidí.
 */
export function createContainer() {
  const container = new StubElement('div');
  currentDocument.body.appendChild(container);
  return container;
}
