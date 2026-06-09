import { REACTION_EMOJI_LOTTIE } from "./ReactionsPanel";

/**
 * Issue #43 — module-level cache + preloader for the reaction Lottie JSON
 * assets. Lives outside `ReactionFloater` so `ReactionsPanel` can warm the
 * cache on mount (i.e. the moment a room opens) and the first reaction
 * click renders without any network wait.
 *
 * `cache` is intentionally module-scope so it survives unmount/remount of
 * individual floaters AND survives switching rooms within the same SPA
 * session. The browser's HTTP cache backs us up across full reloads.
 */

// `unknown` here, not `object`, because lottie-react's animationData prop is
// typed `any` upstream and we don't want to assert a structural shape we
// don't actually need. Map is used over Record so TypeScript's narrowing
// gives us a clean `undefined` on miss without `noUncheckedIndexedAccess`
// gymnastics.
const cache = new Map<string, unknown>();

// Tracks in-flight fetches so two preloads (or a preload + an opportunistic
// fetch from a floater) don't double-download the same URL.
const inflight = new Map<string, Promise<unknown>>();

export function getCachedLottie(url: string): unknown | undefined {
  return cache.get(url);
}

/**
 * Fetch + parse a single Lottie JSON, store it in the cache.
 *
 * - If already cached, resolves with the cached value immediately.
 * - If a fetch for the same URL is already in flight, joins it.
 * - On failure, rejects — caller decides how to recover. (The floater's
 *   fallback live-fetch covers the offline / preload-failed case.)
 */
export function preloadLottie(url: string): Promise<unknown> {
  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;

  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Lottie preload ${url} → ${r.status}`);
      return r.json();
    })
    .then((json) => {
      cache.set(url, json);
      inflight.delete(url);
      return json;
    })
    .catch((err) => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, p);
  return p;
}

/**
 * Fire-and-forget: kick off fetches for every URL in `REACTION_EMOJI_LOTTIE`.
 * Errors are swallowed individually so one failed asset doesn't poison the
 * Promise.all — the floater fallback covers it. Returns a Promise that
 * resolves after all preloads settle, useful for tests.
 */
export function preloadAllReactionLottie(): Promise<unknown[]> {
  return Promise.all(
    Object.values(REACTION_EMOJI_LOTTIE).map((url) =>
      preloadLottie(url).catch(() => null),
    ),
  );
}

/**
 * Test-only helper to wipe the cache between specs that need a cold start.
 * Not exported from the components barrel because it should never be called
 * in production code.
 */
export function __resetLottieCacheForTest(): void {
  cache.clear();
  inflight.clear();
}
