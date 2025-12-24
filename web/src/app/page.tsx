"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getTokens, getGlobalStats, type Token, type GlobalStats } from "@/lib/api";

export default function Dashboard() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tokensRes, statsRes] = await Promise.all([
          getTokens({ status: filter || undefined }),
          getGlobalStats(),
        ]);
        setTokens(tokensRes.tokens);
        setStats(statsRes);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  // Calculate bonding tokens
  const bondingTokens = tokens.filter(t => t.status === "bonding").length;
  const graduatedTokens = tokens.filter(t => t.status === "live" || t.status === "graduating").length;

  return (
    <div className="min-h-screen">
      <Sidebar />
      
      <main className="ml-64 p-8">
        {/* Header */}
        <header className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-pixel text-xl text-[var(--accent)] glow-green mb-2">
              DASHBOARD
            </h1>
            <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              all tokens using liquidify
            </p>
          </div>
          <Link 
            href="/launch"
            className="px-6 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-xs uppercase tracking-widest font-bold transition-all hover:shadow-[0_0_20px_rgba(0,255,136,0.5)]"
          >
            + create token
          </Link>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <StatCard 
            label="total tokens" 
            value={stats?.totalTokens?.toString() || "0"} 
            description="all tokens"
            loading={loading} 
          />
          <StatCard 
            label="bonding" 
            value={bondingTokens.toString()} 
            description="on bonding curve"
            accent="purple"
            loading={loading} 
          />
          <StatCard 
            label="graduated" 
            value={graduatedTokens.toString()} 
            description="live on pumpswap"
            accent="green"
            loading={loading} 
          />
          <StatCard 
            label="fees claimed" 
            value={stats ? `${(stats.totalFeesClaimed || 0).toFixed(2)}` : "0"} 
            suffix="SOL"
            description="total claimed"
            accent="green"
            loading={loading} 
          />
          <StatCard 
            label="buybacks" 
            value={stats ? `${(stats.totalBuyback || 0).toFixed(2)}` : "0"} 
            suffix="SOL"
            description="tokens bought back"
            accent="green"
            loading={loading} 
          />
        </div>

        {/* How it works banner */}
        <div className="mb-8 p-6 border border-[var(--accent)]/30 bg-[var(--accent-muted)] box-glow-green">
          <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-3">
            every 1 minute
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[var(--text-secondary)]">claim fees</span>
            <span className="text-[var(--accent)]">→</span>
            <span className="text-[var(--accent)]">buyback tokens</span>
            <span className="text-[var(--accent)]">→</span>
            <span className="text-[var(--purple)]">add to lp (after graduation)</span>
          </div>
        </div>

        {/* Tokens Table */}
        <div className="border border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">all tokens</h2>
            <div className="flex items-center gap-1">
              {[null, "live", "bonding"].map((status) => (
                <button
                  key={status || "all"}
                  onClick={() => setFilter(status)}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider transition-all ${
                    filter === status
                      ? "bg-[var(--accent)] text-black font-bold"
                      : "text-[var(--text-muted)] hover:text-[var(--accent)] border border-transparent hover:border-[var(--accent)]/30"
                  }`}
                >
                  {status || "all"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center">
              <div className="w-8 h-8 mx-auto mb-4 border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">loading...</p>
            </div>
          ) : tokens.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {tokens.map((token) => (
                <Link 
                  key={token.id} 
                  href={`/token/${token.id}`}
                  className="flex items-center px-6 py-4 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                >
                  {/* Token Image & Info */}
                  <div className="flex items-center gap-4 flex-1">
                    <TokenImage 
                      imageUrl={token.image_url} 
                      mint={token.mint} 
                      symbol={token.symbol} 
                    />
                    <div>
                      <div className="font-bold text-lg">{token.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">${token.symbol}</div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="w-32">
                    <StatusBadge status={token.status} />
        </div>

                  {/* Stats */}
                  <div className="w-32 text-right">
                    <div className="text-xs text-[var(--text-muted)] uppercase mb-1">fees</div>
                    <div className={`font-mono ${token.total_fees_claimed > 0 ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                      {token.total_fees_claimed > 0 ? `${Number(token.total_fees_claimed).toFixed(3)}` : "0"} SOL
                    </div>
                  </div>

                  <div className="w-32 text-right">
                    <div className="text-xs text-[var(--text-muted)] uppercase mb-1">buybacks</div>
                    <div className={`font-mono ${token.total_buyback > 0 ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                      {token.total_buyback > 0 ? `${Number(token.total_buyback).toFixed(3)}` : "0"} SOL
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="w-12 text-right">
                    <span className="text-[var(--text-muted)]">→</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 border border-[var(--accent)]/30 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-[var(--accent)] animate-drip" />
              </div>
              <h3 className="font-bold mb-2">no tokens yet</h3>
              <p className="text-xs text-[var(--text-muted)] mb-6 uppercase tracking-widest">
                create your first token to start
              </p>
              <Link 
                href="/launch"
                className="inline-block px-6 py-3 bg-[var(--accent)] text-black text-xs uppercase tracking-widest font-bold hover:shadow-[0_0_20px_rgba(0,255,136,0.5)] transition-all"
              >
                create token
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, suffix, description, accent, loading }: { 
  label: string; 
  value: string; 
  suffix?: string;
  description?: string;
  accent?: "green" | "purple"; 
  loading?: boolean 
}) {
  const accentClass = accent === "green" ? "text-[var(--accent)]" : accent === "purple" ? "text-[var(--purple)]" : "";
  
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] p-5">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">{label}</div>
      {loading ? (
        <div className="h-8 w-16 bg-[var(--bg)] animate-pulse" />
      ) : (
        <>
          <div className={`text-2xl font-bold font-mono ${accentClass}`}>
            {value}
            {suffix && <span className="text-sm ml-1 text-[var(--text-muted)]">{suffix}</span>}
          </div>
          {description && (
            <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mt-1">{description}</div>
          )}
        </>
      )}
    </div>
  );
}

function TokenImage({ imageUrl, mint, symbol }: { imageUrl: string | null; mint: string; symbol: string }) {
  const [error, setError] = useState(false);
  
  // Try multiple image sources
  const imageSrc = !error && imageUrl 
    ? imageUrl 
    : `https://pump.fun/coin/${mint}/image`; // Fallback to pump.fun
  
  if (!imageUrl && error) {
    // Final fallback: show initials
    return (
      <div className="w-12 h-12 bg-[var(--bg)] border border-[var(--accent)]/30 flex items-center justify-center font-bold text-[var(--accent)] text-lg">
        {symbol.slice(0, 2)}
      </div>
    );
  }
  
  return (
    <img 
      src={imageSrc} 
      alt={symbol}
      className="w-12 h-12 object-cover border border-[var(--border)]"
      onError={() => setError(true)}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    live: "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-muted)]",
    graduating: "border-amber-500 text-amber-500 bg-amber-500/10",
    bonding: "border-[var(--purple)] text-[var(--purple)] bg-[var(--purple-muted)]",
    pending: "border-gray-500 text-gray-500 bg-gray-500/10",
    failed: "border-red-500 text-red-500 bg-red-500/10",
  };

  const labels: Record<string, string> = {
    live: "graduated",
    graduating: "graduating",
    bonding: "bonding",
    pending: "pending",
    failed: "failed",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 border text-[10px] uppercase tracking-widest font-bold ${styles[status] || styles.bonding}`}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {labels[status] || status}
    </span>
  );
}
