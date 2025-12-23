/**
 * Liquidity Feeder
 * Fetches active tokens from database and runs cycles
 */

import { supabase } from "../index";
import { getEngine } from "./pumpportalEngine";

interface TokenRecord {
  id: string;
  name: string;
  symbol: string;
  mint: string;
  creator_wallet: string;
  bot_wallet_private: string;
  status: string;
}

/**
 * Process all active tokens
 */
export async function processAllTokens(): Promise<void> {
  console.log("📋 Fetching active tokens from database...");

  const { data: tokens, error } = await supabase
    .from("tokens")
    .select("id, name, symbol, mint, creator_wallet, bot_wallet_private, status")
    .in("status", ["bonding", "graduated", "pending"]);

  if (error) {
    console.error("Database error:", error);
    return;
  }

  if (!tokens || tokens.length === 0) {
    console.log("No active tokens to process");
    return;
  }

  console.log(`Found ${tokens.length} active token(s)`);

  const engine = getEngine();

  for (const token of tokens as TokenRecord[]) {
    console.log("");
    console.log("──────────────────────────────────────────────────");
    console.log(`🪙 Processing: ${token.symbol} (${token.mint.slice(0, 8)}...)`);

    // Skip if no bot wallet configured
    if (!token.bot_wallet_private) {
      console.log("   ⏭️ Skipping: No bot wallet configured");
      continue;
    }

    try {
      const result = await engine.runCycle({
        mint: token.mint,
        devWalletPrivate: token.bot_wallet_private,
      });

      console.log(`📊 Phase: ${result.phase.toUpperCase()}`);
      
      if (result.feesClaimed > 0) {
        console.log(`   💰 Fees claimed: ${result.feesClaimed.toFixed(4)} SOL`);
      }
      
      if (result.buybackSol > 0) {
        console.log(`   💰 Buyback: ${result.buybackSol.toFixed(4)} SOL`);
      }

      // Show transaction links
      for (const tx of result.transactions) {
        console.log(`   ✅ ${tx.type}: ${tx.solscanUrl}`);
      }

      if (result.error && !result.success) {
        console.log(`   ❌ Error: ${result.error}`);
      }

      // Update token status if needed
      if (result.phase === "graduated" && token.status !== "graduated") {
        await supabase
          .from("tokens")
          .update({ status: "graduated" })
          .eq("id", token.id);
        console.log(`   📈 Status updated to: graduated`);
      }

      // Record transactions in feed_history
      for (const tx of result.transactions) {
        await supabase.from("feed_history").insert({
          token_id: token.id,
          type: tx.type,
          signature: tx.signature,
          sol_amount: tx.type === "buyback" ? result.buybackSol : result.feesClaimed,
          token_amount: 0,
        });
      }

    } catch (err: any) {
      console.error(`   ❌ Error:`, err.message);
    }
  }

  console.log("");
  console.log("──────────────────────────────────────────────────");
  console.log("✅ All tokens processed");
}
