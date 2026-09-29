// ==========================================================================
// LETTERS MODULE — Firebase Cloud Sync, RBAC & Nepali Calendar
// ==========================================================================

const MAX_FILE_SIZE_KB = 200;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_KB * 1024;
const STORE_NAME = 'letters_records';

const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

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

