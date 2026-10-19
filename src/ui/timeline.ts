import { t } from '../i18n';
import { PlanetReport, STAGE_STARTS, TIMELINE_GYR, sliderToTime, stageAt, timeToSlider } from '../sim/physics';
import type { DisasterEvent, DisasterType } from '../state/settings';
import { h, infoButton } from './dom';
import { IconName, icon } from './icons';

/** Her aşamanın simgesi ve rengi (şeritlerde ve başlıkta) */
export const STAGE_STYLE: { icon: IconName; color: string }[] = [
  { icon: 'flame', color: '#e0663f' },
  { icon: 'mountain', color: '#a08670' },
  { icon: 'droplets', color: '#4f9be8' },
  { icon: 'bug', color: '#3fbfae' },
  { icon: 'leaf', color: '#5ad08a' },
  { icon: 'fish', color: '#4fb6d8' },
  { icon: 'city', color: '#e3b341' },
];

const DISASTER_ICON: Record<DisasterType, IconName> = {
  asteroid: 'comet',
  supervolcano: 'volcano',
  iceAge: 'snowflake',
  flare: 'zap',
  runaway: 'thermometer',
};

const SPEEDS = [0.5, 1, 2, 4];
const N = STAGE_STARTS.length;

export function ageText(time: number): string {
  const gyr = time * TIMELINE_GYR;
  if (gyr < 1) return `${Math.round(gyr * 1000)} ${t.millionYears}`;
  return `${gyr.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${t.yearsAgo}`;
}

function durationText(dt: number): string {
  const gyr = dt * TIMELINE_GYR;
  if (gyr < 1) return `${Math.max(1, Math.round(gyr * 1000))} ${t.millionYears}`;
  return `${gyr.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${t.yearsAgo}`;
}

export function createTimeline(root: HTMLElement, onTime: (time: number) => void) {
  let playing = false;
  let current = 1;
  let last = 0;
  let speed = 1;
  let userSpeed = 1;

  // --- Kontroller ---
  const playBtn = h('button', { class: 'play-btn', type: 'button', 'aria-label': t.play, title: `${t.play} (Boşluk)` }, icon('play', 20));
  const prevBtn = h('button', { class: 'tl-btn', type: 'button', 'aria-label': t.prevStage, title: t.prevStage }, icon('prev', 16));
  const nextBtn = h('button', { class: 'tl-btn', type: 'button', 'aria-label': t.nextStage, title: t.nextStage }, icon('next', 16));
  const speedBtn = h('button', { class: 'tl-btn speed-btn', type: 'button', title: t.playSpeed }, '1×');

  // --- Bilgi satırı ---
  const stageIcon = h('span', { class: 'tl-stage-icon' });
  const stageName = h('strong', { class: 'tl-stage-name' });
  const stageDesc = h('span', { class: 'tl-stage-desc' });
  const age = h('span', { class: 'tl-age' });
  const nextInfo = h('span', { class: 'tl-next' });

  // --- İz: grafik + aşama şeritleri + kaydırıcı ---
  const svgNS = 'http://www.w3.org/2000/svg';
  const graph = document.createElementNS(svgNS, 'svg');
  graph.setAttribute('viewBox', '0 0 100 30');
  graph.setAttribute('preserveAspectRatio', 'none');
  graph.setAttribute('class', 'tl-graph');
  graph.setAttribute('aria-hidden', 'true');
  const area = document.createElementNS(svgNS, 'path');
  area.setAttribute('class', 'tl-graph-area');
  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('class', 'tl-graph-line');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  graph.append(area, line);
  const graphLabel = h('span', { class: 'tl-graph-label' }, t.habitability);

  const segments = STAGE_STARTS.map((_, i) =>
    h(
      'button',
      {
        type: 'button',
        class: 'tl-seg',
        tabindex: -1,
        style: `--c:${STAGE_STYLE[i].color}`,
        title: `${t.stages[i]} — ${t.stageDescriptions[i]}`,
        onclick: (() => jumpToStage(i)) as EventListener,
      },
      h('span', { class: 'tl-seg-fill' }),
    ),
  );
  const labels = STAGE_STARTS.map((_, i) =>
    h(
      'button',
      { type: 'button', class: 'tl-label', style: `--c:${STAGE_STYLE[i].color}`, onclick: (() => jumpToStage(i)) as EventListener },
      icon(STAGE_STYLE[i].icon, 14),
      h('span', {}, t.stages[i]),
    ),
  );
  const markers = h('div', { class: 'tl-markers' });
  const input = h('input', {
    type: 'range',
    min: 0,
    max: 1000,
    step: 1,
    id: 'timeline',
    class: 'tl-range',
    'aria-label': t.timeline,
    oninput: (() => {
      stop();
      onTime(sliderToTime(Number(input.value) / 1000));
    }) as EventListener,
  });
  const hoverTip = h('div', { class: 'tl-hover', hidden: true });
  const track = h(
    'div',
    { class: 'tl-track' },
    h('div', { class: 'tl-graph-wrap' }, graph, graphLabel),
    h('div', { class: 'tl-segs' }, ...segments),
    markers,
    input,
    hoverTip,
  );
  track.addEventListener('pointermove', (e) => {
    const r = track.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const time = sliderToTime(x);
    hoverTip.hidden = false;
    hoverTip.style.left = `${x * 100}%`;
    hoverTip.textContent = `${t.stages[stageAt(time)]} · ${ageText(time)}`;
  });
  track.addEventListener('pointerleave', () => (hoverTip.hidden = true));

  root.append(
    h(
      'div',
      { class: 'tl-top' },
      h('div', { class: 'tl-controls' }, prevBtn, playBtn, nextBtn, speedBtn),
      h(
        'div',
        { class: 'tl-info' },
        stageIcon,
        h('div', { class: 'tl-info-text' }, h('div', { class: 'tl-info-line' }, stageName, age), stageDesc),
      ),
      nextInfo,
      infoButton(t.timeline, t.info.timeline),
    ),
    track,
    h('div', { class: 'tl-labels' }, ...labels),
  );

  // --- Oynatma ---
  const tick = (now: number) => {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    current = sliderToTime(Math.min(1, timeToSlider(current) + (dt / 21) * speed));
    onTime(current);
    if (current >= 1) stop();
    else requestAnimationFrame(tick);
  };

  function stop() {
    playing = false;
    playBtn.replaceChildren(icon('play', 20));
    playBtn.setAttribute('aria-label', t.play);
    root.classList.remove('is-playing');
  }

  function start(spd: number) {
    speed = spd;
    playing = true;
    if (current >= 0.999) {
      current = 0;
      onTime(0);
    }
    playBtn.replaceChildren(icon('pause', 20));
    playBtn.setAttribute('aria-label', t.pause);
    root.classList.add('is-playing');
    last = performance.now();
    requestAnimationFrame(tick);
  }

  function toggle() {
    if (playing) return stop();
    start(userSpeed);
  }

  function jumpToStage(i: number) {
    stop();
    const s = Math.max(0, Math.min(N - 1, i));
    const a = STAGE_STARTS[s];
    const b = s + 1 < N ? STAGE_STARTS[s + 1] : 1;
    onTime(Math.min(1, a + (b - a) * 0.5));
  }

  playBtn.addEventListener('click', toggle);
  prevBtn.addEventListener('click', () => {
    const s = stageAt(current);
    // Aşamanın ortasını geçtiysek önce o aşamanın ortasına dön
    jumpToStage(timeToSlider(current) * N - s > 0.55 ? s : s - 1);
  });
  nextBtn.addEventListener('click', () => jumpToStage(stageAt(current) + 1));
  speedBtn.addEventListener('click', () => {
    userSpeed = SPEEDS[(SPEEDS.indexOf(userSpeed) + 1) % SPEEDS.length];
    speedBtn.textContent = `${userSpeed.toLocaleString('tr-TR')}×`;
    if (playing) speed = userSpeed;
  });

  return {
    toggle,
    stop,
    /** Felaketten sonra toparlanmayı yavaşça göster */
    play(spd = 1) {
      stop();
      start(spd);
    },
    get playing() {
      return playing;
    },
    step(delta: number) {
      stop();
      onTime(sliderToTime(Math.min(1, Math.max(0, timeToSlider(current) + delta))));
    },
    setEvents(events: DisasterEvent[]) {
      markers.replaceChildren(
        ...events.map((e) =>
          h(
            'span',
            { class: `tl-marker ${e.type}`, style: `left:${timeToSlider(e.time) * 100}%`, title: `${t.disasterNames[e.type]} · ${ageText(e.time)}` },
            icon(DISASTER_ICON[e.type], 12),
          ),
        ),
      );
    },
    /** Zaman boyunca yaşanabilirlik (0..100), eşit aralıklı örnekler */
    setCurve(values: number[]) {
      if (values.length < 2) return;
      const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(30 - (v / 100) * 27).toFixed(2)}`);
      line.setAttribute('d', `M${pts.join(' L')}`);
      area.setAttribute('d', `M0,30 L${pts.join(' L')} L100,30 Z`);
    },
    update(time: number, r: PlanetReport) {
      current = time;
      const x = timeToSlider(time);
      if (document.activeElement !== input || playing) input.value = String(Math.round(x * 1000));

      // Şeritler: geçilen, şimdiki (kısmen dolu), ulaşılamayan
      const timeStage = r.timeStage;
      segments.forEach((seg, i) => {
        const local = Math.min(1, Math.max(0, x * N - i));
        seg.classList.toggle('blocked', i > r.maxStage);
        seg.classList.toggle('current', i === timeStage);
        (seg.firstElementChild as HTMLElement).style.width = `${local * 100}%`;
      });
      labels.forEach((l, i) => {
        l.classList.toggle('reached', i <= r.stage);
        l.classList.toggle('current', i === r.stage);
        l.classList.toggle('blocked', i > r.maxStage);
      });

      // Başlık
      const gas = r.kind === 'gas';
      const st = STAGE_STYLE[r.stage];
      stageIcon.replaceChildren(icon(gas ? 'orbit' : st.icon, 20));
      stageIcon.style.setProperty('--c', gas ? '#d29b6a' : st.color);
      stageName.textContent = gas ? t.kinds.gas : `${r.stage + 1}. ${t.stages[r.stage]}`;
      age.textContent = ageText(time);
      const warn = !gas && !!(r.activeDisaster || r.stuckReason);
      stageDesc.textContent = gas ? t.gasStage : r.activeDisaster ? t.disasterNames[r.activeDisaster] : r.stuckReason ? t.stuckAt : t.stageDescriptions[r.stage];
      stageDesc.classList.toggle('warn', warn);

      // Sonraki aşama ne zaman?
      const next = timeStage + 1;
      if (gas) nextInfo.replaceChildren();
      else if (next >= N) nextInfo.replaceChildren(icon('check', 14), h('span', {}, t.timelineEnd));
      else if (next > r.maxStage) nextInfo.replaceChildren(icon('lock', 14), h('span', {}, t.nextBlocked(t.stages[next])));
      else nextInfo.replaceChildren(icon('clock', 14), h('span', {}, t.nextIn(t.stages[next], durationText(STAGE_STARTS[next] - time))));
      nextInfo.classList.toggle('blocked', !gas && next < N && next > r.maxStage);
    },
  };
}
