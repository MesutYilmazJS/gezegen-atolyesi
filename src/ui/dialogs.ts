import { BADGES, badgeIcon } from '../game/badges';
import { ENTRY_IDS } from '../game/encyclopedia';
import { MISSIONS, MissionId, isMissionAvailable } from '../game/missions';
import type { Progress } from '../game/progress';
import { REAL_PLANETS, RealPlanetId } from '../game/realPlanets';
import { t } from '../i18n';
import type { QualityMode } from '../render/engine';
import { Prefs, SavedPlanet, deleteFromAlbum, loadAlbum } from '../state/storage';
import { h, modal, toast } from './dom';
import { IconName, icon } from './icons';

export function openAlbum(onLoad: (p: SavedPlanet) => void) {
  const grid = h('div', { class: 'album-grid' });
  const { close } = modal(t.albumTitle, grid, t.close);

  const render = () => {
    grid.innerHTML = '';
    const album = loadAlbum();
    if (!album.length) {
      grid.append(h('p', { class: 'empty' }, t.albumEmpty));
      return;
    }
    for (const p of album) {
      grid.append(
        h(
          'article',
          { class: 'card' },
          h('img', { src: p.thumbnail, alt: p.name, loading: 'lazy' }),
          h('div', { class: 'card-body' },
            h('strong', {}, p.name),
            h('span', { class: 'muted' }, new Date(p.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })),
            h('span', { class: 'score' }, `${t.score}: ${p.score}`),
          ),
          h('div', { class: 'card-actions' },
            h('button', { type: 'button', class: 'btn primary', onclick: (() => { onLoad(p); close(); }) as EventListener }, t.load),
            h('button', {
              type: 'button',
              class: 'btn ghost',
              onclick: (() => {
                if (!confirm(t.confirmDelete)) return;
                deleteFromAlbum(p.id);
                toast(t.deleted);
                render();
              }) as EventListener,
            }, t.delete),
          ),
        ),
      );
    }
  };
  render();
}

export function openOptions(prefs: Prefs, onChange: (p: Prefs) => void) {
  const qualities: [QualityMode, string][] = [
    ['auto', t.qualityAuto],
    ['low', t.qualityLow],
    ['medium', t.qualityMedium],
    ['high', t.qualityHigh],
  ];
  const select = h('select', {
    id: 'opt-quality',
    onchange: (() => onChange({ ...prefs, quality: select.value as Prefs['quality'] })) as EventListener,
  }, ...qualities.map(([v, l]) => h('option', { value: v, selected: prefs.quality === v }, l)));

  const toggle = (id: string, label: string, key: 'batterySaver' | 'reduceMotion' | 'largeText' | 'music' | 'effects') => {
    const input = h('input', {
      type: 'checkbox',
      class: 'switch',
      id,
      checked: prefs[key],
      onchange: (() => {
        prefs = { ...prefs, [key]: input.checked };
        onChange(prefs);
      }) as EventListener,
    });
    return h('div', { class: 'control control-inline' }, h('label', { for: id }, label), input);
  };

  const theme = h('select', {
    id: 'opt-theme',
    onchange: (() => {
      prefs = { ...prefs, theme: theme.value as Prefs['theme'] };
      onChange(prefs);
    }) as EventListener,
  }, h('option', { value: 'dark', selected: prefs.theme === 'dark' }, t.themeDark), h('option', { value: 'light', selected: prefs.theme === 'light' }, t.themeLight));

  select.addEventListener('change', () => {
    prefs = { ...prefs, quality: select.value as Prefs['quality'] };
  });

  const content = h(
    'div',
    { class: 'options' },
    h('div', { class: 'control control-inline' }, h('label', { for: 'opt-quality' }, t.quality), select),
    toggle('opt-battery', t.batterySaver, 'batterySaver'),
    toggle('opt-motion', t.reduceMotion, 'reduceMotion'),
    toggle('opt-large', t.largeText, 'largeText'),
    toggle('opt-music', t.music, 'music'),
    toggle('opt-effects', t.effects, 'effects'),
    h('div', { class: 'control control-inline' }, h('label', { for: 'opt-theme' }, t.theme), theme),
    h('h3', {}, t.shortcuts),
    h('dl', { class: 'shortcuts' }, ...t.shortcutList.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
  );
  modal(t.optionsTitle, content, t.close);
}

// --- Görevler ---

export function openMissions(progress: Progress, onStart: (id: MissionId) => void) {
  const list = h('div', { class: 'mission-list' });
  const { close } = modal(t.missionsTitle, list, t.close);
  MISSIONS.forEach((m, i) => {
    const txt = t.missions[m.id];
    const done = progress.completedMissions.includes(m.id);
    const available = isMissionAvailable(m.id, progress.completedMissions);
    const active = progress.activeMission === m.id;
    const unlocks = m.unlocks.map(unlockLabel).filter(Boolean).join(', ');
    list.append(
      h(
        'article',
        { class: `mission ${done ? 'done' : ''} ${available ? '' : 'locked'} ${active ? 'active' : ''}` },
        h('div', { class: 'mission-num', 'aria-hidden': 'true' }, done ? icon('check', 18) : available ? String(i + 1) : icon('lock', 16)),
        h(
          'div',
          { class: 'mission-body' },
          h('strong', {}, txt.name),
          h('p', {}, txt.goal),
          available ? h('p', { class: 'muted small hint' }, icon('lightbulb', 14), txt.hint) : null,
          unlocks ? h('p', { class: 'muted small' }, `${t.missionUnlocks}: ${unlocks}`) : null,
        ),
        available
          ? h(
              'button',
              { type: 'button', class: `btn ${active ? 'ghost' : 'primary'}`, onclick: (() => { onStart(m.id); close(); }) as EventListener },
              done || active ? t.missionRestart : t.missionStart,
            )
          : null,
      ),
    );
  });
}

function unlockLabel(key: string): string {
  const map: Record<string, string> = {
    white: t.starTypes.white,
    blueGiant: t.starTypes.blueGiant,
    kind: t.planetKind,
    moonSizes: t.moonSize(1).replace('1. ', ''),
    disasters: t.disasters,
  };
  return map[key] ?? (t as unknown as Record<string, string>)[key] ?? '';
}

// --- Rozetler ---
export function openBadges(progress: Progress) {
  const grid = h('div', { class: 'badge-grid' });
  modal(t.badgesTitle, grid, t.close);
  for (const b of BADGES) {
    const got = progress.badges.includes(b.id);
    grid.append(
      h(
        'article',
        { class: `badge ${got ? 'earned' : ''}` },
        h('img', { src: badgeIcon(b.id), alt: '', width: 96, height: 96 }),
        h('strong', {}, t.badges[b.id].name),
        h('span', { class: 'muted small' }, got ? t.badges[b.id].desc : `${t.badgeLockedText} · ${t.badges[b.id].desc}`),
      ),
    );
  }
}

// --- Ansiklopedi ---
export function openEncyclopedia(progress: Progress) {
  const list = h('div', { class: 'encyclopedia' }, h('p', { class: 'muted' }, t.encyclopediaIntro));
  modal(t.encyclopedia, list, t.close);
  const count = ENTRY_IDS.filter((id) => progress.discovered.includes(id)).length;
  list.append(h('p', { class: 'small' }, `${count} / ${ENTRY_IDS.length}`));
  for (const id of ENTRY_IDS) {
    const known = progress.discovered.includes(id);
    const e = t.entries[id];
    list.append(
      known
        ? h('details', { class: 'entry' }, h('summary', {}, e.title), h('p', {}, e.text))
        : h('div', { class: 'entry locked' }, icon('lock', 14), t.encyclopediaLocked),
    );
  }
}

// --- Gerçek gezegenler ---
export function openRealPlanets(progress: Progress, onPick: (id: RealPlanetId) => void) {
  const grid = h('div', { class: 'real-grid' });
  const { close } = modal(t.realTitle, h('div', {}, h('p', { class: 'muted' }, t.realIntro), grid, h('p', { class: 'muted small' }, t.realNote)), t.close);
  for (const p of REAL_PLANETS) {
    const info = t.realPlanets[p.id];
    grid.append(
      h(
        'article',
        { class: `real-card ${progress.realViewed.includes(p.id) ? 'seen' : ''}` },
        h('div', { class: 'real-icon', 'aria-hidden': 'true', style: `--c:${p.color}` }),
        h('strong', {}, info.name),
        h('p', { class: 'small' }, info.fact),
        h('button', { type: 'button', class: 'btn primary', onclick: (() => { onPick(p.id); close(); }) as EventListener }, t.realExplore),
      ),
    );
  }
}

// --- Daha fazla menüsü ---
export interface MenuItem {
  icon: IconName;
  label: string;
  desc?: string;
  /** Klavye kısayolu */
  key?: string;
  /** Sağda küçük rozet (ör. 2/8) */
  badge?: string;
  action: () => void;
}

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export function openMenu(anchor: HTMLElement, groups: MenuGroup[]) {
  const existing = document.querySelector('.menu-pop');
  if (existing) {
    existing.remove();
    anchor.setAttribute('aria-expanded', 'false');
    return;
  }
  const buttons: HTMLButtonElement[] = [];
  const close = () => {
    pop.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const pop = h(
    'div',
    { class: 'menu-pop panel', role: 'menu' },
    ...groups.map((g) =>
      h(
        'div',
        { class: 'menu-group', role: 'group', 'aria-label': g.title },
        h('div', { class: 'menu-group-title' }, g.title),
        ...g.items.map((it) => {
          const b = h(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              class: 'menu-item',
              onclick: (() => {
                close();
                it.action();
              }) as EventListener,
            },
            h('span', { class: 'menu-icon' }, icon(it.icon, 18)),
            h('span', { class: 'menu-text' }, h('span', { class: 'menu-label' }, it.label), it.desc ? h('span', { class: 'menu-desc' }, it.desc) : null),
            it.badge ? h('span', { class: 'menu-badge' }, it.badge) : null,
            it.key ? h('kbd', { class: 'menu-key' }, it.key) : null,
          );
          buttons.push(b);
          return b;
        }),
      ),
    ),
  );
  document.body.append(pop);
  anchor.setAttribute('aria-expanded', 'true');
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${r.bottom + 10}px`;
  pop.style.right = `${Math.max(12, window.innerWidth - r.right)}px`;

  // Ok tuşlarıyla gezinme, Esc ile kapatma
  const onKey = (e: KeyboardEvent) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      anchor.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length].focus();
    }
  };
  const onOutside = (e: Event) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true));
  document.addEventListener('keydown', onKey, true);
  buttons[0]?.focus();
}
