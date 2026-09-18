// ==========================================================================
// LETTERS MODULE — Firebase Cloud Sync, RBAC & Nepali Calendar
// ==========================================================================

const MAX_FILE_SIZE_KB = 200;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_KB * 1024;

const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

// ── Cascading Dropdown Seed Data ───────────────────────────────────────────
const LOCATIONS_KEY = 'letters_locationsDB';
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

// ── IndexedDB Database Storage Engine (Offline cache) ─────────────────────
const DB_NAME = 'PrabinkPortalDB';
const DB_VERSION = 2;
const STORE_NAME = 'letters_records';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('letters_records')) {
        db.createObjectStore('letters_records', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('notes_records')) {
        db.createObjectStore('notes_records', { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function dbSaveRecord(record) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('IndexedDB write error, fallback to localStorage', err);
    const local = loadLettersLocalStorage();
    const idx = local.findIndex(l => String(l.id) === String(record.id));
    if (idx >= 0) local[idx] = record;
    else local.unshift(record);
    saveLettersLocalStorage(local);
  }
}

async function dbGetAllRecords() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('IndexedDB read error, fallback to localStorage', err);
    return loadLettersLocalStorage();
  }
}

async function dbDeleteRecord(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete error', err);
    const local = loadLettersLocalStorage().filter(l => String(l.id) !== String(id));
    saveLettersLocalStorage(local);
  }
}

function loadLettersLocalStorage() {
  const raw = localStorage.getItem('letters_records');
  return raw ? JSON.parse(raw) : [];
}

function saveLettersLocalStorage(arr) {
  try {
    localStorage.setItem('letters_records', JSON.stringify(arr));
  } catch (e) {
    console.warn('localStorage full');
  }
}

// ── Unified Storage Manager (Firestore with Local Cache & Cloud Sync) ───────
async function getAllLettersCombined() {
  const localRecords = await dbGetAllRecords();
  
  if (typeof fbGetAllLetters === 'function' && typeof firestoreDb !== 'undefined' && firestoreDb) {
    try {
      const fbLetters = await fbGetAllLetters();
      if (Array.isArray(fbLetters)) {
        const mergedMap = new Map();
        const cloudIdSet = new Set();
        
        // Add all authoritative cloud records
        for (const rec of fbLetters) {
          const idStr = String(rec.id);
          mergedMap.set(idStr, rec);
          cloudIdSet.add(idStr);
          await dbSaveRecord(rec);
        }
        
        // Handle local records
        for (const localRec of localRecords) {
          const idStr = String(localRec.id);
          if (localRec._isCloud && !cloudIdSet.has(idStr)) {
            // Document was deleted from Firestore cloud — prune local cache
            await dbDeleteRecord(localRec.id);
          } else if (!cloudIdSet.has(idStr)) {
            // Local offline record created while offline
            mergedMap.set(idStr, localRec);
            
            // Sync to Firestore if user has access
            const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            const canSync = typeof hasLettersAccess === 'function' ? hasLettersAccess(currentUser) : false;
            if (canSync && !localRec._syncing) {
              localRec._syncing = true;
              fbSaveLetter(localRec).then(async (cloudSaved) => {
                if (cloudSaved && cloudSaved.id) {
                  await dbDeleteRecord(localRec.id);
                  localRec.id = cloudSaved.id;
                  localRec._isCloud = true;
                  localRec._syncing = false;
                  await dbSaveRecord(localRec);
                  if (typeof renderLettersList === 'function') {
                    renderLettersList();
                  }
                }
              }).catch(() => {
                localRec._syncing = false;
              });
            }
          }
        }
        
        return Array.from(mergedMap.values());
      }
    } catch (e) {
      console.warn('Letters cloud merge error, using local:', e);
    }
  }
  
  return localRecords;
}

// ── Nepali BS Date Dropdown Population (Years 2070 - 2099 BS) ─────────────
function initBSDateDropdowns(prefix = 'bs') {
  const yearSel  = document.getElementById(`${prefix}Year`);
  const monthSel = document.getElementById(`${prefix}Month`);
  const daySel   = document.getElementById(`${prefix}Day`);

  if (!yearSel || !monthSel || !daySel) return;

  // Populate Years 2070 to 2099 BS (Default 2083)
  yearSel.innerHTML = '';
  for (let y = 2070; y <= 2099; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `${y} BS`;
    if (y === 2083) opt.selected = true;
    yearSel.appendChild(opt);
  }

  // Populate Months (Baisakh to Chaitra)
  monthSel.innerHTML = '';
  BS_MONTHS.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = idx + 1; // 1-12
    opt.textContent = `${name} (${idx + 1})`;
    if (idx + 1 === 4) opt.selected = true; // Default Shrawan (4)
    monthSel.appendChild(opt);
  });

  // Populate Days 1 to 32
  daySel.innerHTML = '';
  for (let d = 1; d <= 32; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `${d} गते`;
    if (d === 15) opt.selected = true; // Default 15
    daySel.appendChild(opt);
  }
}

function getSelectedBSDate(prefix = 'bs') {
  const year = parseInt(document.getElementById(`${prefix}Year`)?.value) || 2083;
  const month = parseInt(document.getElementById(`${prefix}Month`)?.value) || 4;
  const day = parseInt(document.getElementById(`${prefix}Day`)?.value) || 15;

  const monthName = BS_MONTHS[month - 1] || '';
  const dateDisplay = `${day} ${monthName} ${year} BS`;
  const sortKey = Number(String(year) + String(month).padStart(2, '0') + String(day).padStart(2, '0'));

  return { year, month, day, dateDisplay, sortKey };
}

// ── File Selection, Auto-Compression & Preview ────────────────────────────
let selectedFile = null;
let selectedFileData = null;

let editSelectedFile = null;
let editSelectedFileData = null;

// Automatically resize and compress image to fit within Firestore limit (~100-180KB)
function compressImageFile(file, maxDimension = 1280, quality = 0.75) {
  return new Promise((resolve) => {
    // If not an image or SVG, read as standard data URL
    if (!file.type || !file.type.startsWith('image/') || file.type.includes('svg')) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-clarity compressed JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const label = document.getElementById('dropzoneLabel');
  if (label) {
    label.textContent = `⏳ Optimizing ${file.name}…`;
    label.style.color = 'var(--primary)';
  }

  try {
    const compressedData = await compressImageFile(file);
    if (!compressedData) {
      alert("Failed to process image file. Please try another image.");
      return;
    }

    selectedFile = file;
    selectedFileData = compressedData;

    // Estimate size of compressed base64
    const approxSizeKb = Math.round((compressedData.length * 0.75) / 1024);
    showUploadPreview(selectedFileData, file.name, approxSizeKb * 1024);

    if (label) {
      label.textContent = `✓ ${file.name} (~${approxSizeKb} KB)`;
      label.style.color = 'var(--success)';
    }
    const zone = document.getElementById('fileDropzone');
    if (zone) zone.classList.add('has-file');

  } catch (err) {
    console.error("Error processing file:", err);
    alert("Error reading file. Please try again.");
  }
}

function showUploadPreview(dataUrl, fileName, fileSize) {
  const preview = document.getElementById('uploadPreview');
  if (!preview) return;

  const kbSize = (fileSize / 1024).toFixed(1);

  preview.innerHTML = `
    <img src="${dataUrl}" alt="Upload preview" class="upload-preview-img" onclick="openLightboxDirect('${dataUrl.replace(/'/g, "\\'")}', '${escHtml(fileName)}')">
    <div class="upload-preview-info">
      <span class="upload-preview-label">📎 ${escHtml(fileName)} (~${kbSize} KB)</span>
      <button type="button" class="btn-preview-photo" onclick="openLightboxDirect('${dataUrl.replace(/'/g, "\\'")}', '${escHtml(fileName)}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        <span>View Full Photo</span>
      </button>
    </div>
  `;
  preview.style.display = 'flex';
}

// ── Drag & Drop Wiring ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('fileDropzone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) {
        const label = document.getElementById('dropzoneLabel');
        if (label) {
          label.textContent = `⏳ Optimizing ${file.name}…`;
          label.style.color = 'var(--primary)';
        }

        const compressedData = await compressImageFile(file);
        if (compressedData) {
          selectedFile = file;
          selectedFileData = compressedData;
          const approxSizeKb = Math.round((compressedData.length * 0.75) / 1024);
          showUploadPreview(selectedFileData, file.name, approxSizeKb * 1024);
          if (label) {
            label.textContent = `✓ ${file.name} (~${approxSizeKb} KB)`;
            label.style.color = 'var(--success)';
          }
          zone.classList.add('has-file');
        }
      }
    });
  }

  // Initialize dropdowns/form only — do NOT render letters list here.
  // Letters rendering is deferred until auth state is confirmed (via updateAuthUI).
  initLettersForm();
});

function initLetters() {
  initLettersForm();
  // Render list immediately (called after auth is ready from updateAuthUI)
  renderLettersList();
  renderUploadPanelAccess();
  if (typeof updateAccessTabBadge === 'function') updateAccessTabBadge();

  // Listen to Firestore real-time updates if available
  if (typeof listenToLetters === 'function') {
    listenToLetters(() => {
      renderLettersList();
    });
  }
}

function initLettersForm() {
  populatePDDropdown();
  populateFilterPD();
  initBSDateDropdowns();
}

// ── Tab Switching ─────────────────────────────────────────────────────────
function switchLettersTab(tab) {
  document.getElementById('tab-upload')?.classList.toggle('active', tab === 'upload');
  document.getElementById('tab-records')?.classList.toggle('active', tab === 'records');
  document.getElementById('tab-access')?.classList.toggle('active', tab === 'access');

  document.getElementById('panel-upload')?.classList.toggle('active', tab === 'upload');
  document.getElementById('panel-records')?.classList.toggle('active', tab === 'records');
  document.getElementById('panel-access')?.classList.toggle('active', tab === 'access');

  if (tab === 'upload') renderUploadPanelAccess();
  if (tab === 'records') renderLettersList();
  if (tab === 'access') renderAccessManagementList();
}

// ── Upload Panel Access Control Notice ─────────────────────────────────────
async function renderUploadPanelAccess() {
  const noticeEl = document.getElementById('uploadViewOnlyNotice');
  const formCard = document.getElementById('lettersFormCard');
  if (!noticeEl) return;

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const isSuper = typeof isCurrentUserSuperAdmin === 'function' ? isCurrentUserSuperAdmin() : false;
  const hasAccess = typeof hasLettersAccess === 'function' ? hasLettersAccess(user) : isSuper;
  const canEdit = typeof canUserEditLetters === 'function' ? canUserEditLetters(user) : isSuper;

  if (isSuper || canEdit) {
    noticeEl.innerHTML = '';
    noticeEl.style.display = 'none';
    if (formCard) {
      formCard.style.opacity = '1';
      formCard.style.pointerEvents = 'auto';
    }
  } else if (hasAccess) {
    // ── Viewer: read-only banner + option to request Editor upgrade ──
    const viewerEmail = user ? (user.email || '') : '';
    let upgradeInfo = null;
    if (viewerEmail && typeof getUserRequestStatus === 'function') {
      try { upgradeInfo = await getUserRequestStatus(viewerEmail); } catch (e) {}
    }
    const upgradeIsPending = upgradeInfo && upgradeInfo.status === 'pending';

    noticeEl.style.display = 'block';
    noticeEl.innerHTML = `
      <div class="view-only-banner">
        <div style="font-size: 1.6rem; line-height: 1;">👁️</div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <strong style="color: var(--text-primary); font-size: 0.95rem;">Viewer Mode (Read-Only Access)</strong>
            <span class="role-badge role-viewer">Viewer</span>
          </div>
          <p style="font-size: 0.84rem; color: var(--text-secondary); line-height: 1.5; margin: 0 0 0.75rem 0;">
            You have been granted <strong>Viewer</strong> access to the Letters Repository. You can browse, search, and view all correspondence and documents in the <strong>Saved Records</strong> tab. Uploading and editing correspondence requires <strong>Editor</strong> permissions from the Super Admin (${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}).
          </p>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
            <button type="button" class="confirm-add-btn" onclick="switchLettersTab('records')" style="padding: 0.45rem 0.9rem; font-size: 0.8rem;">
              📂 View Saved Letters
            </button>
            ${upgradeIsPending ? `
              <span style="font-size:0.8rem; color:var(--text-muted); display:flex; align-items:center; gap:0.3rem;">⏳ Editor upgrade request pending Super Admin review</span>
            ` : `
              <button type="button" class="filter-clear-btn" id="btnViewerUpgradeReq" onclick="handleViewerUpgradeRequest()" style="padding: 0.45rem 0.9rem; font-size: 0.8rem;">
                📩 Request Editor Access
              </button>
            `}
          </div>
        </div>
      </div>
    `;
    if (formCard) {
      formCard.style.opacity = '0.45';
      formCard.style.pointerEvents = 'none';
    }
  } else {
    // ── No access: full inline request form with pending/denied state awareness ──
    const noAccessEmail = user ? (user.email || 'Guest') : 'Not signed in';

    let requestInfo = null;
    if (user && user.email && typeof getUserRequestStatus === 'function') {
      try { requestInfo = await getUserRequestStatus(user.email); } catch (e) {
        console.warn("Could not check access request status:", e);
      }
    }

    const isPending = requestInfo && requestInfo.status === 'pending';
    const isDenied  = requestInfo && requestInfo.status === 'denied';

    noticeEl.style.display = 'block';
    noticeEl.innerHTML = `
      <div class="letters-empty-state access-denied-box" style="padding: 2rem 1.5rem; text-align: center; max-width: 540px; margin: 0 auto 1.5rem auto;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">${isPending ? '⏳' : '🔒'}</div>
        <h3 style="color: var(--text-primary); font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">
          ${isPending ? 'Access Request Pending' : 'Letters Repository Access Restricted'}
        </h3>
        <p style="margin: 0 auto 1rem auto; line-height: 1.6; color: var(--text-secondary); font-size: 0.88rem; max-width: 420px;">
          ${isPending
            ? `Your request has been submitted to the Super Admin (<strong style="color:var(--text-primary);">${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}</strong>). You will gain access once approved.`
            : `Access is controlled by the Super Admin (<strong style="color:var(--text-primary);">${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}</strong>). Submit a request below to be granted Viewer or Editor access.`
          }
        </p>
        <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.04); border: 1px solid var(--card-border); padding: 0.4rem 0.9rem; border-radius: 20px; font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1.1rem;">
          <span>Signed in as:</span>
          <strong style="color: var(--primary);">${escHtml(noAccessEmail)}</strong>
          ${isPending ? `<span class="role-badge" style="background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.4); color:#eab308; margin-left:0.25rem;">Pending</span>` : ''}
        </div>
        ${!user ? `
          <p style="font-size: 0.83rem; color: var(--text-muted);">Please sign in with your Google account first to request access.</p>
        ` : isPending ? `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 0.65rem;">
            <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
              Submitted ${requestInfo.requestedAt?.toDate ? requestInfo.requestedAt.toDate().toLocaleString() : 'recently'}. Please check back later or click refresh.
            </p>
            <button type="button" class="confirm-add-btn" onclick="checkAndRefreshLettersAccess()" style="padding: 0.6rem 1.1rem;">
              🔄 Refresh Access Status
            </button>
          </div>
        ` : `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.1rem; text-align: left;">
            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem; margin-bottom: 0.35rem;">Request Permission from Super Admin</div>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.65rem; line-height: 1.4;">
              Provide your role / designation so the Super Admin can assign the right access level (Viewer or Editor).
            </p>
            ${isDenied ? `<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171; padding: 0.45rem 0.65rem; border-radius: 8px; font-size: 0.78rem; margin-bottom: 0.6rem;">Your previous request was not approved. You can submit a new request with details below.</div>` : ''}
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <input type="text" id="uploadTabAccessReason" class="input-field" placeholder="Reason / Role (e.g. Site Engineer, Rupandehi project)" maxlength="120">
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button type="button" class="confirm-add-btn" id="btnUploadTabAccessReq" onclick="handleUploadTabAccessRequest()" style="flex: 1; min-width: 160px; padding: 0.6rem 0.9rem;">
                  📩 Send Access Request
                </button>
                <button type="button" class="filter-clear-btn" onclick="checkAndRefreshLettersAccess()" style="padding: 0.6rem 0.8rem;">
                  🔄 Refresh
                </button>
              </div>
            </div>
          </div>
        `}
      </div>
    `;
    if (formCard) {
      formCard.style.opacity = '0.35';
      formCard.style.pointerEvents = 'none';
    }
  }
}

// ── Cascading Dropdowns Logic ──────────────────────────────────────────────
function populatePDDropdown(selId = 'selPD') {
  const db  = loadLocations();
  const sel = document.getElementById(selId);
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

function onPDChange(prefix = '') {
  const db       = loadLocations();
  const pd       = document.getElementById(`${prefix}selPD`)?.value;
  const distSel  = document.getElementById(`${prefix}selDistrict`);
  const offSel   = document.getElementById(`${prefix}selOffice`);

  if (!distSel || !offSel) return;

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

function onDistrictChange(prefix = '') {
  const db      = loadLocations();
  const pd      = document.getElementById(`${prefix}selPD`)?.value;
  const dist    = document.getElementById(`${prefix}selDistrict`)?.value;
  const offSel  = document.getElementById(`${prefix}selOffice`);

  if (!offSel) return;

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

  if (input) input.value = '';
  showAddOption(level);
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'add-input-pd')       confirmAdd('pd');
  if (e.target.id === 'add-input-district') confirmAdd('district');
  if (e.target.id === 'add-input-office')   confirmAdd('office');
});

// ── Save Letter Record ─────────────────────────────────────────────────────
async function saveLetterRecord() {
  try {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const isSuper = typeof isCurrentUserSuperAdmin === 'function' ? isCurrentUserSuperAdmin() : false;

    // Always do a live Firestore check first to avoid stale-cache false-denials
    let hasAccess = isSuper;
    if (!hasAccess && user && user.email) {
      if (typeof checkUserAccessOnline === 'function') {
        hasAccess = await checkUserAccessOnline(user.email);
      }
      if (!hasAccess && typeof hasLettersAccess === 'function') {
        hasAccess = hasLettersAccess(user);
      }
    }

    const canEdit = typeof canUserEditLetters === 'function' ? canUserEditLetters(user) : isSuper;
    if (!canEdit) {
      if (hasAccess) {
        alert("Access Restricted: Your account has Viewer-only permissions.\n\nYou can search and view all correspondence, but only authorized Editors and the Super Admin can upload new letters.\n\nTo request Editor permissions, please contact the Super Admin.");
      } else {
        alert(`Access Restricted: Only users authorized by Super Admin (${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}) can upload letters.\n\nPlease submit an access request on the Saved Records tab.`);
      }
      return false;
    }

    const subject  = document.getElementById('letterSubject')?.value.trim();
    const bsDate   = getSelectedBSDate();
    const pd       = document.getElementById('selPD')?.value;
    const district = document.getElementById('selDistrict')?.value;
    const office   = document.getElementById('selOffice')?.value;
    const userRemarks = document.getElementById('letterRemarks')?.value.trim();

    if (!subject) { highlight('letterSubject'); return false; }
    if (!pd)      { highlight('selPD');         return false; }

    const uploaderName = user ? (user.displayName || (user.email ? user.email.split('@')[0] : 'User')) : "Guest User";
    const uploaderEmail = user ? (user.email || 'Unregistered') : "Unregistered";
    const uploaderPhoto = user ? user.photoURL : null;

    // Compose remarks with uploader details
    const finalRemarks = userRemarks 
      ? `${userRemarks} • (Uploaded by: ${uploaderName})`
      : `Uploaded by ${uploaderName} (${uploaderEmail})`;

    const record = {
      id:          Date.now(),
      subject,
      dateDisplay: bsDate.dateDisplay,
      sortKey:     bsDate.sortKey,
      bsYear:      bsDate.year,
      bsMonth:     bsDate.month,
      bsDay:       bsDate.day,
      pd,
      district:    district || '—',
      office:      office   || '—',
      fileName:    selectedFile ? selectedFile.name : null,
      fileData:    selectedFileData || null,
      uploaderName,
      uploaderEmail,
      uploaderPhoto,
      remarks:     finalRemarks,
      savedAt:     new Date().toLocaleString(),
    };

    // Save to Firestore first if online/configured
    const saveBtn = document.getElementById('btnSaveLetter');
    const origBtnHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span>⏳ Saving & Syncing to Cloud…</span>`;
    }

    try {
      if (typeof fbSaveLetter === 'function' && typeof firestoreDb !== 'undefined' && firestoreDb) {
        try {
          const fbSaved = await fbSaveLetter(record);
          if (fbSaved && fbSaved.id) {
            record.id = fbSaved.id;
            record._isCloud = true;
          }
        } catch (cloudErr) {
          console.error("Firestore cloud save error:", cloudErr);
          alert(`Notice: Firestore cloud save error (${cloudErr.message || cloudErr}). Saved locally.`);
        }
      }

      // Save to Local IndexedDB Cache
      await dbSaveRecord(record);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origBtnHtml;
      }
    }

    // Reset Form
    document.getElementById('letterSubject').value = '';
    const remField = document.getElementById('letterRemarks');
    if (remField) remField.value = '';
    initBSDateDropdowns();
    document.getElementById('selPD').value         = '';
    onPDChange();
    selectedFile = null;
    selectedFileData = null;

    const label = document.getElementById('dropzoneLabel');
    if (label) { label.textContent = 'Click to upload or drag & drop photo'; label.style.color = ''; }
    const zone = document.getElementById('fileDropzone');
    if (zone) zone.classList.remove('has-file');
    const preview = document.getElementById('uploadPreview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    const fileInput = document.getElementById('letterFile');
    if (fileInput) fileInput.value = '';

    renderLettersList();
    return true;
  } catch (err) {
    console.error('Failed to save letter record:', err);
    alert('An error occurred while saving the letter record.');
    return false;
  }
}

async function saveLetterRecordAndSwitch() {
  const saved = await saveLetterRecord();
  if (saved) switchLettersTab('records');
}

function highlight(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('input-error');
  el.focus();
  setTimeout(() => el.classList.remove('input-error'), 1500);
}

// ── Filter Population ─────────────────────────────────────────────────────
async function populateFilterPD() {
  const all = await getAllLettersCombined();
  const pdSel = document.getElementById('filterPD');
  if (!pdSel) return;
  const pds = [...new Set(all.map(l => l.pd).filter(Boolean))].sort();
  const current = pdSel.value;
  pdSel.innerHTML = '<option value="">All Provinces</option>';
  pds.forEach(pd => {
    const opt = document.createElement('option');
    opt.value = pd; opt.textContent = pd;
    if (pd === current) opt.selected = true;
    pdSel.appendChild(opt);
  });
}

async function updateOfficeFilter() {
  const all = await getAllLettersCombined();
  const selectedPD = document.getElementById('filterPD')?.value || '';
  const offSel = document.getElementById('filterOffice');
  if (!offSel) return;
  let offices = all
    .filter(l => !selectedPD || l.pd === selectedPD)
    .map(l => l.office).filter(o => o && o !== '—');
  offices = [...new Set(offices)].sort();
  const current = offSel.value;
  offSel.innerHTML = '<option value="">All Offices</option>';
  offices.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    if (o === current) opt.selected = true;
    offSel.appendChild(opt);
  });
}

async function populateFilterYear(all) {
  const yearSel = document.getElementById('filterYear');
  if (!yearSel) return;
  const years = [...new Set(all.map(l => l.bsYear).filter(Boolean))].sort((a,b) => b - a);
  const current = yearSel.value;
  yearSel.innerHTML = '<option value="">All Years</option>';
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = `${y} BS`;
    if (String(y) === String(current)) opt.selected = true;
    yearSel.appendChild(opt);
  });
}

function clearLettersFilters() {
  const ids = ['lettersSearch', 'filterPD', 'filterOffice', 'filterYear'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const sortEl = document.getElementById('lettersSort');
  if (sortEl) sortEl.value = 'date-desc';
  updateOfficeFilter();
  renderLettersList();
}

async function checkAndRefreshLettersAccess() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user && user.email && typeof checkUserAccessOnline === 'function') {
    await checkUserAccessOnline(user.email);
  }
  if (typeof loadUserRoles === 'function') {
    await loadUserRoles();
  }
  if (user && typeof updateAuthUI === 'function') {
    updateAuthUI(user);
  }
  await renderLettersList();
  if (typeof renderUploadPanelAccess === 'function') {
    renderUploadPanelAccess();
  }
}

// ── Render & Sort Records List ──────────────────────────────────────────────
async function renderLettersList() {
  const container  = document.getElementById('lettersList');
  if (!container) return;

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const isSuper = typeof isCurrentUserSuperAdmin === 'function' ? isCurrentUserSuperAdmin() : false;

  // Always do a fresh online check for non-superadmins to avoid stale cache denials
  let hasAccess = isSuper;
  if (!hasAccess && user && user.email) {
    if (typeof checkUserAccessOnline === 'function') {
      hasAccess = await checkUserAccessOnline(user.email);
    }
    if (!hasAccess && typeof hasLettersAccess === 'function') {
      hasAccess = hasLettersAccess(user);
    }
  }

  const canEdit = typeof canUserEditLetters === 'function' ? canUserEditLetters(user) : isSuper;

  // If user is not authorized by Super Admin, display restricted notice & request access UI
  if (!hasAccess) {
    const userEmail = user ? (user.email || 'Guest') : 'Not signed in';

    let requestInfo = null;
    if (user && user.email && typeof getUserRequestStatus === 'function') {
      try {
        requestInfo = await getUserRequestStatus(user.email);
      } catch (e) {
        console.warn("Could not check access request status:", e);
      }
    }

    const isPending = requestInfo && requestInfo.status === 'pending';
    const isDenied = requestInfo && requestInfo.status === 'denied';

    container.innerHTML = `
      <div class="letters-empty-state access-denied-box" style="padding: 2.5rem 1.5rem; text-align: center; max-width: 580px; margin: 1.5rem auto;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">${isPending ? '⏳' : '🔒'}</div>
        <h3 style="color: var(--text-primary); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">
          ${isPending ? 'Access Request Pending' : 'Letters Repository Access Restricted'}
        </h3>
        <p style="margin: 0 auto 1.25rem auto; line-height: 1.6; color: var(--text-secondary); font-size: 0.9rem;">
          ${isPending 
            ? `Your request for repository access has been submitted to the Super Admin (<strong style="color:var(--text-primary);">${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}</strong>). You will be able to access the repository once approved.`
            : `The letters repository contains official correspondence and documents. Access is strictly granted by the Super Admin (<strong style="color:var(--text-primary);">${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}</strong>).`
          }
        </p>

        <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.04); border: 1px solid var(--card-border); padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          <span>Current Account:</span>
          <strong style="color: var(--primary);">${escHtml(userEmail)}</strong>
          ${isPending ? `<span class="role-badge" style="background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.4); color:#eab308; margin-left:0.35rem;">Pending</span>` : ''}
        </div>

        ${!user ? `
          <div style="margin-top: 0.5rem;">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">Please sign in with your Google account first to request repository access.</p>
          </div>
        ` : isPending ? `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
            <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4;">
              Submitted ${requestInfo.requestedAt?.toDate ? requestInfo.requestedAt.toDate().toLocaleString() : 'recently'}. Please check back later or tap refresh.
            </p>
            <button type="button" class="confirm-add-btn" onclick="checkAndRefreshLettersAccess()" style="padding: 0.65rem 1.25rem;">
              🔄 Refresh Access Status
            </button>
          </div>
        ` : `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.25rem; margin-top: 0.5rem; text-align: left;">
            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.92rem; margin-bottom: 0.4rem;">
              Request Permission from Super Admin
            </div>
            <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.85rem;">
              Send an access request to the Super Admin. You can provide your designation or project site (e.g. Civil Engineer, Site Office Rupandehi).
            </p>
            ${isDenied ? `<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; margin-bottom: 0.75rem;">Your previous request was not approved. You can submit a new request below with details.</div>` : ''}
            <div style="display: flex; flex-direction: column; gap: 0.6rem;">
              <input type="text" id="accessRequestReason" class="input-field" placeholder="Reason / Role (e.g. Site Engineer for Rupandehi project)" maxlength="120">
              <div style="display: flex; gap: 0.6rem; margin-top: 0.25rem; flex-wrap: wrap;">
                <button type="button" class="confirm-add-btn" id="btnSubmitAccessReq" onclick="handleSubmitAccessRequest()" style="flex: 1; min-width: 160px; padding: 0.65rem 1rem;">
                  📩 Send Access Request
                </button>
                <button type="button" class="filter-clear-btn" onclick="checkAndRefreshLettersAccess()" title="Refresh status" style="padding: 0.65rem 0.9rem;">
                  🔄 Refresh
                </button>
              </div>
            </div>
          </div>
        `}
      </div>`;

    // Update count badge & count row
    const countBadge = document.getElementById('lettersTabCount');
    if (countBadge) countBadge.textContent = '';
    const countRow = document.getElementById('lettersCountRow');
    if (countRow) countRow.textContent = isPending ? 'Access request pending Super Admin review' : 'Access restricted by Super Admin';
    return;
  }

  const query     = (document.getElementById('lettersSearch')?.value || '').toLowerCase().trim();
  const sortMode  = document.getElementById('lettersSort')?.value || 'date-desc';
  const filterPD  = document.getElementById('filterPD')?.value || '';
  const filterOff = document.getElementById('filterOffice')?.value || '';
  const filterYear = document.getElementById('filterYear')?.value || '';

  let letters = await getAllLettersCombined();

  // Repopulate dynamic filters each render
  await populateFilterPD();
  await populateFilterYear(letters);

  // Filter by PD
  if (filterPD) letters = letters.filter(l => l.pd === filterPD);
  // Filter by Office
  if (filterOff) letters = letters.filter(l => l.office === filterOff);
  // Filter by Year
  if (filterYear) letters = letters.filter(l => String(l.bsYear) === String(filterYear));
  // Search Filter
  if (query) {
    letters = letters.filter(l =>
      l.subject?.toLowerCase().includes(query) ||
      l.pd?.toLowerCase().includes(query) ||
      (l.district && l.district.toLowerCase().includes(query)) ||
      (l.office && l.office.toLowerCase().includes(query)) ||
      (l.dateDisplay && l.dateDisplay.toLowerCase().includes(query)) ||
      (l.uploaderName && l.uploaderName.toLowerCase().includes(query)) ||
      (l.uploaderEmail && l.uploaderEmail.toLowerCase().includes(query)) ||
      (l.remarks && l.remarks.toLowerCase().includes(query))
    );
  }

  // Update tab count badge
  const totalAll = await getAllLettersCombined();
  const countBadge = document.getElementById('lettersTabCount');
  if (countBadge) countBadge.textContent = totalAll.length ? String(totalAll.length) : '';

  // Update count row
  const countRow = document.getElementById('lettersCountRow');
  if (countRow) {
    const hasFilters = query || filterPD || filterOff || filterYear;
    countRow.textContent = hasFilters
      ? `Showing ${letters.length} of ${totalAll.length} record${totalAll.length !== 1 ? 's' : ''}`
      : `${totalAll.length} record${totalAll.length !== 1 ? 's' : ''} total (All Uploaders)`;
  }

  // Sorting Logic
  letters.sort((a, b) => {
    if (sortMode === 'date-desc')    return (b.sortKey || 0) - (a.sortKey || 0);
    if (sortMode === 'date-asc')     return (a.sortKey || 0) - (b.sortKey || 0);
    if (sortMode === 'saved-desc')   return String(b.id).localeCompare(String(a.id));
    if (sortMode === 'subject-asc')  return (a.subject || '').localeCompare(b.subject || '');
    if (sortMode === 'subject-desc') return (b.subject || '').localeCompare(a.subject || '');
    if (sortMode === 'office-asc')   return (a.office || '').localeCompare(b.office || '');
    if (sortMode === 'pd-asc')       return (a.pd || '').localeCompare(b.pd || '');
    if (sortMode === 'hasphoto')     return (b.fileData ? 1 : 0) - (a.fileData ? 1 : 0);
    return 0;
  });

  if (!letters.length) {
    container.innerHTML = `
      <div class="letters-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
        <p>${query ? 'No matching records found.' : 'No letters saved yet. Upload and save a record in the Upload Document tab.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = letters.map(l => {
    const hasPhoto = !!l.fileData;
    const isOwner = user && l.uploaderEmail && user.email.toLowerCase() === l.uploaderEmail.toLowerCase();
    const canUserEditThis = isSuper || canEdit;
    const canUserDeleteThis = isSuper || canEdit;

    const thumbnailHtml = hasPhoto
      ? `<div class="rec-thumbnail" onclick="event.stopPropagation(); viewLetterPhoto('${l.id}')" title="Click to view photo">
           <img src="${l.fileData}" alt="${escHtml(l.fileName || 'photo')}" loading="lazy">
           <div class="rec-thumbnail-overlay">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
           </div>
         </div>`
      : `<div class="rec-file-badge" title="No photo uploaded">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
         </div>`;

    // Uploader identity badge
    const uploaderHtml = l.uploaderName
      ? `<div class="rec-uploader-tag" title="Uploaded by: ${escHtml(l.uploaderEmail || '')}">
          ${l.uploaderPhoto ? `<img src="${l.uploaderPhoto}" class="rec-uploader-avatar" alt="Avatar">` : `<span class="rec-uploader-icon">👤</span>`}
          <span>${escHtml(l.uploaderName)}</span>
         </div>`
      : '';

    const remarksHtml = l.remarks
      ? `<div class="rec-remarks-bubble" title="Remarks">
          <span class="remarks-icon">💬</span>
          <span class="remarks-text">${escHtml(l.remarks)}</span>
         </div>`
      : '';

    return `
    <div class="letter-record-item" id="rec-${l.id}">
      <div class="rec-main">
        ${thumbnailHtml}
        <div class="rec-info">
          <div class="rec-subject-row">
            <div class="rec-subject">${escHtml(l.subject)}</div>
            ${uploaderHtml}
          </div>

          <div class="rec-meta">
            <span>${escHtml(l.pd)}</span>
            ${l.district && l.district !== '—' ? `<span>›</span><span>${escHtml(l.district)}</span>` : ''}
            ${l.office && l.office !== '—' ? `<span>›</span><span>${escHtml(l.office)}</span>` : ''}
          </div>

          <div class="rec-date">
            📅 ${escHtml(l.dateDisplay || '—')} &nbsp;·&nbsp; ${l.savedAt || ''}
            ${l.fileName ? ` &nbsp;·&nbsp; <span class="rec-file-link" onclick="event.stopPropagation(); viewLetterPhoto('${l.id}')">📎 ${escHtml(l.fileName)}</span>` : ''}
          </div>

          ${remarksHtml}
        </div>
      </div>
      <div class="rec-actions">
        ${hasPhoto ? `<button type="button" class="rec-view-btn" onclick="event.stopPropagation(); viewLetterPhoto('${l.id}')" title="View full photo document">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span>View Photo</span>
        </button>` : ''}
        
        ${canUserEditThis ? `<button type="button" class="rec-edit-btn" onclick="event.stopPropagation(); openEditLetterModal('${l.id}')" title="Edit Letter">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          <span>Edit</span>
        </button>` : ''}

        ${canUserDeleteThis ? `<button type="button" class="rec-delete-btn" onclick="event.stopPropagation(); deleteLetterRecord('${l.id}')" title="Delete record">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
        </button>` : ''}
      </div>
    </div>
  `;
  }).join('');
}

// ── Delete Record ──────────────────────────────────────────────────────────
async function deleteLetterRecord(id) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const isSuper = typeof isCurrentUserSuperAdmin === 'function' ? isCurrentUserSuperAdmin() : false;
  const canEdit = typeof canUserEditLetters === 'function' ? canUserEditLetters(user) : false;

  if (!isSuper && !canEdit) {
    alert("Access Denied: Only Super Admin (shresthaprabin178@gmail.com) or authorized editors can delete letters.");
    return;
  }

  if (!confirm('Are you sure you want to permanently delete this letter record?')) return;
  
  if (typeof fbDeleteLetter === 'function') {
    try {
      await fbDeleteLetter(id);
    } catch (e) {
      console.warn("Firestore delete issue, deleting locally:", e);
    }
  }

  await dbDeleteRecord(id);
  renderLettersList();
}

// ── Edit Letter Modal Logic ─────────────────────────────────────────────────
let activeEditLetterId = null;

async function openEditLetterModal(id) {
  const letters = await getAllLettersCombined();
  const letter = letters.find(l => String(l.id) === String(id));
  if (!letter) {
    alert("Letter record not found.");
    return;
  }

  activeEditLetterId = id;

  let modal = document.getElementById("editLetterModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "editLetterModal";
    modal.className = "lightbox-overlay";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="lightbox-content edit-modal-content" style="max-width: 650px; background: var(--bg-color); border: 1px solid var(--card-border); padding: 1.5rem; border-radius: 16px;">
      <div class="lightbox-header" style="background:none; border:none; padding:0 0 1rem 0;">
        <h3 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin: 0;">✏️ Edit Letter Record</h3>
        <button type="button" class="lightbox-close-btn" onclick="closeEditLetterModal()">✕</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.9rem; max-height: 70vh; overflow-y: auto; padding-right: 4px;">
        <div class="input-group">
          <label class="input-label">Subject</label>
          <input type="text" id="editSubject" class="input-field" value="${escHtml(letter.subject || '')}">
        </div>

        <div class="input-group">
          <label class="input-label">Remarks</label>
          <input type="text" id="editRemarks" class="input-field" value="${escHtml(letter.remarks || '')}" placeholder="Remarks / description">
        </div>

        <div class="input-group">
          <label class="input-label">Date (BS)</label>
          <div class="bs-dropdown-grid">
            <div class="bs-drop-col">
              <span class="bs-drop-lbl">Year</span>
              <select id="editBsYear" class="input-field bs-select"></select>
            </div>
            <div class="bs-drop-col">
              <span class="bs-drop-lbl">Month</span>
              <select id="editBsMonth" class="input-field bs-select"></select>
            </div>
            <div class="bs-drop-col">
              <span class="bs-drop-lbl">Day</span>
              <select id="editBsDay" class="input-field bs-select"></select>
            </div>
          </div>
        </div>

        <div class="cascading-dropdowns">
          <div class="input-group">
            <label class="input-label">Provincial Directorate</label>
            <select id="editSelPD" class="input-field" onchange="onPDChange('edit')">
              <option value="">— Select —</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">District</label>
            <select id="editSelDistrict" class="input-field" onchange="onDistrictChange('edit')">
              <option value="">— Select —</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">Office</label>
            <select id="editSelOffice" class="input-field">
              <option value="">— Select —</option>
            </select>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.25rem; border-top: 1px solid var(--card-border); padding-top: 1rem;">
        <button type="button" class="btn-preview-photo" onclick="closeEditLetterModal()" style="padding: 0.65rem 1.1rem;">Cancel</button>
        <button type="button" class="confirm-add-btn" onclick="saveEditedLetter()" style="padding: 0.65rem 1.4rem;">Save Changes</button>
      </div>
    </div>
  `;

  initBSDateDropdowns('editBs');
  populatePDDropdown('editSelPD');

  // Pre-fill values
  if (letter.bsYear) document.getElementById('editBsYear').value = letter.bsYear;
  if (letter.bsMonth) document.getElementById('editBsMonth').value = letter.bsMonth;
  if (letter.bsDay) document.getElementById('editBsDay').value = letter.bsDay;

  if (letter.pd) {
    document.getElementById('editSelPD').value = letter.pd;
    onPDChange('edit');
    if (letter.district) {
      document.getElementById('editSelDistrict').value = letter.district;
      onDistrictChange('edit');
      if (letter.office) {
        document.getElementById('editSelOffice').value = letter.office;
      }
    }
  }

  modal.classList.add("active");
}

function closeEditLetterModal() {
  const modal = document.getElementById("editLetterModal");
  if (modal) modal.classList.remove("active");
  activeEditLetterId = null;
}

async function saveEditedLetter() {
  if (!activeEditLetterId) return;

  const subject = document.getElementById('editSubject')?.value.trim();
  const remarks = document.getElementById('editRemarks')?.value.trim();
  const bsDate = getSelectedBSDate('editBs');
  const pd = document.getElementById('editSelPD')?.value;
  const district = document.getElementById('editSelDistrict')?.value;
  const office = document.getElementById('editSelOffice')?.value;

  if (!subject) {
    alert("Subject is required.");
    return;
  }

  const updatedFields = {
    subject,
    remarks,
    dateDisplay: bsDate.dateDisplay,
    sortKey: bsDate.sortKey,
    bsYear: bsDate.year,
    bsMonth: bsDate.month,
    bsDay: bsDate.day,
    pd: pd || "—",
    district: district || "—",
    office: office || "—"
  };

  // Update in Firestore
  if (typeof fbUpdateLetter === 'function') {
    try {
      await fbUpdateLetter(activeEditLetterId, updatedFields);
    } catch (e) {
      console.warn("Firestore update error, updating local cache:", e);
    }
  }

  // Update local IndexedDB
  const letters = await getAllLettersCombined();
  const localRec = letters.find(l => String(l.id) === String(activeEditLetterId));
  if (localRec) {
    Object.assign(localRec, updatedFields);
    await dbSaveRecord(localRec);
  }

  closeEditLetterModal();
  renderLettersList();
}

// ── Super Admin Access Management UI ──────────────────────────────────────
async function renderAccessManagementList() {
  const container = document.getElementById('accessUsersList');
  if (!container) return;

  const isSuper = typeof isCurrentUserSuperAdmin === 'function' ? isCurrentUserSuperAdmin() : false;
  if (!isSuper) {
    container.innerHTML = `
      <div class="letters-empty-state">
        <p>Access Denied: Only Super Admin (${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}) can manage permissions.</p>
      </div>`;
    return;
  }

  if (typeof loadUserRoles === 'function') {
    await loadUserRoles();
  }

  // Load pending access requests and authorized users list
  let pendingRequests = [];
  if (typeof getPendingAccessRequests === 'function') {
    try {
      pendingRequests = await getPendingAccessRequests();
    } catch (e) {
      console.warn("Could not fetch pending requests:", e);
    }
  }

  // Update badge on Access Control tab
  const badge = document.getElementById('accessTabCount');
  if (badge) {
    badge.textContent = pendingRequests.length > 0 ? String(pendingRequests.length) : '';
  }

  let authorizedUsers = [];
  if (typeof getAuthorizedUsersList === 'function') {
    authorizedUsers = await getAuthorizedUsersList();
  } else {
    const eds = (typeof userRolesCache !== 'undefined' && userRolesCache.editors) ? userRolesCache.editors : [];
    const vws = (typeof userRolesCache !== 'undefined' && userRolesCache.viewers) ? userRolesCache.viewers : [];
    eds.forEach(e => authorizedUsers.push({ email: e, role: 'editor' }));
    vws.forEach(e => authorizedUsers.push({ email: e, role: 'viewer' }));
  }

  let html = `
    <div class="access-admin-card">
      <div class="access-superadmin-box">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <span class="role-badge role-superadmin">Super Admin</span>
            <div style="font-weight:700; color:var(--text-primary); font-size:1rem; margin-top:0.35rem;">
              ${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}
            </div>
          </div>
          <button type="button" class="filter-clear-btn" onclick="renderAccessManagementList()" title="Refresh requests and roles" style="padding:0.4rem 0.8rem; font-size:0.78rem;">
            🔄 Refresh
          </button>
        </div>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.4rem; line-height:1.5;">
          Super Admin has complete authority to review permission requests, grant Viewer or Editor roles, and revoke access. All correspondence uploaded by authorized users is synchronized across everyone with access.
        </p>
      </div>

      <!-- ── Pending Access Requests Section ── -->
      <div style="margin: 1.25rem 0 1rem 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.65rem;">
          <h4 style="font-size:0.92rem; font-weight:700; color:var(--text-primary); margin:0; display:flex; align-items:center; gap:0.45rem;">
            <span>📩 Pending Access Requests</span>
            ${pendingRequests.length > 0 ? `<span style="background:#ef4444; color:white; border-radius:10px; padding:0.1rem 0.5rem; font-size:0.7rem; font-weight:700;">${pendingRequests.length} new</span>` : ''}
          </h4>
        </div>
  `;

  if (!pendingRequests.length) {
    html += `
      <div class="letters-empty-state" style="padding: 1.15rem; border-radius: 12px; border: 1px dashed var(--card-border);">
        <p style="font-size: 0.85rem; margin: 0; color: var(--text-muted);">✓ No pending access requests. All requests have been reviewed!</p>
      </div>
    `;
  } else {
    html += `<div style="display:flex; flex-direction:column; gap:0.75rem;">`;
    pendingRequests.forEach(req => {
      const email = req.email || '';
      const name = req.displayName || email.split('@')[0];
      const initial = name.substring(0, 2).toUpperCase();
      const reason = req.reason ? escHtml(req.reason) : '<em style="color:var(--text-muted)">No note provided</em>';
      const timeStr = req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleString() : 'Recently';

      html += `
        <div class="access-request-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:0.65rem;">
              ${req.photoURL 
                ? `<img src="${req.photoURL}" class="rec-uploader-avatar" style="width:34px; height:34px;" alt="Avatar">` 
                : `<div class="rec-uploader-avatar" style="background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem; width:34px; height:34px;">${initial}</div>`
              }
              <div>
                <div style="font-weight:600; color:var(--text-primary); font-size:0.9rem;">${escHtml(name)}</div>
                <div style="font-size:0.78rem; color:var(--primary);">${escHtml(email)}</div>
              </div>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted);">
              ${timeStr}
            </div>
          </div>

          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--card-border); padding:0.45rem 0.75rem; border-radius:8px; font-size:0.82rem; color:var(--text-secondary);">
            <strong style="color:var(--text-muted); font-size:0.75rem;">Note / Reason:</strong> ${reason}
          </div>

          <div style="display:flex; gap:0.5rem; justify-content:flex-end; flex-wrap:wrap; margin-top:0.25rem;">
            <button type="button" class="btn-approve-viewer" onclick="handleApproveRequest('${req.id}', '${escHtml(email)}', 'viewer')" title="Grant Viewer (Read-only) Access">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Grant Viewer
            </button>
            <button type="button" class="btn-approve-editor" onclick="handleApproveRequest('${req.id}', '${escHtml(email)}', 'editor')" title="Grant Editor (View & Upload) Access">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Grant Editor
            </button>
            <button type="button" class="btn-deny-req" onclick="handleDenyRequest('${req.id}', '${escHtml(email)}')" title="Deny this request">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              Deny
            </button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  html += `
      </div>

      <!-- ── Direct Authorization Form ── -->
      <div class="access-add-form" style="margin: 1.25rem 0; padding: 1.1rem; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px;">
        <label class="input-label" style="font-weight:700; color:var(--text-primary); margin-bottom:0.5rem;">Directly Authorize User by Google Email</label>
        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
          <input type="email" id="newEditorEmail" class="input-field" placeholder="engineer@gmail.com" style="flex:2; min-width:180px;">
          <select id="newEditorRole" class="input-field" style="flex:1; min-width:140px; font-size:0.85rem;">
            <option value="editor" selected>Editor (View &amp; Upload)</option>
            <option value="viewer">Viewer (Read-only)</option>
          </select>
          <button type="button" class="confirm-add-btn" onclick="handleAddEditor()" style="padding:0.68rem 1.25rem; white-space:nowrap;">
            + Grant Access
          </button>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.45rem; line-height: 1.4;">
          <strong>Editor:</strong> Can view, search, upload new letters, and edit correspondence.<br>
          <strong>Viewer:</strong> Can search, filter, and view all letters and attached photos without upload/edit rights.
        </p>
      </div>

      <!-- ── Authorized Users List ── -->
      <h4 style="font-size:0.92rem; font-weight:700; color:var(--text-primary); margin-bottom:0.75rem;">
        Authorized Users (${authorizedUsers.length})
      </h4>
  `;

  if (!authorizedUsers.length) {
    html += `
      <div class="letters-empty-state" style="padding: 1.5rem;">
        <p>No additional users authorized yet. Enter a Google email above or approve a pending request to grant repository access.</p>
      </div>
    `;
  } else {
    html += `<div class="access-editors-grid">`;
    authorizedUsers.forEach(u => {
      const email = u.email;
      const role = u.role || 'editor';
      const isViewer = role === 'viewer';
      const initial = email.substring(0, 2).toUpperCase();

      html += `
        <div class="access-editor-item">
          <div style="display:flex; align-items:center; gap:0.65rem; min-width:0;">
            <div class="rec-uploader-avatar" style="background:${isViewer ? '#10b981' : 'var(--primary)'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem; flex-shrink:0;">
              ${initial}
            </div>
            <div style="min-width:0;">
              <div style="font-weight:600; color:var(--text-primary); font-size:0.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${escHtml(email)}
              </div>
              <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.15rem;">
                <span class="role-badge ${isViewer ? 'role-viewer' : 'role-editor'}" style="font-size:0.65rem;">
                  ${isViewer ? 'Viewer' : 'Editor'}
                </span>
                ${u.grantedAt?.toDate ? `<span style="font-size:0.7rem; color:var(--text-muted);">${u.grantedAt.toDate().toLocaleDateString()}</span>` : ''}
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0;">
            <button type="button" class="role-toggle-btn" onclick="handleSwitchRole('${escHtml(email)}', '${isViewer ? 'editor' : 'viewer'}')" title="Switch to ${isViewer ? 'Editor' : 'Viewer'}">
              ⇄ Make ${isViewer ? 'Editor' : 'Viewer'}
            </button>
            <button type="button" class="rec-delete-btn" onclick="handleRevokeEditor('${escHtml(email)}')" title="Revoke Access">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// ── Access Management Handlers ─────────────────────────────────────────────
async function handleSubmitAccessRequest() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user || !user.email) {
    alert("Please sign in with Google first to request access.");
    return;
  }
  const reason = document.getElementById('accessRequestReason')?.value.trim() || '';
  const btn = document.getElementById('btnSubmitAccessReq');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting request…';
  }
  try {
    const ok = await requestLettersAccess(user, reason);
    if (ok) {
      alert("✓ Access request submitted successfully!\n\nThe Super Admin (shresthaprabin178@gmail.com) has been notified. You can refresh this page once approved.");
      await renderLettersList();
    }
  } catch (e) {
    alert("Error submitting request: " + (e.message || 'Unknown error'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📩 Send Access Request';
    }
  }
}

async function handleApproveRequest(requestId, email, role) {
  const roleName = role === 'viewer' ? 'Viewer (Read-Only)' : 'Editor (View & Upload)';
  if (!confirm(`Approve access for ${email} as ${roleName}?`)) return;
  const ok = await approveAccessRequest(requestId, email, role);
  if (ok) {
    alert(`✓ Approved ${email} with ${roleName} access.`);
    await renderAccessManagementList();
    if (typeof updateAuthUI === 'function') updateAuthUI(getCurrentUser());
  }
}

async function handleDenyRequest(requestId, email) {
  if (!confirm(`Deny access request from ${email}?`)) return;
  const ok = await denyAccessRequest(requestId);
  if (ok) {
    alert(`Request from ${email} has been denied.`);
    await renderAccessManagementList();
  }
}

async function handleAddEditor() {
  const email = document.getElementById('newEditorEmail')?.value.trim();
  const role = document.getElementById('newEditorRole')?.value || 'editor';
  if (!email) {
    alert("Please enter a valid Google email.");
    return;
  }
  const ok = await grantUserAccess(email, role);
  if (ok) {
    const input = document.getElementById('newEditorEmail');
    if (input) input.value = '';
    const roleLabel = role === 'viewer' ? 'Viewer (Read-Only)' : 'Editor (View & Upload)';
    alert(`✓ Access granted successfully for ${email} as ${roleLabel}.`);
    await renderAccessManagementList();
  }
}

async function handleSwitchRole(email, newRole) {
  const roleLabel = newRole === 'viewer' ? 'Viewer (Read-Only)' : 'Editor (View & Upload)';
  if (!confirm(`Change permission for ${email} to ${roleLabel}?`)) return;
  const ok = await grantUserAccess(email, newRole);
  if (ok) {
    alert(`✓ Role updated to ${roleLabel} for ${email}.`);
    await renderAccessManagementList();
  }
}

async function handleRevokeEditor(email) {
  if (!confirm(`Are you sure you want to revoke repository access for ${email}?`)) return;
  const ok = await revokeEditorAccess(email);
  if (ok) {
    alert(`Access revoked for ${email}.`);
    await renderAccessManagementList();
  }
}

// ── Upload Tab Access Request Handler ─────────────────────────────────────
// Handles the "Send Access Request" button inside the Upload panel's no-access form.
async function handleUploadTabAccessRequest() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user || !user.email) {
    alert('Please sign in with Google first to request access.');
    return;
  }
  const reason = document.getElementById('uploadTabAccessReason')?.value.trim() || '';
  const btn = document.getElementById('btnUploadTabAccessReq');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  try {
    const ok = await requestLettersAccess(user, reason);
    if (ok) {
      alert(`✓ Access request submitted successfully!\n\nThe Super Admin (${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}) has been notified. You can refresh this page once approved.`);
      await renderUploadPanelAccess();
      await renderLettersList();
    }
  } catch (e) {
    alert('Error submitting request: ' + (e.message || 'Unknown error'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📩 Send Access Request'; }
  }
}

// ── Viewer Upgrade Request Handler ─────────────────────────────────────────
// Lets a Viewer-role user request an upgrade to Editor from the Upload panel banner.
async function handleViewerUpgradeRequest() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user || !user.email) {
    alert('Please sign in with Google first.');
    return;
  }
  const btn = document.getElementById('btnViewerUpgradeReq');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  try {
    const ok = await requestLettersAccess(user, 'Requesting upgrade from Viewer to Editor access.');
    if (ok) {
      alert(`✓ Editor access request submitted!\n\nThe Super Admin (${typeof SUPER_ADMIN_EMAIL !== 'undefined' ? SUPER_ADMIN_EMAIL : 'shresthaprabin178@gmail.com'}) has been notified and will review your request.`);
      await renderUploadPanelAccess();
    }
  } catch (e) {
    alert('Error submitting upgrade request: ' + (e.message || 'Unknown error'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📩 Request Editor Access'; }
  }
}

// ── Photo Viewer Lightbox ───────────────────────────────────────────────────
async function viewLetterPhoto(id) {
  const letters = await getAllLettersCombined();
  const record = letters.find(l => String(l.id) === String(id));
  if (!record || !record.fileData) {
    alert('No photo document attached to this letter record.');
    return;
  }
  openLightboxDirect(record.fileData, record.fileName || 'Letter Photo', record.subject, record.dateDisplay);
}

function openLightboxDirect(src, fileName, subject, dateDisplay) {
  closeLightbox();

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightboxOverlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeLightbox(); };

  overlay.innerHTML = `
    <div class="lightbox-content">
      <div class="lightbox-header">
        <div class="lightbox-header-info">
          <h4 class="lightbox-title">${escHtml(subject || fileName || 'Photo Document')}</h4>
          <span class="lightbox-sub">${dateDisplay ? `📅 ${escHtml(dateDisplay)} &nbsp;·&nbsp; ` : ''}📎 ${escHtml(fileName || 'photo')}</span>
        </div>
        <div class="lightbox-actions">
          <a href="${src}" download="${escHtml(fileName || 'letter-photo')}" class="lightbox-btn download-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Download</span>
          </a>
          <button type="button" class="lightbox-close-btn" onclick="closeLightbox()" title="Close viewer">✕</button>
        </div>
      </div>
      <div class="lightbox-body">
        <img src="${src}" alt="${escHtml(fileName || 'Photo')}" class="lightbox-img">
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.addEventListener('keydown', lightboxEscHandler);
}

function closeLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  }
  document.removeEventListener('keydown', lightboxEscHandler);
}

function lightboxEscHandler(e) {
  if (e.key === 'Escape') closeLightbox();
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
