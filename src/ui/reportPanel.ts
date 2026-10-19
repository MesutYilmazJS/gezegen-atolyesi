import { t } from '../i18n';
import type { PlanetReport } from '../sim/physics';
import { h } from './dom';

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

export function createReportPanel(root: HTMLElement) {
  const gaugeArc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const gaugeValue = h('div', { class: 'gauge-value' });
  const gaugeLabel = h('div', { class: 'gauge-label' });
  const esiBar = h('div', { class: 'esi-fill' });
  const esiText = h('span', { class: 'esi-text' });
  const stats = h('dl', { class: 'stats' });
  const stage = h('div', { class: 'stage-box' });
  const life = h('ul', { class: 'notes life' });
  const hazards = h('ul', { class: 'notes hazards' });
  const story = h('p', { class: 'story' });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'gauge');
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  for (const c of [bg, gaugeArc]) {
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '42');
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '9');
    svg.append(c);
  }
  bg.setAttribute('class', 'gauge-bg');
  gaugeArc.setAttribute('class', 'gauge-arc');
  gaugeArc.setAttribute('stroke-linecap', 'round');
  gaugeArc.setAttribute('transform', 'rotate(-90 50 50)');
  const circumference = 2 * Math.PI * 42;
  gaugeArc.setAttribute('stroke-dasharray', `${circumference}`);

  root.append(
    h('section', { class: 'report-head' },
      h('div', { class: 'gauge-wrap', role: 'meter', 'aria-label': t.habitability, 'aria-valuemin': '0', 'aria-valuemax': '100' }, svg, h('div', { class: 'gauge-center' }, gaugeValue)),
      h('div', { class: 'report-head-text' },
        h('div', { class: 'eyebrow' }, t.habitability),
        gaugeLabel,
        h('div', { class: 'esi' }, h('div', { class: 'eyebrow' }, t.earthSimilarity, ' ', esiText), h('div', { class: 'esi-bar' }, esiBar)),
      ),
    ),
    stage,
    stats,
    h('section', {}, h('h3', {}, t.lifeForecast), life),
    h('section', {}, h('h3', {}, t.hazards), hazards),
    h('section', {}, h('h3', {}, t.story), story),
  );

  return {
    update(r: PlanetReport) {
      const lvl = habitabilityLevel(r.habitability);
      gaugeArc.setAttribute('stroke-dashoffset', `${circumference * (1 - r.habitability / 100)}`);
      gaugeArc.style.stroke = lvl.color;
      gaugeValue.textContent = String(r.habitability);
      gaugeLabel.textContent = `${lvl.symbol} ${t.habitabilityLabels[lvl.idx]}`;
      gaugeLabel.style.color = lvl.color;
      root.querySelector('.gauge-wrap')?.setAttribute('aria-valuenow', String(r.habitability));
      const esi = Math.round(r.esi * 100);
      esiText.textContent = `%${esi}`;
      esiBar.style.width = `${esi}%`;

      const water = r.waterState === 'liquid' ? t.yes : r.waterState === 'frozen' ? t.frozen : r.waterState === 'vapor' ? t.vapor : t.no;
      stats.innerHTML = '';
      const rows: [string, string][] = [
        [t.avgTemp, toC(r.tAvg)],
        [`${t.maxTemp} / ${t.minTemp}`, `${toC(r.tMax)} / ${toC(r.tMin)}`],
        [t.liquidWater, water],
        [t.pressure, pressureText(r.pressure)],
        [t.gravity, `${r.gravity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} g`],
      ];
      for (const [k, v] of rows) stats.append(h('dt', {}, k), h('dd', {}, v));

      stage.innerHTML = '';
      stage.append(
        h('div', { class: 'eyebrow' }, t.currentStage),
        h('strong', {}, `${r.stage + 1}. ${t.stages[r.stage]}`),
        h('span', {}, t.stageDescriptions[r.stage]),
      );
      if (r.stuckReason) stage.append(h('div', { class: 'stuck' }, h('strong', {}, `⚠ ${t.stuckAt}: `), r.stuckReason));

      life.innerHTML = '';
      const notes = r.lifeNotes.length ? r.lifeNotes : [t.noLifeYet];
      for (const n of notes) life.append(h('li', {}, n));
      hazards.innerHTML = '';
      const hz = r.hazards.length ? r.hazards : [t.noHazards];
      for (const n of hz) hazards.append(h('li', {}, n));
      story.textContent = r.story;
    },
  };
}
