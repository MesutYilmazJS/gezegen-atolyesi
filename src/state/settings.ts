export type StarType = 'redDwarf' | 'orangeDwarf' | 'yellow' | 'white' | 'blueGiant';
export type RingMaterial = 'ice' | 'rock' | 'dust';

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

export interface PlanetSettings {
  /** Rastgelelik tohumu: kıtaların ve ayların şeklini belirler */
  seed: number;
  name: string;
  starType: StarType;
  /** AB (astronomik birim) */
  distance: number;
  /** Dünya yarıçapı cinsinden, 0.3..2.5 */
  size: number;
  /** 0..1 — yüzeyin ne kadarı su */
  water: number;
  /** 0..1 — kaydırıcı değeri; basınç logaritmik olarak buradan hesaplanır */
  atmosphere: number;
  /** 0..1 */
  volcanism: number;
  /** 0..3 */
  moons: number;
  rings: RingSettings;
  /** 0..1 — zaman çizelgesindeki konum (0 = doğuş, 1 = 5 milyar yıl) */
  time: number;
}

export const STAR_TYPES: StarType[] = ['redDwarf', 'orangeDwarf', 'yellow', 'white', 'blueGiant'];
export const RING_MATERIALS: RingMaterial[] = ['ice', 'rock', 'dust'];

export const RING_DEFAULT_COLORS: Record<RingMaterial, string> = {
  ice: '#d9e4ee',
  rock: '#a08670',
  dust: '#c9a77c',
};

export const DISTANCE_MIN = 0.01;
export const DISTANCE_MAX = 100;

export function defaultSettings(): PlanetSettings {
  return {
    seed: 1337,
    name: 'Yeni Dünya',
    starType: 'yellow',
    distance: 1,
    size: 1,
    water: 0.71,
    atmosphere: 0.6,
    volcanism: 0.35,
    moons: 1,
    rings: { enabled: false, material: 'ice', width: 0.5, color: RING_DEFAULT_COLORS.ice, tilt: 18 },
    time: 1,
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
  // Yıldız türü: yaşanabilir türlere biraz daha ağırlık ver
  const starPick = r();
  const starType: StarType =
    starPick < 0.25 ? 'redDwarf' : starPick < 0.5 ? 'orangeDwarf' : starPick < 0.8 ? 'yellow' : starPick < 0.93 ? 'white' : 'blueGiant';
  const lum = STAR_LUMINOSITY[starType];
  // Yaşanabilir bölge merkezine göre logaritmik saçılma
  const distance = clamp(Math.sqrt(lum) * Math.pow(10, (r() - 0.5) * 0.9), DISTANCE_MIN, DISTANCE_MAX);
  const ringOn = r() < 0.35;
  const material = RING_MATERIALS[Math.floor(r() * 3)];
  return {
    seed,
    name: randomName(r),
    starType,
    distance,
    size: round(0.4 + r() * 1.8, 2),
    water: round(r() < 0.12 ? r() * 0.1 : 0.15 + r() * 0.8, 2),
    atmosphere: round(0.2 + r() * 0.65, 2),
    volcanism: round(r() * 0.8, 2),
    moons: Math.floor(r() * 4),
    rings: {
      enabled: ringOn,
      material,
      width: round(0.2 + r() * 0.8, 2),
      color: RING_DEFAULT_COLORS[material],
      tilt: Math.round((r() - 0.5) * 60),
    },
    time: 1,
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
  const ringsRaw = (o.rings ?? {}) as Record<string, unknown>;
  const material = RING_MATERIALS.includes(ringsRaw.material as RingMaterial) ? (ringsRaw.material as RingMaterial) : d.rings.material;
  return {
    seed: num(o.seed, 0, 2 ** 32, d.seed),
    name: typeof o.name === 'string' ? o.name.slice(0, 40) : d.name,
    starType: STAR_TYPES.includes(o.starType as StarType) ? (o.starType as StarType) : d.starType,
    distance: num(o.distance, DISTANCE_MIN, DISTANCE_MAX, d.distance),
    size: num(o.size, 0.3, 2.5, d.size),
    water: num(o.water, 0, 1, d.water),
    atmosphere: num(o.atmosphere, 0, 1, d.atmosphere),
    volcanism: num(o.volcanism, 0, 1, d.volcanism),
    moons: Math.round(num(o.moons, 0, 3, d.moons)),
    rings: {
      enabled: typeof ringsRaw.enabled === 'boolean' ? ringsRaw.enabled : d.rings.enabled,
      material,
      width: num(ringsRaw.width, 0, 1, d.rings.width),
      color: typeof ringsRaw.color === 'string' && /^#[0-9a-f]{6}$/i.test(ringsRaw.color) ? ringsRaw.color : RING_DEFAULT_COLORS[material],
      tilt: num(ringsRaw.tilt, -45, 45, d.rings.tilt),
    },
    time: num(o.time, 0, 1, d.time),
  };
}
