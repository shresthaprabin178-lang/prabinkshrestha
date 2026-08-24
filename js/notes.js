// ==========================================================================
// NOTES MODULE — Personal Notes & Document Attachments
// ==========================================================================

const NOTES_MAX_FILE_SIZE_KB = 500;
const NOTES_MAX_FILE_SIZE_BYTES = NOTES_MAX_FILE_SIZE_KB * 1024;
const NOTES_STORE_NAME = 'notes_records';
const NOTES_LOCAL_KEY = 'portal_personal_notes';

// State
let selectedNoteAttachment = null;
let selectedNoteAttachmentData = null;
let activeEditingNoteId = null;
let currentNoteCategoryFilter = 'All';

// ── Local Storage & IndexedDB Fallback ────────────────────────────────────
async function getLocalNotes() {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(NOTES_STORE_NAME)) {
      const raw = localStorage.getItem(NOTES_LOCAL_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    return new Promise((resolve) => {
      const tx = db.transaction(NOTES_STORE_NAME, 'readonly');
      const store = tx.objectStore(NOTES_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => {
        const raw = localStorage.getItem(NOTES_LOCAL_KEY);
        resolve(raw ? JSON.parse(raw) : []);
      };
    });
  } catch (e) {
    const raw = localStorage.getItem(NOTES_LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

async function saveLocalNote(note) {
  const local = await getLocalNotes();
  const idx = local.findIndex(n => String(n.id) === String(note.id));
  if (idx >= 0) local[idx] = note;
  else local.unshift(note);
  try {
    localStorage.setItem(NOTES_LOCAL_KEY, JSON.stringify(local));
  } catch (e) {
    console.warn("Notes localStorage quota exceeded", e);
  }
}

async function deleteLocalNote(id) {
  const local = await getLocalNotes();
  const filtered = local.filter(n => String(n.id) !== String(id));
  try {
    localStorage.setItem(NOTES_LOCAL_KEY, JSON.stringify(filtered));
  } catch (e) {}
}

async function getAllNotesCombined() {
  if (typeof fbGetAllNotes === 'function') {
    const fbNotes = await fbGetAllNotes();
    if (fbNotes && fbNotes.length >= 0) {
      for (const n of fbNotes) {
        await saveLocalNote(n);
      }
      return fbNotes;
    }
  }
  return await getLocalNotes();
}

// ── Init Notes Module ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initNotes();
});

function initNotes() {
  renderNotesList();
}

// ── Note Attachment Handling ──────────────────────────────────────────────
function handleNoteFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > NOTES_MAX_FILE_SIZE_BYTES) {
    alert(`File is too large! Maximum attachment size is ${NOTES_MAX_FILE_SIZE_KB}KB.`);
    input.value = '';
    selectedNoteAttachment = null;
    selectedNoteAttachmentData = null;
    document.getElementById('noteAttachmentPreview').style.display = 'none';
    return;
  }

  selectedNoteAttachment = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedNoteAttachmentData = e.target.result;
    showNoteAttachmentPreview(file.name, file.size, selectedNoteAttachmentData, file.type);
  };
  reader.readAsDataURL(file);
}

function showNoteAttachmentPreview(fileName, fileSize, dataUrl, fileType) {
  const container = document.getElementById('noteAttachmentPreview');
  if (!container) return;

  const isImg = fileType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName);
  const kb = (fileSize / 1024).toFixed(1);

  container.innerHTML = `
    <div class="note-file-preview-card">
      ${isImg ? `<img src="${dataUrl}" class="note-file-thumb" alt="preview">` : `<div class="note-file-icon">📄</div>`}
      <div class="note-file-details">
        <span class="note-file-name">${escHtml(fileName)}</span>
        <span class="note-file-meta">${kb} KB · ${isImg ? 'Image' : 'Document'}</span>
      </div>
      <button type="button" class="note-file-remove-btn" onclick="clearNoteAttachment()" title="Remove file">✕</button>
    </div>
  `;
  container.style.display = 'block';
}

function clearNoteAttachment() {
  selectedNoteAttachment = null;
  selectedNoteAttachmentData = null;
  const input = document.getElementById('noteFileInput');
  if (input) input.value = '';
  const preview = document.getElementById('noteAttachmentPreview');
  if (preview) {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
}

// ── Open / Close Note Modal ───────────────────────────────────────────────
function openNewNoteModal() {
  activeEditingNoteId = null;
  document.getElementById('noteModalTitle').textContent = '📝 New Note';
  document.getElementById('noteTitleInput').value = '';
  document.getElementById('noteContentInput').value = '';
  document.getElementById('noteCategorySelect').value = 'General';
  document.getElementById('notePinnedCheck').checked = false;

  // Set default color
  selectNoteColor('blue');
  clearNoteAttachment();

  const modal = document.getElementById('noteEditorModal');
  if (modal) modal.classList.add('active');
}

function closeNoteModal() {
  const modal = document.getElementById('noteEditorModal');
  if (modal) modal.classList.remove('active');
  activeEditingNoteId = null;
  clearNoteAttachment();
}

function selectNoteColor(color) {
  document.querySelectorAll('.note-color-dot').forEach(dot => {
    dot.classList.toggle('selected', dot.dataset.color === color);
  });
  const input = document.getElementById('noteColorValue');
  if (input) input.value = color;
}

// ── Save Note Record ──────────────────────────────────────────────────────
async function saveNoteRecord() {
  const title = document.getElementById('noteTitleInput')?.value.trim();
  const content = document.getElementById('noteContentInput')?.value.trim();
  const category = document.getElementById('noteCategorySelect')?.value || 'General';
  const color = document.getElementById('noteColorValue')?.value || 'blue';
  const pinned = document.getElementById('notePinnedCheck')?.checked || false;
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

  if (!title && !content) {
    alert("Please enter a note title or content.");
    return;
  }

  const noteObj = {
    id: activeEditingNoteId || Date.now(),
    title: title || 'Untitled Note',
    content: content || '',
    category,
    color,
    pinned,
    fileName: selectedNoteAttachment ? selectedNoteAttachment.name : null,
    fileData: selectedNoteAttachmentData || null,
    fileType: selectedNoteAttachment ? selectedNoteAttachment.type : null,
    fileSize: selectedNoteAttachment ? selectedNoteAttachment.size : null,
    authorName: user ? (user.displayName || user.email) : 'Author',
    authorEmail: user ? user.email : 'local',
    savedAt: new Date().toLocaleString()
  };

  if (activeEditingNoteId) {
    // Update existing note
    if (typeof fbUpdateNote === 'function') {
      await fbUpdateNote(activeEditingNoteId, noteObj);
    }
  } else {
    // Save new note
    if (typeof fbSaveNote === 'function') {
      const fbRes = await fbSaveNote(noteObj);
      if (fbRes && fbRes.id) noteObj.id = fbRes.id;
    }
  }

  await saveLocalNote(noteObj);
  closeNoteModal();
  renderNotesList();
}

// ── Edit Note ─────────────────────────────────────────────────────────────
async function editNote(id) {
  const all = await getAllNotesCombined();
  const note = all.find(n => String(n.id) === String(id));
  if (!note) return;

  activeEditingNoteId = id;
  document.getElementById('noteModalTitle').textContent = '✏️ Edit Note';
  document.getElementById('noteTitleInput').value = note.title || '';
  document.getElementById('noteContentInput').value = note.content || '';
  document.getElementById('noteCategorySelect').value = note.category || 'General';
  document.getElementById('notePinnedCheck').checked = !!note.pinned;

  selectNoteColor(note.color || 'blue');

  if (note.fileData) {
    selectedNoteAttachment = { name: note.fileName || 'attachment', size: note.fileSize || 0, type: note.fileType || '' };
    selectedNoteAttachmentData = note.fileData;
    showNoteAttachmentPreview(note.fileName || 'attachment', note.fileSize || 0, note.fileData, note.fileType || '');
  } else {
    clearNoteAttachment();
  }

  const modal = document.getElementById('noteEditorModal');
  if (modal) modal.classList.add('active');
}

// ── Delete Note ───────────────────────────────────────────────────────────
async function deleteNote(id) {
  if (!confirm("Are you sure you want to delete this note?")) return;
  if (typeof fbDeleteNote === 'function') {
    await fbDeleteNote(id);
  }
  await deleteLocalNote(id);
  renderNotesList();
}

// ── Toggle Pin ────────────────────────────────────────────────────────────
async function togglePinNote(id) {
  const all = await getAllNotesCombined();
  const note = all.find(n => String(n.id) === String(id));
  if (!note) return;

  const newPinned = !note.pinned;
  note.pinned = newPinned;

  if (typeof fbUpdateNote === 'function') {
    await fbUpdateNote(id, { pinned: newPinned });
  }
  await saveLocalNote(note);
  renderNotesList();
}

// ── Filter by Category ────────────────────────────────────────────────────
function filterNotesByCategory(cat) {
  currentNoteCategoryFilter = cat;
  document.querySelectorAll('.note-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.category === cat);
  });
  renderNotesList();
}

// ── Render Notes List ─────────────────────────────────────────────────────
async function renderNotesList() {
  const container = document.getElementById('notesGrid');
  if (!container) return;

  const searchVal = (document.getElementById('notesSearchInput')?.value || '').toLowerCase().trim();
  let notes = await getAllNotesCombined();

  // Category filter
  if (currentNoteCategoryFilter && currentNoteCategoryFilter !== 'All') {
    notes = notes.filter(n => n.category === currentNoteCategoryFilter);
  }

  // Search filter
  if (searchVal) {
    notes = notes.filter(n =>
      n.title?.toLowerCase().includes(searchVal) ||
      n.content?.toLowerCase().includes(searchVal) ||
      n.category?.toLowerCase().includes(searchVal) ||
      n.fileName?.toLowerCase().includes(searchVal)
    );
  }

  // Sort: Pinned first, then newest
  notes.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return String(b.id).localeCompare(String(a.id));
  });

  const countRow = document.getElementById('notesCountLabel');
  if (countRow) {
    countRow.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
  }

  if (!notes.length) {
    container.innerHTML = `
      <div class="notes-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        <h4>No notes found</h4>
        <p>${searchVal ? 'Try a different search term or category.' : 'Click "+ Create Note" above to write personal notes and attach files.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = notes.map(note => {
    const isImg = note.fileType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(note.fileName || '');
    const hasFile = !!note.fileData;

    const attachmentHtml = hasFile ? `
      <div class="note-card-attachment" onclick="event.stopPropagation(); viewNoteAttachment('${note.id}')">
        ${isImg ? `<img src="${note.fileData}" class="note-card-img" alt="${escHtml(note.fileName || '')}">` : `
          <div class="note-card-doc-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <span>${escHtml(note.fileName || 'Document')}</span>
          </div>
        `}
      </div>
    ` : '';

    return `
      <div class="note-card note-color-${note.color || 'blue'} ${note.pinned ? 'is-pinned' : ''}" onclick="viewFullNote('${note.id}')">
        <div class="note-card-header">
          <span class="note-category-tag">${escHtml(note.category || 'General')}</span>
          <div class="note-card-actions">
            <button type="button" class="note-pin-btn ${note.pinned ? 'pinned' : ''}" onclick="event.stopPropagation(); togglePinNote('${note.id}')" title="${note.pinned ? 'Unpin note' : 'Pin note'}">
              📌
            </button>
            <button type="button" class="note-action-btn" onclick="event.stopPropagation(); editNote('${note.id}')" title="Edit note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button type="button" class="note-action-btn note-del-btn" onclick="event.stopPropagation(); deleteNote('${note.id}')" title="Delete note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
            </button>
          </div>
        </div>

        <h3 class="note-card-title">${escHtml(note.title)}</h3>
        <p class="note-card-snippet">${escHtml(note.content)}</p>

        ${attachmentHtml}

        <div class="note-card-footer">
          <span>🕒 ${escHtml(note.savedAt || '')}</span>
          ${note.authorName ? `<span class="note-author-pill">👤 ${escHtml(note.authorName)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ── View Full Note Reader Modal ───────────────────────────────────────────
async function viewFullNote(id) {
  const all = await getAllNotesCombined();
  const note = all.find(n => String(n.id) === String(id));
  if (!note) return;

  let viewer = document.getElementById('noteReaderModal');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'noteReaderModal';
    viewer.className = 'lightbox-overlay';
    document.body.appendChild(viewer);
  }

  const isImg = note.fileType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(note.fileName || '');
  const hasFile = !!note.fileData;

  viewer.innerHTML = `
    <div class="lightbox-content" style="max-width: 680px; background: var(--bg-color); border: 1px solid var(--card-border); padding: 1.75rem; border-radius: 20px; box-shadow: 0 25px 60px rgba(0,0,0,0.6);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div>
          <span class="note-category-tag" style="font-size:0.75rem;">${escHtml(note.category || 'General')}</span>
          <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--text-primary); margin-top: 0.4rem;">${escHtml(note.title)}</h2>
          <span style="font-size: 0.76rem; color: var(--text-muted);">🕒 Saved: ${escHtml(note.savedAt || '')} ${note.authorName ? `· 👤 ${escHtml(note.authorName)}` : ''}</span>
        </div>
        <button type="button" class="lightbox-close-btn" onclick="closeNoteReaderModal()">✕</button>
      </div>

      <div style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.7; white-space: pre-wrap; margin: 1.25rem 0; max-height: 50vh; overflow-y: auto;">
        ${escHtml(note.content)}
      </div>

      ${hasFile ? `
        <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--card-border);">
          <span style="font-size:0.78rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:0.5rem;">ATTACHMENT</span>
          ${isImg ? `
            <img src="${note.fileData}" style="max-width:100%; max-height:260px; border-radius:12px; object-fit:contain; border:1px solid var(--card-border); cursor:pointer;" onclick="openLightboxDirect('${note.fileData.replace(/'/g, "\\'")}', '${escHtml(note.fileName || 'Photo')}')">
          ` : ''}
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.6rem;">
            <span style="font-size:0.82rem; color:var(--text-primary); font-weight:600;">📎 ${escHtml(note.fileName || 'Attachment')}</span>
            <a href="${note.fileData}" download="${escHtml(note.fileName || 'note-file')}" class="lightbox-btn">
              Download File
            </a>
          </div>
        </div>
      ` : ''}

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--card-border);">
        <button type="button" class="rec-delete-btn" onclick="closeNoteReaderModal(); deleteNote('${note.id}')" title="Delete note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
          <span style="font-size:0.78rem; margin-left:4px;">Delete</span>
        </button>
        <div style="display:flex; gap:0.6rem;">
          <button type="button" class="btn-preview-photo" onclick="closeNoteReaderModal(); editNote('${note.id}')">✏️ Edit</button>
          <button type="button" class="confirm-add-btn" onclick="closeNoteReaderModal()">Done</button>
        </div>
      </div>
    </div>
  `;

  viewer.classList.add('active');
}

function closeNoteReaderModal() {
  const viewer = document.getElementById('noteReaderModal');
  if (viewer) viewer.classList.remove('active');
}

function viewNoteAttachment(id) {
  viewFullNote(id);
}
