export const interactions = `'use strict';

const projects = {
  dodo: {
    title: 'Make a little room for wonder.',
    description: 'Dodo turns the things you want to learn into a little daily adventure. A library of ideas, and a playful path to making them stick.',
    url: 'https://dodo.foo',
    images: [['dodo-topics.png', 'Dodo Topics, a library of books and ideas'], ['dodo-peck.png', 'Dodo Peck, a daily learning adventure']],
  },
  jambot: {
    title: 'One more loop.',
    description: 'Jambot: drum machines, synths, and a little room for happy accidents. Below the screenshots is a small playable rhythm sketch for this design study.',
    url: 'https://decremental.com/#jambot',
    images: [['jambot-tracks.png', 'Jambot tracks and sequencer patterns'], ['jambot-controls.png', 'Jambot synthesizer controls']],
  },
  mac: {
    title: 'Hello, again.',
    description: 'My Macintosh Plus, finding its second act. Macinclaude brings today’s AI to a computer from 1986. Come see it on my desk in room 16.',
    url: 'https://decremental.com/#macinclaude',
    images: [['mac-plus.jpg', 'Bart’s Macintosh Plus running Macinclaude on a sunlit desk']],
  },
};

const dialog = document.querySelector('.project-dialog');
let lastOpener = null;
let stopBeat = () => {};
if (dialog) {
  document.querySelectorAll('[data-project]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.dragged === 'true') {
        button.dataset.dragged = 'false';
        return;
      }
      const project = projects[button.dataset.project];
      if (!project) return;
      lastOpener = button;
      dialog.querySelector('#project-title').textContent = project.title;
      dialog.querySelector('#project-description').textContent = project.description;
      dialog.querySelector('#project-link').href = project.url;
      dialog.querySelector('.dialog-images').replaceChildren(...project.images.map(([file, alt]) => {
        const image = document.createElement('img');
        image.src = '/hi/alts/assets/' + file;
        image.alt = alt;
        return image;
      }));
      dialog.querySelector('.dialog-instrument').hidden = button.dataset.project !== 'jambot';
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      dialog.scrollTop = 0;
    });
  });
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    stopBeat();
    document.body.style.overflow = '';
    lastOpener?.focus({ preventScroll: true });
  });
}

// Objects can be rearranged with a mouse; touch keeps ordinary page scrolling.
const stage = document.querySelector('.four-stage');
const motion = matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover)');
let depth = 20;
document.querySelectorAll('[data-draggable]').forEach(object => {
  let gesture = null;
  let current = { x: 0, y: 0 };
  const finish = event => {
    if (!gesture) return;
    object.dataset.dragged = String(gesture.moved);
    gesture = null;
    object.classList.remove('is-dragging');
    if (object.hasPointerCapture(event.pointerId)) object.releasePointerCapture(event.pointerId);
  };
  object.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || innerWidth <= 700) return;
    object.dataset.dragged = 'false';
    gesture = { startX: event.clientX, startY: event.clientY, x: current.x, y: current.y, moved: false };
    object.setPointerCapture(event.pointerId);
  });
  object.addEventListener('pointermove', event => {
    if (!gesture) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
    gesture.moved = true;
    object.classList.add('is-dragging');
    object.style.zIndex = String(++depth);
    current = {
      x: Math.max(-object.offsetLeft + 20, Math.min(stage.clientWidth - object.offsetLeft - object.offsetWidth - 20, gesture.x + dx)),
      y: Math.max(110 - object.offsetTop, Math.min(stage.clientHeight - object.offsetTop - object.offsetHeight - 65, gesture.y + dy)),
    };
    object.style.setProperty('--drag-x', current.x + 'px');
    object.style.setProperty('--drag-y', current.y + 'px');
  });
  object.addEventListener('pointerup', finish);
  object.addEventListener('pointercancel', finish);
  object.addEventListener('lostpointercapture', finish);
  object.addEventListener('dragstart', event => event.preventDefault());
  const reset = () => {
    current = { x: 0, y: 0 };
    gesture = null;
    object.classList.remove('is-dragging');
    object.style.removeProperty('--drag-x');
    object.style.removeProperty('--drag-y');
    object.style.removeProperty('z-index');
    object.dataset.dragged = 'false';
  };
  document.querySelector('.desk-reset')?.addEventListener('click', reset);
  window.addEventListener('resize', reset);
});
if (stage) {
  let frame = 0;
  stage.addEventListener('pointermove', event => {
    if (!motion.matches || event.pointerType !== 'mouse') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = stage.getBoundingClientRect();
      stage.style.setProperty('--mouse-x', ((event.clientX - box.left) / box.width - .5) * 13 + 'px');
      stage.style.setProperty('--mouse-y', ((event.clientY - box.top) / box.height - .5) * 9 + 'px');
    });
  });
  stage.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    stage.style.setProperty('--mouse-x', '0px');
    stage.style.setProperty('--mouse-y', '0px');
  });
}

// A deliberately small musical sketch; audio starts only after pressing Play.
const instrument = document.querySelector('.dialog-instrument');
if (instrument) {
  const play = instrument.querySelector('.beat-toggle');
  const steps = instrument.querySelector('.beat-steps');
  const pattern = Array.from({ length: 16 }, (_, i) => i % 4 === 0);
  const buttons = pattern.map((on, index) => {
    const button = document.createElement('button');
    button.textContent = String(index + 1).padStart(2, '0');
    button.setAttribute('aria-label', 'Kick drum step ' + (index + 1));
    button.setAttribute('aria-pressed', String(on));
    button.addEventListener('click', () => {
      pattern[index] = !pattern[index];
      button.setAttribute('aria-pressed', String(pattern[index]));
    });
    return button;
  });
  steps.replaceChildren(...buttons);
  let context;
  let noiseBuffer;
  let timer;
  let playing = false;
  let starting = false;
  let nextTime = 0;
  let nextStep = 0;
  const timers = new Set();
  const interval = 60 / 128 / 4;
  const drum = (time, index) => {
    if (pattern[index]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(135, time);
      oscillator.frequency.exponentialRampToValueAtTime(43, time + .13);
      gain.gain.setValueAtTime(.3, time);
      gain.gain.exponentialRampToValueAtTime(.001, time + .22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(time);
      oscillator.stop(time + .24);
    }
    if (index % 2 === 0) {
      const source = context.createBufferSource();
      const highpass = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = noiseBuffer;
      highpass.type = 'highpass';
      highpass.frequency.value = 7500;
      gain.gain.setValueAtTime(index % 4 === 2 ? .085 : .045, time);
      gain.gain.exponentialRampToValueAtTime(.001, time + .045);
      source.connect(highpass).connect(gain).connect(context.destination);
      source.start(time);
      source.stop(time + .06);
    }
    if ([0, 6, 10, 14].includes(index)) {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = index === 14 ? 98 : index === 6 ? 65.41 : 49;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, time);
      filter.frequency.exponentialRampToValueAtTime(110, time + .15);
      gain.gain.setValueAtTime(.055, time);
      gain.gain.exponentialRampToValueAtTime(.001, time + .19);
      oscillator.connect(filter).connect(gain).connect(context.destination);
      oscillator.start(time);
      oscillator.stop(time + .2);
    }
  };
  const schedule = () => {
    while (playing && nextTime < context.currentTime + .09) {
      const step = nextStep;
      drum(nextTime, step);
      const timeout = setTimeout(() => {
        timers.delete(timeout);
        if (playing) buttons.forEach((button, i) => button.classList.toggle('is-playing', i === step));
      }, Math.max(0, (nextTime - context.currentTime) * 1000));
      timers.add(timeout);
      nextStep = (nextStep + 1) % 16;
      nextTime += interval;
    }
  };
  stopBeat = () => {
    playing = false;
    clearInterval(timer);
    timers.forEach(clearTimeout);
    timers.clear();
    buttons.forEach(button => button.classList.remove('is-playing'));
    play.textContent = 'Play a little sketch';
    play.setAttribute('aria-pressed', 'false');
    if (context?.state === 'running') context.suspend().catch(() => {});
  };
  play.addEventListener('click', async () => {
    if (playing) { stopBeat(); return; }
    if (starting) return;
    starting = true;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error('Audio is unavailable');
        context = new Audio();
        noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * .1), context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      await context.resume();
      if (!dialog.open) { await context.suspend(); return; }
      playing = true;
      nextStep = 0;
      nextTime = context.currentTime + .06;
      play.textContent = 'Stop the sketch';
      play.setAttribute('aria-pressed', 'true');
      schedule();
      timer = setInterval(schedule, 25);
    } catch {
      play.textContent = 'Audio is unavailable in this browser';
    } finally { starting = false; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopBeat(); });
}
`
