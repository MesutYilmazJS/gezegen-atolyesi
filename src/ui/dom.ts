// Küçük DOM yardımcıları
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let toastTimer = 0;
export function toast(message: string) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2600);
}

/** "?" bilgi butonu: dokunulunca açıklama baloncuğu gösterir */
export function infoButton(title: string, text: string): HTMLButtonElement {
  return h('button', {
    class: 'info-btn',
    type: 'button',
    'aria-label': `${title}: bilgi`,
    onclick: ((e: Event) => {
      e.stopPropagation();
      showInfo(e.currentTarget as HTMLElement, title, text);
    }) as EventListener,
  }, '?');
}

function showInfo(anchor: HTMLElement, title: string, text: string) {
  document.querySelector('.info-pop')?.remove();
  const pop = h('div', { class: 'info-pop', role: 'dialog', 'aria-label': title }, h('strong', {}, title), h('p', {}, text));
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = Math.min(300, window.innerWidth - 32);
  pop.style.width = `${pw}px`;
  const left = Math.min(Math.max(16, r.left - pw / 2), window.innerWidth - pw - 16);
  pop.style.left = `${left}px`;
  const below = r.bottom + 8;
  pop.style.top = `${below}px`;
  requestAnimationFrame(() => {
    if (below + pop.offsetHeight > window.innerHeight - 16) pop.style.top = `${Math.max(16, r.top - pop.offsetHeight - 8)}px`;
  });
  const close = (e: Event) => {
    if (!pop.contains(e.target as Node)) {
      pop.remove();
      document.removeEventListener('pointerdown', close, true);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', close, true));
}

export function modal(title: string, content: HTMLElement, closeLabel: string): { el: HTMLElement; close: () => void } {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const dialog = h(
    'div',
    { class: 'modal panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', {}, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': closeLabel, onclick: close }, '✕')),
    content,
  );
  backdrop.append(dialog);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  return { el: dialog, close };
}
