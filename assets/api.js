// ============================================================
// API WRAPPER - komunikasi dengan Google Apps Script Web App
// ============================================================
// Semua request POST dikirim sebagai text/plain (bukan application/json)
// untuk menghindari CORS preflight yang tidak didukung baik oleh
// Google Apps Script Web App.

const Api = {
  async get(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Terjadi kesalahan');
    return json.data;
  },

  async post(action, body = {}) {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Terjadi kesalahan');
    return json.data;
  },
};
