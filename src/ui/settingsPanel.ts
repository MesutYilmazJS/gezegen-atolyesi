import { t } from '../i18n';
import type { PlanetReport } from '../sim/physics';
import { compositionFractions, sliderToPressure } from '../sim/physics';
import {
  CIV_LEVELS,
  Composition,
  DAY_MAX,
  DAY_MIN,
  DISASTER_TYPES,
  DISTANCE_MAX,
  DISTANCE_MIN,
  DisasterType,
  MINERALS,
  OCEAN_TYPES,
  PlanetKind,
  PlanetSettings,
  RING_DEFAULT_COLORS,
  RING_MATERIALS,
  RingSettings,
  SIZE_RANGE,
  STAR_TYPES,
  StarType,
} from '../state/settings';
import { h, infoButton } from './dom';

export type SectionId = 'star' | 'orbit' | 'planet' | 'water' | 'atmosphere' | 'surroundings' | 'life';

export const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'star', label: t.catStar, icon: '⭐' },
  { id: 'orbit', label: t.catOrbit, icon: '🔄' },
  { id: 'planet', label: t.catPlanet, icon: '🪨' },
  { id: 'water', label: t.catWater, icon: '💧' },
  { id: 'atmosphere', label: t.catAtmosphere, icon: '☁️' },
  { id: 'surroundings', label: t.catSurroundings, icon: '🌙' },
  { id: 'life', label: t.catLife, icon: '🌱' },
];

const ADVANCED_KEY = 'gezegen-atolyesi:advanced';

export type Patch = Partial<Omit<PlanetSettings, 'rings' | 'composition'>> & {
  rings?: Partial<RingSettings>;
  composition?: Partial<Composition>;
};

/** Kilitli bir ayarın hangi görevle açılacağını söyler; null = açık */
export type LockCheck = (key: string) => string | null;

export interface PanelCallbacks {
  onChange: (p: Patch) => void;
  onDisaster: (type: DisasterType) => void;
  onClearDisasters: () => void;
  /** Bir "?" butonuna basıldığında (ansiklopedi keşfi için) */
  onInfo?: (key: string) => void;
}

const STAR_DOT: Record<StarType, string> = {
  redDwarf: '#ff6a3d',
  orangeDwarf: '#ffad5c',
  yellow: '#fff1b8',
  white: '#e8f0ff',
  blueGiant: '#8fb1ff',
};

const DISASTER_ICON: Record<DisasterType, string> = {
  asteroid: '☄️',
  supervolcano: '🌋',
  iceAge: '🧊',
  flare: '☀️',
  runaway: '🔥',
};

const fmt = (v: number, d = 1) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Logaritmik kaydırıcı yardımcıları: 0..1000 ↔ min..max */
function logScale(min: number, max: number) {
  const lo = Math.log10(min);
  const span = Math.log10(max) - lo;
  return {
    to: (v: number) => ((Math.log10(v) - lo) / span) * 1000,
    from: (x: number) => Math.pow(10, lo + (x / 1000) * span),
  };
}
const distScale = logScale(DISTANCE_MIN, DISTANCE_MAX);
const dayScale = logScale(DAY_MIN, DAY_MAX);

function formatPressure(bar: number): string {
  if (bar <= 0) return '0 bar';
  if (bar < 0.01) return `${fmt(bar * 1000, 1)} mbar`;
  if (bar < 10) return `${fmt(bar, bar < 1 ? 2 : 1)} bar`;
  return `${Math.round(bar)} bar`;
}

function formatDay(hours: number): string {
  if (hours < 48) return `${fmt(hours, hours < 10 ? 1 : 0)} ${t.hours}`;
  return `${fmt(hours / 24, hours < 240 ? 1 : 0)} ${t.days}`;
}

const level = (v: number) => t.levelLabels[Math.min(4, Math.floor(v * 5))];

interface Control {
  el: HTMLElement;
  /** Kilit anahtarı */
  key?: string;
  sync: (s: PlanetSettings, r: PlanetReport) => void;
  /** Bu ayar bu gezegen türünde gösterilsin mi */
  visible?: (s: PlanetSettings) => boolean;
}

export function createSettingsPanel(root: HTMLElement, cb: PanelCallbacks, isLocked: LockCheck) {
  const controls: Control[] = [];
  const sections = new Map<SectionId, HTMLElement>();
  const onChange = cb.onChange;

  const info = (label: string, key: string, text: string) => {
    const btn = infoButton(label, text);
    btn.addEventListener('click', () => cb.onInfo?.(key));
    return btn;
  };

  function slider(opts: {
    id: string;
    label: string;
    infoKey?: keyof typeof t.info;
    lockKey?: string;
    min: number;
    max: number;
    step: number;
    get: (s: PlanetSettings) => number;
    set: (v: number) => Patch;
    display: (s: PlanetSettings, r: PlanetReport) => string;
    extra?: HTMLElement;
    syncExtra?: (s: PlanetSettings, r: PlanetReport) => void;
    visible?: (s: PlanetSettings) => boolean;
    range?: (s: PlanetSettings) => [number, number];
  }): Control {
    const out = h('output', { for: opts.id });
    const input = h('input', {
      id: opts.id,
      type: 'range',
      min: opts.min,
      max: opts.max,
      step: opts.step,
      oninput: (() => onChange(opts.set(Number(input.value)))) as EventListener,
    });
    const el = h(
      'div',
      { class: 'control' },
      h(
        'div',
        { class: 'control-head' },
        h('label', { for: opts.id }, opts.label),
        opts.infoKey ? info(opts.label, opts.infoKey, t.info[opts.infoKey]) : null,
        out,
      ),
      input,
      opts.extra ?? null,
    );
    return {
      el,
      key: opts.lockKey,
      visible: opts.visible,
      sync: (s, r) => {
        let [min, max] = [opts.min, opts.max];
        if (opts.range) {
          [min, max] = opts.range(s);
          input.min = String(min);
          input.max = String(max);
        }
        // Kullanıcı sürüklerken değeri ezme
        if (document.activeElement !== input) input.value = String(opts.get(s));
        input.style.setProperty('--fill', `${((Number(input.value) - min) / (max - min)) * 100}%`);
        out.textContent = opts.display(s, r);
        opts.syncExtra?.(s, r);
      },
    };
  }

  function chips<T extends string | number>(opts: {
    label: string;
    infoKey?: keyof typeof t.info;
    lockKey?: string;
    values: readonly T[];
    name: (v: T) => string;
    decorate?: (v: T) => HTMLElement | null;
    /** Tek tek kilitlenebilen seçenekler */
    valueLock?: (v: T) => string | undefined;
    get: (s: PlanetSettings) => T;
    onPick: (v: T) => void;
    visible?: (s: PlanetSettings) => boolean;
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
      h(
        'div',
        { class: 'control-head' },
        h('span', { class: 'label' }, opts.label),
        opts.infoKey ? info(opts.label, opts.infoKey, t.info[opts.infoKey]) : null,
      ),
      h('div', { class: 'chips', role: 'radiogroup', 'aria-label': opts.label }, ...buttons),
    );
    return {
      el,
      key: opts.lockKey,
      visible: opts.visible,
      sync: (s) => {
        const cur = opts.get(s);
        opts.values.forEach((v, i) => {
          const b = buttons[i];
          b.classList.toggle('active', v === cur);
          b.setAttribute('aria-checked', String(v === cur));
          const lk = opts.valueLock?.(v);
          const lockedBy = lk ? isLocked(lk) : null;
          b.disabled = !!lockedBy && v !== cur;
          b.classList.toggle('locked', !!lockedBy);
          b.title = lockedBy ? t.unlockHint(lockedBy) : '';
        });
      },
    };
  }

  function toggle(opts: {
    id: string;
    label: string;
    infoKey?: keyof typeof t.info;
    lockKey?: string;
    get: (s: PlanetSettings) => boolean;
    set: (v: boolean) => Patch;
    visible?: (s: PlanetSettings) => boolean;
    children?: Control[];
  }): Control {
    const input = h('input', {
      type: 'checkbox',
      id: opts.id,
      class: 'switch',
      onchange: (() => onChange(opts.set(input.checked))) as EventListener,
    });
    const details = opts.children ? h('div', { class: 'sub-details' }, ...opts.children.map((c) => c.el)) : null;
    return {
      el: h(
        'div',
        { class: 'control' },
        h(
          'div',
          { class: 'control-head' },
          h('label', { for: opts.id }, opts.label),
          opts.infoKey ? info(opts.label, opts.infoKey, t.info[opts.infoKey]) : null,
          input,
        ),
        details,
      ),
      key: opts.lockKey,
      visible: opts.visible,
      sync: (s, r) => {
        input.checked = opts.get(s);
        if (details) details.hidden = !input.checked;
        for (const c of opts.children ?? []) c.sync(s, r);
      },
    };
  }

  const rocky = (s: PlanetSettings) => s.kind === 'rocky';

  // Masaüstünde bölüm sekmeleri: aynı anda yalnızca bir bölüm görünür
  const tabButtons = new Map<SectionId, HTMLButtonElement>();
  const nav = h(
    'nav',
    { class: 'panel-tabs', role: 'tablist', 'aria-label': t.catPlanet },
    ...SECTIONS.map((sec) => {
      const b = h(
        'button',
        { type: 'button', role: 'tab', class: 'panel-tab', title: sec.label, onclick: (() => showSection(sec.id)) as EventListener },
        h('span', { class: 'panel-tab-icon', 'aria-hidden': 'true' }, sec.icon),
        h('span', { class: 'panel-tab-label' }, sec.label),
      );
      tabButtons.set(sec.id, b);
      return b;
    }),
  );
  root.append(nav);

  // Gelişmiş ayarlar katlanır; açık/kapalı tercihi hatırlanır
  let advancedOpen = false;
  try {
    advancedOpen = localStorage.getItem(ADVANCED_KEY) === '1';
  } catch {
    // depolama kapalı olabilir
  }
  const advancedBlocks: HTMLDetailsElement[] = [];

  const section = (id: SectionId, label: string, basic: Control[], advanced: Control[] = []) => {
    controls.push(...basic, ...advanced);
    let details: HTMLDetailsElement | null = null;
    if (advanced.length) {
      details = h(
        'details',
        { class: 'advanced', open: advancedOpen },
        h('summary', {}, t.advancedSettings),
        ...advanced.map((c) => c.el),
      );
      details.addEventListener('toggle', () => {
        advancedOpen = details!.open;
        try {
          localStorage.setItem(ADVANCED_KEY, advancedOpen ? '1' : '0');
        } catch {
          // yoksay
        }
        for (const d of advancedBlocks) if (d !== details) d.open = advancedOpen;
      });
      advancedBlocks.push(details);
    }
    const el = h('section', { class: 'settings-section', 'data-section': id }, h('h3', {}, label), ...basic.map((c) => c.el), details);
    sections.set(id, el);
    return el;
  };

  function showSection(id: SectionId) {
    for (const [k, el] of sections) el.classList.toggle('active', k === id);
    for (const [k, b] of tabButtons) {
      b.classList.toggle('active', k === id);
      b.setAttribute('aria-selected', String(k === id));
    }
  }

  // --- Yıldız ---
  const star = chips<StarType>({
    label: t.starType,
    infoKey: 'starType',
    values: STAR_TYPES,
    name: (v) => t.starTypes[v],
    decorate: (v) => h('span', { class: 'star-dot', style: `--c:${STAR_DOT[v]}` }),
    valueLock: (v) => (v === 'white' || v === 'blueGiant' ? v : undefined),
    get: (s) => s.starType,
    onPick: (v) => onChange({ starType: v }),
  });
  const binary = toggle({
    id: 'binaryStar',
    label: t.binaryStar,
    infoKey: 'binaryStar',
    lockKey: 'binaryStar',
    get: (s) => s.binaryStar,
    set: (v) => ({ binaryStar: v }),
  });

  // --- Yörünge ---
  const hzBar = h('div', { class: 'hz-bar', 'aria-hidden': 'true' }, h('div', { class: 'hz-zone' }));
  const hzText = h('div', { class: 'hz-text' });
  const distance = slider({
    id: 'distance',
    label: t.distance,
    infoKey: 'distance',
    min: 0,
    max: 1000,
    step: 1,
    get: (s) => Math.round(distScale.to(s.distance)),
    set: (v) => ({ distance: distScale.from(v) }),
    display: (s) => `${fmt(s.distance, s.distance < 1 ? 2 : 1)} AB`,
    extra: h('div', {}, hzBar, hzText),
    syncExtra: (_s, r) => {
      const zone = hzBar.firstElementChild as HTMLElement;
      const a = distScale.to(Math.max(DISTANCE_MIN, r.hzInner)) / 10;
      const b = distScale.to(Math.min(DISTANCE_MAX, r.hzOuter)) / 10;
      zone.style.left = `${a}%`;
      zone.style.width = `${Math.max(0.5, b - a)}%`;
      const status = r.hzStatus === 'in' ? t.inZone : r.hzStatus === 'close' ? t.tooClose : t.tooFar;
      hzText.innerHTML = '';
      hzText.append(
        h('span', { class: `hz-status ${r.hzStatus}` }, r.hzStatus === 'in' ? '✓ ' : '⚠ ', status),
        ` · ${t.habitableZone}: ${fmt(r.hzInner, 2)}–${fmt(r.hzOuter, 2)} AB`,
      );
    },
  });
  const eccentricity = slider({
    id: 'eccentricity',
    label: t.eccentricity,
    infoKey: 'eccentricity',
    lockKey: 'eccentricity',
    min: 0,
    max: 0.8,
    step: 0.01,
    get: (s) => s.eccentricity,
    set: (v) => ({ eccentricity: v }),
    display: (s) => (s.eccentricity < 0.05 ? t.circular : `${t.elongated} · ${fmt(s.eccentricity, 2)}`),
  });
  const tilt = slider({
    id: 'axialTilt',
    label: t.axialTilt,
    infoKey: 'axialTilt',
    lockKey: 'axialTilt',
    min: 0,
    max: 90,
    step: 0.5,
    get: (s) => s.axialTilt,
    set: (v) => ({ axialTilt: v }),
    display: (s) => `${fmt(s.axialTilt, 1)}°`,
  });
  const dayLength = slider({
    id: 'dayLength',
    label: t.dayLength,
    infoKey: 'dayLength',
    lockKey: 'dayLength',
    min: 0,
    max: 1000,
    step: 1,
    get: (s) => Math.round(dayScale.to(s.dayLength)),
    set: (v) => ({ dayLength: Math.round(dayScale.from(v) * 10) / 10 }),
    display: (s) => (s.tidalLock ? '∞' : formatDay(s.dayLength)),
  });
  const tidalLock = toggle({
    id: 'tidalLock',
    label: t.tidalLock,
    infoKey: 'tidalLock',
    lockKey: 'tidalLock',
    get: (s) => s.tidalLock,
    set: (v) => ({ tidalLock: v }),
  });

  // --- Gezegen yapısı ---
  const kind = chips<PlanetKind>({
    label: t.planetKind,
    infoKey: 'planetKind',
    lockKey: 'kind',
    values: ['rocky', 'gas'],
    name: (v) => t.kinds[v],
    get: (s) => s.kind,
    onPick: (v) => onChange({ kind: v, size: v === 'gas' ? 11 : 1 }),
  });
  const size = slider({
    id: 'size',
    label: t.size,
    infoKey: 'size',
    min: 0.3,
    max: 2.5,
    step: 0.01,
    range: (s) => SIZE_RANGE[s.kind],
    get: (s) => s.size,
    set: (v) => ({ size: v }),
    display: (s, r) => `${fmt(s.size, s.size < 10 ? 2 : 1)} × Dünya · ${fmt(r.gravity, 2)} g`,
  });
  const age = slider({
    id: 'planetAge',
    label: t.planetAge,
    infoKey: 'planetAge',
    min: 0,
    max: 1,
    step: 0.001,
    get: (s) => s.time,
    set: (v) => ({ time: v }),
    display: (_s, r) => (r.ageGyr < 1 ? `${Math.round(r.ageGyr * 1000)} ${t.millionYears}` : `${fmt(r.ageGyr, 1)} ${t.yearsAgo}`),
  });
  const tectonics = slider({
    id: 'tectonics',
    label: t.tectonics,
    infoKey: 'tectonics',
    lockKey: 'tectonics',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.tectonics,
    set: (v) => ({ tectonics: v }),
    display: (s) => level(s.tectonics),
    visible: rocky,
  });
  const volcanism = slider({
    id: 'volcanism',
    label: t.volcanism,
    infoKey: 'volcanism',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.volcanism,
    set: (v) => ({ volcanism: v }),
    display: (s) => level(s.volcanism),
    visible: rocky,
  });
  const craters = slider({
    id: 'craters',
    label: t.craters,
    infoKey: 'craters',
    lockKey: 'craters',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.craters,
    set: (v) => ({ craters: v }),
    display: (s) => level(s.craters),
    visible: rocky,
  });
  const mineral = chips({
    label: t.mineral,
    infoKey: 'mineral',
    lockKey: 'mineral',
    values: MINERALS,
    name: (v) => t.minerals[v],
    get: (s) => s.mineral,
    onPick: (v) => onChange({ mineral: v }),
    visible: rocky,
  });

  // --- Su ---
  const water = slider({
    id: 'water',
    label: t.water,
    infoKey: 'water',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.water,
    set: (v) => ({ water: v }),
    display: (s) => `%${Math.round(s.water * 100)}`,
    visible: rocky,
  });
  const oceanType = chips({
    label: t.oceanType,
    infoKey: 'oceanType',
    lockKey: 'oceanType',
    values: OCEAN_TYPES,
    name: (v) => t.oceanTypes[v],
    get: (s) => s.oceanType,
    onPick: (v) => onChange({ oceanType: v }),
    visible: rocky,
  });
  const tides = slider({
    id: 'tides',
    label: t.tides,
    infoKey: 'tides',
    lockKey: 'tides',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.tides,
    set: (v) => ({ tides: v }),
    display: (s) => level(s.tides),
    visible: rocky,
  });
  const subsurface = toggle({
    id: 'subsurfaceOcean',
    label: t.subsurfaceOcean,
    infoKey: 'subsurfaceOcean',
    lockKey: 'subsurfaceOcean',
    get: (s) => s.subsurfaceOcean,
    set: (v) => ({ subsurfaceOcean: v }),
    visible: rocky,
  });

  // --- Atmosfer ---
  const atmosphere = slider({
    id: 'atmosphere',
    label: t.atmosphere,
    infoKey: 'atmosphere',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.atmosphere,
    set: (v) => ({ atmosphere: v }),
    display: (s, r) => {
      if (s.atmosphere <= 0.001) return t.no;
      const raw = sliderToPressure(s.atmosphere);
      return `${formatPressure(raw)}${Math.abs(r.pressure - raw) > 0.05 * r.pressure + 0.001 ? ` → ${formatPressure(r.pressure)}` : ''}`;
    },
    visible: rocky,
  });
  const gasKeys: (keyof Composition)[] = ['n2', 'o2', 'co2', 'ch4'];
  const gasSliders = gasKeys.map((g) =>
    slider({
      id: `gas-${g}`,
      label: t.gases[g],
      min: 0,
      max: 100,
      step: 1,
      get: (s) => s.composition[g],
      set: (v) => ({ composition: { [g]: v } }),
      display: (s) => `%${Math.round(compositionFractions(s)[g] * 100)}`,
    }),
  );
  const composition: Control = {
    el: h(
      'div',
      { class: 'control' },
      h('div', { class: 'control-head' }, h('span', { class: 'label' }, t.composition), info(t.composition, 'composition', t.info.composition)),
      h('div', { class: 'sub-details' }, ...gasSliders.map((c) => c.el)),
    ),
    key: 'composition',
    visible: rocky,
    sync: (s, r) => gasSliders.forEach((c) => c.sync(s, r)),
  };
  const clouds = slider({
    id: 'clouds',
    label: t.clouds,
    infoKey: 'clouds',
    lockKey: 'clouds',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.clouds,
    set: (v) => ({ clouds: v }),
    display: (_s, r) => `%${Math.round(r.visual.cloudCover * 100)}`,
    visible: rocky,
  });
  const storms = slider({
    id: 'storms',
    label: t.storms,
    infoKey: 'storms',
    lockKey: 'storms',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.storms,
    set: (v) => ({ storms: v }),
    display: (s) => level(s.storms),
  });
  const wind = slider({
    id: 'wind',
    label: t.wind,
    infoKey: 'wind',
    lockKey: 'wind',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.wind,
    set: (v) => ({ wind: v }),
    display: (s) => `${Math.round(20 + s.wind * s.wind * 1500)} km/sa`,
  });
  const magnetic = slider({
    id: 'magneticField',
    label: t.magneticField,
    infoKey: 'magneticField',
    lockKey: 'magneticField',
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.magneticField,
    set: (v) => ({ magneticField: v }),
    display: (s) => level(s.magneticField),
  });

  // --- Çevre ---
  const moons = chips<number>({
    label: t.moons,
    infoKey: 'moons',
    values: [0, 1, 2, 3],
    name: (v) => String(v),
    get: (s) => s.moons,
    onPick: (v) => onChange({ moons: v }),
  });
  const moonSizes = [0, 1, 2].map((i) =>
    slider({
      id: `moonSize${i}`,
      label: t.moonSize(i + 1),
      infoKey: i === 0 ? 'moonSize' : undefined,
      lockKey: 'moonSizes',
      min: 0,
      max: 1,
      step: 0.01,
      get: (s) => s.moonSizes[i],
      set: (v) => {
        return { moonSizes: [0, 1, 2].map((j) => (j === i ? v : currentSizes[j])) as [number, number, number] };
      },
      display: (s) => level(s.moonSizes[i]),
      visible: (s) => s.moons > i,
    }),
  );
  let currentSizes: [number, number, number] = [0.6, 0.4, 0.3];

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
    min: 0,
    max: 1,
    step: 0.01,
    get: (s) => s.rings.width,
    set: (v) => ({ rings: { width: v } }),
    display: (s) => `%${Math.round(s.rings.width * 100)}`,
  });
  const ringTilt = slider({
    id: 'ringTilt',
    label: t.ringTilt,
    min: -45,
    max: 45,
    step: 1,
    get: (s) => s.rings.tilt,
    set: (v) => ({ rings: { tilt: v } }),
    display: (s) => `${Math.round(s.rings.tilt)}°`,
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
  const rings = toggle({
    id: 'rings',
    label: t.rings,
    infoKey: 'rings',
    get: (s) => s.rings.enabled,
    set: (v) => ({ rings: { enabled: v } }),
    children: [ringMaterial, ringWidth, ringColor, ringTilt],
  });

  // --- Yaşam ---
  const civ = chips({
    label: t.civilization,
    infoKey: 'civilization',
    lockKey: 'civilization',
    values: CIV_LEVELS,
    name: (v) => t.civLevels[v],
    get: (s) => s.civilization,
    onPick: (v) => onChange({ civilization: v }),
    visible: rocky,
  });
  const disasterButtons = DISASTER_TYPES.map((d) =>
    h(
      'button',
      { type: 'button', class: 'disaster-btn', title: t.disasterInfo[d], onclick: (() => cb.onDisaster(d)) as EventListener },
      h('span', { class: 'disaster-icon', 'aria-hidden': 'true' }, DISASTER_ICON[d]),
      h('span', {}, t.disasterNames[d]),
    ),
  );
  const clearBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: (() => cb.onClearDisasters()) as EventListener }, t.clearDisasters);
  const disasters: Control = {
    el: h(
      'div',
      { class: 'control' },
      h('div', { class: 'control-head' }, h('span', { class: 'label' }, t.disasters)),
      h('div', { class: 'disaster-grid' }, ...disasterButtons),
      clearBtn,
    ),
    key: 'disasters',
    visible: rocky,
    sync: (s) => {
      clearBtn.hidden = s.events.length === 0;
    },
  };

  root.append(
    section('star', t.catStar, [star], [binary]),
    section('orbit', t.catOrbit, [distance], [eccentricity, tilt, dayLength, tidalLock]),
    section('planet', t.catPlanet, [kind, size, volcanism], [age, tectonics, craters, mineral]),
    section('water', t.catWater, [water], [oceanType, tides, subsurface]),
    section('atmosphere', t.catAtmosphere, [atmosphere, clouds], [composition, storms, wind, magnetic]),
    section('surroundings', t.catSurroundings, [moons, rings], moonSizes),
    section('life', t.catLife, [civ, disasters]),
  );

  // Kilit katmanı: kilitli ayarın üzerinde hangi görevle açılacağı yazar
  const lockNotes = new Map<Control, HTMLElement>();
  for (const c of controls) {
    if (!c.key) continue;
    const note = h('div', { class: 'lock-note' });
    c.el.append(note);
    lockNotes.set(c, note);
  }

  return {
    sync(s: PlanetSettings, r: PlanetReport) {
      currentSizes = [...s.moonSizes];
      for (const c of controls) {
        c.sync(s, r);
        c.el.hidden = c.visible ? !c.visible(s) : false;
        const note = lockNotes.get(c);
        if (note && c.key) {
          const by = isLocked(c.key);
          c.el.classList.toggle('is-locked', !!by);
          note.textContent = by ? `🔒 ${t.unlockHint(by)}` : '';
          c.el.querySelectorAll('input, button:not(.info-btn)').forEach((el) => ((el as HTMLInputElement).disabled = !!by));
        }
      }
      // Gaz devinde su bölümü boş kalır
      sections.get('water')!.hidden = s.kind === 'gas';
      tabButtons.get('water')!.hidden = s.kind === 'gas';
    },
    showSection,
  };
}
