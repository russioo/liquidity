/**
 * PumpPortal Engine
 * Uses pumpportal.fun API for:
 * - Claim creator fees
 * - Buyback (trade)
 * 
 * Uses @pump-fun/pump-swap-sdk for:
 * - Add liquidity after graduation
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

const RPC_URL = process.env.HELIUS_RPC_URL || 
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` ||
  "https://api.mainnet-beta.solana.com";

interface ProcessResult {
  success: boolean;
  phase: "bonding" | "graduated";
  feesClaimed: number;
  buybackSol: number;
  buybackTokens: number;
  lpSol: number;
  lpTokens: number;
  transactions: { type: string; signature: string; solscanUrl: string }[];
  error?: string;
}

interface TokenConfig {
  mint: string;
  devWalletPrivate: string; // The dev wallet that created the token and receives fees
}

/**
 * Main engine class
 */
export class PumpPortalEngine {
  private connection: Connection;

  constructor(rpcUrl: string = RPC_URL) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  /**
   * Run a full cycle for a token
   */
  async runCycle(config: TokenConfig): Promise<ProcessResult> {
    const result: ProcessResult = {
      success: false,
      phase: "bonding",
      feesClaimed: 0,
      buybackSol: 0,
      buybackTokens: 0,
      lpSol: 0,
      lpTokens: 0,
      transactions: [],
    };

    try {
      const wallet = Keypair.fromSecretKey(bs58.decode(config.devWalletPrivate));
      console.log(`   Dev wallet: ${wallet.publicKey.toBase58()}`);

      // Check if token is graduated (on PumpSwap)
      const graduated = await this.isGraduated(config.mint);
      result.phase = graduated ? "graduated" : "bonding";
      console.log(`   Phase: ${result.phase.toUpperCase()}`);

      // 1. Get current balance
      const balanceBefore = await this.connection.getBalance(wallet.publicKey);
      console.log(`   Balance before: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

      // 2. Claim creator fees via pumpportal
      const claimResult = await this.claimCreatorFees(wallet);
      if (claimResult.success && claimResult.signature) {
        result.transactions.push({
          type: "claim_fees",
          signature: claimResult.signature,
          solscanUrl: `https://solscan.io/tx/${claimResult.signature}`,
        });
        console.log(`   ✅ Claimed fees: ${claimResult.solscanUrl}`);
      }

      // Wait a moment for balance to update
      await new Promise(r => setTimeout(r, 2000));

      // 3. Get new balance after claiming
      const balanceAfter = await this.connection.getBalance(wallet.publicKey);
      const claimed = (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL;
      result.feesClaimed = Math.max(0, claimed);
      console.log(`   Fees claimed: ${result.feesClaimed.toFixed(4)} SOL`);

      // 4. Only proceed if we have fees to use
      const minSolForBuyback = 0.005; // Minimum SOL to do a buyback
      const reserveForFees = 0.005; // Keep 0.005 SOL for transaction fees
      const availableSol = balanceAfter / LAMPORTS_PER_SOL - reserveForFees;

      if (availableSol < minSolForBuyback) {
        console.log(`   ⏭️ Skipping: Not enough SOL (${availableSol.toFixed(4)} < ${minSolForBuyback})`);
        result.success = true;
        result.error = "Not enough SOL for buyback";
        return result;
      }

      // 5. Buyback via pumpportal - use ALL available SOL (minus reserve)
      const buybackAmount = availableSol;
      console.log(`   Buying back with ${buybackAmount.toFixed(4)} SOL (keeping ${reserveForFees} for fees)...`);
      
      const buyResult = await this.buyToken(wallet, config.mint, buybackAmount, graduated);
      if (buyResult.success && buyResult.signature) {
        result.buybackSol = buybackAmount;
        result.transactions.push({
          type: "buyback",
          signature: buyResult.signature,
          solscanUrl: `https://solscan.io/tx/${buyResult.signature}`,
        });
        console.log(`   ✅ Buyback: ${buyResult.solscanUrl}`);
      } else {
        console.log(`   ❌ Buyback failed: ${buyResult.error}`);
      }

      // 6. If graduated, try to add LP (TODO: implement with pumpswap SDK)
      if (graduated) {
        console.log(`   🏊 LP addition: Coming soon (token is graduated)`);
        // TODO: Add LP using @pump-fun/pump-swap-sdk
      }

      result.success = true;
      return result;

    } catch (error: any) {
      console.error(`   ❌ Error:`, error.message);
      result.error = error.message;
      return result;
    }
  }

  /**
   * Check if token is graduated (on PumpSwap/Raydium)
   */
  async isGraduated(mint: string): Promise<boolean> {
    try {
      // Check DexScreener for PumpSwap pool
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await res.json() as any;
      
      if (data.pairs && data.pairs.length > 0) {
        const pumpPair = data.pairs.find((p: any) => 
          p.dexId === "pumpswap" || p.dexId === "raydium"
        );
        if (pumpPair) {
          console.log(`   Graduated: Pool found on ${pumpPair.dexId}`);
          return true;
        }
      }
      
      return false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Claim creator fees via pumpportal
   */
  async claimCreatorFees(wallet: Keypair): Promise<{ success: boolean; signature?: string; solscanUrl?: string; error?: string }> {
    try {
      console.log(`   Claiming creator fees...`);
      
      const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: wallet.publicKey.toBase58(),
          action: "collectCreatorFee",
          priorityFee: 0.0001,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // "No creator fees to claim" is not an error
        if (errorText.includes("No creator fees") || errorText.includes("no fees")) {
          console.log(`   No creator fees to claim`);
          return { success: true };
        }
        return { success: false, error: errorText };
      }

      const txBytes = await response.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txBytes));
      tx.sign([wallet]);

      const signature = await this.connection.sendTransaction(tx, {
        skipPreflight: true,
        maxRetries: 3,
      });

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, "confirmed");

      return {
        success: true,
        signature,
        solscanUrl: `https://solscan.io/tx/${signature}`,
      };

    } catch (error: any) {
      // Don't fail if no fees to claim
      if (error.message?.includes("No creator fees") || error.message?.includes("no fees")) {
        return { success: true };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Buy token via pumpportal
   */
  async buyToken(
    wallet: Keypair, 
    mint: string, 
    solAmount: number,
    graduated: boolean
  ): Promise<{ success: boolean; signature?: string; solscanUrl?: string; error?: string }> {
    try {
      // Use "auto" pool to automatically select the right exchange
      const pool = graduated ? "auto" : "pump";
      
      const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: wallet.publicKey.toBase58(),
          action: "buy",
          mint: mint,
          amount: solAmount,
          denominatedInSol: "true",
          slippage: 25, // 25% slippage
          priorityFee: 0.0005,
          pool: pool,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const txBytes = await response.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txBytes));
      tx.sign([wallet]);

      const signature = await this.connection.sendTransaction(tx, {
        skipPreflight: true,
        maxRetries: 3,
      });

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, "confirmed");

      return {
        success: true,
        signature,
        solscanUrl: `https://solscan.io/tx/${signature}`,
      };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
let engineInstance: PumpPortalEngine | null = null;

export function getEngine(rpcUrl?: string): PumpPortalEngine {
  if (!engineInstance) {
    engineInstance = new PumpPortalEngine(rpcUrl);
  }
  return engineInstance;
}

