// ============================================================
// API WRAPPER - komunikasi dengan Google Apps Script Web App
// ============================================================
// Semua request POST dikirim sebagai text/plain (bukan application/json)
// untuk menghindari CORS preflight yang tidak didukung baik oleh
// Google Apps Script Web App.
//
// PENTING soal keandalan: Google Apps Script kadang butuh waktu lama untuk
// merespons (cold start, beban sheet yang besar, dll). Kalau responsnya lambat
// atau gagal di-generate sempurna oleh Google, browser bisa menerima halaman
// HTML/error alih-alih JSON - ini yang menyebabkan pesan seperti
// "Unexpected token '<' ... JSON". Wrapper ini menangani itu dengan pesan yang
// jelas, dan memberi timeout supaya permintaan tidak menggantung tanpa akhir.

const API_TIMEOUT_MS = 30000; // 30 detik

async function parseApiResponse(res) {
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // Respons bukan JSON valid - kemungkinan besar Google mengembalikan halaman
    // error/HTML karena server sedang lambat/timeout, BUKAN berarti data gagal
    // tersimpan. Untuk aksi SIMPAN, data seringkali tetap masuk walau respons
    // ini gagal dibaca - jadi selalu cek dulu di halaman terkait sebelum
    // mengulang simpan, supaya tidak dobel.
    throw new Error(
      'Google Sheets sedang lambat merespons (server sibuk/timeout), bukan berarti data gagal tersimpan. ' +
      'Silakan cek dulu di halaman terkait sebelum mencoba lagi, supaya tidak dobel input.'
    );
  }
  if (!json.success) throw new Error(json.error || 'Terjadi kesalahan');
  return json.data;
}

function withTimeout(fetchPromise, controller) {
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  return fetchPromise.finally(() => clearTimeout(timeoutId));
}

const Api = {
  async get(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const controller = new AbortController();
    let res;
    try {
      res = await withTimeout(fetch(url.toString(), { signal: controller.signal }), controller);
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('Permintaan terlalu lama (timeout). Coba lagi dalam beberapa saat.');
      }
      throw new Error('Gagal terhubung ke server. Cek koneksi internet Anda.');
    }
    return parseApiResponse(res);
  },

  async post(action, body = {}) {
    const controller = new AbortController();
    let res;
    try {
      res = await withTimeout(
        fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, ...body }),
          signal: controller.signal,
        }),
        controller
      );
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error(
          'Permintaan terlalu lama (timeout) - datanya BISA JADI tetap tersimpan di server meski respons ini gagal diterima. ' +
          'Cek dulu di halaman terkait sebelum mencoba simpan ulang, supaya tidak dobel.'
        );
      }
      throw new Error('Gagal terhubung ke server. Cek koneksi internet Anda.');
    }
    return parseApiResponse(res);
  },

  // Fire-and-forget: dipakai utk aksi non-kritis yang tidak perlu ditunggu user
  // dan kalaupun gagal, tidak boleh memunculkan error ke UI (mis. refresh sheet
  // laporan harian di background setelah transaksi berhasil disimpan).
  postSilent(action, body = {}) {
    fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }),
    }).catch(() => {
      // sengaja diabaikan - ini proses latar belakang non-kritis
    });
  },
};
