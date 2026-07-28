import { render as preactRender, h } from 'preact';
import { evaluate } from '@mdx-js/mdx';
import * as jsxRuntime from 'preact/jsx-runtime';
import remarkGfm from 'remark-gfm';
import { marked } from 'marked';
import { SPACES, DEFAULT_SPACE } from './spaces.js?v=1';
import { mdxComponents } from './mdx-components.js?v=1';
import { EstimationsProvider } from './src/estimations/provider.js?v=1';
import { buildEstimations } from './src/estimations/data.js?v=1';
import { ControlLayer } from './src/comments/ControlLayer.js?v=1';
import { CommentsRecap } from './src/comments/CommentsRecap.js?v=1';
import { setLocation, bumpRender, loadComments, loadEstimations } from './src/store.js?v=1';

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
      a.textContent = node.label;
      a.dataset.path = node.path;
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

async function render() {
  const { space, path } = parseHash();
  if (space !== currentSpace) {
    currentSpace = space;
    navEl.innerHTML = '';
    navEl.appendChild(buildNav(SPACES[space].tree));
    updateSwitcher();
  }
  highlightActive(path);
  setLocation(space, path);
  renderNode(h('div', { class: 'loading' }, 'Chargement…'));

  try {
    const res = await fetch(SPACES[space].base + path, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();

    if (/\.mdx$/.test(path)) {
      // Espace catalogue : MDX complet (composants Est/Lot/Totaux).
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
      const html = marked.parse(text, { gfm: true });
      renderNode(h('article', { class: 'md-article', dangerouslySetInnerHTML: { __html: html } }));
      wrapTables(contentEl);
    }

    rewriteLinks(contentEl, space, path);
    contentEl.scrollTop = 0;
    bumpRender();
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
      const { exportPdf } = await import('./pdf.js?v=1');
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
window.addEventListener('hashchange', render);

// Estimations : scan de tous les .mdx + chargement des overrides, puis (re)rendu
// pour remplir les totaux.
Promise.all([buildEstimations(), loadEstimations()]).then(() => render());
render();
