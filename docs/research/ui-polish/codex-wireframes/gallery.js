// Runtime is limited to appearance and navigation among already-rendered frames.
(() => {
  const root = document.documentElement;
  const query = new URLSearchParams(location.search);
  const system = matchMedia('(prefers-color-scheme: dark)');
  const allowed = ['system', 'light', 'dark'];
  let saved;
  try { saved = localStorage.getItem('ak187.appearance'); } catch { /* Use the system this visit. */ }
  let choice = query.get('theme') || saved || 'system';
  if (!allowed.includes(choice)) choice = 'system';
  const apply = () => {
    root.dataset.theme = choice === 'system' ? system.matches ? 'dark' : 'light' : choice;
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
    });
  };
  apply(); // Before content paint; switching never replaces frame markup or loses field text.
  system.addEventListener('change', () => { if (choice === 'system') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    const theme = document.getElementById('theme');
    const width = document.getElementById('width');
    const both = document.getElementById('both');
    const changeTheme = value => {
      choice = value;
      theme.value = value;
      try { localStorage.setItem('ak187.appearance', value); } catch { /* Current visit remains usable. */ }
      apply();
    };
    theme.value = choice;
    theme.addEventListener('change', () => changeTheme(theme.value));
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => changeTheme(button.dataset.themeChoice)));
    const setWidth = value => {
      if (!['1440', '1024', '390', '320'].includes(value)) value = '1440';
      document.body.dataset.width = value;
      width.value = value;
    };
    setWidth(query.get('width') || '1440');
    width.addEventListener('change', () => setWidth(width.value));
    both.addEventListener('change', () => document.body.classList.toggle('show-both', both.checked));
    const shot = query.get('shot');
    if (shot && document.getElementById(shot)?.classList.contains('chapter')) {
      document.body.classList.add('shot');
      document.querySelectorAll('.chapter').forEach(chapter => { chapter.hidden = chapter.id !== shot; });
      document.querySelectorAll('.compare-width').forEach(frame => { frame.hidden = true; });
      if (shot === 'shell') document.getElementById('shell-states').hidden = true;
    }
    apply();
  });
})();
