import { Link } from "react-router-dom";
import { MarketingShell } from "../components/MarketingShell";

const STEPS: { icon: string; title: string; body: string }[] = [
  { icon: "🚀", title: "Create a room", body: "Pick a deck, name your session, no account needed." },
  { icon: "🔗", title: "Share the link", body: "Send the room URL to your team — they join by picking a nickname." },
  { icon: "🃏", title: "Vote in secret", body: "Everyone picks a card; values stay hidden until reveal." },
  { icon: "📊", title: "Reveal & discuss", body: "See everyone's estimate plus average, median, and consensus at a glance." },
];

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: "🎴", title: "4 voting decks", body: "Fibonacci, Powers of 2, Sequential 1–10, and T-shirt sizes." },
  { icon: "⚡", title: "Real-time", body: "WebSocket-powered — every vote, reveal, and reaction shows up instantly for the whole room." },
  { icon: "⚙️", title: "Room settings", body: "Control who can reveal cards and who can manage the issue backlog." },
  { icon: "✏️", title: "Drawing & reactions", body: "Sketch on screen or throw an emoji at a teammate's card — the fun stuff, opt-in." },
  { icon: "📋", title: "Issue backlog", body: "Queue up tickets, vote one at a time, and auto-record the final estimate." },
  { icon: "🎨", title: "Themes", body: "Light, dark, or system, plus 7 accent colors — all tuned for contrast." },
];

export default function LandingPage() {
  return (
    <MarketingShell title="Planning Poker — free real-time estimation for agile teams">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-14 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
          Planning Poker for agile teams
        </h1>
        <p className="mt-4 text-lg text-slate-300 max-w-2xl mx-auto">
          Estimate stories together in real time. No sign-up, no install — create a room,
          share the link, and start voting in seconds.
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
        <h2 className="text-2xl font-bold text-white text-center mb-10">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, i) => (
            <div key={step.title} className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-5">
              <div className="text-3xl mb-3">{step.icon}</div>
              <div className="text-xs text-accent font-semibold mb-1">STEP {i + 1}</div>
              <h3 className="font-semibold text-white mb-1">{step.title}</h3>
              <p className="text-sm text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl p-5">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h3 className="font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Retro Boards teaser */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 text-center">
        <div className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl p-8">
          <div className="text-3xl mb-3">📝</div>
          <h2 className="text-2xl font-bold text-white mb-2">Running a retrospective instead?</h2>
          <p className="text-slate-400 mb-6">
            Same idea, different board — collect Mad/Sad/Glad or Start/Stop/Continue cards live with your team, vote on what matters, and time-box the discussion.
          </p>
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
        <h2 className="text-2xl font-bold text-white mb-3">Ready to estimate your next sprint?</h2>
        <p className="text-slate-400 mb-6">Free, no account required. Get your team voting in under a minute.</p>
        <Link
          to="/new"
          className="inline-block bg-accent hover:bg-accent-hover text-accent-fg font-semibold text-lg px-8 py-3.5 rounded-xl transition-colors"
        >
          Create a room
        </Link>
      </section>
    </MarketingShell>
  );
}
