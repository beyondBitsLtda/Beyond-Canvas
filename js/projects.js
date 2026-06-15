/* ════════════════════════════════════════════════════════════════════
   projects.js — Projetos = canvases independentes
   ────────────────────────────────────────────────────────────────────
   Mudança da Fase 5: o conceito de "projeto" deixa de ser um rótulo no
   mesmo canvas infinito e passa a ser um CONTEXTO completamente
   SEPARADO — cada projeto é um canvas próprio, com seu estado isolado
   (cards, desenho, pan/zoom).

   Layout no localStorage:
     · whiteboard:projects        → índice [{ id, name }, ...]
     · whiteboard:active          → id do projeto ativo
     · whiteboard:v1:<id>         → estado completo daquele canvas
     · whiteboard:seed:<id>       → template a aplicar no próximo boot
                                    (consumido por app.js)

   Fluxo "novo canvas com template":
     1. Usuário clica "+ novo canvas" no painel OU usa Cmd+K → "Novo
        canvas a partir de template".
     2. Picker de templates abre. Se cancelar, nada acontece.
     3. Se escolher, criamos um projeto novo, registramos a chave do
        seed em whiteboard:seed:<novoId>, marcamos como ativo, reload.
     4. app.js consome a chave após o restore e aplica o seed.

   Migração suave: se existir o antigo whiteboard:v1 sem índice, ele é
   movido para o primeiro projeto criado automaticamente.

   Troca de projeto = location.reload() (após flush do canvas atual).
   ════════════════════════════════════════════════════════════════════ */

import { pickTemplate } from './templates.js';

const INDEX_KEY   = 'whiteboard:projects';
const ACTIVE_KEY  = 'whiteboard:active';
const DATA_PREFIX = 'whiteboard:v1:';
const SEED_PREFIX = 'whiteboard:seed:';

const uid = () => 'p_' + Math.random().toString(36).slice(2, 9);

function loadIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch {}
  return null;
}
function saveIndex(list) { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); }

/* ────── Bootstrap (uma vez por carregamento) ────── */
function bootstrap() {
  let list = loadIndex();
  if (!list) {
    const id = uid();
    list = [{ id, name: 'Canvas 1' }];
    // Migra dados antigos do canvas único, se existirem.
    const oldData = localStorage.getItem('whiteboard:v1');
    if (oldData) {
      localStorage.setItem(DATA_PREFIX + id, oldData);
      localStorage.removeItem('whiteboard:v1');
    }
    saveIndex(list);
    localStorage.setItem(ACTIVE_KEY, id);
  }
  let active = localStorage.getItem(ACTIVE_KEY);
  if (!active || !list.some(p => p.id === active)) {
    active = list[0].id;
    localStorage.setItem(ACTIVE_KEY, active);
  }
  return active;
}

const ACTIVE_AT_BOOT = bootstrap();

/* API consumida pelo persistence.js. O KEY é fixo durante a sessão —
   trocar de projeto exige reload (e flush antes). */
export function getActiveStorageKey() { return DATA_PREFIX + ACTIVE_AT_BOOT; }
export function getActiveId()         { return ACTIVE_AT_BOOT; }

/* ────────────────────────────────────────────────────────────────────
   API global — criar projeto com template
   ────────────────────────────────────────────────────────────────────
   Exposta como window.__createProjectWithTemplate para que search.js
   possa chamar do Cmd+K. Também usada internamente pelo botão
   "+ novo canvas" do painel.

   `templateKey` opcional: se omitido, abre o picker. Se for 'blank'
   ou inexistente, nenhum seed é registrado (canvas vazio).
   ──────────────────────────────────────────────────────────────────── */

async function createProjectWithTemplate(templateKey) {
  let key = templateKey;
  if (key === undefined) {
    key = await pickTemplate({ title: 'novo canvas' });
    if (!key) return null;          // cancelado
  }

  // Flush do canvas atual antes de criar o próximo.
  try { window.__flushPersistence?.(); } catch {}

  const list = loadIndex() || [];
  const id = uid();
  list.push({ id, name: `Canvas ${list.length + 1}` });
  saveIndex(list);
  localStorage.setItem(ACTIVE_KEY, id);

  // Registra seed pendente APENAS se não for "em branco".
  if (key && key !== 'blank') {
    localStorage.setItem(SEED_PREFIX + id, key);
  }

  location.reload();
  return id;
}

window.__createProjectWithTemplate = createProjectWithTemplate;

/* ────────────────────────────────────────────────────────────────────
   UI — painel "projetos" no HUD
   ──────────────────────────────────────────────────────────────────── */

function getActiveName() {
  const list = loadIndex() || [];
  return list.find(p => p.id === ACTIVE_AT_BOOT)?.name || 'Canvas';
}
const titleEl = document.querySelector('.hud__title');
function updateTitle() { if (titleEl) titleEl.textContent = getActiveName(); }
updateTitle();

const trigger = document.getElementById('proj-toggle');
if (trigger) {
  const panel = document.createElement('div');
  panel.className = 'projects-panel';
  panel.hidden = true;
  document.body.appendChild(panel);

  /* ───── Operações ───── */

  function switchTo(id) {
    if (id === ACTIVE_AT_BOOT) return close();
    // Flush em memória antes de trocar — caso contrário o próximo boot
    // perde alterações pendentes do debounce.
    try { window.__flushPersistence?.(); } catch {}
    localStorage.setItem(ACTIVE_KEY, id);
    location.reload();
  }

  function deleteProject(id) {
    const list = loadIndex() || [];
    if (list.length <= 1) return;          // sempre ao menos 1 projeto
    const next = list.filter(p => p.id !== id);
    saveIndex(next);
    localStorage.removeItem(DATA_PREFIX + id);
    localStorage.removeItem(SEED_PREFIX + id);   // limpa seed órfão se houver
    if (id === ACTIVE_AT_BOOT) {
      localStorage.setItem(ACTIVE_KEY, next[0].id);
      location.reload();
    } else {
      render();
    }
  }

  function renameProject(id, newName) {
    const list = loadIndex() || [];
    const p = list.find(x => x.id === id);
    if (!p) return;
    p.name = newName.trim() || p.name;
    saveIndex(list);
    if (id === ACTIVE_AT_BOOT) updateTitle();
  }

  /* ───── Render ───── */

  function render() {
    const list = loadIndex() || [];
    panel.innerHTML = `
      <div class="projects-panel__title">projetos · ${list.length}</div>
      <div class="projects-panel__list"></div>
      <button class="projects-panel__new" type="button">
        <span class="projects-panel__plus">+</span>
        <span>novo canvas</span>
      </button>
    `;
    const listEl = panel.querySelector('.projects-panel__list');

    list.forEach((p, i) => {
      const isActive = p.id === ACTIVE_AT_BOOT;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'projects-panel__item' + (isActive ? ' is-active' : '');
      item.innerHTML = `
        <span class="projects-panel__index">${String(i + 1).padStart(2, '0')}</span>
        <span class="projects-panel__name" spellcheck="false">${escapeHTML(p.name)}</span>
        <span class="projects-panel__current" aria-hidden="true">${isActive ? '●' : ''}</span>
        ${list.length > 1 ? `<span class="projects-panel__del" role="button" title="Apagar canvas" aria-label="Apagar">×</span>` : ''}
      `;

      const nameEl = item.querySelector('.projects-panel__name');

      item.addEventListener('click', (e) => {
        if (e.target.closest('.projects-panel__del')) return;
        if (nameEl.isContentEditable) return;
        switchTo(p.id);
      });

      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(nameEl, p.id);
      });

      const del = item.querySelector('.projects-panel__del');
      if (del) del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Apagar "${p.name}"? Cards e desenhos vão junto.`)) deleteProject(p.id);
      });

      listEl.appendChild(item);
    });

    panel.querySelector('.projects-panel__new').addEventListener('click', () => {
      close();
      createProjectWithTemplate();    // abre picker
    });
  }

  function startRename(nameEl, id) {
    nameEl.contentEditable = 'true';
    nameEl.focus();
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = () => {
      nameEl.contentEditable = 'false';
      renameProject(id, nameEl.textContent);
    };
    nameEl.addEventListener('blur', finish, { once: true });
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); nameEl.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); nameEl.blur(); }
    });
  }

  /* ───── Open / close ───── */

  function open() {
    render();
    panel.hidden = false;
    const r = trigger.getBoundingClientRect();
    panel.style.top   = `${r.bottom + 8}px`;
    panel.style.right = `${window.innerWidth - r.right}px`;
    trigger.classList.add('is-active');
  }
  function close() {
    panel.hidden = true;
    trigger.classList.remove('is-active');
  }
  function toggle() { panel.hidden ? open() : close(); }

  trigger.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== trigger
        && !trigger.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
