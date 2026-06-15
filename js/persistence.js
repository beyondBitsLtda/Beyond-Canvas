/* ════════════════════════════════════════════════════════════════════
   persistence.js — Autosave + Restore via localStorage
   ────────────────────────────────────────────────────────────────────
   Estratégia:
     - DESCARGA: a cada mudança meaningful (card movido/criado/removido,
       texto editado, desenho feito, pan/zoom), debounce 600ms e salva.
     - CARGA: ao boot, lê localStorage e reconstrói TUDO via as APIs
       públicas dos outros módulos. Após isso, dispara cardmoved em
       cada card para reconstruir associações de snap-into-frame.
     - QUOTA: se o JSON estourar (geralmente por imagens base64),
       tentamos de novo SEM imagens — o resto do estado sobrevive.
     - ORDEM: cards são salvos na ordem de z-index para preservar
       o empilhamento visual quando restaurados.
   ════════════════════════════════════════════════════════════════════ */

import { createCard }                                       from './cards.js';
import { createImageCard, createYouTubeCard,
         createAudioCard, createVideoCard }                 from './media.js';
import { createSticker }                                    from './stickers.js';
import { createFrame, rebuildSnaps }                        from './storyboard.js';
import { getActiveStorageKey }                              from './projects.js';
import { restoreStroke }                                    from './drawing.js';
import { getState, setStateRaw, onStateChange }             from './canvas.js';

// Chave do projeto ativo — fixada uma vez ao carregar o módulo. Trocar
// de projeto exige reload (ver projects.js → switchTo).
const KEY = getActiveStorageKey();
const world     = document.getElementById('world');
const drawLayer = document.getElementById('draw-layer');

/* ────── Flag de restauração ──────
   Quando true, os observers/listeners NÃO disparam save — evita um
   ciclo redundante de save/restore na inicialização.                 */
let isRestoring = true;

/* ───────────────────────────────────────────────────────
   SERIALIZAÇÃO
   ─────────────────────────────────────────────────────── */

function serialize() {
  // Cards em ordem de z-index → reconstruímos no mesmo empilhamento.
  const cards = [...world.querySelectorAll('.card')]
    .sort((a, b) => (parseFloat(a.style.zIndex) || 0) - (parseFloat(b.style.zIndex) || 0))
    .map(serializeCard)
    .filter(Boolean);

  const stickers = [...world.querySelectorAll('.sticker')].map(serializeSticker);

  const strokes = [...drawLayer.children].map(serializeStroke).filter(Boolean);

  return {
    v: 1,
    ts: Date.now(),
    canvas: getState(),
    cards, stickers, strokes,
  };
}

function serializeCard(c) {
  const type = [...c.classList].find((cls) => cls.startsWith('card--'))?.slice(6);
  if (!type) return null;
  const base = {
    type,
    x: parseFloat(c.style.left)  || 0,
    y: parseFloat(c.style.top)   || 0,
    width: parseFloat(c.style.width) || null,
  };
  if (c.dataset.frameId) base.frameId = c.dataset.frameId;

  switch (type) {
    case 'note':
      base.content = c.querySelector('.card__note')?.textContent || '';
      return base;
    case 'code': {
      const codeEl = c.querySelector('.card__code');
      base.content  = codeEl?.dataset.raw || codeEl?.textContent || '';
      base.language = c.querySelector('.card__lang')?.value || 'javascript';
      return base;
    }
    case 'image':
      base.src  = c.querySelector('.card__image')?.src || '';
      base.name = c.querySelector('.card__image')?.alt || '';
      return base;
    case 'youtube': {
      const iframe = c.querySelector('.card__yt-iframe');
      const input  = c.querySelector('.card__yt-input');
      base.url = iframe?.src?.match(/embed\/([A-Za-z0-9_-]{11})/)
        ? `https://youtu.be/${iframe.src.match(/embed\/([A-Za-z0-9_-]{11})/)[1]}`
        : (input?.value || '');
      return base;
    }
    case 'audio':
    case 'video':
      return base;   // sem estado próprio na simulação
    case 'frame':
      base.ratio = c.dataset.ratio;
      base.id    = c.id;
      base.label = c.querySelector('.card__frame-label')?.textContent || '';
      return base;
    case 'project':
      base.name = c.querySelector('.card__project-name')?.textContent || '';
      return base;
  }
  return null;
}

function serializeSticker(s) {
  return {
    id: s.dataset.stickerId,
    x:  parseFloat(s.style.left) || 0,
    y:  parseFloat(s.style.top)  || 0,
  };
}

function serializeStroke(p) {
  const points = p._points;
  if (!points || !points.length) return null;
  const kind = p.tagName.toLowerCase();
  return {
    kind,
    points: points.map((pt) => [pt.x, pt.y]),
    color: kind === 'circle' ? p.getAttribute('fill') : p.getAttribute('stroke'),
    size:  kind === 'circle'
            ? parseFloat(p.getAttribute('r')) * 2
            : parseFloat(p.getAttribute('stroke-width')) || 2,
  };
}

/* ───────────────────────────────────────────────────────
   SAVE — debounced, com fallback de quota
   ─────────────────────────────────────────────────────── */

let saveTimer = null;
function scheduleSave() {
  if (isRestoring) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}

function save() {
  let data;
  try {
    data = serialize();
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // Quase sempre QuotaExceededError por imagens base64.
    // Plano B: salva tudo MENOS as imagens.
    try {
      data.cards = data.cards.filter((c) => c.type !== 'image');
      localStorage.setItem(KEY, JSON.stringify(data));
      console.warn('persistence: imagens descartadas para caber no storage');
    } catch (e2) {
      console.warn('persistence: falha ao salvar', e2);
    }
  }
}

/* ───────────────────────────────────────────────────────
   RESTORE — reconstrói o canvas a partir do JSON salvo
   ─────────────────────────────────────────────────────── */

function restore() {
  let data;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (e) {
    console.warn('persistence: dados corrompidos, ignorando', e);
    return false;
  }

  // Frames PRIMEIRO — para que cards consigam referenciá-los via frameId.
  const frames = (data.cards || []).filter((c) => c.type === 'frame');
  const others = (data.cards || []).filter((c) => c.type !== 'frame');

  for (const f of frames) restoreCard(f);
  for (const c of others) {
    const card = restoreCard(c);
    // Preserva associação ao frame — rebuildSnaps() vai mover o card
    // para dentro do frame correspondente.
    if (card && c.frameId) card.dataset.frameId = c.frameId;
  }

  for (const s  of (data.stickers || [])) {
    try { createSticker({ id: s.id, x: s.x, y: s.y }); } catch {}
  }
  for (const st of (data.strokes  || [])) {
    try { restoreStroke(st); } catch {}
  }

  if (data.canvas) {
    try { setStateRaw(data.canvas); } catch {}
  }

  return true;
}

function restoreCard(item) {
  try {
    switch (item.type) {
      case 'note':
        return createCard({
          type: 'note', x: item.x, y: item.y, width: item.width,
          content: item.content, silent: true,
        });
      case 'code': {
        const card = createCard({
          type: 'code', x: item.x, y: item.y, width: item.width,
          content: item.content, language: item.language, silent: true,
        });
        return card;
      }
      case 'image':
        return createImageCard({
          src: item.src, x: item.x, y: item.y,
          width: item.width || 320, name: item.name || 'imagem',
        });
      case 'youtube':
        return createYouTubeCard({ x: item.x, y: item.y, url: item.url });
      case 'audio':
        return createAudioCard({ x: item.x, y: item.y });
      case 'video':
        return createVideoCard({ x: item.x, y: item.y });
      case 'frame': {
        const card = createFrame({
          x: item.x, y: item.y, ratio: item.ratio, label: item.label,
        });
        // Preservamos o ID original para que cards filiados ainda o achem.
        if (item.id) card.id = item.id;
        return card;
      }
      case 'project':
        // Tipo legado — "projeto-como-rótulo" foi removido. Saved data
        // antiga pode ainda conter; simplesmente ignoramos.
        return null;
    }
  } catch (e) {
    console.warn('persistence: card pulado', item, e);
  }
}

/* ───────────────────────────────────────────────────────
   "Limpar tudo" — expõe globalmente para o context menu
   ─────────────────────────────────────────────────────── */

window.__whiteboardClearAll = function () {
  if (!confirm('Limpar TUDO deste canvas? Esta ação não pode ser desfeita.')) return;
  localStorage.removeItem(KEY);
  location.reload();
};

/* Flush síncrono — exposto para que projects.js possa salvar o estado
   atual ANTES de trocar de projeto (senão o debounce engole o último edit). */
window.__flushPersistence = function () {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!isRestoring) save();
};

/* ───────────────────────────────────────────────────────
   BOOT — restaura e religa observers
   ─────────────────────────────────────────────────────── */

restore();
// Reavalia snap-into-frame após restore (associações dependem de posições).
rebuildSnaps();
isRestoring = false;

/* Triggers de save */
new MutationObserver(scheduleSave).observe(world,     { childList: true });
new MutationObserver(scheduleSave).observe(drawLayer, { childList: true });
document.addEventListener('cardmoved', scheduleSave);
document.addEventListener('input',     (e) => { if (e.target.closest('.card')) scheduleSave(); });
document.addEventListener('change',    (e) => { if (e.target.closest('.card')) scheduleSave(); });
onStateChange(scheduleSave);

// Save final antes de fechar (best-effort).
window.addEventListener('beforeunload', () => {
  if (saveTimer) { clearTimeout(saveTimer); save(); }
});
