import { Link } from "react-router-dom";
import { MarketingShell } from "../components/MarketingShell";

const POKER_STEPS: { icon: string; title: string; body: string }[] = [
  { icon: "🚀", title: "Create a room", body: "Pick a deck, name your session, no account needed." },
  { icon: "🔗", title: "Share the link", body: "Send the room URL to your team — they join by picking a nickname." },
  { icon: "🃏", title: "Vote in secret", body: "Everyone picks a card; values stay hidden until reveal." },
  { icon: "📊", title: "Reveal & discuss", body: "See everyone's estimate plus average, median, and consensus at a glance." },
];

const POKER_FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: "🎴", title: "4 voting decks", body: "Fibonacci, Powers of 2, Sequential 1–10, and T-shirt sizes." },
  { icon: "⚡", title: "Real-time", body: "WebSocket-powered — every vote, reveal, and reaction shows up instantly for the whole room." },
  { icon: "⚙️", title: "Room settings", body: "Control who can reveal cards and who can manage the issue backlog." },
  { icon: "✏️", title: "Drawing & reactions", body: "Sketch on screen or throw an emoji at a teammate's card — the fun stuff, opt-in." },
  { icon: "📋", title: "Issue backlog", body: "Queue up tickets, vote one at a time, and auto-record the final estimate." },
  { icon: "🎨", title: "Themes", body: "Light, dark, or system, plus 7 accent colors — all tuned for contrast." },
];

const RETRO_STEPS: { icon: string; title: string; body: string }[] = [
  { icon: "🚀", title: "Create a board", body: "Pick a template — Mad/Sad/Glad, Start/Stop/Continue, or 4Ls — no account needed." },
  { icon: "🔗", title: "Share the link", body: "Send the board URL to your team — they join by picking a nickname." },
  { icon: "📝", title: "Add cards live", body: "Everyone writes what's on their mind — cards show up instantly, no reveal step." },
  { icon: "🗳️", title: "Vote & discuss", body: "Spend a shared vote budget on what matters most, then time-box the conversation." },
];

const RETRO_FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: "🎯", title: "3 templates", body: "Mad/Sad/Glad, Start/Stop/Continue, or 4Ls — pick what fits your team's rhythm." },
  { icon: "🗳️", title: "Vote budget", body: "Everyone gets a shared number of votes to spend across all cards, not per card." },
  { icon: "🔗", title: "Drag-to-merge cards", body: "Group similar feedback into one card with a confirm step, plus a one-click undo." },
  { icon: "😄", title: "Card reactions", body: "Quick emoji reactions on any card, visible to everyone in real time." },
  { icon: "⏱️", title: "Timer with an alert", body: "Time-box the discussion — a pulsing \"Time's up!\" badge fires the moment it hits zero." },
  { icon: "🙈", title: "Anonymous mode", body: "Hide who wrote each card when you want the most candid feedback." },
  { icon: "✏️", title: "Drawing tool", body: "Sketch on screen live with your team — same tool as Planning Poker." },
  { icon: "⚙️", title: "Settings & profile", body: "Rename the board, tweak the vote budget, and set your own theme and accent color." },
];

export default function LandingPage() {
  return (
    <MarketingShell title="Planning Poker & Retro Board — free real-time tools for agile teams">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-14 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
          Real-time tools for agile teams
        </h1>
        <p className="mt-4 text-lg text-slate-300 max-w-2xl mx-auto">
          Estimate sprint work with Planning Poker, then reflect on it with Retro Board — both
          free, no sign-up, no install. Create a session, share the link, and your team is in
          within seconds.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/new"
            data-testid="landing-cta"
            className="inline-block bg-accent hover:bg-accent-hover text-accent-fg font-semibold text-lg px-8 py-3.5 rounded-xl transition-colors"
          >
            Create a room
          </Link>
          <Link
            to="/retro/new"
            data-testid="landing-retro-cta"
            className="inline-block bg-[var(--c-panel)] border border-[var(--c-border)] hover:bg-[var(--c-panel2)] text-white font-semibold text-lg px-8 py-3.5 rounded-xl transition-colors"
          >
            Start a retro board
          </Link>
        </div>
      </section>

      {/* Two-tool quick nav — jumps straight to each product's section below,
          so both get equal top-of-page billing instead of one being a
          scroll-to-the-bottom afterthought. */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="#planning-poker"
            data-testid="landing-poker-nav-card"
            className="group bg-[var(--c-panel)] border border-[var(--c-border)] hover:border-accent rounded-2xl p-6 transition-colors text-left"
          >
            <div className="text-3xl mb-2">🃏</div>
            <div className="font-bold text-white mb-1 group-hover:text-accent transition-colors">Planning Poker</div>
            <p className="text-sm text-slate-400">Estimate stories together — vote in secret, reveal all at once.</p>
          </a>
          <a
            href="#retro-board"
            data-testid="landing-retro-nav-card"
            className="group bg-[var(--c-panel)] border border-[var(--c-border)] hover:border-accent rounded-2xl p-6 transition-colors text-left"
          >
            <div className="text-3xl mb-2">📝</div>
            <div className="font-bold text-white mb-1 group-hover:text-accent transition-colors">Retro Board</div>
            <p className="text-sm text-slate-400">Run retrospectives live — collect cards, vote, and time-box the discussion.</p>
          </a>
        </div>
      </section>

      {/* ───────────────────────── Planning Poker ───────────────────────── */}
      <section id="planning-poker" className="max-w-5xl mx-auto px-4 sm:px-6 pb-6 scroll-mt-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-accent tracking-wide uppercase mb-3">
            <span className="text-base">🃏</span> Planning Poker
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Estimate sprints without the guesswork</h2>
        </div>
      </section>

      {/* Screenshot — swap on the app's own light/dark class (see useTheme),
          not `prefers-color-scheme`: the app's theme is a user choice stored
          in localStorage (light/dark/system) and only defaults to the OS
          preference under "system", so the two can disagree. */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        <div className="rounded-2xl overflow-hidden border border-[var(--c-border)] shadow-2xl">
          <img
            src="/landing/room-dark.png"
            alt="A Planning Poker room mid-round: players around the table, votes hidden until reveal"
            className="w-full h-auto block landing-shot-dark"
            loading="lazy"
          />
          <img
            src="/landing/room-light.png"
            alt="A Planning Poker room mid-round: players around the table, votes hidden until reveal"
            className="w-full h-auto hidden landing-shot-light"
            loading="lazy"
          />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <h3 className="text-xl font-bold text-white text-center mb-10">How it works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {POKER_STEPS.map((step, i) => (
            <div key={step.title} className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-5">
              <div className="text-3xl mb-3">{step.icon}</div>
              <div className="text-xs text-accent font-semibold mb-1">STEP {i + 1}</div>
              <h4 className="font-semibold text-white mb-1">{step.title}</h4>
              <p className="text-sm text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <h3 className="text-xl font-bold text-white text-center mb-10">Features</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {POKER_FEATURES.map((f) => (
            <div key={f.title} className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-5">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h4 className="font-semibold text-white mb-1">{f.title}</h4>
              <p className="text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link
            to="/new"
            className="inline-block bg-accent hover:bg-accent-hover text-accent-fg font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Create a room
          </Link>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="border-t border-[var(--c-border)]" />
      </div>

      {/* ───────────────────────── Retro Board ───────────────────────── */}
      <section id="retro-board" className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-6 scroll-mt-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-accent tracking-wide uppercase mb-3">
            <span className="text-base">📝</span> Retro Board
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Run retrospectives your team actually looks forward to
          </h2>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        <div className="rounded-2xl overflow-hidden border border-[var(--c-border)] shadow-2xl">
          <img
            src="/landing/retro-dark.png"
            alt="A Retro Board mid-session: Mad/Sad/Glad columns with cards, votes, and a merged card stack"
            className="w-full h-auto block landing-shot-dark"
            loading="lazy"
          />
          <img
            src="/landing/retro-light.png"
            alt="A Retro Board mid-session: Mad/Sad/Glad columns with cards, votes, and a merged card stack"
            className="w-full h-auto hidden landing-shot-light"
            loading="lazy"
          />
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <h3 className="text-xl font-bold text-white text-center mb-10">How it works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {RETRO_STEPS.map((step, i) => (
            <div key={step.title} className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-5">
              <div className="text-3xl mb-3">{step.icon}</div>
              <div className="text-xs text-accent font-semibold mb-1">STEP {i + 1}</div>
              <h4 className="font-semibold text-white mb-1">{step.title}</h4>
              <p className="text-sm text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <h3 className="text-xl font-bold text-white text-center mb-10">Features</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {RETRO_FEATURES.map((f) => (
            <div key={f.title} className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-5">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h4 className="font-semibold text-white mb-1">{f.title}</h4>
              <p className="text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link
            to="/retro/new"
            className="inline-block bg-accent hover:bg-accent-hover text-accent-fg font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Start a retro board
          </Link>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">Ready to run your next sprint ritual?</h2>
        <p className="text-slate-400 mb-6">Free, no account required. Get your team started in under a minute.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/new"
            className="inline-block bg-accent hover:bg-accent-hover text-accent-fg font-semibold text-lg px-8 py-3.5 rounded-xl transition-colors"
          >
            Create a room
          </Link>
          <Link
            to="/retro/new"
            className="inline-block bg-[var(--c-panel)] border border-[var(--c-border)] hover:bg-[var(--c-panel2)] text-white font-semibold text-lg px-8 py-3.5 rounded-xl transition-colors"
          >
            Start a retro board
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
