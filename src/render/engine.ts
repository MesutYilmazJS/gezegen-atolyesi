import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PlanetReport } from '../sim/physics';
import type { PlanetSettings } from '../state/settings';
import { AsteroidFlyby, ImpactAnimation, Moons, Probe, Satellites, Starfield, SunBillboard } from './environment';
import { PlanetSystem, Quality } from './planetSystem';
import { SurfaceView } from './surfaceView';

export type QualityMode = Quality | 'auto';

const PIXEL_RATIO: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

export interface EngineOptions {
  onQualityDropped?: (q: Quality) => void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly planet: PlanetSystem;

  private sunDir = new THREE.Vector3(-0.85, 0.3, 0.55).normalize();
  /** Çift yıldızda ikinci güneşin yönü */
  private sun2Dir = new THREE.Vector3(-0.35, 0.12, 0.93).normalize();
  private sunLight: THREE.DirectionalLight;
  private sun2Light: THREE.DirectionalLight;
  private sun2: SunBillboard;
  private satellites = new Satellites();
  private probe = new Probe();
  private impact = new ImpactAnimation();
  private satelliteAmount = 0;
  readonly surface: SurfaceView;
  private stars: Starfield;
  private sun: SunBillboard;
  private moons = new Moons();
  private asteroid = new AsteroidFlyby();
  private clock = new THREE.Clock();
  private elapsed = 0;

  private qualityMode: QualityMode = 'auto';
  private quality: Quality = 'high';
  private batterySaver = false;
  private reduceMotion = false;
  private settings?: PlanetSettings;

  // Otomatik kalite için kare süresi ölçümü
  private fpsFrames = 0;
  private fpsTime = 0;
  private warmup = 2.5;
  private lastFrame = 0;

  // Odaklanma animasyonu
  private focusFrom = 0;
  private focusTo = 0;
  private focusT = 1;

  constructor(
    private container: HTMLElement,
    private opts: EngineOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x02030a);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
    this.camera.position.set(0.6, 0.9, 4.3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 30;

    this.planet = new PlanetSystem(this.renderer, this.sunDir, this.sun2Dir);
    this.surface = new SurfaceView(this.renderer.domElement);
    this.stars = new Starfield(2500);
    this.sun = new SunBillboard(this.sunDir);
    this.sun2 = new SunBillboard(this.sun2Dir);
    this.sun2.mesh.visible = false;
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(10);
    this.sun2Light = new THREE.DirectionalLight(0xffffff, 0);
    this.sun2Light.position.copy(this.sun2Dir).multiplyScalar(10);

    this.scene.add(
      this.stars.points,
      this.sun.mesh,
      this.sun2.mesh,
      this.planet.root,
      this.moons.group,
      this.asteroid.group,
      this.satellites.points,
      this.probe.group,
      this.impact.group,
      this.sunLight,
      this.sun2Light,
      new THREE.AmbientLight(0xffffff, 0.04),
    );

    // Mobilde varsayılan olarak orta kalite ile başla
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.quality = coarse ? 'medium' : 'high';
    this.applyQuality();

    this.renderer.domElement.addEventListener('dblclick', () => this.focus());
    this.setupDoubleTap();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** Gezegeni yeni ayarlarla günceller */
  apply(s: PlanetSettings, report: PlanetReport, instant = false) {
    const prev = this.settings;
    const seedChanged = prev?.seed !== s.seed || prev?.rings.enabled !== s.rings.enabled || prev?.kind !== s.kind;
    this.settings = s;
    this.planet.bake(s.seed, this.quality, s.tectonics);
    this.planet.apply(s, report, instant);
    this.sun.apply(s, report);
    this.sunLight.color.setRGB(...report.visual.starColor);
    const v = report.visual;
    this.sun2.mesh.visible = v.star2Strength > 0;
    this.sun2.apply(s, report, 0.6, v.star2Color);
    this.sun2Light.color.setRGB(...v.star2Color);
    this.sun2Light.intensity = 2.2 * v.star2Strength;
    this.satelliteAmount = v.satellites;
    const R = Math.sqrt(s.size);
    const ringR = s.rings.enabled ? this.planet.ringOuter || R * 2.5 : 0;
    this.moons.apply(s, R, ringR);
    this.controls.minDistance = R * 1.25;
    if (seedChanged || instant) this.focus(instant);
  }

  /** Kamerayı gezegeni ve halkalarını gösterecek uzaklığa getirir */
  focus(instant = false) {
    const s = this.settings;
    const R = s ? Math.sqrt(s.size) : 1;
    const ringR = s?.rings.enabled ? this.planet.ringOuter || R * 3 : 0;
    // Gezegen (ve halkalar) ekranın dar kenarına sığacak uzaklık
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const fit = Math.max(R * 1.2, ringR * 1.02);
    const target = fit / Math.sin(Math.min(halfV, halfH)) * 1.1;
    const dist = this.camera.position.length();
    if (instant) {
      this.camera.position.setLength(target);
      this.focusT = 1;
    } else {
      this.focusFrom = dist;
      this.focusTo = target;
      this.focusT = 0;
    }
  }

  /** Yüzey görünümüne geç */
  enterSurface(s: PlanetSettings, report: PlanetReport) {
    this.controls.enabled = false;
    return this.surface.enter(s, report);
  }

  exitSurface() {
    this.surface.exit();
    this.controls.enabled = true;
  }

  /** Göktaşının gezegene çarpma animasyonu; dir nesne uzayında çarpma noktası */
  playImpact(dir: [number, number, number], onHit?: () => void) {
    this.planet.root.updateMatrixWorld();
    const p = this.planet.spinGroup.localToWorld(new THREE.Vector3(...dir).normalize());
    this.impact.play(p, this.planet.radius, onHit);
  }

  /** Yüksek çözünürlüklü fotoğraf (PNG) */
  async photo(scale = 2): Promise<Blob | null> {
    const prev = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(Math.min(3, (window.devicePixelRatio || 1) * scale));
    this.resize();
    if (this.surface.active) this.renderer.render(this.surface.scene, this.surface.camera);
    else this.renderer.render(this.scene, this.camera);
    const blob = await new Promise<Blob | null>((res) => this.renderer.domElement.toBlob(res, 'image/png'));
    this.renderer.setPixelRatio(prev);
    this.resize();
    return blob;
  }

  setQualityMode(mode: QualityMode) {
    this.qualityMode = mode;
    if (mode !== 'auto') this.quality = mode;
    this.warmup = 2.5;
    this.applyQuality();
  }

  getQuality(): Quality {
    return this.quality;
  }

  setBatterySaver(on: boolean) {
    this.batterySaver = on;
    this.applyQuality();
  }

  setReduceMotion(on: boolean) {
    this.reduceMotion = on;
  }

  /** Albüm için küçük bir görüntü üretir */
  capture(size = 240): string {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const side = Math.min(src.width, src.height);
    ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  private applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    let pr = Math.min(dpr, PIXEL_RATIO[this.quality]);
    if (this.batterySaver) pr = Math.min(pr, 1);
    this.renderer.setPixelRatio(pr);
    this.stars.setPixelRatio(pr);
    this.planet.setQuality(this.quality);
    if (this.settings) this.planet.bake(this.settings.seed, this.quality, this.settings.tectonics);
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Dar (dikey) ekranda gezegen sığsın diye görüş açısını genişlet
    this.camera.fov = w / h < 0.8 ? 52 : 40;
    this.camera.updateProjectionMatrix();
    this.surface?.resize(w / h);
  }

  private setupDoubleTap() {
    let last = 0;
    this.renderer.domElement.addEventListener('touchend', (e) => {
      if (e.touches.length > 0) return;
      const now = performance.now();
      if (now - last < 300) this.focus();
      last = now;
    });
  }

  private frame(now: number) {
    // Pil tasarrufunda en fazla 30 kare/sn
    if (this.batterySaver && now - this.lastFrame < 1000 / 31) return;
    this.lastFrame = now;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const motion = this.reduceMotion ? 0.15 : 1;
    this.elapsed += dt * motion;

    if (this.focusT < 1) {
      this.focusT = Math.min(1, this.focusT + dt * 1.5);
      const k = 1 - Math.pow(1 - this.focusT, 3);
      this.camera.position.setLength(this.focusFrom + (this.focusTo - this.focusFrom) * k);
    }

    if (this.surface.active) {
      this.surface.update(dt);
      this.renderer.render(this.surface.scene, this.surface.camera);
      return;
    }

    this.controls.update();
    this.planet.update(dt, this.elapsed, motion);
    this.moons.update(this.elapsed, 1);
    this.asteroid.update(dt, motion);
    const R = this.planet.radius;
    this.satellites.update(this.elapsed, R, this.satelliteAmount, 1);
    this.probe.update(this.elapsed, R, this.planet.ringOuter, 1);
    this.impact.update(dt, R);
    this.sun.update(this.camera);
    this.sun2.update(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.measure(dt);
  }

  private measure(dt: number) {
    if (this.qualityMode !== 'auto' || this.batterySaver) return;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 2.5) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    const idx = QUALITY_ORDER.indexOf(this.quality);
    if (fps < 38 && idx > 0) {
      this.quality = QUALITY_ORDER[idx - 1];
      this.warmup = 2.5;
      this.applyQuality();
      this.opts.onQualityDropped?.(this.quality);
    }
  }
}
