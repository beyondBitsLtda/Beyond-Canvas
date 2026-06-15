/* ════════════════════════════════════════════════════════════════════
   contextMenu.js — Menu flutuante no clique direito
   ────────────────────────────────────────────────────────────────────
   Em vez de uma barra de ferramentas sempre visível, a criação é feita
   onde o usuário está olhando. O array `tools` é a "fonte da verdade":
   adicione um item → ele aparece no menu. Fácil estender em Fases
   futuras (sticker, storyboard…).
   ════════════════════════════════════════════════════════════════════ */

import { screenToWorld } from './canvas.js';
import { createCard }    from './cards.js';
import {
  createYouTubeCard, createAudioCard, createVideoCard, pickImage,
} from './media.js';
import { createFrame }   from './storyboard.js';

const menu = document.getElementById('context-menu');
const viewport = document.getElementById('viewport');

/* Registro de ferramentas. Itens com `group` são headers de seção. */
const tools = [
  { group: 'Criar' },
  {
    icon: '¶',  label: 'Nota',     hint: 'N',
    action: (w) => createCard({ type: 'note', x: w.x, y: w.y, width: 240 }),
  },
  {
    icon: '<>', label: 'Código',   hint: 'C',
    action: (w) => createCard({
      type: 'code', x: w.x, y: w.y, width: 360,
      content: '// snippet\nfunction hello(name) {\n  return `oi, ${name}`;\n}',
    }),
  },

  { group: 'Mídia' },
  {
    icon: '▢',  label: 'Imagem',   hint: '',
    action: (w) => pickImage(w),
  },
  {
    icon: '▶',  label: 'YouTube',  hint: 'Y',
    action: (w) => createYouTubeCard({ x: w.x, y: w.y }),
  },
  {
    icon: '~',  label: 'Áudio',    hint: '',
    action: (w) => createAudioCard({ x: w.x, y: w.y }),
  },
  {
    icon: '▶',  label: 'Vídeo',    hint: '',
    action: (w) => createVideoCard({ x: w.x, y: w.y }),
  },

  { group: 'Storyboard' },
  {
    icon: '┃',  label: 'Frame mobile',  hint: '9:16',
    action: (w) => createFrame({ x: w.x, y: w.y, ratio: '9:16' }),
  },
  {
    icon: '▭',  label: 'Frame YouTube', hint: '16:9',
    action: (w) => createFrame({ x: w.x, y: w.y, ratio: '16:9' }),
  },
  {
    icon: '▢',  label: 'Frame quadrado', hint: '1:1',
    action: (w) => createFrame({ x: w.x, y: w.y, ratio: '1:1' }),
  },
  /* Stickers vivem na paleta do HUD top-right — mais discreto que poluição aqui. */

  { group: 'Canvas' },
  {
    icon: '✕',  label: 'Limpar tudo', hint: '',
    action: () => window.__whiteboardClearAll?.(),
  },
];

/* ───────── Render ───────── */
function renderMenu(frameInfo) {
  menu.innerHTML = '';

  // Banner contextual: indica que estamos criando DENTRO de um frame.
  if (frameInfo) {
    const banner = document.createElement('div');
    banner.className = 'context-menu__banner';
    banner.textContent = `anexando à cena ${frameInfo.num}`;
    menu.appendChild(banner);
  }

  tools.forEach((t, idx) => {
    if (t.group) {
      const h = document.createElement('div');
      h.className = 'context-menu__header';
      h.textContent = t.group;
      // separador discreto antes de headers que não sejam o primeiro item
      if (idx > 0) {
        const sep = document.createElement('div');
        sep.className = 'context-menu__sep';
        menu.appendChild(sep);
      }
      menu.appendChild(h);
      return;
    }
    const item = document.createElement('div');
    item.className = 'context-menu__item';
    item.innerHTML = `
      <span class="context-menu__icon">${t.icon}</span>
      <span class="context-menu__label">${t.label}</span>
      <span class="context-menu__hint">${t.hint || ''}</span>
    `;
    item.addEventListener('click', () => {
      t.action(menu._world);
      hide();
    });
    menu.appendChild(item);
  });
}

/* ───────── Hit-test: qual frame está sob este ponto do mundo? ───────── */
function frameAt(worldX, worldY) {
  let target = null;
  let smallest = Infinity;
  for (const f of document.querySelectorAll('.card--frame')) {
    const x = parseFloat(f.style.left) || 0;
    const y = parseFloat(f.style.top)  || 0;
    const w = f.offsetWidth, h = f.offsetHeight;
    if (worldX >= x && worldX <= x + w && worldY >= y && worldY <= y + h) {
      const area = w * h;
      if (area < smallest) { target = f; smallest = area; }
    }
  }
  if (!target) return null;
  return { num: target.querySelector('.card__frame-number')?.textContent || '' };
}

/* ───────── Abertura / fechamento ───────── */

function show(clientX, clientY) {
  // Memorizamos o ponto do mundo onde abrimos o menu — assim os itens
  // criam cards exatamente sob o cursor, mesmo após pan/zoom mínimos.
  menu._world = screenToWorld(clientX, clientY);
  renderMenu(frameAt(menu._world.x, menu._world.y));

  menu.hidden = false;
  const { innerWidth: vw, innerHeight: vh } = window;
  const rect = menu.getBoundingClientRect();
  const x = Math.min(clientX, vw - rect.width  - 8);
  const y = Math.min(clientY, vh - rect.height - 8);
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;
}
function hide() { menu.hidden = true; }

viewport.addEventListener('contextmenu', (e) => {
  // Se está em modo desenho, NÃO abre menu — direita pode ser usada p/ panear no futuro.
  if (document.body.classList.contains('is-drawing')) return;
  e.preventDefault();
  show(e.clientX, e.clientY);
});

document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target)) hide();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
window.addEventListener('blur', hide);

/* ───────── Atalhos: N / C / Y no centro da viewport ───────── */
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.isContentEditable || /input|textarea|select/i.test(t.tagName))) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.classList.contains('is-drawing')) return;

  const w = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
  const k = e.key.toLowerCase();

  if (k === 'n') createCard({ type: 'note', x: w.x - 120, y: w.y - 40, width: 240 });
  if (k === 'c') createCard({
    type: 'code', x: w.x - 180, y: w.y - 60, width: 360,
    content: '// snippet\nfunction hello(name) {\n  return `oi, ${name}`;\n}',
  });
  if (k === 'y') createYouTubeCard({ x: w.x - 200, y: w.y - 120 });
});
