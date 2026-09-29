// ==========================================================================
// SHARED UTILITIES
// ==========================================================================

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
          <span class="lightbox-sub">${dateDisplay ? \`📅 \${escHtml(dateDisplay)} &nbsp;·&nbsp; \` : ''}📎 ${escHtml(fileName || 'photo')}</span>
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

// ── IndexedDB Database Storage Engine (Offline cache) ─────────────────────
const DB_NAME = 'PrabinkPortalDB';
const DB_VERSION = 2;

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
