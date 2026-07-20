import { useEffect, useState } from "react";

/**
 * Issue #66 — attach an emoji, GIF, or direct image URL when composing or
 * editing a retro card. Two tabs:
 *  - Emoji: a self-written grid (project stays library-free on UI, see
 *    issue #22) — click inserts at the caller's cursor position.
 *  - GIF / Image: search-as-you-type against the backend's GIPHY proxy
 *    (`GET /api/retro-boards/gif-search`, keeps the API key server-side),
 *    plus a plain URL field for pasting a direct image link. Both just set
 *    the card's `image_url` — never uploads binary data, matching the
 *    project's in-memory/no-storage philosophy (see CLAUDE.md).
 *
 * Shared by `RetroColumn`'s add-card composer and `RetroCardItem`'s edit
 * form — both just wire up `onPickEmoji`/`onPickImage` differently.
 */

const CARD_EMOJIS = [
  "😀", "😂", "😅", "😍", "🤔", "😐", "😢", "😡", "😮", "🥳",
  "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️", "👀", "🤷",
  "❤️", "🔥", "✨", "🎉", "💡", "⚡", "⭐", "✅", "❌", "⚠️",
  "🐛", "🚀", "🧪", "🛠️", "📈", "📉", "🕐", "📅", "💬", "📌",
  "☕", "🍕", "🎯", "🧩", "🔗", "📎", "🗑️", "🙈",
];

interface GifResult {
  id: string;
  preview_url: string;
  url: string;
  title: string;
}

interface Props {
  onPickEmoji: (emoji: string) => void;
  onPickImage: (url: string) => void;
}

export function RetroCardAttachmentPicker({ onPickEmoji, onPickImage }: Props) {
  const [tab, setTab] = useState<"emoji" | "image">("emoji");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");

  // Search-as-you-type, debounced; fires immediately (with a blank query,
  // returning trending GIFs) the first time the tab opens.
  useEffect(() => {
    if (tab !== "image") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = window.setTimeout(() => {
      const apiBase = import.meta.env.VITE_API_URL || "";
      fetch(`${apiBase}/api/retro-boards/gif-search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => {
          if (!r.ok) throw new Error("search failed");
          return r.json();
        })
        .then((data) => { if (!cancelled) setResults(data.results ?? []); })
        .catch(() => { if (!cancelled) setError("GIF search is unavailable"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [tab, query]);

  function submitUrl() {
    const trimmed = urlDraft.trim();
    if (!/^https?:\/\//i.test(trimmed)) return;
    onPickImage(trimmed);
    setUrlDraft("");
  }

  return (
    <div
      data-testid="retro-card-attachment-picker"
      className="w-72 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-2.5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 mb-2">
        <button
          data-testid="retro-attachment-tab-emoji"
          onClick={() => setTab("emoji")}
          className={`flex-1 text-xs font-medium py-1 rounded-lg transition-colors ${
            tab === "emoji" ? "bg-accent text-accent-fg" : "text-slate-400 hover:bg-[var(--c-panel2)]"
          }`}
        >
          Emoji
        </button>
        <button
          data-testid="retro-attachment-tab-image"
          onClick={() => setTab("image")}
          className={`flex-1 text-xs font-medium py-1 rounded-lg transition-colors ${
            tab === "image" ? "bg-accent text-accent-fg" : "text-slate-400 hover:bg-[var(--c-panel2)]"
          }`}
        >
          GIF / Image
        </button>
      </div>

      {tab === "emoji" ? (
        <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
          {CARD_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              data-testid="retro-attachment-emoji-button"
              data-emoji-value={emoji}
              onClick={() => onPickEmoji(emoji)}
              className="text-lg leading-none p-1 rounded hover:bg-[var(--c-panel2)] hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            data-testid="retro-attachment-gif-search"
            placeholder="Search GIFs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent"
          />
          {loading && <p className="text-xs text-slate-500">Searching…</p>}
          {error && <p data-testid="retro-attachment-gif-error" className="text-xs text-red-400">{error}</p>}
          {!loading && !error && results.length > 0 && (
            <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto">
              {results.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  data-testid="retro-attachment-gif-result"
                  onClick={() => onPickImage(gif.url)}
                  title={gif.title}
                  className="rounded overflow-hidden hover:ring-2 hover:ring-accent"
                >
                  <img src={gif.preview_url} alt={gif.title} className="w-full h-14 object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="pt-1.5 border-t border-[var(--c-border)]">
            <label className="text-[10px] text-slate-500 block mb-1">Or paste an image URL</label>
            <div className="flex gap-1">
              <input
                data-testid="retro-attachment-url-input"
                placeholder="https://…"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitUrl(); } }}
                className="flex-1 min-w-0 bg-[var(--c-bg)] border border-[var(--c-border-hi)] rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                data-testid="retro-attachment-url-submit"
                onClick={submitUrl}
                className="text-xs bg-accent hover:bg-accent-hover text-accent-fg px-2 rounded-lg font-medium shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
