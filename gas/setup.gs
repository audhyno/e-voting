/**
 * ============================================================================
 * E-VOTING OSIS SMAN 1 PONTIANAK - DATABASE INITIALIZER & MASS ACCOUNT GENERATOR
 * File: setup.gs
 * Arsitektur: Google Apps Script REST API Engine + Google Sheets Database
 * Developer: ZianBOT by zianxy
 * Deskripsi: Inisialisasi sheet non-destruktif (Safe Migrate), custom menu
 *            Spreadsheet UI, dan generator akun pemilih massal otomatis (DPT).
 * ============================================================================
 */

var CONFIG = {
  TIMEZONE: 'Asia/Jakarta',
  DATE_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  SHEETS: {
    PEMILIH: 'pemilih',
    PASLON: 'paslon',
    LOG_SUARA: 'log_suara'
  },
  HEADERS: {
    pemilih: [
      'id_pemilih',
      'username',
      'password',
      'nama_lengkap',
      'kelas',
      'status_memilih',
      'waktu_memilih'
    ],
    paslon: [
      'id_paslon',
      'nomor_urut',
      'label_paslon',
      'nama_paslon',
      'slogan',
      'foto_url',
      'youtube_video_id',
      'visi_misi',
      'perolehan_suara'
    ],
    log_suara: [
      'id_log',
      'id_paslon',
      'timestamp',
      'token_hash'
    ]
  }
};

/**
 * Event Trigger onOpen: Menambahkan menu khusus di bilah atas Google Sheets
 * saat dokumen spreadsheet dibuka oleh panitia/operator.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ E-Voting SMANSA')
    .addItem('🔑 Generate Akun Pemilih Massal (Kolom D & E)', 'generateVoterAccountsMassal')
    .addSeparator()
    .addItem('🔄 Inisialisasi / Safe Migrate Database', 'initDatabase')
    .addToUi();
}

/**
 * Fungsi Utama Generator Massal:
 * Membaca nama_lengkap (Kolom D) dan kelas (Kolom E), kemudian secara otomatis
 * mengisi id_pemilih (Kolom A), username unik (Kolom B), password token (Kolom C),
 * serta status_memilih 'BELUM' (Kolom F).
 */
function generateVoterAccountsMassal() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.PEMILIH);
  var ui = SpreadsheetApp.getUi();

  if (!sheet) {
    ui.alert('Peringatan', 'Sheet "pemilih" tidak ditemukan dalam dokumen ini!', ui.ButtonSet.OK);
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert(
      'Data Belum Ada',
      'Silakan paste data warga SMANSA (Nama di Kolom D dan Kelas di Kolom E) terlebih dahulu mulai dari baris ke-2!',
      ui.ButtonSet.OK
    );
    return;
  }

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];

  // Mapping posisi index kolom berdasarkan nama header
  var colMap = {};
  headers.forEach(function (h, idx) {
    colMap[h.trim().toLowerCase()] = idx;
  });

  var requiredCols = ['id_pemilih', 'username', 'password', 'nama_lengkap', 'kelas', 'status_memilih', 'waktu_memilih'];
  for (var r = 0; r < requiredCols.length; r++) {
    if (colMap[requiredCols[r]] === undefined) {
      ui.alert('Header Tidak Sesuai', 'Kolom header "' + requiredCols[r] + '" tidak ditemukan pada baris 1!', ui.ButtonSet.OK);
      return;
    }
  }

  var totalRows = lastRow - 1;
  var range = sheet.getRange(2, 1, totalRows, lastCol);
  var data = range.getValues();

  // Koleksi username yang sudah terpakai untuk deteksi tabrakan (anti-duplikat)
  var existingUsernames = {};
  for (var i = 0; i < data.length; i++) {
    var existingUname = String(data[i][colMap['username']] || '').trim().toLowerCase();
    if (existingUname) {
      existingUsernames[existingUname] = true;
    }
  }

  var countGenerated = 0;

  for (var rowIdx = 0; rowIdx < data.length; rowIdx++) {
    var currentRowNumber = rowIdx + 2;
    var row = data[rowIdx];
    var namaLengkap = String(row[colMap['nama_lengkap']] || '').trim();

    // Lewati jika nama_lengkap kosong
    if (!namaLengkap) {
      continue;
    }

    // 1. Generate id_pemilih jika belum terisi (USR-0001, USR-0002, dst.)
    if (!String(row[colMap['id_pemilih']] || '').trim()) {
      row[colMap['id_pemilih']] = 'USR-' + padZero(currentRowNumber - 1, 4);
    }

    // 2. Generate username unik jika belum terisi
    if (!String(row[colMap['username']] || '').trim()) {
      var newUsername = generateUniqueUsername(namaLengkap, existingUsernames);
      row[colMap['username']] = newUsername;
      existingUsernames[newUsername.toLowerCase()] = true;
      countGenerated++;
    }

    // 3. Generate token password 6 karakter jika belum terisi
    if (!String(row[colMap['password']] || '').trim()) {
      row[colMap['password']] = generateTabletFriendlyToken(6);
    }

    // 4. Inisialisasi status_memilih menjadi 'BELUM' jika masih kosong
    var currentStatus = String(row[colMap['status_memilih']] || '').trim().toUpperCase();
    if (!currentStatus || currentStatus !== 'SUDAH') {
      row[colMap['status_memilih']] = 'BELUM';
      row[colMap['waktu_memilih']] = '';
    }
  }

  // Tulis kembali seluruh data secara atomik (1 kali penulisan batch super cepat)
  range.setValues(data);
  SpreadsheetApp.flush();

  var notifMessage = 'Selesai! Berhasil memproses data warga SMANSA.\n' +
    'Total akun baru yang digenerate: ' + countGenerated + ' pemilih.\n' +
    'Seluruh Kolom A (ID), B (Username), C (Password), dan F (Status) telah siap digunakan!';

  ui.alert('⚡ Generate Akun Berhasil', notifMessage, ui.ButtonSet.OK);
}

/**
 * Menghasilkan username unik berbasis nama siswa dengan deteksi tabrakan
 * Contoh: "Keisha Anindya Putri" -> "keisha_01", jika bentrok -> "keisha_02", dst.
 * @param {string} fullName - Nama lengkap siswa/pegawai
 * @param {Object} takenMap - Map penampung username yang telah terpakai
 * @returns {string} Username unik bersih
 */
function generateUniqueUsername(fullName, takenMap) {
  // Ambil kata pertama atau nama depan
  var cleanName = fullName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  var parts = cleanName.split(/\s+/);
  var baseSlug = parts[0] || 'pemilih';

  // Jika nama depan terlalu pendek (misal: "m", "al"), gabungkan dengan nama kedua
  if (baseSlug.length <= 2 && parts.length > 1) {
    baseSlug = baseSlug + '_' + parts[1];
  }

  // Batasi panjang slug dasar maksimal 10 karakter
  if (baseSlug.length > 10) {
    baseSlug = baseSlug.substring(0, 10);
  }

  var suffixNum = 1;
  var candidate = baseSlug + '_' + padZero(suffixNum, 2);

  // Jika username sudah terpakai di baris lain, naikkan nomor akhiran
  while (takenMap[candidate.toLowerCase()]) {
    suffixNum++;
    candidate = baseSlug + '_' + padZero(suffixNum, 2);
  }

  return candidate;
}

/**
 * Menghasilkan token sandi 6 karakter alfanumerik acak
 * Menghilangkan karakter ambigu (0, O, o, 1, I, l) agar tidak keliru diketik di tablet.
 * @param {number} length - Panjang token (default 6 karakter)
 * @returns {string} Token sandi acak
 */
function generateTabletFriendlyToken(length) {
  var len = length || 6;
  // Karakter aman tanpa angka 0, 1 dan huruf O, I, l
  var safeCharset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  var token = '';

  for (var i = 0; i < len; i++) {
    var randomIndex = Math.floor(Math.random() * safeCharset.length);
    token += safeCharset.charAt(randomIndex);
  }

  return token;
}

/**
 * Helper Zero-Padding (misal: angka 7 menjadi "0007")
 * @param {number} num - Angka
 * @param {number} size - Jumlah digit total
 * @returns {string}
 */
function padZero(num, size) {
  var s = String(num);
  while (s.length < (size || 2)) {
    s = '0' + s;
  }
  return s;
}

var DUMMY_PASLON = [
  {
    id_paslon: 'PSL-01',
    nomor_urut: 1,
    label_paslon: 'PASLON 1',
    nama_paslon: 'Ksatria Arya & Amanda Putri',
    slogan: 'Kreatif, Kolaboratif, dan Berintegritas Nyata',
    foto_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
    youtube_video_id: 'dQw4w9WgXcQ',
    visi_misi: 'Visi: Menjadikan OSIS SMAN 1 Pontianak sebagai wadah inovasi digital dan kepemimpinan berakhlak mulia.\nMisi: Optimalisasi kegiatan ekstrakurikuler, digitalisasi sistem informasi siswa, dan penguatan kepedulian lingkungan.',
    perolehan_suara: 0
  },
  {
    id_paslon: 'PSL-02',
    nomor_urut: 2,
    label_paslon: 'PASLON 2',
    nama_paslon: 'Rafi Pratama & Naila Zahra',
    slogan: 'Solutif, Progresif, Menuju Prestasi Gemilang',
    foto_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
    youtube_video_id: 'dQw4w9WgXcQ',
    visi_misi: 'Visi: Mewujudkan siswa-siswi SMAN 1 Pontianak yang unggul dalam akademik, seni, dan solidaritas sosial.\nMisi: Mengadakan forum diskusi berkala, meningkatkan prestasi olimpiade, serta memajukan sarana prasarana minat bakat.',
    perolehan_suara: 0
  },
  {
    id_paslon: 'PSL-03',
    nomor_urut: 3,
    label_paslon: 'PASLON 3',
    nama_paslon: 'Fajar Ilham & Keysha Anindya',
    slogan: 'Bersatu dalam Semangat, Maju dengan Aksi Nyata',
    foto_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
    youtube_video_id: 'dQw4w9WgXcQ',
    visi_misi: 'Visi: Menumbuhkan budaya kolaboratif yang inklusif dan responsif terhadap aspirasi seluruh warga sekolah.\nMisi: Program keterbukaan saran siswa, pekan olahraga dan seni tahunan yang semarak, serta mentoring adik kelas.',
    perolehan_suara: 0
  }
];

/**
 * Inisialisasi Database Non-Destruktif (Safe Migrate):
 * Memeriksa sheet dan menyinkronkan header tanpa pernah menghapus baris data pengguna.
 */
function initDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logResults = [];

  try {
    var resPemilih = safeMigrateSheet(ss, CONFIG.SHEETS.PEMILIH, CONFIG.HEADERS.pemilih);
    logResults.push(resPemilih);

    var resPaslon = safeMigrateSheet(ss, CONFIG.SHEETS.PASLON, CONFIG.HEADERS.paslon);
    logResults.push(resPaslon);
    seedDataIfEmpty(ss, CONFIG.SHEETS.PASLON, DUMMY_PASLON, CONFIG.HEADERS.paslon);

    var resLog = safeMigrateSheet(ss, CONFIG.SHEETS.LOG_SUARA, CONFIG.HEADERS.log_suara);
    logResults.push(resLog);

    SpreadsheetApp.flush();
    return { success: true, message: 'Safe Migrate database berhasil!', details: logResults };
  } catch (error) {
    return { success: false, message: 'Gagal inisialisasi database: ' + error.message };
  }
}

/**
 * Safe Migrate: Memastikan sheet ada dan header kolom sinkron tanpa merusak data baris.
 */
function safeMigrateSheet(ss, sheetName, targetHeaders) {
  var sheet = ss.getSheetByName(sheetName);
  var actionLog = { sheet: sheetName, created: false, headersAdded: [] };

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(targetHeaders);
    formatHeaderRow(sheet, targetHeaders.length);
    actionLog.created = true;
    return actionLog;
  }

  var lastColumn = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();

  if (lastRow === 0 || lastColumn === 0) {
    sheet.appendRow(targetHeaders);
    formatHeaderRow(sheet, targetHeaders.length);
    actionLog.headersAdded = targetHeaders;
    return actionLog;
  }

  var existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];

  targetHeaders.forEach(function (header) {
    if (existingHeaders.indexOf(header) === -1) {
      var newColIndex = sheet.getLastColumn() + 1;
      sheet.getRange(1, newColIndex).setValue(header);
      actionLog.headersAdded.push(header);
    }
  });

  if (actionLog.headersAdded.length > 0) {
    formatHeaderRow(sheet, sheet.getLastColumn());
  }

  return actionLog;
}

/**
 * Menyuntikkan data awal hanya jika sheet belum memiliki baris data pengguna
 */
function seedDataIfEmpty(ss, sheetName, records, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1 && records.length > 0) {
    var rowsToInsert = records.map(function (item) {
      return headers.map(function (key) {
        return item[key] !== undefined ? item[key] : '';
      });
    });

    var range = sheet.getRange(2, 1, rowsToInsert.length, headers.length);
    range.setValues(rowsToInsert);
    SpreadsheetApp.flush();
  }
}

/**
 * Memberikan format visual standar pada baris header
 */
function formatHeaderRow(sheet, totalColumns) {
  if (totalColumns < 1) return;
  var headerRange = sheet.getRange(1, 1, 1, totalColumns);
  headerRange
    .setBackground('#004678')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
}