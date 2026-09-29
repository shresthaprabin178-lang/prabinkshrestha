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

