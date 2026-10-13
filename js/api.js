/**
 * ============================================================================
 * E-VOTING OSIS SMAN 1 PONTIANAK - API CLIENT ENGINE & MOCK FALLBACK
 * File: js/api.js
 * Developer: ZianBOT by zianxy
 * Deskripsi: Fetch wrapper HTTP request ke Google Apps Script REST API dengan
 *            dukungan Mock Data Fallback otomatis untuk preview instan.
 * ============================================================================
 */

// Ganti nilai string ini dengan URL Web App Google Apps Script setelah deploy
// Contoh: 'https://script.google.com/macros/s/AKfycbx.../exec'
const API_URL = 'https://script.google.com/macros/s/AKfycbxcmgyWd-iOWMuo5N59iwCn2qnTuh1Xy_qEaWiLT7oJaKoNbUklxWM5SHR8zonWD238/exec';

// Data mock awal yang sinkron persis dengan setup.gs
const MOCK_PASLON_INIT = [
  {
    id_paslon: 'PSL-01',
    nomor_urut: 1,
    label_paslon: 'PASLON 1',
    nama_paslon: 'Ksatria Arya & Amanda Putri',
    slogan: 'Kreatif, Kolaboratif, dan Berintegritas Nyata',
    foto_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
    youtube_video_id: 'dQw4w9WgXcQ',
    visi_misi: 'Visi: Menjadikan OSIS SMAN 1 Pontianak sebagai wadah inovasi digital dan kepemimpinan berakhlak mulia.\nMisi: Optimalisasi kegiatan ekstrakurikuler, digitalisasi sistem informasi siswa, dan penguatan kepedulian lingkungan.',
    perolehan_suara: 18
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
    perolehan_suara: 24
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
    perolehan_suara: 12
  }
];

const MOCK_PEMILIH_INIT = [
  { id_pemilih: 'USR-0001', username: 'keisha_101', password: 'xT8kL2', nama_lengkap: 'Keisha Anindya Putri', kelas: 'XII MIPA 1', status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0002', username: 'arya_01',    password: 'K7mQ9z', nama_lengkap: 'Arya Satria Pratama', kelas: 'XII MIPA 2', status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0003', username: 'rania-14',   password: 'W2pL8x', nama_lengkap: 'Rania Diva Maharani', kelas: 'XII IPS 1',  status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0004', username: 'fajar#22',   password: 'm9Vb4R', nama_lengkap: 'Fajar Hidayatullah',  kelas: 'XI MIPA 3',  status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0005', username: 'zahra_09',   password: 'j4Tn8Y', nama_lengkap: 'Zahra Nurul Aini',    kelas: 'XI IPS 2',   status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0006', username: 'dimas-55',   password: 'c6Pw1Q', nama_lengkap: 'Dimas Anggoro Putra', kelas: 'XI MIPA 1',  status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0007', username: 'nadia#17',   password: 'e3Lx7Z', nama_lengkap: 'Nadia Salsabila',     kelas: 'X-A',        status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0008', username: 'bintang_88', password: 'u8Kp2D', nama_lengkap: 'Bintang Ramadhan',   kelas: 'X-C',        status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0009', username: 'salma-33',   password: 'y5Ns9F', nama_lengkap: 'Salma Aulia Rahma',   kelas: 'X-E',        status_memilih: 'BELUM', waktu_memilih: '' },
  { id_pemilih: 'USR-0010', username: 'revan#99',   password: 'q1Zw6M', nama_lengkap: 'Revan Aditya Kusuma', kelas: 'XII IPS 3',  status_memilih: 'BELUM', waktu_memilih: '' }
];

// Menggunakan sessionStorage agar status mock bertahan selama sesi browser tanpa merusak DPT asli
const STORAGE_KEYS = {
  PASLON: 'evoting_mock_paslon',
  PEMILIH: 'evoting_mock_pemilih'
};

function getMockPaslonStore() {
  const stored = sessionStorage.getItem(STORAGE_KEYS.PASLON);
  if (stored) {
    try { return JSON.parse(stored); } catch (e) { /* fallback default */ }
  }
  sessionStorage.setItem(STORAGE_KEYS.PASLON, JSON.stringify(MOCK_PASLON_INIT));
  return JSON.parse(JSON.stringify(MOCK_PASLON_INIT));
}

function saveMockPaslonStore(data) {
  sessionStorage.setItem(STORAGE_KEYS.PASLON, JSON.stringify(data));
}

function getMockPemilihStore() {
  const stored = sessionStorage.getItem(STORAGE_KEYS.PEMILIH);
  if (stored) {
    try { return JSON.parse(stored); } catch (e) { /* fallback default */ }
  }
  sessionStorage.setItem(STORAGE_KEYS.PEMILIH, JSON.stringify(MOCK_PEMILIH_INIT));
  return JSON.parse(JSON.stringify(MOCK_PEMILIH_INIT));
}

function saveMockPemilihStore(data) {
  sessionStorage.setItem(STORAGE_KEYS.PEMILIH, JSON.stringify(data));
}

/**
 * STREAMING_CHUNK:Converting Google Drive URLs to lh3.googleusercontent.com direct links...
 * Helper: Mengonversi link gambar Google Drive menjadi link langsung lh3.googleusercontent.com
 * untuk mencegah error 403 Forbidden dan blokir hotlink browser.
 * @param {string} url - URL gambar asli dari Google Sheets
 * @returns {string} URL langsung yang ramah browser
 */
function formatImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80';
  }

  var cleanUrl = url.trim();

  // 1. Jika sudah dalam domain lh3.googleusercontent.com, gunakan langsung
  if (cleanUrl.indexOf('lh3.googleusercontent.com') !== -1) {
    return cleanUrl;
  }

  // 2. Format Google Drive /file/d/{ID}/view
  var matchFileId = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileId && matchFileId[1]) {
    return 'https://lh3.googleusercontent.com/d/' + matchFileId[1] + '=w800';
  }

  // 3. Format Google Drive ?id={ID} atau &id={ID}
  var matchParamId = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchParamId && matchParamId[1]) {
    return 'https://lh3.googleusercontent.com/d/' + matchParamId[1] + '=w800';
  }

  // 4. URL eksternal biasa (Unsplash, HTTPS publik, dsb.)
  return cleanUrl;
}

/**
 * Helper pengiriman request jaringan ke Google Apps Script Web App
 */
async function requestApi(action, options) {
  const opt = options || {};
  const method = opt.method || 'GET';
  const payload = opt.body || null;

  if (!API_URL || API_URL.trim() === '') {
    // Mode offline / mock aktif
    return null;
  }

  let url = API_URL;
  const fetchOptions = {
    method: method,
    headers: {
      'Content-Type': 'text/plain;charset=utf-8' // Menghindari browser OPTIONS preflight pada GAS
    },
    redirect: 'follow'
  };

  if (method === 'GET') {
    const separator = url.indexOf('?') === -1 ? '?' : '&';
    url = url + separator + 'action=' + encodeURIComponent(action);
    if (opt.params) {
      Object.keys(opt.params).forEach(function (key) {
        url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(opt.params[key]);
      });
    }
  } else if (method === 'POST') {
    const bodyPayload = payload || {};
    bodyPayload.action = action;
    fetchOptions.body = JSON.stringify(bodyPayload);
  }

  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      throw new Error('Jaringan HTTP bermasalah (status: ' + response.status + ')');
    }
    const result = await response.json();
    return result;
  } catch (err) {
    console.warn('[API Client] Permintaan jaringan gagal, beralih ke Mock Data Fallback: ' + err.message);
    return null;
  }
}

/**
 * Mengambil daftar paslon publik
 */
async function fetchPaslonList() {
  const remoteRes = await requestApi('get_paslon', { method: 'GET' });
  if (remoteRes && remoteRes.status === 'success' && Array.isArray(remoteRes.data)) {
    return remoteRes.data;
  }

  // Fallback Mock Data
  const localList = getMockPaslonStore();
  return localList.map(function (item) {
    return {
      id_paslon: item.id_paslon,
      nomor_urut: item.nomor_urut,
      label_paslon: item.label_paslon,
      nama_paslon: item.nama_paslon,
      slogan: item.slogan,
      foto_url: item.foto_url,
      youtube_video_id: item.youtube_video_id,
      visi_misi: item.visi_misi
    };
  });
}

/**
 * Mengambil rekap suara Quick Count Anonim (4 warna)
 */
async function fetchQuickCountData() {
  const remoteRes = await requestApi('get_quick_count', { method: 'GET' });
  if (remoteRes && remoteRes.status === 'success' && remoteRes.data) {
    return remoteRes.data;
  }

  // Fallback Mock Calculation
  const pemilihList = getMockPemilihStore();
  const paslonList = getMockPaslonStore();

  const totalDpt = pemilihList.length;
  let totalSuaraMasuk = 0;
  let totalBelumMemilih = 0;

  pemilihList.forEach(function (user) {
    if (user.status_memilih === 'SUDAH') {
      totalSuaraMasuk++;
    } else {
      totalBelumMemilih++;
    }
  });

  const warnaPalet = ['#0293ee', '#10b981', '#f59e0b']; // P1: Biru, P2: Hijau, P3: Kuning
  const segments = [];
  const basis = totalDpt > 0 ? totalDpt : 1;

  paslonList.forEach(function (p, index) {
    const suara = parseInt(p.perolehan_suara, 10) || 0;
    const persen = parseFloat(((suara / basis) * 100).toFixed(2));
    segments.push({
      key: 'paslon_' + p.nomor_urut,
      label: p.label_paslon || ('PASLON ' + p.nomor_urut),
      suara: suara,
      persentase: persen,
      color: warnaPalet[index % warnaPalet.length]
    });
  });

  // Segmen ke-4: Belum Memilih (Abu-Abu)
  const persenBelum = parseFloat(((totalBelumMemilih / basis) * 100).toFixed(2));
  segments.push({
    key: 'belum_memilih',
    label: 'Belum Memilih',
    suara: totalBelumMemilih,
    persentase: persenBelum,
    color: '#94a3b8'
  });

  return {
    total_dpt: totalDpt,
    total_suara_masuk: totalSuaraMasuk,
    total_belum_memilih: totalBelumMemilih,
    persentase_partisipasi: parseFloat(((totalSuaraMasuk / basis) * 100).toFixed(2)),
    segments: segments,
    updated_at: new Date().toLocaleTimeString('id-ID')
  };
}

/**
 * Otentikasi login pemilih
 */
async function authenticateVoter(username, password) {
  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '').trim();

  if (!cleanUsername || !cleanPassword) {
    return {
      success: false,
      message: 'Username dan Password token wajib diisi.'
    };
  }

  const remoteRes = await requestApi('login', {
    method: 'POST',
    body: {
      username: cleanUsername,
      password: cleanPassword
    }
  });

  if (remoteRes) {
    if (remoteRes.status === 'success') {
      return {
        success: true,
        message: remoteRes.message || 'Login berhasil.',
        data: remoteRes.data
      };
    } else {
      return {
        success: false,
        message: remoteRes.message || 'Login ditolak.',
        errorCode: remoteRes.error_code || null
      };
    }
  }

  // Jika URL API terpasang namun request gagal, laporkan error sebenarnya (Anti Silent Failure)
  if (API_URL && API_URL.trim() !== '') {
    return {
      success: false,
      message: 'Gagal menghubungi server otentikasi sekolah. Periksa koneksi internet/Wi-Fi bilik suara.',
      errorCode: 'NETWORK_ERROR'
    };
  }

  // Fallback Mock Authentication HANYA jika API_URL sengaja dikosongkan (Mode Pengujian Lokal Offline)
  const pemilihList = getMockPemilihStore();
  const foundUser = pemilihList.find(function (u) {
    return u.username.toLowerCase() === cleanUsername.toLowerCase();
  });

  if (!foundUser) {
    return {
      success: false,
      message: 'Username tidak ditemukan dalam DPT sekolah.'
    };
  }

  if (foundUser.password !== cleanPassword) {
    return {
      success: false,
      message: 'Password token salah. Periksa kembali kartu token pemilihan Anda.'
    };
  }

  if (foundUser.status_memilih === 'SUDAH') {
    return {
      success: false,
      errorCode: 'ALREADY_VOTED',
      message: 'Hak suara untuk akun ini sudah digunakan.'
    };
  }

  // Buat mock session token untuk pengujian lokal
  const mockToken = 'mock_sess_' + Math.random().toString(36).substring(2, 10);
  return {
    success: true,
    message: 'Login berhasil (Mode Demo Lokal).',
    data: {
      id_pemilih: foundUser.id_pemilih,
      username: foundUser.username,
      nama_lengkap: foundUser.nama_lengkap,
      kelas: foundUser.kelas,
      token_session: mockToken
    }
  };
}

/**
 * Mengirimkan pilihan suara dari bilik suara ke backend database server sekolah
 * KRITIS: DILARANG KERAS memalsukan keberhasilan vote (Mock Fallback) jika server gagal!
 */
async function submitVoteChoice(idPemilih, username, idPaslon, tokenSession) {
  const remoteRes = await requestApi('submit_vote', {
    method: 'POST',
    body: {
      id_pemilih: idPemilih,
      username: username,
      id_paslon: idPaslon,
      token_session: tokenSession
    }
  });

  if (remoteRes) {
    if (remoteRes.status === 'success') {
      return {
        success: true,
        message: remoteRes.message || 'Pilihan suara berhasil dicatat.',
        data: remoteRes.data
      };
    } else {
      return {
        success: false,
        message: remoteRes.message || 'Gagal mengirimkan suara.',
        errorCode: remoteRes.error_code || null
      };
    }
  }

  // JIKA REQUEST REMOTE GAGAL ATAU SERVER TIMEOUT:
  // JANGAN PERNAH MENGGUNAKAN MOCK FALLBACK! Suara wajib tersimpan nyata di Google Sheets server sekolah.
  if (API_URL && API_URL.trim() !== '') {
    return {
      success: false,
      message: 'Koneksi ke server database sekolah terputus atau timeout. Suara Anda BELUM tersimpan! Silakan tekan tombol konfirmasi sekali lagi atau hubungi panitia.',
      errorCode: 'NETWORK_ERROR'
    };
  }

  // Mode Demo Lokal Eksklusif: Hanya dieksekusi jika API_URL kosong total
  const pemilihList = getMockPemilihStore();
  const paslonList = getMockPaslonStore();

  const userIdx = pemilihList.findIndex(function (u) {
    return u.id_pemilih === idPemilih;
  });

  if (userIdx === -1) {
    return { success: false, message: 'Pemilih tidak ditemukan.' };
  }

  if (pemilihList[userIdx].status_memilih === 'SUDAH') {
    return {
      success: false,
      errorCode: 'ALREADY_VOTED',
      message: 'Anda sudah tercatat melakukan pemilihan sebelumnya.'
    };
  }

  pemilihList[userIdx].status_memilih = 'SUDAH';
  pemilihList[userIdx].waktu_memilih = new Date().toLocaleTimeString('id-ID');
  saveMockPemilihStore(pemilihList);

  const paslonIdx = paslonList.findIndex(function (p) {
    return p.id_paslon === idPaslon;
  });

  if (paslonIdx !== -1) {
    paslonList[paslonIdx].perolehan_suara = (parseInt(paslonList[paslonIdx].perolehan_suara, 10) || 0) + 1;
    saveMockPaslonStore(paslonList);
  }

  const receiptNum = 'VTE-DEMO-' + Math.floor(1000 + Math.random() * 9000);
  return {
    success: true,
    message: 'Suara Anda berhasil disimpan (Mode Demo).',
    data: {
      receipt_code: receiptNum,
      waktu_memilih: pemilihList[userIdx].waktu_memilih
    }
  };
}

window.VotingAPI = {
  getApiUrl: function () { return API_URL; },
  formatImageUrl: formatImageUrl,
  fetchPaslonList: fetchPaslonList,
  fetchQuickCountData: fetchQuickCountData,
  authenticateVoter: authenticateVoter,
  submitVoteChoice: submitVoteChoice
};
