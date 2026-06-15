/* ════════════════════════════════════════════════════════════════════
   projects.js — Projetos = canvases independentes
   ────────────────────────────────────────────────────────────────────
   Cada projeto é um canvas próprio, com estado isolado (cards, desenho,
   pan/zoom) no localStorage.

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

export function getActiveStorageKey() { return DATA_PREFIX + ACTIVE_AT_BOOT; }
export function getActiveId()         { return ACTIVE_AT_BOOT; }

/* ────────────────────────────────────────────────────────────────────
   API global — criar projeto com template
   ────────────────────────────────────────────────────────────────────
   Exposta como window.__createProjectWithTemplate para que search.js
   possa chamar do Cmd+K. Também usada internamente pelo botão
   "+ novo canvas" do painel.
   ──────────────────────────────────────────────────────────────────── */

async function createProjectWithTemplate(templateKey) {
  console.log('[projects] createProjectWithTemplate chamado, templateKey=', templateKey);

  let key = templateKey;
  if (key === undefined) {
    console.log('[projects] abrindo picker de templates...');
    try {
      key = await pickTemplate({ title: 'novo canvas' });
    } catch (e) {
      console.error('[projects] pickTemplate falhou:', e);
      return null;
    }
    console.log('[projects] picker resolveu com:', key);
    if (!key) return null;
  }

  try { window.__flushPersistence?.(); } catch {}

  const list = loadIndex() || [];
  const id = uid();
  list.push({ id, name: `Canvas ${list.length + 1}` });
  saveIndex(list);
  localStorage.setItem(ACTIVE_KEY, id);

  if (key && key !== 'blank') {
    localStorage.setItem(SEED_PREFIX + id, key);
  }

  console.log('[projects] novo canvas criado, id=', id, 'recarregando...');
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

  function switchTo(id) {
    if (id === ACTIVE_AT_BOOT) return close();
    try { window.__flushPersistence?.(); } catch {}
    localStorage.setItem(ACTIVE_KEY, id);
    location.reload();
  }

  function deleteProject(id) {
    const list = loadIndex() || [];
    if (list.length <= 1) return;
    const next = list.filter(p => p.id !== id);
    saveIndex(next);
    localStorage.removeItem(DATA_PREFIX + id);
    localStorage.removeItem(SEED_PREFIX + id);
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

    /* ─── Handler do botão "novo canvas" ───
       Precauções (acumuladas dos bugs anteriores):
         1. stopPropagation no pointerdown: evita que o listener global
            de fechamento do painel dispare antes do click handler.
         2. stopPropagation no click: idem.
         3. close() do painel antes de abrir picker.
         4. queueMicrotask: garante que o pointerdown atual já propagou
            antes de criar o overlay do picker.
         5. .catch para que rejeições da Promise apareçam no console.
       Se nada disto funcionar, o log abaixo vai identificar onde para. */
    const newBtn = panel.querySelector('.projects-panel__new');
    if (!newBtn) {
      console.error('[projects] botão .projects-panel__new não encontrado!');
    } else {
      newBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[projects] botão "novo canvas" clicado');
        close();
        queueMicrotask(() => {
          createProjectWithTemplate().catch((err) =>
            console.error('[projects] createProjectWithTemplate erro:', err)
          );
        });
      });
    }
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

  /* Listener global para fechar painel ao clicar fora.
     Guarda 1: não fecha se há modal-overlay aberto (picker visível).
     Guarda 2: ignora cliques dentro do próprio painel ou no trigger.   */
  document.addEventListener('pointerdown', (e) => {
    if (document.querySelector('.modal-overlay')) return;
    if (panel.hidden) return;
    if (panel.contains(e.target)) return;
    if (e.target === trigger || trigger.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
