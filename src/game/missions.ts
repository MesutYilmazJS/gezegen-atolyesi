import { t } from '../i18n';
import type { PlanetReport } from '../sim/physics';
import { PlanetSettings, defaultSettings } from '../state/settings';

export type MissionId = keyof typeof t.missions;

export interface Goal {
  label: string;
  test: (s: PlanetSettings, r: PlanetReport) => boolean;
}

export interface Mission {
  id: MissionId;
  goals: Goal[];
  /** Tamamlanınca açılan ayarlar (kilit anahtarları) */
  unlocks: string[];
  /** Görev başlarken yüklenen gezegen (yoksa mevcut gezegenle devam edilir) */
  start?: () => PlanetSettings;
}

const stageAtLeast = (n: number): Goal => ({ label: `${t.currentStage}: ${t.stages[n]}+`, test: (_s, r) => r.stage >= n });

/** Görevler sırayla açılır; her biri yeni ayarların kilidini açar. */
export const MISSIONS: Mission[] = [
  {
    id: 'firstSteps',
    goals: [{ label: `${t.habitability} ≥ 50`, test: (_s, r) => r.habitability >= 50 }],
    unlocks: ['tectonics', 'craters', 'mineral', 'white'],
    start: () => ({ ...defaultSettings(), name: 'Çorak', distance: 2.6, water: 0.25, atmosphere: 0.45, moons: 0, seed: 404 }),
  },
  {
    id: 'earthTwin',
    goals: [{ label: `${t.earthSimilarity} ≥ %90`, test: (_s, r) => r.esi >= 0.9 }],
    unlocks: ['composition', 'clouds', 'binaryStar'],
    start: () => ({ ...defaultSettings(), name: 'İkiz', distance: 1.6, size: 1.6, water: 0.35, atmosphere: 0.75, seed: 2024 }),
  },
  {
    id: 'redSun',
    goals: [
      { label: `${t.starType}: ${t.starTypes.redDwarf}`, test: (s) => s.starType === 'redDwarf' },
      { label: `${t.habitability} ≥ 60`, test: (_s, r) => r.habitability >= 60 },
    ],
    unlocks: ['tidalLock', 'dayLength', 'eccentricity', 'axialTilt'],
  },
  {
    id: 'iceAndFire',
    goals: [
      { label: t.liquidWater, test: (_s, r) => r.waterState === 'liquid' },
      { label: '❄ Buzullar', test: (_s, r) => r.hasIce },
      { label: '🏜 Çöller', test: (_s, r) => r.hasDesert },
    ],
    unlocks: ['oceanType', 'tides', 'blueGiant'],
  },
  {
    id: 'oceanWorld',
    goals: [{ label: `${t.water} ≥ %96`, test: (s) => s.water >= 0.96 }, stageAtLeast(5)],
    unlocks: ['moonSizes', 'disasters'],
  },
  {
    id: 'ringLord',
    goals: [
      { label: t.rings, test: (s) => s.rings.enabled },
      { label: `${t.moons}: 3`, test: (s) => s.moons === 3 },
      stageAtLeast(3),
    ],
    unlocks: ['storms', 'wind', 'kind'],
  },
  {
    id: 'twoSuns',
    goals: [
      { label: t.binaryStar, test: (s) => s.binaryStar },
      { label: `${t.habitability} ≥ 50`, test: (_s, r) => r.habitability >= 50 },
    ],
    unlocks: ['subsurfaceOcean', 'magneticField'],
  },
  {
    id: 'underIce',
    goals: [{ label: `${t.liquidWater}: ${t.frozen}`, test: (_s, r) => r.waterState === 'frozen' }, stageAtLeast(3)],
    unlocks: ['civilization'],
  },
  {
    id: 'saveCiv',
    goals: [
      { label: t.disasterNames.asteroid, test: (s) => s.events.some((e) => e.type === 'asteroid') },
      { label: t.stages[6], test: (_s, r) => r.civilizationRescued },
    ],
    unlocks: [],
    start: () => ({ ...defaultSettings(), name: 'Son Umut', seed: 777 }),
  },
  {
    id: 'venus',
    goals: [
      { label: t.disasterNames.runaway, test: (s) => s.events.some((e) => e.type === 'runaway') },
      { label: `${t.water} ≥ %20`, test: (s) => s.water >= 0.2 },
      { label: `${t.liquidWater}: ${t.vapor}`, test: (_s, r) => r.waterState === 'vapor' && !r.young },
    ],
    unlocks: [],
    start: () => ({ ...defaultSettings(), name: 'Mavi Kardeş', seed: 31 }),
  },
];

/** Bir kilit anahtarını açan görev */
const UNLOCKED_BY = new Map<string, MissionId>();
for (const m of MISSIONS) for (const k of m.unlocks) UNLOCKED_BY.set(k, m.id);

export function lockedBy(key: string, completed: string[]): string | null {
  const m = UNLOCKED_BY.get(key);
  if (!m || completed.includes(m)) return null;
  return t.missions[m].name;
}

/** Sıradaki görevler: bir görev, öncekisi bitince açılır */
export function isMissionAvailable(id: MissionId, completed: string[]): boolean {
  const i = MISSIONS.findIndex((m) => m.id === id);
  return i <= 0 || completed.includes(MISSIONS[i - 1].id);
}
