import * as THREE from 'three';
import type { PlanetReport } from '../sim/physics';
import { PlanetSettings, rng } from '../state/settings';
import { bakeFragment, bakeVertex } from './shaders/bake';
import {
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

const AXIAL_TILT = 0.41; // ~23,4°
const RING_MATERIAL_LOOK = {
  ice: { opacity: 0.88, scatter: 0.25 },
  rock: { opacity: 0.78, scatter: 0.12 },
  dust: { opacity: 0.42, scatter: 1.0 },
};

/** Yumuşak geçiş yapılan görsel değerler */
interface Animated {
  seaLevel: number;
  water: number;
  oceanFill: number;
  seaIce: number;
  iceLine: number;
  heat: number;
  molten: number;
  craters: number;
  microbes: number;
  vegetation: number;
  cities: number;
  lava: number;
  haze: number;
  cloudCover: number;
  radius: number;
  sunColor: THREE.Color;
  skyColor: THREE.Color;
  vegColor: THREE.Color;
  cloudColor: THREE.Color;
}

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

  constructor(
    private renderer: THREE.WebGLRenderer,
    readonly sunDir: THREE.Vector3,
  ) {
    const common = {
      uSunDir: { value: sunDir },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSkyColor: { value: new THREE.Color(0.3, 0.5, 1) },
      uTime: { value: 0 },
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
        uLava: { value: 0 },
        uHaze: { value: 0.5 },
        uCloudCover: { value: 0.5 },
        uBump: { value: 0.035 },
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
        uSkyColor: common.uSkyColor,
        uTime: common.uTime,
        uTexB: this.planetMat.uniforms.uTexB,
        uCloudColor: { value: new THREE.Color(1, 1, 1) },
        uCover: this.planetMat.uniforms.uCloudCover,
        uOpacity: { value: 0.95 },
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
    this.tilt.rotation.z = AXIAL_TILT;
    this.root.add(this.tilt, this.atmosphere);
  }

  /** Gezegenin yarıçapı (dünya birimi) */
  get radius(): number {
    return this.current?.radius ?? 1;
  }

  /** Halkanın dış yarıçapı (dünya birimi), halka yoksa 0 */
  get ringOuter(): number {
    return this.ring.visible ? this.ringOuterLocal * this.radius : 0;
  }

  /** Halkanın dünya uzayındaki normali */
  get ringNormal(): THREE.Vector3 {
    return this.planetMat.uniforms.uRingNormal.value as THREE.Vector3;
  }

  setQuality(q: Quality) {
    const segs = SPHERE_SEGMENTS[q];
    this.planet.geometry.dispose();
    this.clouds.geometry.dispose();
    this.planet.geometry = new THREE.SphereGeometry(1, segs, segs / 2);
    this.clouds.geometry = new THREE.SphereGeometry(1.012, segs, segs / 2);
    this.bakedKey = '';
  }

  /** Yüzey dokularını pişirir (yalnızca tohum ya da kalite değişince). */
  bake(seed: number, quality: Quality) {
    const key = `${seed}:${quality}`;
    if (key === this.bakedKey) return;
    this.bakedKey = key;

    const r = rng(seed);
    const seedOffset = new THREE.Vector3(r() * 200 - 100, r() * 200 - 100, r() * 200 - 100);
    const width = BAKE_WIDTH[quality];
    const caps = this.renderer.capabilities;
    const canHalf = caps.isWebGL2 && (this.renderer.extensions.has('EXT_color_buffer_half_float') || this.renderer.extensions.has('EXT_color_buffer_float'));
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
    this.targetA?.dispose();
    this.targetB?.dispose();
    this.targetA = make();
    this.targetB = make();

    const mat = new THREE.ShaderMaterial({
      vertexShader: bakeVertex,
      fragmentShader: bakeFragment,
      uniforms: {
        uSeedOffset: { value: seedOffset },
        uPass: { value: 0 },
        uOctaves: { value: BAKE_OCTAVES[quality] },
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
      lava: v.lava,
      haze: v.haze,
      cloudCover: v.cloudCover,
      radius,
      sunColor: new THREE.Color(...v.starColor),
      skyColor: new THREE.Color(...v.skyColor),
      vegColor: new THREE.Color(...v.vegetationColor),
      cloudColor: new THREE.Color(...v.cloudColor),
    };
    this.target = target;
    if (instant || !this.current) {
      this.current = { ...target, sunColor: target.sunColor.clone(), skyColor: target.skyColor.clone(), vegColor: target.vegColor.clone(), cloudColor: target.cloudColor.clone() };
    }

    // Halkalar
    const rs = s.rings;
    this.ring.visible = rs.enabled;
    const inner = 1.35;
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
    this.planetMat.uniforms.uRingEnabled.value = rs.enabled ? 1 : 0;
    this.planetMat.uniforms.uRingSeed.value = this.ringMat.uniforms.uSeed.value;
    this.planetMat.uniforms.uRingOpacity.value = look.opacity;
  }

  update(dt: number, time: number, spinSpeed: number) {
    if (!this.current) return;
    const k = 1 - Math.exp(-dt * 4);
    const c = this.current;
    const t = this.target;
    const keys = ['seaLevel', 'water', 'oceanFill', 'seaIce', 'iceLine', 'heat', 'molten', 'craters', 'microbes', 'vegetation', 'cities', 'lava', 'haze', 'cloudCover', 'radius'] as const;
    for (const key of keys) c[key] += (t[key] - c[key]) * k;
    c.sunColor.lerp(t.sunColor, k);
    c.skyColor.lerp(t.skyColor, k);
    c.vegColor.lerp(t.vegColor, k);
    c.cloudColor.lerp(t.cloudColor, k);

    const u = this.planetMat.uniforms;
    u.uTime.value = time;
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
    u.uLava.value = c.lava;
    u.uHaze.value = c.haze;
    u.uCloudCover.value = c.cloudCover;
    u.uSunColor.value.copy(c.sunColor);
    u.uSkyColor.value.copy(c.skyColor);
    u.uVegColor.value.copy(c.vegColor);
    u.uPlanetRadius.value = c.radius;
    this.cloudMat.uniforms.uCloudColor.value.copy(c.cloudColor);
    this.clouds.visible = c.cloudCover > 0.01;
    this.atmosphere.visible = c.haze > 0.01;
    this.atmoMat.uniforms.uAtmoRadius.value = c.radius * (1.03 + 0.06 * c.haze);
    this.atmosphere.scale.setScalar((1.03 + 0.06 * c.haze) / 1.08);

    this.root.scale.setScalar(c.radius);
    this.spin.rotation.y += dt * spinSpeed;

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
