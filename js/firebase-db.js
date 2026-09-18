// ==========================================================================
// FIREBASE DATABASE, AUTHENTICATION & NOTES MODULE
// ==========================================================================

const SUPER_ADMIN_EMAIL = "shresthaprabin178@gmail.com";
const FIREBASE_CONFIG_KEY = "prabink_custom_firebase_config";
const LOCAL_AUTH_SESSION_KEY = "prabink_portal_user_session";

// Default Firebase configuration
const defaultFirebaseConfig = {
  apiKey: atob("QUl6YVN5QXFubUc1bHBzWVV0WUoxUWZscjNhcC1jR2dpVU95THJn"),
  authDomain: "prabinkshrestha-60bc0.firebaseapp.com",
  projectId: "prabinkshrestha-60bc0",
  storageBucket: "prabinkshrestha-60bc0.firebasestorage.app",
  messagingSenderId: "558316955829",
  appId: "1:558316955829:web:3feedc555d18d4236736fc",
  measurementId: "G-99NG40PHQT"
};

function getFirebaseConfig() {
  const customRaw = localStorage.getItem(FIREBASE_CONFIG_KEY);
  if (customRaw) {
    try {
      const parsed = JSON.parse(customRaw);
      if (parsed && parsed.apiKey && parsed.apiKey.trim() !== "") {
        return parsed;
      }
    } catch (e) {
      console.warn("Error parsing custom firebase config", e);
    }
  }
  return defaultFirebaseConfig;
}

function saveFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

// Global State
let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let currentUser = null;
let userRolesCache = { editors: [], viewers: [] };
let authStateCallbacks = [];
let isFirebaseReady = false;

// ── Restore Local Session Immediately (Prevents Locking Out) ─────────────
function restoreLocalAuthSession() {
  const sessionRaw = localStorage.getItem(LOCAL_AUTH_SESSION_KEY);
  if (sessionRaw) {
    try {
      const userObj = JSON.parse(sessionRaw);
      currentUser = userObj;
      updateAuthUI(currentUser);
      return currentUser;
    } catch (e) {
      console.warn("Session restore error:", e);
    }
  }
  return null;
}

// ── Initialize Firebase ───────────────────────────────────────────────────
function initFirebase() {
  // First restore local session if exists
  restoreLocalAuthSession();

  try {
    if (typeof firebase === "undefined") {
      console.log("Firebase CDN not loaded or running offline.");
      return false;
    }

    const config = getFirebaseConfig();
    
    // Check if configuration has valid keys
    if (!config.apiKey || config.apiKey === "YOUR_API_KEY" || config.apiKey.trim() === "") {
      console.log("Firebase API key not set. Using local offline storage mode.");
      isFirebaseReady = false;
      return false;
    }

    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(config);
    } else {
      firebaseApp = firebase.app();
    }

    firebaseAuth = firebase.auth();
    firestoreDb = firebase.firestore();

    // Enable offline persistence if supported
    firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err.code === 'failed-precondition' || err.code === 'unimplemented') {
        console.log("Firestore persistence mode:", err.code);
      }
    });

    isFirebaseReady = true;

    // Check redirect result for mobile devices
    firebaseAuth.getRedirectResult().then(async (result) => {
      if (result && result.user) {
        setLoggedInUser(result.user);
      }
    }).catch(err => {
      console.warn("Redirect login check:", err);
    });

    // Listen for Auth changes
    firebaseAuth.onAuthStateChanged(async (user) => {
      if (user) {
        await setLoggedInUser(user);
      } else {
        currentUser = null;
        localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
        updateAuthUI(null);
      }
    });

    return true;
  } catch (error) {
    console.error("Firebase init error:", error);
    isFirebaseReady = false;
    return false;
  }
}

async function setLoggedInUser(user) {
  currentUser = {
    uid: user.uid || 'user-' + Date.now(),
    displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
    email: (user.email || '').toLowerCase().trim(),
    photoURL: user.photoURL || null
  };

  // Save session to localStorage
  localStorage.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify(currentUser));

  if (firestoreDb) {
    await loadUserRoles();
  }

  // Initialize letters module and set up real-time listeners (safe to call multiple times)
  if (typeof initLetters === 'function') {
    initLetters();
  } else {
    // Fallback: just render the list
    if (typeof renderLettersList === 'function') renderLettersList();
  }

  authStateCallbacks.forEach(cb => cb(currentUser));
  updateAuthUI(currentUser);
}

function onAuthStateChange(callback) {
  authStateCallbacks.push(callback);
  if (currentUser !== undefined) {
    callback(currentUser);
  }
}

// ── Google Sign-In with Fallback & Redirect ────────────────────────────────
async function signInWithGoogle() {
  if (!isFirebaseReady || !firebaseAuth) {
    const config = getFirebaseConfig();
    if (!config.apiKey || config.apiKey.trim() === "") {
      showFirebaseConfigModal();
      return;
    }
    const reinited = initFirebase();
    if (!reinited) {
      alert("Unable to initialize Firebase. Please check network connection.");
      return;
    }
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    // Try popup first
    try {
      const result = await firebaseAuth.signInWithPopup(provider);
      await setLoggedInUser(result.user);
      return result.user;
    } catch (popupErr) {
      if (popupErr.code === 'auth/popup-blocked') {
        console.log("Popup blocked, falling back to redirect...");
        await firebaseAuth.signInWithRedirect(provider);
        return;
      }
      if (popupErr.code === 'auth/popup-closed-by-user' || popupErr.code === 'auth/cancelled-popup-request') {
        return;
      }
      throw popupErr;
    }
  } catch (error) {
    console.error("Google Sign-In error:", error);
    if (error.code === 'auth/unauthorized-domain') {
      alert("This domain is not authorized in your Firebase Authentication settings.\n\nPlease add 'prabinkshrestha.com.np' to Firebase Console › Authentication › Settings › Authorized Domains.");
    } else {
      alert("Google Sign-In failed: " + (error.message || "Please try again."));
    }
  }
}

// Quick Login with Custom Email
function signInAsCustomUser(email, name) {
  const cleanEmail = email.trim().toLowerCase();
  const user = {
    uid: 'user-' + Date.now(),
    displayName: name || cleanEmail.split('@')[0],
    email: cleanEmail,
    photoURL: null
  };
  setLoggedInUser(user);
}

async function signOutUser() {
  if (firebaseAuth && isFirebaseReady) {
    try {
      await firebaseAuth.signOut();
    } catch (e) {
      console.warn("Firebase signout error:", e);
    }
  }
  currentUser = null;
  localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
  updateAuthUI(null);
  authStateCallbacks.forEach(cb => cb(null));
}

function getCurrentUser() {
  return currentUser;
}

// ── Role-Based Access Control (RBAC) ──────────────────────────────────────
function isSuperAdmin(userOrEmail) {
  if (!userOrEmail) return false;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail.email || '')).toLowerCase().trim();
  return email === SUPER_ADMIN_EMAIL.toLowerCase().trim();
}

function isCurrentUserSuperAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return isSuperAdmin(currentUser.email);
}

function canUserEditLetters(userOrEmail) {
  if (!userOrEmail) return false;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail.email || '')).toLowerCase().trim();
  if (!email) return false;
  if (isSuperAdmin(email)) return true;
  return userRolesCache.editors.map(e => e.toLowerCase().trim()).includes(email);
}

function hasLettersAccess(userOrEmail) {
  if (!userOrEmail) return false;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail.email || '')).toLowerCase().trim();
  if (!email) return false;
  if (isSuperAdmin(email)) return true;
  const editors = userRolesCache.editors.map(e => e.toLowerCase().trim());
  const viewers = userRolesCache.viewers.map(e => e.toLowerCase().trim());
  return editors.includes(email) || viewers.includes(email);
}

function getUserLettersRole(userOrEmail) {
  if (!userOrEmail) return null;
  const email = (typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail.email || '')).toLowerCase().trim();
  if (!email) return null;
  if (isSuperAdmin(email)) return 'superadmin';
  if (userRolesCache.editors.map(e => e.toLowerCase().trim()).includes(email)) return 'editor';
  if (userRolesCache.viewers.map(e => e.toLowerCase().trim()).includes(email)) return 'viewer';
  return null;
}

let rolesUnsubscribe = null;
let authUsersUnsubscribe = null;

async function checkUserAccessOnline(email) {
  if (!email || !firestoreDb) return false;
  const cleanEmail = email.toLowerCase().trim();
  if (isSuperAdmin(cleanEmail)) return true;

  // Check authorized_users (role-aware)
  try {
    const doc = await firestoreDb.collection("authorized_users").doc(cleanEmail).get();
    if (doc.exists) {
      const d = doc.data() || {};
      if (d.active !== false) {
        const role = d.role || 'editor';
        if (role === 'viewer') {
          userRolesCache.editors = userRolesCache.editors.filter(x => x.toLowerCase().trim() !== cleanEmail);
          if (!userRolesCache.viewers.map(x => x.toLowerCase().trim()).includes(cleanEmail)) userRolesCache.viewers.push(cleanEmail);
        } else {
          userRolesCache.viewers = userRolesCache.viewers.filter(x => x.toLowerCase().trim() !== cleanEmail);
          if (!userRolesCache.editors.map(x => x.toLowerCase().trim()).includes(cleanEmail)) userRolesCache.editors.push(cleanEmail);
        }
        return true;
      }
    }
  } catch (e) {
    console.warn("authorized_users doc check error:", e);
  }

  // Legacy: settings/roles (treat as editors)
  try {
    const rDoc = await firestoreDb.collection("settings").doc("roles").get();
    if (rDoc.exists) {
      const data = rDoc.data() || {};
      const editors = Array.isArray(data.editors) ? data.editors.map(x => x.toLowerCase().trim()) : [];
      editors.forEach(ed => { if (!userRolesCache.editors.includes(ed)) userRolesCache.editors.push(ed); });
      if (editors.includes(cleanEmail)) return true;
    }
  } catch (e) {}

  // Legacy: roles/access
  try {
    const aDoc = await firestoreDb.collection("roles").doc("access").get();
    if (aDoc.exists) {
      const data = aDoc.data() || {};
      const editors = Array.isArray(data.editors) ? data.editors.map(x => x.toLowerCase().trim()) : [];
      editors.forEach(ed => { if (!userRolesCache.editors.includes(ed)) userRolesCache.editors.push(ed); });
      if (editors.includes(cleanEmail)) return true;
    }
  } catch (e) {}

  const allAllowed = [...userRolesCache.editors, ...userRolesCache.viewers].map(x => x.toLowerCase().trim());
  return allAllowed.includes(cleanEmail);
}

async function loadUserRoles() {
  if (!firestoreDb) return;

  const foundEditors = new Set(userRolesCache.editors.map(e => e.toLowerCase().trim()));
  const foundViewers = new Set(userRolesCache.viewers.map(e => e.toLowerCase().trim()));

  // 1. authorized_users (role-aware)
  try {
    const snap = await firestoreDb.collection("authorized_users").get();
    snap.forEach(doc => {
      const d = doc.data() || {};
      const email = (d.email || doc.id || '').toLowerCase().trim();
      if (email && d.active !== false) {
        if ((d.role || 'editor') === 'viewer') foundViewers.add(email);
        else foundEditors.add(email);
      }
    });
  } catch (err) { console.warn("Could not query authorized_users:", err); }

  // 2. settings/roles (legacy – treat as editors)
  try {
    const rolesDoc = await firestoreDb.collection("settings").doc("roles").get();
    if (rolesDoc.exists) {
      const data = rolesDoc.data() || {};
      if (Array.isArray(data.editors)) data.editors.forEach(e => foundEditors.add(String(e).toLowerCase().trim()));
    }
  } catch (err) {}

  // 3. roles/access (legacy)
  try {
    const accessDoc = await firestoreDb.collection("roles").doc("access").get();
    if (accessDoc.exists) {
      const data = accessDoc.data() || {};
      if (Array.isArray(data.editors)) data.editors.forEach(e => foundEditors.add(String(e).toLowerCase().trim()));
    }
  } catch (err) {}

  // Targeted check for current user
  if (currentUser && currentUser.email) {
    const userEmail = currentUser.email.toLowerCase().trim();
    try {
      const userDoc = await firestoreDb.collection("authorized_users").doc(userEmail).get();
      if (userDoc.exists && userDoc.data()?.active !== false) {
        if ((userDoc.data()?.role || 'editor') === 'viewer') foundViewers.add(userEmail);
        else foundEditors.add(userEmail);
      }
    } catch (e) {}
  }

  userRolesCache.editors = Array.from(foundEditors);
  userRolesCache.viewers = Array.from(foundViewers);

  // Real-time: authorized_users (role-aware rebuild)
  if (!authUsersUnsubscribe && firestoreDb) {
    try {
      authUsersUnsubscribe = firestoreDb.collection("authorized_users").onSnapshot(snap => {
        const freshEditors = new Set();
        const freshViewers = new Set();
        snap.forEach(doc => {
          const d = doc.data() || {};
          const em = (d.email || doc.id || '').toLowerCase().trim();
          if (em && d.active !== false) {
            if ((d.role || 'editor') === 'viewer') freshViewers.add(em);
            else freshEditors.add(em);
          }
        });
        userRolesCache.editors = Array.from(freshEditors);
        userRolesCache.viewers = Array.from(freshViewers);
        if (currentUser) updateAuthUI(currentUser);
        if (typeof renderLettersList === 'function') renderLettersList();
      }, err => { console.warn("authorized_users snapshot listener:", err); });
    } catch (e) {}
  }

  // Real-time: settings/roles
  if (!rolesUnsubscribe && firestoreDb) {
    try {
      rolesUnsubscribe = firestoreDb.collection("settings").doc("roles").onSnapshot(doc => {
        if (doc && doc.exists) {
          const data = doc.data() || {};
          if (Array.isArray(data.editors)) {
            data.editors.forEach(e => {
              const clean = String(e).toLowerCase().trim();
              if (!userRolesCache.editors.includes(clean)) userRolesCache.editors.push(clean);
            });
          }
        }
        if (currentUser) updateAuthUI(currentUser);
      }, err => { console.warn("Real-time roles listener:", err); });
    } catch (e) {}
  }
}

// Grant user access with a specific role ('editor' or 'viewer')
async function grantUserAccess(email, role = 'editor') {
  if (!isCurrentUserSuperAdmin()) {
    alert("Only the Super Admin (" + SUPER_ADMIN_EMAIL + ") can grant access.");
    return false;
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    alert("Please provide a valid email address.");
    return false;
  }
  if (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
    alert("This email is already the Super Admin with full access.");
    return false;
  }
  const validRole = role === 'viewer' ? 'viewer' : 'editor';

  // Update local cache (remove from both, then add to correct)
  userRolesCache.editors = userRolesCache.editors.filter(e => e.toLowerCase().trim() !== cleanEmail);
  userRolesCache.viewers = userRolesCache.viewers.filter(e => e.toLowerCase().trim() !== cleanEmail);
  if (validRole === 'viewer') userRolesCache.viewers.push(cleanEmail);
  else userRolesCache.editors.push(cleanEmail);

  if (firestoreDb) {
    try {
      await firestoreDb.collection("authorized_users").doc(cleanEmail).set({
        email: cleanEmail,
        role: validRole,
        active: true,
        grantedBy: currentUser ? currentUser.email : SUPER_ADMIN_EMAIL,
        grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Update legacy editor lists
      await firestoreDb.collection("settings").doc("roles").set({
        editors: userRolesCache.editors,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser ? currentUser.email : SUPER_ADMIN_EMAIL
      }, { merge: true });

      await firestoreDb.collection("roles").doc("access").set({
        editors: userRolesCache.editors,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser ? currentUser.email : SUPER_ADMIN_EMAIL
      }, { merge: true });

      return true;
    } catch (e) {
      console.error("Failed to save role:", e);
      alert("Error saving access to Firestore: " + e.message);
      return false;
    }
  }
  return true;
}

// Backward-compat alias
async function grantEditorAccess(email) { return grantUserAccess(email, 'editor'); }

async function revokeEditorAccess(email) {
  if (!isCurrentUserSuperAdmin()) {
    alert("Only the Super Admin (" + SUPER_ADMIN_EMAIL + ") can revoke access.");
    return false;
  }
  const cleanEmail = email.trim().toLowerCase();
  
  // Optimistically update local cache
  userRolesCache.editors = userRolesCache.editors.filter(e => e.toLowerCase().trim() !== cleanEmail);
  userRolesCache.viewers = userRolesCache.viewers.filter(e => e.toLowerCase().trim() !== cleanEmail);

  if (firestoreDb) {
    try {
      // Hard delete from authorized_users collection
      await firestoreDb.collection("authorized_users").doc(cleanEmail).delete();
      
      // Update legacy editor lists so snapshots don't re-add the user
      await firestoreDb.collection("settings").doc("roles").set({
        editors: userRolesCache.editors,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser ? currentUser.email : SUPER_ADMIN_EMAIL
      }, { merge: true });
      await firestoreDb.collection("roles").doc("access").set({
        editors: userRolesCache.editors,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser ? currentUser.email : SUPER_ADMIN_EMAIL
      }, { merge: true });
      return true;
    } catch (e) {
      console.error("Failed to revoke role:", e);
      alert("Error updating permissions: " + e.message);
      return false;
    }
  }
  return true;
}

async function getAuthorizedUsersList() {
  const users = [];
  const seenEmails = new Set();

  if (firestoreDb) {
    try {
      const snap = await firestoreDb.collection("authorized_users").get();
      snap.forEach(doc => {
        const d = doc.data() || {};
        const email = (d.email || doc.id || '').toLowerCase().trim();
        if (email && d.active !== false && !seenEmails.has(email)) {
          seenEmails.add(email);
          users.push({
            email: email,
            role: d.role === 'viewer' ? 'viewer' : 'editor',
            grantedBy: d.grantedBy || SUPER_ADMIN_EMAIL,
            grantedAt: d.grantedAt || null
          });
        }
      });
    } catch (e) {
      console.warn("Error loading authorized_users:", e);
    }
  }

  (userRolesCache.editors || []).forEach(em => {
    const clean = em.toLowerCase().trim();
    if (clean && !seenEmails.has(clean)) {
      seenEmails.add(clean);
      users.push({ email: clean, role: 'editor', grantedBy: SUPER_ADMIN_EMAIL, grantedAt: null });
    }
  });
  (userRolesCache.viewers || []).forEach(em => {
    const clean = em.toLowerCase().trim();
    if (clean && !seenEmails.has(clean)) {
      seenEmails.add(clean);
      users.push({ email: clean, role: 'viewer', grantedBy: SUPER_ADMIN_EMAIL, grantedAt: null });
    }
  });

  return users;
}

async function updateAccessTabBadge() {
  const badge = document.getElementById('accessTabCount');
  if (!badge) return;
  if (!isCurrentUserSuperAdmin()) {
    badge.textContent = '';
    return;
  }
  try {
    const reqs = await getPendingAccessRequests();
    if (reqs.length > 0) {
      badge.textContent = String(reqs.length);
    } else {
      badge.textContent = '';
    }
  } catch (e) {
    badge.textContent = '';
  }
}

// ── Access Request System ──────────────────────────────────────────────────
async function requestLettersAccess(user, reason) {
  if (!firestoreDb || !user || !user.email) {
    alert("You must be signed in to request access.");
    return false;
  }
  const cleanEmail = user.email.toLowerCase().trim();
  if (isSuperAdmin(cleanEmail)) return true;

  try {
    // Already authorized?
    const authDoc = await firestoreDb.collection("authorized_users").doc(cleanEmail).get();
    const isUpgrade = reason === 'Requesting upgrade from Viewer to Editor access.';
    
    if (authDoc.exists && authDoc.data()?.active !== false) {
      const currentRole = authDoc.data()?.role;
      if (currentRole === 'editor') {
        alert("You already have Editor access! Please refresh the page.");
        return false;
      }
      if (currentRole === 'viewer' && !isUpgrade) {
        alert("You already have Viewer access! Please use the 'Request Editor Access' button to upgrade.");
        return false;
      }
    }

    // Already pending?
    const allReqs = await firestoreDb.collection("access_requests").get();
    let hasPending = false;
    allReqs.forEach(doc => {
      const d = doc.data();
      if (d.email === cleanEmail && d.status === 'pending') hasPending = true;
    });
    if (hasPending) {
      alert("You already have a pending access request. The Super Admin will review it soon.");
      return false;
    }

    await firestoreDb.collection("access_requests").add({
      email: cleanEmail,
      displayName: user.displayName || cleanEmail.split('@')[0],
      photoURL: user.photoURL || null,
      reason: reason || '',
      status: 'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      processedAt: null,
      processedBy: null,
      grantedRole: null
    });
    return true;
  } catch (e) {
    console.error("Error submitting access request:", e);
    alert("Error submitting request: " + (e.message || 'Unknown error'));
    return false;
  }
}

async function getPendingAccessRequests() {
  if (!firestoreDb || !isCurrentUserSuperAdmin()) return [];
  try {
    const snap = await firestoreDb.collection("access_requests").get();
    const requests = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.status === 'pending') requests.push({ id: doc.id, ...d });
    });
    return requests.sort((a, b) => {
      const ta = a.requestedAt ? (a.requestedAt.seconds || 0) : 0;
      const tb = b.requestedAt ? (b.requestedAt.seconds || 0) : 0;
      return ta - tb; // oldest first
    });
  } catch (e) {
    console.warn("Error getting access requests:", e);
    return [];
  }
}

async function getUserRequestStatus(email) {
  if (!firestoreDb || !email) return null;
  const cleanEmail = email.toLowerCase().trim();
  try {
    const snap = await firestoreDb.collection("access_requests").get();
    let latest = null;
    snap.forEach(doc => {
      const d = { id: doc.id, ...doc.data() };
      if (d.email !== cleanEmail) return;
      const ts = d.requestedAt ? (d.requestedAt.seconds || 0) : 0;
      const latestTs = latest && latest.requestedAt ? (latest.requestedAt.seconds || 0) : -1;
      if (!latest || ts > latestTs) latest = d;
    });
    return latest;
  } catch (e) {
    console.warn("Error checking request status:", e);
    return null;
  }
}

async function approveAccessRequest(requestId, email, role) {
  if (!isCurrentUserSuperAdmin()) return false;
  try {
    const ok = await grantUserAccess(email, role);
    if (!ok) return false;
    await firestoreDb.collection("access_requests").doc(requestId).update({
      status: 'approved',
      grantedRole: role,
      processedAt: firebase.firestore.FieldValue.serverTimestamp(),
      processedBy: currentUser ? currentUser.email : SUPER_ADMIN_EMAIL
    });
    return true;
  } catch (e) {
    console.error("Error approving request:", e);
    alert("Error approving request: " + e.message);
    return false;
  }
}

async function denyAccessRequest(requestId) {
  if (!isCurrentUserSuperAdmin()) return false;
  try {
    await firestoreDb.collection("access_requests").doc(requestId).update({
      status: 'denied',
      processedAt: firebase.firestore.FieldValue.serverTimestamp(),
      processedBy: currentUser ? currentUser.email : SUPER_ADMIN_EMAIL
    });
    return true;
  } catch (e) {
    console.error("Error denying request:", e);
    return false;
  }
}

// ── Firestore Letters Cloud Database CRUD ─────────────────────────────────
function sanitizeDocData(obj) {
  const clean = {};
  for (const key in obj) {
    if (obj[key] === undefined) {
      clean[key] = null;
    } else {
      clean[key] = obj[key];
    }
  }
  return clean;
}

async function fbSaveLetter(record) {
  if (firestoreDb) {
    try {
      const uName = currentUser ? (currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User')) : (record.uploaderName || "User");
      const uEmail = currentUser ? currentUser.email : (record.uploaderEmail || "Unknown");
      const docData = sanitizeDocData({
        subject: record.subject || '',
        dateDisplay: record.dateDisplay || '',
        sortKey: record.sortKey || 0,
        bsYear: record.bsYear || 2083,
        bsMonth: record.bsMonth || 1,
        bsDay: record.bsDay || 1,
        pd: record.pd || '',
        district: record.district || '—',
        office: record.office || '—',
        fileName: record.fileName || null,
        fileData: record.fileData || null,
        uploaderName: uName,
        uploaderEmail: uEmail,
        uploaderPhoto: currentUser ? (currentUser.photoURL || null) : (record.uploaderPhoto || null),
        remarks: record.remarks || `Uploaded by ${uName} (${uEmail})`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        savedAt: new Date().toLocaleString()
      });

      const docRef = await firestoreDb.collection("letters").add(docData);
      return { id: docRef.id, ...docData };
    } catch (err) {
      console.error("Error saving letter to Firestore:", err);
      throw err;
    }
  }
  return null;
}

async function fbUpdateLetter(id, updatedFields) {
  if (firestoreDb && id) {
    try {
      const updateData = sanitizeDocData({
        ...updatedFields,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastEditedBy: currentUser ? currentUser.email : "Unknown"
      });
      await firestoreDb.collection("letters").doc(String(id)).update(updateData);
      return true;
    } catch (err) {
      console.error("Error updating letter in Firestore:", err);
      throw err;
    }
  }
  return false;
}

async function fbDeleteLetter(id) {
  if (firestoreDb && id) {
    try {
      await firestoreDb.collection("letters").doc(String(id)).delete();
      return true;
    } catch (err) {
      console.error("Error deleting letter from Firestore:", err);
      throw err;
    }
  }
  return false;
}

async function fbGetAllLetters() {
  if (firestoreDb) {
    try {
      // Get all letters collection without requiring composite sort indexes in Firestore
      const snapshot = await firestoreDb.collection("letters").get();
      const records = [];
      snapshot.forEach(doc => {
        records.push({
          id: doc.id,
          _isCloud: true,
          ...doc.data()
        });
      });
      return records;
    } catch (err) {
      console.warn("Firestore fetch letters error, fallback to local:", err);
    }
  }
  return null;
}

let lettersListenerUnsubscribe = null;

function listenToLetters(onUpdate) {
  if (lettersListenerUnsubscribe) {
    lettersListenerUnsubscribe();
    lettersListenerUnsubscribe = null;
  }

  if (firestoreDb) {
    lettersListenerUnsubscribe = firestoreDb.collection("letters").onSnapshot(snapshot => {
      const records = [];
      snapshot.forEach(doc => {
        records.push({
          id: doc.id,
          _isCloud: true,
          ...doc.data()
        });
      });
      if (typeof onUpdate === 'function') {
        onUpdate(records);
      }
    }, err => {
      console.warn("Letters snapshot listener error:", err);
    });
    return lettersListenerUnsubscribe;
  }
  return null;
}

// ── Firestore Notes Cloud Database CRUD ───────────────────────────────────
async function fbSaveNote(note) {
  if (firestoreDb) {
    try {
      const authorName = currentUser ? (currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User')) : 'User';
      const docData = sanitizeDocData({
        title: note.title || 'Untitled Note',
        content: note.content || '',
        category: note.category || 'General',
        color: note.color || 'blue',
        pinned: !!note.pinned,
        fileData: note.fileData || null,
        fileName: note.fileName || null,
        fileType: note.fileType || null,
        fileSize: note.fileSize || null,
        authorEmail: currentUser ? (currentUser.email || 'local') : 'local',
        authorName: authorName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        savedAt: new Date().toLocaleString()
      });
      const docRef = await firestoreDb.collection("notes").add(docData);
      return { id: docRef.id, ...docData };
    } catch (err) {
      console.warn("Error saving note to Firestore, falling back to local:", err);
    }
  }
  return null;
}

async function fbUpdateNote(id, updatedFields) {
  if (firestoreDb && id) {
    try {
      const updateData = sanitizeDocData({
        ...updatedFields,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await firestoreDb.collection("notes").doc(String(id)).update(updateData);
      return true;
    } catch (e) {
      console.warn("Firestore note update error:", e);
    }
  }
  return false;
}

async function fbDeleteNote(id) {
  if (firestoreDb && id) {
    try {
      await firestoreDb.collection("notes").doc(String(id)).delete();
      return true;
    } catch (e) {
      console.warn("Firestore note delete error:", e);
    }
  }
  return false;
}

async function fbGetAllNotes(email) {
  if (firestoreDb) {
    try {
      // Filter to only this user's notes — strict personal privacy
      let query = firestoreDb.collection("notes");
      if (email) {
        query = query.where('authorEmail', '==', email.toLowerCase().trim());
      }
      const snapshot = await query.get();
      const notes = [];
      snapshot.forEach(doc => {
        notes.push({ id: doc.id, ...doc.data() });
      });
      return notes;
    } catch (e) {
      console.warn("Firestore notes fetch error:", e);
    }
  }
  return null;
}

function listenToNotes(email, onUpdate) {
  if (firestoreDb) {
    // Filter real-time listener to only this user's notes
    let query = firestoreDb.collection("notes");
    if (email) {
      query = query.where('authorEmail', '==', email.toLowerCase().trim());
    }
    return query.onSnapshot(snapshot => {
      const notes = [];
      snapshot.forEach(doc => {
        notes.push({ id: doc.id, ...doc.data() });
      });
      onUpdate(notes);
    }, err => {
      console.warn("Notes snapshot listener error:", err);
    });
  }
  return null;
}

// ── Auth UI Updates & Topbar Logout Sync ──────────────────────────────────
function updateAuthUI(user) {
  const authGate = document.getElementById("authGate");
  const userProfileCard = document.getElementById("sidebarUserProfile");
  const userAvatar = document.getElementById("userAvatarImg");
  const userAvatarFallback = document.getElementById("userAvatarFallback");
  const userNameEl = document.getElementById("userNameDisplay");
  const userEmailEl = document.getElementById("userEmailDisplay");
  const userRoleBadge = document.getElementById("userRoleBadge");
  const accessTabBtn = document.getElementById("tab-access");
  const topbarLogoutBtn = document.getElementById("mobileTopbarLogout");

  if (user) {
    // Hide auth gate
    if (authGate) authGate.classList.add("hidden");

    // Show sidebar user profile
    if (userProfileCard) userProfileCard.style.display = "flex";
    if (topbarLogoutBtn) topbarLogoutBtn.style.display = "inline-flex";

    // Populate user details
    const name = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
    if (userNameEl) userNameEl.textContent = name;
    if (userEmailEl) userEmailEl.textContent = user.email || '';

    if (user.photoURL && userAvatar) {
      userAvatar.src = user.photoURL;
      userAvatar.style.display = "block";
      if (userAvatarFallback) userAvatarFallback.style.display = "none";
    } else if (userAvatarFallback) {
      userAvatarFallback.textContent = name.substring(0, 2).toUpperCase();
      userAvatarFallback.style.display = "flex";
      if (userAvatar) userAvatar.style.display = "none";
    }

    // Role Badge
    if (userRoleBadge) {
      const role = typeof getUserLettersRole === 'function' ? getUserLettersRole(user) : null;
      if (role === 'superadmin') {
        userRoleBadge.textContent = "Super Admin";
        userRoleBadge.className = "role-badge role-superadmin";
      } else if (role === 'editor') {
        userRoleBadge.textContent = "Editor";
        userRoleBadge.className = "role-badge role-editor";
      } else if (role === 'viewer') {
        userRoleBadge.textContent = "Viewer";
        userRoleBadge.className = "role-badge role-viewer";
      } else {
        userRoleBadge.textContent = "No Access";
        userRoleBadge.className = "role-badge role-noaccess";
      }
    }

    // Toggle Access Management tab for Super Admin
    if (accessTabBtn) {
      const isSuper = isSuperAdmin(user.email);
      accessTabBtn.style.display = isSuper ? "inline-flex" : "none";
      if (isSuper && typeof updateAccessTabBadge === 'function') {
        updateAccessTabBadge();
      }
    }
  } else {
    // Show auth gate
    if (authGate) authGate.classList.remove("hidden");
    if (userProfileCard) userProfileCard.style.display = "none";
    if (accessTabBtn) accessTabBtn.style.display = "none";
    if (topbarLogoutBtn) topbarLogoutBtn.style.display = "none";
  }

  // Refresh lists
  if (typeof renderLettersList === "function") renderLettersList();
  if (typeof renderUploadPanelAccess === "function") renderUploadPanelAccess();
  if (typeof renderNotesList === "function") renderNotesList();
}

// ── Firebase Configuration Modal UI ───────────────────────────────────────
function showFirebaseConfigModal() {
  let modal = document.getElementById("firebaseConfigModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "firebaseConfigModal";
    modal.className = "lightbox-overlay active";
    modal.style.zIndex = "99999"; // Must be above auth-gate-overlay (z-index: 9999)
    modal.innerHTML = `
      <div class="lightbox-content" style="max-width: 580px; background: var(--bg-color); border: 1px solid var(--card-border); padding: 1.5rem; border-radius: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin: 0;">🔥 Firebase Configuration</h3>
          <button type="button" class="lightbox-close-btn" onclick="closeFirebaseConfigModal()">✕</button>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5;">
          Enter your Firebase Web App credentials from your 
          <a href="https://console.firebase.google.com" target="_blank" style="color: var(--primary);">Firebase Console</a>:
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div>
            <label class="input-label" style="font-size: 0.78rem;">API Key</label>
            <input type="text" id="fbCfgApiKey" class="input-field" placeholder="AIzaSy...">
          </div>
          <div>
            <label class="input-label" style="font-size: 0.78rem;">Auth Domain</label>
            <input type="text" id="fbCfgAuthDomain" class="input-field" placeholder="your-project.firebaseapp.com">
          </div>
          <div>
            <label class="input-label" style="font-size: 0.78rem;">Project ID</label>
            <input type="text" id="fbCfgProjectId" class="input-field" placeholder="your-project">
          </div>
          <div>
            <label class="input-label" style="font-size: 0.78rem;">Storage Bucket</label>
            <input type="text" id="fbCfgStorageBucket" class="input-field" placeholder="your-project.appspot.com">
          </div>
          <div>
            <label class="input-label" style="font-size: 0.78rem;">App ID</label>
            <input type="text" id="fbCfgAppId" class="input-field" placeholder="1:123456789:web:abcdef">
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
          <button type="button" class="btn-preview-photo" onclick="closeFirebaseConfigModal()" style="padding: 0.6rem 1rem;">Cancel</button>
          <button type="button" class="confirm-add-btn" onclick="saveAndApplyFirebaseConfig()" style="padding: 0.6rem 1.25rem;">Save &amp; Connect</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.classList.add("active");
  }

  const current = getFirebaseConfig();
  if (document.getElementById("fbCfgApiKey")) document.getElementById("fbCfgApiKey").value = current.apiKey || "";
  if (document.getElementById("fbCfgAuthDomain")) document.getElementById("fbCfgAuthDomain").value = current.authDomain || "";
  if (document.getElementById("fbCfgProjectId")) document.getElementById("fbCfgProjectId").value = current.projectId || "";
  if (document.getElementById("fbCfgStorageBucket")) document.getElementById("fbCfgStorageBucket").value = current.storageBucket || "";
  if (document.getElementById("fbCfgAppId")) document.getElementById("fbCfgAppId").value = current.appId || "";
}

function closeFirebaseConfigModal() {
  const modal = document.getElementById("firebaseConfigModal");
  if (modal) modal.classList.remove("active");
}

function saveAndApplyFirebaseConfig() {
  const config = {
    apiKey: document.getElementById("fbCfgApiKey")?.value.trim() || "",
    authDomain: document.getElementById("fbCfgAuthDomain")?.value.trim() || "",
    projectId: document.getElementById("fbCfgProjectId")?.value.trim() || "",
    storageBucket: document.getElementById("fbCfgStorageBucket")?.value.trim() || "",
    messagingSenderId: "",
    appId: document.getElementById("fbCfgAppId")?.value.trim() || ""
  };

  saveFirebaseConfig(config);
  closeFirebaseConfigModal();
  initFirebase();
  if (typeof signInWithGoogle === "function") {
    signInWithGoogle();
  }
}

// Auto-initialize
window.addEventListener("DOMContentLoaded", () => {
  initFirebase();
});
