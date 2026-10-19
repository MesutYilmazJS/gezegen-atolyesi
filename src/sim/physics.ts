// Basitleştirilmiş ama bilimsel temelli gezegen hesapları.
// Tüm sıcaklıklar Kelvin, basınç bar, yerçekimi Dünya = 1.
import { t } from '../i18n';
import { PlanetSettings, STAR_LUMINOSITY, StarType, clamp } from '../state/settings';

export type RGB = [number, number, number];
export type WaterState = 'none' | 'liquid' | 'frozen' | 'vapor';

/** Her aşamanın zaman çizelgesindeki başlangıcı (0..1) */
export const STAGE_STARTS = [0, 0.04, 0.16, 0.3, 0.46, 0.64, 0.86];
/** Zaman çizelgesinin tamamı, milyar yıl */
export const TIMELINE_GYR = 5;

interface StarInfo {
  temperature: number;
  /** Güneş yarıçapı cinsinden */
  radius: number;
  color: RGB;
  vegetation: RGB;
  /** Yıldızın yaşam süresi boyunca ulaşılabilecek en ileri aşama */
  maxStage: number;
}

export const STARS: Record<StarType, StarInfo> = {
  redDwarf: { temperature: 3200, radius: 0.3, color: [1.0, 0.42, 0.22], vegetation: [0.03, 0.025, 0.035], maxStage: 6 },
  orangeDwarf: { temperature: 4500, radius: 0.75, color: [1.0, 0.7, 0.42], vegetation: [0.28, 0.08, 0.04], maxStage: 6 },
  yellow: { temperature: 5800, radius: 1, color: [1.0, 0.95, 0.86], vegetation: [0.07, 0.22, 0.04], maxStage: 6 },
  white: { temperature: 8000, radius: 1.8, color: [0.86, 0.92, 1.0], vegetation: [0.13, 0.1, 0.3], maxStage: 5 },
  blueGiant: { temperature: 22000, radius: 9, color: [0.6, 0.72, 1.0], vegetation: [0.1, 0.2, 0.3], maxStage: 1 },
};

export interface VisualState {
  starColor: RGB;
  skyColor: RGB;
  /** Atmosfer halesinin gücü 0..1 */
  haze: number;
  cloudCover: number;
  cloudColor: RGB;
  vegetationColor: RGB;
  /** sin(enlem) cinsinden buz sınırı; 0 = her yer buz, 1+ = buz yok */
  iceLine: number;
  /** Okyanusların donma oranı 0..1 */
  seaIce: number;
  /** 0..1 — yüzey ısısı nedeniyle kızıllık */
  heat: number;
  molten: number;
  craters: number;
  oceanFill: number;
  microbes: number;
  vegetation: number;
  cities: number;
  /** Volkanik lav ışıltısı */
  lava: number;
}

export interface PlanetReport {
  luminosity: number;
  star: StarInfo;
  hzInner: number;
  hzOuter: number;
  hzStatus: 'close' | 'in' | 'far';
  pressure: number;
  gravity: number;
  tAvg: number;
  tMax: number;
  tMin: number;
  waterState: WaterState;
  /** Gezegen henüz soğumadı (zaman çizelgesinin başı) */
  young: boolean;
  habitability: number;
  esi: number;
  ageGyr: number;
  timeStage: number;
  maxStage: number;
  stage: number;
  stuckReason: string | null;
  lifeNotes: string[];
  hazards: string[];
  story: string;
  visual: VisualState;
}

const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const mix3 = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const gauss = (x: number, mu: number, sigma: number) => Math.exp(-(((x - mu) / sigma) ** 2));

/** Atmosfer kaydırıcısından yüzey basıncı (bar). 0.6 → 1 bar, 1 → 100 bar. */
export function sliderToPressure(a: number): number {
  if (a <= 0.001) return 0;
  return Math.pow(10, -3 + 5 * a);
}

/** Suyun verilen basınçtaki kaynama noktası (Clausius–Clapeyron yaklaşımı). */
function boilingPoint(pBar: number): number {
  if (pBar <= 0.006) return 273; // üçlü nokta altında sıvı su olamaz
  return 1 / (1 / 373 - (8.314 / 40660) * Math.log(pBar));
}

/** Kaydırıcı konumu (0..1, her aşama eşit genişlikte) → gerçek zaman (0..1) */
export function sliderToTime(x: number): number {
  const n = STAGE_STARTS.length;
  const i = Math.min(n - 1, Math.floor(clamp(x, 0, 1) * n));
  const local = clamp(x, 0, 1) * n - i;
  const a = STAGE_STARTS[i];
  const b = i + 1 < n ? STAGE_STARTS[i + 1] : 1;
  return a + (b - a) * local;
}

export function timeToSlider(time: number): number {
  const s = stageAt(time);
  const a = STAGE_STARTS[s];
  const b = s + 1 < STAGE_STARTS.length ? STAGE_STARTS[s + 1] : 1;
  return (s + (b > a ? (time - a) / (b - a) : 0)) / STAGE_STARTS.length;
}

export function stageAt(time: number): number {
  let s = 0;
  for (let i = 0; i < STAGE_STARTS.length; i++) if (time >= STAGE_STARTS[i]) s = i;
  return s;
}

export function computeReport(s: PlanetSettings): PlanetReport {
  const star = STARS[s.starType];
  const L = STAR_LUMINOSITY[s.starType];
  const hzInner = Math.sqrt(L / 1.1);
  const hzOuter = Math.sqrt(L / 0.36);
  const hzStatus = s.distance < hzInner ? 'close' : s.distance > hzOuter ? 'far' : 'in';

  // Yerçekimi: kayalık gezegenlerde kütle ~ R^3.7 → g ~ R^1.7 (yaklaşık)
  const gravity = Math.pow(s.size, 1.7) * (s.size > 1.6 ? 0.9 : 1);

  // Basınç: küçük gezegenler havasını tutamaz, volkanlar gaz ekler
  const basePressure = sliderToPressure(s.atmosphere);
  const retention = clamp((gravity - 0.12) / 0.38, 0.05, 1);
  const pressure = basePressure * retention * (0.88 + 0.35 * s.volcanism);

  // Denge sıcaklığı (önce varsayılan yansıtma ile)
  const tEqFor = (albedo: number) => (278.6 * Math.pow(L * (1 - albedo), 0.25)) / Math.sqrt(s.distance);
  const greenhouse = 33 * Math.pow(pressure, 0.6) * (pressure > 3 ? 1 + 0.15 * Math.log10(pressure) : 1);
  const volcanicHeat = (s.volcanism - 0.35) * 10;
  let tAvg = tEqFor(0.3) + greenhouse + volcanicHeat;

  // Buz ve bulut yansıtması bir kez düzelt
  const iceAlbedo = tAvg < 260 && s.water > 0.05 ? smoothstep(260, 220, tAvg) * 0.3 * s.water : 0;
  const albedo = clamp(0.3 + iceAlbedo - (s.water < 0.05 ? 0.05 : 0), 0.05, 0.75);
  tAvg = tEqFor(albedo) + greenhouse + volcanicHeat;

  // Gece-gündüz farkı: ince atmosfer → büyük fark
  const swing = 12 + 160 / (1 + 4 * Math.sqrt(pressure));
  const tMax = tAvg + swing * 0.55;
  const tMin = Math.max(3, tAvg - swing);

  // Suyun durumu
  const boil = boilingPoint(pressure);
  const waterStateAt = (temp: number): WaterState => {
    if (s.water < 0.03) return 'none';
    if (pressure <= 0.006) return temp < 273 ? 'frozen' : 'vapor';
    if (temp >= boil) return 'vapor';
    if (temp < 255) return 'frozen';
    return 'liquid';
  };
  const waterState = waterStateAt(tAvg);
  const liquid = waterState === 'liquid';
  const oceanWorld = s.water > 0.95;

  // Yaşanabilirlik puanı
  const pressureScore = pressure <= 0.001 ? 0 : gauss(Math.log10(pressure), 0, 1.1);
  const gravScore = gauss(gravity, 1, 0.9);
  const starScore = { redDwarf: 0.75, orangeDwarf: 1, yellow: 1, white: 0.65, blueGiant: 0.05 }[s.starType];
  const volcScore = 1 - Math.abs(s.volcanism - 0.35) * 0.7;
  const scoreFor = (temp: number, state: WaterState) => {
    const tempScore = gauss(temp, 290, 32);
    const waterScore = state === 'liquid' ? (s.water < 0.15 ? 0.5 + s.water * 3 : s.water > 0.92 ? 0.75 : 1) : state === 'frozen' ? 0.12 : 0;
    return Math.round(
      100 * Math.pow(tempScore, 0.9) * (0.12 + 0.88 * waterScore) * (0.15 + 0.85 * pressureScore) * (0.4 + 0.6 * gravScore) * starScore * volcScore,
    );
  };
  // Uzun vadeli (denge) yaşanabilirlik: evrimin nereye kadar gidebileceğini belirler
  const habitability = scoreFor(tAvg, waterState);

  // Genç gezegen henüz soğumadı: zaman çizelgesinin başında yüzey çok sıcak
  const primordialHeat = 1400 * Math.pow(1 - smoothstep(0, 0.14, s.time), 2);
  const tNow = tAvg + primordialHeat;
  const waterNow = waterStateAt(tNow);
  const habitabilityNow = scoreFor(tNow, waterNow);

  // Dünya Benzerlik İndeksi (ESI) + su ve basınç terimleri
  const esiTerm = (x: number, x0: number, w: number) => Math.pow(1 - Math.abs(x - x0) / (x + x0), w);
  const escapeVel = Math.sqrt(s.size * gravity);
  const esiCore = Math.pow(esiTerm(s.size, 1, 0.57) * esiTerm(escapeVel, 1, 0.7) * esiTerm(Math.max(tNow, 1), 288, 5.58), 1 / 3);
  const esi = clamp(esiCore * (1 - Math.abs(s.water - 0.71) * 0.5) * (pressure > 0 ? gauss(Math.log10(pressure), 0, 2) : 0.4), 0, 1);

  // Evrim: koşullara göre ulaşılabilecek en ileri aşama
  let maxStage = 6;
  let stuckReason: string | null = null;
  const cap = (stage: number, reason: string) => {
    if (stage < maxStage) {
      maxStage = stage;
      stuckReason = reason;
    }
  };
  cap(star.maxStage, s.starType === 'blueGiant' ? t.sim.stuck.blueGiant : t.sim.stuck.whiteStar);
  if (s.water < 0.03) cap(1, t.sim.stuck.noWater);
  else if (waterState === 'vapor') cap(1, pressure <= 0.006 ? t.sim.stuck.noAtmosphere : t.sim.stuck.boiled);
  else if (waterState === 'frozen') {
    if (s.volcanism > 0.25 && tAvg > 150) cap(3, t.sim.stuck.underIce);
    else cap(2, t.sim.stuck.frozen);
  }
  if (liquid) {
    if (tAvg > 335) cap(2, t.sim.stuck.tooHotForLife);
    else if (habitability < 18) cap(3, t.sim.stuck.harsh);
    else if (habitability < 35) cap(4, t.sim.stuck.noOxygen);
    if (oceanWorld) cap(5, t.sim.stuck.oceanWorld);
    if (habitability < 52) cap(5, t.sim.stuck.noCivilization);
  }

  const timeStage = stageAt(s.time);
  const stage = Math.min(timeStage, maxStage);
  const ageGyr = s.time * TIMELINE_GYR;

  // Görsel durum
  const tt = s.time;
  const canOcean = waterState === 'liquid' || waterState === 'frozen';
  const weathering = clamp(pressure, 0, 1) * (s.water > 0.05 ? 1 : 0.3);
  const visual: VisualState = {
    starColor: star.color,
    skyColor: skyColor(s.starType, pressure, tAvg, s.water),
    haze: pressure <= 0.0005 ? 0 : clamp((Math.log10(pressure) + 3) / 4.2, 0, 1),
    cloudCover: cloudCover(pressure, s.water, tAvg, waterState),
    cloudColor: pressure > 20 && tAvg > 400 ? [0.95, 0.82, 0.55] : tt < 0.1 ? [0.35, 0.32, 0.3] : [1, 1, 1],
    vegetationColor: star.vegetation,
    iceLine: s.water < 0.01 ? 2 : clamp(0.92 + (tNow - 288) / 70, -0.1, 2),
    seaIce: waterNow === 'frozen' ? 1 : smoothstep(268, 248, tNow),
    heat: smoothstep(330, 700, tNow),
    molten: 1 - smoothstep(0.0, 0.07, tt),
    craters: smoothstep(0.02, 0.09, tt) * (1 - 0.8 * smoothstep(0.16, 0.6, tt) * weathering),
    oceanFill: canOcean ? smoothstep(0.13, 0.25, tt) : 0,
    microbes: maxStage >= 3 ? smoothstep(0.3, 0.4, tt) : 0,
    vegetation: maxStage >= 4 && !oceanWorld ? smoothstep(0.46, 0.6, tt) * clamp(habitability / 50, 0.35, 1) : 0,
    cities: maxStage >= 6 ? smoothstep(0.86, 0.96, tt) : 0,
    lava: clamp(s.volcanism * 1.2 - 0.25, 0, 1) * (0.5 + 0.5 * (1 - smoothstep(0.1, 0.5, tt))),
  };

  const report: PlanetReport = {
    luminosity: L,
    star,
    hzInner,
    hzOuter,
    hzStatus,
    pressure,
    gravity,
    tAvg: tNow,
    tMax: tMax + primordialHeat,
    tMin: tMin + primordialHeat,
    waterState: waterNow,
    young: primordialHeat > 100,
    habitability: habitabilityNow,
    esi,
    ageGyr,
    timeStage,
    maxStage,
    stage,
    stuckReason: timeStage > maxStage ? stuckReason : null,
    lifeNotes: [],
    hazards: [],
    story: '',
    visual,
  };
  report.lifeNotes = lifeNotes(s, report);
  report.hazards = hazards(s, report);
  report.story = story(s, report);
  return report;
}

function skyColor(starType: StarType, pressure: number, tAvg: number, water: number): RGB {
  if (pressure < 0.003) return [0.02, 0.02, 0.03];
  const rayleigh: Record<StarType, RGB> = {
    redDwarf: [0.95, 0.5, 0.38],
    orangeDwarf: [0.55, 0.62, 0.9],
    yellow: [0.32, 0.56, 1.0],
    white: [0.36, 0.55, 1.0],
    blueGiant: [0.3, 0.42, 1.0],
  };
  let c = rayleigh[starType];
  // İnce ve tozlu (Mars gibi) → karamel rengi
  if (water < 0.15 && pressure < 0.3) c = mix3(c, [0.85, 0.6, 0.42], 0.75);
  // Kalın ve sıcak (Venüs gibi) → sarı-turuncu
  c = mix3(c, [1.0, 0.72, 0.35], smoothstep(5, 60, pressure) * smoothstep(320, 500, tAvg));
  // İnce atmosferde gökyüzü koyulaşır
  const k = smoothstep(0.003, 0.4, pressure);
  return mix3([0.03, 0.03, 0.05], c, k);
}

function cloudCover(pressure: number, water: number, tAvg: number, state: WaterState): number {
  if (pressure < 0.01) return 0;
  const thick = smoothstep(0.01, 0.6, pressure);
  let c = 0.18 + water * 0.4 + clamp((tAvg - 280) / 250, -0.15, 0.3);
  if (state === 'vapor' && pressure > 5) c = 0.95;
  if (state === 'frozen') c *= 0.6;
  return clamp(c * thick, 0, 0.97);
}

function fmtC(k: number): number {
  return Math.round(k - 273.15);
}

function lifeNotes(s: PlanetSettings, r: PlanetReport): string[] {
  const n = t.sim.life;
  const notes: string[] = [];
  if (r.stage < 3) {
    if (r.maxStage === 3 && r.waterState === 'frozen') notes.push(n.underIce);
    return notes;
  }
  if (r.waterState === 'frozen') notes.push(n.underIce);
  if (r.stage === 3) notes.push(n.microbes);
  if (r.stage >= 4) {
    notes.push(n.plantColor[s.starType]);
    if (r.gravity < 0.6) notes.push(n.lowGravityTrees(Math.round(60 / Math.max(r.gravity, 0.15) / 10) * 10));
    if (r.gravity > 1.6) notes.push(n.highGravity);
  }
  if (r.stage >= 3 && s.water > 0.95) notes.push(n.oceanWorld);
  if (r.stage >= 5) {
    if (r.pressure > 4) notes.push(n.denseAir);
    if (r.tAvg > 305) notes.push(n.heatAdapted);
    if (r.tAvg < 270) notes.push(n.coldAdapted);
    if (s.moons === 0) notes.push(n.noMoons);
    if (s.moons >= 2) notes.push(n.bigTides(s.moons));
    if (s.starType === 'redDwarf') notes.push(n.redDwarfEyes);
  }
  if (r.stage >= 6) notes.push(n.civilization);
  return notes;
}

function hazards(s: PlanetSettings, r: PlanetReport): string[] {
  const h = t.sim.hazards;
  const list: string[] = [];
  if (s.starType === 'blueGiant') list.push(h.blueGiant);
  if (s.starType === 'redDwarf') list.push(h.flares);
  if (r.young) {
    list.push(h.molten(fmtC(r.tAvg)));
    return list;
  }
  if (r.gravity < 0.5 && r.pressure > 0) list.push(h.weakMagnetic);
  if (r.tAvg > 380 && s.water > 0.05 && r.pressure > 1) list.push(h.runawayGreenhouse);
  else if (r.tAvg > 330) list.push(h.tooHot(fmtC(r.tAvg)));
  if (r.tAvg < 230) list.push(h.tooCold(fmtC(r.tAvg)));
  if (r.pressure > 20) list.push(h.crushing(Math.round(r.pressure)));
  if (r.pressure > 0 && r.pressure < 0.05) list.push(h.thinAir);
  if (r.pressure === 0) list.push(h.noAir);
  if (s.volcanism > 0.75) list.push(h.volcanoes);
  if (s.volcanism < 0.08) list.push(h.deadCore);
  if (r.gravity > 2.2) list.push(h.highGravity(r.gravity.toFixed(1)));
  if (s.distance < r.hzInner * 0.3 && s.starType === 'redDwarf') list.push(h.tidalLock);
  return list;
}

function story(s: PlanetSettings, r: PlanetReport): string {
  const st = t.sim.story;
  const parts: string[] = [];
  const apparent = r.star.radius / s.distance; // Dünya'dan görülen Güneş = 1
  const sunSize = apparent > 3 ? st.sunHuge : apparent > 1.6 ? st.sunBig : apparent > 0.6 ? st.sunNormal : apparent > 0.15 ? st.sunSmall : st.sunDot;
  parts.push(st.sunrise(sunSize, st.sunColor[s.starType]));
  parts.push(st.sky(skyName(r)));
  const c = r.tAvg;
  parts.push(c < 200 ? st.tempFrozen : c < 260 ? st.tempCold : c < 300 ? st.tempMild : c < 340 ? st.tempHot : st.tempHell);
  if (r.visual.cloudCover > 0.8) parts.push(st.overcast);
  if (s.rings.enabled) parts.push(st.rings);
  if (s.moons > 0) parts.push(st.moons(s.moons));
  else parts.push(st.noMoons);
  parts.push(st.stage[r.stage]);
  return parts.join(' ');
}

function skyName(r: PlanetReport): string {
  const names = t.sim.skyNames;
  const [red, g, b] = r.visual.skyColor;
  if (r.pressure < 0.003) return names.black;
  if (red + g + b < 0.4) return names.dark;
  if (red > b * 1.3 && g > b) return red > g * 1.25 ? names.pink : names.yellow;
  if (red > b) return names.caramel;
  if (b > red * 2) return names.blue;
  return names.paleBlue;
}
