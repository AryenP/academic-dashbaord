// Runs on Gradescope and Canvas pages you're signed into. Reads the assignments on the page and
// hands them to the background script, which sends them to Runway. Nothing else on the page is
// read, and nothing is sent until you've put your Runway token in the popup.
(async () => {
  const { parsePage } = await import(chrome.runtime.getURL('parsers.js'));
  const rows = parsePage(document, location.href);
  if (!rows.length) return;
  chrome.runtime.sendMessage({ type: 'items', url: location.href, rows });
})();
