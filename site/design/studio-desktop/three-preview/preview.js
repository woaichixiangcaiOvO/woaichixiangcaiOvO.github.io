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
const failureMessage = failure.querySelector('[role="alert"]');
let loadToken = 0;
let loadingDetail = () => ovoPrefs.t('loading');
const monitor = document.querySelector('.monitor-hit');
const ipad=document.querySelector('.ipad-hit');
const ipadHighlight=document.querySelector('.ipad-highlight polygon');
const profileUi=document.querySelector('.profile-ui');
const profileFrame=document.querySelector('.profile-frame');
const profileLoad=document.querySelector('.profile-load');
profileFrame.addEventListener('load',()=>{
  if(!profileFrame.getAttribute('src'))return;
  let profileApi;try{profileApi=profileFrame.contentWindow.ovoPrefs;}catch{}
  const ready=!!profileApi&&profileFrame.contentDocument?.body.dataset.embedded==='true'&&!!profileFrame.contentDocument?.querySelector('.pages');
  profileFrame.hidden=!ready;profileLoad.hidden=ready;
  if(ready){profileFrame.title=ovoPrefs.language==='en'?'OvO · Profile':'OvO · 个人名片';profileApi.setLanguage(ovoPrefs.language);if(document.body.dataset.view==='profile')profileFrame.focus({preventScroll:true});}
  else{profileLoad.dataset.ui='profileFailed';profileLoad.textContent=ovoPrefs.t('profileFailed');}
});
const highlight = document.querySelector('.monitor-highlight polygon');
const projector = document.querySelector('.projector-hit');
const projectorHighlight = document.querySelector('.projector-highlight g');
const windowPull = document.querySelector('.window-pull');
const pullCordHighlight = document.querySelector('.window-pull-highlight polyline');
const pullHandleHighlight = document.querySelector('.window-pull-highlight polygon');
const windowStatus = document.querySelector('.window-status');
const soundControls = document.querySelector('.studio-sound');
const soundToggle = document.querySelector('.sound-toggle');
const propReset = document.querySelector('.prop-reset');
const audio = createMonzaAudio(renderSoundControls);
const screen = document.querySelector('.screen-ui');
const desktop = document.querySelector('.desktop-controls');
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
const caseWindow = mountCaseWindow({ screen, desktop, onClose: () => goBack('case') });
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
  welcome.inert = !['welcome', 'loading', 'error', 'stalled'].includes(view);
  monitor.hidden = view !== 'overview';
  ipad.hidden=view!=='overview';
  profileUi.hidden=view!=='profile';
  projector.hidden = view !== 'overview';
  windowPull.hidden = view !== 'overview';
  soundControls.hidden = view !== 'overview';
  renderSoundControls();
  screen.hidden = view !== 'desktop';
  loading.hidden = !['loading', 'stalled'].includes(view);
  failure.hidden = !['error', 'stalled'].includes(view);
  failureMessage.hidden = view !== 'error';
  enter.disabled = view !== 'welcome';
}

function renderSoundControls() {
  const waiting = !audio.muted && audio.status === 'waiting' && canvas.dataset.windowScene === 'monza';
  soundToggle.disabled = audio.status === 'unavailable';
  soundToggle.setAttribute('aria-pressed', String(audio.muted));
  const label=ovoPrefs.t(soundToggle.disabled ? 'unavailable' : waiting ? 'sound' : audio.muted ? 'muted' : 'mute');
  soundToggle.setAttribute('aria-label',label);soundToggle.title=label;
  soundToggle.querySelector('.sound-waves').toggleAttribute('hidden',audio.muted);
  soundToggle.querySelector('.sound-slash').toggleAttribute('hidden',!audio.muted);
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

function placeSceneTargets(monitorPoints, projectorPoints, projectorOutline, pull, ipadPoints) {
  placeTarget(ipad,ipadPoints);ipadHighlight.setAttribute('points',polygonPoints(ipadPoints));
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

const sceneCancel=document.querySelector('.scene-cancel');
let sceneController;
sceneCancel.addEventListener('click',()=>sceneController?.abort());

function labelWindowPull() {
  windowPull.setAttribute('aria-label', ovoPrefs.language === 'en' ? `Window cord, switch to ${ovoPrefs.t(nextWindow())}` : `窗边拉绳，切换到${windowTitles[nextWindow()]}`);
}

async function changeWindow() {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  const next = nextWindow();
  windowPull.setAttribute('aria-disabled', 'true');
  delete windowStatus.dataset.sceneStatus;
  windowStatus.dataset.ui='switching';windowStatus.textContent=ovoPrefs.t('switching');
  sceneController=new AbortController();sceneCancel.hidden=false;
  windowTransition = studio.switchWindow(next,sceneController.signal,()=>{sceneCancel.hidden=true;});
  try {
    const switched=await windowTransition;
    delete windowStatus.dataset.ui;
    if(switched)windowStatus.dataset.sceneStatus=next;
    else windowStatus.dataset.ui=sceneController.signal.aborted?'cancelled':'switchError';
    windowStatus.textContent = switched
      ? (ovoPrefs.language === 'en' ? `Switched to ${ovoPrefs.t(next)}` : `已切换到${windowTitles[next]}`)
      : ovoPrefs.t(sceneController.signal.aborted?'cancelled':'switchError');
    labelWindowPull();
  } finally {
    renderSoundControls();
    windowTransition = undefined;
    sceneCancel.hidden=true;sceneController=undefined;
    windowPull.removeAttribute('aria-disabled');
  }
}

async function resetProps() {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  delete windowStatus.dataset.sceneStatus;delete windowStatus.dataset.ui;
  windowStatus.textContent = '';
  canvas.dataset.resetting = 'true';
  propReset.setAttribute('aria-disabled', 'true');
  resetTransition = studio.resetProps();
  try {
    windowStatus.dataset.ui=await resetTransition?'ready':'resetError';
    windowStatus.textContent = ovoPrefs.t(windowStatus.dataset.ui);
  } finally {
    resetTransition = undefined;
    delete canvas.dataset.resetting;
    propReset.removeAttribute('aria-disabled');
  }
}

function setLoadingDetail(render) {
  loadingDetail = render;
  loading.removeAttribute('data-ui');
  loading.textContent = render();
}

async function enterStudio() {
  if (!['welcome', 'error'].includes(document.body.dataset.view)) return;
  const token = ++loadToken;
  audio.unlock();
  performance.mark('studio-load-start');
  show('loading');
  setLoadingDetail(() => ovoPrefs.t('loading'));
  const received = new Map();
  let lastProgress = performance.now();
  const onProgress = (url, loaded, total = 0) => {
    if (token !== loadToken || !Number.isFinite(loaded)) return;
    received.set(url, { loaded, total: Number.isFinite(total) ? total : 0 });
    lastProgress = performance.now();
    const items = [...received.values()];
    const loadedBytes = items.reduce((sum, item) => sum + item.loaded, 0);
    const totalBytes = items.reduce((sum, item) => sum + item.total, 0);
    if (document.body.dataset.view === 'stalled') show('loading');
    setLoadingDetail(() => {
      const amount = (loadedBytes / 1048576).toFixed(1);
      const percent = totalBytes > 0 ? Math.min(100, Math.round(loadedBytes / totalBytes * 100)) : null;
      const progress = percent === null ? `${amount} MB` : `${percent}% · ${amount} MB`;
      return ovoPrefs.language === 'en'
        ? `Preparing the studio · ${progress}`
        : `正在准备工作室 · ${progress}`;
    });
  };
  // A quiet connection can be retried, but bytes that are still arriving must not be discarded.
  const resources = new PerformanceObserver(() => { lastProgress = performance.now(); });
  try { resources.observe({ type: 'resource' }); } catch { /* Older browsers keep the byte progress above. */ }
  const slow = setTimeout(() => {
    if (token !== loadToken || received.size) return;
    setLoadingDetail(() => ovoPrefs.t('slow'));
  }, 8000);
  const watch = setInterval(() => {
    if (token !== loadToken || document.body.dataset.view !== 'loading') return;
    if (performance.now() - lastProgress < 20000) return;
    show('stalled');
    setLoadingDetail(() => ovoPrefs.language === 'en'
      ? 'No new data for a while. Still waiting, or retry.'
      : '暂时没有新数据。仍在等待，也可以重试。');
  }, 1000);
  try {
    studio = await import('./scene.js').then(({ createStudio }) => {
      if (token !== loadToken) throw new Error('Load cancelled');
      return createStudio(
        canvas, placeSceneTargets, points => placeTarget(screen, points),
        initialWindow, audio, previewOptions.get('cars') === '3', points => placeTarget(profileUi, points),
        onProgress,
      );
    });
    if (token !== loadToken) return;
    labelWindowPull();
    const modelReady = performance.measure('studio-model-ready', 'studio-load-start');
    canvas.dataset.modelReadyMs = String(Math.round(modelReady.duration));
    await arriveInStudio();
    if (token !== loadToken) return;
    show('overview');
    await new Promise(requestAnimationFrame);
    const { duration } = performance.measure('studio-ready', 'studio-load-start');
    canvas.dataset.readyMs = String(Math.round(duration));
    const assetTime = performance.getEntriesByName('studio-model-and-desktop-assets').at(-1);
    const modelTransfer = performance.getEntriesByType('resource').find(entry => entry.name.endsWith('OvO_Studio_Interior.glb'));
    canvas.dataset.assetsMs = String(Math.round(assetTime?.duration ?? 0));
    canvas.dataset.modelBytes = String(modelTransfer?.transferSize ?? 0);
    showStudioEntry(currentEntry());
  } catch (error) {
    if (token !== loadToken) return;
    console.error(error);
    show('error');
    retry.focus();
  } finally {
    clearTimeout(slow);
    clearInterval(watch);
    resources.disconnect();
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
  const atProfile=['profile','profile-approaching','profile-returning'].includes(previous);

  if (entry.view === 'overview') {
    caseWindow.clear();
    if (projectorView.isOpen && !await projectorView.close()) return;
    if (atComputer||atProfile) {
      show(atProfile?'profile-returning':'returning');
      if (!await studio.moveCamera(false)) return;
    }
    if (navigation !== token) return;
    show('overview');
    (entry.focus === 'projector' ? projector : entry.focus==='ipad'?ipad:monitor).focus({ preventScroll: true });
    return;
  }

  if(entry.view==='profile'){
    caseWindow.clear();if(projectorView.isOpen)projectorView.clear();
    if(!profileFrame.getAttribute('src')||profileLoad.dataset.ui==='profileFailed'){
      profileFrame.hidden=true;profileLoad.hidden=false;profileLoad.dataset.ui='profileLoading';profileLoad.textContent=ovoPrefs.t('profileLoading');
      const profileUrl=new URL('../../../profile/index.html?embedded=1',import.meta.url).href;
      if(profileFrame.getAttribute('src'))profileFrame.contentWindow.location.replace(profileUrl);
      else profileFrame.src=profileUrl;
    }
    show('profile-approaching');
    if(!await studio.moveCamera(true,'profile')||navigation!==token)return;
    show('profile');profileFrame.focus({preventScroll:true});return;
  }

  if (entry.view === 'projector') {
    caseWindow.clear();
    if (atComputer||atProfile) studio.restoreOverview();
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
  (workIcons.get(entry.work) ?? workIcons.values().next().value).focus({ preventScroll: true });
}

enter.addEventListener('click', enterStudio);
function restart(autostart) {
  loadToken += 1;
  const url=new URL(location.href);if(autostart)url.searchParams.set('enter','1');else url.searchParams.delete('enter');
  history.replaceState(null,'',url);location.reload();
}
retry.addEventListener('click', () => restart(true));
document.querySelector('.welcome-back').addEventListener('click',()=>restart(false));
window.addEventListener('ovo-language',()=>{
  profileFrame.title=ovoPrefs.language==='en'?'OvO · Profile':'OvO · 个人名片';
  renderSoundControls();labelWindowPull();
  monitor.setAttribute('aria-label',ovoPrefs.t('computer'));projector.setAttribute('aria-label',ovoPrefs.t('projector'));
  for(const [id,button] of workIcons)button.setAttribute('aria-label',ovoPrefs.language==='en'?(id==='yingyu'?'Yingyu':'Bounce'):works[id].title);
  studio?.refreshLanguage();
  if (['loading', 'stalled'].includes(document.body.dataset.view)) loading.textContent = loadingDetail();
});
monitor.addEventListener('click', () => {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  enterView({ view: 'overview', focus: 'computer' }, { view: 'desktop' });
});
ipad.addEventListener('click',()=>{
  if(windowTransition||resetTransition||document.body.dataset.view!=='overview')return;
  enterView({view:'overview',focus:'ipad'},{view:'profile'});
});
function closeProfile(){if(currentEntry().view==='profile')goBack('profile');}
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===profileFrame.contentWindow&&event.data?.type==='ovo-profile-close')closeProfile();});
window.addEventListener('click',event=>{if(document.body.dataset.view!=='profile'||profileUi.contains(event.target)||event.button!==0)return;event.preventDefault();event.stopPropagation();closeProfile();},true);
projector.addEventListener('click', () => {
  if (windowTransition || resetTransition || document.body.dataset.view !== 'overview') return;
  enterView({ view: 'overview', focus: 'projector' }, { view: 'projector', work: 'yingyu' });
});
windowPull.addEventListener('click', changeWindow);
propReset.addEventListener('click', resetProps);
soundToggle.addEventListener('click', () => {
  if(!audio.muted && audio.status==='waiting'){audio.unlock();return;}
  audio.setMuted(!audio.muted);
  if (!audio.muted) audio.unlock();
});
function exitComputer() {
  const entry=currentEntry();
  if(backPending||document.body.dataset.view!=='desktop'||!['desktop','case'].includes(entry.view))return;
  backPending=true;pauseStudioVideo();
  history.go(entry.view==='case'?-2:-1);
}
window.addEventListener('click',event=>{
  if(document.body.dataset.view!=='desktop'||screen.contains(event.target)||event.button!==0)return;
  event.preventDefault();event.stopPropagation();exitComputer();
},true);
window.addEventListener('keydown', event => {
  if(event.key==='Escape'&&document.body.dataset.view==='profile'){event.preventDefault();closeProfile();return;}
  if (event.key === 'Escape' && !caseWindow.isOpen && document.body.dataset.view === 'desktop') exitComputer();
});
window.addEventListener('popstate', () => {
  backPending = false;
  if (!studio || ['loading', 'arriving'].includes(document.body.dataset.view)) return;
  showStudioEntry(currentEntry());
});
window.addEventListener('pagehide', pauseStudioVideo);

if (previewOptions.get('enter') === '1') enterStudio();
