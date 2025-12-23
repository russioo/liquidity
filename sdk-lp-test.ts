/**
 * Add Liquidity using official PumpSwap SDK
 */

import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { OnlinePumpAmmSdk, PumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function main() {
  const privateKey = process.env.PRIVATE_KEY!;
  const tokenMint = process.env.TOKEN_MINT!;
  
  if (!privateKey || !tokenMint) {
    console.error("Set PRIVATE_KEY and TOKEN_MINT");
    process.exit(1);
  }
  
  const connection = new Connection(RPC, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  const mint = new PublicKey(tokenMint);
  
  console.log("=== PUMPSWAP SDK TEST ===\n");
  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Token: ${tokenMint}`);
  
  // Check balances
  const solBalance = await connection.getBalance(wallet.publicKey);
  console.log(`\nSOL: ${solBalance / LAMPORTS_PER_SOL}`);
  
  // Check token balance
  const userAta = await getAssociatedTokenAddress(mint, wallet.publicKey, false, TOKEN_2022);
  let tokenBalance = BigInt(0);
  try {
    const acc = await getAccount(connection, userAta, undefined, TOKEN_2022);
    tokenBalance = acc.amount;
    console.log(`Tokens: ${Number(tokenBalance) / 1e6}`);
  } catch {
    console.log("No token account - need to buy first");
  }
  
  // Initialize SDKs
  console.log("\nInitializing PumpSwap SDKs...");
  const onlineSdk = new OnlinePumpAmmSdk(connection);
  const offlineSdk = new PumpAmmSdk();
  
  // Find pool
  console.log("Finding pool...");
  const fetch = require("node-fetch");
  
  // Try DexScreener first
  let poolKey: PublicKey | null = null;
  
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const dexData = await dexRes.json();
    
    if (dexData.pairs && dexData.pairs.length > 0) {
      const pumpPair = dexData.pairs.find((p: any) => p.dexId === "pumpswap") || dexData.pairs[0];
      poolKey = new PublicKey(pumpPair.pairAddress);
      console.log(`Pool (DexScreener): ${poolKey.toBase58()}`);
    }
  } catch (e) {
    console.log("DexScreener lookup failed");
  }
  
  // Try PumpFun API
  if (!poolKey) {
    try {
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
      if (pumpRes.ok) {
        const pumpData = await pumpRes.json();
        console.log(`Token status: ${pumpData.complete ? "Graduated" : "Bonding"}`);
        
        if (pumpData.complete && pumpData.raydium_pool) {
          poolKey = new PublicKey(pumpData.raydium_pool);
          console.log(`Pool (PumpFun): ${poolKey.toBase58()}`);
        } else if (!pumpData.complete) {
          console.log("\n⚠️ Token still on bonding curve!");
          console.log("LP can only be added after graduation.");
          console.log("You can still BUY on bonding curve to help it graduate.");
          
          // Do a buy on bonding curve instead
          console.log("\n--- BUYING ON BONDING CURVE ---");
          const buyAmount = 0.01; // SOL
          
          const buyRes = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              publicKey: wallet.publicKey.toBase58(),
              action: "buy",
              mint: tokenMint,
              amount: buyAmount,
              denominatedInSol: "true",
              slippage: 10,
              priorityFee: 0.0005,
              pool: "pump"
            }),
          });
          
          if (buyRes.ok) {
            const txData = await buyRes.arrayBuffer();
            const { VersionedTransaction } = await import("@solana/web3.js");
            const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
            tx.sign([wallet]);
            
            const sig = await connection.sendTransaction(tx, { maxRetries: 3 });
            console.log(`Buy TX: https://solscan.io/tx/${sig}`);
            await connection.confirmTransaction(sig, "confirmed");
            console.log("✅ Bought on bonding curve!");
          } else {
            console.log("Buy failed:", await buyRes.text());
          }
          
          process.exit(0);
        }
      }
    } catch (e: any) {
      console.log("PumpFun API error:", e.message);
    }
  }
  
  if (!poolKey) {
    console.error("No pool found - token may not be graduated yet");
    process.exit(1);
  }
  
  // Fetch pool data
  console.log("Fetching pool data...");
  const pool = await onlineSdk.fetchPool(poolKey);
  console.log(`Pool loaded: ${pool.baseMint.toBase58().slice(0, 8)}...`);
  
  // If no tokens, do a quick buy first
  if (tokenBalance < BigInt(10000000)) { // Less than 10 tokens
    console.log("\n--- BUYING TOKENS FIRST ---");
    const buyAmount = new BN(5000000); // 0.005 SOL
    
    const swapState = await onlineSdk.swapSolanaState(poolKey, wallet.publicKey);
    const buyIxs = await offlineSdk.buyQuoteInput(swapState, buyAmount, 5); // 5% slippage
    
    const buyTx = new Transaction().add(...buyIxs);
    const { blockhash: buyBlockhash } = await connection.getLatestBlockhash();
    buyTx.recentBlockhash = buyBlockhash;
    buyTx.feePayer = wallet.publicKey;
    buyTx.sign(wallet);
    
    const buySig = await connection.sendRawTransaction(buyTx.serialize(), { maxRetries: 3 });
    console.log(`Buy TX: https://solscan.io/tx/${buySig}`);
    await connection.confirmTransaction(buySig, "confirmed");
    console.log("✅ Buy complete!");
    
    // Refresh token balance
    const acc = await getAccount(connection, userAta, undefined, TOKEN_2022);
    tokenBalance = acc.amount;
    console.log(`New token balance: ${Number(tokenBalance) / 1e6}`);
  }
  
  // Now deposit liquidity
  console.log("\n--- ADDING LIQUIDITY ---");
  
  // Get liquidity state
  const liquidityState = await onlineSdk.liquiditySolanaState(poolKey, wallet.publicKey);
  
  // Use depositQuoteInput - specify SOL amount, SDK calculates tokens needed
  const solToDeposit = new BN(3000000); // 0.003 SOL
  const depositCalc = offlineSdk.depositQuoteInput(liquidityState, solToDeposit, 5); // 5% slippage
  
  console.log(`Depositing:`);
  console.log(`  SOL: ${solToDeposit.toNumber() / LAMPORTS_PER_SOL}`);
  console.log(`  Tokens needed: ${depositCalc.base.toNumber() / 1e6}`);
  console.log(`  LP tokens: ${depositCalc.lpToken.toNumber()}`);
  
  // Build deposit instructions
  const depositIxs = await offlineSdk.depositInstructionsInternal(
    liquidityState,
    depositCalc.lpToken,
    depositCalc.maxBase,
    depositCalc.maxQuote
  );
  
  console.log(`\nBuilding transaction with ${depositIxs.length} instructions...`);
  
  const tx = new Transaction().add(...depositIxs);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  
  tx.sign(wallet);
  
  console.log("Sending transaction...");
  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      maxRetries: 3,
      skipPreflight: true,
    });
    
    console.log(`TX: https://solscan.io/tx/${sig}`);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("✅ LIQUIDITY ADDED SUCCESSFULLY!");
  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.logs) {
      console.log("\nLogs:");
      error.logs.slice(-10).forEach((log: string) => console.log(log));
    }
  }
}

main().catch(console.error);
