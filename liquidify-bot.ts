/**
 * LIQUIDIFY BOT - Self-Replenishing Liquidity
 * 
 * Uses OFFICIAL SDKs:
 * - @pump-fun/pump-sdk for bonding curve + fee claiming
 * - @pump-fun/pump-swap-sdk for LP operations
 * 
 * Flow:
 * 1. Claim creator fees
 * 2. Use ALL claimed fees for operations
 * 3. BONDING: Buybacks only
 * 4. GRADUATED: Buyback → Add to LP
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
import fetch from "node-fetch";

// Config
const RPC = process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const TOKEN_MINT = process.env.TOKEN_MINT!;
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL || "5");

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const WSOL = "So11111111111111111111111111111111111111112";
const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

interface Stats {
  cycles: number;
  totalFeesClaimed: number;
  totalBuyback: number;
  totalLP: number;
  tokensBought: bigint;
  lpTokensReceived: bigint;
  startTime: Date;
  phase: "bonding" | "graduated";
}

const stats: Stats = {
  cycles: 0,
  totalFeesClaimed: 0,
  totalBuyback: 0,
  totalLP: 0,
  tokensBought: BigInt(0),
  lpTokensReceived: BigInt(0),
  startTime: new Date(),
  phase: "bonding",
};

// ========== CHECK FEES AVAILABLE ==========
async function checkFees(connection: Connection, wallet: Keypair): Promise<number> {
  try {
    const onlineSdk = new OnlinePumpSdk(connection);
    const balance = await onlineSdk.getCreatorVaultBalanceBothPrograms(wallet.publicKey);
    return balance.toNumber() / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

// ========== CLAIM CREATOR FEES ==========
async function claimCreatorFees(
  connection: Connection,
  wallet: Keypair
): Promise<{ amount: number; signature?: string }> {
  try {
    const onlineSdk = new OnlinePumpSdk(connection);
    
    // Check balance first
    const balance = await onlineSdk.getCreatorVaultBalanceBothPrograms(wallet.publicKey);
    const solAmount = balance.toNumber() / LAMPORTS_PER_SOL;
    
    if (solAmount < 0.0001) {
      return { amount: 0 };
    }
    
    console.log(`   💸 Found ${solAmount.toFixed(6)} SOL in creator fees`);
    
    // Claim fees
    const claimIxs = await onlineSdk.collectCoinCreatorFeeInstructions(wallet.publicKey);
    
    if (claimIxs.length === 0) {
      return { amount: 0 };
    }
    
    const tx = new Transaction().add(...claimIxs);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);
    
    const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await connection.confirmTransaction(sig, "confirmed");
    
    console.log(`   ✅ Claimed ${solAmount.toFixed(6)} SOL`);
    console.log(`   🔗 https://solscan.io/tx/${sig}`);
    
    return { amount: solAmount, signature: sig };
    
  } catch (err: any) {
    console.log("   ⚠️ Fee claim error:", err.message);
    return { amount: 0 };
  }
}

// ========== BUYBACK ON BONDING CURVE ==========
async function buyTokenBonding(
  connection: Connection,
  wallet: Keypair,
  tokenMint: PublicKey,
  solAmount: number
): Promise<{ tx: string; tokensOut: bigint } | null> {
  try {
    console.log(`   💰 Buying for ${solAmount.toFixed(6)} SOL (Bonding Curve)...`);
    
    const onlineSdk = new OnlinePumpSdk(connection);
    const offlineSdk = new PumpSdk();
    
    const global = await onlineSdk.fetchGlobal();
    const buyState = await onlineSdk.fetchBuyState(tokenMint, wallet.publicKey, TOKEN_2022);
    
    const lamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
    
    const buyIxs = await offlineSdk.buyInstructions({
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
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);
    
    const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });
    await connection.confirmTransaction(sig, "confirmed");
    
    console.log(`   ✅ Bought!`);
    console.log(`   🔗 https://solscan.io/tx/${sig}`);
    
    const userAta = await getAssociatedTokenAddress(tokenMint, wallet.publicKey, false, TOKEN_2022);
    try {
      const acc = await getAccount(connection, userAta, undefined, TOKEN_2022);
      return { tx: sig, tokensOut: acc.amount };
    } catch {
      return { tx: sig, tokensOut: BigInt(0) };
    }
    
  } catch (err: any) {
    console.log("   ❌ Buy error:", err.message);
    return null;
  }
}

// ========== BUYBACK VIA JUPITER (graduated) ==========
async function buyTokenJupiter(
  connection: Connection,
  wallet: Keypair,
  tokenMint: string,
  solAmount: number
): Promise<{ tx: string; tokensOut: bigint } | null> {
  try {
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    console.log(`   💰 Buying for ${solAmount.toFixed(6)} SOL (Jupiter)...`);

    const quoteRes = await fetch(
      `${JUPITER_API}/quote?inputMint=${WSOL}&outputMint=${tokenMint}&amount=${lamports}&slippageBps=300`
    );
    
    if (!quoteRes.ok) {
      console.log("   Quote error:", await quoteRes.text());
      return null;
    }

    const quote = await quoteRes.json() as any;
    
    const swapRes = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: "high" },
        },
      }),
    });

    if (!swapRes.ok) {
      console.log("   Swap error:", await swapRes.text());
      return null;
    }

    const swapData = await swapRes.json() as any;
    const txBuf = Buffer.from(swapData.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([wallet]);

    const sig = await connection.sendTransaction(tx, { maxRetries: 3 });
    await connection.confirmTransaction(sig, "confirmed");

    console.log(`   ✅ Bought!`);
    console.log(`   🔗 https://solscan.io/tx/${sig}`);
    return { tx: sig, tokensOut: BigInt(quote.outAmount) };
  } catch (err: any) {
    console.log("   ❌ Buy error:", err.message);
    return null;
  }
}

// ========== ADD LIQUIDITY ==========
async function addLiquidity(
  connection: Connection,
  wallet: Keypair,
  tokenMint: PublicKey,
  poolKey: PublicKey,
  solAmount: number
): Promise<{ tx: string; lpTokens: bigint } | null> {
  try {
    console.log(`   🏊 Adding ${solAmount.toFixed(6)} SOL worth to LP...`);

    const onlineSdk = new OnlinePumpAmmSdk(connection);
    const offlineSdk = new PumpAmmSdk();

    const liquidityState = await onlineSdk.liquiditySolanaState(poolKey, wallet.publicKey);
    
    const solLamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
    const depositCalc = offlineSdk.depositQuoteInput(liquidityState, solLamports, 5);

    console.log(`   Tokens needed: ${depositCalc.base.toNumber() / 1e6}`);

    const userAta = await getAssociatedTokenAddress(tokenMint, wallet.publicKey, false, TOKEN_2022);
    let tokenBalance = BigInt(0);
    try {
      const acc = await getAccount(connection, userAta, undefined, TOKEN_2022);
      tokenBalance = acc.amount;
    } catch {}

    if (tokenBalance < BigInt(depositCalc.base.toString())) {
      console.log(`   ⚠️ Not enough tokens for LP`);
      return null;
    }

    const depositIxs = await offlineSdk.depositInstructionsInternal(
      liquidityState,
      depositCalc.lpToken,
      depositCalc.maxBase,
      depositCalc.maxQuote
    );

    const tx = new Transaction().add(...depositIxs);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);

    const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3, skipPreflight: true });
    await connection.confirmTransaction(sig, "confirmed");
    
    console.log(`   ✅ LP added!`);
    console.log(`   🔗 https://solscan.io/tx/${sig}`);

    return { tx: sig, lpTokens: BigInt(depositCalc.lpToken.toString()) };
  } catch (err: any) {
    console.log("   ❌ LP error:", err.message);
    return null;
  }
}

// ========== FIND POOL ==========
async function findPool(tokenMint: string): Promise<PublicKey | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const data = await res.json() as any;
    
    if (data.pairs && data.pairs.length > 0) {
      const pumpPair = data.pairs.find((p: any) => p.dexId === "pumpswap") || data.pairs[0];
      return new PublicKey(pumpPair.pairAddress);
    }
  } catch {}
  return null;
}

// ========== CHECK IF GRADUATED ==========
async function checkGraduation(tokenMint: string): Promise<{ graduated: boolean; poolKey: PublicKey | null }> {
  const poolKey = await findPool(tokenMint);
  return { graduated: poolKey !== null, poolKey };
}

// ========== MAIN CYCLE ==========
async function runCycle(connection: Connection, wallet: Keypair, tokenMint: PublicKey) {
  stats.cycles++;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🔄 CYCLE #${stats.cycles} - ${new Date().toLocaleTimeString()}`);
  console.log(`${"═".repeat(60)}`);

  // Check if graduated
  const { graduated, poolKey } = await checkGraduation(tokenMint.toBase58());
  stats.phase = graduated ? "graduated" : "bonding";
  console.log(`📊 Phase: ${stats.phase.toUpperCase()}`);

  // STEP 1: Claim fees
  console.log(`\n--- STEP 1: CLAIM FEES ---`);
  const feesBeforeClaim = await checkFees(connection, wallet);
  console.log(`   Fees available: ${feesBeforeClaim.toFixed(6)} SOL`);
  
  const claimResult = await claimCreatorFees(connection, wallet);
  stats.totalFeesClaimed += claimResult.amount;

  // Wait for claim to settle
  if (claimResult.signature) {
    await new Promise(r => setTimeout(r, 2000));
  }

  // Check wallet balance (this is what we use for operations)
  const solBalance = await connection.getBalance(wallet.publicKey);
  const availableSol = (solBalance / LAMPORTS_PER_SOL) - 0.003; // Keep 0.003 for fees

  console.log(`\n💰 Wallet: ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`💰 Available for ops: ${availableSol.toFixed(6)} SOL`);

  if (availableSol < 0.0005) {
    console.log("⚠️ Not enough SOL - waiting for more fees");
    return;
  }

  if (!graduated) {
    // ========== BONDING PHASE ==========
    console.log(`\n--- STEP 2: BUYBACK (all available SOL) ---`);
    
    const buyResult = await buyTokenBonding(connection, wallet, tokenMint, availableSol);
    
    if (buyResult) {
      stats.totalBuyback += availableSol;
      stats.tokensBought += buyResult.tokensOut;
      console.log(`   Tokens: ${Number(buyResult.tokensOut) / 1e6}`);
    }
    
    console.log(`\n💡 Waiting for graduation (~$69k MC)`);
    
  } else {
    // ========== GRADUATED PHASE ==========
    console.log(`\n--- STEP 2: BUYBACK (all SOL) ---`);
    
    const buyResult = await buyTokenJupiter(connection, wallet, tokenMint.toBase58(), availableSol);
    
    if (buyResult) {
      stats.totalBuyback += availableSol;
      stats.tokensBought += buyResult.tokensOut;
      console.log(`   Tokens: ${Number(buyResult.tokensOut) / 1e6}`);
    }

    await new Promise(r => setTimeout(r, 2000));

    // STEP 3: Add remaining SOL + tokens to LP
    console.log(`\n--- STEP 3: ADD TO LP ---`);
    
    const newBalance = await connection.getBalance(wallet.publicKey);
    const solForLp = (newBalance / LAMPORTS_PER_SOL) - 0.003;
    
    if (solForLp > 0.0005 && poolKey) {
      const lpResult = await addLiquidity(connection, wallet, tokenMint, poolKey, solForLp);
      
      if (lpResult) {
        stats.totalLP += solForLp;
        stats.lpTokensReceived += lpResult.lpTokens;
      }
    } else {
      console.log("   ⚠️ Not enough SOL left for LP");
    }
  }

  // Stats
  const runtime = Math.floor((Date.now() - stats.startTime.getTime()) / 60000);
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  Phase: ${stats.phase.toUpperCase().padEnd(12)} │ Runtime: ${runtime} min │ Cycles: ${stats.cycles}
╠───────────────────────────────────────────────────────────────╣
║  Fees Claimed: ${stats.totalFeesClaimed.toFixed(6)} SOL
║  Buyback:      ${stats.totalBuyback.toFixed(6)} SOL → ${(Number(stats.tokensBought) / 1e6).toFixed(0)} tokens
║  LP Added:     ${stats.totalLP.toFixed(6)} SOL → ${Number(stats.lpTokensReceived)} LP
╚═══════════════════════════════════════════════════════════════╝`);
}

// ========== MAIN ==========
async function main() {
  if (!PRIVATE_KEY || !TOKEN_MINT) {
    console.error("Set PRIVATE_KEY and TOKEN_MINT");
    process.exit(1);
  }

  const connection = new Connection(RPC, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
  const tokenMint = new PublicKey(TOKEN_MINT);

  const { graduated, poolKey } = await checkGraduation(TOKEN_MINT);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   ██╗     ██╗ ██████╗ ██╗   ██╗██╗██████╗ ██╗███████╗██╗   ██╗║
║   ██║     ██║██╔═══██╗██║   ██║██║██╔══██╗██║██╔════╝╚██╗ ██╔╝║
║   ██║     ██║██║   ██║██║   ██║██║██║  ██║██║█████╗   ╚████╔╝ ║
║   ██║     ██║██║▄▄ ██║██║   ██║██║██║  ██║██║██╔══╝    ╚██╔╝  ║
║   ███████╗██║╚██████╔╝╚██████╔╝██║██████╔╝██║██║        ██║   ║
║   ╚══════╝╚═╝ ╚══▀▀═╝  ╚═════╝ ╚═╝╚═════╝ ╚═╝╚═╝        ╚═╝   ║
╚═══════════════════════════════════════════════════════════════╝

👛 Wallet: ${wallet.publicKey.toBase58()}
🪙 Token:  ${TOKEN_MINT}
⏰ Every ${INTERVAL_MINUTES} min

📊 ${graduated ? `GRADUATED ✅ Pool: ${poolKey?.toBase58().slice(0,20)}...` : "BONDING 🔄"}

Flow:
  1. Claim creator fees
  2. Use ALL fees for buyback${graduated ? "\n  3. Add bought tokens + SOL to LP" : ""}
`);

  // Check initial fees
  const initialFees = await checkFees(connection, wallet);
  console.log(`💸 Current fees available: ${initialFees.toFixed(6)} SOL\n`);

  await runCycle(connection, wallet, tokenMint);

  console.log(`\n⏰ Next in ${INTERVAL_MINUTES} min... (Ctrl+C to stop)\n`);

  setInterval(async () => {
    try {
      await runCycle(connection, wallet, tokenMint);
      console.log(`\n⏰ Next in ${INTERVAL_MINUTES} min...`);
    } catch (err: any) {
      console.error("Error:", err.message);
    }
  }, INTERVAL_MINUTES * 60 * 1000);
}

main().catch(console.error);
