// ==========================================================================
// LETTERS DATA MODULE — IndexedDB, LocalStorage & Firestore Sync
// ==========================================================================

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

