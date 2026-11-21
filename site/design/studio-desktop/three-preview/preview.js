import { desktopLayout } from './desktop-layout.js';
import { createMonzaAudio } from './monza-audio.js';

const canvas = document.querySelector('#studio');
const enter = document.querySelector('.enter');
const welcome = document.querySelector('.welcome');
const lampAnchor = document.querySelector('.lamp-anchor');
const entryLight = document.querySelector('.entry-light');
const retry = document.querySelector('.retry');
const loading = document.querySelector('.loading');
const failure = document.querySelector('.failure');
const monitor = document.querySelector('.monitor-hit');
const highlight = document.querySelector('.monitor-highlight polygon');
const projector = document.querySelector('.projector-hit');
const projectorHighlight = document.querySelector('.projector-highlight g');
const windowPull = document.querySelector('.window-pull');
const pullCordHighlight = document.querySelector('.window-pull-highlight polyline');
const pullHandleHighlight = document.querySelector('.window-pull-highlight polygon');
const windowStatus = document.querySelector('.window-status');
const soundControls = document.querySelector('.studio-sound');
const soundToggle = document.querySelector('.sound-toggle');
const soundEnable = document.querySelector('.sound-enable');
const propReset = document.querySelector('.prop-reset');
const audio = createMonzaAudio(renderSoundControls);
const screen = document.querySelector('.screen-ui');
const desktop = document.querySelector('.desktop-controls');
const leave = document.querySelector('.leave');
const { works, mountCaseWindow, mountProjector } = window.studioCaseView;
let studio;
let backPending = false;
let navigation = 0;
let windowTransition;
let resetTransition;
const readingProgress = new Map();
const windowTitles = { orbit: '太空版', monza: '赛道版' };
const previewOptions = new URLSearchParams(location.search);
const requestedWindow = previewOptions.get('scene');
const initialWindow = Object.hasOwn(windowTitles, requestedWindow) ? requestedWindow :
  Math.random() < .5 ? 'orbit' : 'monza';
const caseWindow = mountCaseWindow({ screen, desktop, leave, onClose: () => goBack('case') });
const projectorView = mountProjector({
  onPhase: show,
  onClose: () => goBack('projector'),
  onSelect(work) {
    const entry = currentEntry();
    if (backPending || entry.view !== 'projector') return false;
    history.replaceState({ threeStudio: { ...entry, work } }, '');
    return true;
  },
});

const { width, height, iconLeft, iconSize, labelBaseline, apps } = desktopLayout;
const workIcons = new Map(apps.map(({ id, y }) => {
  const button = document.createElement('button');
  const tile = document.createElement('span');
  button.className = 'screen-app';
  button.type = 'button';
  button.dataset.work = id;
  button.setAttribute('aria-label', works[id].title);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'case-window');
  const hitHeight = labelBaseline + 6;
  Object.assign(button.style, {
    left: `${iconLeft / width * 100}%`,
    top: `${y / height * 100}%`,
    width: `${iconSize / width * 100}%`,
    height: `${hitHeight / height * 100}%`,
  });
  tile.className = 'tile';
  tile.style.height = `${iconSize / hitHeight * 100}%`;
  button.append(tile);
  desktop.append(button);
  button.addEventListener('click', () => {
    if (backPending || currentEntry().view !== 'desktop' || document.body.dataset.view !== 'desktop' || caseWindow.isOpen) return;
    enterView({ view: 'desktop', work: id }, { view: 'case', work: id });
  });
  return [id, button];
}));

function show(view) {
  document.body.dataset.view = view;
  studio?.setOverviewActive(view === 'overview' && currentEntry().view === 'overview');
  welcome.inert = !['welcome', 'loading', 'error'].includes(view);
  monitor.hidden = view !== 'overview';
  projector.hidden = view !== 'overview';
  windowPull.hidden = view !== 'overview';
  soundControls.hidden = view !== 'overview';
  renderSoundControls();
  screen.hidden = view !== 'desktop';
  leave.hidden = view !== 'desktop';
  loading.hidden = view !== 'loading';
  failure.hidden = view !== 'error';
  enter.disabled = view !== 'welcome';
}

function renderSoundControls() {
  const waiting = !audio.muted && audio.status === 'waiting' && canvas.dataset.windowScene === 'monza';
  const focusToggle = !waiting && document.activeElement === soundEnable;
  soundEnable.hidden = !waiting;
  soundToggle.disabled = audio.status === 'unavailable';
  soundToggle.setAttribute('aria-pressed', String(audio.muted));
  soundToggle.textContent = soundToggle.disabled ? '音效不可用' : audio.muted ? '取消静音' : '静音';
  if (focusToggle) soundToggle.focus({ preventScroll: true });
}

function lightOrigin() {
  const rect = lampAnchor.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function followLamp({ origin, lamp, reveal, light }) {
  canvas.style.opacity = reveal;
  entryLight.style.translate = `${lamp.x - origin.x}px ${lamp.y - origin.y}px`;
  entryLight.style.opacity = light;
}

async function arriveInStudio() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  canvas.style.opacity = '0';
  show('arriving');
  await studio.arriveFromLamp(lightOrigin, followLamp);
  canvas.style.removeProperty('opacity');
  entryLight.style.removeProperty('translate');
  entryLight.style.removeProperty('opacity');
}

function placeTarget(target, points) {
  const left = Math.min(...points.map(point => point.x));
  const top = Math.min(...points.map(point => point.y));
  const width = Math.max(...points.map(point => point.x)) - left;
  const height = Math.max(...points.map(point => point.y)) - top;
  Object.assign(target.style, {
    left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
    clipPath: `polygon(${points.map(({ x, y }) => `${x - left}px ${y - top}px`).join(', ')})`,
  });
}

function polygonPoints(points) {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}

function placeSceneTargets(monitorPoints, projectorPoints, projectorOutline, pull) {
  placeTarget(monitor, monitorPoints);
  highlight.setAttribute('points', polygonPoints(monitorPoints));
  placeTarget(projector, projectorPoints);
  projectorHighlight.replaceChildren(...projectorOutline.map(points => {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', polygonPoints(points));
    return polygon;
  }));
  pullCordHighlight.setAttribute('points', polygonPoints(pull.cord));
  pullHandleHighlight.setAttribute('points', polygonPoints(pull.handle));
  const points = [...pull.cord, ...pull.handle];
  const left = Math.min(...points.map(point => point.x));
  const right = Math.max(...points.map(point => point.x));
  const top = Math.min(...points.map(point => point.y));
  const bottom = Math.max(...points.map(point => point.y));
  Object.assign(windowPull.style, {
    left: `${left - 12}px`, top: `${top - 6}px`,
    width: `${right - left + 24}px`, height: `${bottom - top + 12}px`,
  });
}

function nextWindow() {
  return canvas.dataset.windowScene === 'orbit' ? 'monza' : 'orbit';
}

function labelWindowPull() {
  windowPull.setAttribute('aria-label', `窗边拉绳，切换到${windowTitles[nextWindow()]}`);
}

async function changeWindow() {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  const next = nextWindow();
  windowPull.setAttribute('aria-disabled', 'true');
  windowStatus.textContent = '';
  windowTransition = studio.switchWindow(next);
  try {
    windowStatus.textContent = await windowTransition
      ? `已切换到${windowTitles[next]}`
      : '窗景加载失败，请再次拉动窗边拉绳重试';
    labelWindowPull();
  } finally {
    renderSoundControls();
    windowTransition = undefined;
    windowPull.removeAttribute('aria-disabled');
  }
}

async function resetProps() {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  windowStatus.textContent = '';
  canvas.dataset.resetting = 'true';
  propReset.setAttribute('aria-disabled', 'true');
  resetTransition = studio.resetProps();
  try {
    windowStatus.textContent = await resetTransition ? '道具已归位' : '道具暂时无法归位';
  } finally {
    resetTransition = undefined;
    delete canvas.dataset.resetting;
    propReset.removeAttribute('aria-disabled');
  }
}

async function enterStudio() {
  if (!['welcome', 'error'].includes(document.body.dataset.view)) return;
  audio.unlock();
  performance.mark('studio-load-start');
  show('loading');
  try {
    const { createStudio } = await import('./scene.js');
    studio = await createStudio(
      canvas, placeSceneTargets, points => placeTarget(screen, points),
      initialWindow, audio, previewOptions.get('cars') === '3',
    );
    labelWindowPull();
    const modelReady = performance.measure('studio-model-ready', 'studio-load-start');
    canvas.dataset.modelReadyMs = String(Math.round(modelReady.duration));
    await arriveInStudio();
    show('overview');
    await new Promise(requestAnimationFrame);
    const { duration } = performance.measure('studio-ready', 'studio-load-start');
    canvas.dataset.readyMs = String(Math.round(duration));
    const assetTime = performance.getEntriesByName('studio-model-and-desktop-assets').at(-1);
    const modelTransfer = performance.getEntriesByType('resource').find(entry => entry.name.endsWith('OvO_Studio_Interior.glb'));
    canvas.dataset.assetsMs = String(Math.round(assetTime.duration));
    canvas.dataset.modelBytes = String(modelTransfer?.transferSize ?? 0);
    showStudioEntry(currentEntry());
  } catch (error) {
    console.error(error);
    show('error');
    retry.focus();
  }
}

function currentEntry() {
  const { threeStudio, projectorWork } = history.state ?? {};
  return threeStudio ?? (projectorWork ? { view: 'projector', work: projectorWork } : { view: 'overview' });
}

function enterView(origin, destination) {
  if (destination.view === 'projector' || (destination.view === 'case' && destination.work === 'yingyu')) {
    destination = { ...destination, readingKey: crypto.randomUUID() };
    readingProgress.set(destination.readingKey, {});
  }
  history.replaceState({ threeStudio: origin }, '');
  history.pushState({ threeStudio: destination }, '');
  showStudioEntry(destination);
}

function pauseStudioVideo() {
  caseWindow.pause();
  projectorView.pause();
}

function goBack(from) {
  if (backPending || currentEntry().view !== from) return;
  backPending = true;
  pauseStudioVideo();
  history.back();
}

async function showStudioEntry(entry) {
  const token = ++navigation;
  if (windowTransition) await windowTransition;
  if (resetTransition) await resetTransition;
  if (navigation !== token) return;
  const previous = document.body.dataset.view;
  const atComputer = ['desktop', 'approaching', 'returning'].includes(previous);

  if (entry.view === 'overview') {
    caseWindow.clear();
    if (projectorView.isOpen && !await projectorView.close()) return;
    if (atComputer) {
      show('returning');
      if (!await studio.moveCamera(false)) return;
    }
    if (navigation !== token) return;
    show('overview');
    (entry.focus === 'projector' ? projector : monitor).focus({ preventScroll: true });
    return;
  }

  if (entry.view === 'projector') {
    caseWindow.clear();
    if (atComputer) studio.restoreOverview();
    projectorView.open(entry.work, true, readingProgress.get(entry.readingKey));
    return;
  }

  if (projectorView.isOpen) projectorView.clear();
  if (previous !== 'desktop') {
    show('approaching');
    if (!await studio.moveCamera(true) || navigation !== token) return;
    show('desktop');
  }
  if (entry.view === 'case') {
    caseWindow.open(workIcons.get(entry.work), readingProgress.get(entry.readingKey));
    return;
  }
  if (!await caseWindow.close() || navigation !== token) return;
  (workIcons.get(entry.work) ?? leave).focus({ preventScroll: true });
}

enter.addEventListener('click', enterStudio);
retry.addEventListener('click', () => location.reload());
monitor.addEventListener('click', () => {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  enterView({ view: 'overview', focus: 'computer' }, { view: 'desktop' });
});
projector.addEventListener('click', () => {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  enterView({ view: 'overview', focus: 'projector' }, { view: 'projector', work: 'yingyu' });
});
windowPull.addEventListener('click', changeWindow);
propReset.addEventListener('click', resetProps);
soundEnable.addEventListener('click', audio.unlock);
soundToggle.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  if (!audio.muted) audio.unlock();
});
leave.addEventListener('click', () => goBack('desktop'));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !caseWindow.isOpen && document.body.dataset.view === 'desktop') goBack('desktop');
});
window.addEventListener('popstate', () => {
  backPending = false;
  if (!studio || ['loading', 'arriving'].includes(document.body.dataset.view)) return;
  showStudioEntry(currentEntry());
});
window.addEventListener('pagehide', pauseStudioVideo);

if (previewOptions.get('enter') === '1') enterStudio();
