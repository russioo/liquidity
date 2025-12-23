/**
 * LIQUIDIFY Engine - Backend Service
 * 
 * Integrates with the website to manage token liquidity automation
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { OnlinePumpSdk, PumpSdk } from "@pump-fun/pump-sdk";
import { OnlinePumpAmmSdk, PumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const WSOL = "So11111111111111111111111111111111111111112";
const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

interface TokenConfig {
  mint: string;
  lpWalletPrivate: string;
}

interface CycleResult {
  success: boolean;
  phase: "bonding" | "graduated";
  feesClaimed: number;
  buybackSol: number;
  buybackTokens: number;
  lpSol: number;
  lpTokens: number;
  transactions: {
    type: string;
    signature: string;
    solscanUrl: string;
  }[];
  error?: string;
}

export class LiquidityEngine {
  private connection: Connection;
  private pumpSdk: PumpSdk;
  private pumpAmmSdk: PumpAmmSdk;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.pumpSdk = new PumpSdk();
    this.pumpAmmSdk = new PumpAmmSdk();
  }

  // Check if token is graduated (no longer on bonding curve)
  async checkGraduation(tokenMint: string): Promise<{ graduated: boolean; poolKey: string | null }> {
    try {
      // Check Pumpfun API first
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
      if (pumpRes.ok) {
        const pumpData = await pumpRes.json() as any;
        console.log(`   Pumpfun data: complete=${pumpData.complete}, king_of_the_hill=${pumpData.king_of_the_hill_timestamp}`);
        
        // complete=true means it graduated, complete=false means still bonding
        if (pumpData.complete === false) {
          console.log(`   Token still on bonding curve`);
          return { graduated: false, poolKey: null };
        }
        
        // If complete=true, find the pool
        if (pumpData.complete === true) {
          // Check DexScreener for PumpSwap pool address
          const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
          if (dexRes.ok) {
            const dexData = await dexRes.json() as any;
            if (dexData.pairs && dexData.pairs.length > 0) {
              const pumpPair = dexData.pairs.find((p: any) => p.dexId === "pumpswap") || dexData.pairs[0];
              console.log(`   Token graduated, pool: ${pumpPair.pairAddress}`);
              return { graduated: true, poolKey: pumpPair.pairAddress };
            }
          }
          console.log(`   Token graduated but no pool found yet`);
          return { graduated: true, poolKey: null };
        }
      }
      
      // Fallback: assume bonding if API fails
      console.log(`   Could not determine status, assuming bonding`);
      return { graduated: false, poolKey: null };
    } catch (err: any) {
      console.error(`   Error checking graduation:`, err.message);
      return { graduated: false, poolKey: null };
    }
  }

  // Check and get SOL balance for operations
  async getAvailableSol(wallet: Keypair): Promise<number> {
    try {
      const balance = await this.connection.getBalance(wallet.publicKey);
      const solAmount = balance / LAMPORTS_PER_SOL;
      console.log(`   Bot wallet balance: ${solAmount.toFixed(4)} SOL`);
      return solAmount;
    } catch {
      return 0;
    }
  }

  // Try to claim creator fees (if this wallet is the creator)
  async claimFees(wallet: Keypair): Promise<{ amount: number; signature?: string }> {
    try {
      const onlineSdk = new OnlinePumpSdk(this.connection);
      
      // Check if there are fees to claim
      const balance = await onlineSdk.getCreatorVaultBalanceBothPrograms(wallet.publicKey);
      const solAmount = balance.toNumber() / LAMPORTS_PER_SOL;
      
      if (solAmount < 0.0001) {
        return { amount: 0 };
      }
      
      console.log(`   Creator fees available: ${solAmount.toFixed(4)} SOL`);
      
      const claimIxs = await onlineSdk.collectCoinCreatorFeeInstructions(wallet.publicKey);
      if (claimIxs.length === 0) return { amount: 0 };
      
      const tx = new Transaction().add(...claimIxs);
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      
      const sig = await this.connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });
      await this.connection.confirmTransaction(sig, "confirmed");
      
      console.log(`   ✅ Claimed ${solAmount.toFixed(4)} SOL: https://solscan.io/tx/${sig}`);
      return { amount: solAmount, signature: sig };
    } catch (err: any) {
      // This is expected if wallet is not the creator
      return { amount: 0 };
    }
  }

  // Buy on bonding curve
  async buyBonding(wallet: Keypair, tokenMint: PublicKey, solAmount: number): Promise<{ signature?: string; tokensOut: number }> {
    try {
      const onlineSdk = new OnlinePumpSdk(this.connection);
      const global = await onlineSdk.fetchGlobal();
      const buyState = await onlineSdk.fetchBuyState(tokenMint, wallet.publicKey, TOKEN_2022);
      
      const lamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
      
      const buyIxs = await this.pumpSdk.buyInstructions({
        global,
        bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
        bondingCurve: buyState.bondingCurve,
        associatedUserAccountInfo: buyState.associatedUserAccountInfo,
        mint: tokenMint,
        user: wallet.publicKey,
        amount: new BN(0),
        solAmount: lamports,
        slippage: 15,
        tokenProgram: TOKEN_2022,
      });
      
      const tx = new Transaction().add(...buyIxs);
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      
      const sig = await this.connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });
      await this.connection.confirmTransaction(sig, "confirmed");
      
      const userAta = await getAssociatedTokenAddress(tokenMint, wallet.publicKey, false, TOKEN_2022);
      try {
        const acc = await getAccount(this.connection, userAta, undefined, TOKEN_2022);
        return { signature: sig, tokensOut: Number(acc.amount) / 1e6 };
      } catch {
        return { signature: sig, tokensOut: 0 };
      }
    } catch (err: any) {
      console.error("Buy bonding error:", err.message);
      return { tokensOut: 0 };
    }
  }

  // Buy via Jupiter (graduated)
  async buyJupiter(wallet: Keypair, tokenMint: string, solAmount: number): Promise<{ signature?: string; tokensOut: number }> {
    try {
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      
      const quoteRes = await fetch(`${JUPITER_API}/quote?inputMint=${WSOL}&outputMint=${tokenMint}&amount=${lamports}&slippageBps=300`);
      if (!quoteRes.ok) return { tokensOut: 0 };
      
      const quote = await quoteRes.json() as any;
      
      const swapRes = await fetch(`${JUPITER_API}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toBase58(),
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: "high" } },
        }),
      });
      
      if (!swapRes.ok) return { tokensOut: 0 };
      
      const swapData = await swapRes.json() as any;
      const txBuf = Buffer.from(swapData.swapTransaction, "base64");
      const tx = VersionedTransaction.deserialize(txBuf);
      tx.sign([wallet]);
      
      const sig = await this.connection.sendTransaction(tx, { maxRetries: 3 });
      await this.connection.confirmTransaction(sig, "confirmed");
      
      return { signature: sig, tokensOut: Number(quote.outAmount) / 1e6 };
    } catch (err: any) {
      console.error("Buy Jupiter error:", err.message);
      return { tokensOut: 0 };
    }
  }

  // Add liquidity
  async addLiquidity(wallet: Keypair, tokenMint: PublicKey, poolKey: PublicKey, solAmount: number): Promise<{ signature?: string; lpTokens: number }> {
    try {
      const onlineSdk = new OnlinePumpAmmSdk(this.connection);
      const liquidityState = await onlineSdk.liquiditySolanaState(poolKey, wallet.publicKey);
      
      const solLamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
      const depositCalc = this.pumpAmmSdk.depositQuoteInput(liquidityState, solLamports, 5);
      
      const userAta = await getAssociatedTokenAddress(tokenMint, wallet.publicKey, false, TOKEN_2022);
      let tokenBalance = BigInt(0);
      try {
        const acc = await getAccount(this.connection, userAta, undefined, TOKEN_2022);
        tokenBalance = acc.amount;
      } catch {}
      
      if (tokenBalance < BigInt(depositCalc.base.toString())) {
        return { lpTokens: 0 };
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
      
      const sig = await this.connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });
      await this.connection.confirmTransaction(sig, "confirmed");
      
      return { signature: sig, lpTokens: depositCalc.lpToken.toNumber() };
    } catch (err: any) {
      console.error("Add LP error:", err.message);
      return { lpTokens: 0 };
    }
  }

  // Run a complete cycle for a token
  async runCycle(config: TokenConfig): Promise<CycleResult> {
    const transactions: CycleResult["transactions"] = [];
    const wallet = Keypair.fromSecretKey(bs58.decode(config.lpWalletPrivate));
    const tokenMint = new PublicKey(config.mint);
    
    try {
      // Check graduation status
      const { graduated, poolKey } = await this.checkGraduation(config.mint);
      
      // Try to claim fees (will only work if LP wallet is creator)
      const feeResult = await this.claimFees(wallet);
      if (feeResult.signature) {
        transactions.push({
          type: "claim_fees",
          signature: feeResult.signature,
          solscanUrl: `https://solscan.io/tx/${feeResult.signature}`,
        });
      }
      
      // Get available SOL in LP wallet
      const solBalance = await this.connection.getBalance(wallet.publicKey);
      const availableSol = (solBalance / LAMPORTS_PER_SOL) - 0.005; // Keep 0.005 for tx fees
      
      console.log(`   Available SOL: ${availableSol.toFixed(4)} SOL`);
      
      if (availableSol < 0.001) {
        return {
          success: false,
          phase: graduated ? "graduated" : "bonding",
          feesClaimed: feeResult.amount,
          buybackSol: 0,
          buybackTokens: 0,
          lpSol: 0,
          lpTokens: 0,
          transactions,
          error: `Need SOL in bot wallet (${wallet.publicKey.toBase58().slice(0,8)}...)`,
        };
      }
      
      const cycleAmount = availableSol; // Use ALL available SOL
      
      if (!graduated) {
        // BONDING PHASE - buyback only
        const buyResult = await this.buyBonding(wallet, tokenMint, cycleAmount);
        if (buyResult.signature) {
          transactions.push({
            type: "buyback",
            signature: buyResult.signature,
            solscanUrl: `https://solscan.io/tx/${buyResult.signature}`,
          });
        }
        
        return {
          success: true,
          phase: "bonding",
          feesClaimed: feeResult.amount,
          buybackSol: cycleAmount,
          buybackTokens: buyResult.tokensOut,
          lpSol: 0,
          lpTokens: 0,
          transactions,
        };
      } else {
        // GRADUATED - buyback + LP
        const buyResult = await this.buyJupiter(wallet, config.mint, cycleAmount);
        if (buyResult.signature) {
          transactions.push({
            type: "buyback",
            signature: buyResult.signature,
            solscanUrl: `https://solscan.io/tx/${buyResult.signature}`,
          });
        }
        
        // Wait a bit
        await new Promise(r => setTimeout(r, 2000));
        
        // Add LP
        const newBalance = await this.connection.getBalance(wallet.publicKey);
        const solForLp = Math.min((newBalance / LAMPORTS_PER_SOL) - 0.005, cycleAmount / 2);
        
        let lpResult: { lpTokens: number; signature?: string } = { lpTokens: 0 };
        if (solForLp > 0.001 && poolKey) {
          lpResult = await this.addLiquidity(wallet, tokenMint, new PublicKey(poolKey), solForLp);
          if (lpResult.signature) {
            transactions.push({
              type: "add_liquidity",
              signature: lpResult.signature,
              solscanUrl: `https://solscan.io/tx/${lpResult.signature}`,
            });
          }
        }
        
        return {
          success: true,
          phase: "graduated",
          feesClaimed: feeResult.amount,
          buybackSol: cycleAmount,
          buybackTokens: buyResult.tokensOut,
          lpSol: solForLp,
          lpTokens: lpResult.lpTokens,
          transactions,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        phase: "bonding",
        feesClaimed: 0,
        buybackSol: 0,
        buybackTokens: 0,
        lpSol: 0,
        lpTokens: 0,
        transactions,
        error: err.message,
      };
    }
  }
}

// Export singleton
let engine: LiquidityEngine | null = null;

export function getEngine(rpcUrl: string): LiquidityEngine {
  if (!engine) {
    engine = new LiquidityEngine(rpcUrl);
  }
  return engine;
}

