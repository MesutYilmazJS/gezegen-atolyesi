import { t } from '../i18n';
import { PlanetSettings, defaultSettings } from '../state/settings';

export type RealPlanetId = keyof typeof t.realPlanets;

/** Atmosfer basıncından (bar) kaydırıcı değeri */
const atm = (bar: number) => (bar <= 0 ? 0 : (Math.log10(bar) + 3) / 5);

const base = (id: RealPlanetId, seed: number, p: Partial<PlanetSettings>): PlanetSettings => ({
  ...defaultSettings(),
  seed,
  name: t.realPlanets[id].name,
  ...p,
});

export const REAL_PLANETS: { id: RealPlanetId; color: string; settings: () => PlanetSettings }[] = [
  {
    id: 'mercury',
    color: '#8c8680',
    settings: () =>
      base('mercury', 88, {
        distance: 0.39, size: 0.38, water: 0, atmosphere: 0, volcanism: 0.05, tectonics: 0.05, craters: 0.95,
        moons: 0, axialTilt: 0.03, dayLength: 4222, eccentricity: 0.21, magneticField: 0.1, civilization: 'none',
      }),
  },
  {
    id: 'venus',
    color: '#e3c27a',
    settings: () =>
      base('venus', 225, {
        distance: 0.72, size: 0.95, water: 0, atmosphere: atm(92), volcanism: 0.45, tectonics: 0.08, craters: 0.1,
        composition: { n2: 3, o2: 0, co2: 96, ch4: 0 }, clouds: 0.95, moons: 0, axialTilt: 2.6, dayLength: 2802,
        eccentricity: 0.007, magneticField: 0, storms: 0.2, wind: 0.85, civilization: 'none',
      }),
  },
  { id: 'earth', color: '#4c8fd6', settings: () => base('earth', 1337, {}) },
  {
    id: 'mars',
    color: '#c8643c',
    settings: () =>
      base('mars', 687, {
        distance: 1.52, size: 0.53, water: 0.05, atmosphere: atm(0.006), volcanism: 0.06, tectonics: 0.05, craters: 0.6,
        mineral: 'iron', composition: { n2: 3, o2: 0, co2: 95, ch4: 0 }, moons: 2, moonSizes: [0.15, 0.1, 0.3],
        axialTilt: 25.2, dayLength: 24.6, eccentricity: 0.093, magneticField: 0.05, clouds: 0.2, civilization: 'none',
      }),
  },
  {
    id: 'jupiter',
    color: '#d29b6a',
    settings: () =>
      base('jupiter', 4333, {
        kind: 'gas', distance: 5.2, size: 11.2, moons: 3, moonSizes: [0.8, 0.7, 0.9], axialTilt: 3.1, dayLength: 9.9,
        storms: 0.8, wind: 0.7, magneticField: 1, rings: { ...defaultSettings().rings, enabled: false },
      }),
  },
  {
    id: 'saturn',
    color: '#e6cf9c',
    settings: () =>
      base('saturn', 10759, {
        kind: 'gas', distance: 9.58, size: 9.45, moons: 3, moonSizes: [0.9, 0.4, 0.3], axialTilt: 26.7, dayLength: 10.7,
        storms: 0.4, wind: 0.8, magneticField: 0.7,
        rings: { enabled: true, material: 'ice', width: 0.85, color: '#e3d6bd', tilt: 0 },
      }),
  },
  {
    id: 'trappist1e',
    color: '#b85a3a',
    settings: () =>
      base('trappist1e', 61, {
        starType: 'redDwarf', distance: 0.174, size: 0.92, water: 0.6, atmosphere: atm(1.2), tidalLock: true,
        axialTilt: 0, eccentricity: 0.005, moons: 0, magneticField: 0.4,
      }),
  },
  {
    id: 'proximab',
    color: '#a65a4a',
    settings: () =>
      base('proximab', 112, {
        starType: 'redDwarf', distance: 0.175, size: 1.07, water: 0.4, atmosphere: atm(0.8), tidalLock: true,
        axialTilt: 0, eccentricity: 0.1, moons: 0, magneticField: 0.3,
      }),
  },
  {
    id: 'kepler452b',
    color: '#5aa36a',
    settings: () =>
      base('kepler452b', 385, {
        distance: 0.95, size: 1.5, water: 0.6, atmosphere: atm(2), volcanism: 0.55, tectonics: 0.7, dayLength: 30,
        moons: 1, moonSizes: [0.4, 0.4, 0.3], magneticField: 0.7,
      }),
  },
];
