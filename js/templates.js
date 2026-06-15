/* ════════════════════════════════════════════════════════════════════
   templates.js — Templates de canvas
   ────────────────────────────────────────────────────────────────────
   Um TEMPLATE é uma função que, dado o WORLD vazio, semeia cards e
   frames usando as APIs públicas (createCard, createFrame). Ele NÃO
   sabe nada sobre persistência: roda no boot DEPOIS do restore, e
   o autosave do persistence pega o estado resultante normalmente.

   Templates ficam disponíveis em DOIS pontos:
     1. Ao criar um canvas novo (projects.js abre o picker).
     2. Via Cmd+K → "ações" no search palette.

   O contrato com projects.js é via localStorage:
     · whiteboard:seed:<projectId> = "<templateKey>"
   Setamos antes do reload; app.js lê e dispara após o restore.
   ════════════════════════════════════════════════════════════════════ */

import { createCard }  from './cards.js';
import { createFrame } from './storyboard.js';

const TEMPLATES = {
  blank: {
    name: 'Em branco',
    description: 'Comece do zero.',
    icon: '◌',
    seed() { /* no-op */ },
  },

  storyboard6: {
    name: 'Storyboard · 6 cenas',
    description: 'Seis frames 9:16 em duas linhas. Pronto para descrever a história.',
    icon: '▥',
    seed() {
      const x0 = 120, y0 = 120;
      const fw = 270, fh = 480, gap = 40;
      const labels = [
        'Abertura — quem é o protagonista?',
        'O problema aparece',
        'Tentativa frustrada',
        'O ponto de virada',
        'A resolução em ação',
        'Resultado · CTA',
      ];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          createFrame({
            x: x0 + col * (fw + gap),
            y: y0 + row * (fh + gap + 60),
            ratio: '9:16',
            label: labels[row * 3 + col],
          });
        }
      }
    },
  },

  briefing: {
    name: 'Briefing',
    description: 'Estrutura clássica: objetivo, contexto, público, métricas.',
    icon: '✑',
    seed() {
      createCard({
        type: 'note', x: 120, y: 100, width: 480, silent: true,
        content: 'BRIEFING — [nome do projeto]\n\nUma frase de propósito.',
      });
      const sections = [
        ['Objetivo',  'O que precisa acontecer ao final.'],
        ['Contexto',  'Por que isto está sendo feito agora.'],
        ['Público',   'Quem é, como pensa, do que precisa.'],
        ['Métricas',  'Como saberemos que deu certo.'],
        ['Restrições','O que não pode ser violado.'],
        ['Riscos',    'O que pode dar errado.'],
      ];
      sections.forEach((s, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        createCard({
          type: 'note',
          x: 120 + col * 280,
          y: 260 + row * 240,
          width: 250,
          silent: true,
          content: `${s[0].toUpperCase()}\n\n${s[1]}`,
        });
      });
    },
  },

  retro: {
    name: 'Retrospectiva',
    description: 'Manter · Mudar · Tentar. Três frames 16:9 lado a lado.',
    icon: '↺',
    seed() {
      const labels = ['MANTER', 'MUDAR', 'TENTAR'];
      labels.forEach((l, i) => {
        createFrame({
          x: 120 + i * 520,
          y: 140,
          ratio: '16:9',
          label: `${l}\n\nO que você quer registrar aqui?`,
        });
      });
    },
  },

  notes: {
    name: 'Bloco de notas',
    description: 'Três notas em coluna para começar a escrever.',
    icon: '☰',
    seed() {
      for (let i = 0; i < 3; i++) {
        createCard({
          type: 'note',
          x: 160, y: 120 + i * 220, width: 320, silent: true,
          content: i === 0 ? 'Comece aqui…' : '',
        });
      }
    },
  },

  code: {
    name: 'Snippet de código',
    description: 'Um card de código pronto. Ótimo para esboçar uma função.',
    icon: '⌗',
    seed() {
      createCard({
        type: 'code', x: 160, y: 140, width: 480, silent: true,
        language: 'javascript',
        content:
`// Esboço.
function hello(name) {
  return \`olá, \${name}\`;
}

console.log(hello('mundo'));`,
      });
    },
  },
};

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({ key, ...t }));
}

export function seedTemplate(key) {
  const t = TEMPLATES[key];
  if (!t) return false;
  try { t.seed(); return true; } catch (e) { console.warn('template seed falhou', e); return false; }
}

/* ────────────────────────────────────────────────────────────────────
   PICKER MODAL — usado por projects.js no fluxo "novo canvas"
   Resolve com a key escolhida (ou null se cancelado).
   ──────────────────────────────────────────────────────────────────── */

export function pickTemplate({ title = 'novo canvas' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--templates" role="dialog" aria-label="${title}">
        <div class="modal__head">
          <h2 class="modal__title">${title}</h2>
          <p class="modal__subtitle">escolha um ponto de partida</p>
        </div>
        <div class="modal__grid"></div>
        <div class="modal__foot">
          <button class="modal__cancel" type="button">cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const grid = overlay.querySelector('.modal__grid');
    listTemplates().forEach((t) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-card__icon">${t.icon}</div>
        <div class="template-card__name">${t.name}</div>
        <div class="template-card__desc">${t.description}</div>
      `;
      card.addEventListener('click', () => close(t.key));
      grid.appendChild(card);
    });

    function close(key) {
      overlay.classList.add('is-leaving');
      setTimeout(() => overlay.remove(), 180);
      document.removeEventListener('keydown', onKey);
      resolve(key);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.querySelector('.modal__cancel').addEventListener('click', () => close(null));
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => overlay.classList.add('is-visible'));
  });
}
