/* ════════════════════════════════════════════════════════════════════
   app.js — Bootstrap
   ────────────────────────────────────────────────────────────────────
   Responsabilidades MÍNIMAS:
     - Dica contextual que some na primeira interação
     - Seed de onboarding na PRIMEIRA VISITA EVER (template 'welcome')
     - Aplicar seed pendente requisitado pelo projects.js ao criar um
       canvas novo a partir de template
   ════════════════════════════════════════════════════════════════════ */

import { seedTemplate } from './templates.js';
import { getActiveId }  from './projects.js';

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

/* ──────────────────────────────────────────────────────────────────
   SEED PENDENTE (canvas criado via picker em projects.js)
   ──────────────────────────────────────────────────────────────────
   Quando o usuário escolhe um template ao criar um canvas novo, o
   projects.js grava a chave em `whiteboard:seed:<projectId>` ANTES
   do reload. Aqui, depois que o canvas (vazio) carregou, consumimos
   essa chave UMA VEZ e aplicamos o seed. Persistência captura via
   autosave normal.

   Importante: roda em microtask para garantir que os outros módulos
   (cards, frames, storyboard) já registraram seus observers.
────────────────────────────────────────────────────────────────── */

queueMicrotask(() => {
  const seedKey = `whiteboard:seed:${getActiveId()}`;
  const pending = localStorage.getItem(seedKey);
  if (pending) {
    localStorage.removeItem(seedKey);   // consome ANTES — não repetir nunca
    try { seedTemplate(pending); } catch (e) { console.warn('seed pendente falhou', e); }
  }
});

/* ──────────────────────────────────────────────────────────────────
   PRIMEIRA VISITA EVER — template 'welcome'
   ──────────────────────────────────────────────────────────────────
   Flag global `whiteboard:visited` (não por projeto). Uma vez marcado,
   o usuário nunca mais recebe o onboarding automaticamente — mesmo se
   limpar o canvas. Para experimentar de novo, ele pode pedir o seed
   "Boas-vindas" via Cmd+K → "Semear template no canvas atual" (após
   removermos o filtro internal — ou seja, hoje só via console com
   `seedTemplate('welcome')`, intencional para evitar poluição).

   "Limpar tudo" do persistence.js NÃO remove este flag — então uma
   limpeza do canvas atual não traz o welcome de volta. Reset completo
   exige limpar localStorage manualmente.
────────────────────────────────────────────────────────────────── */

if (!localStorage.getItem('whiteboard:visited')) {
  localStorage.setItem('whiteboard:visited', '1');
  // Roda em microtask pela mesma razão do seed pendente.
  queueMicrotask(() => {
    try { seedTemplate('welcome'); } catch (e) { console.warn('welcome seed falhou', e); }
  });
}
