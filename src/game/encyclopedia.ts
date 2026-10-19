import { t } from '../i18n';
import type { PlanetReport } from '../sim/physics';
import type { PlanetSettings } from '../state/settings';

export type EntryId = keyof typeof t.entries;

export const ENTRY_IDS = Object.keys(t.entries) as EntryId[];

/** "?" butonları → ansiklopedi maddeleri */
export const INFO_TO_ENTRY: Partial<Record<string, EntryId>> = {
  distance: 'habitableZone',
  atmosphere: 'greenhouse',
  composition: 'greenhouse',
  tidalLock: 'tidalLock',
  axialTilt: 'axialTilt',
  binaryStar: 'binaryStar',
  tectonics: 'plateTectonics',
  volcanism: 'carbonCycle',
  magneticField: 'magnetosphere',
  subsurfaceOcean: 'subsurfaceOcean',
  oceanType: 'methaneOcean',
  planetKind: 'gasGiant',
  eccentricity: 'eccentricity',
  starType: 'redDwarf',
};

/** Oyunda görülen durumlardan keşfedilen maddeler */
export function discoveredBy(s: PlanetSettings, r: PlanetReport): EntryId[] {
  const out: EntryId[] = [];
  if (r.hzStatus === 'in') out.push('habitableZone');
  if (r.pressure > 0.5) out.push('greenhouse');
  if (s.starType === 'redDwarf') out.push('redDwarf');
  if (s.starType === 'blueGiant') out.push('blueGiant');
  if (s.binaryStar) out.push('binaryStar');
  if (s.tidalLock) out.push('tidalLock');
  if (s.subsurfaceOcean && r.waterState === 'frozen') out.push('subsurfaceOcean');
  if (s.oceanType === 'methane') out.push('methaneOcean');
  if (s.kind === 'gas') out.push('gasGiant');
  if (r.visual.aurora > 0.6) out.push('aurora');
  if (r.esi > 0.8) out.push('esi');
  if (r.tAvg > 380 && s.water > 0.05 && r.pressure > 1) out.push('runaway');
  for (const e of s.events) {
    if (e.time > s.time) continue;
    if (e.type === 'asteroid') out.push('impactWinter');
    if (e.type === 'iceAge') out.push('iceAge');
    if (e.type === 'flare') out.push('stellarFlare');
    if (e.type === 'supervolcano') out.push('supervolcano');
    if (e.type === 'runaway') out.push('runaway');
  }
  return out;
}
