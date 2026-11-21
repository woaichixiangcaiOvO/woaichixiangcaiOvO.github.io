(() => {
  const previewUrl = document.currentScript.src;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const raised = 'translateY(-105%)';
  const works = {
    yingyu: { title: '映遇', icon: '../v0.2/yingyu-film.svg', source: window.yingyuCaseSource },
    bounce: { title: '蹦动', icon: '../v0.2/bounce-puppy.png', source: window.bounceCaseSource },
  };
  const frameProgress = new WeakMap();

  function createFrame(id, onKeyDown, progress) {
    const frame = document.createElement('iframe');
    const restore = id === 'yingyu' && progress ? { progress, ready: false, seeking: false } : null;
    if (restore) frameProgress.set(frame, restore);
    frame.title = `${works[id].title} · 双语作品案例`;
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      doc.addEventListener('keydown', onKeyDown, true);
      doc.addEventListener('click', event => {
        const anchor = event.target.closest('a[href^="#"]');
        if (!anchor) return;
        event.preventDefault();
        doc.getElementById(anchor.getAttribute('href').slice(1))?.scrollIntoView();
      });
      if (restore) {
        const { scroll, time } = restore.progress;
        if (scroll) {
          doc.defaultView.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
          doc.querySelector('.visuals')?.scrollTo({ top: scroll.visuals, behavior: 'instant' });
          doc.querySelector('.stationary')?.scrollTo({ top: scroll.sidebar, behavior: 'instant' });
        }
        const video = doc.querySelector('video');
        if (video && time > 0) {
          restore.seeking = true;
          const seek = () => {
            video.pause();
            video.currentTime = Math.min(time, video.duration);
            restore.seeking = false;
          };
          if (video.readyState >= 1) seek();
          else video.addEventListener('loadedmetadata', seek, { once: true });
        }
        restore.ready = true;
      }
    }, { once: true });
    const base = new URL(`../../${id}-case/v0.7/`, previewUrl);
    frame.srcdoc = works[id].source.replace('<head>', `<head><base href="${base.href}">`);
    return frame;
  }

  function pauseVideo(frame) {
    const doc = frame?.contentDocument;
    const video = doc?.querySelector('video');
    video?.pause();
    const restore = frameProgress.get(frame);
    if (!restore?.ready || !doc?.defaultView) return;
    restore.progress.scroll = {
      x: doc.defaultView.scrollX,
      y: doc.defaultView.scrollY,
      visuals: doc.querySelector('.visuals')?.scrollTop ?? 0,
      sidebar: doc.querySelector('.stationary')?.scrollTop ?? 0,
    };
    if (video && !restore.seeking && video.readyState >= 1) restore.progress.time = video.currentTime;
  }

  function mountProjector({ onPhase, onClose, onSelect }) {
    const curtain = document.createElement('dialog');
    curtain.className = 'curtain projector-curtain';
    curtain.id = 'projector-curtain';
    curtain.setAttribute('aria-label', '放映机作品目录');
    curtain.innerHTML = `
      <div class="case-content" id="projector-case"></div>
      <nav class="film" aria-label="作品胶片"><ul class="film-track"></ul></nav>
      <button class="curtain-close" type="button" aria-label="关闭幕布" autofocus>×</button>`;
    const content = curtain.querySelector('.case-content');
    const film = curtain.querySelector('.film-track');
    const frames = new Map();
    let selected;
    let phase;
    let motion;
    let pendingLoad;
    let navigation = 0;
    let progress;

    // Three repeats fill four visible rows and leave two rows for the seamless loop.
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const [id, work] of Object.entries(works)) {
        const row = document.createElement('li');
        row.dataset.work = id;
        const cell = document.createElement(repeat === 0 ? 'button' : 'span');
        cell.className = 'film-cell';
        if (repeat === 0) {
          cell.type = 'button';
          cell.setAttribute('aria-label', work.title);
          cell.setAttribute('aria-controls', content.id);
        } else {
          row.setAttribute('aria-hidden', 'true');
        }
        const icon = document.createElement('span');
        icon.className = `icon ${id}`;
        const image = document.createElement('img');
        image.src = new URL(work.icon, previewUrl).href;
        image.alt = '';
        icon.append(image);
        cell.append(icon);
        row.append(cell);
        film.append(row);
      }
    }

    function setPhase(name) {
      phase = name;
      const moving = name !== 'projector';
      content.inert = moving;
      film.inert = moving;
      onPhase(name);
    }

    function pause() {
      pauseVideo(frames.get(selected));
    }

    function select(id) {
      if (id === selected) return frames.get(id);
      const previous = frames.get(selected);
      if (previous) {
        pauseVideo(previous);
        previous.hidden = true;
      }
      let next = frames.get(id);
      if (!next) {
        next = createFrame(id, event => {
          if (event.key !== 'Escape' || !curtain.open) return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }, progress);
        frames.set(id, next);
        content.append(next);
      }
      next.hidden = false;
      selected = id;
      for (const row of film.children) {
        const active = row.dataset.work === id;
        row.toggleAttribute('data-selected', active);
        row.querySelector('button')?.setAttribute('aria-pressed', String(active));
      }
      return next;
    }

    function beginNavigation() {
      navigation++;
      motion?.cancel();
      motion = undefined;
      pendingLoad?.abort();
      pendingLoad = undefined;
      return navigation;
    }

    function clear() {
      beginNavigation();
      pause();
      content.replaceChildren();
      frames.clear();
      selected = undefined;
      progress = undefined;
      phase = undefined;
      if (curtain.open) curtain.close();
      curtain.style.removeProperty('transform');
    }

    async function slide(opening, from, token) {
      const to = opening ? 'translateY(0)' : raised;
      const duration = opening ? 560 : 460;
      const easing = opening ? 'cubic-bezier(.29, .02, .24, 1)' : 'cubic-bezier(.44, 0, .45, 1)';
      curtain.style.transform = from;
      motion = curtain.animate([{ transform: from }, { transform: to }], { duration, easing, fill: 'both' });
      await Promise.allSettled([motion.finished]);
      return navigation === token;
    }

    async function open(id, animated, readingProgress) {
      const from = curtain.open ? getComputedStyle(curtain).transform : raised;
      const token = beginNavigation();
      progress = readingProgress;
      const frame = select(id);
      if (animated && !reducedMotion.matches) {
        setPhase('lowering-curtain');
        curtain.style.transform = from;
        if (!curtain.open) curtain.showModal();
        const doc = frame.contentDocument;
        if (doc?.URL !== 'about:srcdoc' || doc.readyState !== 'complete') {
          pendingLoad = new AbortController();
          await new Promise(resolve => {
            frame.addEventListener('load', resolve, { once: true, signal: pendingLoad.signal });
            pendingLoad.signal.addEventListener('abort', resolve, { once: true });
          });
        }
        if (navigation !== token || !await slide(true, from, token)) return false;
      }
      motion?.cancel();
      motion = undefined;
      curtain.style.removeProperty('transform');
      setPhase('projector');
      if (!curtain.open) curtain.showModal();
      return true;
    }

    async function close() {
      const from = curtain.open ? getComputedStyle(curtain).transform : raised;
      const visible = curtain.open && curtain.getBoundingClientRect().bottom > 0;
      const token = beginNavigation();
      pause();
      if (visible && !reducedMotion.matches) {
        setPhase('raising-curtain');
        if (!await slide(false, from, token)) return false;
      }
      clear();
      return true;
    }

    function selectCell(event) {
      const id = event.target.closest('li[data-work]')?.dataset.work;
      if (phase === 'projector' && id && id !== selected && onSelect(id)) select(id);
    }

    curtain.querySelector('.curtain-close').addEventListener('click', onClose);
    curtain.addEventListener('cancel', event => {
      event.preventDefault();
      onClose();
    });
    film.addEventListener('pointermove', event => {
      if (event.pointerType === 'mouse' && !reducedMotion.matches) selectCell(event);
    });
    film.addEventListener('click', selectCell);
    document.querySelector('main').append(curtain);

    return { open, close, clear, pause, get isOpen() { return curtain.open; } };
  }

  window.studioCaseView = { works, createFrame, pauseVideo, mountProjector };
})();
