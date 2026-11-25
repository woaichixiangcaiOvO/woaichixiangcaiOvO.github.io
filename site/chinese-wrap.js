(() => {
  const han = /\p{Script=Han}/u;
  const letterOrNumber = /[\p{L}\p{N}]/u;
  const loneHan = /^[^\p{L}\p{N}]*\p{Script=Han}[^\p{L}\p{N}]*$/u;
  const opening = /^[（(《〈【「『〔〖“‘\[]$/u;
  const punctuation = /^[\p{P}\p{S}]+$/u;
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh-CN', { granularity: 'word' })
    : null;
  const prepared = '.keep-chinese, .text-glyph, .line-body, script, style, textarea';

  function groups(text) {
    if (!han.test(text)) return [text];
    const parts = [];
    let prefix = '';
    const segments = segmenter
      ? Array.from(segmenter.segment(text), ({ segment }) => segment)
      : text.match(/\p{Script=Han}|[^\p{Script=Han}\s\p{P}\p{S}]+|[\s\p{P}\p{S}]/gu);
    for (const segment of segments) {
      if (opening.test(segment)) {
        prefix += segment;
      } else if (prefix || !punctuation.test(segment) || !parts.length ||
                 !letterOrNumber.test(parts.at(-1))) {
        parts.push(prefix + segment);
        prefix = '';
      } else {
        parts[parts.length - 1] += segment;
      }
    }
    if (prefix) parts.push(prefix);

    // A one-character word needs a neighbor, even when punctuation follows it.
    for (let index = 0; index < parts.length; index++) {
      if (!loneHan.test(parts[index])) continue;
      let start = index;
      let end = index;
      while (start > 0 && !letterOrNumber.test(parts[start - 1])) start--;
      while (end + 1 < parts.length && !letterOrNumber.test(parts[end + 1])) end++;
      const before = parts[start - 1];
      const after = parts[end + 1];
      if (after && (loneHan.test(after) || !before || !han.test(before))) {
        parts.splice(index, end - index + 2, parts.slice(index, end + 2).join(''));
      } else if (before) {
        parts.splice(start - 1, index - start + 2, parts.slice(start - 1, index + 1).join(''));
        index = start - 1;
      }
    }
    return parts;
  }

  function keepTogether(text) {
    if (!han.test(text)) return document.createTextNode(text);
    const span = document.createElement('span');
    span.className = 'keep-chinese';
    span.textContent = text;
    return span;
  }

  function apply(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!han.test(root.data) || root.parentElement?.closest(prepared)) return;
      root.replaceWith(...groups(root.data).map(keepTogether));
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(prepared)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(apply);
  }

  window.ovoChineseWrap = { groups, keepTogether, apply };
  document.addEventListener('DOMContentLoaded', () => {
    apply(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') apply(record.target);
        for (const node of record.addedNodes) apply(node);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
