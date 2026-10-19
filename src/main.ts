import './style.css';
import { SoundEngine } from './audio/sound';
import { BADGES } from './game/badges';
import { INFO_TO_ENTRY, discoveredBy } from './game/encyclopedia';
import { MISSIONS, MissionId, lockedBy } from './game/missions';
import { loadProgress, saveProgress } from './game/progress';
import { REAL_PLANETS, RealPlanetId } from './game/realPlanets';
import { t } from './i18n';
import { Engine } from './render/engine';
import { DISASTERS, PlanetReport, computeReport } from './sim/physics';
import { DisasterType, PlanetSettings, defaultSettings, randomSettings } from './state/settings';
import { loadAlbum, loadCurrent, loadPrefs, Prefs, saveCurrent, savePrefs, saveToAlbum } from './state/storage';
import {
  openAlbum,
  openBadges,
  openEncyclopedia,
  openMenu,
  openMissions,
  openOptions,
  openRealPlanets,
} from './ui/dialogs';
import { h, toast } from './ui/dom';
import { createReportPanel } from './ui/reportPanel';
import { createSettingsPanel, Patch, SectionId, SECTIONS } from './ui/settingsPanel';
import { createTimeline } from './ui/timeline';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

let settings: PlanetSettings = loadCurrent() ?? defaultSettings();
let report: PlanetReport = computeReport(settings);
let prefs: Prefs = loadPrefs();
const progress = loadProgress();

document.title = t.appName;

// --- 3B sahne ve ses ---
const engine = new Engine($('#viewport'), {
  onQualityDropped: () => toast(t.qualityDropped),
});
const sound = new SoundEngine();

// --- Arayüz ---
const nameInput = $<HTMLInputElement>('#planet-name');
nameInput.placeholder = t.planetNamePlaceholder;
nameInput.addEventListener('input', () => {
  settings = { ...settings, name: nameInput.value.slice(0, 40) };
  scheduleSave();
});

const isLocked = (key: string) => (prefs.mode === 'missions' ? lockedBy(key, progress.completedMissions) : null);

const settingsPanel = createSettingsPanel(
  $('#settings-body'),
  {
    onChange: (p) => {
      playPatchSound(p);
      update(p);
    },
    onDisaster: triggerDisaster,
    onClearDisasters: () => {
      update({ events: [] });
      toast(t.disastersCleared);
    },
    onInfo: (key) => discover(INFO_TO_ENTRY[key]),
  },
  isLocked,
);
const reportPanel = createReportPanel($('#report-body'));
const timeline = createTimeline($('#timeline'), (time) => update({ time }));

$('#btn-random').append(t.random);
$('#btn-save').append(t.save);
$('#btn-album').append(t.album);
$('#btn-more').setAttribute('aria-label', t.more);
$('#btn-random').addEventListener('click', randomize);
$('#btn-save').addEventListener('click', save);
$('#btn-album').addEventListener('click', album);
$('#btn-more').addEventListener('click', (e) => openMoreMenu(e.currentTarget as HTMLElement));
$('#report-title').textContent = t.catReport;
$('#app-title').textContent = t.appName;

// Mod seçici (Serbest / Görevler)
const modeSwitch = $('#mode-switch');
for (const m of ['free', 'missions'] as const) {
  modeSwitch.append(
    h('button', { type: 'button', class: 'mode-btn', 'data-mode': m, onclick: (() => setMode(m)) as EventListener }, t.modes[m]),
  );
}

// Görev göstergesi
const missionHud = $('#mission-hud');
missionHud.addEventListener('click', missions);

// Mobil: alttaki sekmeler ayarları ve raporu çekmecede açar
type Tab = SectionId | 'report';
let activeTab: Tab | null = null;
const tabs = $('#mobile-tabs');
const tabDefs: { id: Tab; label: string }[] = [...SECTIONS, { id: 'report', label: t.catReport }];
for (const d of tabDefs) {
  tabs.append(h('button', { type: 'button', class: 'tab', 'data-tab': d.id, onclick: (() => selectTab(d.id)) as EventListener }, d.label));
}
$('#sheet-handle').addEventListener('click', () => selectTab(null));

function selectTab(tab: Tab | null) {
  activeTab = tab === activeTab ? null : tab;
  document.body.dataset.sheet = activeTab === null ? '' : activeTab === 'report' ? 'report' : 'settings';
  if (activeTab && activeTab !== 'report') settingsPanel.showSection(activeTab);
  tabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === activeTab));
}
settingsPanel.showSection('star');

// --- Durum güncelleme ---
let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveCurrent(settings), 400);
}

function update(patch: Patch, instant = false) {
  settings = {
    ...settings,
    ...patch,
    rings: { ...settings.rings, ...(patch.rings ?? {}) },
    composition: { ...settings.composition, ...(patch.composition ?? {}) },
  };
  render(instant);
  scheduleSave();
}

function setSettings(s: PlanetSettings) {
  timeline.stop();
  settings = s;
  render();
  scheduleSave();
}

function render(instant = false) {
  report = computeReport(settings);
  engine.apply(settings, report, instant);
  settingsPanel.sync(settings, report);
  reportPanel.update(report);
  timeline.update(settings.time, report);
  timeline.setEvents(settings.events);
  if (document.activeElement !== nameInput) nameInput.value = settings.name;
  const v = report.visual;
  sound.setAmbience(v.oceanFill * Math.min(1, settings.water * 1.4) * (1 - v.seaIce), Math.max(settings.wind, v.storms * 0.6) * (report.pressure > 0.01 ? 1 : 0.1), Math.max(v.lava, v.molten));
  evaluateProgress();
}

function playPatchSound(p: Patch) {
  if ('water' in p || 'oceanType' in p) sound.play('water');
  else if ('wind' in p || 'storms' in p || 'atmosphere' in p) sound.play('wind');
  else if ('volcanism' in p || 'tectonics' in p) sound.play('lava');
  else sound.play('click');
}

// --- Görevler, rozetler, ansiklopedi ---
function evaluateProgress() {
  let changed = false;
  // Aktif görev
  if (prefs.mode === 'missions' && progress.activeMission) {
    const m = MISSIONS.find((x) => x.id === progress.activeMission);
    if (m) {
      const done = m.goals.map((g) => g.test(settings, report));
      renderMissionHud(m.id, done);
      if (done.every(Boolean)) {
        if (!progress.completedMissions.includes(m.id)) progress.completedMissions.push(m.id);
        progress.activeMission = null;
        changed = true;
        sound.play('success');
        toast(t.missionComplete(t.missions[m.id].name));
        celebrate();
        renderMissionHud(null, []);
        // Yeni açılan ayarları göster
        settingsPanel.sync(settings, report);
      }
    }
  } else {
    renderMissionHud(null, []);
  }

  // Rozetler
  const ctx = { settings, report, albumCount: loadAlbum().length, realViewed: progress.realViewed };
  for (const b of BADGES) {
    if (progress.badges.includes(b.id) || !b.test(ctx)) continue;
    progress.badges.push(b.id);
    changed = true;
    sound.play('success');
    toast(t.badgeEarned(t.badges[b.id].name));
  }

  // Ansiklopedi
  for (const id of discoveredBy(settings, report)) {
    if (discover(id, false)) changed = true;
  }
  if (changed) saveProgress(progress);
}

function discover(id: string | undefined, save = true): boolean {
  if (!id || progress.discovered.includes(id)) return false;
  progress.discovered.push(id);
  const entry = t.entries[id as keyof typeof t.entries];
  if (entry) toast(t.newEntry(entry.title));
  if (save) saveProgress(progress);
  return true;
}

function renderMissionHud(id: MissionId | null, done: boolean[]) {
  missionHud.hidden = prefs.mode !== 'missions';
  missionHud.innerHTML = '';
  if (!id) {
    missionHud.append(h('span', { class: 'hud-icon' }, '🎯'), h('span', {}, t.missionNone));
    return;
  }
  const m = MISSIONS.find((x) => x.id === id)!;
  missionHud.append(
    h('span', { class: 'hud-icon' }, '🎯'),
    h(
      'span',
      { class: 'hud-body' },
      h('strong', {}, t.missions[id].name),
      h('span', { class: 'hud-goals' }, ...m.goals.map((g, i) => h('span', { class: `goal ${done[i] ? 'ok' : ''}` }, `${done[i] ? '✓' : '○'} ${g.label}`))),
    ),
  );
}

function celebrate() {
  const el = h('div', { class: 'celebrate', 'aria-hidden': 'true' });
  for (let i = 0; i < 28; i++) {
    el.append(h('span', { style: `--x:${Math.random() * 100}%;--d:${0.6 + Math.random() * 0.9}s;--h:${Math.floor(Math.random() * 360)}` }));
  }
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}

function setMode(mode: Prefs['mode']) {
  prefs = { ...prefs, mode };
  savePrefs(prefs);
  modeSwitch.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode));
  render();
  if (mode === 'missions' && !progress.activeMission) missions();
}

function missions() {
  openMissions(progress, (id) => {
    // Önce görevi ve başlangıç gezegenini ata; değerlendirme yeni gezegenle yapılsın
    progress.activeMission = id;
    saveProgress(progress);
    const m = MISSIONS.find((x) => x.id === id)!;
    if (m.start) {
      timeline.stop();
      settings = m.start();
      scheduleSave();
    }
    if (prefs.mode !== 'missions') setMode('missions');
    else render();
  });
}

// --- Felaketler ---
function triggerDisaster(type: DisasterType) {
  if (report.young || settings.time < 0.1) {
    toast(t.disasterTooEarly);
    return;
  }
  // Toparlanmayı izlemek için zaman çizelgesinde yer bırak
  const room = type === 'runaway' ? 0.06 : Math.min(DISASTERS[type].recovery + 0.02, 0.14);
  const time = Math.min(settings.time, 1 - room);
  const event = { type, time, seed: Math.floor(Math.random() * 1e9) };
  update({ events: [...settings.events, event].slice(-12), time });
  toast(t.disasterTriggered(t.disasterNames[type]));
  if (type === 'asteroid') {
    const imp = report.visual.impacts[report.visual.impacts.length - 1];
    // Çarpmayı göster, sonra zamanı ilerlet
    timeline.stop();
    sound.play('whoosh');
    update({ time: Math.max(0.1, time - 0.0001) });
    engine.playImpact(imp?.dir ?? [0, 0, 1], () => {
      sound.play('impact');
      update({ time });
      timeline.play(0.3);
    });
    return;
  }
  sound.play(type === 'supervolcano' ? 'lava' : type === 'flare' ? 'whoosh' : type === 'iceAge' ? 'wind' : 'lava');
  timeline.play(0.3);
}

// --- Üst çubuk eylemleri ---
function randomize() {
  sound.play('whoosh');
  setSettings(randomSettings());
}

function save() {
  const ok = saveToAlbum({
    name: settings.name || t.newPlanetNamed,
    score: report.habitability,
    thumbnail: engine.capture(),
    settings,
  });
  toast(ok ? t.saved : t.saveFailed);
  if (ok) sound.play('click');
  evaluateProgress();
}

function album() {
  openAlbum((p) => {
    setSettings(p.settings);
    toast(t.loaded);
  });
}

function options() {
  openOptions(prefs, (p) => {
    prefs = { ...prefs, ...p };
    savePrefs(prefs);
    applyPrefs();
  });
}

function realPlanets() {
  openRealPlanets(progress, (id: RealPlanetId) => {
    const p = REAL_PLANETS.find((x) => x.id === id)!;
    if (prefs.mode === 'missions') setMode('free');
    setSettings(p.settings());
    toast(t.realLoaded(t.realPlanets[id].name));
    if (!progress.realViewed.includes(id)) {
      progress.realViewed.push(id);
      saveProgress(progress);
      evaluateProgress();
    }
  });
}

function openMoreMenu(anchor: HTMLElement) {
  openMenu(anchor, [
    prefs.mode === 'missions'
      ? { icon: '🎨', label: t.modes.free, action: () => setMode('free') }
      : { icon: '🎯', label: t.missionsTitle, action: missions },
    { icon: '🌍', label: t.realTitle, action: realPlanets },
    { icon: '🏅', label: t.badgesTitle, action: () => openBadges(progress) },
    { icon: '📖', label: t.encyclopedia, action: () => openEncyclopedia(progress) },
    { icon: '🏞', label: t.surfaceView, action: enterSurface },
    { icon: '📷', label: t.photoMode, action: enterPhotoMode },
    { icon: '⚙', label: t.options, action: options },
  ]);
}

// --- Yüzey görünümü ---
const surfaceBar = $('#surface-bar');
surfaceBar.append(
  h('button', { type: 'button', class: 'btn', onclick: (() => takePhoto()) as EventListener }, '📷'),
  h('button', { type: 'button', class: 'btn primary', onclick: (() => exitSurface()) as EventListener }, '🪐 ', t.surfaceExit),
);

function enterSurface() {
  if (settings.kind === 'gas') {
    toast(t.surfaceNoSurface);
    return;
  }
  timeline.stop();
  selectTab(null);
  document.body.classList.add('surface-mode');
  sound.play('whoosh');
  engine.enterSurface(settings, report);
}

function exitSurface() {
  document.body.classList.remove('surface-mode');
  engine.exitSurface();
}

// --- Fotoğraf modu ---
const photoBar = $('#photo-bar');
photoBar.append(
  h('span', { class: 'photo-hint' }, t.photoHint),
  h('button', { type: 'button', class: 'btn primary', onclick: (() => takePhoto()) as EventListener }, '📷 ', t.photoTake),
  h('button', { type: 'button', class: 'btn', onclick: (() => exitPhotoMode()) as EventListener }, t.photoExit),
);

function enterPhotoMode() {
  timeline.stop();
  document.body.classList.add('photo-mode');
  selectTab(null);
}

function exitPhotoMode() {
  document.body.classList.remove('photo-mode');
}

async function takePhoto() {
  sound.play('shutter');
  const blob = await engine.photo(2);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${(settings.name || 'gezegen').replace(/[^\p{L}\p{N}_-]+/gu, '-')}.png` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(t.photoSaved);
}

function applyPrefs() {
  engine.setQualityMode(prefs.quality);
  engine.setBatterySaver(prefs.batterySaver);
  engine.setReduceMotion(prefs.reduceMotion);
  sound.setEnabled(prefs.music, prefs.effects);
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.classList.toggle('large-text', prefs.largeText);
  document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);
  modeSwitch.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.mode === prefs.mode));
}

// --- Klavye kısayolları ---
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  if (tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.modal-backdrop')) return;
  if (e.key === 'Escape' && document.body.classList.contains('photo-mode')) {
    exitPhotoMode();
    return;
  }
  if (e.key === 'Escape' && document.body.classList.contains('surface-mode')) {
    exitSurface();
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'r':
      randomize();
      break;
    case 's':
      save();
      break;
    case 'a':
      album();
      break;
    case 'g':
      missions();
      break;
    case 'p':
      if (document.body.classList.contains('photo-mode')) takePhoto();
      else enterPhotoMode();
      break;
    case 'f':
      engine.focus();
      break;
    case 'y':
      if (document.body.classList.contains('surface-mode')) exitSurface();
      else enterSurface();
      break;
    case 'h':
      document.body.classList.toggle('ui-hidden');
      break;
    case ' ':
      if (tag === 'BUTTON') return;
      e.preventDefault();
      timeline.toggle();
      break;
    case 'arrowright':
      if (tag === 'INPUT') return;
      timeline.step(0.02);
      break;
    case 'arrowleft':
      if (tag === 'INPUT') return;
      timeline.step(-0.02);
      break;
    default:
      return;
  }
});

applyPrefs();
render(true);

// --- PWA: çevrimdışı çalışma ---
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then(async (reg) => {
      await navigator.serviceWorker.ready;
      // İlk ziyarette yüklenen dosyaları da önbelleğe al
      const urls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin));
      reg.active?.postMessage({ type: 'cache', urls: [location.href, ...urls] });
      if (!localStorage.getItem('gezegen-atolyesi:offline')) {
        localStorage.setItem('gezegen-atolyesi:offline', '1');
        toast(t.offlineReady);
      }
    })
    .catch((err) => console.warn('Service worker kaydedilemedi', err));
}
