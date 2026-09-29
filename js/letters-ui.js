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
