import { Sidebar } from "@/components/Sidebar";

export default function Docs() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      
      <main className="ml-64 p-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="font-pixel text-xl text-[var(--accent)] glow-green mb-2">
            DOCS
          </h1>
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
            learn how liquidify works
          </p>
        </header>

        <div className="max-w-3xl space-y-8">
          {/* Overview */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-4">
              overview
            </div>
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
              <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                liquidify is a self-replenishing liquidity engine for pumpfun tokens. 
                we automatically claim your creator fees and use them to buyback your token 
                and add liquidity to the pool.
              </p>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                the result: constant buy pressure, growing liquidity, and a more stable token.
              </p>
            </div>
          </section>

          {/* Two Phases */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[var(--purple)] mb-4">
              two phases
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-yellow-500/30 bg-yellow-500/5 p-5">
                <div className="text-yellow-500 font-bold text-sm mb-3">BONDING CURVE</div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
                  while your token is on the bonding curve (before $55k market cap):
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--accent)]">+</span>
                    <span>claim creator fees</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--accent)]">+</span>
                    <span>100% goes to buybacks</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">-</span>
                    <span className="text-[var(--text-muted)]">no lp yet (no pool exists)</span>
                  </li>
                </ul>
              </div>
              <div className="border border-[var(--accent)]/30 bg-[var(--accent-muted)] p-5">
                <div className="text-[var(--accent)] font-bold text-sm mb-3">GRADUATED</div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
                  after graduation to pumpswap:
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--accent)]">+</span>
                    <span>claim creator fees</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--accent)]">+</span>
                    <span>buyback tokens</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--purple)]">+</span>
                    <span>add to pumpswap lp</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* The Loop */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-4">
              the 5-minute loop
            </div>
            <div className="border border-[var(--accent)]/30 bg-[var(--accent-muted)] p-6">
              <div className="space-y-4">
                <LoopStep num={1} text="claim all creator fees" color="green" />
                <Arrow />
                <LoopStep num={2} text="buyback tokens (via jupiter)" color="green" />
                <Arrow />
                <LoopStep num={3} text="add tokens + sol to lp (graduated only)" color="purple" />
                <Arrow />
                <div className="text-center text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                  repeat every 1 minute
                </div>
              </div>
            </div>
          </section>

          {/* How to use */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-4">
              how to use
            </div>
            <div className="space-y-3">
              <DocStep num={1} title="connect wallet" desc="connect the wallet you want to use for automation" />
              <DocStep num={2} title="create token" desc="fill in token details" />
              <DocStep num={3} title="paste private key" desc="paste the private key OF THE CONNECTED WALLET" />
              <DocStep num={4} title="automatic" desc="your wallet claims fees, buybacks, and adds lp" />
            </div>
            <div className="border border-red-500/30 bg-red-500/5 p-4 mt-4">
              <div className="text-red-400 font-bold text-xs mb-2">⚠ CONNECTED WALLET PRIVATE KEY</div>
              <p className="text-xs text-[var(--text-muted)]">
                the private key MUST be from the wallet you have connected. 
                this is the wallet that receives creator fees and runs all automation.
              </p>
              <p className="text-[10px] text-red-400/70 mt-2">
                phantom: settings → security → export private key
              </p>
            </div>
          </section>

          {/* Why Liquidity Matters */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[var(--purple)] mb-4">
              why liquidity matters
            </div>
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
              <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-3">
                  <span className="text-[var(--accent)]">→</span>
                  <span>deeper liquidity = less slippage for buyers</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[var(--accent)]">→</span>
                  <span>more stable price = less volatility</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[var(--accent)]">→</span>
                  <span>buybacks = constant buy pressure</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[var(--purple)]">→</span>
                  <span>lp addition = coin lives longer</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Features */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-4">
              features
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FeatureCard title="your wallet" desc="all operations on your connected wallet" />
              <FeatureCard title="auto-claim" desc="fees claimed every minute" />
              <FeatureCard title="1 min cycles" desc="runs 24/7 automatically" />
              <FeatureCard title="official sdks" desc="pumpfun + pumpswap + jupiter" />
            </div>
          </section>

          {/* FAQ */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-[var(--purple)] mb-4">
              faq
            </div>
            <div className="space-y-3">
              <FaqItem 
                q="why do i need my private key?" 
                a="your connected wallet signs all transactions. we need the key to automate buybacks and lp."
              />
              <FaqItem 
                q="which wallet receives the fees?" 
                a="the wallet you connected. this is why the private key must be from that wallet."
              />
              <FaqItem 
                q="when does lp get added?" 
                a="only after graduation (~$55k mcap). before that, all fees go to buybacks."
              />
              <FaqItem 
                q="do i need to do anything?" 
                a="no. once you paste your private key, everything is automatic."
              />
              <FaqItem 
                q="can i see the transactions?" 
                a="yes. all transactions are on solscan and in the dashboard."
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center">
      <svg className="w-4 h-4 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function LoopStep({ num, text, color }: { num: number; text: string; color: "green" | "purple" }) {
  const bgColor = color === "green" ? "bg-[var(--accent)]" : "bg-[var(--purple)]";
  
  return (
    <div className="flex items-center gap-4">
      <div className={`w-8 h-8 ${bgColor} text-black font-bold text-sm flex items-center justify-center`}>
        {num}
      </div>
      <span className="text-sm">{text}</span>
    </div>
  );
}

function DocStep({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex gap-4">
      <div className="w-8 h-8 border border-[var(--accent)] text-[var(--accent)] font-bold text-sm flex items-center justify-center flex-shrink-0">
        {num}
      </div>
      <div>
        <div className="font-bold text-sm mb-1">{title}</div>
        <div className="text-xs text-[var(--text-muted)]">{desc}</div>
      </div>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="font-bold text-sm mb-1">{title}</div>
      <div className="text-xs text-[var(--text-muted)]">{desc}</div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <div className="font-bold text-sm mb-2 text-[var(--accent)]">{q}</div>
      <div className="text-xs text-[var(--text-secondary)]">{a}</div>
    </div>
  );
}
