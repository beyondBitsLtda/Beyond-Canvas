/* ════════════════════════════════════════════════════════════════════
   canvas.js — Pan, Zoom e conversão de coordenadas
   ────────────────────────────────────────────────────────────────────
   Modelo mental:
     - viewport: a janela do navegador (fixa).
     - world:    plano infinito; sofre `translate(tx, ty) scale(z)`.
     - Cards vivem em coordenadas do MUNDO (não da tela).
     - Para criar um card no ponto onde o usuário clicou, convertemos
       coordenadas de tela → mundo via `screenToWorld()`.

   Esta é a única peça que toca `transform` do `#world`. Qualquer outro
   módulo que precise saber onde colocar algo pede via `getState()` ou
   `screenToWorld()`.
   ════════════════════════════════════════════════════════════════════ */

const viewport = document.getElementById('viewport');
const world    = document.getElementById('world');
const zoomLabel = document.getElementById('zoom-level');

/* Estado do canvas. Único ponto de verdade. */
const state = {
  tx: 0,             // translação x (em px de tela)
  ty: 0,             // translação y (em px de tela)
  z:  1,             // zoom (1 = 100%)
  min: 0.2,
  max: 4,
};

/* Aplica o transform e atualiza o HUD de zoom. */
function apply() {
  world.style.transform =
    `translate(${state.tx}px, ${state.ty}px) scale(${state.z})`;
  zoomLabel.textContent = `${Math.round(state.z * 100)}%`;
  // Notifica assinantes (mini-mapa, etc.)
  subscribers.forEach((cb) => cb(state));
}

/* Assinaturas externas para o estado do canvas (ler-apenas). */
const subscribers = new Set();
export function onStateChange(cb) {
  subscribers.add(cb);
  cb(state);
  return () => subscribers.delete(cb);
}

/* ───────── Pan via arrasto com botão esquerdo no fundo ───────── */
/* Pan NÃO acontece quando o usuário clica dentro de um card — esse
   caso é tratado em cards.js (drag de card). */

let isPanning = false;
let panStart  = { x: 0, y: 0, tx: 0, ty: 0 };

viewport.addEventListener('pointerdown', (e) => {
  // Só inicia pan se o alvo for o canvas em si (e não um card).
  if (e.button !== 0) return;
  if (document.body.classList.contains('is-drawing')) return;  // modo caneta/borracha tem prioridade
  if (e.target.closest('.card, .sticker')) return;
  if (e.target.closest('.draw-fab, .context-menu, .hud, .minimap, .sticker-palette')) return;

  cancelPanAnimation();              // qualquer interação do usuário cancela fly-through
  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty };
  viewport.classList.add('is-panning');
  viewport.setPointerCapture(e.pointerId);
});

viewport.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  state.tx = panStart.tx + (e.clientX - panStart.x);
  state.ty = panStart.ty + (e.clientY - panStart.y);
  apply();
});

function endPan(e) {
  if (!isPanning) return;
  isPanning = false;
  viewport.classList.remove('is-panning');
  try { viewport.releasePointerCapture(e.pointerId); } catch {}
}
viewport.addEventListener('pointerup', endPan);
viewport.addEventListener('pointercancel', endPan);

/* ───────── Zoom via wheel (com âncora no cursor) ─────────
   Mantemos o ponto sob o cursor "preso" enquanto o zoom muda — é o
   comportamento que dá a sensação de zoom natural.
   Fórmula:
     worldPoint = (screen - t) / z
     queremos: worldPoint' = worldPoint (mesma posição no mundo)
              ⇒ t' = screen - worldPoint * z'
*/
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  cancelPanAnimation();

  const rect = viewport.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // Trackpad pinch chega como ctrlKey=true; mouse wheel não.
  // Escala fator com base no deltaY para sensação suave.
  const intensity = e.ctrlKey ? 0.02 : 0.0015;
  const factor = Math.exp(-e.deltaY * intensity);

  const newZ = clamp(state.z * factor, state.min, state.max);
  if (newZ === state.z) return;

  // Ponto no mundo sob o cursor — invariante.
  const wx = (sx - state.tx) / state.z;
  const wy = (sy - state.ty) / state.z;

  state.z = newZ;
  state.tx = sx - wx * state.z;
  state.ty = sy - wy * state.z;
  apply();
}, { passive: false });

/* ───────── Botões de zoom do HUD ───────── */
document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
document.getElementById('zoom-reset').addEventListener('click', () => {
  state.tx = 0; state.ty = 0; state.z = 1; apply();
});

function zoomBy(factor) {
  // Âncora: centro da viewport.
  const rect = viewport.getBoundingClientRect();
  const sx = rect.width  / 2;
  const sy = rect.height / 2;
  const newZ = clamp(state.z * factor, state.min, state.max);
  if (newZ === state.z) return;
  const wx = (sx - state.tx) / state.z;
  const wy = (sy - state.ty) / state.z;
  state.z = newZ;
  state.tx = sx - wx * state.z;
  state.ty = sy - wy * state.z;
  apply();
}

/* ───────── Atalhos de teclado ───────── */
document.addEventListener('keydown', (e) => {
  // Ignorar se o usuário está editando texto.
  const t = e.target;
  if (t && (t.isContentEditable || /input|textarea/i.test(t.tagName))) return;

  if (e.key === '0')                       { state.tx=0; state.ty=0; state.z=1; apply(); }
  if (e.key === '+' || e.key === '=')      zoomBy(1.2);
  if (e.key === '-')                       zoomBy(1 / 1.2);
});

/* ───────── API pública (consumida pelos outros módulos) ───────── */

/** Converte coordenadas de tela (clientX/Y) → coordenadas do mundo. */
export function screenToWorld(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.tx) / state.z,
    y: (clientY - rect.top  - state.ty) / state.z,
  };
}

/** Acesso somente-leitura ao estado de pan/zoom. */
export function getState() { return { ...state }; }

/** Aplica um estado bruto (usado pela persistência ao restaurar). */
export function setStateRaw({ tx, ty, z }) {
  state.tx = tx;
  state.ty = ty;
  state.z  = clamp(z, state.min, state.max);
  apply();
}

/** Útil para o drag de cards: 1 px na tela = (1/z) px no mundo. */
export function getScale() { return state.z; }

/* Init */
apply();

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ────────────────────────────────────────────────────────────────────
   panTo() — animação suave até um ponto do mundo
   Usado pelo modo Storyboard (fly-through) e pelo mini-mapa (jump).
   Se outra animação estiver rodando, ela é cancelada antes.
   ease-out cúbica — fim suave, início responsível.
   ──────────────────────────────────────────────────────────────────── */
let panAnimation = null;
function cancelPanAnimation() {
  if (panAnimation) { panAnimation.cancelled = true; panAnimation = null; }
}

export function panTo({ worldX, worldY, z, viewportX, viewportY, duration = 700 } = {}) {
  cancelPanAnimation();
  const anim = { cancelled: false };
  panAnimation = anim;

  const rect = viewport.getBoundingClientRect();
  const vx = viewportX ?? rect.width  / 2;
  const vy = viewportY ?? rect.height / 2;

  const startTx = state.tx, startTy = state.ty, startZ = state.z;
  const targetZ = z !== undefined ? clamp(z, state.min, state.max) : state.z;
  // Para um ponto do mundo (wx, wy) cair em (vx, vy) na tela:
  //   vx = tx + wx * z  →  tx = vx - wx * z
  const targetTx = vx - worldX * targetZ;
  const targetTy = vy - worldY * targetZ;

  const t0 = performance.now();
  return new Promise((resolve) => {
    function step(now) {
      if (anim.cancelled) return resolve(false);
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - t, 3);   // ease-out cubic
      state.tx = startTx + (targetTx - startTx) * e;
      state.ty = startTy + (targetTy - startTy) * e;
      state.z  = startZ  + (targetZ  - startZ)  * e;
      apply();
      if (t < 1) requestAnimationFrame(step);
      else { panAnimation = null; resolve(true); }
    }
    requestAnimationFrame(step);
  });
}
