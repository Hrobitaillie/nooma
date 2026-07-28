// Panneau récap (monté dans #recap-root) : commentaires de la page courante,
// groupés par section. Clic -> défilement + flash du surlignage. Édition,
// suppression, badge « introuvable » pour les orphelins.

import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import {
  useStore,
  getState,
  commentsForCurrentPage,
  updateComment,
  deleteComment,
  setActive,
  setRecapOverride,
  retrySave,
} from '../store.js?v=1';
import { flashComment } from './anchoring.js?v=1';

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

  const pageComments = commentsForCurrentPage(getState());
  const activeComments = pageComments.filter((c) => !c.resolved);
  const resolvedComments = pageComments.filter((c) => c.resolved);
  const groups = groupBySection(activeComments);

  return html`<div class="recap">
    <header class="recap__head">
      <button type="button" class="recap__close" title="Fermer le panneau" onClick=${() => setRecapOverride(false)}>✕</button>
      <h2>Commentaires</h2>
      <span class="recap__count">${activeComments.length}</span>
      ${saveState === 'saving' ? html`<span class="recap__save">…</span>` : null}
      ${saveState === 'error'
        ? html`<button type="button" class="recap__save recap__save--err" onClick=${retrySave}>⚠ réessayer</button>`
        : null}
    </header>
    <div class="recap__body">
      ${activeComments.length === 0 && resolvedComments.length === 0
        ? html`<p class="recap__empty">
            Aucun commentaire sur cette page.${' '}
            ${commentMode
              ? 'Sélectionnez du texte pour en ajouter un.'
              : 'Activez le mode « Commenter » (en haut à droite) puis sélectionnez du texte.'}
          </p>`
        : groups.map(
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
        : null}
    </div>
  </div>`;
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
