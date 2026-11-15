/**
 * Recovering from a release that lands while the game is open or cached.
 *
 * Every build renames its script chunks (content hashes). A browser, or a CDN edge, that still holds the previous
 * index.html asks for chunks of that build; if they are gone, the dynamic import fails and whatever it would have
 * loaded (the NASA base, the forest, a zone) is simply missing. The publish keeps the previous build's chunks
 * (.github/workflows/pages-interstellar.yml); if a chunk fails anyway, the page reloads once from a fresh URL, which
 * no cache holds, so it gets the current build.
 */
const KEY = 'interstellar.reloadedForBuild';

/** a failed dynamic import / module script (the wording differs per browser) */
export function isChunkLoadError(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch|Unable to preload|module script/i.test(m);
}

/** reload once from a cache-busting URL; false when it already did so a moment ago (no reload loops) */
export function reloadForNewBuild(reason: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  console.warn(`[recovery] ${reason}: reloading to fetch the current build`);
  const u = new URL(location.href);
  u.searchParams.set('fresh', Date.now().toString(36));
  location.replace(u.toString());
  return true;
}

export function installChunkRecovery() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewBuild('a script chunk failed to load')) e.preventDefault();
  });
}
