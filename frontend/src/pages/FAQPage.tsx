import { MarketingShell } from "../components/MarketingShell";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Planning Poker?",
    a: "A technique agile teams use to estimate work: everyone picks a card in secret, then all cards are revealed together. It keeps early guesses from anchoring the group's estimate.",
  },
  {
    q: "How much does it cost?",
    a: "Free for everyone. There's no paid tier.",
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

export default function FAQPage() {
  return (
    <MarketingShell title="FAQ — Planning Poker">
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mb-10">
          Frequently asked questions
        </h1>
        <div className="space-y-3">
          {FAQS.map((item) => (
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
      </section>
    </MarketingShell>
  );
}
