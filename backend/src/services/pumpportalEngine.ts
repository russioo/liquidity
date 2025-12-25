/**
 * PumpPortal Engine
 * Uses pumpportal.fun API for:
 * - Claim creator fees
 * - Buyback (trade)
 * 
 * Uses @pump-fun/pump-swap-sdk for:
 * - Add liquidity after graduation
 */

import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { OnlinePumpAmmSdk, PumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import { getAssociatedTokenAddress, getAccount, createBurnInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// Fee distribution config
const FEE_CONFIG: Record<string, { ratio: number; sendTo: string }> = {
  "Der9exLkNj9dE6zNR7A8fKgxuoR9HCnqgPbDwtyqv6ec": { 
    ratio: 0.2, 
    sendTo: "3eshtU2iV2CfZvEAyn76jhG7rbeQQN54cUDykPPpJRdV" 
  },
};

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
  private pumpAmmSdk: PumpAmmSdk;

  constructor(rpcUrl: string = RPC_URL) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.pumpAmmSdk = new PumpAmmSdk();
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
      const { graduated, poolKey } = await this.isGraduated(config.mint);
      result.phase = graduated ? "graduated" : "bonding";
      console.log(`   Phase: ${result.phase.toUpperCase()}`);

      // 1. Get balance BEFORE claiming
      const balanceBefore = await this.connection.getBalance(wallet.publicKey);
      console.log(`   Balance before claim: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

      // 2. Claim creator fees via pumpportal
      const claimResult = await this.claimCreatorFees(wallet);
      
      // Only count fees if claim was successful with a signature
      let feesClaimed: number = 0;
      
      if (claimResult.success && claimResult.signature) {
        result.transactions.push({
          type: "claim_fees",
          signature: claimResult.signature,
          solscanUrl: `https://solscan.io/tx/${claimResult.signature}`,
        });
        console.log(`   ✅ Claimed fees: ${claimResult.solscanUrl}`);

        // Wait for balance to update
        await new Promise(r => setTimeout(r, 2000));

        // 3. Get balance AFTER claiming - difference = fees claimed
        const balanceAfter = await this.connection.getBalance(wallet.publicKey);
        feesClaimed = Math.max(0, (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL);
        
        // Only count as fees if there's an actual POSITIVE difference
        // (claim costs a small tx fee, so if balance went down, no fees were available)
        if (feesClaimed <= 0.0001) {
          feesClaimed = 0;
          console.log(`   No fees available (balance unchanged)`);
        } else {
          console.log(`   Balance after claim: ${(balanceAfter / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
          console.log(`   Fees claimed: ${feesClaimed.toFixed(4)} SOL`);
          
          // Sanity check: if fees are suspiciously high (>0.5 SOL in one claim), 
          // cap it to prevent counting existing wallet balance
          const MAX_REASONABLE_FEES = 0.5;
          if (feesClaimed > MAX_REASONABLE_FEES) {
            console.log(`   ⚠️ Warning: Fees unusually high (${feesClaimed.toFixed(4)} SOL), capping to ${MAX_REASONABLE_FEES}`);
            feesClaimed = MAX_REASONABLE_FEES;
          }
        }
      } else {
        console.log(`   No fees to claim`);
      }
      
      result.feesClaimed = feesClaimed;

      // 4. Check for special fee distribution - send portion to configured wallet
      const feeConfig = FEE_CONFIG[config.mint];
      if (feeConfig && feesClaimed > 0.001) {
        const sendAmount = feesClaimed * (1 - feeConfig.ratio);
        console.log(`   💸 Sending ${sendAmount.toFixed(4)} SOL (${((1 - feeConfig.ratio) * 100).toFixed(0)}%) to ${feeConfig.sendTo.slice(0,8)}...`);
        
        try {
          const sendLamports = Math.floor(sendAmount * LAMPORTS_PER_SOL);
          const transferIx = SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: new PublicKey(feeConfig.sendTo),
            lamports: sendLamports,
          });
          
          const tx = new Transaction().add(transferIx);
          const { blockhash } = await this.connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
          tx.feePayer = wallet.publicKey;
          tx.sign(wallet);
          
          const sig = await this.connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });
          await this.connection.confirmTransaction(sig, "confirmed");
          console.log(`   ✅ Sent ${sendAmount.toFixed(4)} SOL: https://solscan.io/tx/${sig}`);
          
          result.transactions.push({
            type: "fee_distribution",
            signature: sig,
            solscanUrl: `https://solscan.io/tx/${sig}`,
          });
          
          // Update feesClaimed to only the remaining portion for buyback
          feesClaimed = feesClaimed * feeConfig.ratio;
          console.log(`   Remaining for buyback: ${feesClaimed.toFixed(4)} SOL`);
        } catch (err: any) {
          console.error(`   ❌ Failed to send: ${err.message}`);
        }
      }

      // 5. Only proceed if we have fees for buyback
      const minFeesForBuyback = 0.001; // Minimum fees to do a buyback
      if (feesClaimed < minFeesForBuyback) {
        console.log(`   ⏭️ Skipping: No fees for buyback (${feesClaimed.toFixed(4)} < ${minFeesForBuyback})`);
        result.success = true;
        return result;
      }

      // 6. Use ONLY the remaining claimed fees for buyback (not entire wallet)
      // Reserve a bit for transaction fees
      const txFeeReserve = 0.0005;
      const buybackAmount = Math.max(0, feesClaimed - txFeeReserve);

      if (buybackAmount < minFeesForBuyback) {
        console.log(`   ⏭️ Skipping: Fees too small after tx reserve`);
        result.success = true;
        return result;
      }

      // 6. If GRADUATED: 50% buyback, 50% LP
      // If BONDING: 100% buyback
      if (graduated && poolKey) {
        const halfFees = buybackAmount / 2;
        
        // 50% Buyback
        console.log(`   [GRADUATED] Buying back with ${halfFees.toFixed(4)} SOL (50%)...`);
        const buyResult = await this.buyToken(wallet, config.mint, halfFees, true);
        if (buyResult.success && buyResult.signature) {
          result.buybackSol = halfFees;
          result.transactions.push({
            type: "buyback",
            signature: buyResult.signature,
            solscanUrl: `https://solscan.io/tx/${buyResult.signature}`,
          });
          console.log(`   ✅ Buyback: ${buyResult.solscanUrl}`);
        }

        // Wait for token balance to update
        await new Promise(r => setTimeout(r, 2000));

        // 50% LP - Add liquidity to PumpSwap pool + BURN LP tokens
        console.log(`   [GRADUATED] Adding ${halfFees.toFixed(4)} SOL to LP (50%) + BURN...`);
        const lpResult = await this.addLiquidity(wallet, config.mint, poolKey, halfFees);
        if (lpResult.success && lpResult.signature) {
          result.lpSol = halfFees;
          result.lpTokens = lpResult.lpTokens;
          result.transactions.push({
            type: "add_liquidity",
            signature: lpResult.signature,
            solscanUrl: `https://solscan.io/tx/${lpResult.signature}`,
          });
          
          // Record burn transaction if successful
          if (lpResult.burned && lpResult.burnSignature) {
            result.transactions.push({
              type: "burn_lp",
              signature: lpResult.burnSignature,
              solscanUrl: `https://solscan.io/tx/${lpResult.burnSignature}`,
            });
          }
        } else if (lpResult.error) {
          console.log(`   ⚠️ LP skipped: ${lpResult.error}`);
        }
        
      } else if (graduated && !poolKey) {
        // Graduated but no pool found yet - do 100% buyback
        console.log(`   [GRADUATED] Pool not found yet, doing 100% buyback...`);
        const buyResult = await this.buyToken(wallet, config.mint, buybackAmount, true);
        if (buyResult.success && buyResult.signature) {
          result.buybackSol = buybackAmount;
          result.transactions.push({
            type: "buyback",
            signature: buyResult.signature,
            solscanUrl: `https://solscan.io/tx/${buyResult.signature}`,
          });
          console.log(`   ✅ Buyback: ${buyResult.solscanUrl}`);
        }
        
      } else {
        // BONDING: 100% buyback
        console.log(`   [BONDING] Buying back with ${buybackAmount.toFixed(4)} SOL (100%)...`);
        const buyResult = await this.buyToken(wallet, config.mint, buybackAmount, false);
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
  async isGraduated(mint: string): Promise<{ graduated: boolean; poolKey: string | null }> {
    try {
      // Check DexScreener for PumpSwap pool
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await res.json() as any;
      
      if (data.pairs && data.pairs.length > 0) {
        const pumpPair = data.pairs.find((p: any) => 
          p.dexId === "pumpswap" || p.dexId === "raydium"
        );
        if (pumpPair) {
          console.log(`   Graduated: Pool found on ${pumpPair.dexId} (${pumpPair.pairAddress})`);
          return { graduated: true, poolKey: pumpPair.pairAddress };
        }
      }
      
      return { graduated: false, poolKey: null };
    } catch (err) {
      return { graduated: false, poolKey: null };
    }
  }

  /**
   * Add liquidity to PumpSwap pool and BURN LP tokens (permanent liquidity)
   */
  async addLiquidity(
    wallet: Keypair,
    tokenMint: string,
    poolKey: string,
    solAmount: number
  ): Promise<{ success: boolean; signature?: string; burnSignature?: string; solscanUrl?: string; lpTokens: number; burned: boolean; error?: string }> {
    try {
      console.log(`   Adding ${solAmount.toFixed(4)} SOL to LP...`);
      
      const onlineSdk = new OnlinePumpAmmSdk(this.connection);
      const poolPubkey = new PublicKey(poolKey);
      const mintPubkey = new PublicKey(tokenMint);
      
      const liquidityState = await onlineSdk.liquiditySolanaState(poolPubkey, wallet.publicKey);
      
      const solLamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
      const depositCalc = this.pumpAmmSdk.depositQuoteInput(liquidityState, solLamports, 10); // 10% slippage
      
      // Check if we have enough tokens
      const userAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey, false, TOKEN_2022);
      let tokenBalance = BigInt(0);
      try {
        const acc = await getAccount(this.connection, userAta, undefined, TOKEN_2022);
        tokenBalance = acc.amount;
      } catch {
        // No token account
      }
      
      const tokensNeeded = BigInt(depositCalc.base.toString());
      console.log(`   Tokens needed: ${Number(tokensNeeded) / 1e6}, have: ${Number(tokenBalance) / 1e6}`);
      
      if (tokenBalance < tokensNeeded) {
        console.log(`   ⚠️ Not enough tokens for LP (need ${Number(tokensNeeded) / 1e6}, have ${Number(tokenBalance) / 1e6})`);
        return { success: false, lpTokens: 0, burned: false, error: "Not enough tokens for LP" };
      }
      
      const depositIxs = await this.pumpAmmSdk.depositInstructionsInternal(
        liquidityState,
        depositCalc.lpToken,
        depositCalc.maxBase,
        depositCalc.maxQuote
      );
      
      const tx = new Transaction().add(...depositIxs);
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      
      const signature = await this.connection.sendRawTransaction(tx.serialize(), { 
        maxRetries: 3, 
        skipPreflight: true 
      });
      await this.connection.confirmTransaction(signature, "confirmed");
      
      console.log(`   ✅ LP added: https://solscan.io/tx/${signature}`);
      
      // BURN LP TOKENS - Make liquidity permanent
      let burnSignature: string | undefined;
      let burned = false;
      
      try {
        console.log(`   🔥 Burning LP tokens...`);
        
        // Get LP token mint from pool state
        const lpMint = liquidityState.pool.lpMint;
        console.log(`   LP Mint: ${lpMint.toBase58()}`);
        
        // Wait for LP tokens to arrive
        await new Promise(r => setTimeout(r, 3000));
        
        // Try both token programs - PumpSwap LP uses regular SPL Token, not Token-2022
        let lpBalance = BigInt(0);
        let lpAta: PublicKey;
        let tokenProgram = TOKEN_PROGRAM_ID;
        
        // Try regular SPL Token first
        try {
          lpAta = await getAssociatedTokenAddress(lpMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);
          const lpAcc = await getAccount(this.connection, lpAta, undefined, TOKEN_PROGRAM_ID);
          lpBalance = lpAcc.amount;
          console.log(`   LP balance (SPL): ${Number(lpBalance)}`);
        } catch {
          // Try Token-2022
          try {
            lpAta = await getAssociatedTokenAddress(lpMint, wallet.publicKey, false, TOKEN_2022);
            const lpAcc = await getAccount(this.connection, lpAta, undefined, TOKEN_2022);
            lpBalance = lpAcc.amount;
            tokenProgram = TOKEN_2022;
            console.log(`   LP balance (Token-2022): ${Number(lpBalance)}`);
          } catch {
            console.log(`   ⚠️ No LP token account found in either program`);
          }
        }
        
        if (lpBalance > 0) {
          // Burn all LP tokens
          const burnIx = createBurnInstruction(
            lpAta!,
            lpMint,
            wallet.publicKey,
            lpBalance,
            [],
            tokenProgram
          );
          
          const burnTx = new Transaction().add(burnIx);
          const { blockhash: burnBlockhash } = await this.connection.getLatestBlockhash();
          burnTx.recentBlockhash = burnBlockhash;
          burnTx.feePayer = wallet.publicKey;
          burnTx.sign(wallet);
          
          burnSignature = await this.connection.sendRawTransaction(burnTx.serialize(), {
            maxRetries: 3,
            skipPreflight: true
          });
          await this.connection.confirmTransaction(burnSignature, "confirmed");
          
          burned = true;
          console.log(`   🔥 LP BURNED: https://solscan.io/tx/${burnSignature}`);
          console.log(`   💀 ${Number(lpBalance)} LP tokens permanently destroyed`);
        } else {
          console.log(`   ⚠️ No LP tokens to burn (balance: 0)`);
        }
      } catch (burnErr: any) {
        console.log(`   ⚠️ Burn failed (LP still added): ${burnErr.message}`);
      }
      
      return {
        success: true,
        signature,
        burnSignature,
        solscanUrl: `https://solscan.io/tx/${signature}`,
        lpTokens: depositCalc.lpToken.toNumber(),
        burned,
      };
      
    } catch (error: any) {
      console.log(`   ❌ LP error: ${error.message}`);
      return { success: false, lpTokens: 0, burned: false, error: error.message };
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
        // Better error messages for common errors
        if (response.status === 400) {
          if (errorText.includes("not found") || errorText.includes("does not exist")) {
            return { success: false, error: "Token not found on pump.fun" };
          }
          if (errorText.includes("insufficient") || errorText.includes("balance")) {
            return { success: false, error: "Insufficient balance" };
          }
        }
        return { success: false, error: `${response.status}: ${errorText}` };
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

