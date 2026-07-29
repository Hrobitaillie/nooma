// Export PDF de l'espace courant. Rend chaque page MDX dans un conteneur DOM
// détaché (Preact), puis passe par le pipeline pdfmake existant (polices, cover,
// TOC, prepareSymbols, elementToPdf, callouts). Aucune dépendance de build :
// libs pdfmake via CDN, polices en chemins relatifs (servies statiquement).

import { render as preactRender, h } from 'preact';
import { evaluate } from '@mdx-js/mdx';
import * as jsxRuntime from 'preact/jsx-runtime';
import remarkGfm from 'remark-gfm';
import { SPACES } from './spaces.js?v=1785320225';
import { mdxComponents } from './mdx-components.js?v=1785320225';
import { EstimationsProvider } from './src/estimations/provider.js?v=1785320225';

const PDF_LIBS = [
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js',
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js',
  'https://cdn.jsdelivr.net/npm/html-to-pdfmake@2.5.4/browser.js',
];

const LOGO_URL = 'assets/pilotin-logo.svg';
const PDF_FONT_FILES = {
  'TTCommons-Regular.ttf': 'assets/TTCommons/TTCommons-Regular.ttf',
  'TTCommons-Bold.ttf': 'assets/TTCommons/TTCommons-Bold.ttf',
  'TTCommons-Italic.ttf': 'assets/TTCommons/TTCommons-Italic.ttf',
  'TTCommons-MediumItalic.ttf': 'assets/TTCommons/TTCommons-Medium-Italic.ttf',
  'DejaVuSansMono.ttf': 'assets/DejaVuSansMono.ttf',
};

const C = {
  gris100: '#F7FAFC', bleu100: '#EFF1FF', bleu200: '#BDC4FF', bleu: '#264BFF',
  bleu600: '#1400C5', bleu700: '#0B00AB', bleu800: '#110095',
  corail100: '#FFE8E5', corail300: '#FF9980', corail: '#FF603F', corail800: '#FF3528',
};
const BRAND = C.bleu;
const INK = '#15171c';
const MUTED = '#6b7280';
const RULE = '#E3E7F5';
const CONTENT_WIDTH = 499;

const HTML_STYLES = {
  h2: { fontSize: 14, bold: true, color: INK, margin: [0, 16, 0, 6] },
  h3: { fontSize: 11.5, bold: true, color: BRAND, margin: [0, 12, 0, 4] },
  h4: { fontSize: 10.5, bold: true, color: INK, margin: [0, 10, 0, 3] },
  a: { color: BRAND },
  code: { font: 'Mono', color: C.bleu700, background: C.bleu100, fontSize: 9 },
  blockquote: { color: MUTED, italics: true, margin: [8, 4, 0, 8] },
};

const GLYPH_MAP = {
  '✅': '✓', '✔': '✓', '☑': '✓',
  '❌': '✗', '❎': '✗', '✘': '✗', '✕': '✗',
  '🟢': '●', '🔴': '●', '🟡': '●', '🟠': '●', '🔵': '●', '⚫': '●', '⚪': '○',
  '⏸': '❙❙', '▶️': '▶', '⚠️': '⚠', '⏱': '', '💡': '',
};
const MONO_GLYPHS = new Set(Array.from('→←↑↓↔↕⇒⇐⇑⇓⇔➜➔↦▶◀▲▼●○■✓✗⚠❙≠≈≤≥±−─│┌┐└┘├┤┬┴┼'));

const CALLOUT_COLORS = {
  'callout-critical': { bar: C.corail800, bg: C.corail100 },
  'callout-warning': { bar: C.corail, bg: C.corail100 },
  'callout-info': { bar: C.bleu, bg: C.bleu100 },
  'callout-success': { bar: C.bleu700, bg: C.bleu100 },
  'callout-note': { bar: '#9aa3b2', bg: C.gris100 },
};

let pdfLibsPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Échec du chargement de ' + src));
    document.head.appendChild(s);
  });
}

function loadPdfLibs() {
  if (!pdfLibsPromise) {
    pdfLibsPromise = PDF_LIBS.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve()).catch((e) => {
      pdfLibsPromise = null;
      throw e;
    });
  }
  return pdfLibsPromise;
}

function flattenTree(items, trail) {
  const out = [];
  for (const node of items) {
    if (node.type === 'page') out.push({ path: node.path, label: node.label, trail });
    else if (node.children) out.push(...flattenTree(node.children, trail.concat(node.label)));
  }
  return out;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function looksLikeFont(buf) {
  if (!buf || buf.byteLength < 4) return false;
  const b = new Uint8Array(buf).subarray(0, 4);
  const sig = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
  return sig === 0x00010000 || sig === 0x74727565 || sig === 0x4f54544f || sig === 0x74746366;
}

async function registerFonts() {
  const ROBOTO = {
    normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf',
  };
  let haveMono = false;
  let haveTT = false;
  try {
    const entries = Object.entries(PDF_FONT_FILES);
    const bufs = await Promise.all(
      entries.map(([, url]) => fetch(url, { cache: 'reload' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null))
    );
    const have = {};
    entries.forEach(([key], i) => {
      if (looksLikeFont(bufs[i])) {
        window.pdfMake.vfs[key] = arrayBufferToBase64(bufs[i]);
        have[key] = true;
      }
    });
    haveMono = !!have['DejaVuSansMono.ttf'];
    haveTT = have['TTCommons-Regular.ttf'] && have['TTCommons-Bold.ttf'] && have['TTCommons-Italic.ttf'] && have['TTCommons-MediumItalic.ttf'];
  } catch (e) {
    /* repli Roboto */
  }
  const mono = haveMono ? 'DejaVuSansMono.ttf' : 'Roboto-Regular.ttf';
  window.pdfMake.fonts = Object.assign({}, window.pdfMake.fonts, {
    Roboto: ROBOTO,
    TTCommons: haveTT
      ? { normal: 'TTCommons-Regular.ttf', bold: 'TTCommons-Bold.ttf', italics: 'TTCommons-Italic.ttf', bolditalics: 'TTCommons-MediumItalic.ttf' }
      : ROBOTO,
    Mono: { normal: mono, bold: mono, italics: mono, bolditalics: mono },
  });
  return haveTT;
}

// La section « Gestion des lots » (<Lots/>) est un panneau d'édition (créer /
// renommer / supprimer un lot) : purement écran, sans objet dans un document
// figé. On retire le panneau ET son titre + paragraphe d'intro, en remontant
// les frères précédents jusqu'au titre inclus (on s'arrête au premier titre,
// donc sans toucher aux sections précédentes : TotauxGlobaux, Contenu des lots).
function dropLotsManager(root) {
  root.querySelectorAll('.lots').forEach((panel) => {
    let sib = panel.previousElementSibling;
    while (sib && !/^H[1-6]$/.test(sib.tagName)) {
      const prev = sib.previousElementSibling;
      sib.remove();
      sib = prev;
    }
    if (sib) sib.remove(); // le titre « Gestion des lots »
    panel.remove();
  });
}

// Retire l'UI interactive des composants (sélecteurs de lot, boutons ✕ / + ,
// champs de saisie) qui n'a pas de sens dans un document figé : un <select>
// devient son option sélectionnée, un <input> sa valeur, un bouton disparaît.
function stripInteractive(root) {
  root.querySelectorAll('.lot-badges').forEach((el) => {
    el.textContent = Array.from(el.children).map((c) => c.textContent).join(' · ');
  });
  root.querySelectorAll('select').forEach((sel) => {
    const opt = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    sel.replaceWith(document.createTextNode(opt ? opt.textContent : ''));
  });
  // Cases à cocher / radios : pas de valeur texte à reprendre (value vaut « on »),
  // et la consigne « (cocher pour inclure) » n'a pas de sens dans un document figé.
  root.querySelectorAll('.est-table__bucket-toggle .est-table__optnote').forEach((el) => el.remove());
  root.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((inp) => inp.remove());
  root.querySelectorAll('input').forEach((inp) => inp.replaceWith(document.createTextNode(inp.value || '')));
  root.querySelectorAll('button').forEach((b) => b.remove());
  // À l'écran, l'espacement de ces éléments vient du CSS (gap/margin) ; dans le
  // PDF les textes seraient collés (« V175 postes ») : séparateur explicite.
  root.querySelectorAll('.lot-detail__meta, .est-chip__opts, .est-chip__option-badge, .lots__count, .lots__default').forEach((el) => {
    el.parentNode.insertBefore(document.createTextNode(' · '), el);
  });
}

// Liens internes du PDF : chaque page exportée porte une destination nommée
// (posée sur son titre), et les liens relatifs .md(x) entre pages deviennent
// des linkToDestination. Même résolution de chemin que rewriteLinks (app.js).
// Les liens relatifs sans cible dans l'export (autre espace, ancre seule)
// redeviennent du texte simple plutôt qu'une URL morte (404 au clic).
// Tout en minuscules : pdfkit trie l'arbre de destinations sans tenir compte
// de la casse alors que la spec PDF impose un ordre d'octets ; un nom avec
// majuscule (README) serait mal classé et introuvable au clic dans les
// viewers à recherche dichotomique.
function pageDestId(path) {
  return 'page-' + path.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function rewireLinks(root, currentPath, pagePaths) {
  const baseDir = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1) : '';
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:|tel:)/.test(href)) return;
    a.removeAttribute('href');
    const hashIdx = href.search(/[#?]/);
    const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx);
    if (!/\.mdx?$/.test(pathPart)) return;
    const stack = [];
    for (const p of (baseDir + pathPart).split('/')) {
      if (p === '..') stack.pop();
      else if (p && p !== '.') stack.push(p);
    }
    const resolved = stack.join('/').replace(/\.md$/, '.mdx');
    if (!pagePaths.has(resolved)) return;
    const dest = JSON.stringify({ linkToDestination: pageDestId(resolved) });
    a.setAttribute('data-pdfmake', dest);
    // pdfmake ignore linkToDestination posé sur un nœud dont le texte est un
    // tableau d'enfants (cas « ← Index » : span Mono + texte) : reposer la
    // propriété sur chaque feuille de texte du lien.
    if (a.querySelector('*')) {
      const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, null);
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      texts.forEach((tn) => {
        if (!tn.nodeValue.trim()) return;
        const parent = tn.parentNode;
        // Si la feuille est déjà seule dans un span porteur d'un style pdfmake
        // (ex. le span Mono de la flèche « ← »), on FUSIONNE la destination dans
        // ce span plutôt que d'en imbriquer un second : l'imbrication ferait
        // perdre la police Mono du parent (html-to-pdfmake ne la propage pas au
        // span enfant), d'où la flèche en tofu dans le PDF.
        if (parent !== a && parent.nodeType === 1 && parent.hasAttribute('data-pdfmake') && parent.childNodes.length === 1) {
          const merged = Object.assign(JSON.parse(parent.getAttribute('data-pdfmake')), JSON.parse(dest));
          parent.setAttribute('data-pdfmake', JSON.stringify(merged));
          return;
        }
        const span = document.createElement('span');
        span.setAttribute('data-pdfmake', dest);
        parent.replaceChild(span, tn);
        span.appendChild(tn);
      });
    }
  });
}

function prepareSymbols(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (node.parentElement && node.parentElement.closest('pre, code')) return;
    const chars = Array.from(node.nodeValue);
    const isVarSel = (ch) => ch.codePointAt(0) === 0xfe0f;
    let needsWork = false;
    for (const ch of chars) {
      if (isVarSel(ch) || GLYPH_MAP[ch] !== undefined || MONO_GLYPHS.has(ch)) {
        needsWork = true;
        break;
      }
    }
    if (!needsWork) return;
    const frag = document.createDocumentFragment();
    let buffer = '';
    const flush = () => {
      if (buffer) {
        frag.appendChild(document.createTextNode(buffer));
        buffer = '';
      }
    };
    for (const ch of chars) {
      if (isVarSel(ch)) continue;
      // Le remplacement peut faire plusieurs caractères (ex. ⏸ -> ❙❙) : chacun
      // doit passer individuellement par le test MONO_GLYPHS.
      const rep = GLYPH_MAP[ch] !== undefined ? GLYPH_MAP[ch] : ch;
      for (const c of rep) {
        if (MONO_GLYPHS.has(c)) {
          flush();
          const span = document.createElement('span');
          span.setAttribute('data-pdfmake', '{"font":"Mono"}');
          span.textContent = c;
          frag.appendChild(span);
        } else {
          buffer += c;
        }
      }
    }
    flush();
    node.parentNode.replaceChild(frag, node);
  });
}

function elementToPdf(el) {
  if (el.nodeType !== 1) return null;

  if (el.tagName === 'PRE') {
    return {
      table: { widths: ['*'], body: [[{ text: el.textContent.replace(/\n+$/, ''), font: 'Mono', fontSize: 7.5, lineHeight: 1, preserveLeadingSpaces: true, color: INK }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#F5F6F9', paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8 },
      margin: [0, 6, 0, 10],
    };
  }

  const variant = el.classList && el.classList.contains('callout') ? Array.from(el.classList).find((c) => CALLOUT_COLORS[c]) : null;

  if (variant) {
    const colors = CALLOUT_COLORS[variant];
    const stack = [];
    const clone = el.cloneNode(true);
    const labelEl = clone.querySelector('.callout-label');
    if (labelEl) {
      const labelText = labelEl.textContent.trim();
      labelEl.remove();
      if (labelText) stack.push({ text: labelText.toUpperCase(), color: colors.bar, bold: true, fontSize: 8, characterSpacing: 0.8, margin: [0, 0, 0, 6] });
    }
    const inner = window.htmlToPdfmake(clone.innerHTML, { window: window, defaultStyles: HTML_STYLES });
    (Array.isArray(inner) ? inner : [inner]).forEach((n) => stack.push(n));
    return {
      table: { widths: ['*'], body: [[{ stack: stack }]] },
      layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => colors.bar, fillColor: () => colors.bg, paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 7, paddingBottom: () => 7 },
      margin: [0, 6, 0, 6],
    };
  }

  return window.htmlToPdfmake(el.outerHTML, { window: window, tableAutoSize: true, defaultStyles: HTML_STYLES });
}

// Rend une page MDX dans un conteneur DOM détaché et le renvoie.
async function renderPageContainer(spaceKey, path) {
  const res = await fetch(SPACES[spaceKey].base + path, { cache: 'no-cache' });
  const text = res.ok ? await res.text() : '# (page indisponible : ' + path + ')';
  const { default: Content } = await evaluate(text, { ...jsxRuntime, remarkPlugins: [remarkGfm], baseUrl: document.baseURI });
  const container = document.createElement('div');
  preactRender(h(EstimationsProvider, { fileKey: spaceKey + '/' + path }, h(Content, { components: mdxComponents })), container);
  return container;
}

async function buildDocDefinition(spaceKey) {
  const space = SPACES[spaceKey];
  const pages = flattenTree(space.tree, []);
  const pagePaths = new Set(pages.map((p) => p.path));

  const [containers, logoSvg, fontsOk] = await Promise.all([
    Promise.all(pages.map((p) => renderPageContainer(spaceKey, p.path).catch(() => {
      const d = document.createElement('div');
      d.innerHTML = '<p><em>(page indisponible : ' + p.path + ')</em></p>';
      return d;
    }))),
    fetch(LOGO_URL).then((r) => (r.ok ? r.text() : null)).catch(() => null),
    registerFonts(),
  ]);
  const bodyFont = fontsOk ? 'TTCommons' : 'Roboto';

  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

  const coverStack = [];
  if (logoSvg) coverStack.push({ svg: logoSvg, width: 118, alignment: 'center', margin: [0, 0, 0, 44] });
  coverStack.push(
    { text: space.cover.eyebrow, style: 'coverEyebrow' },
    { text: space.cover.title, style: 'coverTitle' },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 64, y2: 0, lineWidth: 3, lineColor: BRAND }], alignment: 'center', margin: [0, 4, 0, 18] },
    { text: space.cover.subtitle, style: 'coverSubtitle' },
    { text: today, style: 'coverDate' }
  );

  const content = [
    { stack: coverStack, alignment: 'center', margin: [0, 150, 0, 0], pageBreak: 'after' },
    { toc: { title: { text: 'Sommaire', style: 'tocTitle' }, numberStyle: { color: MUTED } } },
  ];

  pages.forEach((p, i) => {
    const container = containers[i];
    dropLotsManager(container);
    stripInteractive(container);
    prepareSymbols(container);
    // Après prepareSymbols : les spans de flèches créés dans les liens doivent
    // aussi recevoir la destination (pose feuille par feuille).
    rewireLinks(container, p.path, pagePaths);

    const firstH1 = container.querySelector('h1');
    const title = firstH1 ? firstH1.textContent.trim() : p.label;
    if (firstH1) firstH1.remove();

    const heading = [];
    if (p.trail.length) heading.push({ text: p.trail.join('  ›  ').toUpperCase(), style: 'crumb' });
    heading.push({ text: title, style: 'pageTitle', tocItem: true, id: pageDestId(p.path) });
    heading.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1.5, lineColor: BRAND }], margin: [0, 5, 0, 14] });
    heading[0].pageBreak = 'before';
    heading.forEach((node) => content.push(node));

    Array.from(container.children).forEach((child) => {
      const node = elementToPdf(child);
      if (node) content.push(node);
    });
    preactRender(null, container);
  });

  return {
    info: { title: space.infoTitle },
    pageSize: 'A4',
    pageMargins: [48, 64, 48, 60],
    defaultStyle: { font: bodyFont, fontSize: 10.5, lineHeight: 1.35, color: INK },
    content: content,
    header: logoSvg ? (currentPage) => (currentPage === 1 ? null : { svg: logoSvg, width: 34, alignment: 'right', margin: [0, 18, 48, 0] }) : undefined,
    footer: (currentPage, pageCount) =>
      currentPage === 1
        ? null
        : {
            margin: [48, 12, 48, 0],
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: RULE }], margin: [0, 0, 0, 5] },
              { columns: [{ text: space.footer, fontSize: 8, color: MUTED }, { text: currentPage + ' / ' + pageCount, fontSize: 8, color: MUTED, alignment: 'right' }] },
            ],
          },
    styles: {
      coverEyebrow: { fontSize: 11, bold: true, color: BRAND, characterSpacing: 3, margin: [0, 0, 0, 10] },
      coverTitle: { fontSize: 34, bold: true, color: INK },
      coverSubtitle: { fontSize: 14, color: MUTED, margin: [0, 0, 0, 30] },
      coverDate: { fontSize: 10.5, color: MUTED, characterSpacing: 0.5 },
      tocTitle: { fontSize: 20, bold: true, color: INK, margin: [0, 0, 0, 14] },
      pageTitle: { fontSize: 20, bold: true, color: BRAND },
      crumb: { fontSize: 8, bold: true, color: MUTED, characterSpacing: 1, margin: [0, 0, 0, 5] },
    },
  };
}

export async function exportPdf(spaceKey) {
  await loadPdfLibs();
  const docDefinition = await buildDocDefinition(spaceKey);
  window.pdfMake.createPdf(docDefinition).download(SPACES[spaceKey].download);
}
