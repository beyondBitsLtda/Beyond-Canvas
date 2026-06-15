/* ════════════════════════════════════════════════════════════════════
   collab.js — Colaboração (mesmo navegador) + Link compartilhável
   ────────────────────────────────────────────────────────────────────
   Esta é uma colaboração HONESTA para um app só-frontend:

     ● Multi-cursor entre ABAS via BroadcastChannel
       Abas abertas no mesmo navegador, no mesmo canvas, veem os
       cursores umas das outras em tempo real. Útil para demo, ou
       para você ver seu canvas em dois monitores ao mesmo tempo.

     ● Link compartilhável com snapshot embutido
       "Compartilhar" gera uma URL com o estado serializado do canvas
       no fragmento (#share=...). Ao abrir essa URL, o app oferece
       importar o snapshot como um NOVO canvas no projeto do receptor.
       Como o estado vai em base64+lz simples no hash, fica tudo no
       cliente — sem servidor.

   Limitações declaradas:
     · Edições NÃO são sincronizadas em tempo real (sem CRDT).
       Para sincronização real precisaríamos de um backend.
     · Cursores só aparecem para abas do MESMO navegador, no mesmo
       projeto. Outras pessoas precisam abrir o link compartilhado.
   ════════════════════════════════════════════════════════════════════ */

import { screenToWorld, getState, onStateChange } from './canvas.js';
import { getActiveId } from './projects.js';

const CHANNEL  = 'whiteboard:collab';
const NAMES    = ['Lince','Tatu','Capivara','Sabiá','Onça','Lobo','Coruja','Garça','Pirilampo','Beija-flor'];
const COLORS   = [
  'oklch(0.65 0.20 25)',   // vermelho coral
  'oklch(0.70 0.16 145)',  // verde
  'oklch(0.65 0.16 220)',  // azul
  'oklch(0.72 0.14 80)',   // amarelo-mostarda
  'oklch(0.60 0.20 320)',  // magenta
  'oklch(0.55 0.17 295)',  // roxo (accent)
];

/* ────── Identidade da sessão (uma por aba, persiste entre reloads) ────── */
function loadOrCreateMe() {
  // Identidade é POR ABA: usamos sessionStorage para não compartilhar
  // entre janelas. Cada aba tem nome+cor próprios.
  let me;
  try {
    const raw = sessionStorage.getItem('whiteboard:me');
    if (raw) me = JSON.parse(raw);
  } catch {}
  if (!me) {
    me = {
      id:    'u_' + Math.random().toString(36).slice(2, 9),
      name:  NAMES[Math.floor(Math.random() * NAMES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    sessionStorage.setItem('whiteboard:me', JSON.stringify(me));
  }
  return me;
}

const me        = loadOrCreateMe();
const projectId = getActiveId();
const channel   = ('BroadcastChannel' in window) ? new BroadcastChannel(CHANNEL) : null;

/* ────────────────────────────────────────────────────────────────────
   CAMADA DE CURSORES (acima do viewport, fora do mundo escalado)
   ──────────────────────────────────────────────────────────────────── */

const layer = document.createElement('div');
layer.className = 'collab-layer';
document.body.appendChild(layer);

const peers = new Map();          // peerId → { name, color, worldX, worldY, lastSeen, el }

function ensurePeerEl(peer) {
  if (peer.el) return peer.el;
  const el = document.createElement('div');
  el.className = 'collab-cursor';
  el.style.setProperty('--peer-color', peer.color);
  el.innerHTML = `
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden="true">
      <path d="M1 1 L17 9 L8 11 L11 20 L7 21 L4 12 L1 14 Z"
            fill="var(--peer-color)" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
    <span class="collab-cursor__name">${escapeHTML(peer.name)}</span>
  `;
  layer.appendChild(el);
  peer.el = el;
  return el;
}

function renderPeers() {
  // Convertemos world→tela usando o estado ATUAL do canvas desta aba.
  // Assim cada aba vê os outros nos lugares corretos, mesmo se cada uma
  // estiver em pan/zoom diferente.
  const st = getState();
  for (const peer of peers.values()) {
    const x = peer.worldX * st.scale + st.tx;
    const y = peer.worldY * st.scale + st.ty;
    const el = ensurePeerEl(peer);
    el.style.transform = `translate(${x}px, ${y}px)`;
  }
}

// Re-render quando o canvas pana/zooma — peers acompanham o movimento.
onStateChange(renderPeers);

/* Expira peers que não enviam ping há muito (5s). */
setInterval(() => {
  const now = Date.now();
  for (const [id, peer] of peers) {
    if (now - peer.lastSeen > 5000) {
      peer.el?.remove();
      peers.delete(id);
    }
  }
}, 1500);

/* ────────────────────────────────────────────────────────────────────
   EMISSÃO
   ──────────────────────────────────────────────────────────────────── */

let lastSent = 0;
let lastWX = 0, lastWY = 0;

function broadcastPointer(clientX, clientY) {
  if (!channel) return;
  const now = performance.now();
  // 30 Hz é mais que suficiente para multi-cursor; segura banda.
  if (now - lastSent < 33) { lastWX = clientX; lastWY = clientY; return; }
  lastSent = now;
  const w = screenToWorld(clientX, clientY);
  channel.postMessage({
    type: 'ptr',
    id: me.id, name: me.name, color: me.color,
    projectId,
    x: w.x, y: w.y,
    t: Date.now(),
  });
}

window.addEventListener('pointermove', (e) => broadcastPointer(e.clientX, e.clientY), { passive: true });
window.addEventListener('blur',  () => channel?.postMessage({ type: 'leave', id: me.id }));
window.addEventListener('beforeunload', () => channel?.postMessage({ type: 'leave', id: me.id }));

/* ────────────────────────────────────────────────────────────────────
   RECEPÇÃO
   ──────────────────────────────────────────────────────────────────── */

if (channel) {
  channel.onmessage = (e) => {
    const msg = e.data;
    if (!msg || msg.id === me.id) return;

    if (msg.type === 'ptr') {
      if (msg.projectId !== projectId) return;
      const existing = peers.get(msg.id);
      const peer = existing || { name: msg.name, color: msg.color };
      peer.name   = msg.name;
      peer.color  = msg.color;
      peer.worldX = msg.x;
      peer.worldY = msg.y;
      peer.lastSeen = Date.now();
      peers.set(msg.id, peer);
      // Para fluidez, render direto no recebimento.
      renderPeers();
      updatePeerStrip();
    }

    if (msg.type === 'leave') {
      const peer = peers.get(msg.id);
      if (peer) { peer.el?.remove(); peers.delete(msg.id); }
      updatePeerStrip();
    }
  };
}

/* ────────────────────────────────────────────────────────────────────
   STRIP DE PARTICIPANTES no HUD — discreta, ao lado de "projetos"
   ──────────────────────────────────────────────────────────────────── */

const strip = document.createElement('div');
strip.className = 'collab-strip';
strip.title = 'colaboradores nesta sessão';
strip.innerHTML = `
  <span class="collab-strip__dot" style="--peer-color: ${me.color}" title="você (${me.name})"></span>
`;
document.querySelector('.hud--topright')?.prepend(strip);

function updatePeerStrip() {
  // Garante exatamente um dot "você" + um por peer ativo.
  strip.innerHTML = `<span class="collab-strip__dot" style="--peer-color: ${me.color}" title="você (${me.name})"></span>`;
  for (const peer of peers.values()) {
    const dot = document.createElement('span');
    dot.className = 'collab-strip__dot';
    dot.style.setProperty('--peer-color', peer.color);
    dot.title = peer.name;
    strip.appendChild(dot);
  }
  strip.classList.toggle('has-peers', peers.size > 0);
}

/* ────────────────────────────────────────────────────────────────────
   SHARE LINK — snapshot do canvas no hash
   ──────────────────────────────────────────────────────────────────── */

import { createCard }  from './cards.js';
import { createImageCard, createYouTubeCard, createAudioCard, createVideoCard } from './media.js';
import { createFrame }  from './storyboard.js';

const SHARE_PREFIX = '#share=';

function buildShareLink() {
  // Snapshot leve: apenas cards (sem strokes, sem stickers, sem state).
  // Imagens base64 grandes podem extrapolar — avisamos.
  const cards = [...document.querySelectorAll('#world .card')].map(serializeForShare).filter(Boolean);
  const payload = { v: 1, cards, name: document.querySelector('.hud__title')?.textContent || 'Canvas' };
  const json = JSON.stringify(payload);
  // Codificação tolerante a UTF-8.
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const url = new URL(location.href);
  url.hash = SHARE_PREFIX.slice(1) + b64;
  return { url: url.toString(), bytes: b64.length };
}

function serializeForShare(c) {
  const type = [...c.classList].find((cls) => cls.startsWith('card--'))?.slice(6);
  if (!type) return null;
  const base = {
    type,
    x: parseFloat(c.style.left) || 0,
    y: parseFloat(c.style.top)  || 0,
    width: parseFloat(c.style.width) || null,
  };
  if (c.dataset.frameId) base.frameId = c.dataset.frameId;
  if (c.id && type === 'frame') base.id = c.id;

  switch (type) {
    case 'note':    base.content = c.querySelector('.card__note')?.textContent || ''; break;
    case 'code':
      base.content  = c.querySelector('.card__code')?.dataset.raw || c.querySelector('.card__code')?.textContent || '';
      base.language = c.querySelector('.card__lang')?.value || 'javascript';
      break;
    case 'image':   base.src = c.querySelector('.card__image')?.src || ''; base.name = c.querySelector('.card__image')?.alt || ''; break;
    case 'youtube': base.url = c.querySelector('.card__yt-input')?.value || ''; break;
    case 'frame':
      base.ratio = c.dataset.ratio;
      base.label = c.querySelector('.card__frame-label')?.textContent || '';
      break;
  }
  return base;
}

/* Importação: detecta hash, oferece criar novo canvas com aquele estado. */
function tryImportFromHash() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  let payload;
  try {
    const b64 = location.hash.slice(SHARE_PREFIX.length);
    payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch (e) { console.warn('share: hash inválido'); return; }

  // Marca o hash como consumido — limpamos antes do reload p/ não loopar.
  history.replaceState(null, '', location.pathname + location.search);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay is-visible';
  overlay.innerHTML = `
    <div class="modal modal--share">
      <div class="modal__head">
        <h2 class="modal__title">canvas compartilhado</h2>
        <p class="modal__subtitle">${escapeHTML(payload.name || 'Canvas')} · ${payload.cards?.length || 0} itens</p>
      </div>
      <p class="modal__body">isto vai criar um novo canvas com o snapshot recebido. seus canvases atuais não são afetados.</p>
      <div class="modal__foot modal__foot--actions">
        <button class="modal__cancel" type="button">descartar</button>
        <button class="modal__primary" type="button">importar como novo canvas</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.modal__cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.modal__primary').addEventListener('click', () => {
    importAsNewProject(payload);
    overlay.remove();
  });
}

function importAsNewProject(payload) {
  // Cria projeto novo no índice, escreve dados serializados, e troca.
  const INDEX_KEY  = 'whiteboard:projects';
  const ACTIVE_KEY = 'whiteboard:active';
  const DATA_PREFIX = 'whiteboard:v1:';

  let list = [];
  try { list = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch {}
  const id = 'p_' + Math.random().toString(36).slice(2, 9);
  const name = (payload.name || 'Compartilhado') + ' (importado)';
  list.push({ id, name });
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));

  // Convertemos para o schema esperado por persistence.restore.
  const persisted = {
    v: 1, ts: Date.now(),
    canvas: { tx: 0, ty: 0, scale: 1 },
    cards: payload.cards || [],
    stickers: [], strokes: [],
  };
  localStorage.setItem(DATA_PREFIX + id, JSON.stringify(persisted));
  localStorage.setItem(ACTIVE_KEY, id);
  location.reload();
}

/* Modal "Compartilhar" — chamado pelo Cmd+K ou botão do HUD. */
window.__openShareModal = function () {
  const { url, bytes } = buildShareLink();
  const tooBig = bytes > 50_000;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--share">
      <div class="modal__head">
        <h2 class="modal__title">compartilhar canvas</h2>
        <p class="modal__subtitle">
          o link abaixo carrega um snapshot deste canvas no destinatário.
          ${tooBig ? '<br><strong>aviso:</strong> snapshot grande — alguns serviços podem cortar a URL.' : ''}
        </p>
      </div>
      <div class="share-link">
        <input class="share-link__input" type="text" readonly value="${url}">
        <button class="share-link__copy" type="button">copiar</button>
      </div>
      <p class="modal__body" style="font-size:11px;color:var(--ink-faint);margin-top:14px;">
        snapshot estático: edições posteriores não são propagadas.
        para colaboração ao vivo, abra este canvas em outra aba do mesmo navegador.
      </p>
      <div class="modal__foot modal__foot--actions">
        <button class="modal__cancel" type="button">fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  const input  = overlay.querySelector('.share-link__input');
  const copyBt = overlay.querySelector('.share-link__copy');
  input.addEventListener('focus', () => input.select());
  copyBt.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBt.textContent = 'copiado ✓';
      setTimeout(() => { copyBt.textContent = 'copiar'; }, 1400);
    } catch { input.select(); document.execCommand('copy'); }
  });

  const close = () => { overlay.classList.remove('is-visible'); setTimeout(() => overlay.remove(), 160); };
  overlay.querySelector('.modal__cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
};

/* Pega na carga: se há hash de share, abre o prompt. */
tryImportFromHash();

function escapeHTML(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
}
