import { Sidebar } from "@/components/Sidebar";
import { CreateTokenForm } from "@/components/CreateTokenForm";

export default function Launch() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      
      <main className="ml-64 p-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="font-pixel text-xl text-[var(--accent)] glow-green mb-2">
            CREATE TOKEN
          </h1>
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
            launch your token with auto-liquidity technology
          </p>
        </header>

        {/* Content */}
        <div className="grid grid-cols-[1fr,340px] gap-8">
          {/* Form */}
          <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
            <CreateTokenForm />
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            {/* What you get */}
            <div className="border border-[var(--accent)]/30 bg-[var(--accent-muted)] p-5">
              <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-4">
                what you get
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-[var(--accent)]">+</span>
                  <span>token on pumpfun</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--accent)]">+</span>
                  <span>0.05 sol dev buy included</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--accent)]">+</span>
                  <span>auto fee claiming</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--accent)]">+</span>
                  <span>buybacks every 1 min</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--purple)]">+</span>
                  <span>lp after graduation</span>
                </div>
              </div>
            </div>

            {/* Private Key Info */}
            <div className="border border-red-500/30 bg-red-500/5 p-5">
              <div className="text-[10px] uppercase tracking-widest text-red-400 mb-3">
                ⚠ connected wallet key required
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
                you MUST paste the private key of the wallet you have connected.
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                this wallet will:
              </p>
              <ul className="text-xs text-[var(--text-muted)] mt-1 space-y-1">
                <li>→ receive all creator fees</li>
                <li>→ run buybacks automatically</li>
                <li>→ add liquidity after graduation</li>
              </ul>
              <p className="text-[10px] text-red-400/70 mt-3">
                phantom: settings → security → export private key
              </p>
            </div>

            {/* Important Note */}
            <div className="border border-yellow-500/30 bg-yellow-500/5 p-5">
              <div className="text-[10px] uppercase tracking-widest text-yellow-500 mb-3">
                lp after graduation
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                liquidity only added after graduation (~$55k mcap). 
                until then, all fees go to buybacks.
              </p>
            </div>

            {/* Every 5 min */}
            <div className="border border-[var(--purple)]/30 bg-[var(--purple-muted)] p-5">
              <div className="text-[10px] uppercase tracking-widest text-[var(--purple)] mb-4">
                every 1 minute
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--accent)]">1.</span>
                  <span>claim creator fees</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--accent)]">2.</span>
                  <span>buyback your token</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--purple)]">3.</span>
                  <span>add to lp (after graduation)</span>
                </div>
              </div>
            </div>

            {/* Powered by */}
            <div className="border border-[var(--border)] p-4 flex items-center justify-center gap-4">
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">solana</span>
              <span className="text-[var(--border)]">|</span>
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">pumpfun</span>
              <span className="text-[var(--border)]">|</span>
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">pumpswap</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
