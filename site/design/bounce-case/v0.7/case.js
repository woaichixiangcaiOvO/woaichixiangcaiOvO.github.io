function prepareText(element, segmenter, start = 0, step = 14, spread = 280) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const wrap = window.ovoChineseWrap;
  const parts = nodes.map(node => wrap.groups(node.data).map(text => ({
    text, glyphs: Array.from(segmenter.segment(text), item => item.segment),
  })));
  const count = parts.flat().flatMap(part => part.glyphs).filter(glyph => !/^\s+$/u.test(glyph)).length;
  const interval = Math.min(step, spread / Math.max(1, count - 1));
  let index = 0;

  nodes.forEach((node, position) => {
    const fragment = document.createDocumentFragment();
    for (const { text, glyphs } of parts[position]) {
      const group = wrap.keepTogether(text);
      const host = group.nodeType === Node.ELEMENT_NODE ? group : fragment;
      if (host === group) group.replaceChildren();
      for (const glyph of glyphs) {
        if (/^\s+$/u.test(glyph)) {
          host.append(glyph);
          continue;
        }
        const span = document.createElement('span');
        span.className = 'text-glyph';
        span.style.setProperty('--glyph-delay', `${start + index * interval}ms`);
        span.textContent = glyph;
        host.append(span);
        index++;
      }
      if (host === group) fragment.append(group);
    }
    node.replaceWith(fragment);
  });

  return start + Math.max(0, count - 1) * interval;
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('text-entered');
    observer.unobserve(entry.target);
  }
}, { rootMargin: '0px 0px -4% 0px' });

const opening = document.querySelectorAll('.masthead .brand, .masthead a, .language-switch button, .title-row p, .metadata dt, .metadata dd');
const captions = document.querySelectorAll('figcaption, .footer .brand, .footer a');
const title = document.querySelector('#title');
const subtitle = document.querySelector('.english-subtitle');
const chapters = document.querySelectorAll('.chapter-head');
const translations = [...document.querySelectorAll('[data-en]')].map(element => ({
  element, original: element.innerHTML, english: element.dataset.en,
}));
const localizedAttributes = [
  ['aria-label', 'data-en-label'],
  ['alt', 'data-en-alt'],
].flatMap(([attribute, source]) => [...document.querySelectorAll(`[${source}]`)].map(element => ({
  element, attribute, original: element.getAttribute(attribute), english: element.getAttribute(source),
})));
const options = [...document.querySelectorAll('[data-language]')];

function preparePage(language, initial = false) {
  const segmenter = new Intl.Segmenter(language, { granularity: 'grapheme' });
  const prepare = (element, ...timing) => prepareText(element, segmenter, ...timing);
  const show = (element, ...timing) => {
    if (!element.querySelector('.text-glyph')) prepare(element, ...timing);
    element.classList.add('text-prepared', 'text-entered');
    if (!initial) element.classList.add('text-settled');
  };
  const track = element => {
    element.classList.add('text-prepared');
    if (element.classList.contains('text-entered')) element.classList.add('text-settled');
    else observer.observe(element);
  };

  for (const element of opening) show(element, element.closest('.metadata') ? 130 : 0);
  show(title, 0, language === 'en' ? 65 : 105);
  for (const header of chapters) {
    prepare(header.querySelector('.section-label'));
    const headingEnd = prepare(header.querySelector('h2'), 45, 19);
    prepare(header.querySelector('p:last-child'), headingEnd + 95);
    track(header);
  }
  for (const element of captions) {
    if (!element.querySelector('.text-glyph')) prepare(element);
    track(element);
  }
}

function setLanguage(language) {
  if (document.documentElement.lang === language) return;
  const readingLine = Math.min(180, innerHeight * .24);
  const anchor = scrollY > 0 && [...document.querySelectorAll('main section, .hero, .gym-panorama, .footer')]
    .flatMap(section => section.classList.contains('chapter') ? [section, ...section.querySelectorAll('.chapter-head, figure')] : [section])
    .filter(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.top <= readingLine && bounds.bottom > readingLine;
    }).at(-1);
  const oldTop = anchor ? anchor.getBoundingClientRect().top : 0;
  const english = language === 'en';
  document.documentElement.lang = language;
  document.title = english ? 'Bounce · OvO' : '蹦动 · OvO';
  subtitle.hidden = !english;
  for (const { element, original, english: text } of translations) {
    if (!english) {
      element.innerHTML = original;
      continue;
    }
    const lines = text.split('<br>');
    element.replaceChildren(...lines.flatMap((line, index) => index ? [document.createElement('br'), line] : [line]));
  }
  for (const { element, attribute, original, english: value } of localizedAttributes) {
    element.setAttribute(attribute, english ? value : original);
  }
  for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.language === language));
  preparePage(language);
  window.ovoChineseWrap.apply(document.body);
  if (anchor) scrollBy({ top: anchor.getBoundingClientRect().top - oldTop, behavior: 'instant' });
}

preparePage(document.documentElement.lang, true);
for (const option of options) option.addEventListener('click', () => setLanguage(option.dataset.language));
