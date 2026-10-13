/**
 * ============================================================================
 * E-VOTING OSIS SMAN 1 PONTIANAK - VOTING CONTROLLER & BOOTH ENGINE
 * File: js/vote.js
 * Developer: ZianBOT by zianxy
 * Deskripsi: Timer hitung mundur 180 detik bilik suara, eksplorasi visi & misi
 *            serta slogan paslon inline di bilik suara sebelum konfirmasi,
 *            modal konfirmasi pilihan kaya info, transaksi suara aman, & auto-reset 5s.
 * ============================================================================
 */

// Konstanta durasi waktu bilik suara
const BOOTH_CONFIG = {
  TIMER_DURATION_SECONDS: 180, // 3 menit waktu voting di bilik
  DANGER_THRESHOLD_SECONDS: 30, // 30 detik sisa waktu memicu animasi pulsing merah
  AUTO_RESET_SECONDS: 5        // 5 detik durasi tampilan selesai sebelum reset tablet
};

// State internal bilik suara
let countdownIntervalInstance = null;
let remainingSeconds = BOOTH_CONFIG.TIMER_DURATION_SECONDS;
let currentlySelectedPaslon = null;
let currentBoothPaslonIndex = null;
let cachedBallotPaslonList = [];
let isVoteSubmitting = false;
let autoResetTimerInstance = null;

/**
 * Inisialisasi bilik suara saat pemilih memasuki view-bilik
 */
async function initBooth() {
  // 1. Validasi sesi pemilih aktif
  if (!window.AuthManager || !window.AuthManager.isVoterLoggedIn()) {
    if (window.AuthManager) {
      window.AuthManager.showToast('Sesi tidak valid. Silakan login terlebih dahulu.', 'error');
    }
    if (window.App && typeof window.App.switchView === 'function') {
      window.App.switchView(window.App.VIEWS.HOME);
    }
    return;
  }

  const currentVoter = window.AuthManager.getCurrentVoter();

  // 2. Tampilkan identitas pemilih di top bar bilik
  renderVoterIdentity(currentVoter);

  // 3. Reset pilihan dan muat daftar kartu paslon
  currentlySelectedPaslon = null;
  currentBoothPaslonIndex = null;
  closeBallotCandidateDetail();
  await loadBallotCandidates();

  // 4. Mulai hitung mundur 180 detik
  startBoothTimer();
}

/**
 * Merender identitas pemilih ke elemen DOM top bar bilik suara
 * @param {Object} voter - Data objek pemilih yang sedang aktif
 */
function renderVoterIdentity(voter) {
  const elAvatar = document.getElementById('voterAvatarInitials');
  const elName = document.getElementById('voterFullName');
  const elClass = document.getElementById('voterClassBadge');

  if (voter && voter.nama_lengkap) {
    if (elName) elName.textContent = voter.nama_lengkap;
    if (elClass) elClass.textContent = voter.kelas ? voter.kelas : 'SMAN 1 Pontianak';
    if (elAvatar) {
      // Ambil inisial nama depan
      const initial = voter.nama_lengkap.trim().charAt(0).toUpperCase();
      elAvatar.textContent = initial || 'P';
    }
  }
}

/**
 * Memulai timer hitung mundur 180 detik
 */
function startBoothTimer() {
  stopBoothTimer();
  remainingSeconds = BOOTH_CONFIG.TIMER_DURATION_SECONDS;
  updateTimerDisplay(remainingSeconds);

  const timerBadge = document.getElementById('timerBadge');
  if (timerBadge) {
    timerBadge.classList.remove('danger');
  }

  countdownIntervalInstance = setInterval(function () {
    remainingSeconds--;

    // Update tampilan jam setiap detik
    updateTimerDisplay(remainingSeconds);

    // Animasi bahaya berkedip jika waktu < 30 detik
    if (remainingSeconds <= BOOTH_CONFIG.DANGER_THRESHOLD_SECONDS && timerBadge) {
      timerBadge.classList.add('danger');
    }

    // Jika waktu habis (00:00)
    if (remainingSeconds <= 0) {
      stopBoothTimer();
      handleBoothTimeout();
    }
  }, 1000);
}

/**
 * Menghentikan interval timer bilik suara
 */
function stopBoothTimer() {
  if (countdownIntervalInstance) {
    clearInterval(countdownIntervalInstance);
    countdownIntervalInstance = null;
  }
}

/**
 * Format detik menjadi tampilan teks MM:SS
 * @param {number} totalSeconds - Total detik tersisa
 */
function updateTimerDisplay(totalSeconds) {
  const elClock = document.getElementById('timerClock');
  if (!elClock) return;

  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  const minStr = (minutes < 10 ? '0' : '') + minutes;
  const secStr = (seconds < 10 ? '0' : '') + seconds;

  elClock.textContent = minStr + ':' + secStr;
}

/**
 * Penanganan saat waktu memilih 3 menit habis
 */
function handleBoothTimeout() {
  closeConfirmModal();
  closeBallotCandidateDetail();

  if (window.AuthManager) {
    window.AuthManager.showToast('Waktu memilih Anda telah habis! Sesi dibatalkan demi keamanan.', 'error', 4500);
    window.AuthManager.logoutVoter();
  }

  if (window.App && typeof window.App.switchView === 'function') {
    window.App.switchView(window.App.VIEWS.HOME);
  }
}

/**
 * Merender 3 kartu skeleton shimmer pada bilik suara saat memuat data paslon
 * @param {HTMLElement} container - Kontainer surat suara
 */
function renderBallotSkeletons(container) {
  let skeletonHtml = '';
  for (let i = 0; i < 3; i++) {
    skeletonHtml += '<article class="skeleton-card" aria-hidden="true">';
    skeletonHtml += '  <div class="skeleton-photo skeleton-shimmer">';
    skeletonHtml += '    <div class="skeleton-badge"></div>';
    skeletonHtml += '  </div>';
    skeletonHtml += '  <div class="skeleton-meta">';
    skeletonHtml += '    <div class="skeleton-title skeleton-shimmer"></div>';
    skeletonHtml += '    <div class="skeleton-names skeleton-shimmer"></div>';
    skeletonHtml += '    <div class="skeleton-btn skeleton-shimmer" style="width: 100%; margin-top: 14px;"></div>';
    skeletonHtml += '  </div>';
    skeletonHtml += '</article>';
  }
  container.innerHTML = skeletonHtml;
}

/**
 * Mengambil data paslon dan merender kartu coblos ke dalam grid
 */
async function loadBallotCandidates() {
  const container = document.getElementById('ballotContainer');
  if (!container) return;

  // Tampilkan 3 kartu skeleton shimmer menggantikan teks mentah
  renderBallotSkeletons(container);

  let paslonList = [];
  try {
    if (window.VotingAPI && typeof window.VotingAPI.fetchPaslonList === 'function') {
      paslonList = await window.VotingAPI.fetchPaslonList();
    }
  } catch (err) {
    console.error('[Vote] Gagal mengambil daftar paslon:', err);
  }

  if (!paslonList || paslonList.length === 0) {
    let errorHtml = '';
    errorHtml += '<div style="grid-column: 1/-1; background: rgba(255, 255, 255, 0.18); border: 1.5px solid rgba(255, 255, 255, 0.35); border-radius: 16px; padding: 24px; text-align: center; color: #ffffff;">';
    errorHtml += '  <p style="font-size: 0.95rem; font-weight: 600; margin-bottom: 12px;">Surat suara belum dapat dimuat dari database.</p>';
    errorHtml += '  <button type="button" class="btn-primary" style="display: inline-block; width: auto; padding: 8px 22px; font-size: 0.85rem;" onclick="window.VoteController.initBooth()">Muat Ulang</button>';
    errorHtml += '</div>';
    container.innerHTML = errorHtml;
    return;
  }

  cachedBallotPaslonList = paslonList;

  // Bersihkan container dan bangun kartu surat suara menggunakan DOM aman
  container.innerHTML = '';
  paslonList.forEach(function (paslon, idx) {
    const card = createBallotCardElement(paslon, idx);
    container.appendChild(card);
  });
}

/**
 * Membuat elemen kartu surat suara dengan String Concatenation klasik
 * @param {Object} paslon - Data paslon kandidat
 * @param {number} idx - Indeks paslon (0, 1, 2)
 * @returns {HTMLElement} Elemen kartu surat suara
 */
/**
 * Helper sanitasi string untuk mencegah Stored XSS dari data spreadsheet
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Membuat elemen kartu surat suara dengan sanitasi XSS penuh
 * @param {Object} paslon - Data paslon kandidat
 * @param {number} idx - Indeks paslon (0, 1, 2)
 * @returns {HTMLElement} Elemen kartu surat suara
 */
function createBallotCardElement(paslon, idx) {
  const cardDiv = document.createElement('article');
  // Disematkan class .fade-in-card untuk transisi mulus menggantikan skeleton
  cardDiv.className = 'ballot-card fade-in-card';
  cardDiv.id = 'ballot-card-' + paslon.id_paslon;
  cardDiv.setAttribute('data-id', paslon.id_paslon);

  const nomorFormatted = (paslon.nomor_urut < 10 ? '0' : '') + paslon.nomor_urut;
  const labelPaslon = escapeHtml(paslon.label_paslon || ('PASLON ' + paslon.nomor_urut));
  const namaPaslon = escapeHtml(paslon.nama_paslon || 'Calon Ketua & Wakil Ketua');
  const slogan = escapeHtml(paslon.slogan || '');
  
  // Terapkan trik lh3.googleusercontent.com dan referrerpolicy no-referrer
  const rawFoto = (window.VotingAPI && typeof window.VotingAPI.formatImageUrl === 'function')
    ? window.VotingAPI.formatImageUrl(paslon.foto_url)
    : (paslon.foto_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80');
  const fotoUrl = escapeHtml(rawFoto);

  let cardHtml = '';
  cardHtml += '<div class="ballot-check" id="check-' + paslon.id_paslon + '">&#10003;</div>';
  cardHtml += '<div class="ballot-photo">';
  cardHtml += '  <img src="' + fotoUrl + '" alt="' + labelPaslon + '" referrerpolicy="no-referrer" loading="lazy">';
  cardHtml += '</div>';
  cardHtml += '<div style="width: 100%;">';
  cardHtml += '  <h3 class="card-label">' + nomorFormatted + ' &bull; ' + labelPaslon + '</h3>';
  cardHtml += '  <p class="card-names">' + namaPaslon + '</p>';
  if (slogan) {
    cardHtml += '  <p class="card-slogan">"' + slogan + '"</p>';
  }
  cardHtml += '  <div class="ballot-card-footer">';
  cardHtml += '    <button type="button" class="btn-coblos-submit">';
  cardHtml += '      <span>LIHAT VISI, MISI &amp; PILIH &rarr;</span>';
  cardHtml += '    </button>';
  cardHtml += '  </div>';
  cardHtml += '</div>';

  cardDiv.innerHTML = cardHtml;

  // Klik kartu membuka inline detail visi misi & slogan di dalam bilik suara
  cardDiv.addEventListener('click', function () {
    openBallotCandidateDetail(idx);
  });

  return cardDiv;
}

/**
 * Format teks visi dan misi menjadi HTML terstruktur tersanitasi
 * @param {string} text - Teks mentah visi dan misi
 * @returns {string} Markup HTML terformat rapi
 */
function formatBallotVisiMisiHtml(text) {
  if (!text) return '<p class="ballot-visi-desc">Visi dan misi belum tersedia.</p>';

  let visiPart = '';
  let misiPart = '';

  const visiMatch = text.match(/Visi\s*:\s*([^]+?)(?=\s*Misi\s*:|$)/i);
  const misiMatch = text.match(/Misi\s*:\s*([^]+)$/i);

  if (visiMatch && visiMatch[1]) {
    visiPart = visiMatch[1].trim();
  }
  if (misiMatch && misiMatch[1]) {
    misiPart = misiMatch[1].trim();
  }

  if (!visiPart && !misiPart) {
    return '<div class="ballot-visi-block"><p class="ballot-visi-desc">' + escapeHtml(text).replace(/\n/g, '<br>') + '</p></div>';
  }

  let html = '';
  if (visiPart) {
    html += '<div class="ballot-visi-block">';
    html += '  <h4 class="ballot-block-title"><span class="title-sparkle">&#10022;</span> VISI</h4>';
    html += '  <p class="ballot-visi-desc">"' + escapeHtml(visiPart) + '"</p>';
    html += '</div>';
  }

  if (misiPart) {
    html += '<div class="ballot-misi-block">';
    html += '  <h4 class="ballot-block-title"><span class="title-sparkle">&#10022;</span> MISI</h4>';
    const items = misiPart.split(/(?:;|\n|,\s*(?=[A-Z0-9]))+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    if (items.length > 1) {
      html += '  <ul class="ballot-misi-list">';
      items.forEach(function (item, i) {
        html += '    <li><span class="ballot-misi-num">' + (i + 1) + '.</span> <span class="ballot-misi-desc">' + escapeHtml(item.replace(/\.$/, '')) + '</span></li>';
      });
      html += '  </ul>';
    } else {
      html += '  <p class="ballot-misi-desc">' + escapeHtml(misiPart) + '</p>';
    }
    html += '</div>';
  }

  return html;
}

/**
 * Membuka tampilan eksplorasi inline detail visi, misi & slogan kandidat di bilik suara:
 * Paslon yang diklik akan tetap di kiri secara terfokus lengkap dengan slogannya,
 * panel Visi & Misi muncul di tengah, dan paslon lain bergeser ke dock kanan.
 * @param {number} activeIdx - Indeks kandidat paslon
 */
function openBallotCandidateDetail(activeIdx) {
  if (!cachedBallotPaslonList || cachedBallotPaslonList.length === 0) return;

  currentBoothPaslonIndex = activeIdx;
  const activePaslon = cachedBallotPaslonList[activeIdx];
  if (!activePaslon) return;

  currentlySelectedPaslon = activePaslon;

  const grid = document.getElementById('ballotContainer');
  const detailContainer = document.getElementById('ballotDetailContainer');
  const promptEl = document.getElementById('bilikPrompt');

  if (!grid || !detailContainer) return;

  grid.style.display = 'none';
  detailContainer.style.display = 'flex';

  if (promptEl) {
    promptEl.textContent = 'PELAJARI VISI, MISI &amp; TENTUKAN PILIHAN ANDA';
  }

  const noUrut = (activePaslon.nomor_urut < 10 ? '0' : '') + activePaslon.nomor_urut;
  const label = escapeHtml(activePaslon.label_paslon || ('PASLON ' + activePaslon.nomor_urut));
  const nama = escapeHtml(activePaslon.nama_paslon || 'Calon Ketua & Wakil Ketua');
  const slogan = escapeHtml(activePaslon.slogan || '');
  const rawFoto = (window.VotingAPI && typeof window.VotingAPI.formatImageUrl === 'function')
    ? window.VotingAPI.formatImageUrl(activePaslon.foto_url)
    : (activePaslon.foto_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80');
  const foto = escapeHtml(rawFoto);

  // 1. Kolom Kiri: Kartu Paslon Aktif Terfokus + Tombol Coblos Utama
  let leftHtml = '';
  leftHtml += '<div class="ballot-active-card">';
  leftHtml += '  <div class="photo-frame">';
  leftHtml += '    <span class="badge-no-urut">' + noUrut + '</span>';
  leftHtml += '    <img src="' + foto + '" alt="' + label + '" referrerpolicy="no-referrer">';
  leftHtml += '  </div>';
  leftHtml += '  <div style="width: 100%;">';
  leftHtml += '    <h3 class="card-label">' + label + '</h3>';
  leftHtml += '    <p class="card-names">' + nama + '</p>';
  if (slogan) {
    leftHtml += '    <p class="card-slogan">"' + slogan + '"</p>';
  }
  leftHtml += '    <button type="button" class="ballot-btn-coblos-final" onclick="window.VoteController.proceedToConfirmation(' + activeIdx + ')">';
  leftHtml += '      <span>COBLOS PASLON INI &check;</span>';
  leftHtml += '    </button>';
  leftHtml += '    <button type="button" class="ballot-btn-batal" onclick="window.VoteController.closeBallotCandidateDetail()">';
  leftHtml += '      &larr; Lihat Semua Paslon';
  leftHtml += '    </button>';
  leftHtml += '  </div>';
  leftHtml += '</div>';

  // 2. Kolom Tengah: Panel Visi & Misi Paslon Aktif
  let centerHtml = '';
  centerHtml += '<div class="ballot-visi-panel">';
  centerHtml += '  <div class="ballot-visi-panel-header">';
  centerHtml += '    <div class="ballot-visi-panel-title">';
  centerHtml += '      <span class="title-sparkle">&#10022;</span>';
  centerHtml += '      <span>VISI &amp; MISI ' + label + '</span>';
  centerHtml += '    </div>';
  centerHtml += '    <button type="button" class="ballot-btn-close-detail" onclick="window.VoteController.closeBallotCandidateDetail()">✕ Tutup</button>';
  centerHtml += '  </div>';
  centerHtml += '  <div class="ballot-visi-panel-body">';
  centerHtml += formatBallotVisiMisiHtml(activePaslon.visi_misi);
  centerHtml += '  </div>';
  centerHtml += '  <div class="ballot-visi-panel-footer">';
  centerHtml += '    <button type="button" class="btn-primary" style="width: auto; padding: 8px 24px; font-size: 0.84rem;" onclick="window.VoteController.proceedToConfirmation(' + activeIdx + ')">';
  centerHtml += '      Lanjutkan &amp; Coblos Pilihan &rarr;';
  centerHtml += '    </button>';
  centerHtml += '    <button type="button" class="ballot-btn-close-detail" onclick="window.VoteController.closeBallotCandidateDetail()">⮌ Kembali</button>';
  centerHtml += '  </div>';
  centerHtml += '</div>';

  // 3. Kolom Kanan: Dock Paslon Lainnya yang Bergeser
  let rightHtml = '';
  rightHtml += '<div class="ballot-dock">';
  rightHtml += '  <div class="ballot-dock-header">PASLON LAIN</div>';

  cachedBallotPaslonList.forEach(function (otherPaslon, oIdx) {
    if (oIdx === activeIdx) return;

    const oNoUrut = (otherPaslon.nomor_urut < 10 ? '0' : '') + otherPaslon.nomor_urut;
    const oLabel = escapeHtml(otherPaslon.label_paslon || ('PASLON ' + otherPaslon.nomor_urut));
    const oNama = escapeHtml(otherPaslon.nama_paslon || '');
    const oRawFoto = (window.VotingAPI && typeof window.VotingAPI.formatImageUrl === 'function')
      ? window.VotingAPI.formatImageUrl(otherPaslon.foto_url)
      : (otherPaslon.foto_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80');
    const oFoto = escapeHtml(oRawFoto);

    rightHtml += '<div class="ballot-dock-card" onclick="window.VoteController.openBallotCandidateDetail(' + oIdx + ')" title="Beralih ke ' + oLabel + '">';
    rightHtml += '  <div class="ballot-dock-photo">';
    rightHtml += '    <span class="ballot-dock-badge">' + oNoUrut + '</span>';
    rightHtml += '    <img src="' + oFoto + '" alt="' + oLabel + '" referrerpolicy="no-referrer">';
    rightHtml += '  </div>';
    rightHtml += '  <div class="ballot-dock-label">' + oLabel + '</div>';
    rightHtml += '  <div class="ballot-dock-names">' + oNama + '</div>';
    rightHtml += '  <div class="ballot-dock-action-hint">Beralih &rarr;</div>';
    rightHtml += '</div>';
  });

  rightHtml += '</div>';

  detailContainer.innerHTML = leftHtml + centerHtml + rightHtml;
}

/**
 * Menutup panel inline detail di bilik suara dan kembali ke 3 kartu paslon
 */
function closeBallotCandidateDetail() {
  currentBoothPaslonIndex = null;
  const grid = document.getElementById('ballotContainer');
  const detailContainer = document.getElementById('ballotDetailContainer');
  const promptEl = document.getElementById('bilikPrompt');

  if (grid) grid.style.display = 'grid';
  if (detailContainer) {
    detailContainer.style.display = 'none';
    detailContainer.innerHTML = '';
  }
  if (promptEl) {
    promptEl.textContent = 'TENTUKAN PILIHAN KETUA & WAKIL KETUA OSIS';
  }
}

/**
 * Langkah lanjut setelah voter selesai meninjau visi, misi & slogan:
 * Buka modal konfirmasi dengan data lengkap
 * @param {number} paslonIndex - Indeks paslon yang dipilih
 */
function proceedToConfirmation(paslonIndex) {
  const paslon = cachedBallotPaslonList[paslonIndex] || currentlySelectedPaslon;
  if (!paslon) return;

  currentlySelectedPaslon = paslon;
  openConfirmModal(paslon);
}

/**
 * Membuka modal konfirmasi coblos dengan informasi kaya (Foto, Nama, Slogan, No Urut)
 * @param {Object} paslon - Objek paslon yang dipilih pemilih
 */
function openConfirmModal(paslon) {
  const modal = document.getElementById('modalKonfirmasi');
  const targetLabel = document.getElementById('konfirmasiTargetLabel');
  const targetNama = document.getElementById('konfirmasiTargetNama');
  const targetBadge = document.getElementById('konfirmasiTargetBadge');
  const targetFoto = document.getElementById('konfirmasiTargetFoto');
  const targetSlogan = document.getElementById('konfirmasiTargetSlogan');

  const nomorFormatted = (paslon.nomor_urut < 10 ? '0' : '') + paslon.nomor_urut;
  const labelPaslon = paslon.label_paslon || ('PASLON ' + paslon.nomor_urut);
  const fotoUrl = (window.VotingAPI && typeof window.VotingAPI.formatImageUrl === 'function')
    ? window.VotingAPI.formatImageUrl(paslon.foto_url)
    : (paslon.foto_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80');

  if (targetLabel) targetLabel.textContent = labelPaslon;
  if (targetNama) targetNama.textContent = paslon.nama_paslon || '';
  if (targetBadge) targetBadge.textContent = nomorFormatted;
  if (targetFoto) targetFoto.src = fotoUrl;
  if (targetSlogan) {
    targetSlogan.textContent = paslon.slogan ? ('"' + paslon.slogan + '"') : '';
    targetSlogan.style.display = paslon.slogan ? 'block' : 'none';
  }

  if (modal) {
    modal.classList.add('open');
  }
}

/**
 * Menutup modal pop-up konfirmasi coblos
 */
function closeConfirmModal() {
  const modal = document.getElementById('modalKonfirmasi');
  if (modal) {
    modal.classList.remove('open');
  }
}

/**
 * Mengeksekusi pengiriman suara ke backend REST API
 */
async function submitVoteTransaction() {
  if (isVoteSubmitting) return;

  const voter = window.AuthManager ? window.AuthManager.getCurrentVoter() : null;
  if (!voter || !voter.id_pemilih || !currentlySelectedPaslon) {
    if (window.AuthManager) {
      window.AuthManager.showToast('Data pemilih atau paslon tidak valid.', 'error');
    }
    return;
  }

  const btnConfirm = document.getElementById('btnConfirmSubmit');
  const originalBtnText = btnConfirm ? btnConfirm.textContent : 'YA, SAYA YAKIN';

  // Optimistic UI: Nonaktifkan tombol untuk mencegah multi-klik
  isVoteSubmitting = true;
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Menyimpan Suara...';
  }

  try {
    const result = await window.VotingAPI.submitVoteChoice(
      voter.id_pemilih,
      voter.username,
      currentlySelectedPaslon.id_paslon,
      voter.token_session
    );

    if (result && result.success) {
      // 1. Hentikan timer bilik & tutup modal
      stopBoothTimer();
      closeConfirmModal();
      closeBallotCandidateDetail();

      // 2. Simpan receipt transaksi suara
      const receiptCode = (result.data && result.data.receipt_code) ? result.data.receipt_code : 'VTE-SUCCESS';
      const voteTime = (result.data && result.data.waktu_memilih) ? result.data.waktu_memilih : new Date().toLocaleTimeString('id-ID');
      
      if (window.AuthManager) {
        window.AuthManager.saveVotingReceipt(receiptCode);
      }

      // 3. Tampilkan data bukti di layar selesai
      renderSelesaiReceipt(receiptCode, voteTime);

      // 4. Beralih ke layar terima kasih (view-selesai)
      if (window.App && typeof window.App.switchView === 'function') {
        window.App.switchView(window.App.VIEWS.SELESAI);
      }

      // 5. Jalankan hitung mundur 5 detik auto-reset tablet
      startAutoResetSession();

    } else {
      const errMsg = (result && result.message) ? result.message : 'Gagal mengirimkan suara pilihan.';
      if (window.AuthManager) {
        window.AuthManager.showToast(errMsg, 'error', 4000);
      }
    }
  } catch (error) {
    if (window.AuthManager) {
      window.AuthManager.showToast('Terjadi kesalahan jaringan: ' + error.message, 'error', 4000);
    }
  } finally {
    isVoteSubmitting = false;
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.textContent = originalBtnText;
    }
  }
}

/**
 * Menampilkan nomor receipt transaksi ke layar terima kasih
 * @param {string} receipt - Kode struk transaksi
 * @param {string} timestamp - Waktu pencatatan suara
 */
function renderSelesaiReceipt(receipt, timestamp) {
  const elReceipt = document.getElementById('selesaiReceiptText');
  const elTime = document.getElementById('selesaiTimestampText');

  if (elReceipt) elReceipt.textContent = 'No. Registrasi Suara: ' + receipt;
  if (elTime) elTime.textContent = 'Waktu Rekam: ' + timestamp + ' WIB';
}

/**
 * Menghitung mundur 5 detik dan mereset tablet secara otomatis untuk pemilih berikutnya
 */
function startAutoResetSession() {
  stopAutoResetSession();

  let countdown = BOOTH_CONFIG.AUTO_RESET_SECONDS;
  const elCountdownText = document.getElementById('autoResetCountdownText');
  const elProgressBar = document.getElementById('autoResetBarFill');

  if (elCountdownText) {
    elCountdownText.textContent = countdown + ' detik';
  }

  // Animasi transisi bar progres visual
  if (elProgressBar) {
    elProgressBar.style.transition = 'none';
    elProgressBar.style.width = '100%';
    setTimeout(function () {
      elProgressBar.style.transition = 'width ' + BOOTH_CONFIG.AUTO_RESET_SECONDS + 's linear';
      elProgressBar.style.width = '0%';
    }, 50);
  }

  autoResetTimerInstance = setInterval(function () {
    countdown--;
    if (elCountdownText) {
      elCountdownText.textContent = countdown + ' detik';
    }

    if (countdown <= 0) {
      stopAutoResetSession();
      executeFinalReset();
    }
  }, 1000);
}

/**
 * Menghentikan interval auto-reset
 */
function stopAutoResetSession() {
  if (autoResetTimerInstance) {
    clearInterval(autoResetTimerInstance);
    autoResetTimerInstance = null;
  }
}

/**
 * Eksekusi pembersihan total sesi dan kembali ke beranda siap pakai
 */
function executeFinalReset() {
  // 1. Bersihkan seluruh jejak sesi pemilih di tablet
  if (window.AuthManager) {
    window.AuthManager.logoutVoter();
  }

  // 2. Refresh rekap data Quick Count terbaru di beranda
  if (window.QuickCountVisualizer && typeof window.QuickCountVisualizer.refreshData === 'function') {
    window.QuickCountVisualizer.refreshData();
  }

  // 3. Kembali ke layar utama
  if (window.App && typeof window.App.switchView === 'function') {
    window.App.switchView(window.App.VIEWS.HOME);
    if (typeof window.App.goToSection === 'function') {
      window.App.goToSection(0);
    }
  }
}

// Ekspor modul VoteController ke window global
window.VoteController = {
  initBooth: initBooth,
  openBallotCandidateDetail: openBallotCandidateDetail,
  closeBallotCandidateDetail: closeBallotCandidateDetail,
  proceedToConfirmation: proceedToConfirmation,
  openConfirmModal: openConfirmModal,
  closeConfirmModal: closeConfirmModal,
  submitVoteTransaction: submitVoteTransaction,
  executeFinalReset: executeFinalReset
};
