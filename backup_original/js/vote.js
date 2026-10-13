/**
 * ============================================================================
 * E-VOTING OSIS SMAN 1 PONTIANAK - VOTING CONTROLLER & BOOTH ENGINE
 * File: js/vote.js
 * Developer: ZianBOT by zianxy
 * Deskripsi: Timer hitung mundur 180 detik bilik suara, interaksi surat suara,
 *            modal konfirmasi pilihan, transaksi suara anti-dobel, & auto-reset 5s.
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

  // Bersihkan container dan bangun kartu surat suara menggunakan DOM aman
  container.innerHTML = '';
  paslonList.forEach(function (paslon) {
    const card = createBallotCardElement(paslon);
    container.appendChild(card);
  });
}

/**
 * Membuat elemen kartu surat suara dengan String Concatenation klasik (Aman dari Nested Backticks)
 * @param {Object} paslon - Data paslon kandidat
 * @returns {HTMLElement} Elemen kartu surat suara
 */
function createBallotCardElement(paslon) {
  const cardDiv = document.createElement('article');
  // Disematkan class .fade-in-card untuk transisi mulus menggantikan skeleton
  cardDiv.className = 'ballot-card fade-in-card';
  cardDiv.id = 'ballot-card-' + paslon.id_paslon;
  cardDiv.setAttribute('data-id', paslon.id_paslon);

  const nomorFormatted = (paslon.nomor_urut < 10 ? '0' : '') + paslon.nomor_urut;
  const labelPaslon = paslon.label_paslon || ('PASLON ' + paslon.nomor_urut);
  const namaPaslon = paslon.nama_paslon || 'Calon Ketua & Wakil Ketua';
  
  // Terapkan trik lh3.googleusercontent.com dan referrerpolicy no-referrer
  const fotoUrl = (window.VotingAPI && typeof window.VotingAPI.formatImageUrl === 'function')
    ? window.VotingAPI.formatImageUrl(paslon.foto_url)
    : (paslon.foto_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80');

  let cardHtml = '';
  cardHtml += '<div class="ballot-check" id="check-' + paslon.id_paslon + '">&#10003;</div>';
  cardHtml += '<div class="ballot-photo">';
  cardHtml += '  <img src="' + fotoUrl + '" alt="' + labelPaslon + '" referrerpolicy="no-referrer" loading="lazy">';
  cardHtml += '</div>';
  cardHtml += '<h3 class="card-label">' + nomorFormatted + ' &bull; ' + labelPaslon + '</h3>';
  cardHtml += '<p class="card-names">' + namaPaslon + '</p>';
  cardHtml += '<button type="button" class="btn-coblos-submit">PILIH PASLON INI</button>';

  cardDiv.innerHTML = cardHtml;

  // Pasang event listener klik pada kartu
  cardDiv.addEventListener('click', function () {
    selectCandidateBallot(paslon);
  });

  return cardDiv;
}

/**
 * Menandai kartu paslon yang dipilih dan memunculkan modal konfirmasi
 * @param {Object} paslon - Objek paslon yang dipilih
 */
function selectCandidateBallot(paslon) {
  currentlySelectedPaslon = paslon;

  // Update styling visual kartu yang sedang aktif
  const allCards = document.querySelectorAll('.ballot-card');
  allCards.forEach(function (card) {
    card.classList.remove('selected');
  });

  const activeCard = document.getElementById('ballot-card-' + paslon.id_paslon);
  if (activeCard) {
    activeCard.classList.add('selected');
  }

  // Buka modal konfirmasi keputusan
  openConfirmModal(paslon);
}

/**
 * Membuka modal konfirmasi coblos
 * @param {Object} paslon - Objek paslon yang dipilih pemilih
 */
function openConfirmModal(paslon) {
  const modal = document.getElementById('modalKonfirmasi');
  const targetLabel = document.getElementById('konfirmasiTargetLabel');
  const targetNama = document.getElementById('konfirmasiTargetNama');

  if (targetLabel) {
    targetLabel.textContent = paslon.label_paslon || ('PASLON ' + paslon.nomor_urut);
  }
  if (targetNama) {
    targetNama.textContent = paslon.nama_paslon || '';
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
      // 1. Hentikan timer bilik
      stopBoothTimer();
      closeConfirmModal();

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
  closeConfirmModal: closeConfirmModal,
  submitVoteTransaction: submitVoteTransaction,
  executeFinalReset: executeFinalReset
};
