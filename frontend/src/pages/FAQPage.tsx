import { MarketingShell } from "../components/MarketingShell";

const POKER_FAQS: { q: string; a: string }[] = [
  {
    q: "What is Planning Poker?",
    a: "A technique agile teams use to estimate work: everyone picks a card in secret, then all cards are revealed together. It keeps early guesses from anchoring the group's estimate.",
  },
  {
    q: "How much does it cost?",
    a: "Free for everyone — both Planning Poker and Retro Board. There's no paid tier.",
  },
  {
    q: "Do I need to sign up?",
    a: "No — pick a nickname and you're in. There are no accounts or passwords.",
  },
  {
    q: "Is my room's history saved anywhere?",
    a: "No. Everything lives in the server's memory for as long as the room is active — there's no database, dashboard, or export of past sessions. A room disappears once everyone leaves, after 24 hours, or if the server restarts.",
  },
  {
    q: "How many players can join a room?",
    a: "There's no hard limit, but the table layout is tuned for small-to-mid-size teams — up to about 12 players is the sweet spot.",
  },
  {
    q: "What happens if my internet drops?",
    a: "The app auto-reconnects within a 30-second grace period. Reopen the tab (or wait for the client to retry) and you're back in as the same player, with your vote and facilitator role intact.",
  },
];

const RETRO_FAQS: { q: string; a: string }[] = [
  {
    q: "What is Retro Board?",
    a: "A live board for sprint retrospectives: everyone adds cards to columns (Mad/Sad/Glad, Start/Stop/Continue, or 4Ls), votes on what matters most, and the team discusses it together, time-boxed with a shared timer.",
  },
  {
    q: "Which retro templates can I use?",
    a: "Three built-in templates: Mad/Sad/Glad, Start/Stop/Continue, and 4Ls (Liked/Learned/Lacked/Longed for). Pick one when you create the board.",
  },
  {
    q: "Can feedback stay anonymous?",
    a: "Yes — the facilitator can turn on anonymous mode from the board settings, which hides who wrote each card from everyone except its author.",
  },
  {
    q: "How does voting work on a retro board?",
    a: "Everyone gets a shared budget of votes (5 by default, adjustable by the facilitator) to spend across all cards, not per card — so you have to pick what matters most.",
  },
  {
    q: "Can I group similar cards together?",
    a: "Yes — drag one card onto another to merge them into a single card, with a confirmation step first and a one-click undo if you change your mind.",
  },
  {
    q: "Is my board saved anywhere?",
    a: "No. Just like Planning Poker, everything lives in the server's memory — a board disappears once everyone leaves, after 24 hours, or if the server restarts.",
  },
];

function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.q}
          data-testid="faq-item"
          className="group bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl px-5 py-4"
        >
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-semibold text-white">
            {item.q}
            <span className="text-slate-400 transition-transform group-open:rotate-45 text-xl leading-none">+</span>
          </summary>
          <p className="mt-3 text-sm text-slate-400">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export default function FAQPage() {
  return (
    <MarketingShell title="FAQ — Planning Poker & Retro Board">
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mb-10">
          Frequently asked questions
        </h1>

        <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
          <span className="text-xl">🃏</span> Planning Poker
        </h2>
        <FaqList items={POKER_FAQS} />

        <h2 className="flex items-center gap-2 text-lg font-bold text-white mt-12 mb-4">
          <span className="text-xl">📝</span> Retro Board
        </h2>
        <FaqList items={RETRO_FAQS} />
      </section>
    </MarketingShell>
  );
}
