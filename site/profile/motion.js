// Rebuild real text lines when language or available width changes.
const readingRoot=document.querySelector('.pages');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const revealed=new WeakSet();let observer;
function splitLines(el) {
  // Measure the same nonbreaking groups that the finished page uses.
  const text = el.textContent;
  el.replaceChildren(document.createTextNode(text));
  window.ovoChineseWrap.apply(el);
  if (!el.getClientRects().length) return;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const lines = [];
  let lastTop;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    let offset = 0;
    for (const glyph of node.data) {
      range.setStart(node, offset);
      offset += glyph.length;
      range.setEnd(node, offset);
      const bounds = range.getBoundingClientRect();
      if (!lines.length || (bounds.width && Math.abs(bounds.top - lastTop) > 2)) {
        lines.push('');
        lastTop = bounds.top;
      }
      lines[lines.length - 1] += glyph;
    }
  }
  el.replaceChildren(...lines.map((line, index) => {
    const mask = document.createElement('span');
    mask.className = 'line-mask';
    const body = document.createElement('span');
    body.className = 'line-body';
    body.style.setProperty('--line-delay', `${index * 95}ms`);
    body.textContent = line;
    mask.append(body);
    return mask;
  }));
}
window.prepareProfileMotion=()=>{
  observer?.disconnect();
  document.querySelectorAll('.pages h1,.pages h2,.pages h3,.pages p,.project-visual,.project-meta>div,.role').forEach(el=>el.setAttribute('data-reveal',''));
  document.querySelectorAll('.bio,.project-summary').forEach(el=>{el.dataset.lines='';splitLines(el);});
  const items=[...document.querySelectorAll('[data-reveal]')].filter(el=>!el.closest('[hidden]'));
  document.body.classList.toggle('motion-ready',!reduced.matches);
  if(reduced.matches||!('IntersectionObserver' in window)){document.body.classList.remove('motion-ready');items.forEach(el=>el.classList.add('is-visible'));return;}
  observer=new IntersectionObserver(entries=>{let batch=0;for(const entry of entries){if(!entry.isIntersecting)continue;const el=entry.target;el.style.setProperty('--reveal-delay',`${Math.min(batch++,3)*65+Number(el.dataset.delay??0)}ms`);el.classList.add('is-visible');revealed.add(el);observer.unobserve(el);}},{root:readingRoot,threshold:.12});
  for(const el of items){if(revealed.has(el)){el.classList.add('is-visible');continue;}el.classList.remove('is-visible');if(readingRoot.contains(el))observer.observe(el);else{el.style.setProperty('--reveal-delay','140ms');requestAnimationFrame(()=>{el.classList.add('is-visible');revealed.add(el);});}}
};
let resizeFrame;addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(window.prepareProfileMotion);});
reduced.addEventListener('change',window.prepareProfileMotion);
document.fonts?.ready.then(window.prepareProfileMotion);
requestAnimationFrame(window.prepareProfileMotion);
