import express from "express";
import cors from "cors";
import cron from "node-cron";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: "10mb" })); // Increased for image uploads

// Supabase client
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn("⚠️  Warning: Supabase credentials not set. Database features will not work.");
}

export const supabase = createClient(
  process.env.SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_KEY || "placeholder"
);

// Import routes after supabase is initialized
import("./routes/tokens.js").then(({ tokenRoutes }) => {
  app.use("/api/tokens", tokenRoutes);
});

// Root route
app.get("/", (req, res) => {
  res.json({ 
    name: "LIQUIDIFY API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/health",
      tokens: "/api/tokens",
      stats: "/api/tokens/stats",
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    rpc: !!process.env.HELIUS_RPC_URL || !!process.env.SOLANA_RPC_URL,
  });
});

// Cron job - every 1 minute: claim fees + buyback + liquidity
cron.schedule("* * * * *", async () => {
  console.log("🔄 [CRON] Starting feed cycle...");
  try {
    const { processAllTokens } = await import("./services/liquidityFeeder.js");
    await processAllTokens();
    console.log("✅ [CRON] Feed cycle complete");
  } catch (error) {
    console.error("❌ [CRON] Error in feed cycle:", error);
  }
});

// Run first cycle 10 seconds after startup
setTimeout(async () => {
  console.log("🚀 [STARTUP] Running initial feed cycle...");
  try {
    const { processAllTokens } = await import("./services/liquidityFeeder.js");
    await processAllTokens();
    console.log("✅ [STARTUP] Initial feed cycle complete");
  } catch (error) {
    console.error("❌ [STARTUP] Error:", error);
  }
}, 10000);

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                   LIQUIDIFY BACKEND                   ║
╠═══════════════════════════════════════════════════════╣
║  Server:    http://0.0.0.0:${PORT}                        ║
║  Health:    /health                                    ║
║  API:       /api/tokens                                ║
╠═══════════════════════════════════════════════════════╣
║  Every 1 min: Claim fees → Buyback → LP (if bonded)   ║
╚═══════════════════════════════════════════════════════╝
  `);
});
