// ==========================================================================
// LETTERS MODULE — persistent state via localStorage
// ==========================================================================

// ── Data Store ─────────────────────────────────────────────────────────────
// Structure:
// locationsDB = {
//   "Bhairahawa PD": { districts: { "Rupandehi": ["NT Bhairahawa Office", ...], ... } },
//   ...
// }
// lettersDB = [ { id, subject, date, pd, district, office, fileName, savedAt }, ... ]

const LOCATIONS_KEY = 'letters_locationsDB';
const LETTERS_KEY   = 'letters_records';

// Default seed data
const DEFAULT_LOCATIONS = {
  "Provincial Directorate Bhairahawa": {
    districts: {
      "Rupandehi": ["NT Bhairahawa Office", "TPCC Bhairahawa"],
      "Kapilvastu": ["NT Kapilvastu Office"],
    }
  },
  "Provincial Directorate Pokhara": {
    districts: {
      "Kaski": ["NT Pokhara Office", "NT Lakeside Branch"],
      "Syangja": ["NT Syangja Office"],
    }
  },
  "Provincial Directorate Kathmandu": {
    districts: {
      "Kathmandu": ["NT Head Office", "NT Chabahil Branch"],
      "Lalitpur": ["NT Patan Office"],
      "Bhaktapur": ["NT Bhaktapur Office"],
    }
  }
};

function loadLocations() {
  const raw = localStorage.getItem(LOCATIONS_KEY);
  return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_LOCATIONS));
}

function saveLocations(db) {
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(db));
}

function loadLetters() {
  const raw = localStorage.getItem(LETTERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveLetters(arr) {
  localStorage.setItem(LETTERS_KEY, JSON.stringify(arr));
}

// ── Selected file reference ─────────────────────────────────────────────────
let selectedFile = null;

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  selectedFile = file;
  const label = document.getElementById('dropzoneLabel');
  if (label) {
    label.textContent = `✓ ${file.name}`;
    label.style.color = 'var(--success)';
  }
  const zone = document.getElementById('fileDropzone');
  if (zone) zone.classList.add('has-file');
}

// Drag-and-drop wiring
window.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('fileDropzone');
  if (!zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      selectedFile = file;
      document.getElementById('letterFile').files = e.dataTransfer.files;
      const label = document.getElementById('dropzoneLabel');
      if (label) { label.textContent = `✓ ${file.name}`; label.style.color = 'var(--success)'; }
      zone.classList.add('has-file');
    }
  });

  initLetters();
});

// ── Initialise dropdowns ────────────────────────────────────────────────────
function initLetters() {
  populatePDDropdown();
  renderLettersList();
}

function populatePDDropdown() {
  const db  = loadLocations();
  const sel = document.getElementById('selPD');
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = '<option value="">— Select —</option>';
  Object.keys(db).forEach(pd => {
    const opt = document.createElement('option');
    opt.value = pd;
    opt.textContent = pd;
    if (pd === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onPDChange() {
  const db       = loadLocations();
  const pd       = document.getElementById('selPD').value;
  const distSel  = document.getElementById('selDistrict');
  const offSel   = document.getElementById('selOffice');

  // Reset child selects
  distSel.innerHTML = '<option value="">— Select —</option>';
  offSel.innerHTML  = '<option value="">— Select District first —</option>';
  offSel.disabled   = true;

  if (!pd || !db[pd]) {
    distSel.disabled = true;
    return;
  }

  distSel.disabled = false;
  Object.keys(db[pd].districts).forEach(dist => {
    const opt = document.createElement('option');
    opt.value = dist;
    opt.textContent = dist;
    distSel.appendChild(opt);
  });
}

function onDistrictChange() {
  const db      = loadLocations();
  const pd      = document.getElementById('selPD').value;
  const dist    = document.getElementById('selDistrict').value;
  const offSel  = document.getElementById('selOffice');

  offSel.innerHTML = '<option value="">— Select —</option>';
  offSel.disabled  = true;

  if (!pd || !dist || !db[pd]?.districts[dist]) return;

  offSel.disabled = false;
  db[pd].districts[dist].forEach(office => {
    const opt = document.createElement('option');
    opt.value = office;
    opt.textContent = office;
    offSel.appendChild(opt);
  });
}

// ── Inline Add-Option ───────────────────────────────────────────────────────
function showAddOption(level) {
  const row = document.getElementById(`add-row-${level}`);
  if (!row) return;
  row.classList.toggle('hidden');
  const input = document.getElementById(`add-input-${level}`);
  if (input && !row.classList.contains('hidden')) input.focus();
}

function confirmAdd(level) {
  const input = document.getElementById(`add-input-${level}`);
  const value = input ? input.value.trim() : '';
  if (!value) return;

  const db = loadLocations();

  if (level === 'pd') {
    if (!db[value]) {
      db[value] = { districts: {} };
    }
    saveLocations(db);
    populatePDDropdown();
    document.getElementById('selPD').value = value;
    onPDChange();

  } else if (level === 'district') {
    const pd = document.getElementById('selPD').value;
    if (!pd) { alert('Please select a Provincial Directorate first.'); return; }
    if (!db[pd].districts[value]) {
      db[pd].districts[value] = [];
    }
    saveLocations(db);
    onPDChange();
    document.getElementById('selDistrict').value = value;
    onDistrictChange();

  } else if (level === 'office') {
    const pd   = document.getElementById('selPD').value;
    const dist = document.getElementById('selDistrict').value;
    if (!pd || !dist) { alert('Please select Province and District first.'); return; }
    if (!db[pd].districts[dist].includes(value)) {
      db[pd].districts[dist].push(value);
    }
    saveLocations(db);
    onDistrictChange();
    document.getElementById('selOffice').value = value;
  }

  // Clear and hide
  if (input) input.value = '';
  showAddOption(level);
}

// Allow Enter key in add-inputs
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'add-input-pd')       confirmAdd('pd');
  if (e.target.id === 'add-input-district') confirmAdd('district');
  if (e.target.id === 'add-input-office')   confirmAdd('office');
});

// ── Save Record ─────────────────────────────────────────────────────────────
function saveLetterRecord() {
  const subject  = document.getElementById('letterSubject')?.value.trim();
  const date     = document.getElementById('letterDate')?.value;
  const pd       = document.getElementById('selPD')?.value;
  const district = document.getElementById('selDistrict')?.value;
  const office   = document.getElementById('selOffice')?.value;

  if (!subject) { highlight('letterSubject'); return; }
  if (!pd)      { highlight('selPD');         return; }

  const record = {
    id:       Date.now(),
    subject,
    date:     date || new Date().toISOString().slice(0, 10),
    pd,
    district: district || '—',
    office:   office   || '—',
    fileName: selectedFile ? selectedFile.name : null,
    savedAt:  new Date().toLocaleString(),
  };

  const letters = loadLetters();
  letters.unshift(record);
  saveLetters(letters);

  // Reset form
  document.getElementById('letterSubject').value = '';
  document.getElementById('letterDate').value    = '';
  document.getElementById('selPD').value         = '';
  onPDChange();
  selectedFile = null;
  const label = document.getElementById('dropzoneLabel');
  if (label) { label.textContent = 'Click to upload or drag & drop'; label.style.color = ''; }
  const zone = document.getElementById('fileDropzone');
  if (zone) zone.classList.remove('has-file');

  renderLettersList();
}

function highlight(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('input-error');
  el.focus();
  setTimeout(() => el.classList.remove('input-error'), 1500);
}

// ── Render Records List ─────────────────────────────────────────────────────
function renderLettersList() {
  const container  = document.getElementById('lettersList');
  if (!container) return;

  const query   = (document.getElementById('lettersSearch')?.value || '').toLowerCase();
  const letters = loadLetters().filter(l =>
    !query || l.subject.toLowerCase().includes(query) || l.pd.toLowerCase().includes(query)
  );

  if (!letters.length) {
    container.innerHTML = `
      <div class="letters-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
        <p>${query ? 'No results found.' : 'No letters saved yet.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = letters.map(l => `
    <div class="letter-record-item" id="rec-${l.id}">
      <div class="rec-main">
        <div class="rec-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <div class="rec-info">
          <div class="rec-subject">${escHtml(l.subject)}</div>
          <div class="rec-meta">
            <span>${escHtml(l.pd)}</span>
            ${l.district !== '—' ? `<span>›</span><span>${escHtml(l.district)}</span>` : ''}
            ${l.office   !== '—' ? `<span>›</span><span>${escHtml(l.office)}</span>`   : ''}
          </div>
          <div class="rec-date">${l.date} &nbsp;·&nbsp; ${l.savedAt}${l.fileName ? ` &nbsp;·&nbsp; 📎 ${escHtml(l.fileName)}` : ''}</div>
        </div>
      </div>
      <button class="rec-delete-btn" onclick="deleteLetterRecord(${l.id})" title="Delete record">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
      </button>
    </div>
  `).join('');
}

function deleteLetterRecord(id) {
  if (!confirm('Delete this letter record?')) return;
  const updated = loadLetters().filter(l => l.id !== id);
  saveLetters(updated);
  renderLettersList();
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
