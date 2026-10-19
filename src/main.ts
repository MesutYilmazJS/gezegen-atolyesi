import './style.css';
import { t } from './i18n';
import { Engine } from './render/engine';
import { computeReport, PlanetReport } from './sim/physics';
import { defaultSettings, PlanetSettings, randomSettings } from './state/settings';
import { loadCurrent, loadPrefs, Prefs, saveCurrent, savePrefs, saveToAlbum } from './state/storage';
import { openAlbum, openOptions } from './ui/dialogs';
import { h, toast } from './ui/dom';
import { createReportPanel } from './ui/reportPanel';
import { createSettingsPanel, Patch, SectionId, SECTIONS } from './ui/settingsPanel';
import { createTimeline } from './ui/timeline';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

let settings: PlanetSettings = loadCurrent() ?? defaultSettings();
let report: PlanetReport = computeReport(settings);
let prefs: Prefs = loadPrefs();

document.title = t.appName;

// --- 3B sahne ---
const engine = new Engine($('#viewport'), {
  onQualityDropped: () => toast(t.qualityDropped),
});

// --- Arayüz ---
const nameInput = $<HTMLInputElement>('#planet-name');
nameInput.placeholder = t.planetNamePlaceholder;
nameInput.addEventListener('input', () => {
  settings = { ...settings, name: nameInput.value.slice(0, 40) };
  scheduleSave();
});

const settingsPanel = createSettingsPanel($('#settings-body'), (p) => update(p));
const reportPanel = createReportPanel($('#report-body'));
const timeline = createTimeline($('#timeline'), (time) => update({ time }));

$('#btn-random').append(t.random);
$('#btn-save').append(t.save);
$('#btn-album').append(t.album);
$('#btn-options').setAttribute('aria-label', t.options);
$('#btn-random').addEventListener('click', randomize);
$('#btn-save').addEventListener('click', save);
$('#btn-album').addEventListener('click', album);
$('#btn-options').addEventListener('click', options);
$('#report-title').textContent = t.catReport;
$('#app-title').textContent = t.appName;

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
  settings = { ...settings, ...patch, rings: { ...settings.rings, ...(patch.rings ?? {}) } };
  render(instant);
  scheduleSave();
}

function render(instant = false) {
  report = computeReport(settings);
  engine.apply(settings, report, instant);
  settingsPanel.sync(settings, report);
  reportPanel.update(report);
  timeline.update(settings.time, report);
  if (document.activeElement !== nameInput) nameInput.value = settings.name;
}

function randomize() {
  timeline.stop();
  settings = randomSettings();
  render();
  scheduleSave();
}

function save() {
  const ok = saveToAlbum({
    name: settings.name || t.newPlanetNamed,
    score: report.habitability,
    thumbnail: engine.capture(),
    settings,
  });
  toast(ok ? t.saved : t.saveFailed);
}

function album() {
  openAlbum((p) => {
    timeline.stop();
    settings = p.settings;
    render();
    scheduleSave();
    toast(t.loaded);
  });
}

function options() {
  openOptions(prefs, (p) => {
    prefs = p;
    savePrefs(p);
    applyPrefs();
  });
}

function applyPrefs() {
  engine.setQualityMode(prefs.quality);
  engine.setBatterySaver(prefs.batterySaver);
  engine.setReduceMotion(prefs.reduceMotion);
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.classList.toggle('large-text', prefs.largeText);
  document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);
}

// --- Klavye kısayolları ---
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  if (tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.modal-backdrop')) return;
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
    case 'f':
      engine.focus();
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
