const translatable = [...document.querySelectorAll('[data-en], [data-en-label], [data-en-alt]')];
const original = translatable.map(node => ({ text: node.textContent, label: node.getAttribute('aria-label'), alt: node.getAttribute('alt') }));
const languageButtons = [...document.querySelectorAll('[data-language]')];
const video = document.querySelector('video');
const guide = document.querySelector('#english-guide');
const status = guide.querySelector('.seek-status');
const videoError = document.querySelector('.video-error');
const visuals = document.querySelector('.visuals');
const demo = document.querySelector('#demo');
const demoButton = document.querySelector('.demo-link');
const deck = document.querySelector('.deck-stage');
const cards = [...deck.querySelectorAll('.deck-card')];
const desktopLayout = matchMedia('(min-width: 1001px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let selectedChapter;
let frontCard = deck.querySelector('[data-front]');
let drawnCard;

function draw(card) {
  if (frontCard !== card) {
    frontCard.removeAttribute('data-front');
    card.setAttribute('data-front', '');
    frontCard = card;
  }
  if (drawnCard !== card) {
    drawnCard?.removeAttribute('data-drawn');
    card.setAttribute('data-drawn', '');
    drawnCard = card;
  }
}

function release(card) {
  if (drawnCard !== card) return;
  card.removeAttribute('data-drawn');
  drawnCard = undefined;
}

for (const card of cards) {
  card.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') draw(card);
  });
  card.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') release(card);
  });
  card.addEventListener('focus', () => {
    if (card.matches(':focus-visible')) draw(card);
  });
  card.addEventListener('blur', () => {
    if (!card.matches(':hover')) release(card);
  });
}

demoButton.addEventListener('click', () => {
  const behavior = reducedMotion.matches ? 'instant' : 'smooth';
  demo.focus({ preventScroll: true });
  const top = demo.getBoundingClientRect().top;
  if (desktopLayout.matches) {
    const inset = parseFloat(getComputedStyle(visuals).getPropertyValue('--demo-inset'));
    visuals.scrollBy({ top: top - visuals.getBoundingClientRect().top - inset, behavior });
  } else {
    window.scrollBy({ top: top - document.querySelector('.topbar').offsetHeight - 24, behavior });
  }
});

for (const button of languageButtons) {
  button.addEventListener('click', () => {
    const language = button.dataset.language;
    const english = language === 'en';
    const scrollArea = desktopLayout.matches ? visuals : window;
    const viewTop = desktopLayout.matches ? visuals.getBoundingClientRect().top : document.querySelector('.topbar').offsetHeight;
    const scrollPosition = desktopLayout.matches ? visuals.scrollTop : window.scrollY;
    const section = [...visuals.querySelectorAll('.chapter')].find(chapter => chapter.getBoundingClientRect().bottom > viewTop + 28);
    const offset = section?.getBoundingClientRect().top;
    document.documentElement.lang = language;
    document.title = english ? 'Yingyu · Case study' : '映遇 · 作品案例';
    translatable.forEach((node, index) => {
      const chinese = original[index];
      if (node.hasAttribute('data-en')) node.textContent = english ? node.dataset.en : chinese.text;
      if (node.hasAttribute('data-en-label')) node.setAttribute('aria-label', english ? node.dataset.enLabel : chinese.label);
      if (node.hasAttribute('data-en-alt')) node.alt = english ? node.dataset.enAlt : chinese.alt;
    });
    for (const option of languageButtons) option.setAttribute('aria-pressed', String(option === button));
    guide.hidden = !english;
    window.ovoChineseWrap.apply(document.body);
    if (scrollPosition > 0 && section) scrollArea.scrollBy(0, section.getBoundingClientRect().top - offset);
  });
}

guide.addEventListener('click', event => {
  const chapter = event.target.closest('button[data-seconds]');
  if (!chapter || video.error) return;
  selectedChapter?.removeAttribute('aria-current');
  selectedChapter = chapter;
  chapter.setAttribute('aria-current', 'true');
  video.currentTime = Number(chapter.dataset.seconds);
  status.textContent = `Video position: ${chapter.textContent}.`;
});

function showVideoError() {
  videoError.hidden = false;
  for (const chapter of guide.querySelectorAll('button')) chapter.disabled = true;
}

if (video.error) showVideoError();
video.addEventListener('error', showVideoError);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause();
});
