const token = document.getElementById('token');
const grades = document.getElementById('grades');
const saved = document.getElementById('saved');
const status = document.getElementById('status');

chrome.storage.sync.get({ token: '', grades: false }).then((s) => {
  token.value = s.token;
  grades.checked = s.grades;
});

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ token: token.value.trim(), grades: grades.checked });
  saved.textContent = 'Saved.';
  setTimeout(() => (saved.textContent = ''), 2000);
});

chrome.runtime.sendMessage({ type: 'status' }, (last) => {
  if (!last) {
    status.textContent = 'Nothing sent yet. Open a Gradescope course page to start.';
    return;
  }
  const when = new Date(last.at).toLocaleString();
  status.textContent = `${last.ok ? '✓' : '✗'} ${when}: ${last.message}`;
});
