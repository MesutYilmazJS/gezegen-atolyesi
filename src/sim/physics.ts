// Basitleştirilmiş ama bilimsel temelli gezegen hesapları.
// Tüm sıcaklıklar Kelvin, basınç bar, yerçekimi Dünya = 1.
import { t } from '../i18n';
import { CivLevel, DisasterType, PlanetSettings, STAR_LUMINOSITY, StarType, clamp, rng } from '../state/settings';

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

/** Felaketlerin toparlanma süresi (zaman çizelgesi birimiyle) ve yaşama verdiği zarar */
export const DISASTERS: Record<DisasterType, { recovery: number; severity: number }> = {
  asteroid: { recovery: 0.08, severity: 0.85 },
  supervolcano: { recovery: 0.06, severity: 0.55 },
  iceAge: { recovery: 0.12, severity: 0.45 },
  flare: { recovery: 0.05, severity: 0.6 },
  runaway: { recovery: Infinity, severity: 1 },
};

export interface ImpactVisual {
  /** Nesne uzayında birim vektör */
  dir: [number, number, number];
  /** Çarpmadan bu yana geçen süre (zaman birimi) */
  age: number;
  size: number;
}

export interface VisualState {
  kind: 'rocky' | 'gas';
  starColor: RGB;
  /** Çift yıldızda ikinci yıldızın rengi ve gücü (0 = yok) */
  star2Color: RGB;
  star2Strength: number;
  starFlash: number;
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
  /** Sanayi dumanı 0..1 */
  smog: number;
  /** Yörüngede uydu sürüsü 0..1 */
  satellites: number;
  /** Volkanik lav ışıltısı */
  lava: number;
  aurora: number;
  storms: number;
  wind: number;
  tidalLock: boolean;
  /** Yer altı okyanusu varsa buzda kızıl çatlaklar */
  iceCracks: number;
  impacts: ImpactVisual[];
  /** Gaz devi bant renkleri */
  gasColors: [RGB, RGB, RGB];
}

export interface PlanetReport {
  kind: 'rocky' | 'gas';
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
  /** 0..1 — felaketlerin yaşama verdiği o anki zarar */
  lifeLoss: number;
  /** Şu an etkisi süren felaket */
  activeDisaster: DisasterType | null;
  /** Bir felaketten sonra yaşam toparlandı mı */
  survivedDisaster: boolean;
  /** Medeniyet bir göktaşı çarpmasından sonra yeniden kuruldu mu */
  civilizationRescued: boolean;
  hasIce: boolean;
  hasDesert: boolean;
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

/** Atmosfer bileşimini normalize eder */
export function compositionFractions(s: PlanetSettings) {
  const c = s.composition;
  const sum = c.n2 + c.o2 + c.co2 + c.ch4 || 1;
  return { n2: c.n2 / sum, o2: c.o2 / sum, co2: c.co2 / sum, ch4: c.ch4 / sum };
}

const CIV_STAGE_CAP: Record<CivLevel, number> = { none: 5, villages: 6, industrial: 6, space: 6 };

/** Felaketlerin verilen zamandaki birleşik etkisi */
function disasterEffects(s: PlanetSettings, time: number) {
  const fx = {
    tempDelta: 0,
    cloudAdd: 0,
    ash: 0,
    lava: 0,
    aurora: 0,
    flash: 0,
    pressureMul: 1,
    lifeLoss: 0,
    runaway: 0,
    active: null as DisasterType | null,
    activeStrength: 0,
    impacts: [] as ImpactVisual[],
  };
  const mag = s.magneticField;
  for (const e of s.events) {
    if (e.time > time) continue;
    const dt = time - e.time;
    const fade = (a: number, b: number) => 1 - smoothstep(a, b, dt);
    const { recovery, severity } = DISASTERS[e.type];
    let strength = 0;
    switch (e.type) {
      case 'asteroid': {
        const winter = fade(0, 0.03);
        fx.tempDelta -= 35 * winter;
        fx.cloudAdd += 0.45 * winter;
        fx.ash = Math.max(fx.ash, winter);
        const r = rng(e.seed);
        const z = (r() * 2 - 1) * 0.7;
        const a = r() * Math.PI * 2;
        const q = Math.sqrt(1 - z * z);
        fx.impacts.push({ dir: [q * Math.cos(a), z, q * Math.sin(a)], age: dt, size: 0.16 + r() * 0.08 });
        fx.lifeLoss = Math.max(fx.lifeLoss, severity * fade(0.005, recovery));
        strength = winter;
        break;
      }
      case 'supervolcano': {
        const k = fade(0, 0.045);
        fx.tempDelta -= 15 * k;
        fx.lava = Math.max(fx.lava, fade(0, 0.05));
        fx.cloudAdd += 0.35 * k;
        fx.ash = Math.max(fx.ash, k);
        fx.lifeLoss = Math.max(fx.lifeLoss, severity * fade(0.005, recovery));
        strength = k;
        break;
      }
      case 'iceAge': {
        const k = smoothstep(0, 0.01, dt) * fade(0.03, recovery);
        fx.tempDelta -= 38 * k;
        fx.lifeLoss = Math.max(fx.lifeLoss, severity * k);
        strength = k;
        break;
      }
      case 'flare': {
        fx.flash = Math.max(fx.flash, fade(0, 0.006));
        fx.aurora = Math.max(fx.aurora, fade(0, 0.02));
        // Zayıf manyetik alan atmosferi kalıcı olarak inceltir
        fx.pressureMul *= 1 - 0.6 * (1 - mag) * smoothstep(0, 0.01, dt);
        fx.lifeLoss = Math.max(fx.lifeLoss, severity * (1 - mag) * fade(0.002, recovery));
        strength = fade(0, 0.02);
        break;
      }
      case 'runaway': {
        const k = smoothstep(0, 0.04, dt);
        fx.runaway = Math.max(fx.runaway, k);
        fx.tempDelta += 380 * k;
        fx.cloudAdd += 0.6 * k;
        fx.lifeLoss = Math.max(fx.lifeLoss, k);
        strength = 1 - smoothstep(0.04, 0.1, dt);
        break;
      }
    }
    if (strength > fx.activeStrength && strength > 0.15) {
      fx.active = e.type;
      fx.activeStrength = strength;
    }
  }
  return fx;
}

export function computeReport(s: PlanetSettings): PlanetReport {
  const gas = s.kind === 'gas';
  const star = STARS[s.starType];
  const L = STAR_LUMINOSITY[s.starType] * (s.binaryStar ? 1.4 : 1);
  const hzInner = Math.sqrt(L / 1.1);
  const hzOuter = Math.sqrt(L / 0.36);
  const hzStatus = s.distance < hzInner ? 'close' : s.distance > hzOuter ? 'far' : 'in';
  const comp = compositionFractions(s);
  const fx = disasterEffects(s, s.time);

  // Yerçekimi: kayalık gezegenlerde kütle ~ R^3.7 → g ~ R^1.7; gaz devlerinde Jüpiter ≈ 2,5 g
  const gravity = gas ? 2.5 * Math.pow(s.size / 11, 0.6) : Math.pow(s.size, 1.7) * (s.size > 1.6 ? 0.9 : 1);

  // Basınç: küçük gezegenler havasını tutamaz, volkanlar gaz ekler
  const basePressure = sliderToPressure(s.atmosphere);
  const retention = clamp((gravity - 0.12) / 0.38, 0.05, 1);
  const pressure = gas ? 0 : basePressure * retention * (0.88 + 0.35 * s.volcanism) * fx.pressureMul;

  // Gelgit gücü: ayar + ayların kütlesi
  const moonMass = s.moons === 0 ? 0 : s.moonSizes.slice(0, s.moons).reduce((a, b) => a + b * b, 0);
  const tideStrength = clamp(s.tides * 0.7 + moonMass * 0.25, 0, 1);

  // Denge sıcaklığı. Basık yörünge ortalama ışığı biraz artırır.
  const eccFactor = Math.pow(1 - s.eccentricity * s.eccentricity, -1 / 8);
  const tEqFor = (albedo: number) => ((278.6 * Math.pow(L * (1 - albedo), 0.25)) / Math.sqrt(s.distance)) * eccFactor;
  // Sera etkisi: basınç ve bileşime bağlı (Dünya karışımı = 1)
  const ghFactor = (0.75 + 0.35 * Math.sqrt(comp.co2) + 1.2 * Math.sqrt(comp.ch4)) / 0.785;
  const greenhouse = 33 * Math.pow(pressure, 0.6) * ghFactor;
  const internalHeat = (s.volcanism - 0.35) * 10 + (tideStrength - 0.35) * 6;
  const cloudsBase = cloudCover(pressure, s.water, 290, 'liquid') * (0.3 + 1.4 * s.clouds);
  let tAvg = tEqFor(0.3) + greenhouse + internalHeat;

  // Buz ve bulut yansıtması bir kez düzelt
  const iceAlbedo = tAvg < 260 && s.water > 0.05 ? smoothstep(260, 220, tAvg) * 0.3 * s.water : 0;
  const albedo = clamp(0.3 + iceAlbedo + (cloudsBase - 0.45) * 0.15 - (s.water < 0.05 ? 0.05 : 0), 0.05, 0.8);
  tAvg = tEqFor(albedo) + greenhouse + internalHeat;
  if (gas) tAvg = tEqFor(0.35) + 20;

  // Sıcaklık farkları: ince atmosfer, uzun gün, eğiklik ve basık yörünge farkı büyütür
  const damp = 1 / (1 + 2 * Math.sqrt(pressure));
  const dayFactor = s.tidalLock ? 3.2 : clamp(1 + Math.log10(s.dayLength / 24) * 0.6, 0.6, 2.8);
  const swing = (12 + 160 / (1 + 4 * Math.sqrt(pressure))) * dayFactor;
  const seasonal = ((s.axialTilt / 90) * 45 + tAvg * (Math.pow(1 / (1 - s.eccentricity), 0.5) - 1)) * (0.35 + damp);
  // Gece sıcaklığı tabanı: uzun gecelerde yüzey daha çok soğur
  const nightFloor = tAvg * (0.6 - 0.25 * clamp(Math.log10((s.tidalLock ? 5000 : s.dayLength) / 24) / 2, 0, 1));
  const tMax = gas ? tAvg + 6 : tAvg + swing * 0.55 + seasonal;
  const tMin = gas ? tAvg - 6 : Math.max(nightFloor, tAvg - swing - seasonal * 1.1);

  // Suyun (ya da metanın) durumu
  const methane = s.oceanType === 'methane';
  const boil = methane ? 112 * Math.pow(Math.max(pressure, 0.1), 0.08) : boilingPoint(pressure);
  const freeze = methane ? 91 : s.oceanType === 'salt' ? 252 : 256;
  const waterStateAt = (temp: number): WaterState => {
    if (gas || s.water < 0.03) return 'none';
    if (pressure <= 0.006) return temp < freeze ? 'frozen' : 'vapor';
    if (temp >= boil) return 'vapor';
    if (temp < freeze) return 'frozen';
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
  const tectScore = s.tectonics < 0.1 ? 0.75 : s.tectonics > 0.85 ? 0.88 : 1;
  const orbitScore =
    (1 - 0.6 * smoothstep(0.3, 0.8, s.eccentricity)) * (s.axialTilt > 60 ? 0.85 : 1) * (s.tidalLock ? 0.8 : s.dayLength > 500 ? 0.85 : 1);
  const magScore = 0.7 + 0.3 * smoothstep(0.05, 0.5, s.magneticField);
  const airScore = (comp.o2 > 0.35 ? 0.85 : 1) * (comp.ch4 > 0.2 ? 0.8 : 1);
  const scoreFor = (temp: number, state: WaterState) => {
    if (gas) return 0;
    const tempScore = methane ? gauss(temp, 100, 14) * 0.35 : gauss(temp, 290, 32);
    const waterScore = state === 'liquid' ? (s.water < 0.15 ? 0.5 + s.water * 3 : s.water > 0.92 ? 0.75 : 1) : state === 'frozen' ? 0.12 : 0;
    return Math.round(
      100 *
        Math.pow(tempScore, 0.9) *
        (0.12 + 0.88 * waterScore) *
        (0.15 + 0.85 * pressureScore) *
        (0.4 + 0.6 * gravScore) *
        starScore *
        volcScore *
        tectScore *
        orbitScore *
        magScore *
        airScore,
    );
  };
  // Uzun vadeli (denge) yaşanabilirlik: evrimin nereye kadar gidebileceğini belirler
  const habitability = scoreFor(tAvg, waterState);

  // Genç gezegen henüz soğumadı: zaman çizelgesinin başında yüzey çok sıcak
  const primordialHeat = 1400 * Math.pow(1 - smoothstep(0, 0.14, s.time), 2);
  const tNow = tAvg + primordialHeat + fx.tempDelta;
  const waterNow = waterStateAt(tNow);
  const habitabilityNow = Math.round(scoreFor(tNow, waterNow) * (1 - fx.lifeLoss * 0.5));

  // Dünya Benzerlik İndeksi (ESI) + su ve basınç terimleri
  const esiTerm = (x: number, x0: number, w: number) => Math.pow(1 - Math.abs(x - x0) / (x + x0), w);
  const escapeVel = Math.sqrt(s.size * gravity);
  const esiCore = Math.pow(esiTerm(s.size, 1, 0.57) * esiTerm(escapeVel, 1, 0.7) * esiTerm(Math.max(tNow, 1), 288, 5.58), 1 / 3);
  const esi = gas
    ? esiCore * 0.2
    : clamp(
        esiCore *
          (1 - Math.abs(s.water - 0.71) * 0.5) *
          (pressure > 0 ? gauss(Math.log10(pressure), 0, 2) : 0.4) *
          (methane ? 0.5 : 1) *
          (1 - Math.abs(comp.o2 - 0.21) * 0.8),
        0,
        1,
      );

  // Evrim: koşullara göre ulaşılabilecek en ileri aşama
  let maxStage = 6;
  let stuckReason: string | null = null;
  const cap = (stage: number, reason: string) => {
    if (stage < maxStage) {
      maxStage = stage;
      stuckReason = reason;
    }
  };
  const st = t.sim.stuck;
  if (gas) cap(1, st.gasGiant);
  cap(star.maxStage, s.starType === 'blueGiant' ? st.blueGiant : st.whiteStar);
  if (s.water < 0.03) cap(1, st.noWater);
  else if (waterState === 'vapor') cap(1, pressure <= 0.006 ? st.noAtmosphere : st.boiled);
  else if (waterState === 'frozen') {
    if (s.subsurfaceOcean || (s.volcanism > 0.25 && tAvg > 150) || tideStrength > 0.6) cap(3, st.underIce);
    else cap(2, st.frozen);
  }
  if (liquid) {
    if (methane) cap(4, st.methaneLife);
    else if (tAvg > 335) cap(2, st.tooHotForLife);
    else if (habitability < 18) cap(3, st.harsh);
    else if (habitability < 35) cap(4, st.noOxygen);
    if (comp.o2 < 0.05) cap(4, st.noOxygen);
    if (oceanWorld) cap(5, st.oceanWorld);
    if (habitability < 52) cap(5, st.noCivilization);
    if (s.civilization === 'none') cap(CIV_STAGE_CAP.none, st.civDisabled);
  }
  if (fx.runaway > 0.5) cap(1, st.runaway);

  const timeStage = stageAt(s.time);
  const baseStage = Math.min(timeStage, maxStage);
  // Felaket yaşamı geriletir; zamanla toparlanır
  const lifeFactor = 1 - fx.lifeLoss;
  const stage = baseStage >= 3 && fx.lifeLoss > 0 ? Math.max(2, Math.round(2 + (baseStage - 2) * lifeFactor)) : baseStage;
  const ageGyr = s.time * TIMELINE_GYR;

  // Felaketten kurtulma (rozet ve görev için)
  let survivedDisaster = false;
  let civilizationRescued = false;
  for (const e of s.events) {
    const d = DISASTERS[e.type];
    if (e.type === 'runaway' || s.time < e.time + d.recovery) continue;
    const before = Math.min(stageAt(e.time), maxStage);
    if (before >= 3 && stage >= before) survivedDisaster = true;
    if (e.type === 'asteroid' && before >= 6 && stage >= 6) civilizationRescued = true;
  }

  // Görsel durum
  const tt = s.time;
  const canOcean = waterState === 'liquid' || waterState === 'frozen';
  const weathering = clamp(pressure, 0, 1) * (s.water > 0.05 ? 1 : 0.3);
  const civ = s.civilization;
  const citiesBase = maxStage >= 6 ? smoothstep(0.86, 0.96, tt) * Math.pow(lifeFactor, 3) : 0;
  const cover = clamp(
    cloudCover(pressure, s.water, tNow, waterNow) * (0.3 + 1.4 * s.clouds) + fx.cloudAdd * (pressure > 0.01 ? 1 : 0.3),
    0,
    0.98,
  );
  const ashColor: RGB = [0.32, 0.29, 0.27];
  let cloudCol: RGB =
    pressure > 20 && tNow > 400 ? [0.95, 0.82, 0.55] : comp.ch4 > 0.08 ? [0.92, 0.72, 0.45] : tt < 0.1 ? ashColor : [1, 1, 1];
  cloudCol = mix3(cloudCol, ashColor, fx.ash * 0.8);
  // Buz örtüsü, mevcut su miktarından büyük olamaz (az sulu gezegende yalnızca kutup başlıkları)
  const iceLine = s.water < 0.01 ? 2 : Math.max(clamp(0.92 + (tNow - 288) / 70 + (s.axialTilt - 23) / 200, -0.1, 2), 1 - s.water * 3);
  const flash = fx.flash;
  const visual: VisualState = {
    kind: s.kind,
    starColor: mix3(star.color, [1, 1, 1], flash * 0.6).map((c) => c * (1 + flash * 1.5)) as RGB,
    star2Color: mix3(star.color, [1, 0.6, 0.4], 0.35),
    star2Strength: s.binaryStar ? 0.45 : 0,
    starFlash: flash,
    skyColor: skyColor(s.starType, pressure, tNow, s.water, comp.ch4),
    haze: gas ? 0.6 : pressure <= 0.0005 ? 0 : clamp((Math.log10(pressure) + 3) / 4.2, 0, 1),
    cloudCover: gas ? 0 : cover,
    cloudColor: cloudCol,
    vegetationColor: star.vegetation,
    iceLine,
    seaIce: waterNow === 'frozen' ? 1 : smoothstep(methane ? 95 : 268, methane ? 85 : 248, tNow),
    heat: smoothstep(330, 700, tNow),
    molten: gas ? 0 : 1 - smoothstep(0.0, 0.07, tt),
    craters: (0.25 + s.craters * 1.5) * smoothstep(0.02, 0.09, tt) * (1 - 0.8 * smoothstep(0.16, 0.6, tt) * weathering),
    oceanFill: canOcean ? smoothstep(0.13, 0.25, tt) * (1 - fx.runaway) : 0,
    microbes: maxStage >= 3 ? smoothstep(0.3, 0.4, tt) * Math.max(lifeFactor, 0.3) : 0,
    vegetation:
      maxStage >= 4 && !oceanWorld && !methane
        ? smoothstep(0.46, 0.6, tt) * clamp(habitability / 50, 0.35, 1) * smoothstep(0.1, 0.9, lifeFactor)
        : 0,
    cities: citiesBase * (civ === 'villages' ? 0.35 : civ === 'industrial' ? 0.8 : civ === 'space' ? 1 : 0),
    smog: civ === 'industrial' ? citiesBase * 0.6 : 0,
    satellites: civ === 'space' ? citiesBase : 0,
    lava: clamp(Math.max(s.volcanism * 1.2 - 0.25, fx.lava), 0, 1) * (0.5 + 0.5 * Math.max(1 - smoothstep(0.1, 0.5, tt), fx.lava)),
    aurora: clamp(s.magneticField * (0.35 + (s.starType === 'redDwarf' ? 0.3 : 0) + fx.aurora * 1.5), 0, 1.5) * (pressure > 0.01 ? 1 : 0.2),
    storms: s.storms,
    wind: s.wind,
    tidalLock: s.tidalLock,
    iceCracks: s.subsurfaceOcean ? 1 : 0,
    impacts: fx.impacts,
    gasColors: gasPalette(tAvg, comp.ch4),
  };

  const desert = liquid && s.water < 0.5 && tNow > 268;
  const report: PlanetReport = {
    kind: s.kind,
    luminosity: L,
    star,
    hzInner,
    hzOuter,
    hzStatus,
    pressure,
    gravity,
    tAvg: tNow,
    tMax: tMax + primordialHeat + fx.tempDelta,
    tMin: tMin + primordialHeat + fx.tempDelta,
    waterState: waterNow,
    young: primordialHeat > 100,
    habitability: habitabilityNow,
    esi,
    ageGyr,
    timeStage,
    maxStage,
    stage,
    stuckReason: timeStage > maxStage ? stuckReason : null,
    lifeLoss: fx.lifeLoss,
    activeDisaster: fx.active,
    survivedDisaster,
    civilizationRescued,
    hasIce: !gas && s.water > 0.03 && (iceLine < 0.85 || waterNow === 'frozen'),
    hasDesert: !gas && (desert || (s.water < 0.15 && tNow > 240)),
    lifeNotes: [],
    hazards: [],
    story: '',
    visual,
  };
  report.lifeNotes = lifeNotes(s, report, tideStrength);
  report.hazards = hazards(s, report);
  report.story = story(s, report);
  return report;
}

function gasPalette(tAvg: number, ch4: number): [RGB, RGB, RGB] {
  if (tAvg > 900) return [[0.25, 0.08, 0.06], [0.55, 0.2, 0.1], [0.1, 0.04, 0.05]];
  if (tAvg > 300) return [[0.75, 0.62, 0.45], [0.55, 0.42, 0.32], [0.88, 0.8, 0.66]];
  if (tAvg < 85 || ch4 > 0.3) return [[0.55, 0.78, 0.86], [0.32, 0.55, 0.78], [0.7, 0.88, 0.92]];
  if (tAvg < 115) return [[0.86, 0.78, 0.58], [0.74, 0.64, 0.45], [0.92, 0.87, 0.72]];
  return [[0.9, 0.84, 0.72], [0.72, 0.48, 0.3], [0.55, 0.36, 0.25]];
}

function skyColor(starType: StarType, pressure: number, tAvg: number, water: number, ch4: number): RGB {
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
  // Metan pusu (Titan gibi) → turuncu
  c = mix3(c, [0.95, 0.6, 0.25], smoothstep(0.03, 0.25, ch4));
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

function lifeNotes(s: PlanetSettings, r: PlanetReport, tideStrength: number): string[] {
  const n = t.sim.life;
  const notes: string[] = [];
  if (r.lifeLoss > 0.2 && r.activeDisaster) notes.push(n.recovering);
  if (r.stage < 3) {
    if (r.maxStage === 3 && r.waterState === 'frozen') notes.push(s.subsurfaceOcean ? n.subsurface : n.underIce);
    return notes;
  }
  const comp = compositionFractions(s);
  if (r.waterState === 'frozen') notes.push(s.subsurfaceOcean ? n.subsurface : n.underIce);
  if (s.oceanType === 'methane') notes.push(n.methane);
  if (r.stage === 3) notes.push(n.microbes);
  if (tideStrength > 0.55) notes.push(n.tidePools);
  if (r.stage >= 4) {
    notes.push(n.plantColor[s.starType]);
    if (s.binaryStar) notes.push(n.binary);
    if (s.tidalLock) notes.push(n.twilight);
    if (r.gravity < 0.6) notes.push(n.lowGravityTrees(Math.round(60 / Math.max(r.gravity, 0.15) / 10) * 10));
    if (r.gravity > 1.6) notes.push(n.highGravity);
    if (s.axialTilt > 50) notes.push(n.extremeSeasons);
    if (s.dayLength > 200 && !s.tidalLock) notes.push(n.longDays);
  }
  if (r.stage >= 3 && s.water > 0.95) notes.push(n.oceanWorld);
  if (r.stage >= 5) {
    if (r.pressure > 4) notes.push(n.denseAir);
    if (comp.o2 > 0.3) notes.push(n.giantInsects);
    if (r.tAvg > 305) notes.push(n.heatAdapted);
    if (r.tAvg < 270) notes.push(n.coldAdapted);
    if (s.moons === 0) notes.push(n.noMoons);
    if (s.moons >= 2) notes.push(n.bigTides(s.moons));
    if (s.starType === 'redDwarf') notes.push(n.redDwarfEyes);
    if (s.wind > 0.7) notes.push(n.windAdapted);
  }
  if (r.stage >= 6) notes.push(n.civilization[s.civilization]);
  return notes;
}

function hazards(s: PlanetSettings, r: PlanetReport): string[] {
  const h = t.sim.hazards;
  const list: string[] = [];
  if (r.activeDisaster) list.push(h.disaster[r.activeDisaster]);
  if (s.starType === 'blueGiant') list.push(h.blueGiant);
  if (s.starType === 'redDwarf') list.push(h.flares);
  if (r.kind === 'gas') {
    list.push(h.gasGiant);
    return list;
  }
  if (r.young) {
    list.push(h.molten(fmtC(r.tAvg)));
    return list;
  }
  const comp = compositionFractions(s);
  if (s.magneticField < 0.25 && r.pressure > 0) list.push(h.weakMagnetic);
  if (r.tAvg > 380 && s.water > 0.05 && r.pressure > 1) list.push(h.runawayGreenhouse);
  else if (r.tAvg > 330) list.push(h.tooHot(fmtC(r.tAvg)));
  if (r.tAvg < 230) list.push(h.tooCold(fmtC(r.tAvg)));
  if (r.pressure > 20) list.push(h.crushing(Math.round(r.pressure)));
  if (r.pressure > 0 && r.pressure < 0.05) list.push(h.thinAir);
  if (r.pressure === 0) list.push(h.noAir);
  if (s.volcanism > 0.75) list.push(h.volcanoes);
  if (s.volcanism < 0.08) list.push(h.deadCore);
  if (s.tectonics > 0.85) list.push(h.earthquakes);
  if (s.tectonics < 0.1) list.push(h.stagnantLid);
  if (r.gravity > 2.2) list.push(h.highGravity(r.gravity.toFixed(1)));
  if (!s.tidalLock && s.distance < r.hzInner * 0.3 && s.starType === 'redDwarf') list.push(h.tidalLock);
  if (s.eccentricity > 0.4) list.push(h.eccentric);
  if (s.axialTilt > 60) list.push(h.tilt);
  if (s.storms > 0.7) list.push(h.storms);
  if (s.wind > 0.8) list.push(h.wind);
  if (s.tides > 0.85) list.push(h.tides);
  if (comp.o2 > 0.35) list.push(h.fires);
  if (comp.ch4 > 0.15 || comp.co2 > 0.5) list.push(h.toxicAir);
  if (s.craters > 0.75 && r.pressure < 0.1) list.push(h.bombardment);
  if (s.binaryStar && s.distance < 0.3 * Math.sqrt(r.luminosity)) list.push(h.binaryOrbit);
  return list;
}

function story(s: PlanetSettings, r: PlanetReport): string {
  const st = t.sim.story;
  const parts: string[] = [];
  if (r.kind === 'gas') {
    parts.push(st.gas);
    if (s.rings.enabled) parts.push(st.rings);
    if (s.moons > 0) parts.push(st.gasMoons(s.moons));
    return parts.join(' ');
  }
  const apparent = r.star.radius / s.distance; // Dünya'dan görülen Güneş = 1
  const sunSize = apparent > 3 ? st.sunHuge : apparent > 1.6 ? st.sunBig : apparent > 0.6 ? st.sunNormal : apparent > 0.15 ? st.sunSmall : st.sunDot;
  if (s.tidalLock) parts.push(st.tidalLock(st.sunColor[s.starType]));
  else parts.push(st.sunrise(sunSize, st.sunColor[s.starType]));
  if (s.binaryStar) parts.push(st.binary);
  parts.push(st.sky(skyName(r)));
  const c = r.tAvg;
  parts.push(c < 200 ? st.tempFrozen : c < 260 ? st.tempCold : c < 300 ? st.tempMild : c < 340 ? st.tempHot : st.tempHell);
  if (!s.tidalLock && s.dayLength > 100) parts.push(st.longDay(Math.round(s.dayLength)));
  else if (!s.tidalLock && s.dayLength < 8) parts.push(st.shortDay(Math.round(s.dayLength)));
  if (r.visual.cloudCover > 0.8) parts.push(st.overcast);
  if (s.wind > 0.7) parts.push(st.windy);
  if (s.rings.enabled) parts.push(st.rings);
  if (s.moons > 0) parts.push(st.moons(s.moons));
  else parts.push(st.noMoons);
  if (r.visual.aurora > 0.6 && r.pressure > 0.01) parts.push(st.aurora);
  parts.push(st.stage[r.stage]);
  return parts.join(' ');
}

/** Gökyüzünün rengini anlatan kısa ad (ör. "derin mavi") */
export function skyName(r: PlanetReport): string {
  const names = t.sim.skyNames;
  const [red, g, b] = r.visual.skyColor;
  if (r.pressure < 0.003) return names.black;
  if (red + g + b < 0.4) return names.dark;
  if (red > b * 1.3 && g > b) return red > g * 1.25 ? names.pink : names.yellow;
  if (red > b) return names.caramel;
  if (b > red * 2) return names.blue;
  return names.paleBlue;
}
