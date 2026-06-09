/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Issue #42 — accent colours map to CSS variables defined in index.css.
      // Changing data-accent on <html> swaps the whole palette without re-rendering.
      //
      // Usage:
      //   bg-accent           → primary brand surface
      //   bg-accent-hover     → hover variant
      //   bg-accent-soft      → ~10–15% translucent fill (outline buttons, pills)
      //   bg-accent-soft-hi   → ~25–40% translucent (borders, focus rings)
      //   text-accent         → accent as text on a neutral bg
      //   text-accent-fg      → text on top of an accent bg (auto-flips for yellow)
      //   border-accent       → primary border
      colors: {
        accent: {
          DEFAULT: "var(--c-accent)",
          hover: "var(--c-accent-hover)",
          text: "var(--c-accent-text)",
          soft: "var(--c-accent-soft)",
          "soft-hi": "var(--c-accent-soft-hi)",
          fg: "var(--c-accent-fg)",
        },
      },
    },
  },
  plugins: [],
};
