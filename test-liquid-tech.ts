/**
 * $LIQUID Technology Test Script
 * 
 * Self-replenishing liquidity pool:
 * - 50% → SOL directly to LP
 * - 50% → Buyback tokens → Add to LP
 * 
 * Supports:
 * - Bonding curve tokens (PumpFun API)
 * - Graduated tokens (Jupiter API)
 * 
 * Usage:
 *   $env:PRIVATE_KEY="your_key"
 *   $env:TOKEN_MINT="token_mint"
 *   npm run test:liquid
 */

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  RPC_URL: process.env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca",
  PRIVATE_KEY: process.env.PRIVATE_KEY || "",
  TOKEN_MINT: process.env.TOKEN_MINT || "",
  
  // Test amount
  TOTAL_SOL_TO_USE: 0.005, // Total SOL to use in test
};

// API endpoints
const PUMPFUN_API = "https://pumpportal.fun/api";
const PUMPFUN_FRONTEND_API = "https://frontend-api.pump.fun";
const JUPITER_API = "https://lite-api.jup.ag/swap/v1"; // FUEL bot's working endpoint

// SOL mint (wrapped SOL)
const SOL_MINT = "So11111111111111111111111111111111111111112";

// ============================================
// MAIN
// ============================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║         $LIQUID TECHNOLOGY TEST                       ║");
  console.log("║   Self-Replenishing Liquidity Pool                    ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Validate
  if (!CONFIG.PRIVATE_KEY || !CONFIG.TOKEN_MINT) {
    console.error("❌ Set PRIVATE_KEY and TOKEN_MINT environment variables");
    process.exit(1);
  }

  const connection = new Connection(CONFIG.RPC_URL, "confirmed");
  console.log(`📡 RPC: Connected`);

  // Load wallet
  const wallet = Keypair.fromSecretKey(bs58.decode(CONFIG.PRIVATE_KEY));
  console.log(`👛 Wallet: ${wallet.publicKey.toBase58()}`);

  const tokenMint = new PublicKey(CONFIG.TOKEN_MINT);
  console.log(`🪙 Token: ${tokenMint.toBase58()}`);

  // Check balance
  const solBalance = await connection.getBalance(wallet.publicKey);
  console.log(`\n💰 SOL Balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (solBalance < CONFIG.TOTAL_SOL_TO_USE * LAMPORTS_PER_SOL + 0.002 * LAMPORTS_PER_SOL) {
    console.error(`❌ Need at least ${CONFIG.TOTAL_SOL_TO_USE + 0.002} SOL (including fees)`);
    process.exit(1);
  }

  // Check if token is graduated
  console.log(`\n--- Checking Token Status ---`);
  const tokenInfo = await getTokenInfo(tokenMint.toBase58());
  
  let isGraduated = true; // Default to graduated, try Jupiter
  
  if (tokenInfo) {
    isGraduated = tokenInfo.complete === true;
    console.log(`📊 Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`📈 Status: ${isGraduated ? "✅ GRADUATED (PumpSwap)" : "⏳ Bonding Curve"}`);
    if (tokenInfo.raydium_pool) {
      console.log(`🏊 Pool: ${tokenInfo.raydium_pool}`);
    }
  } else {
    console.log(`⚠️ Could not fetch from PumpFun API - assuming graduated`);
    console.log(`   Will try Jupiter for swap...`);
  }

  // Calculate amounts
  const halfSol = CONFIG.TOTAL_SOL_TO_USE / 2;
  
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║                    THE FLOW                           ║");
  console.log("╠═══════════════════════════════════════════════════════╣");
  console.log(`║  Total SOL: ${CONFIG.TOTAL_SOL_TO_USE} SOL`);
  console.log(`║  ├─ 50% (${halfSol} SOL) → Direct to LP`);
  console.log(`║  └─ 50% (${halfSol} SOL) → Buyback → Tokens to LP`);
  console.log(`║  Method: ${isGraduated ? "Jupiter (graduated)" : "PumpFun (bonding)"}`);
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Step 1: Buyback
  console.log("--- STEP 1: BUYBACK ---");
  console.log(`Buying tokens with ${halfSol} SOL...`);
  
  let buyResult;
  if (isGraduated) {
    // Use Jupiter for graduated tokens
    buyResult = await buyTokenViaJupiter(connection, wallet, tokenMint, halfSol);
  } else {
    // Use PumpFun for bonding curve
    buyResult = await buyTokenOnPump(connection, wallet, tokenMint, halfSol);
  }
  
  if (buyResult.success) {
    console.log(`✅ Buyback successful!`);
    console.log(`   TX: ${buyResult.signature}`);
    console.log(`   View: https://solscan.io/tx/${buyResult.signature}`);
  } else {
    console.log(`❌ Buyback failed: ${buyResult.error}`);
  }

  // Wait a bit for the transaction to settle
  await sleep(2000);

  // Check token balance after buyback
  const walletTokenAccount = await getAssociatedTokenAddress(tokenMint, wallet.publicKey);
  let tokenBalance = BigInt(0);
  try {
    const tokenAccountInfo = await getAccount(connection, walletTokenAccount);
    tokenBalance = tokenAccountInfo.amount;
    console.log(`\n🪙 Token Balance: ${tokenBalance.toString()}`);
  } catch {
    console.log(`\n🪙 Token Balance: 0 (no account yet)`);
  }

  // Step 2: Add to LP info
  console.log("\n--- STEP 2: ADD TO LIQUIDITY ---");
  if (isGraduated) {
    console.log(`ℹ️ Token is graduated - trading on PumpSwap/Raydium`);
    console.log(`   To add LP, use the pool directly or Raydium interface`);
    if (tokenInfo?.raydium_pool) {
      console.log(`   Pool: https://raydium.io/liquidity/?ammId=${tokenInfo.raydium_pool}`);
    }
  } else {
    console.log(`ℹ️ Token still on bonding curve`);
    console.log(`   LP addition available after graduation`);
  }

  // Summary
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║                    SUMMARY                            ║");
  console.log("╠═══════════════════════════════════════════════════════╣");
  console.log(`║  Token Status: ${isGraduated ? "Graduated ✅" : "Bonding ⏳"}`.padEnd(56) + "║");
  console.log(`║  Buyback: ${buyResult.success ? "Success ✅" : "Failed ❌"}`.padEnd(56) + "║");
  console.log(`║  Tokens Received: ${tokenBalance.toString()}`.padEnd(56) + "║");
  console.log("╚═══════════════════════════════════════════════════════╝");

  if (buyResult.success) {
    console.log("\n🎉 Buyback test successful!");
    console.log("   Next: Automate this every 5 minutes with fee claiming");
  }
}

// ============================================
// TOKEN INFO
// ============================================

interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  complete: boolean;
  raydium_pool?: string;
}

async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const response = await fetch(`${PUMPFUN_FRONTEND_API}/coins/${mint}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ============================================
// PUMPFUN BUY (bonding curve)
// ============================================

async function buyTokenOnPump(
  connection: Connection,
  wallet: Keypair,
  tokenMint: PublicKey,
  solAmount: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const response = await fetch(`${PUMPFUN_API}/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: "buy",
        mint: tokenMint.toBase58(),
        denominatedInSol: "true",
        amount: solAmount,
        slippage: 25,
        priorityFee: 0.0001,
        pool: "pump",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([wallet]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await connection.confirmTransaction(signature, "confirmed");
    return { success: true, signature };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// JUPITER BUY (graduated tokens)
// ============================================

async function buyTokenViaJupiter(
  connection: Connection,
  wallet: Keypair,
  tokenMint: PublicKey,
  solAmount: number
): Promise<{ success: boolean; signature?: string; tokensOut?: string; error?: string }> {
  try {
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    console.log(`   Using FUEL bot's Jupiter endpoint...`);

    // Step 1: Get quote from lite-api (FUEL bot's working endpoint)
    console.log(`   Getting quote...`);
    const quoteRes = await fetch(
      `${JUPITER_API}/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint.toBase58()}&amount=${lamports}&slippageBps=300`
    );

    if (!quoteRes.ok) {
      const errorText = await quoteRes.text();
      return { success: false, error: `Quote failed: ${errorText}` };
    }

    const quote = await quoteRes.json();
    console.log(`   Quote: ${lamports} lamports → ${quote.outAmount} tokens`);

    // Step 2: Get swap transaction
    console.log(`   Building transaction...`);
    const swapRes = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000,
            priorityLevel: "high",
          },
        },
      }),
    });

    if (!swapRes.ok) {
      const errorText = await swapRes.text();
      return { success: false, error: `Swap failed: ${errorText}` };
    }

    const swapData = await swapRes.json();

    if (!swapData.swapTransaction) {
      return { success: false, error: "No swap transaction returned" };
    }

    // Step 3: Sign and send
    console.log(`   Signing and sending...`);
    const txBuf = Buffer.from(swapData.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([wallet]);

    const signature = await connection.sendTransaction(tx, { maxRetries: 3 });
    
    console.log(`   Confirming...`);
    await connection.confirmTransaction(signature, "confirmed");

    return { 
      success: true, 
      signature,
      tokensOut: quote.outAmount,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// HELPERS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// RUN
// ============================================

main().catch(console.error);
