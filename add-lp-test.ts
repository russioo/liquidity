/**
 * Test script for adding liquidity to PumpSwap
 * Based on successful TX: 5gLqanTmQYXhs3bY3HHRUnbjFcUEAmgf7snFLW2SRG7P4v5kTRMLo7YP91y6hv34urbZhA45H8VDcQ7dCjGrRiEY
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  createSyncNativeInstruction,
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";

// PumpSwap constants
const PUMPSWAP_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const PUMPSWAP_GLOBAL_CONFIG = new PublicKey("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw");
const PUMPSWAP_EVENT_AUTHORITY = new PublicKey("GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const tokenMintStr = process.env.TOKEN_MINT;
  
  if (!privateKey || !tokenMintStr) {
    console.error("Set PRIVATE_KEY and TOKEN_MINT env vars");
    process.exit(1);
  }
  
  const connection = new Connection(RPC, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  const tokenMint = new PublicKey(tokenMintStr);
  
  console.log("=== ADD LIQUIDITY TEST ===\n");
  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Token: ${tokenMint.toBase58()}`);
  
  // 1. Get pool info from DexScreener
  console.log("\n1. Getting pool info...");
  const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.toBase58()}`);
  const dexData = await dexRes.json();
  
  if (!dexData.pairs || dexData.pairs.length === 0) {
    console.error("No pool found on DexScreener");
    process.exit(1);
  }
  
  const pumpPair = dexData.pairs.find((p: any) => p.dexId === "pumpswap") || dexData.pairs[0];
  const poolAddress = new PublicKey(pumpPair.pairAddress);
  console.log(`Pool: ${poolAddress.toBase58()}`);
  
  // 2. Parse pool data
  console.log("\n2. Parsing pool data...");
  const poolInfo = await connection.getAccountInfo(poolAddress);
  if (!poolInfo) {
    console.error("Pool not found");
    process.exit(1);
  }
  
  const data = poolInfo.data;
  
  // Parse based on known offsets (verified from debug-pool.ts)
  const baseMint = new PublicKey(data.slice(43, 75));
  const quoteMint = new PublicKey(data.slice(75, 107));
  const lpMint = new PublicKey(data.slice(107, 139));
  const poolBaseVault = new PublicKey(data.slice(139, 171));
  const poolQuoteVault = new PublicKey(data.slice(171, 203));
  
  console.log(`Base Mint: ${baseMint.toBase58()}`);
  console.log(`Quote Mint: ${quoteMint.toBase58()}`);
  console.log(`LP Mint: ${lpMint.toBase58()}`);
  console.log(`Base Vault: ${poolBaseVault.toBase58()}`);
  console.log(`Quote Vault: ${poolQuoteVault.toBase58()}`);
  
  // 3. Check balances
  console.log("\n3. Checking balances...");
  
  const solBalance = await connection.getBalance(wallet.publicKey);
  console.log(`SOL: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)}`);
  
  // Get token balance - check BOTH Token programs
  const userBaseAta2022 = await getAssociatedTokenAddress(baseMint, wallet.publicKey, false, TOKEN_2022_PROGRAM);
  const userBaseAtaReg = await getAssociatedTokenAddress(baseMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);
  
  console.log(`Token-2022 ATA: ${userBaseAta2022.toBase58()}`);
  console.log(`Regular ATA: ${userBaseAtaReg.toBase58()}`);
  
  let tokenBalance = BigInt(0);
  let userBaseAta = userBaseAta2022;
  let useToken2022 = true;
  
  // Check Token-2022
  try {
    const acc = await getAccount(connection, userBaseAta2022, undefined, TOKEN_2022_PROGRAM);
    tokenBalance = acc.amount;
    console.log(`Token-2022 balance: ${Number(tokenBalance) / 1e6}`);
    userBaseAta = userBaseAta2022;
    useToken2022 = true;
  } catch {
    console.log("Token-2022 ATA: Not found or empty");
  }
  
  // Check regular Token program
  try {
    const acc = await getAccount(connection, userBaseAtaReg, undefined, TOKEN_PROGRAM_ID);
    console.log(`Regular balance: ${Number(acc.amount) / 1e6}`);
    if (acc.amount > tokenBalance) {
      tokenBalance = acc.amount;
      userBaseAta = userBaseAtaReg;
      useToken2022 = false;
    }
  } catch {
    console.log("Regular ATA: Not found or empty");
  }
  
  console.log(`\nUsing: ${useToken2022 ? "Token-2022" : "Regular Token"} (${userBaseAta.toBase58().slice(0, 8)}...)`);
  console.log(`Balance: ${Number(tokenBalance) / 1e6} tokens`)
  
  if (tokenBalance < BigInt(100000)) {
    console.error("Not enough tokens (need at least 0.1)");
    process.exit(1);
  }
  
  // 4. Get pool reserves to calculate correct ratio
  console.log(`\n4. Checking pool reserves...`);
  
  const baseVaultBalance = await connection.getTokenAccountBalance(poolBaseVault);
  const quoteVaultBalance = await connection.getTokenAccountBalance(poolQuoteVault);
  
  const poolTokens = BigInt(baseVaultBalance.value.amount);
  const poolSol = BigInt(quoteVaultBalance.value.amount);
  
  console.log(`   Pool tokens: ${Number(poolTokens) / 1e6}`);
  console.log(`   Pool SOL: ${Number(poolSol) / 1e9}`);
  
  // Calculate ratio: how much SOL per token
  const ratio = Number(poolSol) / Number(poolTokens);
  console.log(`   Ratio: ${ratio.toFixed(12)} SOL per token (raw)`);
  
  // Use 10% of our tokens
  const tokensForLp = tokenBalance / BigInt(10);
  // Calculate matching SOL based on pool ratio
  const solNeeded = Number(tokensForLp) * ratio;
  const solForLp = Math.min(solNeeded / 1e9, 0.015); // Cap at 0.015 SOL for safety
  
  console.log(`\n5. Adding liquidity...`);
  console.log(`   Tokens: ${Number(tokensForLp) / 1e6}`);
  console.log(`   SOL needed: ${(solNeeded / 1e9).toFixed(6)}`);
  console.log(`   SOL using: ${solForLp.toFixed(6)}`);
  
  // Recalculate tokens to match SOL we're actually using
  const actualTokens = BigInt(Math.floor((solForLp * 1e9) / ratio));
  console.log(`   Tokens adjusted: ${Number(actualTokens) / 1e6}`);
  
  // 5. Get ATAs
  const userQuoteAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID);
  const userLpAta = await getAssociatedTokenAddress(lpMint, wallet.publicKey, false, TOKEN_2022_PROGRAM);
  
  console.log(`\n   User Base ATA: ${userBaseAta.toBase58()}`);
  console.log(`   User Quote ATA: ${userQuoteAta.toBase58()}`);
  console.log(`   User LP ATA: ${userLpAta.toBase58()}`);
  
  // 6. Build transaction
  const instructions: TransactionInstruction[] = [];
  
  // Priority fee
  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500000 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })
  );
  
  // Create WSOL ATA
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      userQuoteAta,
      wallet.publicKey,
      NATIVE_MINT,
      TOKEN_PROGRAM_ID
    )
  );
  
  // Transfer SOL to WSOL ATA
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: userQuoteAta,
      lamports: Math.floor(solForLp * LAMPORTS_PER_SOL),
    })
  );
  
  // Sync native
  instructions.push(createSyncNativeInstruction(userQuoteAta, TOKEN_PROGRAM_ID));
  
  // Create LP ATA
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      userLpAta,
      wallet.publicKey,
      lpMint,
      TOKEN_2022_PROGRAM
    )
  );
  
  // Build deposit instruction
  // Discriminator: f223c68952e1f2b6
  const discriminator = Buffer.from([0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xb6]);
  
  const tokenAmountBn = new BN(actualTokens.toString());
  const solAmountBn = new BN(Math.floor(solForLp * LAMPORTS_PER_SOL).toString());
  const minLpOut = new BN(0);
  
  const depositData = Buffer.concat([
    discriminator,
    tokenAmountBn.toArrayLike(Buffer, "le", 8),
    solAmountBn.toArrayLike(Buffer, "le", 8),
    minLpOut.toArrayLike(Buffer, "le", 8),
  ]);
  
  console.log(`\n   Deposit data: ${depositData.toString("hex")}`);
  
  const depositIx = new TransactionInstruction({
    programId: PUMPSWAP_PROGRAM,
    keys: [
      { pubkey: poolAddress, isSigner: false, isWritable: true },         // Pool
      { pubkey: PUMPSWAP_GLOBAL_CONFIG, isSigner: false, isWritable: false }, // Global Config
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },     // User
      { pubkey: baseMint, isSigner: false, isWritable: false },           // Base Mint
      { pubkey: quoteMint, isSigner: false, isWritable: false },          // Quote Mint (WSOL)
      { pubkey: lpMint, isSigner: false, isWritable: true },              // LP Mint
      { pubkey: userBaseAta, isSigner: false, isWritable: true },         // User Base Token Account
      { pubkey: userQuoteAta, isSigner: false, isWritable: true },        // User Quote Token Account
      { pubkey: userLpAta, isSigner: false, isWritable: true },           // User LP Token Account
      { pubkey: poolBaseVault, isSigner: false, isWritable: true },       // Pool Base Vault
      { pubkey: poolQuoteVault, isSigner: false, isWritable: true },      // Pool Quote Vault
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },   // Token Program
      { pubkey: TOKEN_2022_PROGRAM, isSigner: false, isWritable: false }, // Token 2022 Program
      { pubkey: PUMPSWAP_EVENT_AUTHORITY, isSigner: false, isWritable: false }, // Event Authority
      { pubkey: PUMPSWAP_PROGRAM, isSigner: false, isWritable: false },   // Program
    ],
    data: depositData,
  });
  
  instructions.push(depositIx);
  
  // Close WSOL account to reclaim SOL
  instructions.push(
    createCloseAccountInstruction(
      userQuoteAta,
      wallet.publicKey,
      wallet.publicKey,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  
  // 7. Send transaction
  console.log("\n5. Sending transaction...");
  
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  
  const tx = new VersionedTransaction(message);
  tx.sign([wallet]);
  
  try {
    const sig = await connection.sendTransaction(tx, {
      maxRetries: 3,
      skipPreflight: false, // Enable preflight to see errors
    });
    
    console.log(`   TX: ${sig}`);
    console.log(`   https://solscan.io/tx/${sig}`);
    
    const confirmation = await connection.confirmTransaction(sig, "confirmed");
    
    if (confirmation.value.err) {
      console.error(`   ❌ Failed:`, confirmation.value.err);
    } else {
      console.log(`   ✅ Success!`);
    }
  } catch (error: any) {
    console.error(`   ❌ Error:`, error.message);
    
    // Try to get more details
    if (error.logs) {
      console.log("\n   Logs:");
      for (const log of error.logs) {
        console.log(`   ${log}`);
      }
    }
  }
}

main().catch(console.error);

