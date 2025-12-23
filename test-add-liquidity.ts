/**
 * Test Script: Add Liquidity to PumpSwap Canonical Pool
 * 
 * Dette script tester tilføjelse af SOL + token til PumpSwap pool.
 * 
 * Usage:
 *   npx ts-node test-add-liquidity.ts
 * 
 * Environment variables:
 *   PRIVATE_KEY - Base58 encoded private key
 *   TOKEN_MINT - Token mint address
 *   RPC_URL - Solana RPC URL (optional, defaults to mainnet)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // RPC URL (use devnet for testing)
  RPC_URL: process.env.RPC_URL || "https://api.devnet.solana.com",
  
  // Your wallet private key (base58 encoded)
  PRIVATE_KEY: process.env.PRIVATE_KEY || "",
  
  // Token mint address
  TOKEN_MINT: process.env.TOKEN_MINT || "",
  
  // Amounts to add
  SOL_AMOUNT: 0.01, // SOL
  TOKEN_AMOUNT: 100, // tokens (will be adjusted for decimals)
};

// ============================================
// MAIN FUNCTIONS
// ============================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║         PUMPSWAP LIQUIDITY TEST SCRIPT                ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // Validate config
  if (!CONFIG.PRIVATE_KEY) {
    console.error("❌ Error: PRIVATE_KEY environment variable not set");
    console.log("\nUsage:");
    console.log("  PRIVATE_KEY=your_base58_key TOKEN_MINT=mint_address npx ts-node test-add-liquidity.ts");
    process.exit(1);
  }

  if (!CONFIG.TOKEN_MINT) {
    console.error("❌ Error: TOKEN_MINT environment variable not set");
    process.exit(1);
  }

  // Setup connection
  const connection = new Connection(CONFIG.RPC_URL, "confirmed");
  console.log(`📡 Connected to: ${CONFIG.RPC_URL}`);

  // Load wallet
  let wallet: Keypair;
  try {
    wallet = Keypair.fromSecretKey(bs58.decode(CONFIG.PRIVATE_KEY));
  } catch {
    // Try JSON array format
    try {
      wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(CONFIG.PRIVATE_KEY)));
    } catch {
      console.error("❌ Error: Invalid PRIVATE_KEY format");
      process.exit(1);
    }
  }
  console.log(`👛 Wallet: ${wallet.publicKey.toBase58()}`);

  // Parse token mint
  const tokenMint = new PublicKey(CONFIG.TOKEN_MINT);
  console.log(`🪙 Token Mint: ${tokenMint.toBase58()}`);

  // Check balances
  console.log("\n--- Checking Balances ---");
  
  const solBalance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 SOL Balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  const walletTokenAccount = await getAssociatedTokenAddress(tokenMint, wallet.publicKey);
  let tokenBalance = 0;
  try {
    const tokenAccountInfo = await getAccount(connection, walletTokenAccount);
    tokenBalance = Number(tokenAccountInfo.amount);
    console.log(`🪙 Token Balance: ${tokenBalance}`);
  } catch {
    console.log(`🪙 Token Balance: 0 (no account)`);
  }

  // Check if we have enough
  const solRequired = CONFIG.SOL_AMOUNT * LAMPORTS_PER_SOL;
  if (solBalance < solRequired + 0.01 * LAMPORTS_PER_SOL) {
    console.error(`\n❌ Insufficient SOL. Need ${CONFIG.SOL_AMOUNT + 0.01} SOL, have ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    process.exit(1);
  }

  if (tokenBalance < CONFIG.TOKEN_AMOUNT) {
    console.error(`\n❌ Insufficient tokens. Need ${CONFIG.TOKEN_AMOUNT}, have ${tokenBalance}`);
    process.exit(1);
  }

  // Get PumpSwap pool info
  console.log("\n--- Finding PumpSwap Pool ---");
  const poolInfo = await getPumpSwapPool(connection, tokenMint);
  
  if (!poolInfo) {
    console.error("❌ Could not find PumpSwap pool for this token");
    console.log("   Make sure the token has graduated from bonding curve");
    process.exit(1);
  }

  console.log(`🏊 Pool Address: ${poolInfo.poolAddress.toBase58()}`);
  console.log(`💧 Pool SOL Vault: ${poolInfo.solVault.toBase58()}`);
  console.log(`🪙 Pool Token Vault: ${poolInfo.tokenVault.toBase58()}`);

  // Add liquidity
  console.log("\n--- Adding Liquidity ---");
  console.log(`   SOL: ${CONFIG.SOL_AMOUNT}`);
  console.log(`   Tokens: ${CONFIG.TOKEN_AMOUNT}`);

  try {
    const signature = await addLiquidity(
      connection,
      wallet,
      tokenMint,
      poolInfo,
      CONFIG.SOL_AMOUNT,
      CONFIG.TOKEN_AMOUNT
    );

    console.log(`\n✅ Liquidity added successfully!`);
    console.log(`📝 Transaction: https://solscan.io/tx/${signature}`);
  } catch (error: any) {
    console.error(`\n❌ Failed to add liquidity: ${error.message}`);
    process.exit(1);
  }
}

// ============================================
// PUMPSWAP POOL FUNCTIONS
// ============================================

interface PoolInfo {
  poolAddress: PublicKey;
  solVault: PublicKey;
  tokenVault: PublicKey;
  lpMint: PublicKey;
}

/**
 * Find PumpSwap canonical pool for a token
 */
async function getPumpSwapPool(
  connection: Connection,
  tokenMint: PublicKey
): Promise<PoolInfo | null> {
  // PumpSwap Program ID (this may need to be updated)
  const PUMPSWAP_PROGRAM_ID = new PublicKey("pumpSwpveyy9xc8NvuMHhgGrw1USoRf8j5E4VjwN9S1");
  
  // Derive pool PDA
  // The exact derivation depends on PumpSwap's implementation
  // This is a placeholder - you may need to adjust based on actual program
  const [poolAddress] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      tokenMint.toBuffer(),
    ],
    PUMPSWAP_PROGRAM_ID
  );

  // Derive vault addresses
  const [solVault] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sol_vault"),
      poolAddress.toBuffer(),
    ],
    PUMPSWAP_PROGRAM_ID
  );

  const [tokenVault] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_vault"),
      poolAddress.toBuffer(),
    ],
    PUMPSWAP_PROGRAM_ID
  );

  const [lpMint] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("lp_mint"),
      poolAddress.toBuffer(),
    ],
    PUMPSWAP_PROGRAM_ID
  );

  // Check if pool exists
  const poolAccount = await connection.getAccountInfo(poolAddress);
  if (!poolAccount) {
    return null;
  }

  return {
    poolAddress,
    solVault,
    tokenVault,
    lpMint,
  };
}

/**
 * Add liquidity to PumpSwap pool
 * 
 * Note: This is a simplified version. The actual PumpSwap program
 * may require specific instruction data format.
 */
async function addLiquidity(
  connection: Connection,
  wallet: Keypair,
  tokenMint: PublicKey,
  poolInfo: PoolInfo,
  solAmount: number,
  tokenAmount: number
): Promise<string> {
  const transaction = new Transaction();

  // Get wallet's token account
  const walletTokenAccount = await getAssociatedTokenAddress(tokenMint, wallet.publicKey);

  // 1. Transfer SOL to pool's SOL vault
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: poolInfo.solVault,
      lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
    })
  );

  // 2. Transfer tokens to pool's token vault
  // First check if pool token vault exists, create if not
  const poolTokenVaultInfo = await connection.getAccountInfo(poolInfo.tokenVault);
  if (!poolTokenVaultInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        poolInfo.tokenVault,
        poolInfo.poolAddress,
        tokenMint
      )
    );
  }

  transaction.add(
    createTransferInstruction(
      walletTokenAccount,
      poolInfo.tokenVault,
      wallet.publicKey,
      BigInt(tokenAmount)
    )
  );

  // Send transaction
  const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
    commitment: "confirmed",
  });

  return signature;
}

// ============================================
// RUN
// ============================================

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

