/**
 * ============================================================================
 * E-VOTING OSIS SMAN 1 PONTIANAK - QUICK COUNT VISUALIZER ENGINE
 * File: js/quickcount.js
 * Developer: ZianBOT by zianxy
 * Deskripsi: Render Donut Chart SVG 4 Warna (P1, P2, P3, Belum Memilih),
 *            Kalkulasi busur lingkaran anonim, & sinkronisasi data DPT.
 * ============================================================================
 */

// Konstanta dimensi dan geometri SVG Donut Chart
const DONUT_CONFIG = {
  VIEW_SIZE: 190,           // Dimensi viewBox (190 x 190)
  CENTER_COORD: 95,         // Koordinat titik tengah (cx, cy)
  RADIUS: 70,               // Radius lingkaran donut
  STROKE_WIDTH: 32,         // Ketebalan segmen donat
  POLL_INTERVAL_MS: 20000   // Interval polling data (20 detik)
};

// Keliling lingkaran: C = 2 * PI * R (2 * 3.14159265 * 70 ≈ 439.82)
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_CONFIG.RADIUS;

// State internal visualizer
let isQuickCountLoading = false;
let pollingIntervalInstance = null;
let lastQuickCountData = null;

/**
 * Inisialisasi awal modul Quick Count
 */
function initQuickCount() {
  refreshData();
  startAutoPolling();
}

/**
 * Mengambil data Quick Count terbaru dari VotingAPI dan merender antarmuka
 */
async function refreshData() {
  if (isQuickCountLoading) return;
  isQuickCountLoading = true;

  try {
    let result = null;
    if (window.VotingAPI && typeof window.VotingAPI.fetchQuickCountData === 'function') {
      result = await window.VotingAPI.fetchQuickCountData();
    }

    if (result && Array.isArray(result.segments)) {
      lastQuickCountData = result;
      renderDonutChart(result);
      renderLegend(result);
      updateSummaryMetrics(result);
    } else {
      console.warn('[QuickCount] Format data respon tidak dikenali.');
    }
  } catch (error) {
    console.error('[QuickCount] Gagal memperbarui data:', error);
  } finally {
    isQuickCountLoading = false;
  }
}

/**
 * Merender segmen Donut Chart SVG 4 Warna dengan kalkulasi dasharray presisi
 * @param {Object} data - Objek rekap data quick count dari API
 */
function renderDonutChart(data) {
  const svgElement = document.getElementById('donutSvgChart');
  const percentLabel = document.getElementById('donutCenterPercent');
  const subtitleLabel = document.getElementById('donutCenterSubtitle');

  if (!svgElement) return;

  const segments = data.segments || [];
  let accumulatedOffset = 0;
  let svgContent = '';

  // Bangun elemen circle SVG untuk setiap segmen warna
  segments.forEach(function (segment, index) {
    const percentage = Math.max(0, parseFloat(segment.persentase) || 0);
    const strokeDash = (percentage / 100) * DONUT_CIRCUMFERENCE;
    const currentOffset = -accumulatedOffset;

    // Tentukan label: Paslon 1-3 menjadi "Anonim", sedangkan abu-abu tetap "Belum Memilih"
    const isBelumMemilih = (segment.key === 'belum_memilih' || segment.color === '#94a3b8');
    const displayLabel = isBelumMemilih ? 'Belum Memilih' : 'Anonim';

    let segmentHtml = '';
    segmentHtml += '<circle ';
    segmentHtml += '  class="donut-segment" ';
    segmentHtml += '  id="donut-segment-' + index + '" ';
    segmentHtml += '  cx="' + DONUT_CONFIG.CENTER_COORD + '" ';
    segmentHtml += '  cy="' + DONUT_CONFIG.CENTER_COORD + '" ';
    segmentHtml += '  r="' + DONUT_CONFIG.RADIUS + '" ';
    segmentHtml += '  stroke="' + segment.color + '" ';
    segmentHtml += '  stroke-dasharray="' + strokeDash.toFixed(2) + ' ' + DONUT_CIRCUMFERENCE.toFixed(2) + '" ';
    segmentHtml += '  stroke-dashoffset="' + currentOffset.toFixed(2) + '" ';
    segmentHtml += '  data-label="' + displayLabel + '" ';
    segmentHtml += '  data-percent="' + percentage.toFixed(1) + '%" ';
    segmentHtml += '  data-is-belum="' + (isBelumMemilih ? 'true' : 'false') + '" ';
    segmentHtml += '  role="button" ';
    segmentHtml += '  tabindex="0" ';
    segmentHtml += '  aria-label="' + displayLabel + ': ' + percentage.toFixed(1) + '%" ';
    segmentHtml += '/>';

    svgContent += segmentHtml;
    accumulatedOffset += strokeDash;
  });

  svgElement.innerHTML = svgContent;

  // Pasang listener interaksi kursor & sentuhan
  attachDonutSegmentListeners(segments);

  // Tampilkan persentase suara masuk di lingkaran tengah sebagai default
  if (percentLabel) {
    percentLabel.textContent = (data.persentase_partisipasi || 0) + '%';
  }
  if (subtitleLabel) {
    subtitleLabel.textContent = 'Suara Masuk';
    subtitleLabel.style.color = 'rgba(255, 255, 255, 0.9)';
  }
}

let activeDonutSegmentIndex = -1;

/**
 * Memasang event interaktif hover dan sentuhan (touch/click) pada segmen diagram donat:
 * - Warna Paslon (Biru, Hijau, Kuning) -> Keterangan: "Anonim"
 * - Warna Abu-Abu -> Keterangan: "Belum Memilih"
 * - Default saat dilepas -> "Suara Masuk"
 * @param {Array} segments - Array data segmen
 */
function attachDonutSegmentListeners(segments) {
  const percentLabel = document.getElementById('donutCenterPercent');
  const subtitleLabel = document.getElementById('donutCenterSubtitle');
  const svgElement = document.getElementById('donutSvgChart');

  function showSegmentDetails(seg, index) {
    activeDonutSegmentIndex = index;
    const isBelumMemilih = (seg.key === 'belum_memilih' || seg.color === '#94a3b8');
    const labelText = isBelumMemilih ? 'Belum Memilih' : 'Anonim';

    if (percentLabel) {
      percentLabel.textContent = (seg.persentase || 0) + '%';
    }
    if (subtitleLabel) {
      subtitleLabel.textContent = labelText;
      subtitleLabel.style.color = isBelumMemilih ? '#cbd5e1' : seg.color;
    }

    // Sorot segmen aktif dan redupkan segmen lainnya
    segments.forEach(function (_, i) {
      const circleEl = document.getElementById('donut-segment-' + i);
      if (circleEl) {
        if (i === index) {
          circleEl.classList.add('active-segment');
          circleEl.style.opacity = '1';
        } else {
          circleEl.classList.remove('active-segment');
          circleEl.style.opacity = '0.55';
        }
      }
    });
  }

  function resetToDefault() {
    activeDonutSegmentIndex = -1;
    if (lastQuickCountData) {
      if (percentLabel) {
        percentLabel.textContent = (lastQuickCountData.persentase_partisipasi || 0) + '%';
      }
      if (subtitleLabel) {
        subtitleLabel.textContent = 'Suara Masuk';
        subtitleLabel.style.color = 'rgba(255, 255, 255, 0.9)';
      }
    }
    segments.forEach(function (_, i) {
      const circleEl = document.getElementById('donut-segment-' + i);
      if (circleEl) {
        circleEl.classList.remove('active-segment');
        circleEl.style.opacity = '1';
      }
    });
  }

  segments.forEach(function (seg, index) {
    const circle = document.getElementById('donut-segment-' + index);
    if (!circle) return;

    // Hover Desktop
    circle.addEventListener('mouseenter', function () {
      showSegmentDetails(seg, index);
    });

    circle.addEventListener('mouseleave', function () {
      resetToDefault();
    });

    // Touch / Click (Tablet, HP, Desktop Click)
    circle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (activeDonutSegmentIndex === index) {
        resetToDefault();
      } else {
        showSegmentDetails(seg, index);
      }
    });

    circle.addEventListener('touchstart', function (e) {
      e.stopPropagation();
      if (activeDonutSegmentIndex === index) {
        resetToDefault();
      } else {
        showSegmentDetails(seg, index);
      }
    }, { passive: true });
  });

  // Tap di luar diagram mengembalikan ke tampilan Suara Masuk
  if (svgElement) {
    document.addEventListener('click', function (e) {
      if (!svgElement.contains(e.target) && activeDonutSegmentIndex !== -1) {
        resetToDefault();
      }
    });
  }
}

/**
 * Legenda luar ditiadakan sesuai preferensi tampilan diagram pie murni anonim
 * @param {Object} data - Objek rekap data quick count
 */
function renderLegend(data) {
  const container = document.getElementById('qcLegendGrid');
  if (container) {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

/**
 * Memperbarui teks total DPT, suara terhitung, dan waktu rekam
 * @param {Object} data - Data quick count
 */
function updateSummaryMetrics(data) {
  const elSuaraMasuk = document.getElementById('metricSuaraMasuk');
  const elTotalDpt = document.getElementById('metricTotalDpt');
  const elTimestamp = document.getElementById('qcLastUpdated');

  if (elSuaraMasuk) {
    elSuaraMasuk.textContent = String(data.total_suara_masuk || 0);
  }
  if (elTotalDpt) {
    elTotalDpt.textContent = String(data.total_dpt || 0);
  }
  if (elTimestamp && data.updated_at) {
    elTimestamp.textContent = 'Pembaruan: ' + data.updated_at + ' WIB';
  }
}

/**
 * Memberikan efek visual sorotan pada kartu legenda tertentu
 * @param {string} segmentKey - Key unik segmen
 */
function highlightLegendItem(segmentKey) {
  resetLegendHighlights();
  const target = document.getElementById('legend-' + segmentKey);
  if (target) {
    target.style.borderColor = '#ffffff';
    target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    target.style.transform = 'scale(1.03)';
    target.style.transition = 'all 0.2s ease';
  }
}

/**
 * Menghilangkan efek sorotan dari semua kartu legenda
 */
function resetLegendHighlights() {
  const allItems = document.querySelectorAll('.qc-legend-item');
  allItems.forEach(function (item) {
    item.style.borderColor = 'rgba(255, 255, 255, 0.22)';
    item.style.backgroundColor = 'rgba(0, 20, 50, 0.16)';
    item.style.transform = 'none';
  });
}

/**
 * Memulai interval polling data berkala
 */
function startAutoPolling() {
  stopAutoPolling();
  pollingIntervalInstance = setInterval(function () {
    // Hanya lakukan refresh jika halaman beranda sedang tampak
    const homeView = document.getElementById('view-home');
    const isHomeVisible = homeView && homeView.classList.contains('active');
    if (isHomeVisible) {
      refreshData();
    }
  }, DONUT_CONFIG.POLL_INTERVAL_MS);
}

/**
 * Menghentikan interval polling
 */
function stopAutoPolling() {
  if (pollingIntervalInstance) {
    clearInterval(pollingIntervalInstance);
    pollingIntervalInstance = null;
  }
}

// Inisialisasi otomatis saat dokumen DOM siap
document.addEventListener('DOMContentLoaded', function () {
  initQuickCount();
});

// Ekspor modul QuickCountVisualizer ke window global
window.QuickCountVisualizer = {
  initQuickCount: initQuickCount,
  refreshData: refreshData,
  startAutoPolling: startAutoPolling,
  stopAutoPolling: stopAutoPolling
};
