import { t } from '../i18n';
import { PlanetReport, STAGE_STARTS, TIMELINE_GYR, sliderToTime, timeToSlider } from '../sim/physics';
import { h, infoButton } from './dom';

function ageText(time: number): string {
  const gyr = time * TIMELINE_GYR;
  if (gyr < 1) return `${Math.round(gyr * 1000)} ${t.millionYears}`;
  return `${gyr.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${t.yearsAgo}`;
}

export function createTimeline(root: HTMLElement, onTime: (time: number) => void) {
  let playing = false;
  let current = 1;
  let last = 0;

  const playBtn = h('button', { class: 'play-btn', type: 'button', 'aria-label': t.play }, '▶');
  const input = h('input', {
    type: 'range',
    min: 0,
    max: 1000,
    step: 1,
    id: 'timeline',
    'aria-label': t.stages.join(', '),
    oninput: (() => {
      stop();
      onTime(sliderToTime(Number(input.value) / 1000));
    }) as EventListener,
  });
  const blocked = h('div', { class: 'timeline-blocked' });
  const ticks = h(
    'div',
    { class: 'timeline-ticks' },
    ...STAGE_STARTS.map((s, i) => h('button', {
      type: 'button',
      class: 'tick',
      style: `left:${(i / STAGE_STARTS.length) * 100}%`,
      onclick: (() => {
        stop();
        onTime(Math.min(1, s + 0.02));
      }) as EventListener,
    }, h('span', {}, t.stages[i]))),
  );
  const age = h('div', { class: 'timeline-age' });
  const stageName = h('div', { class: 'timeline-stage' });

  root.append(
    playBtn,
    h('div', { class: 'timeline-track' }, blocked, input, ticks),
    h('div', { class: 'timeline-info' }, stageName, age),
    infoButton(t.timeline, t.info.timeline),
  );

  const tick = (now: number) => {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    current = sliderToTime(Math.min(1, timeToSlider(current) + dt / 21));
    onTime(current);
    if (current >= 1) stop();
    else requestAnimationFrame(tick);
  };

  function stop() {
    playing = false;
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', t.play);
  }

  function toggle() {
    if (playing) return stop();
    playing = true;
    if (current >= 0.999) {
      current = 0;
      onTime(0);
    }
    playBtn.textContent = '❚❚';
    playBtn.setAttribute('aria-label', t.pause);
    last = performance.now();
    requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', toggle);

  return {
    toggle,
    stop,
    step(delta: number) {
      stop();
      onTime(sliderToTime(Math.min(1, Math.max(0, timeToSlider(current) + delta))));
    },
    update(time: number, r: PlanetReport) {
      current = time;
      const x = timeToSlider(time);
      if (document.activeElement !== input || playing) input.value = String(Math.round(x * 1000));
      input.style.setProperty('--fill', `${x * 100}%`);
      age.textContent = ageText(time);
      stageName.textContent = `${t.stages[r.stage]}${r.stuckReason ? ' ⚠' : ''}`;
      // Koşullar izin vermiyorsa ulaşılamayan aşamaları tara
      const blockFrom = (r.maxStage + 1) / STAGE_STARTS.length;
      blocked.style.left = `${blockFrom * 100}%`;
      blocked.style.width = `${(1 - blockFrom) * 100}%`;
      blocked.title = r.stuckReason ?? '';
      ticks.querySelectorAll('.tick').forEach((el, i) => {
        el.classList.toggle('reached', i <= r.stage);
        el.classList.toggle('blocked', i > r.maxStage);
      });
    },
  };
}
