"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { WalletButton } from "./WalletButton";
import { getGlobalStats, type GlobalStats } from "@/lib/api";

const navigation = [
  { name: "dashboard", href: "/", icon: GridIcon },
  { name: "create", href: "/launch", icon: PlusIcon },
  { name: "docs", href: "/docs", icon: FileIcon },
];

const socials = [
  { name: "follow us", href: "https://x.com/liquidforsol", icon: XIcon, external: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    getGlobalStats()
      .then(setStats)
      .catch(() => setStats(null));
    
    const interval = setInterval(() => {
      getGlobalStats()
        .then(setStats)
        .catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--accent)]/20 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] flex items-center justify-center">
            <span className="text-black font-bold text-lg">L</span>
          </div>
          <div>
            <div className="font-pixel text-[var(--accent)] text-xs glow-green tracking-wider">
              LIQUIDIFY
            </div>
            <div className="text-[8px] text-[var(--text-muted)] uppercase tracking-widest">
              auto-lp engine
            </div>
          </div>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-10 h-10 flex items-center justify-center border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all"
        >
          {mobileMenuOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/80"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-screen w-64 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col z-50
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/" className="block">
            <div className="font-pixel text-[var(--accent)] text-lg glow-green tracking-wider">
              LIQUIDIFY
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-widest">
              auto-liquidity engine
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-widest transition-all ${
                    isActive
                      ? "bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/30"
                      : "text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] border border-transparent"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Social Links */}
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3 px-4">
              social
            </div>
            <div className="space-y-1">
              {socials.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-widest transition-all text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] border border-transparent"
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                  <svg className="w-3 h-3 ml-auto opacity-50" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </nav>

        {/* Stats */}
        <div className="p-4 border-t border-[var(--border)]">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3">
            stats
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-[var(--bg)] border border-[var(--border)] p-3">
              <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">tokens</div>
              <div className="font-mono text-[var(--accent)] text-lg">
                {stats?.totalTokens ?? "0"}
              </div>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] p-3">
              <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">claimed</div>
              <div className="font-mono text-[var(--purple)] text-lg">
                {stats ? `${(stats.totalFeesClaimed || 0).toFixed(1)}` : "0"}
              </div>
            </div>
          </div>
          <WalletButton />
        </div>
      </aside>
    </>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zm11-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
