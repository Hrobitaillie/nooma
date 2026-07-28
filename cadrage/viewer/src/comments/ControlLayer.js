// Couche de contrôle des commentaires (montée dans #ui-root) :
//  - bouton bascule (haut-droite),
//  - capture de sélection -> popover de saisie,
//  - re-localisation des surlignages après chaque rendu MDX.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  useStore,
  getState,
  newId,
  addComment,
  setCommentMode,
  setDraft,
  setStatuses,
  setActive,
  setRecapOverride,
  commentsForCurrentPage,
} from '../store.js?v=1';
import { captureAnchor, relocateAll, setActiveMarks, highlightDraft, clearDraft } from './anchoring.js?v=1';

function contentEl() {
  return document.getElementById('content');
}

export function ControlLayer() {
  const commentMode = useStore((s) => s.commentMode);
  const draft = useStore((s) => s.draft);
  const renderNonce = useStore((s) => s.renderNonce);
  const comments = useStore((s) => s.comments);
  const activeId = useStore((s) => s.activeId);
  const location = useStore((s) => s.location);
  const recapOverride = useStore((s) => s.recapOverride);
  const pageCommentCount = useStore((s) => commentsForCurrentPage(s).length);

  // Panneau récap ouvert si : forcé, sinon page avec commentaires ou mode actif.
  const recapOpen = recapOverride !== null ? recapOverride : pageCommentCount > 0 || commentMode;

  useEffect(() => {
    document.body.classList.toggle('cmt-on', commentMode);
  }, [commentMode]);

  useEffect(() => {
    document.body.classList.toggle('recap-closed', !recapOpen);
  }, [recapOpen]);

  useEffect(() => {
    if (!commentMode) return undefined;
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const content = contentEl();
      if (!content || !content.contains(range.commonAncestorContainer)) return;
      if (sel.toString().trim().length < 3) return;
      const anchor = captureAnchor(content, range);
      if (!anchor) return;
      const r = range.getBoundingClientRect();
      highlightDraft(range); // met en avant le texte visé pendant la saisie
      setDraft({ anchor, rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width } });
    }
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [commentMode]);

  // Retire l'aperçu de sélection quand la popover se ferme (annulation, nav…).
  // À l'enregistrement, relocateAll reprend la main (le brouillon devient un
  // surlignage définitif).
  useEffect(() => {
    if (!draft) {
      const content = contentEl();
      if (content) clearDraft(content);
    }
  }, [draft]);

  useEffect(() => {
    const content = contentEl();
    if (!content) return undefined;
    const raf = requestAnimationFrame(() => {
      // Les commentaires résolus (fermés) ne sont plus surlignés dans la page.
      const pageComments = commentsForCurrentPage(getState()).filter((c) => !c.resolved);
      const statuses = relocateAll(content, pageComments);
      setStatuses(statuses);
      setActiveMarks(content, getState().activeId);
      attachMarkClicks(content);
    });
    return () => cancelAnimationFrame(raf);
  }, [renderNonce, comments, location.space, location.path]);

  useEffect(() => {
    const content = contentEl();
    if (content) setActiveMarks(content, activeId);
  }, [activeId]);

  return html`
    <button
      type="button"
      class="cmt-toggle"
      data-active=${commentMode ? 'true' : 'false'}
      aria-pressed=${commentMode ? 'true' : 'false'}
      onClick=${() => setCommentMode(!commentMode)}
      title=${commentMode ? 'Désactiver le mode commentaire' : 'Activer le mode commentaire'}
    >
      💬 ${commentMode ? 'Commenter : activé' : 'Commenter'}
    </button>
    ${!recapOpen
      ? html`<button
          type="button"
          class="recap-reopen"
          onClick=${() => setRecapOverride(true)}
          title="Ouvrir le panneau des commentaires"
        >💬 Commentaires${pageCommentCount ? html` <span class="recap-reopen__count">${pageCommentCount}</span>` : ''}</button>`
      : null}
    ${draft ? html`<${CommentPopover} draft=${draft} location=${location} />` : null}
  `;
}

function attachMarkClicks(content) {
  content.querySelectorAll('mark.cmt-hl').forEach((mark) => {
    if (mark.__cmtBound) return;
    mark.__cmtBound = true;
    mark.addEventListener('click', () => setActive(mark.getAttribute('data-comment-id')));
  });
}

const FORCLAUDE_KEY = 'viewer-cmt-forclaude';

function CommentPopover({ draft, location }) {
  const [text, setText] = useState('');
  // Mémorise le dernier mode choisi (batch de prompts sans re-toggler).
  const [forClaude, setForClaude] = useState(() => localStorage.getItem(FORCLAUDE_KEY) !== '0');
  const ref = useRef(null);
  const taRef = useRef(null);

  function chooseKind(v) {
    setForClaude(v);
    localStorage.setItem(FORCLAUDE_KEY, v ? '1' : '0');
  }

  useEffect(() => {
    if (taRef.current) taRef.current.focus();
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setDraft(null);
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
    }
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setDraft(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  });

  function save() {
    const value = text.trim();
    if (!value) return;
    const now = new Date().toISOString();
    addComment({
      id: newId(),
      space: location.space,
      file: location.path,
      sectionId: draft.anchor.sectionId,
      sectionTitle: draft.anchor.sectionTitle,
      quote: draft.anchor.quote,
      prefix: draft.anchor.prefix,
      suffix: draft.anchor.suffix,
      startOffset: draft.anchor.startOffset,
      commentText: value,
      forClaude: forClaude,
      createdAt: now,
      updatedAt: now,
    });
    setDraft(null);
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }

  const width = 300;
  const top = Math.min(window.innerHeight - 220, draft.rect.bottom + 8);
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, draft.rect.left));

  return html`
    <div ref=${ref} class="cmt-popover" style=${{ top: top + 'px', left: left + 'px', width: width + 'px' }}>
      <blockquote class="cmt-popover__quote">${draft.anchor.quote}</blockquote>
      <div class="cmt-kind" role="tablist">
        <button
          type="button"
          class=${'cmt-kind__btn' + (!forClaude ? ' cmt-kind__btn--active' : '')}
          onClick=${() => chooseKind(false)}
          title="Note à conserver dans la doc"
        >💬 Commentaire</button>
        <button
          type="button"
          class=${'cmt-kind__btn cmt-kind__btn--claude' + (forClaude ? ' cmt-kind__btn--active' : '')}
          onClick=${() => chooseKind(true)}
          title="Instruction à traiter par Claude"
        >🤖 Pour Claude</button>
      </div>
      <textarea
        ref=${taRef}
        class="cmt-popover__input"
        placeholder=${forClaude ? 'Instruction pour Claude…' : 'Votre commentaire…'}
        value=${text}
        onInput=${(e) => setText(e.currentTarget.value)}
      ></textarea>
      <div class="cmt-popover__actions">
        <button type="button" class="cmt-btn cmt-btn--ghost" onClick=${() => setDraft(null)}>Annuler</button>
        <button type="button" class="cmt-btn cmt-btn--accent" onClick=${save}>Enregistrer</button>
      </div>
    </div>
  `;
}
