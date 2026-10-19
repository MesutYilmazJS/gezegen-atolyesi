// "Yüzeyden bak" modu: gezegenin durumuna uygun Blender manzarası + kodla çizilen gökyüzü.
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlanetReport, RGB } from '../sim/physics';
import { PlanetSettings, rng } from '../state/settings';
import { commonGLSL } from './shaders/planet';

export type Biome = 'desert' | 'ice' | 'shore' | 'volcanic' | 'forest';

const BASE = import.meta.env.BASE_URL;
const linear = (c: RGB) => new THREE.Color(Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2));

/** Gözlemcinin bulunduğu enlem (halkaların gökyüzündeki konumunu belirler) */
const LATITUDE = THREE.MathUtils.degToRad(32);

export function pickBiome(s: PlanetSettings, r: PlanetReport): Biome {
  const v = r.visual;
  if (r.young || v.molten > 0.3 || v.lava > 0.6) return 'volcanic';
  if ((r.waterState === 'frozen' && s.water > 0.2) || v.iceLine < 0.45) return 'ice';
  if (s.water >= 0.9 && r.waterState === 'liquid') return 'shore';
  if (v.vegetation > 0.25) return 'forest';
  if (r.waterState === 'liquid' && s.water > 0.35) return 'shore';
  return 'desert';
}

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
uniform vec3 uSky;
uniform vec3 uHorizon;
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

${commonGLSL}

float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  // Ufukta daha açık, tepede daha koyu gökyüzü
  vec3 col = mix(uHorizon, uSky, smoothstep(-0.02, 0.55, up));
  float skyLum = dot(col, vec3(0.3, 0.5, 0.2));

  // Yıldızlar (ince atmosferde gündüz de görünür)
  float starVis = 1.0 - smoothstep(0.02, 0.18, skyLum);
  float st = step(0.9975, hash3(floor(d * 420.0)));
  col += vec3(st) * starVis * 0.9;

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
        col = mix(col, rc, dens * smoothstep(-0.02, 0.05, d.y) * mix(0.55, 1.0, starVis));
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
      float lit = clamp(dot(-n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
      lit = smoothstep(0.35, 0.65, lit);
      vec3 mc = vec3(0.55, 0.53, 0.5) * (0.85 + 0.3 * hash3(floor(d * 900.0))) * uSunColor * lit;
      float edge = smoothstep(rad, rad * 0.94, ang);
      col = mix(col, mc + col * 0.15, edge * mix(0.65, 1.0, starVis));
    }
  }

  // Güneşler: disk + hale
  float s1 = dot(d, uSunDir);
  float a1 = acos(clamp(s1, -1.0, 1.0));
  col += uSunColor * (smoothstep(uSunSize, uSunSize * 0.8, a1) * 6.0 + pow(max(s1, 0.0), 300.0) * 1.5 + pow(max(s1, 0.0), 12.0) * 0.25 * uHaze);
  float s2 = dot(d, uSun2Dir);
  float a2 = acos(clamp(s2, -1.0, 1.0));
  col += uSun2Color * (smoothstep(uSun2Size, uSun2Size * 0.8, a2) * 6.0 + pow(max(s2, 0.0), 300.0) * 1.5 + pow(max(s2, 0.0), 12.0) * 0.25 * uHaze);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

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
  private drag: { x: number; y: number } | null = null;
  private lavaMats: THREE.MeshStandardMaterial[] = [];
  private waterMats: THREE.MeshStandardMaterial[] = [];
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
        uSky: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
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
      },
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.skyMat);
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    this.scene.add(sky, this.sun1, this.sun2, this.hemi);
    this.camera.position.set(0, 1.7, 0);
    this.camera.rotation.order = 'YXZ';

    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.active || !this.drag) return;
      this.yaw += (e.clientX - this.drag.x) * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.drag.y) * 0.003, -0.4, 1.3);
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

  async enter(s: PlanetSettings, r: PlanetReport) {
    this.active = true;
    this.yaw = 0;
    this.pitch = 0.08;
    const biome = pickBiome(s, r);
    const token = ++this.loadToken;
    const model = await this.load(biome);
    if (token !== this.loadToken || !this.active) return;
    if (this.current) this.scene.remove(this.current);
    this.current = model;
    if (model) this.scene.add(model);
    this.applyLook(s, r, biome);
  }

  exit() {
    this.active = false;
    this.loadToken++;
  }

  update(dt: number) {
    this.time += dt;
    this.camera.rotation.set(this.pitch, -this.yaw, 0);
    this.skyMat.uniforms.uTime.value = this.time;
    for (const m of this.lavaMats) m.emissiveIntensity = 1.6 + Math.sin(this.time * 2.0) * 0.4;
    for (const m of this.waterMats) m.roughness = 0.2 + Math.sin(this.time * 1.3) * 0.05;
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

  private applyLook(s: PlanetSettings, r: PlanetReport, biome: Biome) {
    const v = r.visual;
    const sunColor = new THREE.Color(...v.starColor);
    const sky = linear(v.skyColor);
    const thin = r.pressure < 0.0025;

    // Güneş konumu: kilitli dönüşte ufka yakın, değilse öğleden sonra
    const sunEl = s.tidalLock ? 0.12 : 0.42;
    const sunAz = 0.25;
    const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl)).normalize();
    const sun2Dir = new THREE.Vector3(Math.sin(sunAz - 0.5) * Math.cos(sunEl + 0.1), Math.sin(sunEl + 0.1), -Math.cos(sunAz - 0.5)).normalize();
    const apparent = r.star.radius / s.distance;
    const sunSize = THREE.MathUtils.clamp(0.0093 * apparent * 1.6, 0.003, 0.3);

    const u = this.skyMat.uniforms;
    u.uSky.value.copy(thin ? new THREE.Color(0.005, 0.006, 0.012) : sky.clone().multiplyScalar(0.55 + 0.3 * v.haze));
    u.uHorizon.value.copy(thin ? new THREE.Color(0.03, 0.025, 0.02) : sky.clone().lerp(new THREE.Color(1, 1, 1).multiply(sunColor), 0.45).multiplyScalar(0.9));
    u.uHaze.value = v.haze;
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunColor);
    u.uSunSize.value = sunSize;
    u.uSun2Dir.value.copy(sun2Dir);
    u.uSun2Color.value.setRGB(...v.star2Color).multiplyScalar(v.star2Strength);
    u.uSun2Size.value = sunSize * 0.6;

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
      const az = -0.9 + i * 0.8 + rr() * 0.3;
      const el = 0.25 + rr() * 0.45;
      (u.uMoonDir.value as THREE.Vector3[])[i].set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      (u.uMoonSize.value as number[])[i] = 0.012 + s.moonSizes[i] * 0.05;
    }

    // Işıklar
    this.sun1.position.copy(sunDir).multiplyScalar(100);
    this.sun1.color.copy(sunColor);
    this.sun1.intensity = 2.6;
    this.sun2.position.copy(sun2Dir).multiplyScalar(100);
    this.sun2.color.setRGB(...v.star2Color);
    this.sun2.intensity = 2.6 * v.star2Strength;
    this.hemi.color.copy(thin ? new THREE.Color(0.1, 0.1, 0.12) : sky);
    this.hemi.intensity = 0.25 + v.haze * 0.6;

    // Sis: kalın atmosferde ufuk puslu
    const fogColor = u.uHorizon.value.clone();
    this.scene.fog = thin ? null : new THREE.Fog(fogColor, 25 - v.haze * 15, 140 - v.haze * 80);

    this.recolor(s, r, biome);
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
    const ocean: Record<string, RGB> = { salt: [0.1, 0.38, 0.5], fresh: [0.12, 0.42, 0.42], methane: [0.3, 0.2, 0.1] };
    const plantsOn = v.vegetation > 0.1 || biome === 'forest';
    // Düşük yerçekiminde bitkiler uzar
    const plantScale = THREE.MathUtils.clamp(1 / Math.sqrt(Math.max(r.gravity, 0.15)), 0.6, 2.4);
    this.lavaMats = [];
    this.waterMats = [];

    this.current.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = mat;
      const name = mesh.name.toLowerCase();
      if (name.startsWith('ground')) {
        if (biome === 'forest') mat.color.copy(rock).lerp(veg, 0.75 * Math.min(1, v.vegetation + 0.3));
        else if (biome === 'ice') mat.color.setRGB(0.85, 0.9, 0.97);
        else if (biome === 'volcanic') mat.color.setRGB(0.04, 0.035, 0.03);
        else if (biome === 'desert') mat.color.copy(linear(s.mineral === 'basalt' ? [0.82, 0.66, 0.45] : minerals[s.mineral]));
        else mat.color.copy(linear([0.82, 0.74, 0.55]));
        mat.vertexColors = true;
      } else if (name.startsWith('rocks')) {
        mat.color.copy(biome === 'volcanic' ? new THREE.Color(0.02, 0.018, 0.016) : rock);
      } else if (name.startsWith('plants')) {
        mesh.visible = plantsOn;
        mat.color.copy(veg);
        mesh.scale.y = plantScale;
      } else if (name.startsWith('trunks')) {
        mesh.visible = plantsOn;
        mesh.scale.y = plantScale;
      } else if (name.startsWith('water')) {
        const frozen = r.waterState === 'frozen';
        mesh.visible = r.waterState === 'liquid' || frozen;
        mat.color.copy(frozen ? new THREE.Color(0.75, 0.85, 0.95) : linear(ocean[s.oceanType]));
        // Ortam haritası olmadığından gökyüzü yansımasını kendi ışımasıyla taklit et
        mat.metalness = 0;
        mat.roughness = frozen ? 0.5 : 0.2;
        mat.emissive.copy(linear(v.skyColor)).multiplyScalar(frozen ? 0.05 : 0.35);
        if (!frozen) this.waterMats.push(mat);
      } else if (name.startsWith('lava')) {
        mat.emissive.setRGB(1, 0.32, 0.05);
        mat.emissiveIntensity = 1.8;
        this.lavaMats.push(mat);
      } else if (name.startsWith('ice')) {
        mat.color.setRGB(0.75, 0.87, 1);
        mat.roughness = 0.15;
      }
    });
  }
}
