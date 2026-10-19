import { t } from '../i18n';
import type { QualityMode } from '../render/engine';
import { Prefs, SavedPlanet, deleteFromAlbum, loadAlbum } from '../state/storage';
import { h, modal, toast } from './dom';

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

  const toggle = (id: string, label: string, key: 'batterySaver' | 'reduceMotion' | 'largeText') => {
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
    h('div', { class: 'control control-inline' }, h('label', { for: 'opt-theme' }, t.theme), theme),
    h('h3', {}, t.shortcuts),
    h('dl', { class: 'shortcuts' }, ...t.shortcutList.flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
  );
  modal(t.optionsTitle, content, t.close);
}
