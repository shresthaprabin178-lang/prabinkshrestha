// ==========================================================================
// FIREBASE DATABASE & AUTHENTICATION MODULE
// ==========================================================================

const SUPER_ADMIN_EMAIL = "shresthaprabin178@gmail.com";
const FIREBASE_CONFIG_KEY = "prabink_custom_firebase_config";

// Default / fallback Firebase configuration
// Users can customize this in the file or through the settings panel
const defaultFirebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};

function getFirebaseConfig() {
  const custom = localStorage.getItem(FIREBASE_CONFIG_KEY);
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {
      console.warn("Error parsing custom firebase config", e);
    }
  }
  return defaultFirebaseConfig;
}

function saveFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

// Global Auth & Database State
let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let currentUser = null;
let userRolesCache = { editors: [] };
let authStateCallbacks = [];
let isFirebaseReady = false;

// ── Initialize Firebase ───────────────────────────────────────────────────
function initFirebase() {
  try {
    if (typeof firebase === "undefined") {
      console.warn("Firebase SDK not loaded via CDN");
      return false;
    }

    const config = getFirebaseConfig();
    
    // Check if configuration has at least basic keys
    if (!config.apiKey || config.apiKey === "YOUR_API_KEY") {
      console.warn("Firebase configuration is not set. Using offline local mode.");
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
        console.log("Firestore persistence unavailable:", err.code);
      }
    });

    isFirebaseReady = true;

    // Listen for Auth changes
    firebaseAuth.onAuthStateChanged(async (user) => {
      currentUser = user;
      if (user) {
        await loadUserRoles();
      }
      authStateCallbacks.forEach(cb => cb(user));
      updateAuthUI(user);
    });

    return true;
  } catch (error) {
    console.error("Firebase init error:", error);
    isFirebaseReady = false;
    return false;
  }
}

function onAuthStateChange(callback) {
  authStateCallbacks.push(callback);
  if (currentUser !== undefined) {
    callback(currentUser);
  }
}

// ── Google Sign-In & Sign-Out ─────────────────────────────────────────────
async function signInWithGoogle() {
  if (!isFirebaseReady || !firebaseAuth) {
    const customConfig = getFirebaseConfig();
    if (!customConfig.apiKey || customConfig.apiKey === "YOUR_API_KEY") {
      showFirebaseConfigModal();
      return;
    }
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await firebaseAuth.signInWithPopup(provider);
    currentUser = result.user;
    await loadUserRoles();
    updateAuthUI(currentUser);
    return currentUser;
  } catch (error) {
    console.error("Google Sign-In failed:", error);
    if (error.code === 'auth/popup-blocked') {
      alert("Sign-in popup was blocked by your browser. Please allow popups for this site.");
    } else if (error.code === 'auth/configuration-not-found' || error.code === 'auth/invalid-api-key') {
      alert("Firebase Authentication is not configured yet. Please enter valid Firebase configuration keys.");
      showFirebaseConfigModal();
    } else {
      alert("Sign In Error: " + (error.message || "Failed to sign in with Google"));
    }
    throw error;
  }
}

async function signOutUser() {
  if (firebaseAuth) {
    await firebaseAuth.signOut();
  }
  currentUser = null;
  updateAuthUI(null);
  authStateCallbacks.forEach(cb => cb(null));
}

function getCurrentUser() {
  return currentUser;
}

// ── Role-Based Access Control (RBAC) ──────────────────────────────────────
function isSuperAdmin(email) {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

function isCurrentUserSuperAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return isSuperAdmin(currentUser.email);
}

function canUserEditLetters(user) {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase();
  if (isSuperAdmin(email)) return true;
  return userRolesCache.editors.map(e => e.toLowerCase()).includes(email);
}

async function loadUserRoles() {
  if (!firestoreDb) return;
  try {
    const rolesDoc = await firestoreDb.collection("settings").doc("roles").get();
    if (rolesDoc.exists) {
      userRolesCache = rolesDoc.data() || { editors: [] };
      if (!Array.isArray(userRolesCache.editors)) {
        userRolesCache.editors = [];
      }
    } else {
      userRolesCache = { editors: [] };
    }
  } catch (err) {
    console.warn("Could not load user roles from Firestore:", err);
  }
}

async function grantEditorAccess(email) {
  if (!isCurrentUserSuperAdmin()) {
    alert("Only the Super Admin (" + SUPER_ADMIN_EMAIL + ") can grant editor access.");
    return false;
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    alert("Please provide a valid email address.");
    return false;
  }

  if (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
    alert("This email is already the Super Admin.");
    return false;
  }

  if (userRolesCache.editors.map(e => e.toLowerCase()).includes(cleanEmail)) {
    alert("This user is already an authorized Editor.");
    return false;
  }

  userRolesCache.editors.push(cleanEmail);

  if (firestoreDb) {
    try {
      await firestoreDb.collection("settings").doc("roles").set({
        editors: userRolesCache.editors,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.email
      }, { merge: true });
      return true;
    } catch (e) {
      console.error("Failed to save editor role:", e);
      alert("Error saving editor access to Firestore: " + e.message);
      return false;
    }
  }
  return true;
}

async function revokeEditorAccess(email) {
  if (!isCurrentUserSuperAdmin()) {
    alert("Only the Super Admin (" + SUPER_ADMIN_EMAIL + ") can revoke editor access.");
    return false;
  }
  const cleanEmail = email.trim().toLowerCase();
  userRolesCache.editors = userRolesCache.editors.filter(e => e.toLowerCase() !== cleanEmail);

  if (firestoreDb) {
    try {
      await firestoreDb.collection("settings").doc("roles").set({
        editors: userRolesCache.editors,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.email
      }, { merge: true });
      return true;
    } catch (e) {
      console.error("Failed to revoke editor role:", e);
      alert("Error updating permissions in Firestore: " + e.message);
      return false;
    }
  }
  return true;
}

// ── Firestore Letters Cloud Database CRUD ─────────────────────────────────
async function fbSaveLetter(record) {
  if (firestoreDb) {
    try {
      const docData = {
        subject: record.subject,
        dateDisplay: record.dateDisplay,
        sortKey: record.sortKey,
        bsYear: record.bsYear,
        bsMonth: record.bsMonth,
        bsDay: record.bsDay,
        pd: record.pd,
        district: record.district || "—",
        office: record.office || "—",
        fileName: record.fileName || null,
        fileData: record.fileData || null,
        uploaderName: currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : "Guest",
        uploaderEmail: currentUser ? currentUser.email : "Unknown",
        uploaderPhoto: currentUser ? (currentUser.photoURL || null) : null,
        remarks: record.remarks || `Uploaded by ${currentUser ? (currentUser.displayName || currentUser.email) : 'User'}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        savedAt: new Date().toLocaleString()
      };

      const docRef = await firestoreDb.collection("letters").add(docData);
      return { id: docRef.id, ...docData };
    } catch (err) {
      console.error("Error saving letter to Firestore, falling back to local:", err);
    }
  }

  // Fallback: IndexedDB / localStorage
  return null;
}

async function fbUpdateLetter(id, updatedFields) {
  if (firestoreDb && id) {
    try {
      const updateData = {
        ...updatedFields,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastEditedBy: currentUser ? currentUser.email : "Unknown"
      };
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
      const snapshot = await firestoreDb.collection("letters").orderBy("sortKey", "desc").get();
      const records = [];
      snapshot.forEach(doc => {
        records.push({
          id: doc.id,
          ...doc.data()
        });
      });
      return records;
    } catch (err) {
      console.warn("Firestore fetch error, falling back to IndexedDB:", err);
    }
  }
  return null;
}

function listenToLetters(onUpdate) {
  if (firestoreDb) {
    return firestoreDb.collection("letters").onSnapshot(snapshot => {
      const records = [];
      snapshot.forEach(doc => {
        records.push({
          id: doc.id,
          ...doc.data()
        });
      });
      onUpdate(records);
    }, err => {
      console.warn("Letters snapshot listener error:", err);
    });
  }
  return null;
}

// ── Auth UI Updates ───────────────────────────────────────────────────────
function updateAuthUI(user) {
  const authGate = document.getElementById("authGate");
  const userProfileCard = document.getElementById("sidebarUserProfile");
  const userAvatar = document.getElementById("userAvatarImg");
  const userAvatarFallback = document.getElementById("userAvatarFallback");
  const userNameEl = document.getElementById("userNameDisplay");
  const userEmailEl = document.getElementById("userEmailDisplay");
  const userRoleBadge = document.getElementById("userRoleBadge");
  const accessTabBtn = document.getElementById("tab-access");

  if (user) {
    // Hide auth gate
    if (authGate) authGate.classList.add("hidden");

    // Show sidebar user profile
    if (userProfileCard) userProfileCard.style.display = "flex";

    // Populate user details
    const name = user.displayName || user.email.split('@')[0];
    if (userNameEl) userNameEl.textContent = name;
    if (userEmailEl) userEmailEl.textContent = user.email;

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
      if (isSuperAdmin(user.email)) {
        userRoleBadge.textContent = "Super Admin";
        userRoleBadge.className = "role-badge role-superadmin";
      } else if (canUserEditLetters(user)) {
        userRoleBadge.textContent = "Editor";
        userRoleBadge.className = "role-badge role-editor";
      } else {
        userRoleBadge.textContent = "Viewer";
        userRoleBadge.className = "role-badge role-viewer";
      }
    }

    // Toggle Access Management tab for Super Admin
    if (accessTabBtn) {
      accessTabBtn.style.display = isSuperAdmin(user.email) ? "inline-flex" : "none";
    }
  } else {
    // Show auth gate
    if (authGate) authGate.classList.remove("hidden");
    if (userProfileCard) userProfileCard.style.display = "none";
    if (accessTabBtn) accessTabBtn.style.display = "none";
  }

  // Refresh letters list to update edit/delete buttons according to permissions
  if (typeof renderLettersList === "function") {
    renderLettersList();
  }
}

// ── Firebase Configuration Modal UI ───────────────────────────────────────
function showFirebaseConfigModal() {
  let modal = document.getElementById("firebaseConfigModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "firebaseConfigModal";
    modal.className = "lightbox-overlay active";
    modal.innerHTML = `
      <div class="lightbox-content" style="max-width: 580px; background: var(--bg-color); border: 1px solid var(--card-border); padding: 1.5rem; border-radius: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin: 0;">🔥 Firebase Configuration Setup</h3>
          <button type="button" class="lightbox-close-btn" onclick="closeFirebaseConfigModal()">✕</button>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5;">
          To connect Google Login and Firestore cloud storage, enter your Firebase Web App credentials from your 
          <a href="https://console.firebase.google.com" target="_blank" style="color: var(--primary);">Firebase Console</a>.
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
          <button type="button" class="confirm-add-btn" onclick="saveAndApplyFirebaseConfig()" style="padding: 0.6rem 1.25rem;">Save & Connect</button>
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
  alert("Firebase configuration saved! Re-initializing...");
  initFirebase();
  if (typeof signInWithGoogle === "function") {
    signInWithGoogle();
  }
}

// Auto-initialize on load
window.addEventListener("DOMContentLoaded", () => {
  initFirebase();
});
