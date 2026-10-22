# Runway browser extension

Reads the Gradescope course pages and Canvas assignment pages you're signed into, and sends the deadlines, whether you've submitted, and (only if you switch it on) released scores to your Runway runway. Nothing else on the page is read; no password or cookie leaves the browser.

**Install (Chrome, unpacked, until it's in the store):** `chrome://extensions` → Developer mode → Load unpacked → this folder. Then open the extension, paste the token from Runway → Settings → Extension, and open a Gradescope course page.

**Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json`.

Tests: `npm run test:ext` (parsers against saved page fixtures).

**Store:** `npm run ext:zip` packs `extension/dist/runway-extension-<version>.zip`; the listing text, permission justifications and privacy answers are in [STORE.md](./STORE.md).
