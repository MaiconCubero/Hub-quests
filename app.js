'use strict';
/* ══════════════════════════════════════════════════
   ELDRICH_TERMINAL_OS — App Logic v1.0
   ══════════════════════════════════════════════════ */

window.App = (function () {

  /* ── Storage keys ─────────────────────────────── */
  const STORE_CONTRACTS = 'eto_contracts';
  const STORE_CONTACTS  = 'eto_contacts';
  const STORE_RESOLVED  = 'eto_resolved';

  /* ── State ─────────────────────────────────────── */
  let contracts    = [];
  let contacts     = [];
  let resolved     = [];
  let selectedId   = null;
  let activeFilter = 'all';
  let seqCounter   = 1;

  /* ── Utils ─────────────────────────────────────── */
  const $   = id => document.getElementById(id);
  const esc = s => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  const fmtDate  = d => d ? d.split('-').reverse().join('/') : '—';
  const todayISO = () => new Date().toISOString().split('T')[0];
  const isOverdue = d => !!(d && d < todayISO());

  /* ── Realm config ──────────────────────────────── */
  const REALM = {
    mundane:      { label:'MUNDANE',      tag:'realm-tag-mundane',      borderColor:'#1a3a5c' },
    murky:        { label:'MURKY',        tag:'realm-tag-murky',        borderColor:'#4a3a08' },
    ominous:      { label:'OMINOUS',      tag:'realm-tag-ominous',      borderColor:'#5a0a0a' },
    transcendent: { label:'TRANSCENDENT', tag:'realm-tag-transcendent', borderColor:'#0a3a1a' },
    unassigned:   { label:'UNASSIGNED',   tag:'realm-tag-unassigned',   borderColor:'#353534' },
  };
  const realm = r => REALM[r] || REALM.unassigned;

  /* ── Toast ─────────────────────────────────────── */
  let _toastTimer;
  function toast(msg, type) {
    const el = $('toast');
    const colorMap = { ok:'#a6d396', err:'#ffb4ab', info:'#b1c8e9' };
    el.style.borderColor = colorMap[type] || colorMap.ok;
    $('toast-msg').textContent = msg;
    el.style.opacity = '1';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2800);
  }

  /* ── Clock ─────────────────────────────────────── */
  function tickClock() {
    const n = new Date();
    $('clock').textContent =
      String(n.getHours()).padStart(2,'0') + ':' +
      String(n.getMinutes()).padStart(2,'0') + ':' +
      String(n.getSeconds()).padStart(2,'0');
  }
  setInterval(tickClock, 1000);
  tickClock();

  /* ── Persist ───────────────────────────────────── */
  function saveAll() {
    try {
      localStorage.setItem(STORE_CONTRACTS, JSON.stringify(contracts));
      localStorage.setItem(STORE_CONTACTS,  JSON.stringify(contacts));
      localStorage.setItem(STORE_RESOLVED,  JSON.stringify(resolved));
    } catch { toast('Storage write failed.', 'err'); }
  }

  function loadAll() {
    try {
      const c = localStorage.getItem(STORE_CONTRACTS);
      const k = localStorage.getItem(STORE_CONTACTS);
      const r = localStorage.getItem(STORE_RESOLVED);
      contracts = c ? JSON.parse(c).filter(x => x && x.id && x.name) : [];
      contacts  = k ? JSON.parse(k).filter(x => x && x.id && x.name) : [];
      resolved  = r ? JSON.parse(r).filter(x => x && x.id)           : [];
      if (contracts.length || resolved.length) {
        const all = [...contracts, ...resolved];
        seqCounter = Math.max(...all.map(x => x.seq || 0)) + 1;
      }
    } catch { contracts = []; contacts = []; resolved = []; }
  }

  /* ── Navigation ────────────────────────────────── */
  const SECTIONS = ['contracts','diagnostics','logs','network'];

  function navigate(section) {
    SECTIONS.forEach(s => {
      const el = $(`section-${s}`);
      if (el) el.classList.toggle('active', s === section);
    });

    document.querySelectorAll('#sidebar-nav .nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.section === section);
    });

    document.querySelectorAll('.nav-top-item').forEach(el => {
      const isActive = el.dataset.nav === section;
      el.style.color = isActive ? '#ffb4a8' : '';
      el.style.borderBottom = isActive ? '2px solid #ffb4a8' : '';
      el.style.paddingBottom = isActive ? '4px' : '';
      el.style.opacity = isActive ? '1' : '0.6';
    });

    if (section === 'diagnostics') renderDiagnostics();
    if (section === 'network')     renderPipeline();
    if (section === 'logs')        renderContacts();
  }

  /* ── Render Contract List ──────────────────────── */
  function renderContracts() {
    const list  = $('contracts-list');
    const noMsg = $('no-contracts');

    const visible = activeFilter === 'all'
      ? contracts
      : contracts.filter(c => c.realm === activeFilter);

    // Radial counts
    ['mundane','murky','ominous','transcendent'].forEach(r => {
      const n = contracts.filter(c => c.realm === r).length;
      const el = $(`count-${r}`);
      if (el) el.textContent = `${n} CONTRACT${n !== 1 ? 'S' : ''}`;
    });

    // Remove old cards
    Array.from(list.querySelectorAll('.contract-card')).forEach(el => el.remove());
    noMsg.style.display = visible.length ? 'none' : 'block';

    visible.forEach(c => {
      const cfg = realm(c.realm);
      const overdue = isOverdue(c.deadline);
      const card = document.createElement('div');
      card.className = 'contract-card bg-surface-container-low p-3 border-l-4 cursor-pointer transition-all';
      card.style.borderLeftColor = cfg.borderColor;
      card.dataset.id = c.id;
      card.innerHTML = `
        <div class="flex justify-between items-start mb-1">
          <span class="realm-tag ${cfg.tag} text-[9px]">${esc(cfg.label)}</span>
          <span class="font-mono text-[8px] text-outline/30">#${String(c.seq).padStart(4,'0')}</span>
        </div>
        <h3 class="font-headline text-base text-on-surface leading-snug mb-1 line-clamp-2">${esc(c.name)}</h3>
        ${c.desc ? `<p class="text-[10px] text-outline/50 italic line-clamp-1 mb-1">${esc(c.desc)}</p>` : ''}
        <div class="flex items-center justify-between mt-1.5">
          <span class="text-[8px] font-mono ${c.priority === 'CRITICAL' ? 'text-error' : 'text-outline/40'}">${esc(c.priority)}</span>
          ${c.deadline ? `<span class="text-[8px] font-mono ${overdue ? 'text-error' : 'text-outline/35'}">${overdue ? '⚠ ' : ''}${fmtDate(c.deadline)}</span>` : ''}
        </div>`;
      card.addEventListener('click', () => selectContract(c.id));
      if (selectedId === c.id) card.classList.add('selected');
      list.appendChild(card);
    });

    updateSidebarStats();
  }

  /* ── Select / Detail ───────────────────────────── */
  function selectContract(id) {
    selectedId = id;
    const c = contracts.find(x => x.id === id);
    if (!c) return;

    document.querySelectorAll('.contract-card').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });

    const cfg = realm(c.realm);
    $('detail-empty').classList.add('hidden');
    $('detail-panel').classList.remove('hidden');

    const realmTag = $('d-realm-tag');
    realmTag.className = `realm-tag ${cfg.tag}`;
    realmTag.textContent = cfg.label;

    $('d-id').textContent       = `#${String(c.seq).padStart(4,'0')}`;
    $('d-title').textContent    = c.name;
    $('d-desc').textContent     = c.desc || '— No description provided —';
    $('d-priority').textContent = c.priority;
    $('d-priority').className   = c.priority === 'CRITICAL' ? 'text-error' : 'text-on-surface/70';

    const ddl = $('d-deadline');
    ddl.textContent  = c.deadline ? (isOverdue(c.deadline) ? '⚠ ' : '') + fmtDate(c.deadline) : '—';
    ddl.className    = isOverdue(c.deadline) ? 'text-error' : 'text-on-surface/70';

    $('d-review').textContent   = fmtDate(c.review);
    $('d-status').textContent   = 'ACTIVE';
  }

  /* ── Sidebar stats ─────────────────────────────── */
  function updateSidebarStats() {
    $('sb-active').textContent   = contracts.length;
    $('sb-resolved').textContent = resolved.length;
    $('sb-contacts').textContent = contacts.length;
  }

  /* ── Modals ────────────────────────────────────── */
  function openModal(id)  { $(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { $(id).classList.add('hidden');    document.body.style.overflow = ''; }

  ['modal-contract','modal-contact'].forEach(mid => {
    $(mid).addEventListener('click', e => { if (e.target === $(mid)) closeModal(mid); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('modal-contract'); closeModal('modal-contact'); }
  });

  /* ── New / Edit contract ───────────────────────── */
  function openNewContractModal(preRealm) {
    $('modal-contract-heading').textContent = 'NEW_CONTRACT';
    $('f-contract-id').value = '';
    $('f-name').value     = '';
    $('f-desc').value     = '';
    $('f-realm').value    = preRealm || 'unassigned';
    $('f-priority').value = 'MEDIUM';
    $('f-review').value   = '';
    $('f-deadline').value = '';
    openModal('modal-contract');
    setTimeout(() => $('f-name').focus(), 60);
  }

  function saveContract() {
    const name = $('f-name').value.trim();
    if (!name) {
      $('f-name').style.borderColor = '#ffb4ab';
      $('f-name').focus();
      toast('Contract name is required.', 'err');
      return;
    }
    $('f-name').style.borderColor = '';

    const editId = $('f-contract-id').value;
    if (editId) {
      const idx = contracts.findIndex(c => c.id === editId);
      if (idx >= 0) {
        contracts[idx] = {
          ...contracts[idx],
          name, desc:     $('f-desc').value.trim(),
          realm:    $('f-realm').value,
          priority: $('f-priority').value,
          review:   $('f-review').value,
          deadline: $('f-deadline').value,
        };
        saveAll();
        renderContracts();
        selectContract(editId);
        toast('CONTRACT_UPDATED', 'info');
      }
    } else {
      const c = {
        id: uid(), seq: seqCounter++,
        name, desc: $('f-desc').value.trim(),
        realm: $('f-realm').value, priority: $('f-priority').value,
        review: $('f-review').value, deadline: $('f-deadline').value,
        createdAt: Date.now(),
      };
      contracts.unshift(c);
      saveAll();
      renderContracts();
      selectContract(c.id);
      toast(`CONTRACT_SEALED — #${String(c.seq).padStart(4,'0')}`, 'ok');
    }
    closeModal('modal-contract');
  }

  function editSelected() {
    if (!selectedId) return;
    const c = contracts.find(x => x.id === selectedId);
    if (!c) return;
    $('modal-contract-heading').textContent = 'EDIT_CONTRACT';
    $('f-contract-id').value = c.id;
    $('f-name').value        = c.name;
    $('f-desc').value        = c.desc     || '';
    $('f-realm').value       = c.realm;
    $('f-priority').value    = c.priority;
    $('f-review').value      = c.review   || '';
    $('f-deadline').value    = c.deadline || '';
    openModal('modal-contract');
  }

  function assignRealm(r) {
    if (!selectedId) return;
    const idx = contracts.findIndex(c => c.id === selectedId);
    if (idx < 0) return;
    contracts[idx].realm = r;
    saveAll();
    renderContracts();
    selectContract(selectedId);
    toast(`REALM_ASSIGNED → ${r.toUpperCase()}`, 'ok');
  }

  function resolveSelected() {
    if (!selectedId) return;
    const idx = contracts.findIndex(c => c.id === selectedId);
    if (idx < 0) return;
    resolved.unshift({ ...contracts[idx], resolvedAt: Date.now() });
    contracts.splice(idx, 1);
    selectedId = null;
    $('detail-panel').classList.add('hidden');
    $('detail-empty').classList.remove('hidden');
    saveAll();
    renderContracts();
    toast('CONTRACT_RESOLVED → DIAGNOSTICS', 'ok');
  }

  function deleteSelected() {
    if (!selectedId) return;
    if (!confirm('Permanently delete this contract?')) return;
    contracts = contracts.filter(c => c.id !== selectedId);
    selectedId = null;
    $('detail-panel').classList.add('hidden');
    $('detail-empty').classList.remove('hidden');
    saveAll();
    renderContracts();
    toast('CONTRACT_PURGED', 'err');
  }

  /* ── Filter ────────────────────────────────────── */
  function setFilter(f) {
    activeFilter = f;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      const active = btn.dataset.filter === f;
      btn.classList.toggle('bg-primary-container', active);
      btn.classList.toggle('border-primary',       active);
      btn.classList.toggle('text-[#ffb4a8]',       active);
    });
    renderContracts();
  }

  /* ── Diagnostics ───────────────────────────────── */
  function renderDiagnostics() {
    const list  = $('diag-list');
    const empty = $('diag-empty');
    list.innerHTML  = '';
    empty.style.display = resolved.length ? 'none' : 'block';

    resolved.forEach(c => {
      const cfg = realm(c.realm);
      const el = document.createElement('div');
      el.className = 'bg-surface-container p-4 sharp-bevel border border-outline/10 flex items-start gap-4';
      el.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="realm-tag ${cfg.tag} text-[8px]">${esc(cfg.label)}</span>
            <span class="font-mono text-[8px] text-outline/30">#${String(c.seq).padStart(4,'0')}</span>
            <span class="ml-auto text-[8px] font-mono text-[#a6d396] border border-[#1a4a20] bg-[#002600] px-1.5 py-0.5">RESOLVED</span>
          </div>
          <h3 class="font-headline text-base text-on-surface mb-1">${esc(c.name)}</h3>
          ${c.desc ? `<p class="text-[10px] text-outline/45 italic line-clamp-2">${esc(c.desc)}</p>` : ''}
          <div class="flex flex-wrap gap-4 mt-2 text-[8px] font-mono text-outline/30">
            ${c.deadline ? `<span>DL: ${fmtDate(c.deadline)}</span>` : ''}
            <span>RESOLVED: ${new Date(c.resolvedAt).toLocaleDateString('pt-BR')}</span>
            <span>${esc(c.priority)}</span>
          </div>
        </div>
        <button data-reopen="${c.id}" class="flex-shrink-0 border border-outline/15 hover:border-[#ffb4a8] px-2 py-1.5 text-[8px] font-label tracking-widest uppercase text-outline/35 hover:text-[#ffb4a8] transition-all">REOPEN</button>
      `;
      el.querySelector('[data-reopen]').addEventListener('click', () => reopenContract(c.id));
      list.appendChild(el);
    });

    // Stats bars
    const total = resolved.length;
    ['mundane','murky','ominous','transcendent'].forEach(r => {
      const n = resolved.filter(c => c.realm === r).length;
      const cnt = $(`dc-${r}`); const bar = $(`db-${r}`);
      if (cnt) cnt.textContent = n;
      if (bar) bar.style.width = total > 0 ? `${Math.round(n/total*100)}%` : '0%';
    });
    $('diag-total').textContent  = total;
    $('diag-active').textContent = contracts.length;
    const denom = total + contracts.length;
    $('diag-rate').textContent   = denom > 0 ? Math.round(total/denom*100) + '%' : '0%';
    updateSidebarStats();
  }

  function reopenContract(id) {
    const idx = resolved.findIndex(c => c.id === id);
    if (idx < 0) return;
    const c = resolved.splice(idx, 1)[0];
    delete c.resolvedAt;
    contracts.unshift(c);
    saveAll();
    renderDiagnostics();
    renderContracts();
    toast('CONTRACT_REOPENED → ACTIVE', 'info');
  }

  /* ── Contacts ──────────────────────────────────── */
  function openNewContactModal() {
    $('modal-contact-heading').textContent = 'REGISTER_CONTACT';
    $('f-contact-id').value = '';
    $('fc-name').value  = '';
    $('fc-role').value  = '';
    $('fc-notes').value = '';
    openModal('modal-contact');
    setTimeout(() => $('fc-name').focus(), 60);
  }

  function saveContact() {
    const name = $('fc-name').value.trim();
    if (!name) { $('fc-name').focus(); toast('Name is required.', 'err'); return; }

    const editId = $('f-contact-id').value;
    if (editId) {
      const idx = contacts.findIndex(c => c.id === editId);
      if (idx >= 0) {
        contacts[idx] = { ...contacts[idx], name, role: $('fc-role').value.trim(), notes: $('fc-notes').value.trim() };
        saveAll();
        renderContacts();
        toast('CONTACT_UPDATED', 'info');
      }
    } else {
      contacts.push({ id: uid(), name, role: $('fc-role').value.trim(), notes: $('fc-notes').value.trim(), createdAt: Date.now() });
      saveAll();
      renderContacts();
      toast('CONTACT_REGISTERED', 'ok');
    }
    closeModal('modal-contact');
  }

  function renderContacts() {
    const grid  = $('contacts-grid');
    const empty = $('logs-empty');
    grid.innerHTML  = '';
    empty.style.display = contacts.length ? 'none' : 'block';

    contacts.forEach(c => {
      const initials = c.name.split(' ').slice(0,2).map(w => (w[0]||'').toUpperCase()).join('');
      const el = document.createElement('div');
      el.className = 'bg-surface-container p-4 sharp-bevel border border-outline/10 space-y-2';
      el.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-[#1a3a5c]/30 border border-[#1a3a5c]/50 flex items-center justify-center text-[#b1c8e9] font-mono text-sm font-bold flex-shrink-0">${esc(initials)}</div>
          <div class="min-w-0 flex-1">
            <div class="font-headline text-base text-on-surface truncate">${esc(c.name)}</div>
            <div class="text-[9px] font-mono text-outline/45 truncate">${esc(c.role || '—')}</div>
          </div>
        </div>
        ${c.notes ? `<p class="text-[9px] text-outline/35 italic line-clamp-2">${esc(c.notes)}</p>` : ''}
        <div class="flex gap-1.5 pt-1 border-t border-outline/10">
          <button data-edit="${c.id}" class="flex-1 border border-outline/15 hover:border-outline/40 py-1 text-[8px] font-label tracking-widest uppercase text-outline/35 hover:text-on-surface transition-all">EDIT</button>
          <button data-del="${c.id}" class="border border-outline/15 hover:border-error px-2 py-1 flex items-center transition-all group"><span class="material-symbols-outlined text-xs group-hover:text-error">delete</span></button>
        </div>`;
      el.querySelector('[data-edit]').addEventListener('click', () => editContact(c.id));
      el.querySelector('[data-del]').addEventListener('click', () => deleteContact(c.id));
      grid.appendChild(el);
    });
    updateSidebarStats();
  }

  function editContact(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    $('modal-contact-heading').textContent = 'EDIT_CONTACT';
    $('f-contact-id').value = c.id;
    $('fc-name').value  = c.name;
    $('fc-role').value  = c.role  || '';
    $('fc-notes').value = c.notes || '';
    openModal('modal-contact');
  }

  function deleteContact(id) {
    if (!confirm('Remove this contact?')) return;
    contacts = contacts.filter(c => c.id !== id);
    saveAll();
    renderContacts();
    toast('CONTACT_PURGED', 'err');
  }

  /* ── Network Pipeline ──────────────────────────── */
  function renderPipeline() {
    const el = $('network-pipeline');
    if (!contracts.length) {
      el.innerHTML = '<div class="text-[9px] text-outline/20 font-mono text-center py-8">NO_ACTIVE_PIPELINE</div>';
      return;
    }
    el.innerHTML = '';
    const shown = contracts.slice(0, 12);
    shown.forEach(c => {
      const cfg     = realm(c.realm);
      const overdue = isOverdue(c.deadline);
      const node = document.createElement('div');
      node.className = 'bg-surface-container-low p-2.5 border-l-2 flex items-start gap-2';
      node.style.borderLeftColor = cfg.borderColor;
      node.innerHTML = `
        <span class="material-symbols-outlined text-sm flex-shrink-0 ${overdue ? 'text-error' : 'text-outline/25'}" style="font-variation-settings:'FILL' 1">${overdue ? 'warning' : 'pending'}</span>
        <div class="min-w-0 flex-1">
          <div class="text-[9px] font-mono text-on-surface truncate leading-tight">${esc(c.name)}</div>
          <div class="flex flex-wrap gap-1.5 mt-0.5 items-center">
            <span class="font-mono text-[7px] text-outline/25">#${String(c.seq).padStart(4,'0')}</span>
            <span class="realm-tag ${cfg.tag}" style="font-size:7px;padding:.1rem .3rem">${esc(cfg.label)}</span>
            ${overdue ? '<span class="text-[7px] font-mono text-error">OVERDUE</span>' : ''}
          </div>
        </div>`;
      el.appendChild(node);
    });
    if (contracts.length > 12) {
      const more = document.createElement('div');
      more.className = 'text-[8px] font-mono text-outline/25 text-center pt-2';
      more.textContent = `+ ${contracts.length - 12} more contracts`;
      el.appendChild(more);
    }
  }

  /* ── Event bindings ────────────────────────────── */
  function bindEvents() {
    // Sidebar nav
    document.querySelectorAll('#sidebar-nav .nav-item').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.section));
    });
    // Top nav
    document.querySelectorAll('.nav-top-item').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.nav));
    });
    // New contract
    $('btn-new-contract').addEventListener('click', () => openNewContractModal());
    $('fab-btn').addEventListener('click', () => openNewContractModal());
    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });
    // New contact
    $('btn-new-contact').addEventListener('click', () => openNewContactModal());
  }

  /* ── Init ──────────────────────────────────────── */
  function init() {
    loadAll();
    bindEvents();
    renderContracts();
    updateSidebarStats();
  }

  init();

  /* ── Public API (called from HTML onclick) ─────── */
  return {
    closeModal,
    saveContract,
    saveContact,
    assignRealm,
    editSelected,
    resolveSelected,
    deleteSelected,
    setFilter,
    openNewContractModal,
    openNewContactModal,
    reopenContract,
    editContact,
    deleteContact,
  };

})();
