import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[var(--color-bg)]/70 border-b border-[var(--color-border)]/50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center text-white text-sm font-bold shadow-[0_0_20px_-4px_rgba(124,92,255,0.6)]">
            S
          </div>
          <span className="font-semibold tracking-tight group-hover:text-[var(--color-accent)] transition-colors">
            SkillForge
          </span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)] hidden sm:inline ml-2">
            Catalyst Hackathon
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <a
            href="https://github.com/strhwke/skillforge#scoring-and-logic"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            How it works
          </a>
          <a
            href="https://github.com/strhwke/skillforge"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
