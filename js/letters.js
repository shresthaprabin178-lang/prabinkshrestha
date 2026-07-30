// ==========================================================================
// LETTERS MODULE — persistent state via localStorage
// ==========================================================================

// ── Data Store ─────────────────────────────────────────────────────────────
const LOCATIONS_KEY = 'letters_locationsDB';
const LETTERS_KEY   = 'letters_records';

const MAX_FILE_SIZE_KB = 200;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_KB * 1024;

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

// ==========================================================================
// BIKRAM SAMBAT (BS) CALENDAR & CONVERSION
// ==========================================================================
const BS_CALENDAR_DATA = {
  2000: [30,32,31,32,31,30,30,30,29,30,29,31],
  2001: [31,31,32,31,31,31,30,29,30,29,30,30],
  2002: [31,31,32,32,31,30,30,29,30,29,30,30],
  2003: [31,32,31,32,31,30,30,30,29,29,30,31],
  2004: [30,32,31,32,31,30,30,30,29,30,29,31],
  2005: [31,31,32,31,31,31,30,29,30,29,30,30],
  2006: [31,31,32,32,31,30,30,29,30,29,30,30],
  2007: [31,32,31,32,31,30,30,30,29,29,30,31],
  2008: [31,31,31,32,31,31,29,30,30,29,29,31],
  2009: [31,31,32,31,31,31,30,29,30,29,30,30],
  2010: [31,31,32,32,31,30,30,29,30,29,30,30],
  2011: [31,32,31,32,31,30,30,30,29,29,30,31],
  2012: [31,31,31,32,31,31,29,30,30,29,30,30],
  2013: [31,31,32,31,31,31,30,29,30,29,30,30],
  2014: [31,31,32,32,31,30,30,29,30,29,30,30],
  2015: [31,32,31,32,31,30,30,30,29,29,30,31],
  2016: [31,31,31,32,31,31,29,30,30,29,30,30],
  2017: [31,31,32,31,31,31,30,29,30,29,30,30],
  2018: [31,32,31,32,31,30,30,29,30,29,30,30],
  2019: [31,32,31,32,31,30,30,30,29,30,29,31],
  2020: [31,31,31,32,31,31,30,29,30,29,30,30],
  2021: [31,31,32,31,31,31,30,29,30,29,30,30],
  2022: [31,32,31,32,31,30,30,30,29,29,30,30],
  2023: [31,32,31,32,31,30,30,30,29,30,29,31],
  2024: [31,31,31,32,31,31,30,29,30,29,30,30],
  2025: [31,31,32,31,31,31,30,29,30,29,30,30],
  2026: [31,32,31,32,31,30,30,30,29,29,30,31],
  2027: [30,32,31,32,31,30,30,30,29,30,29,31],
  2028: [31,31,32,31,31,31,30,29,30,29,30,30],
  2029: [31,31,32,31,32,30,30,29,30,29,30,30],
  2030: [31,32,31,32,31,30,30,30,29,29,30,31],
  2031: [30,32,31,32,31,30,30,30,29,30,29,31],
  2032: [31,31,32,31,31,31,30,29,30,29,30,30],
  2033: [31,31,32,32,31,30,30,29,30,29,30,30],
  2034: [31,32,31,32,31,30,30,30,29,29,30,31],
  2035: [30,32,31,32,31,31,29,30,30,29,29,31],
  2036: [31,31,32,31,31,31,30,29,30,29,30,30],
  2037: [31,31,32,32,31,30,30,29,30,29,30,30],
  2038: [31,32,31,32,31,30,30,30,29,29,30,31],
  2039: [31,31,31,32,31,31,29,30,30,29,30,30],
  2040: [31,31,32,31,31,31,30,29,30,29,30,30],
  2041: [31,31,32,32,31,30,30,29,30,29,30,30],
  2042: [31,32,31,32,31,30,30,30,29,29,30,31],
  2043: [31,31,31,32,31,31,29,30,30,29,30,30],
  2044: [31,31,32,31,31,31,30,29,30,29,30,30],
  2045: [31,32,31,32,31,30,30,29,30,29,30,30],
  2046: [31,32,31,32,31,30,30,30,29,29,30,31],
  2047: [31,31,31,32,31,31,30,29,30,29,30,30],
  2048: [31,31,32,31,31,31,30,29,30,29,30,30],
  2049: [31,32,31,32,31,30,30,30,29,29,30,30],
  2050: [31,32,31,32,31,30,30,30,29,30,29,31],
  2051: [31,31,31,32,31,31,30,29,30,29,30,30],
  2052: [31,31,32,31,31,31,30,29,30,29,30,30],
  2053: [31,32,31,32,31,30,30,30,29,29,30,30],
  2054: [31,32,31,32,31,30,30,30,29,30,29,31],
  2055: [31,31,32,31,31,31,30,29,30,29,30,30],
  2056: [31,31,32,31,32,30,30,29,30,29,30,30],
  2057: [31,32,31,32,31,30,30,30,29,29,30,31],
  2058: [30,32,31,32,31,30,30,30,29,30,29,31],
  2059: [31,31,32,31,31,31,30,29,30,29,30,30],
  2060: [31,31,32,32,31,30,30,29,30,29,30,30],
  2061: [31,32,31,32,31,30,30,30,29,29,30,31],
  2062: [30,32,31,32,31,31,29,30,29,30,29,31],
  2063: [31,31,32,31,31,31,30,29,30,29,30,30],
  2064: [31,31,32,32,31,30,30,29,30,29,30,30],
  2065: [31,32,31,32,31,30,30,30,29,29,30,31],
  2066: [31,31,31,32,31,31,29,30,30,29,29,31],
  2067: [31,31,32,31,31,31,30,29,30,29,30,30],
  2068: [31,31,32,32,31,30,30,29,30,29,30,30],
  2069: [31,32,31,32,31,30,30,30,29,29,30,31],
  2070: [31,31,31,32,31,31,29,30,30,29,30,30],
  2071: [31,31,32,31,31,31,30,29,30,29,30,30],
  2072: [31,32,31,32,31,30,30,29,30,29,30,30],
  2073: [31,32,31,32,31,30,30,30,29,29,30,31],
  2074: [31,31,31,32,31,31,30,29,30,29,30,30],
  2075: [31,31,32,31,31,31,30,29,30,29,30,30],
  2076: [31,32,31,32,31,30,30,30,29,29,30,30],
  2077: [31,32,31,32,31,30,30,30,29,30,29,31],
  2078: [31,31,31,32,31,31,30,29,30,29,30,30],
  2079: [31,31,32,31,31,31,30,29,30,29,30,30],
  2080: [31,32,31,32,31,30,30,30,29,29,30,30],
  2081: [31,31,32,32,31,30,30,30,29,29,30,31],
  2082: [30,32,31,32,31,30,30,30,29,30,29,31],
  2083: [31,31,32,31,31,30,30,30,29,30,30,30],
  2084: [31,31,32,31,31,30,30,30,29,30,30,30],
  2085: [31,32,31,32,30,31,30,30,29,30,30,30],
  2086: [30,32,31,32,31,30,30,30,29,30,30,30],
  2087: [31,31,32,31,31,31,30,30,29,30,30,30],
  2088: [30,31,32,32,30,31,30,30,29,30,30,30],
  2089: [30,32,31,32,31,30,30,30,29,30,30,30],
  2090: [30,32,31,32,31,30,30,30,29,30,30,30],
};

const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

// Reference date: BS 2000/01/01 = AD 1943/04/14
const BS_REF = { year: 2000, month: 1, day: 1 };
const AD_REF = new Date(1943, 3, 14); // April 14, 1943

function adToBS(adDate) {
  let totalDays = Math.floor((adDate - AD_REF) / (1000 * 60 * 60 * 24));
  if (totalDays < 0) return null;

  let bsYear = BS_REF.year;
  let bsMonth = BS_REF.month - 1;
  let bsDay = BS_REF.day;

  while (totalDays > 0) {
    const monthData = BS_CALENDAR_DATA[bsYear];
    if (!monthData) return null;

    const daysInMonth = monthData[bsMonth];
    const daysRemainingInMonth = daysInMonth - bsDay;

    if (totalDays <= daysRemainingInMonth) {
      bsDay += totalDays;
      totalDays = 0;
    } else {
      totalDays -= (daysRemainingInMonth + 1);
      bsMonth++;
      if (bsMonth >= 12) {
        bsMonth = 0;
        bsYear++;
      }
      bsDay = 1;
    }
  }

  return { year: bsYear, month: bsMonth + 1, day: bsDay };
}

function getDaysInBSMonth(bsYear, bsMonth) {
  const data = BS_CALENDAR_DATA[bsYear];
  if (!data) return 30;
  return data[bsMonth - 1] || 30;
}

// ── Visual BS Calendar State ─────────────────────────────────────────────────
let selectedBSDate = null; // { year, month, day }
let pickerBSYear = 2083;
let pickerBSMonth = 4; // 1-indexed

function initBSDatePicker() {
  const today = adToBS(new Date());
  if (today) {
    selectedBSDate = { year: today.year, month: today.month, day: today.day };
    pickerBSYear = today.year;
    pickerBSMonth = today.month;
  } else {
    selectedBSDate = { year: 2083, month: 4, day: 15 };
    pickerBSYear = 2083;
    pickerBSMonth = 4;
  }
  updateBSDateDisplay();
  populateBSCalSelects();
  renderBSCalendarGrid();
}

function updateBSDateDisplay() {
  const input = document.getElementById('bsDateDisplay');
  if (!input) return;
  if (!selectedBSDate) {
    input.value = '';
    return;
  }
  const monthName = BS_MONTHS[selectedBSDate.month - 1] || '';
  input.value = `${selectedBSDate.year}/${String(selectedBSDate.month).padStart(2, '0')}/${String(selectedBSDate.day).padStart(2, '0')} BS (${selectedBSDate.day} ${monthName} ${selectedBSDate.year})`;
}

function getBSDateString() {
  if (!selectedBSDate) {
    const today = adToBS(new Date());
    if (today) return `${today.year}/${String(today.month).padStart(2, '0')}/${String(today.day).padStart(2, '0')} BS`;
    return '2083/04/15 BS';
  }
  return `${selectedBSDate.year}/${String(selectedBSDate.month).padStart(2, '0')}/${String(selectedBSDate.day).padStart(2, '0')} BS`;
}

function getBSDateDisplay(dateStr) {
  if (!dateStr || !dateStr.includes('BS')) return dateStr || '';
  const parts = dateStr.replace(' BS', '').split('/');
  if (parts.length !== 3) return dateStr;
  const monthIndex = parseInt(parts[1]) - 1;
  const monthName = BS_MONTHS[monthIndex] || '';
  return `${parts[2]} ${monthName} ${parts[0]} BS`;
}

function toggleBSCalendar(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('bsCalendarPopover');
  if (!popover) return;
  popover.classList.toggle('hidden');
  if (!popover.classList.contains('hidden')) {
    populateBSCalSelects();
    renderBSCalendarGrid();
  }
}

function closeBSCalendar() {
  const popover = document.getElementById('bsCalendarPopover');
  if (popover) popover.classList.add('hidden');
}

// Close popover when clicking outside
document.addEventListener('click', (e) => {
  const popover = document.getElementById('bsCalendarPopover');
  const container = document.querySelector('.bs-date-picker-container');
  if (popover && !popover.classList.contains('hidden')) {
    if (container && !container.contains(e.target)) {
      closeBSCalendar();
    }
  }
});

function populateBSCalSelects() {
  const monthSel = document.getElementById('bsCalMonth');
  const yearSel = document.getElementById('bsCalYear');
  if (!monthSel || !yearSel) return;

  monthSel.innerHTML = BS_MONTHS.map((name, i) =>
    `<option value="${i + 1}" ${i + 1 === pickerBSMonth ? 'selected' : ''}>${name} (${i + 1})</option>`
  ).join('');

  const years = [];
  for (let y = 2090; y >= 2070; y--) {
    years.push(`<option value="${y}" ${y === pickerBSYear ? 'selected' : ''}>${y}</option>`);
  }
  yearSel.innerHTML = years.join('');
}

function onBSCalMonthYearChange() {
  const monthSel = document.getElementById('bsCalMonth');
  const yearSel = document.getElementById('bsCalYear');
  if (monthSel) pickerBSMonth = parseInt(monthSel.value) || 1;
  if (yearSel) pickerBSYear = parseInt(yearSel.value) || 2083;
  renderBSCalendarGrid();
}

function prevBSMonth() {
  pickerBSMonth--;
  if (pickerBSMonth < 1) {
    pickerBSMonth = 12;
    pickerBSYear--;
  }
  populateBSCalSelects();
  renderBSCalendarGrid();
}

function nextBSMonth() {
  pickerBSMonth++;
  if (pickerBSMonth > 12) {
    pickerBSMonth = 1;
    pickerBSYear++;
  }
  populateBSCalSelects();
  renderBSCalendarGrid();
}

function getBSMonthStartWeekday(bsYear, bsMonth) {
  let totalDays = 0;
  for (let y = 2000; y < bsYear; y++) {
    const yearData = BS_CALENDAR_DATA[y];
    if (yearData) {
      totalDays += yearData.reduce((a, b) => a + b, 0);
    } else {
      totalDays += 365;
    }
  }
  const currentYearData = BS_CALENDAR_DATA[bsYear] || Array(12).fill(30);
  for (let m = 1; m < bsMonth; m++) {
    totalDays += (currentYearData[m - 1] || 30);
  }
  // Ref date (2000/01/01) was Wednesday (day index 3)
  return (3 + totalDays) % 7;
}

function renderBSCalendarGrid() {
  const grid = document.getElementById('bsCalDaysGrid');
  if (!grid) return;

  const startWeekday = getBSMonthStartWeekday(pickerBSYear, pickerBSMonth);
  const maxDays = getDaysInBSMonth(pickerBSYear, pickerBSMonth);
  const today = adToBS(new Date());

  let html = '';

  // Blank placeholder cells
  for (let i = 0; i < startWeekday; i++) {
    html += `<div class="bs-cal-day empty"></div>`;
  }

  // Day buttons
  for (let d = 1; d <= maxDays; d++) {
    const isToday = today && today.year === pickerBSYear && today.month === pickerBSMonth && today.day === d;
    const isSelected = selectedBSDate && selectedBSDate.year === pickerBSYear && selectedBSDate.month === pickerBSMonth && selectedBSDate.day === d;

    let classes = 'bs-cal-day';
    if (isToday) classes += ' is-today';
    if (isSelected) classes += ' is-selected';

    html += `<button type="button" class="${classes}" onclick="selectBSDay(${d})">${d}</button>`;
  }

  grid.innerHTML = html;
}

function selectBSDay(day) {
  selectedBSDate = { year: pickerBSYear, month: pickerBSMonth, day: day };
  updateBSDateDisplay();
  closeBSCalendar();
}

function selectTodayBSDate() {
  const today = adToBS(new Date());
  if (today) {
    selectedBSDate = { year: today.year, month: today.month, day: today.day };
    pickerBSYear = today.year;
    pickerBSMonth = today.month;
    updateBSDateDisplay();
    populateBSCalSelects();
    renderBSCalendarGrid();
    closeBSCalendar();
  }
}

// ── Selected File & Preview State ───────────────────────────────────────────
let selectedFile = null;
let selectedFileData = null; // base64 data URL

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    alert(`File size too large. (Maximum allowed size is ${MAX_FILE_SIZE_KB}KB)`);
    input.value = '';
    selectedFile = null;
    selectedFileData = null;
    const label = document.getElementById('dropzoneLabel');
    if (label) { label.textContent = 'Click to upload or drag & drop'; label.style.color = ''; }
    const zone = document.getElementById('fileDropzone');
    if (zone) zone.classList.remove('has-file');
    const preview = document.getElementById('uploadPreview');
    if (preview) preview.style.display = 'none';
    return;
  }

  selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    selectedFileData = e.target.result;
    showUploadPreview(selectedFileData, file.name);
  };
  reader.readAsDataURL(file);

  const label = document.getElementById('dropzoneLabel');
  if (label) {
    label.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
    label.style.color = 'var(--success)';
  }
  const zone = document.getElementById('fileDropzone');
  if (zone) zone.classList.add('has-file');
}

function showUploadPreview(dataUrl, fileName) {
  const preview = document.getElementById('uploadPreview');
  if (!preview) return;

  const isImage = /\.(jpg|jpeg|png)$/i.test(fileName) || dataUrl.startsWith('data:image');
  if (isImage) {
    preview.innerHTML = `
      <img src="${dataUrl}" alt="Preview" class="upload-preview-img" onclick="openLightboxFromPreview()">
      <div class="upload-preview-info">
        <span class="upload-preview-label">📎 ${escHtml(fileName)}</span>
        <button type="button" class="btn-preview-photo" onclick="openLightboxFromPreview()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> View Photo Preview
        </button>
      </div>
    `;
    preview.style.display = 'flex';
  } else {
    preview.innerHTML = `
      <div class="upload-preview-pdf">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
      </div>
      <span class="upload-preview-label">📎 ${escHtml(fileName)}</span>
    `;
    preview.style.display = 'flex';
  }
}

function openLightboxFromPreview() {
  if (selectedFileData) {
    openLightbox(selectedFileData, selectedFile ? selectedFile.name : 'Uploaded Photo');
  }
}

// Drag-and-drop wiring & auto-initialization
window.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('fileDropzone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          alert(`File size too large. (Maximum allowed size is ${MAX_FILE_SIZE_KB}KB)`);
          return;
        }

        selectedFile = file;
        document.getElementById('letterFile').files = e.dataTransfer.files;

        const reader = new FileReader();
        reader.onload = (ev) => {
          selectedFileData = ev.target.result;
          showUploadPreview(selectedFileData, file.name);
        };
        reader.readAsDataURL(file);

        const label = document.getElementById('dropzoneLabel');
        if (label) { label.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(1)}KB)`; label.style.color = 'var(--success)'; }
        zone.classList.add('has-file');
      }
    });
  }

  initLetters();
});

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  initLetters();
}

function initLetters() {
  populatePDDropdown();
  initBSDatePicker();
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

// ── Save Record ─────────────────────────────────────────────────────────────
function saveLetterRecord() {
  try {
    const subject  = document.getElementById('letterSubject')?.value.trim();
    const bsDate   = getBSDateString();
    const pd       = document.getElementById('selPD')?.value;
    const district = document.getElementById('selDistrict')?.value;
    const office   = document.getElementById('selOffice')?.value;

    if (!subject) { highlight('letterSubject'); return; }
    if (!pd)      { highlight('selPD');         return; }

    const record = {
      id:       Date.now(),
      subject,
      date:     bsDate,
      pd,
      district: district || '—',
      office:   office   || '—',
      fileName: selectedFile ? selectedFile.name : null,
      fileData: selectedFileData || null,
      savedAt:  new Date().toLocaleString(),
    };

    const letters = loadLetters();
    letters.unshift(record);

    try {
      saveLetters(letters);
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        alert('Storage quota exceeded! Saving letter record without photo attachment.');
        record.fileData = null;
        saveLetters(letters);
      } else {
        throw e;
      }
    }

    // Reset form
    document.getElementById('letterSubject').value = '';
    initBSDatePicker();
    document.getElementById('selPD').value         = '';
    onPDChange();
    selectedFile = null;
    selectedFileData = null;
    const label = document.getElementById('dropzoneLabel');
    if (label) { label.textContent = 'Click to upload or drag & drop'; label.style.color = ''; }
    const zone = document.getElementById('fileDropzone');
    if (zone) zone.classList.remove('has-file');
    const preview = document.getElementById('uploadPreview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    const fileInput = document.getElementById('letterFile');
    if (fileInput) fileInput.value = '';

    renderLettersList();
  } catch (err) {
    console.error('Failed to save letter record:', err);
    alert('An error occurred while saving the letter record. Please try again.');
  }
}

function highlight(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('input-error');
  el.focus();
  setTimeout(() => el.classList.remove('input-error'), 1500);
}

// ── Lightbox & Photo Viewer ─────────────────────────────────────────────────
function viewLetterPhoto(id) {
  const letters = loadLetters();
  const item = letters.find(l => l.id === id);
  if (!item || !item.fileData) {
    alert('No photo attachment available for this record.');
    return;
  }
  openLightbox(item.fileData, item.fileName);
}

function openLightbox(src, fileName) {
  closeLightbox();

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightboxOverlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeLightbox(); };

  const isImage = src.startsWith('data:image') || /\.(jpg|jpeg|png)$/i.test(fileName || '');

  overlay.innerHTML = `
    <div class="lightbox-content">
      <div class="lightbox-header">
        <span class="lightbox-title">📎 ${escHtml(fileName || 'Photo Document')}</span>
        <div class="lightbox-actions">
          <a href="${src}" download="${escHtml(fileName || 'photo')}" class="lightbox-btn download-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download
          </a>
          <button type="button" class="lightbox-close-btn" onclick="closeLightbox()" title="Close">✕</button>
        </div>
      </div>
      <div class="lightbox-body">
        ${isImage
          ? `<img src="${src}" alt="${escHtml(fileName || 'Photo')}" class="lightbox-img">`
          : `<iframe src="${src}" class="lightbox-iframe"></iframe>`}
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

  container.innerHTML = letters.map(l => {
    const dateDisplay = getBSDateDisplay(l.date);
    const hasImage = l.fileData && l.fileData.startsWith('data:image');

    const thumbnailHtml = hasImage
      ? `<div class="rec-thumbnail" onclick="event.stopPropagation(); viewLetterPhoto(${l.id})" title="Click to view photo">
           <img src="${l.fileData}" alt="${escHtml(l.fileName || 'photo')}" loading="lazy">
           <div class="rec-thumbnail-overlay">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
           </div>
         </div>`
      : (l.fileData
        ? `<div class="rec-file-badge" onclick="event.stopPropagation(); viewLetterPhoto(${l.id})" title="Click to view file">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
           </div>`
        : '');

    return `
    <div class="letter-record-item" id="rec-${l.id}">
      <div class="rec-main">
        ${thumbnailHtml || `<div class="rec-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>`}
        <div class="rec-info">
          <div class="rec-subject">${escHtml(l.subject)}</div>
          <div class="rec-meta">
            <span>${escHtml(l.pd)}</span>
            ${l.district !== '—' ? `<span>›</span><span>${escHtml(l.district)}</span>` : ''}
            ${l.office   !== '—' ? `<span>›</span><span>${escHtml(l.office)}</span>`   : ''}
          </div>
          <div class="rec-date">
            ${dateDisplay} &nbsp;·&nbsp; ${l.savedAt}
            ${l.fileName ? ` &nbsp;·&nbsp; <span class="rec-file-link" onclick="event.stopPropagation(); viewLetterPhoto(${l.id})" title="Click to view photo">📎 ${escHtml(l.fileName)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="rec-actions">
        ${l.fileData ? `<button type="button" class="rec-view-btn" onclick="event.stopPropagation(); viewLetterPhoto(${l.id})" title="View uploaded photo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span>View Photo</span>
        </button>` : ''}
        <button type="button" class="rec-delete-btn" onclick="event.stopPropagation(); deleteLetterRecord(${l.id})" title="Delete record">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
        </button>
      </div>
    </div>
  `;
  }).join('');
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
