/* ════════════════════════════════════════════════════════════════════
   templates.js — Templates de canvas
   ────────────────────────────────────────────────────────────────────
   Um TEMPLATE é uma função que, dado o WORLD vazio, semeia cards e
   frames usando as APIs públicas (createCard, createFrame). Ele NÃO
   sabe nada sobre persistência: roda no boot DEPOIS do restore, e
   o autosave do persistence pega o estado resultante normalmente.

   Templates ficam disponíveis em TRÊS pontos:
     1. No onboarding (primeira visita ever): template 'welcome'.
     2. Ao criar um canvas novo (projects.js abre o picker).
     3. Via Cmd+K → "ações" no search palette.

   O template 'welcome' é especial: tem `internal: true` e NÃO aparece
   no picker normal. Só é semeado explicitamente pelo seed da primeira
   visita em app.js. Ele também escreve uma frase manuscrita direto no
   #world como decoração — NÃO persiste, NÃO é card, NÃO aparece no
   mini-mapa. Some na primeira interação real do usuário.
   ════════════════════════════════════════════════════════════════════ */

import { createCard }  from './cards.js';
import { createFrame } from './storyboard.js';

/* ────────────────────────────────────────────────────────────────────
   Frase manuscrita no quadro (decorativa, não-persistente)
   ────────────────────────────────────────────────────────────────────
   Vive como elemento absoluto dentro do #world, então herda o
   transform de pan/zoom. Posicionada acima dos cards do welcome,
   centralizada horizontalmente.

   Some quando: usuário move um card, edita texto, ou pressiona uma
   tecla útil. Flag whiteboard:welcome-shown garante "uma vez na vida".
──────────────────────────────────────────────────────────────────── */

function paintWelcomeMessage() {
  if (localStorage.getItem('whiteboard:welcome-shown') === '1') return;

  const world = document.getElementById('world');
  if (!world) return;

  if (world.querySelector('.canvas-watermark')) return;   // idempotência

  const watermark = document.createElement('div');
  watermark.className = 'canvas-watermark';
  watermark.textContent = 'Bem-vindo ao mundo das ideias';
  // Cards do welcome ocupam x=80 a ~x=1170. Centro em ~625.
  watermark.style.left = '625px';
  watermark.style.top  = '-40px';
  watermark.setAttribute('aria-hidden', 'true');
  world.appendChild(watermark);

  const dismiss = () => {
    if (!watermark.isConnected) return;
    watermark.classList.add('is-leaving');
    localStorage.setItem('whiteboard:welcome-shown', '1');
    setTimeout(() => watermark.remove(), 800);
    document.removeEventListener('cardmoved', dismiss);
    world.removeEventListener('input', dismiss, true);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') dismiss();
  };
  document.addEventListener('cardmoved', dismiss);
  world.addEventListener('input', dismiss, true);
  document.addEventListener('keydown', onKey);
}

const TEMPLATES = {
  welcome: {
    name: 'Boas-vindas',
    description: 'Tour interativo das principais funcionalidades.',
    icon: '◍',
    internal: true,
    seed() {
      paintWelcomeMessage();

      // ── Coluna 1: boas-vindas + navegação + atalhos ─────────────
      createCard({
        type: 'note', x: 80, y: 80, width: 320, silent: true,
        content:
`Este é o seu Canvas.

Um quadro branco infinito para planejar, esboçar e organizar ideias. Tudo o que você criar é salvo automaticamente no seu navegador.

Este canvas inicial é seu — explore os cards abaixo, edite, mova, apague o que não usar.`,
      });

      createCard({
        type: 'note', x: 80, y: 320, width: 320, silent: true,
        content:
`COMO NAVEGAR

• Arraste o fundo para mover o quadro
• Use o scroll do mouse para dar zoom
• Botão direito em qualquer lugar abre o menu de criação
• Tecla 0 volta ao centro
• O mini-mapa no canto inferior direito mostra tudo`,
      });

      createCard({
        type: 'note', x: 80, y: 580, width: 320, silent: true,
        content:
`ATALHOS RÁPIDOS

N — nova nota
C — novo card de código
Y — novo card de YouTube
P — caneta para desenho livre
E — borracha
Cmd/Ctrl + K — busca rápida e ações`,
      });

      // ── Coluna 2: tipos de card + exemplo de código ─────────────
      createCard({
        type: 'note', x: 460, y: 80, width: 300, silent: true,
        content:
`TIPOS DE CARD

Você pode criar notas (como esta), snippets de código com syntax highlighting, imagens (arraste arquivos para o quadro), vídeos do YouTube, gravações de áudio e vídeo.

Tudo pelo clique direito ou pelo menu Cmd+K.`,
      });

      createCard({
        type: 'code', x: 460, y: 340, width: 360, silent: true,
        language: 'javascript',
        content:
`// Card de código: edite, copie, troque a linguagem
// no seletor acima. Útil para snippets, regras de
// negócio ou esboços rápidos.

function bemVindo(nome) {
  return \`olá, \${nome} — bom canvas\`;
}

console.log(bemVindo('Brayan'));`,
      });

      createCard({
        type: 'note', x: 460, y: 620, width: 360, silent: true,
        content:
`MAIS RECURSOS

• Projetos: cada canvas é separado. Crie quantos quiser pelo botão "projetos" no topo.

• Smart Stickers: ícones com comportamento (pulse, sparkle) pelo botão "stickers".

• Templates: comece um novo canvas a partir de um modelo pronto (briefing, retrospectiva, storyboard).

Quando estiver pronto, apague estes cards e comece o seu trabalho.`,
      });

      // ── Coluna 3: frame de storyboard com instruções ────────────
      createFrame({
        x: 880, y: 80, ratio: '9:16',
        label: 'FRAMES DE STORYBOARD\n\nArraste cards para dentro de um frame e eles ficam contidos. Útil para planejar cenas, telas ou etapas de um processo.\n\nUse o botão "storyboard" no topo para entrar no modo apresentação com fly-through entre frames.',
      });
    },
  },

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

/** Lista templates VISÍVEIS no picker (exclui os internos como 'welcome'). */
export function listTemplates() {
  return Object.entries(TEMPLATES)
    .filter(([, t]) => !t.internal)
    .map(([key, t]) => ({ key, ...t }));
}

/** Aplica um template no canvas atual. Aceita inclusive os internos. */
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
