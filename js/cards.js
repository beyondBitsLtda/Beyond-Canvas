/* ════════════════════════════════════════════════════════════════════
   cards.js — Construção e manipulação de cards
   ────────────────────────────────────────────────────────────────────
   Fase 1 entrega DOIS tipos:
     - Note Card (texto livre, contentEditable)
     - Code Card (snippet com syntax highlighting simples)

   Toda criação passa por `createCard({ type, x, y, ... })`, que coloca
   o card no MUNDO. Drag de card converte movimento de tela → mundo
   usando a escala atual do canvas (ver canvas.js → getScale).

   O arquivo é propositalmente "burro" sobre persistência — Fase futura.
   ════════════════════════════════════════════════════════════════════ */

import { getScale } from './canvas.js';

const world = document.getElementById('world');
let zCounter = 1;                 // empilhamento entre cards

/* ─────────────────────────────────────────────────────────────────────
   API pública
   ─────────────────────────────────────────────────────────────────────
   `createShell` é a base reutilizada por TODOS os tipos de card —
   inclusive os de mídia em media.js. Cuida do esqueleto: posicionamento
   no mundo, handle de arrasto, z-index e registro no DOM.

   `createCard` é só um atalho para os dois tipos da Fase 1 (note/code).
   ───────────────────────────────────────────────────────────────────── */

export function createShell({ type, label, x, y, width }) {
  const card = document.createElement('div');
  card.className = `card card--${type}`;
  card.style.left = `${x}px`;
  card.style.top  = `${y}px`;
  if (width) card.style.width = `${width}px`;
  card.style.zIndex = ++zCounter;

  card.appendChild(makeHandle(label, card));
  world.appendChild(card);
  enableDrag(card);
  return card;
}

export function createCard({ type, x, y, width, content, language, silent }) {
  const label = type === 'note' ? 'Nota' : 'Código';
  const card = createShell({ type, label, x, y, width });

  if (type === 'note') buildNote(card, content);
  if (type === 'code') buildCode(card, content, language);

  // Foca a área editável — a menos que o caller peça `silent` (restauração).
  if (!silent) {
    requestAnimationFrame(() => {
      const editable = card.querySelector('[contenteditable="true"]');
      if (editable) editable.focus();
    });
  }

  return card;
}

/* ─────────────────────────────────────────────────────────────────────
   "Handle" — barra superior com tipo, drag, e close
   ───────────────────────────────────────────────────────────────────── */

function makeHandle(label, card) {
  const h = document.createElement('div');
  h.className = 'card__handle';
  h.dataset.dragHandle = 'true';
  h.innerHTML = `
    <span class="card__type-dot"></span>
    <span class="card__type">${label}</span>
    <button class="card__close" title="Remover" aria-label="Remover">×</button>
  `;
  h.querySelector('.card__close').addEventListener('click', (e) => {
    e.stopPropagation();
    card.remove();
  });
  return h;
}

/* ─────────────────────────────────────────────────────────────────────
   NOTE CARD
   ───────────────────────────────────────────────────────────────────── */

function buildNote(card, content = '') {
  const body = document.createElement('div');
  body.className = 'card__note';
  body.contentEditable = 'true';
  body.spellcheck = false;
  body.dataset.placeholder = 'Escreva aqui…';
  body.textContent = content;
  card.appendChild(body);
}

/* ─────────────────────────────────────────────────────────────────────
   CODE CARD
   ───────────────────────────────────────────────────────────────────── */

const LANGS = ['javascript', 'python', 'plain'];

function buildCode(card, content = '', language = 'javascript') {
  // Toolbar superior
  const tb = document.createElement('div');
  tb.className = 'card__code-toolbar';

  const langSel = document.createElement('select');
  langSel.className = 'card__lang';
  LANGS.forEach((l) => {
    const opt = document.createElement('option');
    opt.value = l; opt.textContent = l;
    if (l === language) opt.selected = true;
    langSel.appendChild(opt);
  });

  const copyBtn = document.createElement('button');
  copyBtn.className = 'card__copy';
  copyBtn.textContent = 'copiar';

  tb.append(langSel, copyBtn);
  card.appendChild(tb);

  // Corpo do código — editável; mantemos texto puro em
  // `dataset.raw` e re-renderizamos o HTML colorido on blur.
  const code = document.createElement('pre');
  code.className = 'card__code';
  code.contentEditable = 'true';
  code.spellcheck = false;
  code.dataset.placeholder = '// snippet…';
  code.dataset.raw = content;
  // Render inicial já colorido (evita o truque focus→blur do app.js antigo).
  if (content) code.innerHTML = highlight(content, langSel.value);
  else        code.textContent = '';
  card.appendChild(code);

  // Re-render highlight quando o usuário sai do código.
  // (Evita brigar com a posição do caret durante a edição.)
  code.addEventListener('focus',  () => { code.textContent = code.dataset.raw || code.textContent; });
  code.addEventListener('blur',   () => {
    code.dataset.raw = code.textContent;
    code.innerHTML = highlight(code.textContent, langSel.value);
  });
  langSel.addEventListener('change', () => {
    code.innerHTML = highlight(code.dataset.raw || code.textContent, langSel.value);
  });

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code.dataset.raw || code.textContent);
      toast('Copiado');
    } catch { toast('Falha ao copiar'); }
  });
}

/* ─────────────────────────────────────────────────────────────────────
   SYNTAX HIGHLIGHTING — simples, sem dependências.
   Suficiente para JS/Python. Token-based via regex.
   ───────────────────────────────────────────────────────────────────── */

const KEYWORDS = {
  javascript: [
    'const','let','var','function','return','if','else','for','while','do',
    'switch','case','break','continue','new','class','extends','this','super',
    'import','export','from','as','default','async','await','try','catch',
    'finally','throw','typeof','instanceof','in','of','null','undefined','true','false'
  ],
  python: [
    'def','return','if','elif','else','for','while','in','not','and','or',
    'class','import','from','as','with','try','except','finally','raise',
    'lambda','pass','break','continue','True','False','None','self','yield','async','await'
  ],
  plain: []
};

function escapeHTML(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}

function highlight(src, lang) {
  if (!src) return '';
  if (lang === 'plain') return escapeHTML(src);

  const kw = KEYWORDS[lang] || [];
  // Tokenizamos manualmente para evitar quebrar strings/comentários com kw.
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);

    // Comentários
    let m;
    if (lang === 'javascript' && (m = rest.match(/^\/\/[^\n]*/)))
      { tokens.push(['com', m[0]]); i += m[0].length; continue; }
    if (lang === 'javascript' && (m = rest.match(/^\/\*[\s\S]*?\*\//)))
      { tokens.push(['com', m[0]]); i += m[0].length; continue; }
    if (lang === 'python' && (m = rest.match(/^#[^\n]*/)))
      { tokens.push(['com', m[0]]); i += m[0].length; continue; }

    // Strings
    if ((m = rest.match(/^"(?:\\.|[^"\\])*"/)) ||
        (m = rest.match(/^'(?:\\.|[^'\\])*'/)) ||
        (lang === 'javascript' && (m = rest.match(/^`(?:\\.|[^`\\])*`/))))
      { tokens.push(['str', m[0]]); i += m[0].length; continue; }

    // Números
    if ((m = rest.match(/^-?\d+(\.\d+)?/)))
      { tokens.push(['num', m[0]]); i += m[0].length; continue; }

    // Identificadores / keywords / funções
    if ((m = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))) {
      const w = m[0];
      const next = rest[w.length];
      if (kw.includes(w))           tokens.push(['key', w]);
      else if (next === '(')        tokens.push(['fn',  w]);
      else                          tokens.push(['txt', w]);
      i += w.length; continue;
    }

    // Pontuação / espaços / outros
    if ((m = rest.match(/^[\s]+/)))   { tokens.push(['txt', m[0]]); i += m[0].length; continue; }
    if ((m = rest.match(/^[(){}\[\];,.:]/))) { tokens.push(['punct', m[0]]); i += m[0].length; continue; }

    tokens.push(['txt', src[i]]); i += 1;
  }

  return tokens.map(([k, v]) => {
    const safe = escapeHTML(v);
    if (k === 'txt') return safe;
    return `<span class="tok-${k}">${safe}</span>`;
  }).join('');
}

/* ─────────────────────────────────────────────────────────────────────
   DRAG de cards
   Movimento em pixels de tela é dividido pela escala atual do canvas
   para virar deslocamento em pixels do MUNDO.
   ───────────────────────────────────────────────────────────────────── */

function enableDrag(card) {
  const handle = card.querySelector('[data-drag-handle]');
  if (!handle) return;          // permite cards sem handle (não-arrastáveis)

  // Clicar em qualquer parte do card o traz para frente.
  card.addEventListener('pointerdown', () => {
    card.style.zIndex = ++zCounter;
    document.querySelectorAll('.card.is-active').forEach((c) => c.classList.remove('is-active'));
    card.classList.add('is-active');
  });

  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    // Ignorar clique no botão de fechar
    if (e.target.closest('.card__close')) return;
    if (e.button !== 0) return;
    e.stopPropagation();          // não inicia pan do canvas
    e.preventDefault();

    drag = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: parseFloat(card.style.left) || 0,
      origTop:  parseFloat(card.style.top)  || 0,
    };
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const scale = getScale();
    card.style.left = `${drag.origLeft + (e.clientX - drag.startX) / scale}px`;
    card.style.top  = `${drag.origTop  + (e.clientY - drag.startY) / scale}px`;
    drag.moved = true;
  });

  const end = (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    try { handle.releasePointerCapture(e.pointerId); } catch {}
    // Gancho extensível: outros módulos escutam isso (storyboard, mini-mapa).
    if (moved) card.dispatchEvent(new CustomEvent('cardmoved', { bubbles: true }));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/* ─────────────────────────────────────────────────────────────────────
   Toast utilitário (exportado — usado também por media.js)
   ───────────────────────────────────────────────────────────────────── */
/* Exporta `enableDrag` para outros módulos (stickers) reusarem.
   Eles devem garantir que exista um `[data-drag-handle]` interno. */
export { enableDrag };

let toastEl;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('is-visible');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('is-visible'), 1200);
}
