export type StarType = 'redDwarf' | 'orangeDwarf' | 'yellow' | 'white' | 'blueGiant';
export type RingMaterial = 'ice' | 'rock' | 'dust';
export type PlanetKind = 'rocky' | 'gas';
export type Mineral = 'basalt' | 'iron' | 'salt' | 'sulfur';
export type OceanType = 'fresh' | 'salt' | 'methane';
export type CivLevel = 'none' | 'villages' | 'industrial' | 'space';
export type DisasterType = 'asteroid' | 'supervolcano' | 'iceAge' | 'flare' | 'runaway';

export interface RingSettings {
  enabled: boolean;
  material: RingMaterial;
  /** 0..1 */
  width: number;
  /** #rrggbb */
  color: string;
  /** derece, -45..45 */
  tilt: number;
}

/** Atmosfer bileşimi: göreli ağırlıklar (0..100), hesapta normalize edilir */
export interface Composition {
  n2: number;
  o2: number;
  co2: number;
  ch4: number;
}

/** Zaman çizelgesine yerleştirilmiş bir felaket */
export interface DisasterEvent {
  type: DisasterType;
  /** 0..1 — zaman çizelgesindeki anı */
  time: number;
  /** Krater konumu vb. için */
  seed: number;
}

export interface PlanetSettings {
  /** Rastgelelik tohumu: kıtaların ve ayların şeklini belirler */
  seed: number;
  name: string;
  kind: PlanetKind;

  // Yıldız
  starType: StarType;
  binaryStar: boolean;

  // Yörünge
  /** AB (astronomik birim) */
  distance: number;
  /** 0..0.8 — 0 dairesel, büyüdükçe basık */
  eccentricity: number;
  /** Derece, 0..90 */
  axialTilt: number;
  /** Saat */
  dayLength: number;
  tidalLock: boolean;

  // Gezegen yapısı
  /** Dünya yarıçapı cinsinden: kayalık 0.3..2.5, gaz devi 3..12 */
  size: number;
  /** 0..1 */
  tectonics: number;
  /** 0..1 */
  volcanism: number;
  /** 0..1 */
  craters: number;
  mineral: Mineral;

  // Su
  /** 0..1 — yüzeyin ne kadarı su */
  water: number;
  oceanType: OceanType;
  /** 0..1 */
  tides: number;
  subsurfaceOcean: boolean;

  // Atmosfer
  /** 0..1 — kaydırıcı değeri; basınç logaritmik olarak buradan hesaplanır */
  atmosphere: number;
  composition: Composition;
  /** 0..1 — 0.5 doğal miktar */
  clouds: number;
  /** 0..1 */
  storms: number;
  /** 0..1 */
  wind: number;
  /** 0..1 */
  magneticField: number;

  // Çevre
  /** 0..3 */
  moons: number;
  /** Her ayın göreli büyüklüğü 0..1 */
  moonSizes: [number, number, number];
  rings: RingSettings;

  // Yaşam ve zaman
  civilization: CivLevel;
  /** 0..1 — zaman çizelgesindeki konum (0 = doğuş, 1 = 5 milyar yıl) */
  time: number;
  events: DisasterEvent[];
}

export const STAR_TYPES: StarType[] = ['redDwarf', 'orangeDwarf', 'yellow', 'white', 'blueGiant'];
export const RING_MATERIALS: RingMaterial[] = ['ice', 'rock', 'dust'];
export const MINERALS: Mineral[] = ['basalt', 'iron', 'salt', 'sulfur'];
export const OCEAN_TYPES: OceanType[] = ['fresh', 'salt', 'methane'];
export const CIV_LEVELS: CivLevel[] = ['none', 'villages', 'industrial', 'space'];
export const DISASTER_TYPES: DisasterType[] = ['asteroid', 'supervolcano', 'iceAge', 'flare', 'runaway'];

export const RING_DEFAULT_COLORS: Record<RingMaterial, string> = {
  ice: '#d9e4ee',
  rock: '#a08670',
  dust: '#c9a77c',
};

export const DISTANCE_MIN = 0.01;
export const DISTANCE_MAX = 100;
export const DAY_MIN = 2;
export const DAY_MAX = 5000;
export const SIZE_RANGE: Record<PlanetKind, [number, number]> = { rocky: [0.3, 2.5], gas: [3, 12] };

export function defaultSettings(): PlanetSettings {
  return {
    seed: 1337,
    name: 'Yeni Dünya',
    kind: 'rocky',
    starType: 'yellow',
    binaryStar: false,
    distance: 1,
    eccentricity: 0.02,
    axialTilt: 23.4,
    dayLength: 24,
    tidalLock: false,
    size: 1,
    tectonics: 0.5,
    volcanism: 0.35,
    craters: 0.3,
    mineral: 'basalt',
    water: 0.71,
    oceanType: 'salt',
    tides: 0.4,
    subsurfaceOcean: false,
    atmosphere: 0.6,
    composition: { n2: 78, o2: 21, co2: 1, ch4: 0 },
    clouds: 0.5,
    storms: 0.3,
    wind: 0.3,
    magneticField: 0.6,
    moons: 1,
    moonSizes: [0.6, 0.4, 0.3],
    rings: { enabled: false, material: 'ice', width: 0.5, color: RING_DEFAULT_COLORS.ice, tilt: 18 },
    civilization: 'space',
    time: 1,
    events: [],
  };
}

/** Basit, tohumlanabilir rastgele sayı üreteci (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = ['ka', 've', 'lu', 'tar', 'mi', 'zo', 'ra', 'nen', 'si', 'dor', 'el', 'ya', 'ko', 'rin', 'tu', 'sa', 'va', 'ne', 'or', 'il'];
const SUFFIXES = ['', '', '', ' Prime', ' b', ' c', ' II', ' IV'];

export function randomName(r: () => number): string {
  const n = 2 + Math.floor(r() * 2);
  let s = '';
  for (let i = 0; i < n; i++) s += SYLLABLES[Math.floor(r() * SYLLABLES.length)];
  return s[0].toUpperCase() + s.slice(1) + SUFFIXES[Math.floor(r() * SUFFIXES.length)];
}

export function randomSettings(seed = Math.floor(Math.random() * 1e9)): PlanetSettings {
  const r = rng(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  // Yıldız türü: yaşanabilir türlere biraz daha ağırlık ver
  const starPick = r();
  const starType: StarType =
    starPick < 0.25 ? 'redDwarf' : starPick < 0.5 ? 'orangeDwarf' : starPick < 0.8 ? 'yellow' : starPick < 0.93 ? 'white' : 'blueGiant';
  const lum = STAR_LUMINOSITY[starType];
  // Yaşanabilir bölge merkezine göre logaritmik saçılma
  const distance = clamp(Math.sqrt(lum) * Math.pow(10, (r() - 0.5) * 0.9), DISTANCE_MIN, DISTANCE_MAX);
  const ringOn = r() < 0.35;
  const material = pick(RING_MATERIALS);
  const tidalLock = starType === 'redDwarf' && r() < 0.5;
  return {
    ...defaultSettings(),
    seed,
    name: randomName(r),
    starType,
    binaryStar: r() < 0.12,
    distance,
    eccentricity: round(Math.pow(r(), 3) * 0.5, 2),
    axialTilt: Math.round(Math.pow(r(), 1.6) * 60),
    dayLength: tidalLock ? 24 : Math.round(Math.pow(10, 0.7 + r() * 1.6)),
    tidalLock,
    size: round(0.4 + r() * 1.8, 2),
    tectonics: round(r(), 2),
    volcanism: round(r() * 0.8, 2),
    craters: round(r() * 0.8, 2),
    mineral: pick(MINERALS),
    water: round(r() < 0.12 ? r() * 0.1 : 0.15 + r() * 0.8, 2),
    oceanType: r() < 0.3 ? 'fresh' : 'salt',
    tides: round(r(), 2),
    subsurfaceOcean: r() < 0.2,
    atmosphere: round(0.2 + r() * 0.65, 2),
    composition: { n2: Math.round(30 + r() * 60), o2: Math.round(r() * 30), co2: Math.round(r() * r() * 30), ch4: Math.round(r() * r() * r() * 15) },
    clouds: round(0.25 + r() * 0.5, 2),
    storms: round(r() * 0.7, 2),
    wind: round(r() * 0.7, 2),
    magneticField: round(0.2 + r() * 0.8, 2),
    moons: Math.floor(r() * 4),
    moonSizes: [round(0.2 + r() * 0.8, 2), round(0.2 + r() * 0.8, 2), round(0.2 + r() * 0.8, 2)],
    rings: {
      enabled: ringOn,
      material,
      width: round(0.2 + r() * 0.8, 2),
      color: RING_DEFAULT_COLORS[material],
      tilt: Math.round((r() - 0.5) * 60),
    },
    civilization: 'space',
    time: 1,
    events: [],
  };
}

/** Yıldız parlaklığı, Güneş = 1 */
export const STAR_LUMINOSITY: Record<StarType, number> = {
  redDwarf: 0.02,
  orangeDwarf: 0.3,
  yellow: 1,
  white: 6,
  blueGiant: 1000,
};

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, d: number): number {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

/** Kaydedilmiş ya da dışarıdan gelen veriyi güvenli şekilde ayarlara dönüştürür. */
export function sanitize(raw: unknown): PlanetSettings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, fb: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fb;
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
  const oneOf = <T>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb);
  const ringsRaw = (o.rings ?? {}) as Record<string, unknown>;
  const material = oneOf(ringsRaw.material, RING_MATERIALS, d.rings.material);
  const kind = oneOf(o.kind, ['rocky', 'gas'] as const, d.kind);
  const [sMin, sMax] = SIZE_RANGE[kind];
  const comp = (o.composition ?? {}) as Record<string, unknown>;
  const sizes = Array.isArray(o.moonSizes) ? o.moonSizes : [];
  const events = Array.isArray(o.events) ? o.events : [];
  return {
    seed: num(o.seed, 0, 2 ** 32, d.seed),
    name: typeof o.name === 'string' ? o.name.slice(0, 40) : d.name,
    kind,
    starType: oneOf(o.starType, STAR_TYPES, d.starType),
    binaryStar: bool(o.binaryStar, d.binaryStar),
    distance: num(o.distance, DISTANCE_MIN, DISTANCE_MAX, d.distance),
    eccentricity: num(o.eccentricity, 0, 0.8, d.eccentricity),
    axialTilt: num(o.axialTilt, 0, 90, d.axialTilt),
    dayLength: num(o.dayLength, DAY_MIN, DAY_MAX, d.dayLength),
    tidalLock: bool(o.tidalLock, d.tidalLock),
    size: num(o.size, sMin, sMax, kind === 'gas' ? 11 : d.size),
    tectonics: num(o.tectonics, 0, 1, d.tectonics),
    volcanism: num(o.volcanism, 0, 1, d.volcanism),
    craters: num(o.craters, 0, 1, d.craters),
    mineral: oneOf(o.mineral, MINERALS, d.mineral),
    water: num(o.water, 0, 1, d.water),
    oceanType: oneOf(o.oceanType, OCEAN_TYPES, d.oceanType),
    tides: num(o.tides, 0, 1, d.tides),
    subsurfaceOcean: bool(o.subsurfaceOcean, d.subsurfaceOcean),
    atmosphere: num(o.atmosphere, 0, 1, d.atmosphere),
    composition: {
      n2: num(comp.n2, 0, 100, d.composition.n2),
      o2: num(comp.o2, 0, 100, d.composition.o2),
      co2: num(comp.co2, 0, 100, d.composition.co2),
      ch4: num(comp.ch4, 0, 100, d.composition.ch4),
    },
    clouds: num(o.clouds, 0, 1, d.clouds),
    storms: num(o.storms, 0, 1, d.storms),
    wind: num(o.wind, 0, 1, d.wind),
    magneticField: num(o.magneticField, 0, 1, d.magneticField),
    moons: Math.round(num(o.moons, 0, 3, d.moons)),
    moonSizes: [0, 1, 2].map((i) => num(sizes[i], 0, 1, d.moonSizes[i])) as [number, number, number],
    rings: {
      enabled: bool(ringsRaw.enabled, d.rings.enabled),
      material,
      width: num(ringsRaw.width, 0, 1, d.rings.width),
      color: typeof ringsRaw.color === 'string' && /^#[0-9a-f]{6}$/i.test(ringsRaw.color) ? ringsRaw.color : RING_DEFAULT_COLORS[material],
      tilt: num(ringsRaw.tilt, -45, 45, d.rings.tilt),
    },
    civilization: oneOf(o.civilization, CIV_LEVELS, d.civilization),
    time: num(o.time, 0, 1, d.time),
    events: events
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .filter((e) => DISASTER_TYPES.includes(e.type as DisasterType))
      .slice(0, 12)
      .map((e) => ({ type: e.type as DisasterType, time: num(e.time, 0, 1, 0.5), seed: num(e.seed, 0, 2 ** 32, 1) })),
  };
}
