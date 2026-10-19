import { t } from '../i18n';
import type { PlanetReport } from '../sim/physics';
import type { PlanetSettings } from '../state/settings';
import { REAL_PLANETS } from './realPlanets';

export type BadgeId = keyof typeof t.badges;

export interface BadgeContext {
  settings: PlanetSettings;
  report: PlanetReport;
  albumCount: number;
  realViewed: string[];
}

export const BADGES: { id: BadgeId; test: (c: BadgeContext) => boolean }[] = [
  { id: 'firstLife', test: ({ report }) => report.stage >= 3 },
  { id: 'ringLord', test: ({ settings, report }) => settings.rings.enabled && settings.moons === 3 && report.stage >= 3 },
  { id: 'survivor', test: ({ report }) => report.survivedDisaster },
  { id: 'twoSuns', test: ({ settings, report }) => settings.binaryStar && report.stage >= 3 },
  { id: 'civilization', test: ({ report }) => report.stage >= 6 },
  { id: 'oceanWorld', test: ({ settings, report }) => settings.water >= 0.96 && report.stage >= 3 },
  { id: 'collector', test: ({ albumCount }) => albumCount >= 5 },
  { id: 'explorer', test: ({ realViewed }) => REAL_PLANETS.every((p) => realViewed.includes(p.id)) },
];

export function badgeIcon(id: BadgeId): string {
  return `${import.meta.env.BASE_URL}badges/${id}.png`;
}
