// Runs on Gradescope and Canvas pages you're signed into. Reads the assignments on the page and
// hands them to the background script, which sends them to Runway. On the Gradescope dashboard it
// reads the current term's course pages (the same pages you could click into) so one visit sends
// every course. Nothing else is read, and nothing is sent until your Runway token is in the popup.
(async () => {
  const { parsePage, parseGradescopeDashboard } = await import(chrome.runtime.getURL('parsers.js'));
  const u = new URL(location.href);
  const isDashboard = u.hostname === 'www.gradescope.com' && /^\/(account|)\/?$/.test(u.pathname);
  let rows = isDashboard ? [] : parsePage(document, location.href);
  if (isDashboard) {
    const courses = parseGradescopeDashboard(document)
      .filter((c) => c.current)
      .slice(0, 12);
    for (const c of courses) {
      try {
        const res = await fetch(new URL(c.path, location.origin), { credentials: 'same-origin' });
        if (!res.ok) continue;
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        for (const r of parsePage(doc, new URL(c.path, location.origin).toString()))
          rows.push({ ...r, course: r.course || c.course, course_name: c.name });
      } catch {
        // one course page failing shouldn't stop the others
      }
    }
  }
  if (!rows.length) return;
  chrome.runtime.sendMessage({ type: 'items', url: location.href, rows });
})();
