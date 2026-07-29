// Panneau récap (monté dans #recap-root) : commentaires de la page courante,
// groupés par section. Clic -> défilement + flash du surlignage. Édition,
// suppression, badge « introuvable » pour les orphelins.

import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import {
  useStore,
  getState,
  commentsForCurrentPage,
  treatedComments,
  updateComment,
  deleteComment,
  deleteComments,
  setActive,
  setCommentMode,
  setDiffTarget,
  setDiffScroll,
  setRecapOverride,
  retrySave,
} from '../store.js?v=1785320225';
import { flashComment } from './anchoring.js?v=1785320225';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch (e) {
    return '';
  }
}

function groupBySection(comments) {
  const groups = [];
  const byId = new Map();
  for (const c of comments) {
    const key = c.sectionId || '__page__';
    if (!byId.has(key)) {
      const g = { id: key, title: c.sectionTitle || 'Général', items: [] };
      byId.set(key, g);
      groups.push(g);
    }
    byId.get(key).items.push(c);
  }
  return groups;
}

export function CommentsRecap() {
  const comments = useStore((s) => s.comments);
  const statuses = useStore((s) => s.statuses);
  const activeId = useStore((s) => s.activeId);
  const saveState = useStore((s) => s.saveState);
  const commentMode = useStore((s) => s.commentMode);
  const diffTarget = useStore((s) => s.diffTarget);
  const [tab, setTab] = useState('comments');

  const pageComments = commentsForCurrentPage(getState());
  const activeComments = pageComments.filter((c) => !c.resolved);
  const resolvedComments = pageComments.filter((c) => c.resolved);
  const groups = groupBySection(activeComments);
  const treated = treatedComments(getState());

  return html`<div class="recap">
    <header class="recap__head">
      <button type="button" class="recap__close" title="Fermer le panneau" onClick=${() => setRecapOverride(false)}>✕</button>
      <div class="recap__tabs" role="tablist">
        <button
          type="button"
          class=${'recap__tab' + (tab === 'comments' ? ' recap__tab--active' : '')}
          onClick=${() => setTab('comments')}
        >Commentaires <span class="recap__count">${activeComments.length}</span></button>
        <button
          type="button"
          class=${'recap__tab' + (tab === 'treated' ? ' recap__tab--active' : '')}
          onClick=${() => setTab('treated')}
        >🤖 Traités <span class="recap__count">${treated.length}</span></button>
      </div>
      ${saveState === 'saving' ? html`<span class="recap__save">…</span>` : null}
      ${saveState === 'error'
        ? html`<button type="button" class="recap__save recap__save--err" onClick=${retrySave}>⚠ réessayer</button>`
        : null}
      <button
        type="button"
        class="recap__commenter"
        data-active=${commentMode ? 'true' : 'false'}
        aria-pressed=${commentMode ? 'true' : 'false'}
        onClick=${() => setCommentMode(!commentMode)}
        title=${commentMode ? 'Désactiver le mode commentaire' : 'Activer le mode commentaire (sélectionner du texte pour commenter)'}
      >💬 ${commentMode ? 'Commenter : activé' : 'Commenter'}</button>
    </header>
    <div class="recap__body">
      ${tab === 'comments'
        ? activeComments.length === 0 && resolvedComments.length === 0
          ? html`<p class="recap__empty">
              Aucun commentaire sur cette page.${' '}
              ${commentMode
                ? 'Sélectionnez du texte pour en ajouter un.'
                : 'Activez le mode « Commenter » (en haut à droite) puis sélectionnez du texte.'}
            </p>`
          : html`${groups.map(
              (g) => html`<section class="recap__group" key=${g.id}>
                <h3 class="recap__group-title">${g.title}</h3>
                ${g.items.map(
                  (c) => html`<${RecapItem} key=${c.id} comment=${c} status=${statuses[c.id]} active=${activeId === c.id} />`
                )}
              </section>`
            )}
            ${resolvedComments.length
              ? html`<details class="recap__resolved">
                  <summary class="recap__resolved-summary">${'Résolus (' + resolvedComments.length + ')'}</summary>
                  ${resolvedComments.map(
                    (c) => html`<${RecapItem} key=${c.id} comment=${c} status=${statuses[c.id]} active=${false} />`
                  )}
                </details>`
              : null}`
        : html`<${TreatedList} items=${treated} diffTarget=${diffTarget} />`}
    </div>
  </div>`;
}

// Onglet « Traités par Claude » : tous fichiers confondus, groupés par fichier
// (ordre du doc), triés par ordre d'apparition dans le contenu. Clic -> révision.
function TreatedList({ items, diffTarget }) {
  if (!items.length) {
    return html`<p class="recap__empty">
      Aucun sujet traité par Claude pour l'instant. Quand Claude traite un commentaire
      « 🤖 Pour Claude », il enregistre ici le avant/après de ses modifications.
    </p>`;
  }
  // Position d'un sujet dans son fichier (offset d'ancrage) -> ordre de lecture.
  const pos = (c) => (typeof c.startOffset === 'number' ? c.startOffset : 0);
  const byFile = [];
  const idx = new Map();
  for (const c of items) {
    const key = c.space + '/' + c.file;
    if (!idx.has(key)) {
      const g = { key, file: c.file, space: c.space, items: [] };
      idx.set(key, g);
      byFile.push(g);
    }
    idx.get(key).items.push(c);
  }
  // Fichiers dans l'ordre du doc (les préfixes numérotés « 04- », « 13- »… rendent
  // le tri alphabétique correct) ; dans chaque fichier, par position dans le contenu.
  byFile.sort((a, b) => (a.space + a.file).localeCompare(b.space + b.file));
  for (const g of byFile) g.items.sort((a, b) => pos(a) - pos(b));

  function clearAll() {
    if (confirm('Effacer TOUS les sujets traités (' + items.length + ') et leurs commentaires ? Cette action est irréversible.')) {
      deleteComments(items.map((c) => c.id));
    }
  }

  return html`<div class="recap__treated-bar">
      <button type="button" class="recap__clear-all" onClick=${clearAll}>🗑 Supprimer tout (${items.length})</button>
    </div>
    ${byFile.map(
      (g) => html`<section class="recap__group" key=${g.key}>
        <h3 class="recap__group-title">${g.file}</h3>
        ${g.items.map((c) => html`<${TreatedItem} key=${c.id} comment=${c} active=${diffTarget === c.id} />`)}
      </section>`
    )}`;
}

function openTreated(comment) {
  setDiffTarget(comment.id);
  // Ouvre le doc concerné (la révision inline s'applique au rendu de cette page).
  const target = '#/' + comment.space + '/' + comment.file;
  if (location.hash !== target) location.hash = target;
}

// Libellé court d'un motif (un change) pour le sommaire de la sidebar.
function motifLabel(ch, i) {
  if (ch.label) return String(ch.label);
  if (ch.note) return String(ch.note);
  const t = String(ch.after || ch.before || ch.anchor || '')
    .replace(/[#>*_`|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return 'motif ' + (i + 1);
  return t.length > 46 ? t.slice(0, 46) + '…' : t;
}

// Va au motif `i` du sujet : ouvre la révision si besoin, puis défile jusqu'au
// changement correspondant (data-diff="i").
function goToMotif(comment, i, active) {
  setDiffScroll(i);
  if (active) {
    const el = document.querySelector('.md-article [data-diff="' + i + '"]');
    if (el) el.scrollIntoView({ block: 'center' });
  } else {
    openTreated(comment); // le rendu consommera diffScrollIdx pour défiler
  }
}

function TreatedItem({ comment, active }) {
  const changes = Array.isArray(comment.changes) ? comment.changes : [];
  const nChanges = changes.length;
  return html`<article
    class="recap__item recap__item--treated"
    data-kind="claude"
    data-active=${active ? 'true' : 'false'}
    onClick=${() => (active ? setDiffTarget(null) : openTreated(comment))}
    title="Afficher la révision inline dans le document"
  >
    <blockquote class="recap__quote">« ${comment.quote} »</blockquote>
    <p class="recap__text">${comment.commentText}</p>
    ${nChanges > 1
      ? html`<ul class="recap__motifs" onClick=${(e) => e.stopPropagation()}>
          ${changes.map(
            (ch, i) => html`<li key=${i}>
              <button type="button" class="recap__motif" onClick=${() => goToMotif(comment, i, active)}>
                <span class="recap__motif-num">${i + 1}</span>${motifLabel(ch, i)}
              </button>
            </li>`
          )}
        </ul>`
      : null}
    <div class="recap__meta" onClick=${(e) => e.stopPropagation()}>
      <span class="recap__diff-badge">${nChanges ? (nChanges > 1 ? nChanges + ' modifs' : '1 modif') : 'sans modif'}</span>
      <time>${fmtDate(comment.resolvedAt || comment.updatedAt || comment.createdAt)}</time>
      <button
        type="button"
        class="recap__act recap__act--del"
        title="Effacer définitivement ce sujet et son commentaire"
        onClick=${() => {
          if (confirm('Effacer définitivement ce sujet traité et son commentaire ? (l’historique de révision sera perdu)')) {
            if (getState().diffTarget === comment.id) setDiffTarget(null);
            deleteComment(comment.id);
          }
        }}
      >Supprimer</button>
      <span class="recap__see-diff" onClick=${() => (active ? setDiffTarget(null) : openTreated(comment))}
        >${active ? 'Quitter la révision' : 'Voir la révision →'}</span>
    </div>
  </article>`;
}

function RecapItem({ comment, status, active }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.commentText);
  const orphan = status === 'orphan';

  function activate() {
    if (orphan || comment.resolved) return;
    setActive(comment.id);
    flashComment(document.getElementById('content'), comment.id);
  }

  function saveEdit() {
    const v = text.trim();
    if (v && v !== comment.commentText) updateComment(comment.id, { commentText: v });
    setEditing(false);
  }

  return html`<article
    class="recap__item"
    data-status=${status || 'resolved'}
    data-kind=${comment.forClaude ? 'claude' : 'note'}
    data-active=${active ? 'true' : 'false'}
    data-resolved=${comment.resolved ? 'true' : 'false'}
    onClick=${editing ? undefined : activate}
  >
    <blockquote class="recap__quote">
      « ${comment.quote} »${orphan && !comment.resolved ? html`<span class="recap__badge">introuvable</span>` : null}${comment.resolved
        ? html`<span class="recap__badge recap__badge--done">✓ résolu</span>`
        : null}
    </blockquote>
    ${editing
      ? html`<div class="recap__edit" onClick=${(e) => e.stopPropagation()}>
          <textarea class="cmt-popover__input" value=${text} onInput=${(e) => setText(e.currentTarget.value)}></textarea>
          <div class="cmt-popover__actions">
            <button type="button" class="cmt-btn cmt-btn--ghost" onClick=${() => { setText(comment.commentText); setEditing(false); }}>Annuler</button>
            <button type="button" class="cmt-btn cmt-btn--accent" onClick=${saveEdit}>Enregistrer</button>
          </div>
        </div>`
      : html`<p class="recap__text">${comment.commentText}</p>`}
    ${comment.resolved && comment.resolvedNote ? html`<p class="recap__resolved-note">${comment.resolvedNote}</p>` : null}
    <div class="recap__meta" onClick=${(e) => e.stopPropagation()}>
      <button
        type="button"
        class="recap__kind"
        data-kind=${comment.forClaude ? 'claude' : 'note'}
        title="Cliquer pour basculer prompt Claude / note"
        onClick=${() => updateComment(comment.id, { forClaude: !comment.forClaude })}
      >${comment.forClaude ? '🤖 Pour Claude' : '💬 Note'}</button>
      <time>${fmtDate(comment.resolvedAt || comment.updatedAt || comment.createdAt)}</time>
      ${comment.resolved
        ? html`<button
            type="button"
            class="recap__act"
            onClick=${() => updateComment(comment.id, { resolved: false, resolvedAt: null, resolvedNote: null })}
          >Rouvrir</button>`
        : null}
      ${!editing && !comment.resolved ? html`<button type="button" class="recap__act" onClick=${() => setEditing(true)}>Éditer</button>` : null}
      <button
        type="button"
        class="recap__act recap__act--del"
        onClick=${() => { if (confirm('Supprimer ce commentaire ?')) deleteComment(comment.id); }}
      >Supprimer</button>
    </div>
  </article>`;
}
