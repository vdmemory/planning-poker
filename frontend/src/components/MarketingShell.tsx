import { useEffect } from "react";
import { Link } from "react-router-dom";

interface Props {
  title: string;
  children: React.ReactNode;
}

/**
 * Shared header/footer for the marketing pages (landing, FAQ). Separate from
 * the in-app header in RoomPage.tsx — this one has real nav links instead of
 * room controls, and no WebSocket/room state to read.
 */
export function MarketingShell({ title, children }: Props) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--c-bg)] text-white">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[var(--c-border)]">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-lg shrink-0">
            🃏
          </div>
          <span className="font-bold text-white text-lg truncate">Planning Poker</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-6">
          <Link to="/faq" className="text-sm text-slate-300 hover:text-white transition-colors hidden sm:inline">
            FAQ
          </Link>
          <Link
            to="/retro/new"
            data-testid="nav-retro-link"
            className="text-sm text-slate-300 hover:text-white transition-colors hidden sm:inline"
          >
            Retro Board
          </Link>
          <Link
            to="/new"
            className="bg-accent hover:bg-accent-hover text-accent-fg font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Create a room
          </Link>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[var(--c-border)] px-4 sm:px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-400">
          <span>© {new Date().getFullYear()} Planning Poker &amp; Retro Board. Free for everyone.</span>
          <div className="flex items-center gap-4">
            <Link to="/faq" className="hover:text-white transition-colors">FAQ</Link>
            <Link to="/new" className="hover:text-white transition-colors">Planning Poker</Link>
            <Link to="/retro/new" className="hover:text-white transition-colors">Retro Board</Link>
            <a
              href="https://github.com/vdmemory/planning-poker"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
