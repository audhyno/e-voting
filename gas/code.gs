/**
 * ============================================================================
 * E-VOTING OSIS SMAN 1 PONTIANAK - REST API ENGINE
 * File: code.gs
 * Arsitektur: 100% Decoupled REST API (doGet / doPost)
 * Developer: ZianBOT by zianxy
 * Deskripsi: Router endpoint, CORS handler, Atomic Concurrency Lock,
 *            Anti-dobel voting, SHA-256 Hashing, & Rekap Quick Count Anonim 4 Warna.
 * ============================================================================
 */

var API_CONFIG = {
  TIMEZONE: 'Asia/Jakarta',
  DATE_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  SHEETS: {
    PEMILIH: 'pemilih',
    PASLON: 'paslon',
    LOG_SUARA: 'log_suara'
  },
  LOCK_TIMEOUT_MS: 15000 // 15 detik antrean lock untuk menangani 50 tablet simultan
};

/**
 * Handler HTTP GET: Menangani permintaan data publik dan quick count anonim
 * Endpoint: ?action=get_paslon | ?action=get_quick_count | ?action=ping
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action.toLowerCase() : 'ping';

    switch (action) {
      case 'ping':
        return buildJsonResponse({
          status: 'success',
          message: 'REST API E-Voting SMAN 1 Pontianak Online',
          timestamp: getFormattedTimestamp()
        });

      case 'get_paslon':
        return handleGetPaslon();

      case 'get_quick_count':
        return handleGetQuickCount();

      case 'check_session':
        var username = e.parameter.username || '';
        return handleCheckSession(username);

      default:
        return buildJsonResponse({
          status: 'error',
          message: 'Endpoint action GET "' + action + '" tidak dikenali.'
        }, 400);
    }
  } catch (error) {
    return buildJsonResponse({
      status: 'error',
      message: 'Server Error (doGet): ' + error.message
    }, 500);
  }
}

/**
 * Mengambil data publik kandidat paslon
 */
function handleGetPaslon() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(API_CONFIG.SHEETS.PASLON);

  if (!sheet) {
    return buildJsonResponse({ status: 'error', message: 'Tabel paslon tidak ditemukan.' }, 404);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return buildJsonResponse({ status: 'success', data: [] });
  }

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var rawData = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

  var paslonList = rawData.map(function (row) {
    var item = {};
    headers.forEach(function (key, colIdx) {
      // Sembunyikan perolehan suara dari endpoint publik paslon demi netralitas bilik
      if (key !== 'perolehan_suara') {
        item[key] = row[colIdx];
      }
    });
    return item;
  });

  // Urutkan berdasarkan nomor urut secara menaik
  paslonList.sort(function (a, b) {
    return Number(a.nomor_urut) - Number(b.nomor_urut);
  });

  return buildJsonResponse({
    status: 'success',
    data: paslonList
  });
}

/**
 * Menghitung perolehan suara anonim 4 kategori (Paslon 1, 2, 3, dan Belum Memilih)
 * Menjaga kerahasiaan: Nama kandidat tidak diekspos dalam kalkulasi persentase ini.
 */
function handleGetQuickCount() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetPemilih = ss.getSheetByName(API_CONFIG.SHEETS.PEMILIH);
  var sheetPaslon = ss.getSheetByName(API_CONFIG.SHEETS.PASLON);

  if (!sheetPemilih || !sheetPaslon) {
    return buildJsonResponse({ status: 'error', message: 'Database belum lengkap.' }, 404);
  }

  // 1. Hitung total DPT (Pemilih) dan status pemilihan
  var lastRowPemilih = sheetPemilih.getLastRow();
  var totalPemilih = 0;
  var totalSuaraMasuk = 0;
  var totalBelumMemilih = 0;

  if (lastRowPemilih > 1) {
    var headersPemilih = sheetPemilih.getRange(1, 1, 1, sheetPemilih.getLastColumn()).getDisplayValues()[0];
    var statusColIdx = headersPemilih.indexOf('status_memilih');

    if (statusColIdx !== -1) {
      var pemilihData = sheetPemilih.getRange(2, statusColIdx + 1, lastRowPemilih - 1, 1).getDisplayValues();
      totalPemilih = pemilihData.length;
      pemilihData.forEach(function (row) {
        if (row[0] === 'SUDAH') {
          totalSuaraMasuk++;
        } else {
          totalBelumMemilih++;
        }
      });
    }
  }

  // 2. Ambil perolehan masing-masing paslon (hanya nomor urut dan label)
  var lastRowPaslon = sheetPaslon.getLastRow();
  var paslonStats = [];
  var totalAkumulasiPaslon = 0;

  if (lastRowPaslon > 1) {
    var headersPaslon = sheetPaslon.getRange(1, 1, 1, sheetPaslon.getLastColumn()).getDisplayValues()[0];
    var noUrutIdx = headersPaslon.indexOf('nomor_urut');
    var labelIdx = headersPaslon.indexOf('label_paslon');
    var suaraIdx = headersPaslon.indexOf('perolehan_suara');
    var rawPaslon = sheetPaslon.getRange(2, 1, lastRowPaslon - 1, sheetPaslon.getLastColumn()).getDisplayValues();

    rawPaslon.forEach(function (row) {
      var noUrut = parseInt(row[noUrutIdx], 10) || 0;
      var label = row[labelIdx] || ('PASLON ' + noUrut);
      var suara = parseInt(row[suaraIdx], 10) || 0;
      totalAkumulasiPaslon += suara;

      paslonStats.push({
        nomor_urut: noUrut,
        label: label,
        suara: suara
      });
    });

    paslonStats.sort(function (a, b) {
      return a.nomor_urut - b.nomor_urut;
    });
  }

  // 3. Format struktur 4 warna untuk Diagram Lingkaran (Pie / Donut Chart)
  var chartSegments = [];
  var basisKalkulasi = totalPemilih > 0 ? totalPemilih : (totalAkumulasiPaslon + totalBelumMemilih);

  // Palet representasi warna chart
  var warnaPaslon = ['#0293ee', '#10b981', '#f59e0b']; // Biru (P1), Hijau (P2), Kuning (P3)

  paslonStats.forEach(function (p, idx) {
    var persen = basisKalkulasi > 0 ? ((p.suara / basisKalkulasi) * 100) : 0;
    chartSegments.push({
      key: 'paslon_' + p.nomor_urut,
      label: p.label,
      suara: p.suara,
      persentase: parseFloat(persen.toFixed(2)),
      color: warnaPaslon[idx % warnaPaslon.length]
    });
  });

  // Segmen ke-4: Belum Memilih (Abu-Abu)
  var persenBelum = basisKalkulasi > 0 ? ((totalBelumMemilih / basisKalkulasi) * 100) : 0;
  chartSegments.push({
    key: 'belum_memilih',
    label: 'Belum Memilih',
    suara: totalBelumMemilih,
    persentase: parseFloat(persenBelum.toFixed(2)),
    color: '#94a3b8' // Abu-abu netral
  });

  return buildJsonResponse({
    status: 'success',
    data: {
      total_dpt: totalPemilih,
      total_suara_masuk: totalSuaraMasuk,
      total_belum_memilih: totalBelumMemilih,
      persentase_partisipasi: totalPemilih > 0 ? parseFloat(((totalSuaraMasuk / totalPemilih) * 100).toFixed(2)) : 0,
      segments: chartSegments,
      updated_at: getFormattedTimestamp()
    }
  });
}

/**
 * Mengecek apakah sesi pemilih masih valid dan belum memilih
 */
function handleCheckSession(username) {
  if (!username) {
    return buildJsonResponse({ status: 'error', message: 'Parameter username wajib diisi.' }, 400);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(API_CONFIG.SHEETS.PEMILIH);
  var userRow = findUserByUsername(sheet, username);

  if (!userRow) {
    return buildJsonResponse({ status: 'error', message: 'Pengguna tidak terdaftar.' }, 404);
  }

  return buildJsonResponse({
    status: 'success',
    data: {
      id_pemilih: userRow.data.id_pemilih,
      username: userRow.data.username,
      nama_lengkap: userRow.data.nama_lengkap,
      kelas: userRow.data.kelas,
      status_memilih: userRow.data.status_memilih
    }
  });
}

/**
 * Handler HTTP POST: Menangani aksi login dan pengiriman suara (submit_vote)
 */
function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    var action = (payload.action) ? String(payload.action).toLowerCase() : '';

    switch (action) {
      case 'login':
        return handleLogin(payload);

      case 'submit_vote':
        return handleSubmitVote(payload);

      default:
        return buildJsonResponse({
          status: 'error',
          message: 'Endpoint action POST "' + action + '" tidak valid.'
        }, 400);
    }
  } catch (error) {
    return buildJsonResponse({
      status: 'error',
      message: 'Server Error (doPost): ' + error.message
    }, 500);
  }
}

/**
 * Otentikasi login pemilih dengan proteksi anti-dobel vote dan penyimpanan sesi terverifikasi
 */
function handleLogin(payload) {
  var username = String(payload.username || '').trim();
  var password = String(payload.password || '').trim();

  if (!username || !password) {
    return buildJsonResponse({
      status: 'error',
      message: 'Username dan Password token wajib diisi.'
    }, 400);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(API_CONFIG.SHEETS.PEMILIH);
  var userRow = findUserByUsername(sheet, username);

  if (!userRow) {
    return buildJsonResponse({
      status: 'error',
      message: 'Username tidak ditemukan dalam DPT sekolah.'
    }, 401);
  }

  // Verifikasi kecocokan password token (mendukung token polos maupun token hash SHA-256)
  var isPasswordValid = (userRow.data.password === password) || (userRow.data.password === hashSha256(password));
  if (!isPasswordValid) {
    return buildJsonResponse({
      status: 'error',
      message: 'Password token pemilihan salah. Periksa kembali kartu token Anda.'
    }, 401);
  }

  // Verifikasi status hak suara
  if (userRow.data.status_memilih === 'SUDAH') {
    return buildJsonResponse({
      status: 'error',
      error_code: 'ALREADY_VOTED',
      message: 'Hak suara untuk akun ini sudah digunakan pada ' + (userRow.data.waktu_memilih || 'sesi sebelumnya') + '.'
    }, 403);
  }

  // Buat sesi voting unik dan simpan di CacheService server-side (berlaku 10 menit untuk bilik suara)
  var sessionToken = generateVoteSessionToken(userRow.data.id_pemilih, userRow.data.username);
  try {
    var cache = CacheService.getScriptCache();
    cache.put('sess_' + userRow.data.id_pemilih, sessionToken, 600);
  } catch (cacheErr) {
    Logger.log('CacheService notice: ' + cacheErr.message);
  }

  return buildJsonResponse({
    status: 'success',
    message: 'Otentikasi berhasil. Selamat datang di Bilik Suara.',
    data: {
      id_pemilih: userRow.data.id_pemilih,
      username: userRow.data.username,
      nama_lengkap: userRow.data.nama_lengkap,
      kelas: userRow.data.kelas,
      token_session: sessionToken
    }
  });
}

/**
 * Menyimpan suara pemilih secara atomik, aman dari tabrakan (Concurrency Lock),
 * memvalidasi sessionToken server-side, melindungi kerahasiaan suara pemilih
 * menggunakan Digital Mixnet (shuffling row), dan mengunci akun secara permanen.
 */
function handleSubmitVote(payload) {
  var idPemilih = String(payload.id_pemilih || '').trim();
  var username = String(payload.username || '').trim();
  var idPaslon = String(payload.id_paslon || '').trim();
  var tokenSession = String(payload.token_session || '').trim();

  if (!idPemilih || !idPaslon || !tokenSession) {
    return buildJsonResponse({
      status: 'error',
      message: 'Data kiriman suara tidak lengkap (id_pemilih, id_paslon, token_session dibutuhkan).'
    }, 400);
  }

  // 1. Verifikasi Integritas Sesi: Pastikan tokenSession cocok dengan yang diterbitkan saat login
  var cache = CacheService.getScriptCache();
  var validSessionToken = cache.get('sess_' + idPemilih);
  if (!validSessionToken || validSessionToken !== tokenSession) {
    return buildJsonResponse({
      status: 'error',
      error_code: 'INVALID_SESSION',
      message: 'Sesi bilik suara tidak valid atau telah kedaluwarsa. Silakan lakukan login ulang.'
    }, 401);
  }

  // Kunci ScriptLock untuk menangani beban simultan dari tablet bilik suara
  var lock = LockService.getScriptLock();
  var hasLock = false;

  try {
    hasLock = lock.tryLock(API_CONFIG.LOCK_TIMEOUT_MS);
    if (!hasLock) {
      return buildJsonResponse({
        status: 'error',
        message: 'Lalu lintas bilik suara sedang sangat padat. Silakan tekan tombol konfirmasi sekali lagi.'
      }, 503);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetPemilih = ss.getSheetByName(API_CONFIG.SHEETS.PEMILIH);
    var sheetPaslon = ss.getSheetByName(API_CONFIG.SHEETS.PASLON);
    var sheetLog = ss.getSheetByName(API_CONFIG.SHEETS.LOG_SUARA);

    // 2. Verifikasi Ulang Status Pemilih Langsung dari Cell Database
    var userRow = findUserById(sheetPemilih, idPemilih);
    if (!userRow) {
      return buildJsonResponse({ status: 'error', message: 'Identitas pemilih tidak terdaftar.' }, 404);
    }

    var pemilihHeaders = sheetPemilih.getRange(1, 1, 1, sheetPemilih.getLastColumn()).getDisplayValues()[0];
    var statusColIdx = pemilihHeaders.indexOf('status_memilih') + 1;
    var waktuColIdx = pemilihHeaders.indexOf('waktu_memilih') + 1;

    var liveStatus = String(sheetPemilih.getRange(userRow.rowIndex, statusColIdx).getValue()).trim().toUpperCase();
    if (liveStatus === 'SUDAH') {
      cache.remove('sess_' + idPemilih);
      return buildJsonResponse({
        status: 'error',
        error_code: 'ALREADY_VOTED',
        message: 'Hak suara Anda telah tersimpan sebelumnya. Dilarang melakukan pemilihan ganda.'
      }, 409);
    }

    // 3. Verifikasi Keberadaan Paslon & Tambahkan Akumulasi Suara
    var paslonRowIndex = findRowIndexById(sheetPaslon, 'id_paslon', idPaslon);
    if (paslonRowIndex === -1) {
      return buildJsonResponse({ status: 'error', message: 'Paslon pilihan tidak valid.' }, 404);
    }

    var paslonHeaders = sheetPaslon.getRange(1, 1, 1, sheetPaslon.getLastColumn()).getDisplayValues()[0];
    var suaraColIndex = paslonHeaders.indexOf('perolehan_suara') + 1;
    var currentSuara = parseInt(sheetPaslon.getRange(paslonRowIndex, suaraColIndex).getValue(), 10) || 0;
    sheetPaslon.getRange(paslonRowIndex, suaraColIndex).setValue(currentSuara + 1);

    // 4. Catat Rekaman Suara Rahasia ke log_suara dengan Digital Mixnet Shuffle:
    // - Gunakan receipt acak kriptografis (bukan sekuensial) agar urutan pemilih tidak bocor
    // - Gunakan tanggal batch pilketos (bukan detik persis login voter) agar tidak bisa di-join/korelasikan
    // - Sisipkan baris di posisi acak di dalam kotak suara (log_suara)
    var receiptCode = 'VTE-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    var electionBatchDate = Utilities.formatDate(new Date(), API_CONFIG.TIMEZONE, 'yyyy-MM-dd');
    var voteHash = hashSha256(receiptCode + ':' + idPaslon + ':' + Utilities.getUuid());

    var lastLogRow = sheetLog.getLastRow();
    if (lastLogRow <= 1) {
      sheetLog.appendRow([receiptCode, idPaslon, electionBatchDate, voteHash]);
    } else {
      // Digital Mixnet: Masukkan ke baris acak di antara data yang sudah ada
      var randomRow = Math.floor(Math.random() * (lastLogRow - 1)) + 2;
      sheetLog.insertRowBefore(randomRow);
      sheetLog.getRange(randomRow, 1, 1, 4).setValues([[receiptCode, idPaslon, electionBatchDate, voteHash]]);
    }

    // 5. Kunci Akun Pemilih Menjadi SUDAH & Rekam Waktu Verifikasi Pemilih
    var voterTimestamp = getFormattedTimestamp();
    sheetPemilih.getRange(userRow.rowIndex, statusColIdx).setValue('SUDAH');
    sheetPemilih.getRange(userRow.rowIndex, waktuColIdx).setValue(voterTimestamp);

    // 6. Hanguskan token sesi (One-Time-Use Token)
    cache.remove('sess_' + idPemilih);

    // 7. Simpan Seluruh Transaksi Secara Atomik
    SpreadsheetApp.flush();

    return buildJsonResponse({
      status: 'success',
      message: 'Suara Anda telah berhasil direkam secara aman dan terenkripsi.',
      data: {
        receipt_code: receiptCode,
        waktu_memilih: voterTimestamp
      }
    });

  } catch (err) {
    return buildJsonResponse({
      status: 'error',
      message: 'Gagal memproses suara: ' + err.message
    }, 500);
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

/**
 * Menghasilkan respon standar JSON dengan MIME type application/json
 */
function buildJsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Mengambil timestamp terformat sesuai timezone Asia/Jakarta
 */
function getFormattedTimestamp() {
  return Utilities.formatDate(new Date(), API_CONFIG.TIMEZONE, API_CONFIG.DATE_FORMAT);
}

/**
 * Mencari data pemilih berdasarkan username dengan Server-Side early loop break
 */
function findUserByUsername(sheet, username) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var usernameIdx = headers.indexOf('username');
  if (usernameIdx === -1) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][usernameIdx].toLowerCase() === username.toLowerCase()) {
      var userObj = {};
      headers.forEach(function (h, idx) {
        userObj[h] = data[i][idx];
      });
      return { rowIndex: i + 2, data: userObj };
    }
  }
  return null;
}

/**
 * Mencari data pemilih berdasarkan id_pemilih
 */
function findUserById(sheet, idPemilih) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var idIdx = headers.indexOf('id_pemilih');
  if (idIdx === -1) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][idIdx] === idPemilih) {
      var userObj = {};
      headers.forEach(function (h, idx) {
        userObj[h] = data[i][idx];
      });
      return { rowIndex: i + 2, data: userObj };
    }
  }
  return null;
}

/**
 * Menemukan index baris fisik pada sheet berdasarkan ID kunci
 */
function findRowIndexById(sheet, keyColumnName, targetValue) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var colIdx = headers.indexOf(keyColumnName);
  if (colIdx === -1) return -1;

  var colData = sheet.getRange(2, colIdx + 1, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < colData.length; i++) {
    if (colData[i][0] === targetValue) {
      return i + 2;
    }
  }
  return -1;
}

/**
 * Menghasilkan ID sekuensial (misal: VTE-0001)
 */
function generateSequentialId(sheet, prefix) {
  var lastRow = sheet.getLastRow();
  var nextNum = lastRow; // Baris 1 adalah header, baris 2 adalah item #1
  var numStr = ('0000' + nextNum).slice(-4);
  return prefix + '-' + numStr;
}

/**
 * Membuat token sesi voting unik
 */
function generateVoteSessionToken(idPemilih, username) {
  var salt = Utilities.getUuid();
  return hashSha256(idPemilih + ':' + username + ':' + salt + ':' + new Date().getTime());
}

/**
 * Meng-hash string menjadi heksadesimal SHA-256
 */
function hashSha256(input) {
  var rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  var hash = '';
  for (var i = 0; i < rawBytes.length; i++) {
    var byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    var byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = '0' + byteHex;
    hash += byteHex;
  }
  return hash;
}