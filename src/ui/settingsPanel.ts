import { t } from '../i18n';
import type { PlanetReport } from '../sim/physics';
import { sliderToPressure } from '../sim/physics';
import {
  DISTANCE_MAX,
  DISTANCE_MIN,
  PlanetSettings,
  RING_DEFAULT_COLORS,
  RING_MATERIALS,
  RingSettings,
  STAR_TYPES,
  StarType,
} from '../state/settings';
import { h, infoButton } from './dom';

export type SectionId = 'star' | 'orbit' | 'planet' | 'waterAir' | 'surroundings';

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'star', label: t.catStar },
  { id: 'orbit', label: t.catOrbit },
  { id: 'planet', label: t.catPlanet },
  { id: 'waterAir', label: t.catWaterAir },
  { id: 'surroundings', label: t.catSurroundings },
];

export type Patch = Partial<Omit<PlanetSettings, 'rings'>> & { rings?: Partial<RingSettings> };

const STAR_DOT: Record<StarType, string> = {
  redDwarf: '#ff6a3d',
  orangeDwarf: '#ffad5c',
  yellow: '#fff1b8',
  white: '#e8f0ff',
  blueGiant: '#8fb1ff',
};

const fmt = (v: number, d = 1) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Logaritmik uzaklık kaydırıcısı: 0..1000 ↔ 0,01..100 AB */
const LOG_MIN = Math.log10(DISTANCE_MIN);
const LOG_SPAN = Math.log10(DISTANCE_MAX) - LOG_MIN;
const distToSlider = (d: number) => ((Math.log10(d) - LOG_MIN) / LOG_SPAN) * 1000;
const sliderToDist = (v: number) => Math.pow(10, LOG_MIN + (v / 1000) * LOG_SPAN);

function formatPressure(bar: number): string {
  if (bar <= 0) return '0 bar';
  if (bar < 0.01) return `${fmt(bar * 1000, 1)} mbar`;
  if (bar < 10) return `${fmt(bar, bar < 1 ? 2 : 1)} bar`;
  return `${Math.round(bar)} bar`;
}

function volcanismLabel(v: number): string {
  return ['Sönmüş', 'Hafif', 'Orta', 'Yoğun', 'Patlayıcı'][Math.min(4, Math.floor(v * 5))];
}

interface Control {
  el: HTMLElement;
  sync: (s: PlanetSettings, r: PlanetReport) => void;
}

function slider(opts: {
  id: string;
  label: string;
  info: string;
  min: number;
  max: number;
  step: number;
  get: (s: PlanetSettings) => number;
  set: (v: number) => Patch;
  display: (s: PlanetSettings, r: PlanetReport) => string;
  extra?: HTMLElement;
  syncExtra?: (s: PlanetSettings, r: PlanetReport) => void;
  onChange: (p: Patch) => void;
}): Control {
  const out = h('output', { for: opts.id });
  const input = h('input', {
    id: opts.id,
    type: 'range',
    min: opts.min,
    max: opts.max,
    step: opts.step,
    oninput: (() => opts.onChange(opts.set(Number(input.value)))) as EventListener,
  });
  const el = h(
    'div',
    { class: 'control' },
    h('div', { class: 'control-head' }, h('label', { for: opts.id }, opts.label), infoButton(opts.label, opts.info), out),
    input,
    opts.extra ?? null,
  );
  return {
    el,
    sync: (s, r) => {
      // Kullanıcı sürüklerken değeri ezme
      if (document.activeElement !== input) input.value = String(opts.get(s));
      input.style.setProperty('--fill', `${((Number(input.value) - opts.min) / (opts.max - opts.min)) * 100}%`);
      out.textContent = opts.display(s, r);
      opts.syncExtra?.(s, r);
    },
  };
}

function chips<T extends string | number>(opts: {
  label: string;
  info?: string;
  values: readonly T[];
  name: (v: T) => string;
  decorate?: (v: T) => HTMLElement | null;
  get: (s: PlanetSettings) => T;
  onPick: (v: T) => void;
}): Control {
  const buttons = opts.values.map((v) =>
    h(
      'button',
      { type: 'button', class: 'chip', role: 'radio', onclick: (() => opts.onPick(v)) as EventListener },
      opts.decorate?.(v) ?? null,
      opts.name(v),
    ),
  );
  const el = h(
    'div',
    { class: 'control' },
    h('div', { class: 'control-head' }, h('span', { class: 'label' }, opts.label), opts.info ? infoButton(opts.label, opts.info) : null),
    h('div', { class: 'chips', role: 'radiogroup', 'aria-label': opts.label }, ...buttons),
  );
  return {
    el,
    sync: (s) => {
      const cur = opts.get(s);
      opts.values.forEach((v, i) => {
        buttons[i].classList.toggle('active', v === cur);
        buttons[i].setAttribute('aria-checked', String(v === cur));
      });
    },
  };
}

export function createSettingsPanel(root: HTMLElement, onChange: (p: Patch) => void) {
  const controls: Control[] = [];
  const sections = new Map<SectionId, HTMLElement>();

  const section = (id: SectionId, label: string, items: Control[]) => {
    controls.push(...items);
    const el = h('section', { class: 'settings-section', 'data-section': id }, h('h3', {}, label), ...items.map((c) => c.el));
    sections.set(id, el);
    return el;
  };

  // Yıldız
  const star = chips<StarType>({
    label: t.starType,
    info: t.info.starType,
    values: STAR_TYPES,
    name: (v) => t.starTypes[v],
    decorate: (v) => h('span', { class: 'star-dot', style: `--c:${STAR_DOT[v]}` }),
    get: (s) => s.starType,
    onPick: (v) => onChange({ starType: v }),
  });

  // Yörünge: uzaklık + yaşanabilir bölge göstergesi
  const hzBar = h('div', { class: 'hz-bar', 'aria-hidden': 'true' }, h('div', { class: 'hz-zone' }));
  const hzText = h('div', { class: 'hz-text' });
  const distance = slider({
    id: 'distance',
    label: t.distance,
    info: t.info.distance,
    min: 0,
    max: 1000,
    step: 1,
    get: (s) => Math.round(distToSlider(s.distance)),
    set: (v) => ({ distance: sliderToDist(v) }),
    display: (s) => `${fmt(s.distance, s.distance < 1 ? 2 : 1)} AB`,
    extra: h('div', {}, hzBar, hzText),
    syncExtra: (_s, r) => {
      const zone = hzBar.firstElementChild as HTMLElement;
      const a = distToSlider(Math.max(DISTANCE_MIN, r.hzInner)) / 10;
      const b = distToSlider(Math.min(DISTANCE_MAX, r.hzOuter)) / 10;
      zone.style.left = `${a}%`;
      zone.style.width = `${Math.max(0.5, b - a)}%`;
      const status = r.hzStatus === 'in' ? t.inZone : r.hzStatus === 'close' ? t.tooClose : t.tooFar;
      hzText.innerHTML = '';
      hzText.append(
        h('span', { class: `hz-status ${r.hzStatus}` }, r.hzStatus === 'in' ? '✓ ' : '⚠ ', status),
        ` · ${t.habitableZone}: ${fmt(r.hzInner, 2)}–${fmt(r.hzOuter, 2)} AB`,
      );
    },
    onChange,
  });

  // Gezegen
  const size = slider({
    id: 'size',
    label: t.size,
    info: t.info.size,
    min: 0.3,
    max: 2.5,
    step: 0.01,
    get: (s) => s.size,
    set: (v) => ({ size: v }),
    display: (s, r) => `${fmt(s.size, 2)} × Dünya · ${fmt(r.gravity, 2)} g`,
    onChange,
  });
  const volcanism = slider({
    id: 'volcanism',
    label: t.volcanism,
    info: t.info.volcanism,
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.volcanism,
    set: (v) => ({ volcanism: v }),
    display: (s) => volcanismLabel(s.volcanism),
    onChange,
  });

  // Su ve hava
  const water = slider({
    id: 'water',
    label: t.water,
    info: t.info.water,
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.water,
    set: (v) => ({ water: v }),
    display: (s) => `%${Math.round(s.water * 100)}`,
    onChange,
  });
  const atmosphere = slider({
    id: 'atmosphere',
    label: t.atmosphere,
    info: t.info.atmosphere,
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.atmosphere,
    set: (v) => ({ atmosphere: v }),
    display: (s, r) => (s.atmosphere <= 0.001 ? t.no : `${formatPressure(sliderToPressure(s.atmosphere))}${Math.abs(r.pressure - sliderToPressure(s.atmosphere)) > 0.05 * r.pressure + 0.001 ? ` → ${formatPressure(r.pressure)}` : ''}`),
    onChange,
  });

  // Çevre
  const moons = chips<number>({
    label: t.moons,
    info: t.info.moons,
    values: [0, 1, 2, 3],
    name: (v) => String(v),
    get: (s) => s.moons,
    onPick: (v) => onChange({ moons: v }),
  });

  const ringToggle = h('input', {
    type: 'checkbox',
    id: 'rings',
    class: 'switch',
    onchange: (() => onChange({ rings: { enabled: ringToggle.checked } })) as EventListener,
  });
  const ringDetails = h('div', { class: 'ring-details' });
  const ringMaterial = chips({
    label: t.ringMaterial,
    values: RING_MATERIALS,
    name: (v) => t.ringMaterials[v],
    get: (s) => s.rings.material,
    onPick: (v) => onChange({ rings: { material: v, color: RING_DEFAULT_COLORS[v] } }),
  });
  const ringWidth = slider({
    id: 'ringWidth',
    label: t.ringWidth,
    info: t.info.rings,
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.rings.width,
    set: (v) => ({ rings: { width: v } }),
    display: (s) => `%${Math.round(s.rings.width * 100)}`,
    onChange,
  });
  const ringTilt = slider({
    id: 'ringTilt',
    label: t.ringTilt,
    info: t.info.rings,
    min: -45,
    max: 45,
    step: 1,
    get: (s) => s.rings.tilt,
    set: (v) => ({ rings: { tilt: v } }),
    display: (s) => `${Math.round(s.rings.tilt)}°`,
    onChange,
  });
  const colorInput = h('input', {
    type: 'color',
    id: 'ringColor',
    oninput: (() => onChange({ rings: { color: colorInput.value } })) as EventListener,
  });
  const ringColor: Control = {
    el: h('div', { class: 'control control-inline' }, h('label', { for: 'ringColor' }, t.ringColor), colorInput),
    sync: (s) => {
      if (document.activeElement !== colorInput) colorInput.value = s.rings.color;
    },
  };
  ringDetails.append(ringMaterial.el, ringWidth.el, ringColor.el, ringTilt.el);
  const rings: Control = {
    el: h(
      'div',
      { class: 'control' },
      h('div', { class: 'control-head' }, h('label', { for: 'rings' }, t.rings), infoButton(t.rings, t.info.rings), ringToggle),
      ringDetails,
    ),
    sync: (s, r) => {
      ringToggle.checked = s.rings.enabled;
      ringDetails.hidden = !s.rings.enabled;
      for (const c of [ringMaterial, ringWidth, ringColor, ringTilt]) c.sync(s, r);
    },
  };

  root.append(
    section('star', t.catStar, [star]),
    section('orbit', t.catOrbit, [distance]),
    section('planet', t.catPlanet, [size, volcanism]),
    section('waterAir', t.catWaterAir, [water, atmosphere]),
    section('surroundings', t.catSurroundings, [moons, rings]),
  );

  return {
    sync(s: PlanetSettings, r: PlanetReport) {
      for (const c of controls) c.sync(s, r);
    },
    showSection(id: SectionId) {
      for (const [k, el] of sections) el.classList.toggle('active', k === id);
    },
  };
}
