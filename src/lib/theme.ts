export type Theme = 'dark' | 'light';
const KEY = 'abcc-theme';

// A per-viewer preference only. No bridge data is ever written to storage.
export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable: theme still applies for this page load */
  }
}
