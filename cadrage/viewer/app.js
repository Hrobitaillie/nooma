import { render as preactRender, h } from 'preact';
import { evaluate } from '@mdx-js/mdx';
import * as jsxRuntime from 'preact/jsx-runtime';
import remarkGfm from 'remark-gfm';
import { marked } from 'marked';
import { SPACES, DEFAULT_SPACE } from './spaces.js?v=1785320225';
import { mdxComponents } from './mdx-components.js?v=1785320225';
import { EstimationsProvider } from './src/estimations/provider.js?v=1785320225';
import { buildEstimations } from './src/estimations/data.js?v=1785320225';
import { ControlLayer } from './src/comments/ControlLayer.js?v=1785320225';
import { CommentsRecap } from './src/comments/CommentsRecap.js?v=1785320225';
import { setLocation, bumpRender, loadComments, loadEstimations, getState, subscribe, setDiffTarget, setDiffScroll } from './src/store.js?v=1785320225';

const navEl = document.getElementById('nav');
const contentEl = document.getElementById('content');
let currentSpace = null;

// --- Routing --------------------------------------------------------------
function parseHash() {
  const segs = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let space = DEFAULT_SPACE;
  if (segs.length && SPACES[segs[0]]) space = segs.shift();
  return { space, path: segs.join('/') || SPACES[space].home };
}

// --- Navigation (arbre) ---------------------------------------------------
function buildNav(items, depth = 0) {
  const ul = document.createElement('ul');
  ul.className = 'nav-list depth-' + depth;
  for (const node of items) {
    const li = document.createElement('li');
    if (node.type === 'page') {
      const a = document.createElement('a');
      a.href = '#/' + currentSpace + '/' + node.path;
      a.dataset.path = node.path;
      const label = document.createElement('span');
      label.className = 'nav-label';
      label.textContent = node.label;
      a.appendChild(label);
      li.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'section-label';
      span.textContent = node.label;
      li.appendChild(span);
      li.appendChild(buildNav(node.children, depth + 1));
    }
    ul.appendChild(li);
  }
  return ul;
}

function findPage(items, path) {
  for (const node of items) {
    if (node.type === 'page' && node.path === path) return node;
    if (node.children) {
      const found = findPage(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function highlightActive(path) {
  navEl.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.dataset.path === path);
  });
}

// Indicateurs par page dans l'arbo : nombre de commentaires non traités (actifs)
// et traités (résolus). Recalculé à chaque changement de commentaires.
function updateNavBadges() {
  const strip = (p) => String(p).replace(/\.mdx?$/, '');
  const counts = {}; // clé = chemin sans extension -> { u: non traités, t: traités }
  for (const c of getState().comments) {
    if (c.space !== currentSpace) continue;
    const key = strip(c.file);
    const e = counts[key] || (counts[key] = { u: 0, t: 0 });
    if (c.resolved) e.t += 1;
    else e.u += 1;
  }
  navEl.querySelectorAll('a[data-path]').forEach((a) => {
    a.querySelectorAll('.nav-badge').forEach((b) => b.remove());
    const e = counts[strip(a.dataset.path)];
    if (!e) return;
    if (e.u) {
      const b = document.createElement('span');
      b.className = 'nav-badge nav-badge--untreated';
      b.textContent = e.u;
      b.title = e.u + ' commentaire(s) non traité(s)';
      a.appendChild(b);
    }
    if (e.t) {
      const b = document.createElement('span');
      b.className = 'nav-badge nav-badge--treated';
      b.textContent = '✓' + e.t;
      b.title = e.t + ' commentaire(s) traité(s)';
      a.appendChild(b);
    }
  });
}

// --- Sélecteur d'espace ---------------------------------------------------
function buildSwitcher() {
  const header = document.querySelector('#sidebar header');
  if (!header) return;
  const wrap = document.createElement('div');
  wrap.id = 'space-switch';
  Object.keys(SPACES).forEach((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.space = key;
    b.textContent = SPACES[key].label;
    b.addEventListener('click', () => {
      if (currentSpace === key) return;
      location.hash = '#/' + key + '/' + SPACES[key].home;
    });
    wrap.appendChild(b);
  });
  const pdf = header.querySelector('#pdf-btn');
  if (pdf) header.insertBefore(wrap, pdf);
  else header.appendChild(wrap);
}

function updateSwitcher() {
  document.querySelectorAll('#space-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.space === currentSpace);
  });
  // Le PDF (pipeline MDX) n'est proposé que sur les espaces qui le supportent.
  const pdfBtn = document.getElementById('pdf-btn');
  if (pdfBtn) pdfBtn.style.display = SPACES[currentSpace].pdf === false ? 'none' : '';
}

// --- Réécriture des liens relatifs .md(x) en routes de hash ---------------
// Contrairement au viewer d'origine, l'extension est CONSERVÉE : l'espace
// « docs » est en .md (marked), l'espace « catalogue » en .mdx (MDX).
function rewriteLinks(root, space, currentPath) {
  const baseDir = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1) : '';
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:|tel:|#)/.test(href)) return;
    const hashIdx = href.search(/[#?]/);
    const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx);
    const tail = hashIdx === -1 ? '' : href.slice(hashIdx);
    if (!/\.mdx?$/.test(pathPart)) return;
    const parts = (baseDir + pathPart).split('/');
    const stack = [];
    for (const p of parts) {
      if (p === '..') stack.pop();
      else if (p && p !== '.') stack.push(p);
    }
    a.setAttribute('href', '#/' + space + '/' + stack.join('/') + tail);
  });
}

// Les tableaux markdown défilent horizontalement quand ils débordent
// (équivalent du composant ScrollTable côté MDX).
function wrapTables(root) {
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement && table.parentElement.classList.contains('table-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}

// --- Rendu d'une page -----------------------------------------------------
function renderNode(vnode) {
  preactRender(vnode, contentEl);
}

// Compare deux chemins sans extension (13-decisions.md ≡ 13-decisions.mdx).
function sameFileStrip(a, b) {
  const strip = (p) => String(p).replace(/\.mdx?$/, '');
  return strip(a) === strip(b);
}

// Un extrait « s'étale sur plusieurs blocs » s'il contient une ligne vide
// (séparateur de blocs markdown) ou un marqueur de bloc en début de ligne
// (titre #, puce, liste numérotée, citation >, ligne de tableau |).
function spansBlocks(t) {
  return /\n[ \t]*\n/.test(t) || /(^|\n)[ \t]*([-*+]\s|\d+[.)]\s|#{1,6}\s|>\s|\|)/.test(t);
}

// Révision inline : dans le markdown SOURCE, à l'emplacement du texte, on insère
// l'ancien contenu en rouge SUIVI du nouveau en vert — pour lire le doc complet en
// mode « révision ». On ancre d'abord sur le texte APRÈS (présent une fois la modif
// appliquée au fichier) ; à défaut sur le texte AVANT (modif pas encore écrite).
//
// Deux rendus selon la portée du change :
//  - INLINE (dans un même bloc) : <span> rouge + <span> vert directement dans la source.
//  - BLOC (plusieurs paragraphes / titres / listes) : un <span> ne peut pas envelopper
//    plusieurs blocs sans casser marked. On remplace donc la zone par un JETON isolé,
//    et on note le couple {before, after} : après rendu markdown, le jeton est remplacé
//    par deux conteneurs pleine largeur (ancien rendu en rouge, nouveau rendu en vert).
//
// Renvoie { source, blocks } — `blocks` = substitutions post-rendu à appliquer sur le HTML.
function applyRedline(md, changes) {
  let out = md;
  const blocks = [];
  let n = 0;
  const list = changes || [];
  // `idx` = rang du motif dans changes[] ; reporté en data-diff pour permettre
  // aux liens de motif de la sidebar de défiler jusqu'au bon changement.
  for (let idx = 0; idx < list.length; idx++) {
    const ch = list[idx];
    const before = ch.before == null ? '' : String(ch.before);
    const after = ch.after == null ? '' : String(ch.after);
    const anchor = ch.anchor == null ? '' : String(ch.anchor);
    if (!before && !after) continue;

    // Positionnement EXPLICITE via `anchor` : on insère des conteneurs de bloc
    // adjacents à un repère inchangé, SANS le retirer. Indispensable pour
    // l'insertion pure (le nouveau texte n'est pas encore/plus localisable seul)
    // et la suppression pure (l'ancien texte a disparu du fichier).
    // `at` = 'after' (défaut) | 'before' — côté du repère où placer le bloc.
    if (anchor && out.includes(anchor)) {
      const token = 'xDIFFBLK' + n++ + 'x';
      blocks.push({ token, before, after, idx });
      out = out.replace(anchor, ch.at === 'before' ? token + '\n\n' + anchor : anchor + '\n\n' + token);
      continue;
    }

    // Ancrage par CONTENU : texte APRÈS présent (modif appliquée), sinon AVANT.
    const needle = after && out.includes(after) ? after : before && out.includes(before) ? before : null;
    if (!needle) continue; // introuvable (texte re-modifié depuis) -> on n'injecte rien
    if (spansBlocks(before) || spansBlocks(after)) {
      const token = 'xDIFFBLK' + n++ + 'x';
      blocks.push({ token, before, after, idx });
      out = out.replace(needle, '\n\n' + token + '\n\n');
    } else {
      const del = before ? '<span class="diff-del" data-diff="' + idx + '">' + before + '</span>' : '';
      const ins = after ? '<span class="diff-ins" data-diff="' + idx + '">' + after + '</span>' : '';
      out = out.replace(needle, del + ins);
    }
  }
  return { source: out, blocks };
}

// Le commentaire traité dont on doit afficher la révision, s'il concerne la page
// courante et porte des modifications localisables.
function activeRedlineComment(space, path) {
  const s = getState();
  if (!s.diffTarget) return null;
  const c = s.comments.find((x) => x.id === s.diffTarget);
  if (!c || c.space !== space || !sameFileStrip(c.file, path)) return null;
  return Array.isArray(c.changes) && c.changes.length ? c : null;
}

async function render() {
  const { space, path } = parseHash();
  if (space !== currentSpace) {
    currentSpace = space;
    navEl.innerHTML = '';
    navEl.appendChild(buildNav(SPACES[space].tree));
    updateSwitcher();
  }
  highlightActive(path);
  updateNavBadges();
  setLocation(space, path);
  renderNode(h('div', { class: 'loading' }, 'Chargement…'));

  try {
    const res = await fetch(SPACES[space].base + path, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const redline = activeRedlineComment(space, path);

    if (/\.mdx$/.test(path)) {
      // Espace catalogue : MDX complet (composants Est/Lot/Totaux). La révision
      // inline n'est pas appliquée ici (pipeline JSX) — les sujets traités portent
      // sur les docs .md.
      const { default: Content } = await evaluate(text, {
        ...jsxRuntime,
        remarkPlugins: [remarkGfm],
        baseUrl: document.baseURI,
      });
      const fileKey = space + '/' + path;
      renderNode(h(EstimationsProvider, { fileKey }, h(Content, { components: mdxComponents })));
    } else {
      // Espace docs : markdown pur rendu par marked (tolère les chevrons,
      // accolades et autres syntaxes qui feraient échouer le compilateur MDX).
      const rl = redline ? applyRedline(text, redline.changes) : { source: text, blocks: [] };
      let html = marked.parse(rl.source, { gfm: true });
      // Substitution des jetons de bloc par les conteneurs rouge/vert (chacun
      // rendu en markdown pour préserver titres, listes, gras…).
      for (const b of rl.blocks) {
        const del = b.before ? '<div class="diff-block diff-block--del" data-diff="' + b.idx + '">' + marked.parse(b.before, { gfm: true }) + '</div>' : '';
        const ins = b.after ? '<div class="diff-block diff-block--ins" data-diff="' + b.idx + '">' + marked.parse(b.after, { gfm: true }) + '</div>' : '';
        const repl = del + ins;
        html = html.includes('<p>' + b.token + '</p>') ? html.replace('<p>' + b.token + '</p>', repl) : html.replace(b.token, repl);
      }
      renderNode(h('article', { class: 'md-article', dangerouslySetInnerHTML: { __html: html } }));
      wrapTables(contentEl);
    }

    rewriteLinks(contentEl, space, path);
    bumpRender();
    // En mode révision on centre sur le motif ciblé (lien de la sidebar), à défaut
    // sur le premier changement ; sinon on remonte en haut.
    let target = null;
    if (redline) {
      const idx = getState().diffScrollIdx;
      if (idx != null) target = contentEl.querySelector('[data-diff="' + idx + '"]');
      if (!target) target = contentEl.querySelector('.diff-ins, .diff-del, .diff-block--ins, .diff-block--del');
    }
    if (getState().diffScrollIdx != null) setDiffScroll(null); // consommé
    if (target) target.scrollIntoView({ block: 'center' });
    else contentEl.scrollTop = 0;
    const page = findPage(SPACES[space].tree, path);
    document.title = (page ? page.label + ' — ' : '') + SPACES[space].docTitle;
  } catch (e) {
    renderNode(
      h('div', { class: 'error' }, [
        h('strong', null, 'Impossible de charger '),
        h('code', null, path),
        h('br'),
        String(e && e.message ? e.message : e),
      ])
    );
  }
}

// --- Redimensionnement du panneau récap -----------------------------------
function wireResizer() {
  const RECAP_WIDTH_KEY = 'viewer-recap-width';
  const resizer = document.getElementById('recap-resizer');
  const panel = document.getElementById('recap-root');
  if (!resizer || !panel) return;

  const clamp = (w) => {
    const max = Math.max(300, window.innerWidth - 600);
    return Math.max(260, Math.min(w, max));
  };
  const saved = parseInt(localStorage.getItem(RECAP_WIDTH_KEY), 10);
  if (saved) panel.style.width = clamp(saved) + 'px';

  let dragging = false;
  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    resizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.width = clamp(window.innerWidth - e.clientX) + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    localStorage.setItem(RECAP_WIDTH_KEY, parseInt(panel.style.width, 10));
  });
  resizer.addEventListener('dblclick', () => {
    panel.style.width = '360px';
    localStorage.setItem(RECAP_WIDTH_KEY, 360);
  });
}

// --- Export PDF (chargé à la demande) -------------------------------------
function wirePdf() {
  const pdfBtn = document.getElementById('pdf-btn');
  if (!pdfBtn) return;
  const LABEL = '📄 Télécharger en PDF';
  pdfBtn.textContent = LABEL;
  pdfBtn.addEventListener('click', async () => {
    if (pdfBtn.disabled) return;
    pdfBtn.disabled = true;
    try {
      pdfBtn.textContent = 'Chargement…';
      const { exportPdf } = await import('./pdf.js?v=1785320225');
      pdfBtn.textContent = 'Génération…';
      await exportPdf(currentSpace);
    } catch (e) {
      alert('Impossible de générer le PDF : ' + (e && e.message ? e.message : e));
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = LABEL;
    }
  });
}

// --- Amorçage -------------------------------------------------------------
buildSwitcher();
wireResizer();
wirePdf();
preactRender(h(ControlLayer, {}), document.getElementById('ui-root'));
preactRender(h(CommentsRecap, {}), document.getElementById('recap-root'));
loadComments();

// Un seul rendu par « tick » même si plusieurs déclencheurs tombent ensemble
// (ex. clic sur un sujet traité = setDiffTarget + changement de hash).
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  Promise.resolve().then(() => {
    renderQueued = false;
    render();
  });
}

// Naviguer vers une AUTRE page que celle en cours de révision quitte la révision.
window.addEventListener('hashchange', () => {
  const s = getState();
  if (s.diffTarget) {
    const c = s.comments.find((x) => x.id === s.diffTarget);
    const { space, path } = parseHash();
    if (!c || c.space !== space || !sameFileStrip(c.file, path)) {
      setDiffTarget(null); // déclenche l'abonnement -> scheduleRender
      return;
    }
  }
  scheduleRender();
});

// On ne réagit qu'aux transitions de diffTarget (activer/quitter la révision).
let prevDiffTarget = getState().diffTarget;
let prevComments = getState().comments;
subscribe((s) => {
  if (s.diffTarget !== prevDiffTarget) {
    prevDiffTarget = s.diffTarget;
    scheduleRender();
  }
  // Les badges de l'arbo suivent les commentaires (chargement, résolution, suppression).
  if (s.comments !== prevComments) {
    prevComments = s.comments;
    updateNavBadges();
  }
});

// Estimations : scan de tous les .mdx + chargement des overrides, puis (re)rendu
// pour remplir les totaux.
Promise.all([buildEstimations(), loadEstimations()]).then(() => render());
render();
