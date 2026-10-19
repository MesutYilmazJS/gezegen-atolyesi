// Küçük DOM yardımcıları
import { IconName, icon } from './icons';
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

export interface ModalOptions {
  icon?: IconName;
  subtitle?: string;
  /** Başlığın sağında ek içerik (ör. ilerleme) */
  extra?: HTMLElement;
  size?: 'sm' | 'md' | 'lg';
}

export function modal(
  title: string,
  content: HTMLElement,
  closeLabel: string,
  opts: ModalOptions = {},
): { el: HTMLElement; close: () => void } {
  const previous = document.activeElement as HTMLElement | null;
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => {
    backdrop.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => backdrop.remove(), 140);
    previous?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    // Odak pencerenin içinde kalsın
    if (e.key === 'Tab') {
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, summary, [tabindex]:not([tabindex="-1"])')).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const titleId = `modal-${Math.random().toString(36).slice(2, 8)}`;
  const closeBtn = h('button', { class: 'modal-close', type: 'button', 'aria-label': closeLabel, onclick: close }, icon('x', 18));
  const dialog = h(
    'div',
    { class: `modal panel ${opts.size ?? 'md'}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h(
      'header',
      { class: 'modal-head' },
      opts.icon ? h('span', { class: 'modal-icon' }, icon(opts.icon, 20)) : null,
      h('div', { class: 'modal-titles' }, h('h2', { id: titleId }, title), opts.subtitle ? h('p', { class: 'modal-sub' }, opts.subtitle) : null),
      opts.extra ?? null,
      closeBtn,
    ),
    h('div', { class: 'modal-body' }, content),
  );
  backdrop.append(dialog);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  requestAnimationFrame(() => closeBtn.focus());
  return { el: dialog, close };
}

/** İnce ilerleme çubuğu + metin (modal başlıkları için) */
export function progressPill(done: number, total: number): HTMLElement {
  return h(
    'div',
    { class: 'progress-pill', title: `${done} / ${total}` },
    h('span', { class: 'progress-pill-bar' }, h('span', { style: `width:${total ? (done / total) * 100 : 0}%` })),
    h('strong', {}, `${done}/${total}`),
  );
}
