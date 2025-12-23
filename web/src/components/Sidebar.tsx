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

export function Sidebar() {
  const pathname = usePathname();
  const [stats, setStats] = useState<GlobalStats | null>(null);

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

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col">
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
