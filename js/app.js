/* ════════════════════════════════════════════════════════════════════
   app.js — Bootstrap
   ────────────────────────────────────────────────────────────────────
   Responsabilidades MÍNIMAS:
     - Dica contextual que some na primeira interação
     - Seed de cards de boas-vindas SOMENTE na primeiríssima visita
       (a partir daí, a persistência cuida do estado)
   ════════════════════════════════════════════════════════════════════ */

import { createCard } from './cards.js';

const hint = document.getElementById('hint');

/* Dica some na primeira interação significativa. */
function dismissHint() {
  hint.classList.add('is-hidden');
  ['pointerdown', 'wheel', 'keydown'].forEach((ev) =>
    window.removeEventListener(ev, dismissHint, true)
  );
}
['pointerdown', 'wheel', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, dismissHint, { capture: true, once: false })
);

/* ────── Seed de boas-vindas (uma única vez na vida do storage) ──────
   Após a primeira visita, o flag persiste — mesmo que o usuário limpe
   o canvas, ele NÃO recebe os welcome cards de volta. Para reset
   completo, "Limpar tudo" remove o flag também (ver persistence.js). */

if (!localStorage.getItem('whiteboard:visited')) {
  localStorage.setItem('whiteboard:visited', '1');

  createCard({
    type: 'note',
    x: 80, y: 80,
    width: 260,
    silent: true,
    content:
`Bem-vindo ao seu canvas.

Clique com o botão direito em qualquer lugar para criar uma nota, código, frame de storyboard ou mídia. Arraste o fundo para navegar; use scroll para zoom.

Tudo é salvo automaticamente.`,
  });

  createCard({
    type: 'code',
    x: 380, y: 140,
    width: 380,
    silent: true,
    content:
`// Code card com syntax highlighting básico.
// Troque a linguagem pela barra superior.

function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const seq = Array.from({ length: 8 }, (_, i) => fibonacci(i));
console.log(seq); // [0, 1, 1, 2, 3, 5, 8, 13]`,
  });
}
