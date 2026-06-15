/* ════════════════════════════════════════════════════════════════════
   storyboard.js — Frames + Lente do Diretor + CONTENÇÃO FÍSICA
   ────────────────────────────────────────────────────────────────────
   Mudança importante: itens vinculados a um frame agora vivem DENTRO
   dele (DOM containment), não apenas "associados" por id. Implicações:

     · Ao soltar/criar um card cujo centro caia dentro de um frame, ele
       é re-parented para um container `.card__frame-contents`, onde a
       largura é 100% e o empilhamento é flex column.
     · Arrastar o frame leva os itens junto — naturalmente, por DOM.
     · Para soltar um item de volta no mundo, basta arrastá-lo pela
       barra superior: um listener em fase de CAPTURA destaca o card
       (preservando posição visual) antes do drag normal começar.
     · Frames crescem conforme recebem conteúdo (minHeight ≥ preset).
   ════════════════════════════════════════════════════════════════════ */

import { createShell } from './cards.js';
import { panTo, screenToWorld, getScale } from './canvas.js';

const world = document.getElementById('world');

/* ────── Presets de proporção (medidas iniciais) ────── */
const PRESETS = {
  '9:16': { w: 270, bodyH: 480, label: 'Mobile · 9:16' },
  '16:9': { w: 480, bodyH: 270, label: 'YouTube · 16:9' },
  '1:1':  { w: 360, bodyH: 360, label: 'Quadrado · 1:1' },
};

/* ────── Criação de frame ────── */
export function createFrame({ x, y, ratio = '9:16', label = '' }) {
  const p = PRESETS[ratio] || PRESETS['9:16'];
  const card = createShell({ type: 'frame', label: p.label, x, y, width: p.w });
  card.dataset.ratio = ratio;
  // ID estável para que cards filiados o achem ao restaurar.
  card.id = 'f_' + Math.random().toString(36).slice(2, 9);

  const body = document.createElement('div');
  body.className = 'card__frame';
  // minHeight em vez de height — o frame cresce conforme conteúdo entra.
  body.style.minHeight = `${p.bodyH}px`;
  body.innerHTML = `
    <div class="card__frame-number"></div>
    <div class="card__frame-ratio">${ratio}</div>
    <div class="card__frame-contents"></div>
    <div class="card__frame-label"
         contenteditable="true"
         spellcheck="false"
         data-placeholder="descreva a cena…"></div>
  `;
  card.appendChild(body);

  if (label) body.querySelector('.card__frame-label').textContent = label;

  // Editar título não engatilha drag do canvas.
  body.querySelector('.card__frame-label')
      .addEventListener('pointerdown', (e) => e.stopPropagation());

  queueMicrotask(updateFrameNumbers);
  return card;
}

/* ────── Ordem dos frames (numeração) ──────
   Pura ordem por X falha em multi-linha; bucket por linha primeiro.   */
function getOrderedFrames() {
  const frames = [...document.querySelectorAll('.card--frame')];
  return frames.sort((a, b) => {
    const ax = parseFloat(a.style.left) || 0;
    const ay = parseFloat(a.style.top)  || 0;
    const bx = parseFloat(b.style.left) || 0;
    const by = parseFloat(b.style.top)  || 0;
    const dy = ay - by;
    if (Math.abs(dy) > 200) return dy;
    return ax - bx;
  });
}

function updateFrameNumbers() {
  const ordered = getOrderedFrames();
  ordered.forEach((f, i) => {
    const num = f.querySelector('.card__frame-number');
    if (num) num.textContent = String(i + 1).padStart(2, '0');
  });
  const counter = document.getElementById('sb-count');
  if (counter) counter.textContent = ordered.length
    ? `${ordered.length} cena${ordered.length > 1 ? 's' : ''}`
    : '';
}

/* ────────────────────────────────────────────────────────────────────
   CONTAINMENT — attach / detach
   ──────────────────────────────────────────────────────────────────── */

function attachToFrame(card, frame) {
  const contents = frame.querySelector('.card__frame-contents');
  if (!contents) return;
  // Estilos de posicionamento no mundo não fazem sentido dentro do frame.
  card.style.removeProperty('left');
  card.style.removeProperty('top');
  card.style.removeProperty('width');
  card.style.removeProperty('z-index');
  card.dataset.frameId = frame.id;
  if (card.parentElement !== contents) contents.appendChild(card);
}

function detachToWorld(card) {
  // Captura posição visual atual em coordenadas do mundo, p/ não saltar.
  const rect = card.getBoundingClientRect();
  const tl = screenToWorld(rect.left, rect.top);
  const z  = getScale();
  card.style.left  = `${tl.x}px`;
  card.style.top   = `${tl.y}px`;
  card.style.width = `${rect.width / z}px`;
  delete card.dataset.frameId;
  world.appendChild(card);
}

/* Listener de CAPTURA: ao iniciar drag em um card que está dentro de
   um frame, destaca-o primeiro para que o handler de drag em cards.js
   possa manipular posições absolutas no mundo normalmente.            */
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const handle = e.target.closest?.('[data-drag-handle]');
  if (!handle) return;
  if (e.target.closest('.card__close')) return;
  const card = handle.closest('.card');
  if (!card) return;
  if (card.parentElement?.classList.contains('card__frame-contents')) {
    detachToWorld(card);
  }
}, true);

/* ────── Snap: encontra o menor frame cujo bbox contém o centro do card. */
function maybeSnap(card) {
  if (!card.classList || card.classList.contains('card--frame')) return;
  // Já contido em um frame? Não tentar re-snapear — move junto pela DOM.
  if (card.parentElement?.classList.contains('card__frame-contents')) return;

  const cx = (parseFloat(card.style.left) || 0) + card.offsetWidth / 2;
  const cy = (parseFloat(card.style.top)  || 0) + card.offsetHeight / 2;

  let target = null;
  let smallest = Infinity;
  for (const f of document.querySelectorAll('.card--frame')) {
    const fx = parseFloat(f.style.left) || 0;
    const fy = parseFloat(f.style.top)  || 0;
    const fw = f.offsetWidth, fh = f.offsetHeight;
    if (cx >= fx && cx <= fx + fw && cy >= fy && cy <= fy + fh) {
      const area = fw * fh;
      if (area < smallest) { target = f; smallest = area; }
    }
  }

  if (target) attachToFrame(card, target);
}

/* ────── Contagem de itens por frame ────── */
function updateFrameCounts() {
  document.querySelectorAll('.card--frame').forEach((f) => {
    const contents = f.querySelector('.card__frame-contents');
    const n = contents ? contents.children.length : 0;
    let counter = f.querySelector('.card__frame-count');
    if (n > 0) {
      if (!counter) {
        counter = document.createElement('div');
        counter.className = 'card__frame-count';
        f.querySelector('.card__frame').appendChild(counter);
      }
      counter.textContent = `${n} item${n > 1 ? 's' : ''}`;
    } else if (counter) {
      counter.remove();
    }
  });
}

/* ────── Hooks de mudança ──────
   - cardmoved em um frame:    revaliar associações de cards no mundo.
   - cardmoved em outro card:  tentar snap.
   - MutationObserver no #world (com subtree): novos cards no mundo →
     snap; entradas/saídas em frame-contents → recontar.               */

document.addEventListener('cardmoved', (e) => {
  const t = e.target;
  if (t.classList?.contains('card--frame')) {
    updateFrameNumbers();
    document.querySelectorAll('#world > .card:not(.card--frame)').forEach(maybeSnap);
  } else if (t.classList?.contains('card')) {
    maybeSnap(t);
  }
  updateFrameCounts();
});

new MutationObserver((muts) => {
  let frameChange   = false;
  let contentsChange = false;
  const newWorldCards = [];

  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (!n.classList) continue;
      if (n.classList.contains('card--frame')) {
        frameChange = true;
      } else if (n.classList.contains('card')) {
        if (m.target === world) newWorldCards.push(n);
        if (m.target.classList?.contains('card__frame-contents')) contentsChange = true;
      }
    }
    for (const n of m.removedNodes) {
      if (!n.classList) continue;
      if (n.classList.contains('card--frame')) frameChange = true;
      if (m.target.classList?.contains('card__frame-contents')) contentsChange = true;
    }
  }

  if (frameChange) {
    updateFrameNumbers();
    document.querySelectorAll('#world > .card:not(.card--frame)').forEach(maybeSnap);
    contentsChange = true;
  } else if (newWorldCards.length) {
    // RAF garante que o card já tem layout (offsetWidth/Height) antes do snap.
    requestAnimationFrame(() => {
      newWorldCards.forEach(maybeSnap);
      updateFrameCounts();
    });
  }
  if (contentsChange) updateFrameCounts();
}).observe(world, { childList: true, subtree: true });

/* Chamada externa (persistência) após restore. Respeita frameId salvo. */
export function rebuildSnaps() {
  document.querySelectorAll('#world > .card:not(.card--frame)').forEach((card) => {
    if (card.dataset.frameId) {
      const frame = document.getElementById(card.dataset.frameId);
      if (frame) { attachToFrame(card, frame); return; }
    }
    maybeSnap(card);
  });
  updateFrameNumbers();
  updateFrameCounts();
}

/* ────────────────────────────────────────────────────────────────────
   MODO STORYBOARD — toggle + play (inalterado conceitualmente)
   ──────────────────────────────────────────────────────────────────── */

const sbToggle = document.getElementById('sb-toggle');
const sbPlay   = document.getElementById('sb-play');

let isOn = false;
function setStoryboardMode(on) {
  isOn = on;
  document.body.classList.toggle('is-storyboard', on);
  sbToggle.classList.toggle('is-active', on);
  sbPlay.hidden = !on;
  if (on) updateFrameNumbers();
}
sbToggle.addEventListener('click', () => setStoryboardMode(!isOn));

let playing = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function play() {
  const frames = getOrderedFrames();
  if (!frames.length) return;
  if (playing) { playing.cancelled = true; playing = null; sbPlay.classList.remove('is-playing'); return; }

  const session = { cancelled: false };
  playing = session;
  sbPlay.classList.add('is-playing');
  document.body.classList.add('is-playing');

  for (let i = 0; i < frames.length; i++) {
    if (session.cancelled) break;
    const f = frames[i];
    const rect = frameWorldRect(f);

    const vw = window.innerWidth, vh = window.innerHeight;
    const z = Math.min(vw * 0.75 / rect.w, vh * 0.75 / rect.h);
    showBadge(i + 1, frames.length, f.querySelector('.card__frame-label')?.textContent || '');

    await panTo({
      worldX: rect.x + rect.w / 2,
      worldY: rect.y + rect.h / 2,
      z, duration: 700,
    });
    if (session.cancelled) break;
    await sleep(900);
  }

  hideBadge();
  document.body.classList.remove('is-playing');
  sbPlay.classList.remove('is-playing');
  playing = null;
}

function frameWorldRect(f) {
  return {
    x: parseFloat(f.style.left) || 0,
    y: parseFloat(f.style.top)  || 0,
    w: f.offsetWidth,
    h: f.offsetHeight,
  };
}

sbPlay.addEventListener('click', play);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && playing) { playing.cancelled = true; }
});

let badgeEl;
function showBadge(i, total, label) {
  if (!badgeEl) {
    badgeEl = document.createElement('div');
    badgeEl.className = 'play-badge';
    document.body.appendChild(badgeEl);
  }
  badgeEl.innerHTML = `
    <span class="play-badge__index">${String(i).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span>
    ${label ? `<span class="play-badge__label">${escapeHTML(label)}</span>` : ''}
  `;
  badgeEl.classList.add('is-visible');
}
function hideBadge() {
  if (badgeEl) badgeEl.classList.remove('is-visible');
}
function escapeHTML(s) {
  return String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
