import { BADGES, badgeIcon } from '../game/badges';
import { ENTRY_IDS } from '../game/encyclopedia';
import { MISSIONS, MissionId, isMissionAvailable } from '../game/missions';
import type { Progress } from '../game/progress';
import { REAL_PLANETS, RealPlanetId } from '../game/realPlanets';
import { t } from '../i18n';
import type { QualityMode } from '../render/engine';
import { Prefs, SavedPlanet, deleteFromAlbum, loadAlbum } from '../state/storage';
import { h, modal, progressPill, toast } from './dom';
import { IconName, icon } from './icons';

function scoreLevel(score: number): string {
  return score >= 80 ? 'great' : score >= 55 ? 'good' : score >= 30 ? 'fair' : 'poor';
}

// --- Albüm ---
export function openAlbum(onLoad: (p: SavedPlanet) => void) {
  const grid = h('div', { class: 'album-grid' });
  const count = h('span', { class: 'count-chip' });
  const { close } = modal(t.albumTitle, grid, t.close, { icon: 'images', subtitle: t.albumSub, extra: count, size: 'lg' });

  const render = () => {
    const album = loadAlbum();
    count.textContent = t.albumCount(album.length);
    if (!album.length) {
      grid.replaceChildren(
        h('div', { class: 'empty-state' }, h('span', { class: 'empty-icon' }, icon('images', 28)), h('strong', {}, t.albumEmptyTitle), h('p', {}, t.albumEmpty)),
      );
      return;
    }
    grid.replaceChildren(
      ...album.map((p) => {
        let armed = false;
        const del = h('button', { type: 'button', class: 'card-icon-btn danger', title: t.delete, 'aria-label': t.delete }, icon('trash', 16));
        del.addEventListener('click', () => {
          // İlk dokunuş onay ister, ikincisi siler
          if (!armed) {
            armed = true;
            del.classList.add('armed');
            del.replaceChildren(h('span', {}, t.confirmDeleteShort));
            setTimeout(() => {
              armed = false;
              del.classList.remove('armed');
              del.replaceChildren(icon('trash', 16));
            }, 2500);
            return;
          }
          deleteFromAlbum(p.id);
          toast(t.deleted);
          render();
        });
        return h(
          'article',
          { class: 'album-card' },
          h(
            'button',
            { type: 'button', class: 'album-thumb', title: t.load, onclick: (() => { onLoad(p); close(); }) as EventListener },
            h('img', { src: p.thumbnail, alt: p.name }),
            h('span', { class: 'score-badge', 'data-level': scoreLevel(p.score) }, String(p.score)),
          ),
          h(
            'div',
            { class: 'album-body' },
            h('div', { class: 'album-text' }, h('strong', {}, p.name), h('span', { class: 'muted small' }, new Date(p.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }))),
            del,
          ),
          h('button', { type: 'button', class: 'btn primary block', onclick: (() => { onLoad(p); close(); }) as EventListener }, icon('download', 16), t.load),
        );
      }),
    );
  };
  render();
}

// --- Seçenekler ---
export function openOptions(prefs: Prefs, onChange: (p: Prefs) => void) {
  const set = (patch: Partial<Prefs>) => {
    prefs = { ...prefs, ...patch };
    onChange(prefs);
  };

  /** Seçenek satırı: ikon, başlık, açıklama, sağda denetim */
  const row = (iconName: IconName, label: string, desc: string, control: HTMLElement, forId?: string) =>
    h(
      'div',
      { class: 'opt-row' },
      h('span', { class: 'opt-icon' }, icon(iconName, 18)),
      h('div', { class: 'opt-text' }, forId ? h('label', { for: forId }, label) : h('strong', {}, label), h('span', {}, desc)),
      control,
    );

  const toggle = (id: string, key: 'batterySaver' | 'reduceMotion' | 'largeText' | 'music' | 'effects') => {
    const input = h('input', {
      type: 'checkbox',
      class: 'switch',
      id,
      checked: prefs[key],
      onchange: (() => set({ [key]: input.checked })) as EventListener,
    });
    return input;
  };

  /** Bölümlü düğme grubu (select yerine) */
  const segmented = <T extends string>(label: string, values: [T, string][], current: T, onPick: (v: T) => void) => {
    const wrap = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
    const buttons = values.map(([v, l]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: v === current ? 'active' : '',
          'aria-checked': String(v === current),
          onclick: (() => {
            buttons.forEach((b, i) => {
              b.classList.toggle('active', values[i][0] === v);
              b.setAttribute('aria-checked', String(values[i][0] === v));
            });
            onPick(v);
          }) as EventListener,
        },
        l,
      ),
    );
    wrap.append(...buttons);
    return wrap;
  };

  const qualities: [QualityMode, string][] = [
    ['auto', t.qualityAuto],
    ['low', t.qualityLow],
    ['medium', t.qualityMedium],
    ['high', t.qualityHigh],
  ];
  const group = (iconName: IconName, title: string, ...rows: HTMLElement[]) =>
    h('section', { class: 'opt-group' }, h('h3', {}, icon(iconName, 16), title), ...rows);

  const content = h(
    'div',
    { class: 'options' },
    group(
      'monitor',
      t.optDisplay,
      h(
        'div',
        { class: 'opt-row stacked' },
        h('span', { class: 'opt-icon' }, icon('gauge', 18)),
        h('div', { class: 'opt-text' }, h('strong', {}, t.quality), h('span', {}, t.optDesc.quality)),
        segmented(t.quality, qualities, prefs.quality, (v) => set({ quality: v })),
      ),
      row('zap', t.batterySaver, t.optDesc.batterySaver, toggle('opt-battery', 'batterySaver'), 'opt-battery'),
      h(
        'div',
        { class: 'opt-row' },
        h('span', { class: 'opt-icon' }, icon('palette', 18)),
        h('div', { class: 'opt-text' }, h('strong', {}, t.theme), h('span', {}, t.optDesc.theme)),
        segmented(
          t.theme,
          [
            ['dark', t.themeDark],
            ['light', t.themeLight],
          ],
          prefs.theme,
          (v) => set({ theme: v }),
        ),
      ),
    ),
    group(
      'volume',
      t.optSound,
      row('sparkles', t.music, t.optDesc.music, toggle('opt-music', 'music'), 'opt-music'),
      row('volume', t.effects, t.optDesc.effects, toggle('opt-effects', 'effects'), 'opt-effects'),
    ),
    group(
      'accessibility',
      t.optAccess,
      row('orbit', t.reduceMotion, t.optDesc.reduceMotion, toggle('opt-motion', 'reduceMotion'), 'opt-motion'),
      row('book', t.largeText, t.optDesc.largeText, toggle('opt-large', 'largeText'), 'opt-large'),
    ),
    group(
      'keyboard',
      t.shortcuts,
      h('div', { class: 'shortcut-grid' }, ...t.shortcutList.map(([k, v]) => h('div', { class: 'shortcut' }, h('kbd', {}, k), h('span', {}, v)))),
    ),
  );
  modal(t.optionsTitle, content, t.close, { icon: 'settings', subtitle: t.optionsSub });
}

// --- Görevler ---
export function openMissions(progress: Progress, onStart: (id: MissionId) => void) {
  const list = h('div', { class: 'mission-list' });
  const { close } = modal(t.missionsTitle, list, t.close, {
    icon: 'target',
    subtitle: t.missionsSub,
    extra: progressPill(progress.completedMissions.length, MISSIONS.length),
  });
  MISSIONS.forEach((m, i) => {
    const txt = t.missions[m.id];
    const done = progress.completedMissions.includes(m.id);
    const available = isMissionAvailable(m.id, progress.completedMissions);
    const active = progress.activeMission === m.id;
    const unlocks = m.unlocks.map(unlockLabel).filter(Boolean);
    list.append(
      h(
        'article',
        { class: `mission ${done ? 'done' : ''} ${available ? '' : 'locked'} ${active ? 'active' : ''}` },
        h('div', { class: 'mission-num', 'aria-hidden': 'true' }, done ? icon('check', 18) : available ? String(i + 1) : icon('lock', 16)),
        h(
          'div',
          { class: 'mission-body' },
          h('div', { class: 'mission-title' }, h('strong', {}, txt.name), active ? h('span', { class: 'tag accent' }, t.missionActive) : done ? h('span', { class: 'tag good' }, t.missionDone) : null),
          h('p', {}, available ? txt.goal : t.locked),
          available ? h('p', { class: 'muted small hint' }, icon('lightbulb', 14), txt.hint) : null,
          unlocks.length && available
            ? h('div', { class: 'unlock-chips' }, h('span', { class: 'muted small' }, `${t.missionUnlocks}:`), ...unlocks.map((u) => h('span', { class: 'chip-mini' }, icon('lock', 12), u)))
            : null,
        ),
        available
          ? h(
              'button',
              { type: 'button', class: `btn ${active || done ? 'ghost' : 'primary'}`, onclick: (() => { onStart(m.id); close(); }) as EventListener },
              icon(done || active ? 'restart' : 'play', 16),
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
  const earned = BADGES.filter((b) => progress.badges.includes(b.id)).length;
  modal(t.badgesTitle, grid, t.close, { icon: 'award', subtitle: t.badgesSub, extra: progressPill(earned, BADGES.length), size: 'lg' });
  for (const b of BADGES) {
    const got = progress.badges.includes(b.id);
    grid.append(
      h(
        'article',
        { class: `badge ${got ? 'earned' : ''}` },
        h('div', { class: 'badge-img' }, h('img', { src: badgeIcon(b.id), alt: '', width: 96, height: 96 }), got ? null : h('span', { class: 'badge-lock' }, icon('lock', 16))),
        h('strong', {}, t.badges[b.id].name),
        h('span', { class: 'muted small' }, t.badges[b.id].desc),
        got ? h('span', { class: 'tag good' }, icon('check', 12), t.missionDone) : null,
      ),
    );
  }
}

// --- Ansiklopedi ---
export function openEncyclopedia(progress: Progress) {
  const known = ENTRY_IDS.filter((id) => progress.discovered.includes(id)).length;
  const search = h('input', { type: 'search', class: 'search-input', placeholder: t.encyclopediaSearch, 'aria-label': t.encyclopediaSearch });
  const list = h('div', { class: 'entry-list' });
  const content = h(
    'div',
    { class: 'encyclopedia' },
    h('p', { class: 'muted small' }, t.encyclopediaIntro),
    h('label', { class: 'search-field' }, icon('search', 16), search),
    list,
  );
  modal(t.encyclopedia, content, t.close, { icon: 'book', extra: progressPill(known, ENTRY_IDS.length) });

  const render = () => {
    const q = search.value.trim().toLocaleLowerCase('tr-TR');
    const items = ENTRY_IDS.filter((id) => {
      if (!q) return true;
      const e = t.entries[id];
      return progress.discovered.includes(id) && (e.title + e.text).toLocaleLowerCase('tr-TR').includes(q);
    });
    // Keşfedilenler önce
    items.sort((a, b) => Number(progress.discovered.includes(b)) - Number(progress.discovered.includes(a)));
    list.replaceChildren(
      ...(items.length
        ? items.map((id) => {
            const e = t.entries[id];
            return progress.discovered.includes(id)
              ? h('details', { class: 'entry' }, h('summary', {}, icon('book', 16), h('span', {}, e.title), icon('chevron', 16)), h('p', {}, e.text))
              : h('div', { class: 'entry locked' }, icon('lock', 14), h('span', {}, t.encyclopediaLocked));
          })
        : [h('p', { class: 'muted' }, t.encyclopediaNoResult)]),
    );
  };
  search.addEventListener('input', render);
  render();
}

// --- Gerçek gezegenler ---
export function openRealPlanets(progress: Progress, onPick: (id: RealPlanetId) => void) {
  const grid = h('div', { class: 'real-grid' });
  const seen = REAL_PLANETS.filter((p) => progress.realViewed.includes(p.id)).length;
  const { close } = modal(t.realTitle, h('div', {}, grid, h('p', { class: 'muted small note' }, t.realNote)), t.close, {
    icon: 'globe',
    subtitle: t.realIntro,
    extra: progressPill(seen, REAL_PLANETS.length),
    size: 'lg',
  });
  for (const p of REAL_PLANETS) {
    const info = t.realPlanets[p.id];
    const wasSeen = progress.realViewed.includes(p.id);
    grid.append(
      h(
        'article',
        { class: `real-card ${wasSeen ? 'seen' : ''}` },
        h(
          'div',
          { class: 'real-head' },
          h('div', { class: 'real-icon', 'aria-hidden': 'true', style: `--c:${p.color}` }),
          h('strong', {}, info.name),
          wasSeen ? h('span', { class: 'tag good' }, icon('check', 12), t.realSeen) : null,
        ),
        h('p', { class: 'small' }, info.fact),
        h('button', { type: 'button', class: 'btn primary block', onclick: (() => { onPick(p.id); close(); }) as EventListener }, icon('globe', 16), t.realExplore),
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
