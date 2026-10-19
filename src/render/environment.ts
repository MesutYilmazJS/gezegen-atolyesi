// Gezegenin etrafındaki her şey: yıldızlı arka plan, yıldızın kendisi, aylar ve göktaşı.
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlanetReport } from '../sim/physics';
import { PlanetSettings, rng } from '../state/settings';

const BASE = import.meta.env.BASE_URL;

let loader: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (!loader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(`${BASE}draco/`);
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
  }
  return loader;
}

async function loadModel(name: string): Promise<THREE.Object3D | null> {
  try {
    const gltf = await gltfLoader().loadAsync(`${BASE}models/${name}.glb`);
    return gltf.scene;
  } catch (e) {
    console.warn(`Model yüklenemedi: ${name}`, e);
    return null;
  }
}

/** Model yüklenemezse kullanılacak basit, düzensiz kaya */
function fallbackRock(seed: number): THREE.Object3D {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const r = rng(seed);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const bumps = Array.from({ length: 6 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let d = 1;
    for (const b of bumps) d += Math.max(0, v.dot(b)) * 0.12 * (r() * 0.2 + 0.9);
    v.multiplyScalar(d);
    v.x *= 1.15;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6b6460, roughness: 1 }));
}

export class Starfield {
  readonly points: THREE.Points;

  constructor(count: number) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const r = rng(42);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      // Samanyolu benzeri bir şeritte daha fazla yıldız
      const band = r() < 0.35;
      const y = band ? (r() - 0.5) * 0.25 : u;
      const sy = band ? Math.sqrt(1 - y * y) : s;
      positions.set([Math.cos(th) * sy * 500, y * 500, Math.sin(th) * sy * 500], i * 3);
      const temp = r();
      c.setRGB(temp < 0.2 ? 1 : 0.8 + temp * 0.2, 0.85 + temp * 0.1, temp > 0.7 ? 1 : 0.8 + temp * 0.15);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = Math.pow(r(), 6) * 3.2 + 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          gl_PointSize = size * uPixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  setPixelRatio(pr: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pr;
  }
}

/** Uzaktaki yıldız: kameraya dönük, parlak bir disk ve halesi */
export class SunBillboard {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(private dir: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 0.95, 0.85) }, uCore: { value: 0.12 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uCore;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float core = smoothstep(uCore, uCore * 0.7, d);
          float glow = pow(max(1.0 - d, 0.0), 3.0) * 0.6;
          vec3 col = mix(uColor * glow, vec3(1.0), core) + uColor * core;
          gl_FragColor = vec4(col, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.position.copy(dir).multiplyScalar(300);
  }

  apply(s: PlanetSettings, report: PlanetReport, scale = 1, color?: [number, number, number]) {
    const apparent = (report.star.radius / s.distance) * scale; // Dünya'dan Güneş = 1
    const core = THREE.MathUtils.clamp(0.06 + Math.log10(1 + apparent) * 0.25, 0.04, 0.6);
    const size = THREE.MathUtils.clamp(30 + apparent * 14, 24, 220);
    this.mesh.scale.setScalar(size);
    this.mat.uniforms.uCore.value = core;
    this.mat.uniforms.uColor.value.setRGB(...(color ?? report.visual.starColor));
  }

  update(camera: THREE.Camera) {
    this.mesh.position.copy(this.dir).multiplyScalar(300).add(camera.position);
    this.mesh.quaternion.copy(camera.quaternion);
  }
}

interface MoonState {
  obj: THREE.Object3D;
  radius: number;
  speed: number;
  phase: number;
  incline: number;
  spin: THREE.Vector3;
}

export class Moons {
  readonly group = new THREE.Group();
  private templates: (THREE.Object3D | null)[] = [];
  private moons: MoonState[] = [];
  private lastKey = '';
  private ready: Promise<void>;
  private pending?: { s: PlanetSettings; planetR: number; ringR: number };

  constructor() {
    this.ready = Promise.all(['moon_a', 'moon_b', 'moon_c'].map(loadModel)).then((t) => {
      this.templates = t;
      if (this.pending) this.apply(this.pending.s, this.pending.planetR, this.pending.ringR, true);
    });
  }

  get loaded() {
    return this.ready;
  }

  apply(s: PlanetSettings, planetR: number, ringR: number, force = false) {
    this.pending = { s, planetR, ringR };
    const key = `${s.seed}:${s.moons}:${s.moonSizes.join(',')}:${planetR.toFixed(2)}:${ringR.toFixed(2)}`;
    if (key === this.lastKey && !force) return;
    this.lastKey = key;
    for (const m of this.moons) this.group.remove(m.obj);
    this.moons = [];
    const r = rng(s.seed ^ 0x9e3779b9);
    const base = Math.max(planetR * 2.6, ringR * 1.15);
    const step = Math.min(planetR, 2) * 1.2;
    for (let i = 0; i < s.moons; i++) {
      const tpl = this.templates[i % 3];
      const obj = tpl ? tpl.clone() : fallbackRock(s.seed + i);
      r();
      const size = Math.min(planetR, 1.6) * (0.05 + s.moonSizes[i] * 0.2);
      obj.scale.setScalar(size);
      const radius = base + i * step + r() * step * 0.3;
      this.moons.push({
        obj,
        radius,
        speed: 0.35 / Math.pow(radius / Math.min(planetR, 2), 1.5),
        phase: r() * Math.PI * 2,
        incline: (r() - 0.5) * 0.35,
        spin: new THREE.Vector3(r(), r(), r()).multiplyScalar(0.3),
      });
      this.group.add(obj);
    }
  }

  update(time: number, motion: number) {
    for (const m of this.moons) {
      const a = m.phase + time * m.speed * motion;
      m.obj.position.set(Math.cos(a) * m.radius, Math.sin(a) * m.radius * m.incline, Math.sin(a) * m.radius);
      m.obj.rotation.set(m.spin.x * time * motion, m.spin.y * time * motion + a, m.spin.z * time * motion);
    }
  }
}

/** Arada bir arka plandan geçen göktaşı (felaket animasyonları için hazırlık) */
export class AsteroidFlyby {
  readonly group = new THREE.Group();
  private rock: THREE.Object3D | null = null;
  private start = new THREE.Vector3();
  private end = new THREE.Vector3();
  private t = 1;
  private wait = 12;
  private r = rng(7);

  constructor() {
    loadModel('asteroid').then((m) => {
      this.rock = m ?? fallbackRock(99);
      this.rock.visible = false;
      this.group.add(this.rock);
    });
  }

  update(dt: number, motion: number) {
    if (!this.rock || motion === 0) return;
    if (this.t >= 1) {
      this.rock.visible = false;
      this.wait -= dt;
      if (this.wait > 0) return;
      const r = this.r;
      const dist = 18 + r() * 12;
      const side = r() < 0.5 ? -1 : 1;
      this.start.set(side * 40, (r() - 0.5) * 16, -dist);
      this.end.set(-side * 40, (r() - 0.5) * 16, -dist + (r() - 0.5) * 10);
      this.rock.scale.setScalar(0.25 + r() * 0.35);
      this.t = 0;
      this.wait = 25 + r() * 35;
      this.rock.visible = true;
    }
    this.t += dt / 22;
    this.rock.position.lerpVectors(this.start, this.end, this.t);
    this.rock.rotation.x += dt * 0.4;
    this.rock.rotation.y += dt * 0.25;
  }
}

/** Uzay çağındaki medeniyetin yörüngedeki uyduları: küçük, parlayan noktalar */
export class Satellites {
  readonly points: THREE.Points;
  private orbits: { r: number; inc: THREE.Quaternion; speed: number; phase: number }[] = [];
  private positions: Float32Array;
  private mat: THREE.PointsMaterial;

  constructor(count = 90) {
    const r = rng(1234);
    this.positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const inc = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 2.2, r() * Math.PI, 0));
      this.orbits.push({ r: 1.08 + r() * 0.35 + (r() < 0.15 ? 0.9 : 0), inc, speed: 0.15 + r() * 0.3, phase: r() * Math.PI * 2 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.PointsMaterial({ color: 0xfff1d0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  update(time: number, planetR: number, amount: number, motion: number) {
    this.mat.opacity += (amount - this.mat.opacity) * 0.05;
    this.points.visible = this.mat.opacity > 0.02;
    if (!this.points.visible) return;
    const v = new THREE.Vector3();
    this.orbits.forEach((o, i) => {
      const a = o.phase + time * o.speed * motion;
      v.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r).applyQuaternion(o.inc).multiplyScalar(planetR);
      this.positions.set([v.x, v.y, v.z], i * 3);
    });
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Oyuncunun keşif sondası: gezegenin çevresinde dönen küçük uydu (Blender modeli) */
export class Probe {
  readonly group = new THREE.Group();
  private model: THREE.Object3D | null = null;

  constructor() {
    loadModel('probe').then((m) => {
      this.model = m ?? fallbackProbe();
      this.model.scale.setScalar(0.06);
      this.group.add(this.model);
    });
  }

  update(time: number, planetR: number, ringR: number, motion: number) {
    if (!this.model) return;
    const r = Math.max(planetR * 1.55, ringR > 0 ? planetR * 1.2 : 0);
    const a = time * 0.12 * motion + 1.0;
    this.group.position.set(Math.cos(a) * r, Math.sin(a * 0.7) * r * 0.35, Math.sin(a) * r);
    this.group.lookAt(0, 0, 0);
    this.model.rotation.z = time * 0.1;
  }
}

function fallbackProbe(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.6, roughness: 0.4 }));
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b2a6b, metalness: 0.3, roughness: 0.5 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.7), panelMat);
  p1.position.x = 1.45;
  const p2 = p1.clone();
  p2.position.x = -1.45;
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.25, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide }));
  dish.position.z = 0.6;
  dish.rotation.x = -Math.PI / 2;
  g.add(body, p1, p2, dish);
  return g;
}

/** Göktaşı felaketi: göktaşı uzaydan gelip gezegene çarpar, ardından parlama */
export class ImpactAnimation {
  readonly group = new THREE.Group();
  private rock: THREE.Object3D | null = null;
  private flash: THREE.Mesh;
  private t = 2;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private onHit?: () => void;

  constructor() {
    loadModel('asteroid').then((m) => {
      this.rock = m ?? fallbackRock(5);
      this.rock.visible = false;
      this.group.add(this.rock);
    });
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.visible = false;
    this.group.add(this.flash);
  }

  /** target: çarpma noktası (dünya uzayı) */
  play(target: THREE.Vector3, planetR: number, onHit?: () => void) {
    this.to.copy(target);
    const out = target.clone().normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(out).normalize();
    this.from.copy(target).addScaledVector(out, planetR * 6).addScaledVector(side, planetR * 3);
    this.t = 0;
    this.onHit = onHit;
    if (this.rock) {
      this.rock.visible = true;
      this.rock.scale.setScalar(planetR * 0.09);
    }
    this.flash.scale.setScalar(planetR * 0.05);
  }

  update(dt: number, planetR: number) {
    if (this.t >= 2) return;
    this.t += dt;
    if (this.t < 1.4) {
      const k = this.t / 1.4;
      if (this.rock) {
        this.rock.position.lerpVectors(this.from, this.to, k * k);
        this.rock.rotation.x += dt * 3;
        this.rock.rotation.y += dt * 2;
      }
    } else {
      if (this.rock?.visible) {
        this.rock.visible = false;
        this.onHit?.();
      }
      const k = (this.t - 1.4) / 0.6;
      this.flash.visible = k < 1;
      this.flash.position.copy(this.to);
      this.flash.scale.setScalar(planetR * (0.05 + k * 0.5));
      (this.flash.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    }
  }
}
