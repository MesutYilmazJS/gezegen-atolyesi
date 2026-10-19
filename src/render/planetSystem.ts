import * as THREE from 'three';
import type { PlanetReport, RGB } from '../sim/physics';
import { Mineral, OceanType, PlanetSettings, rng } from '../state/settings';
import { bakeFragment, bakeVertex } from './shaders/bake';
import {
  MAX_IMPACTS,
  atmosphereFragment,
  atmosphereVertex,
  cloudFragment,
  cloudVertex,
  planetFragment,
  planetVertex,
  ringFragment,
  ringVertex,
  withCommon,
} from './shaders/planet';

export type Quality = 'low' | 'medium' | 'high';

const BAKE_WIDTH: Record<Quality, number> = { low: 512, medium: 1024, high: 2048 };
const BAKE_OCTAVES: Record<Quality, number> = { low: 5, medium: 6, high: 7 };
const SPHERE_SEGMENTS: Record<Quality, number> = { low: 64, medium: 96, high: 160 };

const RING_MATERIAL_LOOK = {
  ice: { opacity: 0.88, scatter: 0.25 },
  rock: { opacity: 0.78, scatter: 0.12 },
  dust: { opacity: 0.42, scatter: 1.0 },
};

/** Toprak renkleri (sRGB): koyu kaya, açık kaya, kum */
const MINERAL_COLORS: Record<Mineral, [RGB, RGB, RGB]> = {
  basalt: [[0.33, 0.3, 0.27], [0.58, 0.52, 0.44], [0.82, 0.68, 0.46]],
  iron: [[0.42, 0.2, 0.1], [0.72, 0.42, 0.22], [0.8, 0.5, 0.3]],
  salt: [[0.52, 0.5, 0.47], [0.86, 0.84, 0.8], [0.94, 0.91, 0.86]],
  sulfur: [[0.42, 0.36, 0.12], [0.85, 0.75, 0.25], [0.92, 0.84, 0.42]],
};

/** Okyanus renkleri (sRGB): sığ, derin */
const OCEAN_COLORS: Record<OceanType, [RGB, RGB]> = {
  salt: [[0.12, 0.45, 0.55], [0.02, 0.07, 0.2]],
  fresh: [[0.16, 0.5, 0.46], [0.03, 0.12, 0.18]],
  methane: [[0.36, 0.26, 0.13], [0.08, 0.05, 0.03]],
};

const linear = (c: RGB) => new THREE.Color(Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2));

/** Yumuşak geçiş yapılan görsel değerler */
const SCALAR_KEYS = [
  'seaLevel',
  'water',
  'oceanFill',
  'seaIce',
  'iceLine',
  'heat',
  'molten',
  'craters',
  'microbes',
  'vegetation',
  'cities',
  'smog',
  'lava',
  'aurora',
  'haze',
  'cloudCover',
  'radius',
  'tilt',
  'storms',
  'iceCracks',
] as const;
const COLOR_KEYS = ['sunColor', 'sun2Color', 'skyColor', 'vegColor', 'cloudColor', 'rockDark', 'rockLight', 'sand', 'shallow', 'deep', 'gas1', 'gas2', 'gas3'] as const;

type Animated = Record<(typeof SCALAR_KEYS)[number], number> & Record<(typeof COLOR_KEYS)[number], THREE.Color>;

export class PlanetSystem {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private spin = new THREE.Group();
  private ringPivot = new THREE.Group();

  private planetMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private atmoMat: THREE.ShaderMaterial;
  private ringMat: THREE.ShaderMaterial;
  private planet: THREE.Mesh;
  private clouds: THREE.Mesh;
  private atmosphere: THREE.Mesh;
  private ring: THREE.Mesh;

  private targetA?: THREE.WebGLRenderTarget;
  private targetB?: THREE.WebGLRenderTarget;
  private quantiles: number[] = [];
  private bakedKey = '';

  private target!: Animated;
  private current!: Animated;
  private ringOuterLocal = 2.5;
  private cloudTime = 0;
  private wind = 0.3;
  private spinSpeed = 0.05;
  private stormSeed = -1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    readonly sunDir: THREE.Vector3,
    readonly sun2Dir: THREE.Vector3,
  ) {
    const common = {
      uSunDir: { value: sunDir },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSun2Dir: { value: sun2Dir },
      uSun2Color: { value: new THREE.Color(0, 0, 0) },
      uSkyColor: { value: new THREE.Color(0.3, 0.5, 1) },
      uTime: { value: 0 },
      uCloudTime: { value: 0 },
      uPlanetRadius: { value: 1 },
    };

    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: planetVertex,
      fragmentShader: withCommon(planetFragment),
      uniforms: {
        ...common,
        uTexA: { value: null },
        uTexB: { value: null },
        uSeaLevel: { value: 0 },
        uHeightMin: { value: -1 },
        uHeightMax: { value: 1 },
        uWater: { value: 0.7 },
        uOceanFill: { value: 1 },
        uSeaIce: { value: 0 },
        uIceLine: { value: 0.9 },
        uHeat: { value: 0 },
        uMolten: { value: 0 },
        uCraters: { value: 0.2 },
        uMicrobes: { value: 0 },
        uVegetation: { value: 0 },
        uVegColor: { value: new THREE.Color() },
        uCities: { value: 0 },
        uSmog: { value: 0 },
        uLava: { value: 0 },
        uAurora: { value: 0 },
        uTidalLock: { value: 0 },
        uIceCracks: { value: 0 },
        uHaze: { value: 0.5 },
        uCloudCover: { value: 0.5 },
        uBump: { value: 0.035 },
        uRockDark: { value: new THREE.Color() },
        uRockLight: { value: new THREE.Color() },
        uSand: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() },
        uGas: { value: 0 },
        uGasC1: { value: new THREE.Color() },
        uGasC2: { value: new THREE.Color() },
        uGasC3: { value: new THREE.Color() },
        uImpactCount: { value: 0 },
        uImpactDir: { value: Array.from({ length: MAX_IMPACTS }, () => new THREE.Vector3(0, 1, 0)) },
        uImpactAge: { value: new Array(MAX_IMPACTS).fill(1) },
        uImpactSize: { value: new Array(MAX_IMPACTS).fill(0.1) },
        uRingEnabled: { value: 0 },
        uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
        uRingInner: { value: 1.4 },
        uRingOuter: { value: 2.4 },
        uRingSeed: { value: 0 },
        uRingOpacity: { value: 0.8 },
      },
    });

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: withCommon(cloudFragment),
      uniforms: {
        uSunDir: common.uSunDir,
        uSunColor: common.uSunColor,
        uSun2Dir: common.uSun2Dir,
        uSun2Color: common.uSun2Color,
        uSkyColor: common.uSkyColor,
        uTime: common.uTime,
        uCloudTime: common.uCloudTime,
        uTexB: this.planetMat.uniforms.uTexB,
        uCloudColor: { value: new THREE.Color(1, 1, 1) },
        uCover: this.planetMat.uniforms.uCloudCover,
        uOpacity: { value: 0.95 },
        uStorms: { value: 0 },
        uStormCenters: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)] },
      },
      transparent: true,
      depthWrite: false,
    });

    this.atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex,
      fragmentShader: atmosphereFragment,
      uniforms: {
        uSunDir: common.uSunDir,
        uSunColor: common.uSunColor,
        uSun2Dir: common.uSun2Dir,
        uSun2Color: common.uSun2Color,
        uSkyColor: common.uSkyColor,
        uHaze: this.planetMat.uniforms.uHaze,
        uPlanetRadius: common.uPlanetRadius,
        uAtmoRadius: { value: 1.08 },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: withCommon(ringFragment),
      uniforms: {
        uSunDir: common.uSunDir,
        uSunColor: common.uSunColor,
        uSun2Dir: common.uSun2Dir,
        uSun2Color: common.uSun2Color,
        uPlanetRadius: common.uPlanetRadius,
        uColor: { value: new THREE.Color() },
        uRingNormal: this.planetMat.uniforms.uRingNormal,
        uInner: { value: 1.35 },
        uOuter: { value: 2.4 },
        uSeed: { value: 0 },
        uOpacity: { value: 0.85 },
        uScatter: { value: 0.3 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const segs = SPHERE_SEGMENTS.medium;
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, segs, segs / 2), this.planetMat);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, segs, segs / 2), this.cloudMat);
    this.clouds.renderOrder = 1;
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 32), this.atmoMat);
    this.atmosphere.renderOrder = 2;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.4, 256, 1), this.ringMat);
    this.ring.renderOrder = 3;
    this.ring.visible = false;

    this.spin.add(this.planet, this.clouds);
    this.ringPivot.add(this.ring);
    this.tilt.add(this.spin, this.ringPivot);
    this.root.add(this.tilt, this.atmosphere);
  }

  /** Gezegenin yarıçapı (dünya birimi) */
  get radius(): number {
    return this.current?.radius ?? 1;
  }

  /** Hedef yarıçap (animasyon bitince ulaşılacak) */
  get targetRadius(): number {
    return this.target?.radius ?? 1;
  }

  /** Halkanın dış yarıçapı (dünya birimi), halka yoksa 0 */
  get ringOuter(): number {
    return this.ring.visible ? this.ringOuterLocal * this.targetRadius : 0;
  }

  /** Gezegenin kendi ekseni etrafındaki dönüşü (yüzey görünümü ve sondalar için) */
  get spinGroup(): THREE.Object3D {
    return this.spin;
  }

  setQuality(q: Quality) {
    const segs = SPHERE_SEGMENTS[q];
    this.planet.geometry.dispose();
    this.clouds.geometry.dispose();
    this.planet.geometry = new THREE.SphereGeometry(1, segs, segs / 2);
    this.clouds.geometry = new THREE.SphereGeometry(1.012, segs, segs / 2);
    this.bakedKey = '';
  }

  /** Yüzey dokularını pişirir (yalnızca tohum, tektonik ya da kalite değişince). */
  bake(seed: number, quality: Quality, tectonics: number) {
    const tect = Math.round(tectonics * 20) / 20;
    const key = `${seed}:${quality}:${tect}`;
    if (key === this.bakedKey) return;
    this.bakedKey = key;

    const r = rng(seed);
    const seedOffset = new THREE.Vector3(r() * 200 - 100, r() * 200 - 100, r() * 200 - 100);
    const width = BAKE_WIDTH[quality];
    const canHalf =
      this.renderer.capabilities.isWebGL2 &&
      (this.renderer.extensions.has('EXT_color_buffer_half_float') || this.renderer.extensions.has('EXT_color_buffer_float'));
    const type = canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;

    const make = () =>
      new THREE.WebGLRenderTarget(width, width / 2, {
        type,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        generateMipmaps: false,
        depthBuffer: false,
      });
    const oldA = this.targetA;
    const oldB = this.targetB;
    this.targetA = make();
    this.targetB = make();

    const mat = new THREE.ShaderMaterial({
      vertexShader: bakeVertex,
      fragmentShader: bakeFragment,
      uniforms: {
        uSeedOffset: { value: seedOffset },
        uPass: { value: 0 },
        uOctaves: { value: BAKE_OCTAVES[quality] },
        uTectonics: { value: tect },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const prevTarget = this.renderer.getRenderTarget();
    const prevToneMapping = this.renderer.toneMapping;
    const prevColorSpace = this.renderer.outputColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    mat.uniforms.uPass.value = 0;
    this.renderer.setRenderTarget(this.targetA);
    this.renderer.render(scene, cam);
    mat.uniforms.uPass.value = 1;
    this.renderer.setRenderTarget(this.targetB);
    this.renderer.render(scene, cam);

    // Yükseklik dağılımını ölç: su miktarı = okyanusun kapladığı alan oranı
    const pw = 256;
    const ph = 128;
    const probe = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.UnsignedByteType, depthBuffer: false });
    mat.uniforms.uPass.value = 2;
    mat.uniforms.uOctaves.value = 5;
    this.renderer.setRenderTarget(probe);
    this.renderer.render(scene, cam);
    const px = new Uint8Array(pw * ph * 4);
    this.renderer.readRenderTargetPixels(probe, 0, 0, pw, ph, px);
    this.quantiles = computeQuantiles(px, pw, ph);

    this.renderer.setRenderTarget(prevTarget);
    this.renderer.toneMapping = prevToneMapping;
    this.renderer.outputColorSpace = prevColorSpace;
    probe.dispose();
    mat.dispose();
    quad.geometry.dispose();
    oldA?.dispose();
    oldB?.dispose();

    this.planetMat.uniforms.uTexA.value = this.targetA.texture;
    this.planetMat.uniforms.uTexB.value = this.targetB.texture;
    this.planetMat.uniforms.uHeightMin.value = this.quantiles[0];
    this.planetMat.uniforms.uHeightMax.value = this.quantiles[100];
  }

  private seaLevelFor(water: number): number {
    if (!this.quantiles.length) return 0;
    const i = Math.max(0, Math.min(100, water * 100));
    const lo = Math.floor(i);
    const hi = Math.min(100, lo + 1);
    return this.quantiles[lo] + (this.quantiles[hi] - this.quantiles[lo]) * (i - lo);
  }

  /** Ayarlar ve rapordan yeni hedef değerleri belirler; geçiş update() içinde yumuşakça olur. */
  apply(s: PlanetSettings, report: PlanetReport, instant = false) {
    const v = report.visual;
    const radius = Math.sqrt(s.size);
    const gas = v.kind === 'gas';
    const dry = 1 - s.water;
    const [rd, rl, sa] = MINERAL_COLORS[s.mineral];
    // Kurak gezegenlerde toprak biraz daha kızıl ve açık
    const dryTint = (c: RGB): RGB => [c[0] * (1 + dry * dry * 0.15), c[1] * (1 - dry * dry * 0.1), c[2] * (1 - dry * dry * 0.2)];
    const [sh, dp] = OCEAN_COLORS[s.oceanType];
    const target: Animated = {
      seaLevel: this.seaLevelFor(s.water),
      water: s.water,
      oceanFill: v.oceanFill,
      seaIce: v.seaIce,
      iceLine: v.iceLine,
      heat: v.heat,
      molten: v.molten,
      craters: v.craters,
      microbes: v.microbes,
      vegetation: v.vegetation,
      cities: v.cities,
      smog: v.smog,
      lava: v.lava,
      aurora: v.aurora,
      haze: v.haze,
      cloudCover: v.cloudCover,
      radius,
      tilt: THREE.MathUtils.degToRad(s.axialTilt),
      storms: v.storms,
      iceCracks: v.iceCracks,
      sunColor: new THREE.Color(...v.starColor),
      sun2Color: new THREE.Color(...v.star2Color).multiplyScalar(v.star2Strength),
      skyColor: new THREE.Color(...v.skyColor),
      vegColor: new THREE.Color(...v.vegetationColor),
      cloudColor: new THREE.Color(...v.cloudColor),
      rockDark: linear(dryTint(rd)),
      rockLight: linear(dryTint(rl)),
      sand: linear(sa),
      shallow: linear(sh),
      deep: linear(dp),
      gas1: new THREE.Color(...v.gasColors[0]),
      gas2: new THREE.Color(...v.gasColors[1]),
      gas3: new THREE.Color(...v.gasColors[2]),
    };
    this.target = target;
    if (instant || !this.current) {
      const copy = { ...target } as Animated;
      for (const k of COLOR_KEYS) copy[k] = target[k].clone();
      this.current = copy;
    }

    const u = this.planetMat.uniforms;
    u.uGas.value = gas ? 1 : 0;
    u.uTidalLock.value = v.tidalLock ? 1 : 0;
    this.wind = v.wind;
    this.spinSpeed = v.tidalLock ? 0 : 0.05 * THREE.MathUtils.clamp(24 / s.dayLength, 0.05, 6) * (gas ? 2 : 1);

    // Çarpma kraterleri (en yeni dört tanesi)
    const impacts = v.impacts.slice(-MAX_IMPACTS);
    u.uImpactCount.value = impacts.length;
    impacts.forEach((imp, i) => {
      (u.uImpactDir.value as THREE.Vector3[])[i].set(...imp.dir).normalize();
      (u.uImpactAge.value as number[])[i] = imp.age;
      (u.uImpactSize.value as number[])[i] = imp.size;
    });

    // Fırtına merkezleri tohuma göre
    if (this.stormSeed !== s.seed) {
      this.stormSeed = s.seed;
      const r = rng(s.seed ^ 0x51ed);
      for (const c of this.cloudMat.uniforms.uStormCenters.value as THREE.Vector3[]) {
        const lat = (0.15 + r() * 0.45) * (r() < 0.5 ? -1 : 1);
        const lon = r() * Math.PI * 2;
        c.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      }
    }

    // Halkalar
    const rs = s.rings;
    this.ring.visible = rs.enabled;
    const inner = gas ? 1.25 : 1.35;
    const outer = inner + 0.45 + rs.width * 1.6;
    this.ringOuterLocal = outer;
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.RingGeometry(inner, outer, 256, 1);
    this.ringPivot.rotation.set(-Math.PI / 2 + THREE.MathUtils.degToRad(rs.tilt), 0, 0);
    const look = RING_MATERIAL_LOOK[rs.material];
    this.ringMat.uniforms.uColor.value.set(rs.color);
    this.ringMat.uniforms.uInner.value = inner;
    this.ringMat.uniforms.uOuter.value = outer;
    this.ringMat.uniforms.uSeed.value = (s.seed % 1000) * 0.37;
    this.ringMat.uniforms.uOpacity.value = look.opacity;
    this.ringMat.uniforms.uScatter.value = look.scatter;
    u.uRingEnabled.value = rs.enabled ? 1 : 0;
    u.uRingSeed.value = this.ringMat.uniforms.uSeed.value;
    u.uRingOpacity.value = look.opacity;
  }

  update(dt: number, time: number, motion: number) {
    if (!this.current) return;
    const k = 1 - Math.exp(-dt * 4);
    const c = this.current;
    const t = this.target;
    for (const key of SCALAR_KEYS) c[key] += (t[key] - c[key]) * k;
    for (const key of COLOR_KEYS) c[key].lerp(t[key], k);

    this.cloudTime += dt * motion * (0.4 + 2.5 * this.wind);
    const u = this.planetMat.uniforms;
    u.uTime.value = time;
    u.uCloudTime.value = this.cloudTime;
    u.uSeaLevel.value = c.seaLevel;
    u.uWater.value = c.water;
    u.uOceanFill.value = c.oceanFill;
    u.uSeaIce.value = c.seaIce;
    u.uIceLine.value = c.iceLine;
    u.uHeat.value = c.heat;
    u.uMolten.value = c.molten;
    u.uCraters.value = c.craters;
    u.uMicrobes.value = c.microbes;
    u.uVegetation.value = c.vegetation;
    u.uCities.value = c.cities;
    u.uSmog.value = c.smog;
    u.uLava.value = c.lava;
    u.uAurora.value = c.aurora;
    u.uHaze.value = c.haze;
    u.uCloudCover.value = c.cloudCover;
    u.uIceCracks.value = c.iceCracks;
    u.uSunColor.value.copy(c.sunColor);
    u.uSun2Color.value.copy(c.sun2Color);
    u.uSkyColor.value.copy(c.skyColor);
    u.uVegColor.value.copy(c.vegColor);
    u.uRockDark.value.copy(c.rockDark);
    u.uRockLight.value.copy(c.rockLight);
    u.uSand.value.copy(c.sand);
    u.uShallow.value.copy(c.shallow);
    u.uDeep.value.copy(c.deep);
    u.uGasC1.value.copy(c.gas1);
    u.uGasC2.value.copy(c.gas2);
    u.uGasC3.value.copy(c.gas3);
    u.uPlanetRadius.value = c.radius;
    this.cloudMat.uniforms.uCloudColor.value.copy(c.cloudColor);
    this.cloudMat.uniforms.uStorms.value = c.storms;
    this.clouds.visible = c.cloudCover > 0.01 && u.uGas.value < 0.5;
    this.atmosphere.visible = c.haze > 0.01;
    this.atmoMat.uniforms.uAtmoRadius.value = c.radius * (1.03 + 0.06 * c.haze);
    this.atmosphere.scale.setScalar((1.03 + 0.06 * c.haze) / 1.08);

    this.root.scale.setScalar(c.radius);
    this.tilt.rotation.z = c.tilt;
    this.spin.rotation.y += dt * this.spinSpeed * motion;

    // Halka uniform'ları dünya uzayında
    this.root.updateMatrixWorld();
    const n = new THREE.Vector3(0, 0, 1).transformDirection(this.ring.matrixWorld);
    u.uRingNormal.value.copy(n);
    u.uRingInner.value = this.ringMat.uniforms.uInner.value * c.radius;
    u.uRingOuter.value = this.ringMat.uniforms.uOuter.value * c.radius;
  }
}

/** Ölçüm dokusundan alan ağırlıklı yükseklik yüzdeliklerini (0..100) hesaplar. */
function computeQuantiles(px: Uint8Array, w: number, h: number): number[] {
  const samples: { h: number; w: number }[] = [];
  let total = 0;
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI;
    const weight = Math.cos(lat);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = (px[i] + px[i + 1] / 255) / 255;
      samples.push({ h: (v - 0.5) * 4, w: weight });
      total += weight;
    }
  }
  samples.sort((a, b) => a.h - b.h);
  const q: number[] = new Array(101);
  q[0] = samples[0].h;
  q[100] = samples[samples.length - 1].h;
  let acc = 0;
  let next = 1;
  for (const s of samples) {
    acc += s.w;
    while (next < 100 && acc >= (next / 100) * total) {
      q[next] = s.h;
      next++;
    }
  }
  for (let i = next; i < 100; i++) q[i] = q[100];
  return q;
}
