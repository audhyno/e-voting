/**
 * ============================================================================
 * E-VOTING OSIS SMAN 1 PONTIANAK - AUTHENTICATION & SESSION MANAGER
 * File: js/auth.js
 * Developer: ZianBOT by zianxy
 * Deskripsi: Manajemen sesi pemilih steril di perangkat tablet/laptop,
 *            proteksi multi-login, auto-purge session, dan custom toast engine.
 * ============================================================================
 */

// Kunci penyimpanan sesi lokal khusus browser
const AUTH_STORAGE_KEYS = {
  SESSION_USER: 'evoting_voter_session',
  LOGIN_TIMESTAMP: 'evoting_login_timestamp',
  VOTED_RECEIPT: 'evoting_voted_receipt'
};

// Daftar listener callback untuk mendengarkan perubahan status autentikasi
const authStateListeners = [];

/**
 * Menampilkan pesan toast modern pengganti alert() browser
 * @param {string} message - Pesan yang ingin ditampilkan
 * @param {'info' | 'success' | 'error'} [type='info'] - Jenis pesan
 * @param {number} [duration=3500] - Durasi tampil dalam milidetik
 */
function showToast(message, type, duration) {
  const toastType = type || 'info';
  const toastDuration = duration || 3500;

  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toastItem = document.createElement('div');
  toastItem.className = 'toast ' + toastType;

  toastItem.textContent = message;
  container.appendChild(toastItem);

  // Otomatis hapus elemen toast setelah durasi selesai
  setTimeout(function () {
    toastItem.style.opacity = '0';
    toastItem.style.transform = 'translateY(10px)';
    toastItem.style.transition = 'all 0.3s ease';
    setTimeout(function () {
      if (toastItem.parentNode) {
        toastItem.parentNode.removeChild(toastItem);
      }
    }, 300);
  }, toastDuration);
}

/**
 * Menyimpan data pemilih yang berhasil login ke dalam sessionStorage
 * @param {Object} userData - Objek data pemilih
 */
function saveVoterSession(userData) {
  if (!userData || !userData.id_pemilih) {
    console.error('[Auth] Data sesi tidak valid untuk disimpan.');
    return;
  }

  const sessionPayload = {
    id_pemilih: userData.id_pemilih,
    username: userData.username,
    nama_lengkap: userData.nama_lengkap,
    kelas: userData.kelas,
    token_session: userData.token_session,
    login_at: new Date().getTime()
  };

  try {
    sessionStorage.setItem(AUTH_STORAGE_KEYS.SESSION_USER, JSON.stringify(sessionPayload));
    sessionStorage.setItem(AUTH_STORAGE_KEYS.LOGIN_TIMESTAMP, String(sessionPayload.login_at));
    notifyAuthStateChange(true, sessionPayload);
  } catch (err) {
    console.error('[Auth] Gagal menyimpan data sesi:', err);
  }
}

/**
 * Mengambil data pemilih yang sedang aktif
 * @returns {Object|null} Objek pemilih atau null jika belum login
 */
function getCurrentVoter() {
  try {
    const rawData = sessionStorage.getItem(AUTH_STORAGE_KEYS.SESSION_USER);
    if (!rawData) {
      return null;
    }
    return JSON.parse(rawData);
  } catch (err) {
    console.warn('[Auth] Gagal membaca sesi pemilih:', err);
    return null;
  }
}

/**
 * Memeriksa apakah terdapat sesi pemilih aktif
 * @returns {boolean}
 */
function isVoterLoggedIn() {
  const voter = getCurrentVoter();
  return Boolean(voter && voter.id_pemilih && voter.token_session);
}

/**
 * Memproses login pemilih melalui VotingAPI
 * @param {string} username - Username akun pemilih
 * @param {string} password - Password token 6 karakter
 * @returns {Promise<{success: boolean, message: string, voter?: Object}>}
 */
async function loginVoter(username, password) {
  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '').trim();

  if (!cleanUsername) {
    showToast('Username wajib diisi.', 'error');
    return { success: false, message: 'Username wajib diisi.' };
  }

  if (!cleanPassword) {
    showToast('Password token wajib diisi.', 'error');
    return { success: false, message: 'Password token wajib diisi.' };
  }

  // Panggil API Engine (dengan fallback mock lokal otomatis)
  try {
    const res = await window.VotingAPI.authenticateVoter(cleanUsername, cleanPassword);

    if (res && res.success && res.data) {
      saveVoterSession(res.data);
      showToast('Otentikasi berhasil. Selamat datang, ' + res.data.nama_lengkap + '!', 'success');
      return {
        success: true,
        message: res.message || 'Login berhasil.',
        voter: res.data
      };
    } else {
      const errMsg = (res && res.message) ? res.message : 'Login gagal. Periksa kembali token Anda.';
      showToast(errMsg, 'error');
      return {
        success: false,
        message: errMsg,
        errorCode: res ? res.errorCode : null
      };
    }
  } catch (err) {
    const networkMsg = 'Terjadi kesalahan sistem saat otentikasi: ' + err.message;
    showToast(networkMsg, 'error');
    return { success: false, message: networkMsg };
  }
}

/**
 * Menghapus seluruh jejak data sesi pemilih secara permanen dari perangkat
 * Berfungsi membersihkan tablet agar siap digunakan oleh antrean siswa berikutnya
 */
function logoutVoter() {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEYS.SESSION_USER);
    sessionStorage.removeItem(AUTH_STORAGE_KEYS.LOGIN_TIMESTAMP);
    // Bersihkan formulir login jika elemen tersedia di DOM
    const formLogin = document.getElementById('loginForm');
    if (formLogin) {
      formLogin.reset();
    }
  } catch (e) {
    console.warn('[Auth] Terjadi kendala saat pembersihan sesi:', e);
  }

  notifyAuthStateChange(false, null);
}

/**
 * Menyimpan tanda bukti nomor transaksi suara selesai
 * @param {string} receiptCode - Nomor receipt (contoh: VTE-0001)
 */
function saveVotingReceipt(receiptCode) {
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEYS.VOTED_RECEIPT, receiptCode || '');
  } catch (e) {
    /* Safe ignore */
  }
}

/**
 * Mengambil tanda bukti nomor transaksi suara
 * @returns {string}
 */
function getVotingReceipt() {
  return sessionStorage.getItem(AUTH_STORAGE_KEYS.VOTED_RECEIPT) || '';
}

/**
 * Mendaftarkan callback untuk memantau perubahan status sesi
 * @param {Function} callback - Menerima parameter (isLoggedIn, voterData)
 */
function onAuthStateChanged(callback) {
  if (typeof callback === 'function') {
    authStateListeners.push(callback);
  }
}

/**
 * Memberitahukan seluruh listener saat status sesi berubah
 */
function notifyAuthStateChange(isLoggedIn, voterData) {
  authStateListeners.forEach(function (listener) {
    try {
      listener(isLoggedIn, voterData);
    } catch (err) {
      console.error('[Auth] Error pada salah satu auth state listener:', err);
    }
  });
}

/**
 * Pengaman history browser untuk mencegah tombol Back membatalkan proses bilik suara
 */
function lockBrowserHistory() {
  window.history.pushState(null, '', window.location.href);
  window.onpopstate = function () {
    window.history.pushState(null, '', window.location.href);
  };
}

// Ekspor modul ke objek global window
window.AuthManager = {
  showToast: showToast,
  saveVoterSession: saveVoterSession,
  getCurrentVoter: getCurrentVoter,
  isVoterLoggedIn: isVoterLoggedIn,
  loginVoter: loginVoter,
  logoutVoter: logoutVoter,
  saveVotingReceipt: saveVotingReceipt,
  getVotingReceipt: getVotingReceipt,
  onAuthStateChanged: onAuthStateChanged,
  lockBrowserHistory: lockBrowserHistory
};
