// "Yüzeyden bak" modu: gezegenin durumuna uygun Blender manzarası + kodla çizilen gökyüzü,
// bulutlar, su, çimen ve parçacıklar.
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlanetReport, RGB } from '../sim/physics';
import { PlanetSettings, rng } from '../state/settings';
import type { Quality } from './planetSystem';
import { noiseGLSL } from './shaders/noise';
import { commonGLSL } from './shaders/planet';

export type Biome = 'desert' | 'ice' | 'shore' | 'volcanic' | 'forest';

const BASE = import.meta.env.BASE_URL;
const linear = (c: RGB) => new THREE.Color(Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2));

/** Gözlemcinin bulunduğu enlem (halkaların gökyüzündeki konumunu belirler) */
const LATITUDE = THREE.MathUtils.degToRad(32);

const GRASS_COUNT: Record<Quality, number> = { low: 1400, medium: 3500, high: 7000 };
const SHADOW_SIZE: Record<Quality, number> = { low: 0, medium: 1024, high: 2048 };
const CLOUD_OCTAVES: Record<Quality, number> = { low: 3, medium: 4, high: 5 };

export function pickBiome(s: PlanetSettings, r: PlanetReport): Biome {
  const v = r.visual;
  if (r.young || v.molten > 0.3 || v.lava > 0.6) return 'volcanic';
  if ((r.waterState === 'frozen' && s.water > 0.2) || v.iceLine < 0.45) return 'ice';
  if (s.water >= 0.9 && r.waterState === 'liquid') return 'shore';
  if (v.vegetation > 0.25) return 'forest';
  if (r.waterState === 'liquid' && s.water > 0.35) return 'shore';
  return 'desert';
}

// ---------------------------------------------------------------------------
// Gökyüzü: saçılma, gün batımı, yıldızlar, halkalar, aylar, güneşler ve bulutlar
// ---------------------------------------------------------------------------
const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const skyFragment = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunsetColor;
uniform float uSunset;
uniform float uHaze;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform vec3 uSun2Dir;
uniform vec3 uSun2Color;
uniform float uSun2Size;
uniform float uRingOn;
uniform vec3 uRingNormal;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uRingSeed;
uniform vec3 uRingColor;
uniform float uRingOpacity;
uniform int uMoonCount;
uniform vec3 uMoonDir[3];
uniform float uMoonSize[3];
uniform float uTime;
uniform float uCloudCover;
uniform vec3 uCloudColor;
uniform float uWind;
uniform int uCloudOctaves;

${noiseGLSL}
${commonGLSL}

float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }

void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);

  // Tepeden ufka renk geçişi; ufukta parlak bir şerit
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.85, up), 0.55));
  if (d.y < 0.0) col = uHorizon * 0.85;

  // Güneş tarafında saçılma (Mie) ve alçak güneşte gün batımı tonu
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.35) * (0.3 + uHaze);
  vec2 dh = normalize(d.xz + 1e-4);
  vec2 sh = normalize(uSunDir.xz + 1e-4);
  float azim = max(dot(dh, sh), 0.0);
  col = mix(col, uSunsetColor, uSunset * pow(1.0 - up, 3.5) * (0.25 + 0.75 * azim) * uHaze);
  float skyLum = dot(col, vec3(0.3, 0.5, 0.2));

  // Yıldızlar (ince atmosferde gündüz de görünür)
  float starVis = 1.0 - smoothstep(0.004, 0.035, skyLum);
  float st = step(0.9975, hash3(floor(d * 420.0)));
  col += vec3(st) * starVis * 0.9 * smoothstep(0.0, 0.1, d.y);

  // Halkalar: gezegen merkezi gözlemcinin 1 birim altında
  if (uRingOn > 0.5) {
    vec3 C = vec3(0.0, -1.0, 0.0);
    float denom = dot(d, uRingNormal);
    if (abs(denom) > 0.0001) {
      float t = dot(C, uRingNormal) / denom;
      if (t > 0.0) {
        vec3 q = d * t - C;
        float r = (length(q) - uRingInner) / (uRingOuter - uRingInner);
        float dens = ringDensity(r, uRingSeed) * uRingOpacity;
        vec3 rc = toneLinear(uRingColor) * uSunColor * (0.55 + 0.45 * noise1(r * 300.0 + uRingSeed));
        col = mix(col, rc, dens * smoothstep(-0.02, 0.06, d.y) * mix(0.55, 1.0, starVis));
      }
    }
  }

  // Aylar: güneş yönüne göre evreli diskler
  for (int i = 0; i < 3; i++) {
    if (i >= uMoonCount) break;
    vec3 m = uMoonDir[i];
    float ang = acos(clamp(dot(d, m), -1.0, 1.0));
    float rad = uMoonSize[i];
    if (ang < rad) {
      vec3 t1 = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
      vec3 t2 = cross(t1, m);
      vec2 p = vec2(dot(d - m, t1), dot(d - m, t2)) / rad;
      vec3 n = normalize(t1 * p.x + t2 * p.y - m * sqrt(max(0.0, 1.0 - dot(p, p))));
      float lit = smoothstep(0.35, 0.65, clamp(dot(-n, uSunDir) * 0.5 + 0.5, 0.0, 1.0));
      float crater = 0.85 + 0.3 * snoise(vec3(p * 3.0, float(i) * 7.0));
      vec3 mc = vec3(0.55, 0.53, 0.5) * crater * uSunColor * lit;
      float edge = smoothstep(rad, rad * 0.94, ang);
      col = mix(col, mc + col * 0.18, edge * mix(0.6, 1.0, starVis));
    }
  }

  // Güneşler: disk + hale
  float a1 = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  col += uSunColor * (smoothstep(uSunSize, uSunSize * 0.8, a1) * 6.0 + pow(sd, 400.0) * 1.2);
  float s2 = max(dot(d, uSun2Dir), 0.0);
  float a2 = acos(clamp(dot(d, uSun2Dir), -1.0, 1.0));
  col += uSun2Color * (smoothstep(uSun2Size, uSun2Size * 0.8, a2) * 6.0 + pow(s2, 400.0) * 1.2 + pow(s2, 10.0) * 0.15 * uHaze);

  // Bulutlar: düzleme izdüşürülmüş, rüzgârla kayan gürültü
  if (d.y > 0.0 && uCloudCover > 0.01) {
    vec2 p = d.xz / (d.y + 0.12) * 0.7;
    vec3 q = vec3(p + vec2(uTime * 0.012, uTime * 0.005) * (0.4 + uWind * 2.0), uTime * 0.004);
    float n = fbm(q * 1.3, uCloudOctaves) * 0.5 + 0.5;
    float thr = 1.0 - uCloudCover;
    float c = smoothstep(thr - 0.06, thr + 0.22, n) * smoothstep(0.0, 0.18, d.y);
    if (c > 0.002) {
      // Güneşe doğru kaydırılmış örnekle kendi gölgesi
      float n2 = fbm((q + vec3(uSunDir.xz * 0.12, 0.0)) * 1.3, 3) * 0.5 + 0.5;
      float shade = clamp(1.05 - (n2 - n) * 4.0, 0.45, 1.25);
      vec3 cc = toneLinear(uCloudColor) * (uSunColor * shade * 0.85 + uZenith * 0.5);
      cc = mix(cc, uSunsetColor * uSunColor, uSunset * 0.5 * (1.0 - up));
      cc += uSunColor * pow(sd, 5.0) * 0.5 * (1.0 - c);
      col = mix(col, cc, c * 0.94);
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Su: dalgalı yüzey, gökyüzü yansıması (Fresnel) ve güneş parıltısı
// ---------------------------------------------------------------------------
const waterVertex = /* glsl */ `
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const waterFragment = /* glsl */ `
precision highp float;
varying vec3 vWPos;
uniform vec3 uWaterColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uFrozen;
uniform float uWind;
#include <fog_pars_fragment>

// Birkaç yönlü dalganın türevinden normal
vec3 waveNormal(vec2 p) {
  float amp = 0.25 + uWind * 0.6;
  vec2 g = vec2(0.0);
  vec2 dirs[4];
  dirs[0] = normalize(vec2(1.0, 0.35));
  dirs[1] = normalize(vec2(-0.6, 1.0));
  dirs[2] = normalize(vec2(0.25, -1.0));
  dirs[3] = normalize(vec2(-1.0, -0.3));
  float freqs[4];
  freqs[0] = 0.55; freqs[1] = 0.9; freqs[2] = 1.7; freqs[3] = 3.1;
  for (int i = 0; i < 4; i++) {
    float f = freqs[i];
    float ph = dot(dirs[i], p) * f + uTime * (0.9 + f * 0.6);
    g += dirs[i] * cos(ph) * f * amp / (1.0 + float(i));
  }
  return normalize(vec3(-g.x * 0.12, 1.0, -g.y * 0.12));
}

void main() {
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 n = uFrozen > 0.5 ? vec3(0.0, 1.0, 0.0) : waveNormal(vWPos.xz);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 skyRef = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, R.y));
  float sr = max(dot(R, uSunDir), 0.0);
  vec3 spec = uSunColor * (pow(sr, 400.0) * 6.0 + pow(sr, 40.0) * 0.35);
  vec3 body = uWaterColor * (0.35 + 0.65 * max(uSunDir.y, 0.1));
  vec3 col = mix(body, skyRef, fres) + spec * (1.0 - uFrozen * 0.7);
  if (uFrozen > 0.5) col = mix(vec3(0.72, 0.82, 0.9) * (0.6 + 0.4 * max(uSunDir.y, 0.2)), skyRef, 0.25) + spec * 0.2;
  gl_FragColor = vec4(col, 0.94);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// 2B değer gürültüsü (zemin dokusu için)
const vnoiseGLSL = /* glsl */ `
float vhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + vec2(1.0, 0.0)), u.x), mix(vhash(i + vec2(0.0, 1.0)), vhash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

type ParticleKind = 'snow' | 'ash' | 'dust' | 'pollen' | 'none';

export class SurfaceView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
  active = false;

  private loader: GLTFLoader;
  private cache = new Map<Biome, THREE.Object3D>();
  private current: THREE.Object3D | null = null;
  private skyMat: THREE.ShaderMaterial;
  private sun1 = new THREE.DirectionalLight(0xffffff, 2.5);
  private sun2 = new THREE.DirectionalLight(0xffffff, 0);
  private hemi = new THREE.HemisphereLight(0x8899ff, 0x332211, 0.6);
  private yaw = 0;
  private pitch = 0.08;
  private targetYaw = 0;
  private targetPitch = 0.08;
  private drag: { x: number; y: number } | null = null;
  private lavaMats: THREE.MeshStandardMaterial[] = [];
  private waterMats: THREE.ShaderMaterial[] = [];
  private grassUniforms: { uTime: { value: number }; uWind: { value: number } } | null = null;
  private grass: THREE.InstancedMesh | null = null;
  private particles: THREE.Points | null = null;
  private particleVel: Float32Array | null = null;
  private particleKind: ParticleKind = 'none';
  private wind = 0.3;
  private time = 0;
  private loadToken = 0;

  constructor(private dom: HTMLElement) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(`${BASE}draco/`);
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunsetColor: { value: new THREE.Color(1, 0.45, 0.2) },
        uSunset: { value: 0 },
        uHaze: { value: 0.5 },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uSunSize: { value: 0.01 },
        uSun2Dir: { value: new THREE.Vector3(0, -1, 0) },
        uSun2Color: { value: new THREE.Color(0, 0, 0) },
        uSun2Size: { value: 0.01 },
        uRingOn: { value: 0 },
        uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
        uRingInner: { value: 1.35 },
        uRingOuter: { value: 2.5 },
        uRingSeed: { value: 0 },
        uRingColor: { value: new THREE.Color() },
        uRingOpacity: { value: 0.8 },
        uMoonCount: { value: 0 },
        uMoonDir: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
        uMoonSize: { value: [0.02, 0.02, 0.02] },
        uTime: { value: 0 },
        uCloudCover: { value: 0.4 },
        uCloudColor: { value: new THREE.Color(1, 1, 1) },
        uWind: { value: 0.3 },
        uCloudOctaves: { value: 4 },
      },
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.skyMat);
    sky.renderOrder = -1;
    sky.frustumCulled = false;

    // Gölgeler: güneş ışığı önümüzdeki 90 m'lik alanı kapsar
    this.sun1.shadow.camera.left = -45;
    this.sun1.shadow.camera.right = 45;
    this.sun1.shadow.camera.top = 45;
    this.sun1.shadow.camera.bottom = -45;
    this.sun1.shadow.camera.near = 1;
    this.sun1.shadow.camera.far = 400;
    this.sun1.shadow.bias = -0.0006;
    this.sun1.shadow.normalBias = 0.04;
    this.sun1.target.position.set(0, 0, -18);
    this.scene.add(sky, this.sun1, this.sun1.target, this.sun2, this.hemi);
    this.camera.position.set(0, 1.7, 0);
    this.camera.rotation.order = 'YXZ';

    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.active || !this.drag) return;
      this.targetYaw += (e.clientX - this.drag.x) * 0.004;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + (e.clientY - this.drag.y) * 0.003, -0.35, 1.3);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => (this.drag = null));
    this.dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + e.deltaY * 0.03, 25, 80);
        this.camera.updateProjectionMatrix();
      },
      { passive: true },
    );
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  async enter(s: PlanetSettings, r: PlanetReport, quality: Quality = 'medium'): Promise<Biome> {
    this.active = true;
    // Hafif sola, vadiye doğru bakarak başla
    this.yaw = this.targetYaw = -0.22;
    this.pitch = this.targetPitch = 0.1;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    const biome = pickBiome(s, r);
    const token = ++this.loadToken;
    const model = await this.load(biome);
    if (token !== this.loadToken || !this.active) return biome;
    if (this.current) this.scene.remove(this.current);
    this.current = model;
    if (model) this.scene.add(model);
    this.applyLook(s, r, biome, quality);
    return biome;
  }

  exit() {
    this.active = false;
    this.loadToken++;
  }

  update(dt: number) {
    this.time += dt;
    // Yumuşak bakış ve hafif nefes alma salınımı
    const k = 1 - Math.exp(-dt * 10);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.camera.rotation.set(this.pitch + Math.sin(this.time * 0.6) * 0.003, -this.yaw + Math.sin(this.time * 0.37) * 0.004, 0);
    this.camera.position.y = 1.7 + Math.sin(this.time * 0.9) * 0.01;

    this.skyMat.uniforms.uTime.value = this.time;
    for (const m of this.lavaMats) m.emissiveIntensity = 1.0 + Math.sin(this.time * 2.0) * 0.25;
    for (const m of this.waterMats) m.uniforms.uTime.value = this.time;
    if (this.grassUniforms) this.grassUniforms.uTime.value = this.time;
    this.updateParticles(dt);
  }

  private async load(biome: Biome): Promise<THREE.Object3D | null> {
    const hit = this.cache.get(biome);
    if (hit) return hit;
    try {
      const gltf = await this.loader.loadAsync(`${BASE}models/land_${biome}.glb`);
      this.cache.set(biome, gltf.scene);
      return gltf.scene;
    } catch (e) {
      console.warn('Manzara yüklenemedi', e);
      return null;
    }
  }

  private applyLook(s: PlanetSettings, r: PlanetReport, biome: Biome, quality: Quality) {
    const v = r.visual;
    const sunColor = new THREE.Color(...v.starColor);
    const sky = linear(v.skyColor);
    const thin = r.pressure < 0.0025;
    this.wind = Math.max(s.wind, v.storms * 0.5);

    // Güneş konumu: kilitli dönüşte ufka yakın, değilse öğleden sonra
    // Güneş sağ önde: manzara yandan aydınlanır, güneş de görüş alanının kenarında kalır
    const sunEl = s.tidalLock ? 0.1 : 0.4;
    const sunAz = 0.72;
    const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl)).normalize();
    const sun2Dir = new THREE.Vector3(Math.sin(sunAz - 0.55) * Math.cos(sunEl + 0.08), Math.sin(sunEl + 0.08), -Math.cos(sunAz - 0.55)).normalize();
    const apparent = r.star.radius / s.distance;
    const sunSize = THREE.MathUtils.clamp(0.0093 * apparent * 1.6, 0.003, 0.3);
    const sunset = THREE.MathUtils.clamp(1 - sunEl / 0.4, 0, 1) * 0.8 + 0.2;

    const zenith = thin ? new THREE.Color(0.004, 0.005, 0.01) : sky.clone().multiplyScalar(0.5 + 0.25 * v.haze);
    const horizon = thin
      ? new THREE.Color(0.03, 0.025, 0.02)
      : sky.clone().lerp(new THREE.Color(1, 1, 1).multiply(sunColor), 0.5).multiplyScalar(0.95);

    const u = this.skyMat.uniforms;
    u.uZenith.value.copy(zenith);
    u.uHorizon.value.copy(horizon);
    u.uSunsetColor.value.copy(new THREE.Color(1, 0.42, 0.16).lerp(sunColor, 0.3));
    u.uSunset.value = thin ? 0 : sunset;
    u.uHaze.value = v.haze;
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunColor);
    u.uSunSize.value = sunSize;
    u.uSun2Dir.value.copy(sun2Dir);
    u.uSun2Color.value.setRGB(...v.star2Color).multiplyScalar(v.star2Strength);
    u.uSun2Size.value = sunSize * 0.6;
    u.uCloudCover.value = thin ? 0 : Math.min(0.85, v.cloudCover * 0.9);
    u.uCloudColor.value.setRGB(...v.cloudColor);
    u.uWind.value = this.wind;
    u.uCloudOctaves.value = CLOUD_OCTAVES[quality];

    // Halkalar: gezegenin ekseni gözlemcinin kuzeyinde (+Z) enlem kadar yükselir
    u.uRingOn.value = s.rings.enabled ? 1 : 0;
    const axis = new THREE.Vector3(0, Math.sin(LATITUDE), Math.cos(LATITUDE));
    axis.applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(s.rings.tilt));
    u.uRingNormal.value.copy(axis.normalize());
    const inner = 1.35;
    u.uRingInner.value = inner;
    u.uRingOuter.value = inner + 0.45 + s.rings.width * 1.6;
    u.uRingSeed.value = (s.seed % 1000) * 0.37;
    u.uRingColor.value.set(s.rings.color);
    u.uRingOpacity.value = s.rings.material === 'dust' ? 0.45 : 0.85;

    // Aylar
    const rr = rng(s.seed ^ 0xabc);
    u.uMoonCount.value = s.moons;
    for (let i = 0; i < 3; i++) {
      const az = -0.95 + i * 0.85 + rr() * 0.3;
      const el = 0.28 + rr() * 0.45;
      (u.uMoonDir.value as THREE.Vector3[])[i].set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      (u.uMoonSize.value as number[])[i] = 0.012 + s.moonSizes[i] * 0.05;
    }

    // Işıklar ve gölgeler
    const shadowSize = SHADOW_SIZE[quality];
    this.sun1.position.copy(sunDir).multiplyScalar(150).add(this.sun1.target.position);
    this.sun1.color.copy(sunColor);
    this.sun1.intensity = 2.8;
    this.sun1.castShadow = shadowSize > 0;
    if (shadowSize && this.sun1.shadow.mapSize.x !== shadowSize) {
      this.sun1.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun1.shadow.map?.dispose();
      this.sun1.shadow.map = null;
    }
    this.sun2.position.copy(sun2Dir).multiplyScalar(100);
    this.sun2.color.setRGB(...v.star2Color);
    this.sun2.intensity = 2.6 * v.star2Strength;
    this.hemi.color.copy(thin ? new THREE.Color(0.08, 0.08, 0.1) : sky.clone().lerp(horizon, 0.3));
    this.hemi.groundColor.copy(thin ? new THREE.Color(0.02, 0.02, 0.02) : horizon.clone().multiplyScalar(0.35));
    this.hemi.intensity = 0.55 + v.haze * 0.75;

    // Sis: kalın atmosferde ufuk puslu
    this.scene.fog = thin ? null : new THREE.Fog(horizon.clone(), 30 - v.haze * 18, 170 - v.haze * 95);

    this.recolor(s, r, biome);
    this.buildGrass(s, r, biome, quality);
    this.buildParticles(s, r, biome);
  }

  private recolor(s: PlanetSettings, r: PlanetReport, biome: Biome) {
    if (!this.current) return;
    const v = r.visual;
    const veg = new THREE.Color(...v.vegetationColor).multiplyScalar(1.6);
    const minerals: Record<string, RGB> = {
      basalt: [0.55, 0.5, 0.43],
      iron: [0.7, 0.4, 0.22],
      salt: [0.86, 0.84, 0.8],
      sulfur: [0.85, 0.75, 0.3],
    };
    const rock = linear(minerals[s.mineral]);
    const ocean: Record<string, RGB> = { salt: [0.08, 0.32, 0.42], fresh: [0.1, 0.36, 0.36], methane: [0.28, 0.18, 0.08] };
    const plantsOn = v.vegetation > 0.1 || biome === 'forest';
    // Düşük yerçekiminde bitkiler uzar
    const plantScale = THREE.MathUtils.clamp(1 / Math.sqrt(Math.max(r.gravity, 0.15)), 0.6, 2.4);
    const cold = r.tAvg < 268 || biome === 'ice';
    const sky = this.skyMat.uniforms;
    this.lavaMats = [];
    this.waterMats = [];

    this.current.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = mesh.name.toLowerCase();
      if (!mesh.userData.baseMaterial) mesh.userData.baseMaterial = mesh.material;
      if (name.startsWith('water')) {
        const frozen = r.waterState === 'frozen';
        mesh.visible = r.waterState === 'liquid' || frozen;
        const mat = new THREE.ShaderMaterial({
          vertexShader: waterVertex,
          fragmentShader: waterFragment,
          transparent: true,
          fog: true,
          uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
              uWaterColor: { value: frozen ? new THREE.Color(0.7, 0.8, 0.9) : linear(ocean[s.oceanType]) },
              uZenith: { value: sky.uZenith.value.clone() },
              uHorizon: { value: sky.uHorizon.value.clone() },
              uSunDir: { value: sky.uSunDir.value.clone() },
              uSunColor: { value: sky.uSunColor.value.clone() },
              uTime: { value: 0 },
              uFrozen: { value: frozen ? 1 : 0 },
              uWind: { value: this.wind },
            },
          ]),
        });
        mesh.material = mat;
        mesh.receiveShadow = false;
        this.waterMats.push(mat);
        return;
      }

      const mat = (mesh.userData.baseMaterial as THREE.MeshStandardMaterial).clone();
      mesh.material = mat;
      mesh.castShadow = !name.startsWith('lava');
      mesh.receiveShadow = true;
      if (name.startsWith('ground')) {
        let groundCol: THREE.Color;
        if (biome === 'forest') groundCol = rock.clone().lerp(veg, 0.75 * Math.min(1, v.vegetation + 0.3));
        else if (biome === 'ice') groundCol = new THREE.Color(0.82, 0.88, 0.96);
        else if (biome === 'volcanic') groundCol = new THREE.Color(0.045, 0.04, 0.035);
        else if (biome === 'desert') groundCol = linear(s.mineral === 'basalt' ? [0.82, 0.66, 0.45] : minerals[s.mineral]);
        else groundCol = linear([0.82, 0.74, 0.55]);
        mat.color.copy(groundCol);
        mat.vertexColors = true;
        mat.roughness = biome === 'ice' ? 0.55 : 0.95;
        const rockCol = biome === 'volcanic' ? new THREE.Color(0.02, 0.018, 0.016) : biome === 'ice' ? new THREE.Color(0.35, 0.38, 0.45) : rock.clone().multiplyScalar(0.8);
        this.terrainShader(mat, rockCol, cold && biome !== 'volcanic' ? 1 : 0, biome === 'volcanic' ? 1 : 0);
      } else if (name.startsWith('rocks')) {
        mat.color.copy(biome === 'volcanic' ? new THREE.Color(0.02, 0.018, 0.016) : rock);
        mat.roughness = 0.9;
      } else if (name.startsWith('plants')) {
        mesh.visible = plantsOn;
        mat.color.copy(veg);
        mesh.scale.y = plantScale;
      } else if (name.startsWith('trunks')) {
        mesh.visible = plantsOn;
        mesh.scale.y = plantScale;
      } else if (name.startsWith('lava')) {
        mat.color.setRGB(0.05, 0.02, 0.01);
        mat.emissive.setRGB(1, 0.26, 0.03);
        mat.emissiveIntensity = 1.1;
        this.lavaMats.push(mat);
      } else if (name.startsWith('ice')) {
        mat.color.setRGB(0.82, 0.92, 1);
        mat.roughness = 0.25;
        mat.metalness = 0;
        mat.emissive.copy(this.skyMat.uniforms.uZenith.value).multiplyScalar(0.35);
      }
    });
  }

  /** Zemin: eğimli yerler kaya, yükseklerde kar, yüzeyde gürültüyle renk çeşitliliği */
  private terrainShader(mat: THREE.MeshStandardMaterial, rockCol: THREE.Color, snow: number, lavaCracks: number) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRockCol = { value: rockCol };
      shader.uniforms.uSnow = { value: snow };
      shader.uniforms.uLavaCracks = { value: lavaCracks };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform vec3 uRockCol;\nuniform float uSnow;\nuniform float uLavaCracks;\n${vnoiseGLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float slope = 1.0 - clamp(vWNormal.y, 0.0, 1.0);
          float n = vnoise(vWPos.xz * 0.35) * 0.6 + vnoise(vWPos.xz * 1.9) * 0.3 + vnoise(vWPos.xz * 7.0) * 0.1;
          vec3 baseCol = diffuseColor.rgb * (0.78 + 0.44 * n);
          vec3 rockC = uRockCol * (0.75 + 0.5 * vnoise(vWPos.xz * 0.8 + 7.0));
          baseCol = mix(baseCol, rockC, smoothstep(0.22, 0.45, slope + (n - 0.5) * 0.2));
          float snowMask = uSnow * smoothstep(1.5, 4.0, vWPos.y + n * 3.0) * (1.0 - smoothstep(0.4, 0.65, slope));
          baseCol = mix(baseCol, vec3(0.9, 0.93, 0.98), snowMask);
          diffuseColor.rgb = baseCol;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float crack = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(vWPos.xz * 0.45) - 0.5));
          totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * crack * uLavaCracks * 1.4;`,
        );
    };
    mat.needsUpdate = true;
  }

  /** Zemin yüksekliği: arazi ızgarasının köşelerinden en yakın değer */
  private heightSampler(): ((x: number, z: number) => number) | null {
    let ground: THREE.Mesh | null = null;
    this.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name.toLowerCase().startsWith('ground')) ground = o as THREE.Mesh;
    });
    if (!ground) return null;
    const g = ground as THREE.Mesh;
    g.updateMatrixWorld(true);
    const pos = g.geometry.attributes.position;
    const step = 80 / 90;
    const map = new Map<string, number>();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(g.matrixWorld);
      map.set(`${Math.round(v.x / step)},${Math.round(v.z / step)}`, v.y);
    }
    return (x, z) => {
      const ix = x / step;
      const iz = z / step;
      const x0 = Math.floor(ix);
      const z0 = Math.floor(iz);
      const fx = ix - x0;
      const fz = iz - z0;
      const at = (a: number, b: number) => map.get(`${a},${b}`) ?? map.get(`${Math.round(ix)},${Math.round(iz)}`) ?? 0;
      const top = at(x0, z0) * (1 - fx) + at(x0 + 1, z0) * fx;
      const bot = at(x0, z0 + 1) * (1 - fx) + at(x0 + 1, z0 + 1) * fx;
      return top * (1 - fz) + bot * fz;
    };
  }

  /** Rüzgârda sallanan çimen (örneklenmiş tek çizim) */
  private buildGrass(s: PlanetSettings, r: PlanetReport, biome: Biome, quality: Quality) {
    if (this.grass) {
      this.scene.remove(this.grass);
      this.grass.geometry.dispose();
      (this.grass.material as THREE.Material).dispose();
      this.grass = null;
      this.grassUniforms = null;
    }
    const v = r.visual;
    const lush = biome === 'forest' || biome === 'shore';
    const density = biome === 'ice' || biome === 'volcanic' ? 0 : lush ? Math.min(1, v.vegetation + 0.25) : v.vegetation > 0.1 ? 0.35 : 0;
    if (density <= 0 || v.vegetation <= 0.05) return;
    const sample = this.heightSampler();
    if (!sample) return;

    // Üç çapraz yapraktan oluşan küçük bir öbek
    const blade = new THREE.PlaneGeometry(0.07, 1, 1, 3);
    blade.translate(0, 0.5, 0);
    const p = blade.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1 - y * 0.85) + y * y * 0.08);
    }
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const b = blade.clone();
      b.rotateY((k / 3) * Math.PI + 0.3);
      b.translate((k - 1) * 0.06, 0, ((k * 7) % 3 - 1) * 0.05);
      parts.push(b);
    }
    const merged = mergeGeometries(parts);
    blade.dispose();

    const uniforms = { uTime: { value: 0 }, uWind: { value: 0.25 + this.wind * 0.9 } };
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWind = uniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nvarying float vH;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vH = clamp(position.y, 0.0, 1.0);
          vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.7 + iw.x * 0.35 + iw.z * 0.22) * 0.6 + sin(uTime * 3.1 + iw.x * 0.9 - iw.z * 0.4) * 0.25;
          transformed.x += sway * vH * vH * uWind * 0.35;
          transformed.z += sway * vH * vH * uWind * 0.18;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.35, 1.05, vH);');
    };

    const count = Math.round(GRASS_COUNT[quality] * density);
    const mesh = new THREE.InstancedMesh(merged, mat, count);
    const veg = new THREE.Color(...v.vegetationColor).multiplyScalar(1.7);
    const dry = linear([0.62, 0.52, 0.3]);
    const baseCol = biome === 'desert' ? dry : veg;
    const plantScale = THREE.MathUtils.clamp(1 / Math.sqrt(Math.max(r.gravity, 0.15)), 0.6, 2.0);
    const waterLevel = biome === 'shore' ? -0.35 : -999;
    const rr = rng(s.seed ^ 0x6a55);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 3; tries++) {
      // Çoğunlukla gözlemcinin önüne, yakında daha sık
      const radius = 1.5 + Math.pow(rr(), 1.6) * 34;
      const ang = (rr() - 0.5) * Math.PI * 1.7 - Math.PI / 2;
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      const y = sample(x, z);
      if (y < waterLevel) continue;
      const h = (0.35 + rr() * 0.55) * plantScale;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, y - 0.02, z), q, new THREE.Vector3(0.9 + rr() * 0.4, h, 0.9 + rr() * 0.4));
      mesh.setMatrixAt(placed, m);
      col.copy(baseCol).multiplyScalar(0.75 + rr() * 0.5);
      col.offsetHSL((rr() - 0.5) * 0.04, 0, 0);
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.grass = mesh;
    this.grassUniforms = uniforms;
    this.scene.add(mesh);
  }

  /** Biyoma göre havada süzülen parçacıklar */
  private buildParticles(s: PlanetSettings, r: PlanetReport, biome: Biome) {
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
      this.particles = null;
    }
    const v = r.visual;
    let kind: ParticleKind = 'none';
    if (biome === 'volcanic' || v.lava > 0.5) kind = 'ash';
    else if (biome === 'ice' || r.tAvg < 262) kind = r.pressure > 0.01 ? 'snow' : 'none';
    else if (biome === 'desert' && r.pressure > 0.01) kind = 'dust';
    else if (biome === 'forest' || (biome === 'shore' && v.vegetation > 0.2)) kind = 'pollen';
    this.particleKind = kind;
    if (kind === 'none') return;

    const n = kind === 'snow' ? 1400 : kind === 'ash' ? 900 : kind === 'dust' ? 700 : 260;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const cols = new Float32Array(n * 3);
    const rr = rng(s.seed ^ 0x9a);
    const wind = 0.3 + this.wind * 2.5;
    for (let i = 0; i < n; i++) {
      pos.set([(rr() - 0.5) * 50, rr() * 16, -rr() * 45 + 5], i * 3);
      let vy = 0;
      let c: [number, number, number] = [1, 1, 1];
      if (kind === 'snow') vy = -(0.6 + rr() * 0.8);
      else if (kind === 'ash') {
        const ember = rr() < 0.3;
        vy = ember ? 0.6 + rr() * 1.2 : -(0.2 + rr() * 0.4);
        c = ember ? [1.4, 0.45, 0.08] : [0.35, 0.33, 0.32];
      } else if (kind === 'dust') {
        vy = (rr() - 0.5) * 0.15;
        c = [0.85, 0.7, 0.5];
      } else {
        vy = (rr() - 0.5) * 0.2;
        c = [1.3, 1.25, 0.7];
      }
      vel.set([wind * (0.6 + rr() * 0.6), vy, (rr() - 0.5) * 0.4], i * 3);
      cols.set(c, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const size = kind === 'snow' ? 0.09 : kind === 'ash' ? 0.07 : kind === 'dust' ? 0.05 : 0.06;
    const mat = new THREE.PointsMaterial({
      size,
      map: softDot(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      opacity: kind === 'dust' ? 0.5 : 0.9,
      blending: kind === 'ash' || kind === 'pollen' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.particleVel = vel;
    this.scene.add(this.particles);
  }

  private updateParticles(dt: number) {
    if (!this.particles || !this.particleVel) return;
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const vel = this.particleVel;
    const t = this.time;
    for (let i = 0; i < a.length; i += 3) {
      const wob = this.particleKind === 'pollen' ? Math.sin(t * 1.3 + i) * 0.3 : this.particleKind === 'snow' ? Math.sin(t * 0.8 + i) * 0.25 : 0;
      a[i] += (vel[i] + wob) * dt;
      a[i + 1] += vel[i + 1] * dt;
      a[i + 2] += vel[i + 2] * dt;
      // Kutunun dışına çıkanı karşı taraftan geri getir
      if (a[i] > 25) a[i] -= 50;
      if (a[i] < -25) a[i] += 50;
      if (a[i + 1] < 0) a[i + 1] += 16;
      if (a[i + 1] > 16) a[i + 1] -= 16;
      if (a[i + 2] > 5) a[i + 2] -= 45;
      if (a[i + 2] < -40) a[i + 2] += 45;
    }
    pos.needsUpdate = true;
  }
}

let dotTexture: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

/** Aynı özniteliklere sahip geometrileri tek geometride birleştirir */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'];
  for (const name of names) {
    const arrays = parts.map((p) => p.attributes[name].array as Float32Array);
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const a of arrays) {
      merged.set(a, off);
      off += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(merged, parts[0].attributes[name].itemSize));
  }
  const indices: number[] = [];
  let base = 0;
  for (const p of parts) {
    const idx = p.index!.array;
    for (let i = 0; i < idx.length; i++) indices.push(idx[i] + base);
    base += p.attributes.position.count;
  }
  out.setIndex(indices);
  for (const p of parts) p.dispose();
  return out;
}
