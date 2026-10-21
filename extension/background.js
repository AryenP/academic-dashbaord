// Sends what the content script read to Runway's import-items function, with your token. Scores
// go only when the "send my grades" switch in the popup is on. Keeps the last result for the popup.

const DEFAULT_ENDPOINT = 'https://uhqurcspebdxtkalbduc.supabase.co/functions/v1/import-items';

async function settings() {
  const s = await chrome.storage.sync.get({ token: '', grades: false, endpoint: DEFAULT_ENDPOINT });
  return s;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'items') {
    send(msg.rows, msg.url).then(reply);
    return true;
  }
  if (msg?.type === 'status') {
    chrome.storage.local.get({ last: null }).then((r) => reply(r.last));
    return true;
  }
  return false;
});

async function send(rows, url) {
  const { token, grades, endpoint } = await settings();
  const last = { at: new Date().toISOString(), url, rows: rows.length, ok: false, message: '' };
  if (!token) {
    last.message = 'No Runway token yet. Open the extension and paste one from Settings → Extension.';
    await chrome.storage.local.set({ last });
    return last;
  }
  const items = rows.map((r) => (grades ? r : { ...r, score: null, max_score: null }));
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway-token': token },
      body: JSON.stringify({ items, page: url }),
    });
    const body = await res.json().catch(() => ({}));
    last.ok = res.ok && body.ok !== false;
    last.message = last.ok
      ? `Sent ${items.length} items: ${body.created ?? 0} new, ${body.updated ?? 0} updated.`
      : body.message || `Runway answered ${res.status}.`;
  } catch (e) {
    last.message = `Could not reach Runway: ${e.message}`;
  }
  await chrome.storage.local.set({ last });
  return last;
}
