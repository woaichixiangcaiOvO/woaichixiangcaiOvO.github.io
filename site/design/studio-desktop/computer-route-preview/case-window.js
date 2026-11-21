(() => {
  const { works, createFrame, pauseVideo } = window.studioCaseView;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function mountCaseWindow({ screen, desktop, leave, onClose }) {
    const panel = document.createElement('section');
    panel.className = 'case-window';
    panel.id = 'case-window';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.hidden = true;
    panel.innerHTML = `
      <button class="close" type="button" aria-label="关闭作品窗口">×</button>
      <div class="case-content"></div>
      <span class="focus-end" tabindex="0"></span>`;
    const content = panel.querySelector('.case-content');
    const closeButton = panel.querySelector('.close');
    let frame;
    let opener;
    let motion;

    function focusClose() {
      closeButton.focus({ preventScroll: true });
    }

    function iconOffset() {
      const icon = opener.querySelector('.tile').getBoundingClientRect();
      const bounds = screen.getBoundingClientRect();
      const horizontal = icon.left + icon.width / 2 - bounds.left - bounds.width / 2;
      const vertical = icon.top + icon.height / 2 - bounds.top - bounds.height / 2;
      return `translate(${horizontal * .043}px, ${vertical * .043}px) scale(.94)`;
    }

    function onKey(event) {
      if (event.key !== 'Escape' || panel.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    function pause() {
      pauseVideo(frame);
    }

    function clear() {
      pause();
      panel.hidden = true;
      motion?.cancel();
      motion = undefined;
      frame?.remove();
      frame = undefined;
      content.inert = false;
      desktop.inert = false;
      leave.inert = false;
    }

    function open(button, progress) {
      clear();
      opener = button;
      const id = button.dataset.work;
      frame = createFrame(id, onKey, progress);
      content.append(frame);
      panel.setAttribute('aria-label', `${works[id].title}案例`);
      panel.hidden = false;
      desktop.inert = true;
      leave.inert = true;
      focusClose();
      if (!reducedMotion.matches) {
        motion = panel.animate([
          { opacity: 0, transform: iconOffset() },
          { opacity: 1, transform: 'none' },
        ], { duration: 240, easing: 'cubic-bezier(.2, .8, .25, 1)', fill: 'both' });
      }
    }

    async function close() {
      if (panel.hidden) return true;
      pause();
      content.inert = true;
      if (!reducedMotion.matches) {
        const { opacity, transform } = getComputedStyle(panel);
        motion?.cancel();
        const shrink = panel.animate([{ opacity, transform }, { opacity: 0, transform: iconOffset() }],
          { duration: 180, easing: 'cubic-bezier(.45, 0, .8, .45)', fill: 'both' });
        motion = shrink;
        await Promise.allSettled([shrink.finished]);
        if (motion !== shrink) return false;
      }
      clear();
      return true;
    }

    closeButton.addEventListener('click', onClose);
    panel.addEventListener('keydown', onKey);
    panel.querySelector('.focus-end').addEventListener('focus', focusClose);
    screen.append(panel);
    return { open, close, clear, pause, get isOpen() { return !panel.hidden; } };
  }

  window.studioCaseView.mountCaseWindow = mountCaseWindow;
})();
