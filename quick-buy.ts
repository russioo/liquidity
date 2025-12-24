/**
 * Quick buyback to get tokens
 */

import { Connection, Keypair, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

const fetch = require("node-fetch");

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";
const JUPITER_API = "https://lite-api.jup.ag/swap/v1";
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function main() {
  const privateKey = process.env.PRIVATE_KEY!;
  const tokenMint = process.env.TOKEN_MINT!;
  
  const connection = new Connection(RPC, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`SOL: ${balance / LAMPORTS_PER_SOL}`);
  
  // Buy with 0.02 SOL (keep rest for LP test)
  const buyAmount = 0.02;
  const lamports = Math.floor(buyAmount * LAMPORTS_PER_SOL);
  
  console.log(`\nBuying tokens with ${buyAmount} SOL...`);
  
  // Get quote
  const quoteRes = await fetch(
    `${JUPITER_API}/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${lamports}&slippageBps=500`
  );
  
  if (!quoteRes.ok) {
    console.error("Quote failed:", await quoteRes.text());
    return;
  }
  
  const quote = await quoteRes.json();
  console.log(`Quote: ${lamports} lamports → ${quote.outAmount} tokens`);
  
  // Get swap
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
    console.error("Swap failed:", await swapRes.text());
    return;
  }
  
  const swapData = await swapRes.json();
  
  // Sign and send
  const txBuf = Buffer.from(swapData.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([wallet]);
  
  console.log("Sending...");
  const sig = await connection.sendTransaction(tx, { maxRetries: 3, skipPreflight: true });
  console.log(`TX: https://solscan.io/tx/${sig}`);
  
  await connection.confirmTransaction(sig, "confirmed");
  console.log("✅ Done!");
  
  // Check new balance
  const newBalance = await connection.getBalance(wallet.publicKey);
  console.log(`\nNew SOL: ${newBalance / LAMPORTS_PER_SOL}`);
}

main().catch(console.error);






