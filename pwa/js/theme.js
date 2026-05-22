// Three-state theme toggle: auto → light → dark → auto
const THEME_CYCLE = ['auto', 'light', 'dark'];
const THEME_ICONS = { auto: '🌓', light: '☀️', dark: '🌙' };

export function initTheme() {
  applyTheme();

  // Live-respond to system changes when in auto mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = localStorage.getItem('theme') || 'auto';
    if (current === 'auto') {
      // No data-theme attribute → CSS handles via media query → just trigger meta update
      updateMetaThemeColor();
    }
  });

  // Wire toggle button
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = localStorage.getItem('theme') || 'auto';
      const nextIdx = (THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length;
      const next = THEME_CYCLE[nextIdx];
      localStorage.setItem('theme', next);
      applyTheme();
    });
  }
}

function applyTheme() {
  const saved = localStorage.getItem('theme') || 'auto';
  const root = document.documentElement;

  if (saved === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', saved);
  }

  // Update button icon
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = THEME_ICONS[saved];

  updateMetaThemeColor();
}

function updateMetaThemeColor() {
  // Update <meta name="theme-color"> so mobile browser chrome matches
  const isLight = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#fafaf7';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = isLight ? '#fafaf7' : '#0a0a0a';
}
