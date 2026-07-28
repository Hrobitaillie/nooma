// Ancrage de commentaires façon W3C TextQuote + TextPosition.
// Capture : produit { quote, prefix, suffix, startOffset, sectionId, sectionTitle }.
// Re-localisation : retrouve la plage dans le DOM re-rendu et l'enrobe de <mark>.
//
// Modèle : on projette les nœuds texte d'un scope (une section, ou tout le
// contenu) en une chaîne unique + une carte {node, start, end}. quote/prefix/
// suffix sont dérivés de CE modèle, donc la relocalisation retombe dessus.

const CONTEXT = 32; // caractères de contexte de part et d'autre
const SKIP = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE']);
const HEADINGS = ['H1', 'H2', 'H3', 'H4'];
const CODE_RE = /^\s*\[([A-Za-z]{2,5}-\d+)\]/;

function isSkipped(node) {
  let el = node.parentElement;
  while (el) {
    if (SKIP.has(el.tagName)) return true;
    el = el.parentElement;
  }
  return false;
}

// Nœuds texte d'un scope, en ordre document (hors pre/code).
function collectTextNodes(scope) {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      return isSkipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function buildModel(scope) {
  const nodes = collectTextNodes(scope);
  const map = [];
  let text = '';
  for (const node of nodes) {
    const start = text.length;
    text += node.nodeValue;
    map.push({ node, start, end: text.length });
  }
  return { nodes, map, text };
}

// --- Sections -------------------------------------------------------------
function sectionIdOf(heading) {
  const t = heading.textContent || '';
  const m = t.match(CODE_RE);
  if (m) return m[1];
  return (
    'h-' +
    t
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
  );
}

function headings(contentEl) {
  return Array.from(contentEl.querySelectorAll('h1,h2,h3,h4')).map((el) => ({
    el,
    level: HEADINGS.indexOf(el.tagName) + 1,
    id: sectionIdOf(el),
    title: (el.textContent || '').trim(),
  }));
}

// Titre le plus proche EN AMONT d'un nœud (pour la capture).
function nearestHeading(contentEl, node) {
  const hs = headings(contentEl);
  let best = null;
  for (const h of hs) {
    // h.el avant `node` dans l'ordre document ?
    const pos = h.el.compareDocumentPosition(node);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    else break;
  }
  return best;
}

// Scope DOM d'une section : un conteneur virtuel des nœuds entre le titre et le
// prochain titre de niveau <= . On renvoie {startEl, endEl} bornes, et un test
// d'appartenance par position document.
function sectionScope(contentEl, sectionId) {
  const hs = headings(contentEl);
  const idx = hs.findIndex((h) => h.id === sectionId);
  if (idx === -1) return null;
  const start = hs[idx];
  let endEl = null;
  for (let i = idx + 1; i < hs.length; i++) {
    if (hs[i].level <= start.level) {
      endEl = hs[i].el;
      break;
    }
  }
  return { startEl: start.el, endEl };
}

// Modèle restreint à une section (nœuds texte après startEl et avant endEl).
function modelForSection(contentEl, sectionId) {
  const scope = sectionScope(contentEl, sectionId);
  if (!scope) return buildModel(contentEl);
  const all = collectTextNodes(contentEl);
  const nodes = all.filter((n) => {
    const afterStart = scope.startEl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (!afterStart) return false;
    if (scope.endEl) {
      const beforeEnd = scope.endEl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING;
      return !!beforeEnd;
    }
    return true;
  });
  const map = [];
  let text = '';
  for (const node of nodes) {
    const start = text.length;
    text += node.nodeValue;
    map.push({ node, start, end: text.length });
  }
  return { nodes, map, text };
}

// --- Conversion offsets <-> DOM ------------------------------------------
function charIndex(model, container, offset) {
  if (container.nodeType === Node.TEXT_NODE) {
    const entry = model.map.find((m) => m.node === container);
    if (entry) return entry.start + offset;
  }
  // Repli : premier nœud texte du modèle à l'intérieur du conteneur.
  for (const m of model.map) {
    if (container.contains ? container.contains(m.node) : false) return m.start;
  }
  return null;
}

function posFromChar(model, index) {
  for (const m of model.map) {
    if (index >= m.start && index <= m.end) return { node: m.node, offset: index - m.start };
  }
  const last = model.map[model.map.length - 1];
  return last ? { node: last.node, offset: last.node.nodeValue.length } : null;
}

// --- Capture --------------------------------------------------------------
export function captureAnchor(contentEl, range) {
  const heading = nearestHeading(contentEl, range.startContainer);
  const sectionId = heading ? heading.id : '__page__';
  const sectionTitle = heading ? heading.title : '';
  const model = heading ? modelForSection(contentEl, sectionId) : buildModel(contentEl);

  let startChar = charIndex(model, range.startContainer, range.startOffset);
  let endChar = charIndex(model, range.endContainer, range.endOffset);
  if (startChar == null || endChar == null) {
    // Repli global si la sélection déborde du scope de section.
    const g = buildModel(contentEl);
    startChar = charIndex(g, range.startContainer, range.startOffset);
    endChar = charIndex(g, range.endContainer, range.endOffset);
    if (startChar == null || endChar == null) return null;
    return finishCapture(g, startChar, endChar, sectionId, sectionTitle);
  }
  if (endChar < startChar) [startChar, endChar] = [endChar, startChar];
  return finishCapture(model, startChar, endChar, sectionId, sectionTitle);
}

function finishCapture(model, startChar, endChar, sectionId, sectionTitle) {
  const quote = model.text.slice(startChar, endChar);
  if (!quote.trim()) return null;
  return {
    sectionId,
    sectionTitle,
    quote,
    prefix: model.text.slice(Math.max(0, startChar - CONTEXT), startChar),
    suffix: model.text.slice(endChar, endChar + CONTEXT),
    startOffset: startChar,
  };
}

// --- Re-localisation ------------------------------------------------------
function allIndexes(hay, needle, from = 0) {
  const out = [];
  if (!needle) return out;
  let i = hay.indexOf(needle, from);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}

function normalizeWs(s) {
  return s.replace(/\s+/g, ' ');
}

// Renvoie l'index de départ du QUOTE dans model.text, ou -1.
function locateQuoteStart(model, c) {
  const text = model.text;
  // Passe 1 : prefix + quote + suffix exact.
  const needle = c.prefix + c.quote + c.suffix;
  let hits = allIndexes(text, needle);
  if (hits.length) {
    const best = nearestTo(hits, c.startOffset - (c.prefix ? c.prefix.length : 0));
    return best + (c.prefix ? c.prefix.length : 0);
  }
  // Passe 2 : quote seul, désambiguïsé par recouvrement prefix/suffix.
  hits = allIndexes(text, c.quote);
  if (hits.length) {
    let bestIdx = -1;
    let bestScore = -1;
    for (const h of hits) {
      const pre = text.slice(Math.max(0, h - CONTEXT), h);
      const suf = text.slice(h + c.quote.length, h + c.quote.length + CONTEXT);
      const score = commonSuffix(pre, c.prefix) + commonPrefix(suf, c.suffix) + proximity(h, c.startOffset);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = h;
      }
    }
    return bestIdx;
  }
  // Passe 3 : fuzzy (espaces normalisés).
  const nText = normalizeWs(text);
  const nQuote = normalizeWs(c.quote).trim();
  const fi = nText.indexOf(nQuote);
  if (fi !== -1 && nQuote) {
    // Re-projette l'index normalisé vers le texte original (approché).
    return approxOriginalIndex(text, nText, fi);
  }
  return -1;
}

function nearestTo(hits, target) {
  if (target == null) return hits[0];
  let best = hits[0];
  let bestD = Infinity;
  for (const h of hits) {
    const d = Math.abs(h - target);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

function proximity(idx, target) {
  if (target == null) return 0;
  return -Math.min(1, Math.abs(idx - target) / 5000); // léger biais de proximité
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function approxOriginalIndex(orig, norm, normIdx) {
  // Compte les caractères non-espaces jusqu'à normIdx, puis retrouve la position
  // correspondante dans orig.
  let target = 0;
  for (let i = 0; i < normIdx; i++) if (norm[i] !== ' ') target++;
  let seen = 0;
  for (let i = 0; i < orig.length; i++) {
    if (!/\s/.test(orig[i])) {
      if (seen === target) return i;
      seen++;
    }
  }
  return 0;
}

// Enrobe [startChar, endChar) — potentiellement multi-nœuds — de <mark>.
function wrapSpan(model, startChar, endChar, id) {
  const marks = [];
  for (const m of model.map) {
    const s = Math.max(startChar, m.start);
    const e = Math.min(endChar, m.end);
    if (s >= e) continue;
    const range = document.createRange();
    range.setStart(m.node, s - m.start);
    range.setEnd(m.node, e - m.start);
    const mark = document.createElement('mark');
    mark.className = 'cmt-hl';
    mark.setAttribute('data-comment-id', id);
    try {
      range.surroundContents(mark);
      marks.push(mark);
    } catch (err) {
      /* nœud modifié entre-temps : on ignore ce fragment */
    }
  }
  return marks;
}

// Surligne immédiatement la plage sélectionnée (aperçu pendant que la popover
// est ouverte), avant même que le commentaire soit enregistré. Réutilise la
// classe cmt-hl (+ cmt-draft) pour que relocateAll/clearHighlights la reprennent.
export function highlightDraft(range) {
  const sc = range.startContainer;
  const so = range.startOffset;
  const ec = range.endContainer;
  const eo = range.endOffset;
  const root = range.commonAncestorContainer;
  const rootEl = root.nodeType === 1 ? root : root.parentNode;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) {
    if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
  }
  const marks = [];
  for (const node of nodes) {
    let start = 0;
    let end = node.nodeValue.length;
    if (node === sc) start = so;
    if (node === ec) end = eo;
    if (start >= end) continue;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    const mark = document.createElement('mark');
    mark.className = 'cmt-hl cmt-draft';
    try {
      r.surroundContents(mark);
      marks.push(mark);
    } catch (e) {
      /* fragment ignoré */
    }
  }
  return marks;
}

export function clearDraft(contentEl) {
  contentEl.querySelectorAll('mark.cmt-draft').forEach((mark) => {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  contentEl.normalize();
}

export function clearHighlights(contentEl) {
  const marks = contentEl.querySelectorAll('mark.cmt-hl');
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  contentEl.normalize();
}

// Re-localise et surligne tous les commentaires d'une page. Mute `status` sur
// chaque commentaire ('resolved' | 'orphan'). Renvoie la liste des statuts.
export function relocateAll(contentEl, comments) {
  clearHighlights(contentEl);
  const statuses = {};
  for (const c of comments) {
    const model = c.sectionId && c.sectionId !== '__page__'
      ? modelForSection(contentEl, c.sectionId)
      : buildModel(contentEl);
    let quoteStart = locateQuoteStart(model, c);
    let used = model;
    if (quoteStart === -1 && model !== contentEl) {
      // Repli : recherche dans tout le document.
      const g = buildModel(contentEl);
      quoteStart = locateQuoteStart(g, c);
      used = g;
    }
    if (quoteStart === -1) {
      statuses[c.id] = 'orphan';
      continue;
    }
    const marks = wrapSpan(used, quoteStart, quoteStart + c.quote.length, c.id);
    statuses[c.id] = marks.length ? 'resolved' : 'orphan';
  }
  return statuses;
}

// Fait défiler jusqu'au surlignage d'un commentaire et le fait clignoter.
export function flashComment(contentEl, id) {
  const marks = contentEl.querySelectorAll('mark.cmt-hl[data-comment-id="' + CSS.escape(id) + '"]');
  if (!marks.length) return false;
  marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  marks.forEach((m) => {
    m.setAttribute('data-active', 'true');
    m.classList.remove('cmt-flash');
    // reflow pour rejouer l'animation
    void m.offsetWidth;
    m.classList.add('cmt-flash');
  });
  setTimeout(() => marks.forEach((m) => {
    m.classList.remove('cmt-flash');
    m.removeAttribute('data-active');
  }), 1200);
  return true;
}

export function setActiveMarks(contentEl, id) {
  contentEl.querySelectorAll('mark.cmt-hl[data-active]').forEach((m) => m.removeAttribute('data-active'));
  if (!id) return;
  contentEl
    .querySelectorAll('mark.cmt-hl[data-comment-id="' + CSS.escape(id) + '"]')
    .forEach((m) => m.setAttribute('data-active', 'true'));
}
