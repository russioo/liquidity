"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getToken, type Token, type FeedHistory } from "@/lib/api";

export default function TokenDetail() {
  const params = useParams();
  const tokenId = params.id as string;
  
  const [token, setToken] = useState<(Token & { feed_history: FeedHistory[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const data = await getToken(tokenId);
        setToken(data);
      } catch (err: any) {
        setError(err.message || "Failed to fetch token");
      } finally {
        setLoading(false);
      }
    };

    if (tokenId) {
      fetchToken();
      const interval = setInterval(fetchToken, 30000);
      return () => clearInterval(interval);
    }
  }, [tokenId]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Sidebar />
        <main className="ml-64 p-8">
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="min-h-screen">
        <Sidebar />
        <main className="ml-64 p-8">
          <div className="text-center py-16">
            <h1 className="text-xl font-bold text-red-500 mb-4">Token not found</h1>
            <Link href="/" className="text-[var(--accent)] hover:underline">
              ← back to dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      
      <main className="ml-64 p-8">
        {/* Back link */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--accent)] mb-6 transition-colors"
        >
          ← back to dashboard
        </Link>

        {/* Token Header */}
        <header className="flex items-start gap-6 mb-8">
          <TokenImage 
            imageUrl={token.image_url} 
            mint={token.mint} 
            symbol={token.symbol}
            size="large"
          />
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-2">
              <h1 className="font-pixel text-2xl text-[var(--accent)] glow-green">
                {token.name}
              </h1>
              <StatusBadge status={token.status} />
            </div>
            <div className="text-sm text-[var(--text-muted)] mb-3">${token.symbol}</div>
            {token.description && (
              <p className="text-sm text-[var(--text-secondary)] max-w-xl">{token.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={`https://pump.fun/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-[var(--border)] text-xs uppercase tracking-widest hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              pump.fun
            </a>
            <a
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-[var(--border)] text-xs uppercase tracking-widest hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              solscan
            </a>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard 
            label="fees claimed" 
            value={`${(token.total_fees_claimed || 0).toFixed(4)}`}
            suffix="SOL"
            accent="green"
          />
          <StatCard 
            label="buybacks" 
            value={`${(token.total_lp_fed || 0).toFixed(4)}`}
            suffix="SOL"
            accent="green"
          />
          <StatCard 
            label="lp added" 
            value={`${(token.total_volume || 0).toFixed(4)}`}
            suffix="SOL"
            accent="purple"
          />
          <StatCard 
            label="status" 
            value={token.status === "live" ? "graduated" : token.status}
            accent={token.status === "live" ? "green" : "purple"}
          />
        </div>

        {/* Mint Address */}
        <div className="mb-4 p-4 border border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">mint address</div>
          <div className="font-mono text-sm break-all">{token.mint}</div>
        </div>

        {/* Dev Wallet - where automation happens */}
        <div className="mb-8 p-4 border border-[var(--accent)]/50 bg-[var(--accent-muted)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest text-[var(--accent)]">dev wallet (automation)</div>
            <a 
              href={`https://solscan.io/account/${token.creator_wallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              view →
            </a>
          </div>
          <div className="font-mono text-sm break-all text-[var(--accent)]">{token.creator_wallet}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-2 uppercase tracking-widest">
            all buybacks + liquidity transactions happen from this wallet
          </div>
        </div>

        {/* Social Links */}
        {(token.twitter || token.telegram || token.website) && (
          <div className="mb-8 flex gap-4">
            {token.twitter && (
              <a
                href={token.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-xs uppercase tracking-widest hover:border-[var(--accent)] transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                twitter
              </a>
            )}
            {token.telegram && (
              <a
                href={token.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-xs uppercase tracking-widest hover:border-[var(--accent)] transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                telegram
              </a>
            )}
            {token.website && (
              <a
                href={token.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-xs uppercase tracking-widest hover:border-[var(--accent)] transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                website
              </a>
            )}
          </div>
        )}

        {/* Info */}
        <div className="p-4 border border-[var(--accent)]/30 bg-[var(--accent-muted)]">
          <div className="text-xs text-[var(--text-secondary)]">
            {token.status === "bonding" ? (
              <>
                <span className="text-[var(--accent)] font-bold">bonding phase:</span> only buybacks are active. 
                lp will be added automatically after graduation (~$55k market cap).
              </>
            ) : (
              <>
                <span className="text-[var(--accent)] font-bold">graduated:</span> full liquidify features active. 
                fees are claimed and used for buybacks + lp addition every 1 minute.
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, suffix, accent }: { 
  label: string; 
  value: string; 
  suffix?: string;
  accent?: "green" | "purple"; 
}) {
  const accentClass = accent === "green" ? "text-[var(--accent)]" : accent === "purple" ? "text-[var(--purple)]" : "";
  
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] p-5">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">{label}</div>
      <div className={`text-xl font-bold font-mono ${accentClass}`}>
        {value}
        {suffix && <span className="text-sm ml-1 text-[var(--text-muted)]">{suffix}</span>}
      </div>
    </div>
  );
}

function TokenImage({ imageUrl, mint, symbol, size = "small" }: { 
  imageUrl: string | null; 
  mint: string; 
  symbol: string;
  size?: "small" | "large";
}) {
  const [error, setError] = useState(false);
  const sizeClass = size === "large" ? "w-24 h-24 text-3xl" : "w-12 h-12 text-lg";
  
  // Try pump.fun image as primary source
  const pumpImage = `https://pump.fun/coin/${mint}/image`;
  const imageSrc = !error ? (imageUrl || pumpImage) : pumpImage;
  
  if (error && !imageUrl) {
    return (
      <div className={`${sizeClass} bg-[var(--bg-secondary)] border border-[var(--accent)]/30 flex items-center justify-center font-bold text-[var(--accent)]`}>
        {symbol.slice(0, 2)}
      </div>
    );
  }
  
  return (
    <img 
      src={imageSrc}
      alt={symbol}
      className={`${sizeClass} object-cover border border-[var(--border)]`}
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
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs uppercase tracking-widest font-bold ${styles[status] || styles.bonding}`}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {labels[status] || status}
    </span>
  );
}

