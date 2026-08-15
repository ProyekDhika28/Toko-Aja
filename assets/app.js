// ============================================================
// APP.JS - logika utama frontend
// ============================================================

let state = {
  barangList: [],
  cart: [], // {nama_barang, jumlah, harga_satuan, is_jasa}
};

let currentUser = null; // {id, nama, email} - null kalau belum login

// Tanggal hari ini versi LOKAL (bukan UTC) - penting karena new Date().toISOString()
// selalu memakai UTC dan bisa salah hari untuk pengguna di Jakarta (UTC+7),
// terutama dini hari.
function todayLocalStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRupiah(n) {
  n = Number(n) || 0;
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = isError ? '#dc2626' : '#1e293b';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

// Skeleton placeholder untuk card/angka yang masih dimuat
function skeletonCardValue() {
  return '<span class="skeleton skeleton-text" style="display:inline-block;"></span>';
}
function spinnerRow(text = 'Memuat...') {
  return `<div class="spinner-row"><span class="spinner spinner-muted"></span>${text}</div>`;
}

// ---------------- TAB NAVIGATION ----------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + tab));
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'riwayat') loadRiwayatDefault();
  if (tab === 'barang') loadBarangList();
  if (tab === 'catat') loadBarangMasterIfNeeded();
  if (tab === 'lihat-pengeluaran') loadPengeluaranDefault();
}

// ---------------- DARK / LIGHT MODE ----------------
const themeToggleBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

function applyThemeIcon() {
  themeIcon.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
}
applyThemeIcon();

themeToggleBtn.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('toko-theme', isDark ? 'dark' : 'light');
  applyThemeIcon();
});

// ---------------- CONFIG CHECK ----------------
function checkConfig() {
  const status = document.getElementById('config-status');
  if (!CONFIG.API_URL || CONFIG.API_URL.includes('GANTI_DENGAN')) {
    status.textContent = '⚠️ API belum dikonfigurasi (lihat config.js)';
    status.classList.add('text-red-500');
    return false;
  }
  return true;
}

// ================= DASHBOARD =================
let dashboardLoadedOnce = false;

async function loadDashboard() {
  if (!checkConfig()) return;
  if (!dashboardLoadedOnce) {
    document.getElementById('dash-bruto').innerHTML = skeletonCardValue();
    document.getElementById('dash-persen').innerHTML = skeletonCardValue();
    document.getElementById('dash-bruto-bulan').innerHTML = skeletonCardValue();
    document.getElementById('dash-netto-container').innerHTML = skeletonCardValue();
    document.getElementById('pembelian-list').innerHTML = spinnerRow('Memuat data...');
    document.getElementById('dash-stok-list').innerHTML = spinnerRow('Memuat data...');
  }
  try {
    const d = await Api.get('getDashboard');
    document.getElementById('dash-bruto').textContent = formatRupiah(d.bruto_hari_ini);
    document.getElementById('dash-bruto-bulan').textContent = formatRupiah(d.bulan_ini.bruto);
    const persenEl = document.getElementById('dash-persen');
    const p = d.persen_perubahan;
    persenEl.textContent = (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
    persenEl.className = 'card-value ' + (p >= 0 ? 'text-emerald-600' : 'text-red-500');

    document.getElementById('dash-bulan-label').textContent = `(${d.bulan_ini.label})`;
    document.getElementById('dash-bulan-bruto').textContent = formatRupiah(d.bulan_ini.bruto);
    document.getElementById('dash-bulan-pengeluaran').textContent = formatRupiah(d.bulan_ini.pengeluaran);

    const nettoContainer = document.getElementById('dash-netto-container');
    if (d.bulan_ini.is_final) {
      const nettoPositif = d.bulan_ini.netto >= 0;
      nettoContainer.innerHTML = `<p class="card-value ${nettoPositif ? 'text-emerald-600' : 'text-red-500'}">${formatRupiah(d.bulan_ini.netto)}</p>`;
    } else {
      nettoContainer.innerHTML = `<p class="text-slate-400 text-sm">🔒 Netto bulan ini akan tersedia pada <span class="font-medium">${d.bulan_ini.tanggal_final}</span> (akhir bulan)</p>`;
    }

    renderPembelianList(d.daftar_pembelian || []);

    const stokList = document.getElementById('dash-stok-list');
    if (!d.stok_menipis.length) {
      stokList.innerHTML = '<p class="text-slate-400">Semua stok aman ✅</p>';
    } else {
      stokList.innerHTML = d.stok_menipis
        .map(b => `<div class="flex justify-between border-b border-slate-100 pb-1"><span>${b.nama_barang}</span><span class="text-red-500 font-medium">Sisa ${b.stok}</span></div>`)
        .join('');
    }
    dashboardLoadedOnce = true;
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderPembelianList(list) {
  const container = document.getElementById('pembelian-list');
  if (!list.length) {
    container.innerHTML = '<p class="text-slate-400">Belum ada barang di daftar pembelian.</p>';
    return;
  }
  container.innerHTML = list
    .map(item => {
      const jumlahLabel = item.jumlah ? `${item.jumlah}x` : '';
      const hargaLabel = item.harga_estimasi ? ` • est. ${formatRupiah(item.harga_estimasi)}` : '';
      return `<div class="flex justify-between items-center border-b border-slate-100 pb-1.5">
        <span>${jumlahLabel} ${item.nama_barang}<span class="text-slate-400 text-xs">${hargaLabel}</span></span>
        <button class="text-red-400 text-xs pembelian-hapus" data-id="${item.id}">Sudah dibeli ✓</button>
      </div>`;
    })
    .join('');
}

document.getElementById('btn-tambah-pembelian').addEventListener('click', async () => {
  if (!checkConfig()) return;
  const nama = document.getElementById('pembelian-nama').value.trim();
  const jumlah = document.getElementById('pembelian-jumlah').value;
  const hargaEstimasi = document.getElementById('pembelian-harga-estimasi').value;

  if (!nama) {
    showToast('Isi nama barang yang perlu dibeli', true);
    return;
  }

  const btn = document.getElementById('btn-tambah-pembelian');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-muted"></span> Menambahkan...';
  try {
    await Api.post('tambahDaftarPembelian', {
      nama_barang: nama,
      jumlah: jumlah || '',
      harga_estimasi: hargaEstimasi || '',
    });
    showToast('Ditambahkan ke daftar pembelian ✅');
    document.getElementById('pembelian-nama').value = '';
    document.getElementById('pembelian-jumlah').value = '';
    document.getElementById('pembelian-harga-estimasi').value = '';
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '+ Tambah ke Daftar Pembelian';
  }
});

document.getElementById('pembelian-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.pembelian-hapus');
  if (!btn) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.style.opacity = '0.5';
  btn.innerHTML = '<span class="spinner spinner-muted"></span>';
  try {
    await Api.post('hapusDaftarPembelian', { id: btn.dataset.id });
    showToast('Barang dihapus dari daftar pembelian ✅');
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
    btn.style.opacity = '';
    btn.textContent = originalText;
  }
});

// ================= RIWAYAT (TAB 2) =================
function loadRiwayatDefault() {
  if (!checkConfig()) return;
  const input = document.getElementById('riwayat-tanggal');
  if (!input.value) {
    input.value = todayLocalStr();
  }
  loadRiwayat();
}

document.getElementById('riwayat-load').addEventListener('click', loadRiwayat);

async function loadRiwayat() {
  const tanggal = document.getElementById('riwayat-tanggal').value;
  if (!tanggal) return;

  const btn = document.getElementById('riwayat-load');
  const tbody = document.getElementById('riwayat-tbody');
  btn.disabled = true;
  const originalBtnText = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';
  tbody.innerHTML = `<tr><td colspan="7">${spinnerRow('Memuat transaksi...')}</td></tr>`;

  try {
    const [data, catatan] = await Promise.all([
      Api.get('getTransaksiByDate', { tanggal }),
      Api.get('getCatatanHarian', { tanggal }),
    ]);
    let bruto = 0, totalCash = 0, totalGopay = 0;

    tbody.innerHTML = data
      .sort((a, b) => (a.jam > b.jam ? 1 : -1))
      .map(t => {
        bruto += Number(t.harga_total);
        totalCash += Number(t.nominal_cash) || 0;
        totalGopay += Number(t.nominal_gopay) || 0;

        let bayarLabel = t.metode_bayar;
        let badgeClass = 'badge-cash';
        if (t.metode_bayar === 'Campur') {
          bayarLabel = `Campur (Cash ${formatRupiah(t.nominal_cash)}, Gopay ${formatRupiah(t.nominal_gopay)})`;
          badgeClass = 'badge-campur';
        } else if (t.metode_bayar === 'Gopay') {
          badgeClass = 'badge-gopay';
        }

        return `<tr class="border-b border-slate-50 row-${badgeClass}">
          <td class="py-2 pr-2">${t.jam}</td>
          <td class="py-2 pr-2">${t.nama_barang}</td>
          <td class="py-2 pr-2">${t.jumlah}</td>
          <td class="py-2 pr-2">${formatRupiah(t.harga_satuan)}</td>
          <td class="py-2 pr-2">${formatRupiah(t.harga_total)}</td>
          <td class="py-2 pr-2"><span class="payment-badge ${badgeClass}">${bayarLabel}</span></td>
          <td class="py-2 pr-2 text-xs text-slate-400">${t.dicatat_oleh || '-'}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="7" class="py-4 text-center text-slate-400">Tidak ada transaksi</td></tr>';

    document.getElementById('riwayat-bruto').textContent = formatRupiah(bruto);
    document.getElementById('riwayat-cash').textContent = formatRupiah(totalCash);
    document.getElementById('riwayat-gopay').textContent = formatRupiah(totalGopay);
    document.getElementById('riwayat-jumlah').textContent = data.length;

    renderCatatanHarian(tanggal, catatan);
    const dhika = catatan ? Number(catatan.uang_makan_dhika) || 0 : 0;
    const nita = catatan ? Number(catatan.uang_makan_nita) || 0 : 0;
    const insentif = catatan ? Number(catatan.insentif) || 0 : 0;
    const nettoHarian = bruto - dhika - nita - insentif;
    const nettoTunaiOnly = nettoHarian - totalGopay;
    document.getElementById('riwayat-netto-harian').textContent = formatRupiah(nettoHarian);
    document.getElementById('riwayat-netto-tunai').textContent = formatRupiah(nettoTunaiOnly);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-red-400">Gagal memuat data</td></tr>';
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}

// ================= CATATAN HARIAN (Uang Makan & Insentif) =================
function renderCatatanHarian(tanggal, catatan) {
  const viewBox = document.getElementById('catatan-harian-view');
  const editBox = document.getElementById('catatan-harian-edit');
  const statusEl = document.getElementById('catatan-harian-status');

  const terkunci = catatan && (catatan.terkunci === true || catatan.terkunci === 'TRUE');

  if (terkunci) {
    document.getElementById('ch-view-dhika').textContent = formatRupiah(catatan.uang_makan_dhika);
    document.getElementById('ch-view-nita').textContent = formatRupiah(catatan.uang_makan_nita);
    document.getElementById('ch-view-insentif').textContent = formatRupiah(catatan.insentif);
    statusEl.textContent = `🔒 Terkunci${catatan.dicatat_oleh ? ' • oleh ' + catatan.dicatat_oleh : ''}`;
    viewBox.classList.remove('hidden');
    editBox.classList.add('hidden');
  } else {
    document.getElementById('ch-dhika').value = catatan ? catatan.uang_makan_dhika || '' : '';
    document.getElementById('ch-nita').value = catatan ? catatan.uang_makan_nita || '' : '';
    document.getElementById('ch-insentif').value = catatan ? catatan.insentif || '' : '';
    statusEl.textContent = catatan ? '🔓 Belum dikunci' : '';
    viewBox.classList.add('hidden');
    editBox.classList.remove('hidden');
  }
}

document.getElementById('btn-simpan-catatan-harian').addEventListener('click', async () => {
  if (!checkConfig()) return;
  const tanggal = document.getElementById('riwayat-tanggal').value;
  if (!tanggal) return;

  const btn = document.getElementById('btn-simpan-catatan-harian');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    await Api.post('simpanCatatanHarian', {
      tanggal,
      uang_makan_dhika: document.getElementById('ch-dhika').value || 0,
      uang_makan_nita: document.getElementById('ch-nita').value || 0,
      insentif: document.getElementById('ch-insentif').value || 0,
      dicatat_oleh: currentUser ? currentUser.nama : '',
    });
    showToast('Catatan harian disimpan & dikunci ✅');
    loadRiwayat(); // refresh semuanya (termasuk kartu netto & status kunci)
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔒 Simpan & Kunci';
  }
});

document.getElementById('btn-unlock-catatan-harian').addEventListener('click', async () => {
  if (!checkConfig()) return;
  const tanggal = document.getElementById('riwayat-tanggal').value;
  if (!tanggal) return;
  if (!confirm('Buka kunci catatan harian ini untuk diedit?')) return;

  const btn = document.getElementById('btn-unlock-catatan-harian');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-muted"></span> Membuka...';
  try {
    await Api.post('unlockCatatanHarian', { tanggal });
    showToast('Catatan harian terbuka, silakan edit lalu simpan lagi');
    loadRiwayat();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔓 Buka Kunci untuk Edit';
  }
});

// ================= CATAT PENJUALAN (TAB 3) =================
// state.barangList dipakai bersama oleh Tab Catat Penjualan & Tab Daftar Harga,
// supaya tidak fetch data yang sama dua kali secara terpisah (lebih cepat).
let barangFetchPromise = null;

async function loadBarangMasterIfNeeded(forceShowLoading = true) {
  if (!checkConfig()) return state.barangList;
  if (state.barangList.length) return state.barangList;
  if (!barangFetchPromise) {
    if (forceShowLoading) {
      searchInput.disabled = true;
      searchInput.placeholder = 'Memuat data barang...';
      document.getElementById('search-spinner').classList.remove('hidden');
    }
    barangFetchPromise = Api.get('getBarang')
      .then(list => {
        state.barangList = list;
        return list;
      })
      .catch(err => {
        showToast(err.message, true);
        return [];
      })
      .finally(() => {
        barangFetchPromise = null;
        searchInput.disabled = false;
        searchInput.placeholder = 'Ketik nama barang...';
        document.getElementById('search-spinner').classList.add('hidden');
        if (document.getElementById('tab-barang') && !document.getElementById('tab-barang').classList.contains('hidden')) {
          renderBarangList();
        }
        // Kalau user sempat ngetik search SAAT data masih proses fetch ulang,
        // otomatis re-filter begitu data selesai dimuat (hindari celah "tidak ditemukan" palsu).
        if (searchInput.value.trim()) {
          searchInput.dispatchEvent(new Event('input'));
        }
      });
  }
  return barangFetchPromise;
}

const searchInput = document.getElementById('search-barang');
const autocompleteBox = document.getElementById('autocomplete-list');
let selectedBarang = null;

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  selectedBarang = null;
  if (!q) {
    autocompleteBox.classList.add('hidden');
    return;
  }
  const matches = state.barangList.filter(b => b.nama_barang.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) {
    autocompleteBox.innerHTML = '<div class="autocomplete-item text-slate-400">Tidak ditemukan. Tambahkan dulu di tab Daftar Harga.</div>';
  } else {
    autocompleteBox.innerHTML = matches
      .map(b => `<div class="autocomplete-item" data-nama="${b.nama_barang}">
        <span>${b.nama_barang}</span><span class="text-slate-400">${formatRupiah(b.harga_jual)}</span>
      </div>`)
      .join('');
  }
  autocompleteBox.classList.remove('hidden');
});

autocompleteBox.addEventListener('click', (e) => {
  const item = e.target.closest('.autocomplete-item');
  if (!item || !item.dataset.nama) return;
  const barang = state.barangList.find(b => b.nama_barang === item.dataset.nama);
  if (!barang) return;
  askJumlahAndAdd(barang);
  searchInput.value = '';
  autocompleteBox.classList.add('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#search-barang') && !e.target.closest('#autocomplete-list')) {
    autocompleteBox.classList.add('hidden');
  }
});

function askJumlahAndAdd(barang) {
  const jumlah = prompt(`Jumlah "${barang.nama_barang}" (harga satuan ${formatRupiah(barang.harga_jual)}):`, '1');
  if (!jumlah || isNaN(jumlah) || Number(jumlah) <= 0) return;
  addToCart({
    nama_barang: barang.nama_barang,
    jumlah: Number(jumlah),
    harga_satuan: Number(barang.harga_jual),
    is_jasa: false,
  });
}

function addToCart(item) {
  state.cart.push(item);
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cart-list');
  if (!state.cart.length) {
    list.innerHTML = '<p class="text-slate-400">Belum ada barang.</p>';
  } else {
    list.innerHTML = state.cart
      .map((it, idx) => `<div class="cart-item">
        <div>
          <p class="font-medium">${it.nama_barang} ${it.is_jasa ? '<span class="text-xs text-indigo-500">(jasa)</span>' : ''}</p>
          <p class="text-xs text-slate-400">${it.jumlah} x ${formatRupiah(it.harga_satuan)}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-semibold">${formatRupiah(it.jumlah * it.harga_satuan)}</span>
          <button data-idx="${idx}" class="cart-remove text-red-400 text-lg leading-none">&times;</button>
        </div>
      </div>`)
      .join('');
  }
  const subtotal = state.cart.reduce((s, it) => s + it.jumlah * it.harga_satuan, 0);
  document.getElementById('cart-subtotal').textContent = formatRupiah(subtotal);
  updateTotalFinal();
}

document.getElementById('cart-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.cart-remove');
  if (!btn) return;
  state.cart.splice(Number(btn.dataset.idx), 1);
  renderCart();
});

function currentSubtotal() {
  return state.cart.reduce((s, it) => s + it.jumlah * it.harga_satuan, 0);
}

document.getElementById('input-diskon').addEventListener('input', updateTotalFinal);
document.getElementById('input-total-final').addEventListener('input', updateKembalian);
document.getElementById('input-uang-diterima').addEventListener('input', updateKembalian);

function updateTotalFinal() {
  const diskon = Number(document.getElementById('input-diskon').value) || 0;
  const subtotal = currentSubtotal();
  const final = subtotal * (1 - diskon / 100);
  document.getElementById('input-total-final').value = Math.round(final);
  updateKembalian();
}

function updateKembalian() {
  const totalFinal = Number(document.getElementById('input-total-final').value) || 0;
  const diterima = Number(document.getElementById('input-uang-diterima').value) || 0;
  const el = document.getElementById('kembalian-value');
  if (!diterima) {
    el.textContent = 'Rp 0';
    el.className = 'font-semibold';
    return;
  }
  const kembalian = diterima - totalFinal;
  if (kembalian < 0) {
    el.textContent = `Kurang ${formatRupiah(Math.abs(kembalian))}`;
    el.className = 'font-semibold text-red-500';
  } else {
    el.textContent = formatRupiah(kembalian);
    el.className = 'font-semibold text-emerald-600';
  }
}

function setMetodePembayaran(metode) {
  document.getElementById('input-metode').value = metode;
  document.querySelectorAll('.metode-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.metode === metode);
  });
  document.getElementById('campur-fields').classList.toggle('hidden', metode !== 'Campur');
  document.getElementById('cash-kembalian-box').classList.toggle('hidden', metode !== 'Cash');
  if (metode === 'Cash') updateKembalian();
}

document.querySelectorAll('.metode-pill').forEach(pill => {
  pill.addEventListener('click', () => setMetodePembayaran(pill.dataset.metode));
});

// ---- Speech to text ----
document.getElementById('btn-mic').addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Speech-to-text tidak didukung browser ini', true);
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'id-ID';
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    searchInput.value = e.results[0][0].transcript;
    searchInput.dispatchEvent(new Event('input'));
  };
  recognition.onerror = () => showToast('Gagal menangkap suara', true);
  recognition.start();
});

// ---- Item Jasa ----
document.getElementById('btn-jasa').addEventListener('click', () => {
  document.getElementById('modal-jasa').classList.remove('hidden');
});
document.getElementById('jasa-cancel').addEventListener('click', () => {
  document.getElementById('modal-jasa').classList.add('hidden');
});
document.getElementById('jasa-add').addEventListener('click', () => {
  const nama = document.getElementById('jasa-nama').value.trim();
  const jumlah = Number(document.getElementById('jasa-jumlah').value) || 1;
  const harga = Number(document.getElementById('jasa-harga').value) || 0;
  if (!nama || harga <= 0) {
    showToast('Isi nama dan harga jasa dengan benar', true);
    return;
  }
  addToCart({ nama_barang: nama, jumlah, harga_satuan: harga, is_jasa: true });
  document.getElementById('jasa-nama').value = '';
  document.getElementById('jasa-jumlah').value = 1;
  document.getElementById('jasa-harga').value = '';
  document.getElementById('modal-jasa').classList.add('hidden');
});

// ---- Simpan transaksi ----
document.getElementById('btn-simpan-transaksi').addEventListener('click', async () => {
  if (!checkConfig()) return;
  if (!state.cart.length) {
    showToast('Keranjang masih kosong', true);
    return;
  }
  const metode = document.getElementById('input-metode').value;
  const totalFinal = Number(document.getElementById('input-total-final').value) || currentSubtotal();
  const diskon = Number(document.getElementById('input-diskon').value) || 0;
  const cash = Number(document.getElementById('input-cash').value) || 0;
  const gopay = Number(document.getElementById('input-gopay').value) || 0;

  if (metode === 'Campur' && cash + gopay !== totalFinal) {
    if (!confirm(`Total cash + gopay (${formatRupiah(cash + gopay)}) tidak sama dengan total akhir (${formatRupiah(totalFinal)}). Tetap simpan?`)) {
      return;
    }
  }

  const btn = document.getElementById('btn-simpan-transaksi');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    const result = await Api.post('tambahTransaksi', {
      items: JSON.stringify(state.cart),
      metode_bayar: metode,
      nominal_cash: cash,
      nominal_gopay: gopay,
      diskon_persen: diskon,
      total_override: totalFinal,
      dicatat_oleh: currentUser ? currentUser.nama : '',
    });
    const infoTanggal = result.tanggal_tercatat && result.tanggal_tercatat !== todayLocalStr()
      ? ` (tercatat sbg tanggal ${result.tanggal_tercatat}, krn lewat jam 22:00)`
      : '';
    showToast('Transaksi tersimpan ✅' + infoTanggal);
    state.cart = [];
    renderCart();
    document.getElementById('input-diskon').value = '';
    document.getElementById('input-total-final').value = '';
    document.getElementById('input-cash').value = '';
    document.getElementById('input-gopay').value = '';
    document.getElementById('input-uang-diterima').value = '';
    setMetodePembayaran('Cash'); // selalu kembali ke Cash sebagai default tiap transaksi baru
    updateKembalian();
    state.barangList = [];
    loadBarangMasterIfNeeded(false); // langsung fetch ulang di background, jangan tunggu user pindah tab

    // Refresh otomatis supaya data baru langsung terlihat tanpa perlu reload manual
    loadDashboard();
    const riwayatTanggal = document.getElementById('riwayat-tanggal').value;
    if (riwayatTanggal === result.tanggal_tercatat) loadRiwayat();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 Simpan Transaksi';
  }
});

// ================= CATAT PENGELUARAN =================
document.getElementById('btn-simpan-pengeluaran').addEventListener('click', async () => {
  if (!checkConfig()) return;
  const jenis = document.getElementById('pengeluaran-jenis').value.trim();
  const nominal = Number(document.getElementById('pengeluaran-nominal').value) || 0;
  const catatan = document.getElementById('pengeluaran-catatan').value.trim();

  if (!jenis) {
    showToast('Isi jenis pengeluaran', true);
    return;
  }
  if (nominal <= 0) {
    showToast('Nominal pengeluaran harus lebih dari 0', true);
    return;
  }

  const btn = document.getElementById('btn-simpan-pengeluaran');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    const result = await Api.post('tambahPengeluaran', {
      jenis_pengeluaran: jenis,
      nominal,
      catatan,
      dicatat_oleh: currentUser ? currentUser.nama : '',
    });
    const infoTanggal = result.tanggal_tercatat && result.tanggal_tercatat !== todayLocalStr()
      ? ` (tercatat sbg tanggal ${result.tanggal_tercatat}, krn lewat jam 22:00)`
      : '';
    showToast('Pengeluaran tersimpan ✅' + infoTanggal);
    document.getElementById('pengeluaran-jenis').value = '';
    document.getElementById('pengeluaran-nominal').value = '';
    document.getElementById('pengeluaran-catatan').value = '';
    loadDashboard(); // netto bulanan ikut ter-update kalkulasinya
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 Simpan Pengeluaran';
  }
});

// ================= LIHAT PENGELUARAN =================
function loadPengeluaranDefault() {
  if (!checkConfig()) return;
  const input = document.getElementById('pengeluaran-bulan-input');
  if (!input.value) {
    const d = new Date();
    input.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  loadPengeluaran();
}

document.getElementById('pengeluaran-load').addEventListener('click', loadPengeluaran);

async function loadPengeluaran() {
  const bulanInput = document.getElementById('pengeluaran-bulan-input').value; // format YYYY-MM
  if (!bulanInput) return;
  const [tahun, bulan] = bulanInput.split('-');

  const btn = document.getElementById('pengeluaran-load');
  const tbody = document.getElementById('pengeluaran-tbody');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';
  tbody.innerHTML = `<tr><td colspan="7">${spinnerRow('Memuat pengeluaran...')}</td></tr>`;

  try {
    const data = await Api.get('getPengeluaranByMonth', { tahun, bulan: Number(bulan) });
    let total = 0;
    tbody.innerHTML = data
      .sort((a, b) => (a.tanggal + a.jam < b.tanggal + b.jam ? 1 : -1))
      .map(x => {
        total += Number(x.nominal);
        return `<tr class="border-b border-slate-50">
          <td class="py-2 pr-2">${x.tanggal}</td>
          <td class="py-2 pr-2">${x.jam}</td>
          <td class="py-2 pr-2">${x.jenis_pengeluaran}</td>
          <td class="py-2 pr-2">${formatRupiah(x.nominal)}</td>
          <td class="py-2 pr-2 text-xs text-slate-400">${x.catatan || '-'}</td>
          <td class="py-2 pr-2 text-xs text-slate-400">${x.dicatat_oleh || '-'}</td>
          <td class="py-2 pr-2"><button class="text-red-400 text-xs pengeluaran-hapus" data-id="${x.id}">Hapus</button></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="7" class="py-4 text-center text-slate-400">Tidak ada pengeluaran</td></tr>';

    document.getElementById('pengeluaran-total').textContent = formatRupiah(total);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-red-400">Gagal memuat data</td></tr>';
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById('pengeluaran-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.pengeluaran-hapus');
  if (!btn) return;
  if (!confirm('Hapus catatan pengeluaran ini?')) return;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.style.opacity = '0.5';
  btn.innerHTML = '<span class="spinner spinner-muted"></span>';

  try {
    await Api.post('hapusPengeluaran', { id: btn.dataset.id });
    showToast('Pengeluaran dihapus ✅');
    loadPengeluaran();
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
    btn.style.opacity = '';
    btn.textContent = originalText;
  }
});

// ================= DAFTAR HARGA (TAB 4) =================
async function loadBarangList() {
  if (!checkConfig()) return;
  if (!state.barangList.length && !barangFetchPromise) {
    document.getElementById('barang-list').innerHTML =
      '<div class="card"><div class="skeleton skeleton-text mb-2"></div><div class="skeleton skeleton-line"></div></div>'.repeat(3);
  }
  await loadBarangMasterIfNeeded(false);
  renderBarangList();
}

document.getElementById('barang-search').addEventListener('input', renderBarangList);
document.getElementById('barang-sort').addEventListener('change', renderBarangList);

function renderBarangList() {
  const q = document.getElementById('barang-search').value.trim().toLowerCase();
  const sort = document.getElementById('barang-sort').value;
  let list = state.barangList.filter(b => b.nama_barang.toLowerCase().includes(q));

  const sorters = {
    tanggal_desc: (a, b) => (a.tanggal_ditambahkan < b.tanggal_ditambahkan ? 1 : -1),
    tanggal_asc: (a, b) => (a.tanggal_ditambahkan > b.tanggal_ditambahkan ? 1 : -1),
    harga_asc: (a, b) => a.harga_jual - b.harga_jual,
    harga_desc: (a, b) => b.harga_jual - a.harga_jual,
    nama_asc: (a, b) => a.nama_barang.localeCompare(b.nama_barang),
  };
  list = list.sort(sorters[sort]);

  const container = document.getElementById('barang-list');
  if (!list.length) {
    container.innerHTML = '<p class="text-slate-400 text-center py-6">Belum ada barang.</p>';
    return;
  }
  container.innerHTML = list
    .map(b => {
      const infoPack = b.harga_pack
        ? `<p class="text-xs text-slate-400 mt-2">📦 Pack ${formatRupiah(b.harga_pack)}${b.isi_per_pack ? ` (isi ${b.isi_per_pack} pcs)` : ''}</p>`
        : '';
      const stokMenipis = Number(b.stok) <= Number(b.stok_minimum);
      const margin = Number(b.harga_jual) - Number(b.harga_modal);
      return `<div class="card barang-card">
      <div class="flex justify-between items-start mb-3">
        <p class="font-semibold text-base">${b.nama_barang}</p>
        <div class="flex gap-2 shrink-0">
          <button class="btn-secondary text-xs px-2 py-1 barang-edit" data-id="${b.id}">Edit</button>
          <button class="text-red-400 text-xs barang-hapus" data-id="${b.id}">Hapus</button>
        </div>
      </div>
      <div class="barang-stat-grid">
        <div class="barang-stat">
          <p class="barang-stat-label">Harga Modal</p>
          <p class="barang-stat-value">${formatRupiah(b.harga_modal)}</p>
        </div>
        <div class="barang-stat barang-stat-jual">
          <p class="barang-stat-label">Harga Jual</p>
          <p class="barang-stat-value text-emerald-600">${formatRupiah(b.harga_jual)}</p>
          <p class="barang-stat-sub">Untung ${formatRupiah(margin)}</p>
        </div>
        <div class="barang-stat ${stokMenipis ? 'barang-stat-danger' : ''}">
          <p class="barang-stat-label">Stok Sisa</p>
          <p class="barang-stat-value ${stokMenipis ? 'text-red-500' : ''}">${b.stok}${stokMenipis ? ' ⚠️' : ''}</p>
          <p class="barang-stat-sub">Min. ${b.stok_minimum}</p>
        </div>
      </div>
      ${infoPack}
      <p class="text-xs text-slate-300 mt-2">Ditambahkan: ${b.tanggal_ditambahkan}</p>
    </div>`;
    })
    .join('');
}

document.getElementById('barang-list').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('.barang-edit');
  const hapusBtn = e.target.closest('.barang-hapus');
  if (editBtn) openBarangModal(state.barangList.find(b => b.id === editBtn.dataset.id));
  if (hapusBtn) {
    if (!confirm('Hapus barang ini? Histori transaksi lama tetap aman.')) return;

    const originalText = hapusBtn.textContent;
    hapusBtn.disabled = true;
    hapusBtn.style.opacity = '0.5';
    hapusBtn.innerHTML = '<span class="spinner spinner-muted"></span>';
    // Matikan tombol Edit di baris yang sama juga, supaya tidak diklik saat proses hapus berjalan
    const editBtnSameRow = hapusBtn.closest('.card')?.querySelector('.barang-edit');
    if (editBtnSameRow) editBtnSameRow.disabled = true;

    try {
      await Api.post('hapusBarang', { id: hapusBtn.dataset.id });
      showToast('Barang dihapus ✅');
      state.barangList = []; // WAJIB dikosongkan, supaya loadBarangList fetch ulang dari server
                              // (bukan pakai cache lama yang masih berisi barang yang baru dihapus)
      loadBarangList();
    } catch (err) {
      showToast(err.message, true);
      hapusBtn.disabled = false;
      hapusBtn.style.opacity = '';
      hapusBtn.textContent = originalText;
      if (editBtnSameRow) editBtnSameRow.disabled = false;
    }
  }
});

document.getElementById('btn-tambah-barang').addEventListener('click', () => openBarangModal(null));
document.getElementById('mb-cancel').addEventListener('click', () => document.getElementById('modal-barang').classList.add('hidden'));

function openBarangModal(barang) {
  document.getElementById('modal-barang-title').textContent = barang ? 'Edit Barang' : 'Tambah Barang';
  document.getElementById('mb-id').value = barang ? barang.id : '';
  document.getElementById('mb-nama').value = barang ? barang.nama_barang : '';
  document.getElementById('mb-modal').value = barang ? barang.harga_modal : '';
  document.getElementById('mb-jual').value = barang ? barang.harga_jual : '';
  document.getElementById('mb-pack').value = barang ? barang.harga_pack : '';
  document.getElementById('mb-isi-pack').value = barang ? barang.isi_per_pack : '';
  document.getElementById('mb-stok').value = barang ? barang.stok : 0;
  document.getElementById('mb-stok-min').value = barang ? barang.stok_minimum : 5;
  document.getElementById('modal-barang').classList.remove('hidden');
}

document.getElementById('mb-save').addEventListener('click', async () => {
  const id = document.getElementById('mb-id').value;
  const payload = {
    nama_barang: document.getElementById('mb-nama').value.trim(),
    harga_modal: Number(document.getElementById('mb-modal').value) || 0,
    harga_jual: Number(document.getElementById('mb-jual').value) || 0,
    harga_pack: document.getElementById('mb-pack').value || '',
    isi_per_pack: document.getElementById('mb-isi-pack').value || '',
    stok: Number(document.getElementById('mb-stok').value) || 0,
    stok_minimum: Number(document.getElementById('mb-stok-min').value) || 5,
  };
  if (!payload.nama_barang) {
    showToast('Nama barang wajib diisi', true);
    return;
  }
  const saveBtn = document.getElementById('mb-save');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    if (id) {
      await Api.post('editBarang', { id, ...payload });
      showToast('Barang diperbarui ✅');
    } else {
      await Api.post('tambahBarang', payload);
      showToast('Barang ditambahkan ✅');
    }
    document.getElementById('modal-barang').classList.add('hidden');
    state.barangList = [];
    loadBarangList();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'Simpan';
  }
});

// ---------------- INIT ----------------
function initApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('current-user-name').textContent = currentUser.nama;
  checkConfig();
  loadDashboard();
  // Prefetch data barang di background sejak awal (bukan menunggu user buka tab
  // Catat Penjualan / Daftar Harga), supaya saat pindah tab terasa instan.
  loadBarangMasterIfNeeded(false);
}

// ================= AUTH (LOGIN / SIGNUP) =================
// Sesi login disimpan di sessionStorage (bukan localStorage) supaya SETIAP KALI
// tab/browser ditutup dan dibuka lagi, user wajib login ulang - sesuai permintaan.
// Selama tab masih terbuka & belum logout, sesi tetap aktif walau pindah-pindah tab app.
const SESSION_KEY = 'toko-user-session';

function getStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearStoredSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearAuthError() {
  document.getElementById('auth-error').classList.add('hidden');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function goToAuthStep(step) {
  document.getElementById('auth-step-email').classList.toggle('hidden', step !== 'email');
  document.getElementById('auth-step-signin').classList.toggle('hidden', step !== 'signin');
  document.getElementById('auth-step-signup').classList.toggle('hidden', step !== 'signup');
  clearAuthError();
}

// --- Step 1: cek email ---
document.getElementById('auth-btn-lanjut').addEventListener('click', handleCekEmail);
document.getElementById('auth-email').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleCekEmail();
});

async function handleCekEmail() {
  if (!checkConfig()) return;
  clearAuthError();
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  if (!isValidEmail(email)) {
    showAuthError('Masukkan email yang valid');
    return;
  }
  const btn = document.getElementById('auth-btn-lanjut');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memeriksa...';
  try {
    const result = await Api.post('checkEmail', { email });
    if (result.exists) {
      document.getElementById('auth-signin-email').textContent = email;
      goToAuthStep('signin');
      document.getElementById('auth-signin-password').value = '';
      document.getElementById('auth-signin-password').focus();
    } else {
      document.getElementById('auth-signup-email').textContent = email;
      goToAuthStep('signup');
      document.getElementById('auth-signup-nama').value = '';
      document.getElementById('auth-signup-password').value = '';
      document.getElementById('auth-signup-nama').focus();
    }
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Lanjut';
  }
}

document.getElementById('auth-back-1').addEventListener('click', () => goToAuthStep('email'));
document.getElementById('auth-back-2').addEventListener('click', () => goToAuthStep('email'));

// --- Step 2a: SIGN IN ---
document.getElementById('auth-btn-signin').addEventListener('click', handleSignIn);
document.getElementById('auth-signin-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSignIn();
});

async function handleSignIn() {
  clearAuthError();
  const email = document.getElementById('auth-signin-email').textContent;
  const password = document.getElementById('auth-signin-password').value;
  if (!password) {
    showAuthError('Masukkan password');
    return;
  }
  const btn = document.getElementById('auth-btn-signin');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Masuk...';
  try {
    const user = await Api.post('login', { email, password });
    currentUser = user;
    setStoredSession(user);
    initApp();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

// --- Step 2b: SIGN UP ---
document.getElementById('auth-btn-signup').addEventListener('click', handleSignUp);
document.getElementById('auth-signup-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSignUp();
});

async function handleSignUp() {
  clearAuthError();
  const email = document.getElementById('auth-signup-email').textContent;
  const nama = document.getElementById('auth-signup-nama').value.trim();
  const password = document.getElementById('auth-signup-password').value;
  if (!nama) {
    showAuthError('Masukkan nama kamu');
    return;
  }
  if (password.length < 4) {
    showAuthError('Password minimal 4 karakter');
    return;
  }
  const btn = document.getElementById('auth-btn-signup');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Mendaftarkan...';
  try {
    const user = await Api.post('signup', { email, nama, password });
    currentUser = user;
    setStoredSession(user);
    initApp();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Daftar & Masuk';
  }
}

// --- Logout ---
document.getElementById('btn-logout').addEventListener('click', () => {
  clearStoredSession();
  currentUser = null;
  location.reload();
});

// --- Cek sesi yang masih aktif (tab belum ditutup) saat halaman pertama dibuka ---
(function restoreSessionOrShowLogin() {
  const saved = getStoredSession();
  if (saved) {
    currentUser = saved;
    initApp();
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('auth-email').focus();
  }
})();
