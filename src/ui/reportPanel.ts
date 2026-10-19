import { t } from '../i18n';
import type { PlanetReport } from '../sim/physics';
import { h } from './dom';
import { IconName, icon } from './icons';

const toC = (k: number) => `${Math.round(k - 273.15)} °C`;

function pressureText(bar: number): string {
  if (bar <= 0) return t.no;
  if (bar < 0.01) return `${(bar * 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mbar`;
  return `${bar.toLocaleString('tr-TR', { maximumFractionDigits: bar < 10 ? 2 : 0 })} bar`;
}

/** Renk körlüğüne uygun: renk + şekil + metin birlikte */
function habitabilityLevel(score: number): { idx: number; color: string; symbol: string } {
  if (score < 10) return { idx: 0, color: '#8a8f98', symbol: '✕' };
  if (score < 30) return { idx: 1, color: '#e0663f', symbol: '▼' };
  if (score < 55) return { idx: 2, color: '#e3b341', symbol: '◆' };
  if (score < 80) return { idx: 3, color: '#4fb6d8', symbol: '▲' };
  return { idx: 4, color: '#5ad08a', symbol: '★' };
}

/** Her evrim aşamasının simgesi */
const STAGE_ICONS: IconName[] = ['flame', 'mountain', 'droplets', 'bug', 'leaf', 'fish', 'city'];

const OPEN_KEY = 'gezegen-atolyesi:report-open';

function loadOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function createReportPanel(root: HTMLElement) {
  const open = { life: true, hazards: true, story: false, ...loadOpen() };

  // --- Üst kısım: yaşanabilirlik halkası ve Dünya'ya benzerlik ---
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'gauge');
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS(svgNS, 'circle');
  const arc = document.createElementNS(svgNS, 'circle');
  for (const c of [bg, arc]) {
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '42');
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '10');
    svg.append(c);
  }
  bg.setAttribute('class', 'gauge-bg');
  arc.setAttribute('class', 'gauge-arc');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', 'rotate(-90 50 50)');
  const circumference = 2 * Math.PI * 42;
  arc.setAttribute('stroke-dasharray', `${circumference}`);

  const gaugeValue = h('div', { class: 'gauge-value' });
  const gaugeWrap = h(
    'div',
    { class: 'gauge-wrap', role: 'meter', 'aria-label': t.habitability, 'aria-valuemin': '0', 'aria-valuemax': '100' },
    svg,
    h('div', { class: 'gauge-center' }, gaugeValue),
  );
  const levelLabel = h('div', { class: 'level-label' });
  const esiText = h('strong', { class: 'esi-text' });
  const esiFill = h('div', { class: 'esi-fill' });

  // --- Aşama kartı ---
  const stageIcon = h('div', { class: 'stage-icon' });
  const stageTitle = h('strong', {});
  const stageDesc = h('span', { class: 'stage-desc' });
  const stageAlert = h('div', { class: 'stage-alert' });

  // --- İstatistik kartları ---
  const stat = (iconName: IconName, label: string) => {
    const value = h('div', { class: 'stat-value' });
    const sub = h('div', { class: 'stat-sub' });
    const el = h('div', { class: 'stat-card' }, h('div', { class: 'stat-head' }, icon(iconName, 16), h('span', {}, label)), value, sub);
    return { el, value, sub };
  };
  const temp = stat('temp', t.temperature);
  const water = stat('droplets', t.liquidWater);
  const pressure = stat('gauge', t.pressure);
  const gravity = stat('weight', t.gravity);

  // --- Katlanır bölümler ---
  const section = (key: 'life' | 'hazards' | 'story', iconName: IconName, title: string, body: HTMLElement) => {
    const count = h('span', { class: 'count' });
    const d = h(
      'details',
      { class: `report-section ${key}`, open: open[key] },
      h('summary', {}, icon(iconName, 18), h('span', { class: 'summary-title' }, title), count, icon('chevron', 16)),
      body,
    );
    d.addEventListener('toggle', () => {
      open[key] = d.open;
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(open));
      } catch {
        // depolama kapalı olabilir
      }
    });
    return { d, count };
  };
  const lifeList = h('ul', { class: 'report-list' });
  const hazardList = h('ul', { class: 'report-list' });
  const story = h('p', { class: 'story-text' });
  const life = section('life', 'leaf', t.lifeForecast, lifeList);
  const hazards = section('hazards', 'alert', t.hazards, hazardList);
  const storySec = section('story', 'book', t.story, story);

  root.append(
    h(
      'section',
      { class: 'report-hero' },
      gaugeWrap,
      h(
        'div',
        { class: 'hero-text' },
        h('div', { class: 'eyebrow' }, t.habitability),
        levelLabel,
        h('div', { class: 'esi-row' }, h('span', { class: 'eyebrow' }, t.earthSimilarity), esiText),
        h('div', { class: 'esi-bar' }, esiFill),
      ),
    ),
    h('section', { class: 'stage-card' }, stageIcon, h('div', { class: 'stage-text' }, stageTitle, stageDesc), stageAlert),
    h('section', { class: 'stat-grid' }, temp.el, water.el, pressure.el, gravity.el),
    life.d,
    hazards.d,
    storySec.d,
  );

  const fillList = (ul: HTMLElement, items: string[], iconName: IconName, empty: string, emptyIcon: IconName) => {
    ul.replaceChildren(
      ...(items.length
        ? items.map((x) => h('li', {}, icon(iconName, 16), h('span', {}, x)))
        : [h('li', { class: 'empty-item' }, icon(emptyIcon, 16), h('span', {}, empty))]),
    );
  };

  return {
    update(r: PlanetReport) {
      // Yaşanabilirlik
      const lvl = habitabilityLevel(r.habitability);
      arc.setAttribute('stroke-dashoffset', `${circumference * (1 - r.habitability / 100)}`);
      arc.style.stroke = lvl.color;
      gaugeValue.textContent = String(r.habitability);
      gaugeWrap.setAttribute('aria-valuenow', String(r.habitability));
      levelLabel.textContent = `${lvl.symbol} ${t.habitabilityLabels[lvl.idx]}`;
      levelLabel.style.color = lvl.color;
      const esi = Math.round(r.esi * 100);
      esiText.textContent = `%${esi}`;
      esiFill.style.width = `${esi}%`;

      // Aşama
      if (r.kind === 'gas') {
        stageIcon.replaceChildren(icon('orbit', 22));
        stageTitle.textContent = t.kinds.gas;
        stageDesc.textContent = t.gasStage;
      } else {
        stageIcon.replaceChildren(icon(STAGE_ICONS[r.stage], 22));
        stageTitle.textContent = `${r.stage + 1}. ${t.stages[r.stage]}`;
        stageDesc.textContent = t.stageDescriptions[r.stage];
      }
      const alertText = r.kind === 'gas' ? null : r.activeDisaster ? `${t.disasterNames[r.activeDisaster]}: ${t.disasterInfo[r.activeDisaster]}` : r.stuckReason ? `${t.stuckAt}: ${r.stuckReason}` : null;
      stageAlert.hidden = !alertText;
      stageAlert.replaceChildren(...(alertText ? [icon('alert', 16), h('span', {}, alertText)] : []));
      stageIcon.dataset.stage = String(r.stage);

      // İstatistikler
      temp.value.textContent = toC(r.tAvg);
      temp.sub.textContent = `${t.minTemp} ${toC(r.tMin)} · ${t.maxTemp} ${toC(r.tMax)}`;
      water.value.textContent = r.waterState === 'liquid' ? t.yes : r.waterState === 'frozen' ? t.frozen : r.waterState === 'vapor' ? t.vapor : t.no;
      water.el.dataset.state = r.waterState;
      water.sub.textContent = '';
      pressure.value.textContent = r.kind === 'gas' ? '—' : pressureText(r.pressure);
      pressure.sub.textContent = r.kind === 'gas' || r.pressure <= 0 ? '' : `Dünya'nın ${(r.pressure).toLocaleString('tr-TR', { maximumFractionDigits: r.pressure < 10 ? 1 : 0 })} katı`;
      gravity.value.textContent = `${r.gravity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} g`;
      gravity.sub.textContent = r.gravity < 0.8 ? t.reportLight : r.gravity > 1.25 ? t.reportHeavy : t.reportEarthLike;

      // Listeler
      fillList(lifeList, r.lifeNotes.filter(Boolean), 'sparkles', t.noLifeYet, 'leaf');
      fillList(hazardList, r.hazards, 'alert', t.noHazards, 'shield');
      life.count.textContent = r.lifeNotes.filter(Boolean).length ? String(r.lifeNotes.filter(Boolean).length) : '';
      hazards.count.textContent = r.hazards.length ? String(r.hazards.length) : '';
      hazards.count.classList.toggle('warn', r.hazards.length > 0);
      story.textContent = r.story;
    },
  };
}
