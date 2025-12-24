# PumpSwap SDK Integration Guide

How we use `@pump-fun/pump-swap-sdk` to add liquidity to graduated tokens on PumpSwap.

## Overview

When a token graduates from pump.fun's bonding curve (~$69k market cap), it automatically migrates to **PumpSwap** - pump.fun's native AMM. Our system detects this graduation and starts adding liquidity to the pool.

## Dependencies

```bash
npm install @pump-fun/pump-swap-sdk @solana/web3.js @solana/spl-token bn.js
```

## The Flow

```
1. Claim creator fees
2. Check if token graduated
3. If graduated:
   - 50% → Buyback tokens
   - 50% → Add to LP
4. If bonding:
   - 100% → Buyback tokens
```

## Code Breakdown

### 1. Initialize the SDK

```typescript
import { OnlinePumpAmmSdk, PumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import BN from "bn.js";

// Token-2022 program (pump.fun uses this)
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// Initialize connection and SDKs
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const pumpAmmSdk = new PumpAmmSdk();  // Offline SDK for calculations
```

### 2. Find the Pool Address

After graduation, we need to find the pool address. We use DexScreener API:

```typescript
async function findPoolAddress(tokenMint: string): Promise<string | null> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
  const data = await res.json();
  
  if (data.pairs && data.pairs.length > 0) {
    // Look for PumpSwap pool first, fallback to any pool
    const pumpPair = data.pairs.find((p: any) => p.dexId === "pumpswap");
    if (pumpPair) {
      return pumpPair.pairAddress;
    }
  }
  
  return null;
}
```

### 3. Get Liquidity State

Before adding liquidity, we need the current pool state:

```typescript
const onlineSdk = new OnlinePumpAmmSdk(connection);
const poolPubkey = new PublicKey(poolAddress);

// This fetches current pool reserves, LP token supply, etc.
const liquidityState = await onlineSdk.liquiditySolanaState(poolPubkey, wallet.publicKey);
```

### 4. Calculate Deposit Amounts

The SDK calculates how many tokens we need for a given SOL amount:

```typescript
const solAmount = 0.1; // SOL to add
const solLamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
const slippageBps = 10; // 10% slippage tolerance

// Calculate deposit amounts
const depositCalc = pumpAmmSdk.depositQuoteInput(liquidityState, solLamports, slippageBps);

console.log({
  lpTokensOut: depositCalc.lpToken.toString(),     // LP tokens you'll receive
  tokensNeeded: depositCalc.base.toString(),       // Tokens required
  maxTokens: depositCalc.maxBase.toString(),       // Max tokens (with slippage)
  solNeeded: depositCalc.quote.toString(),         // SOL required
  maxSol: depositCalc.maxQuote.toString(),         // Max SOL (with slippage)
});
```

### 5. Check Token Balance

Make sure you have enough tokens before depositing:

```typescript
const tokenMint = new PublicKey(tokenMintAddress);

// Get user's token account (Token-2022)
const userAta = await getAssociatedTokenAddress(
  tokenMint, 
  wallet.publicKey, 
  false, 
  TOKEN_2022
);

let tokenBalance = BigInt(0);
try {
  const acc = await getAccount(connection, userAta, undefined, TOKEN_2022);
  tokenBalance = acc.amount;
} catch {
  // Token account doesn't exist
}

const tokensNeeded = BigInt(depositCalc.base.toString());
if (tokenBalance < tokensNeeded) {
  console.log("Not enough tokens for LP deposit");
  return;
}
```

### 6. Build and Send the Transaction

```typescript
// Get deposit instructions
const depositIxs = await pumpAmmSdk.depositInstructionsInternal(
  liquidityState,
  depositCalc.lpToken,   // LP tokens to mint
  depositCalc.maxBase,   // Max tokens to deposit
  depositCalc.maxQuote   // Max SOL to deposit
);

// Build transaction
const tx = new Transaction().add(...depositIxs);
const { blockhash } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
tx.feePayer = wallet.publicKey;
tx.sign(wallet);

// Send transaction
const signature = await connection.sendRawTransaction(tx.serialize(), {
  maxRetries: 3,
  skipPreflight: true,
});

// Wait for confirmation
await connection.confirmTransaction(signature, "confirmed");

console.log(`LP added! https://solscan.io/tx/${signature}`);
```

## Complete Example

```typescript
import { OnlinePumpAmmSdk, PumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import BN from "bn.js";
import bs58 from "bs58";

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function addLiquidityToPumpSwap(
  connection: Connection,
  wallet: Keypair,
  tokenMint: string,
  poolAddress: string,
  solAmount: number
): Promise<string | null> {
  try {
    const onlineSdk = new OnlinePumpAmmSdk(connection);
    const pumpAmmSdk = new PumpAmmSdk();
    
    const poolPubkey = new PublicKey(poolAddress);
    const mintPubkey = new PublicKey(tokenMint);
    
    // 1. Get pool state
    const liquidityState = await onlineSdk.liquiditySolanaState(poolPubkey, wallet.publicKey);
    
    // 2. Calculate amounts
    const solLamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
    const depositCalc = pumpAmmSdk.depositQuoteInput(liquidityState, solLamports, 10);
    
    // 3. Check token balance
    const userAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey, false, TOKEN_2022);
    const acc = await getAccount(connection, userAta, undefined, TOKEN_2022);
    
    if (acc.amount < BigInt(depositCalc.base.toString())) {
      console.log("Not enough tokens");
      return null;
    }
    
    // 4. Build transaction
    const depositIxs = await pumpAmmSdk.depositInstructionsInternal(
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
    
    // 5. Send
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      maxRetries: 3,
      skipPreflight: true,
    });
    
    await connection.confirmTransaction(signature, "confirmed");
    
    return signature;
    
  } catch (error) {
    console.error("LP error:", error);
    return null;
  }
}

// Usage
const connection = new Connection("YOUR_RPC_URL");
const wallet = Keypair.fromSecretKey(bs58.decode("YOUR_PRIVATE_KEY"));

const signature = await addLiquidityToPumpSwap(
  connection,
  wallet,
  "TOKEN_MINT_ADDRESS",
  "POOL_ADDRESS",
  0.1 // SOL amount
);
```

## Key Points

1. **Token-2022**: pump.fun tokens use the Token-2022 program, not the legacy SPL Token program
2. **Pool Discovery**: Use DexScreener API to find pool addresses after graduation
3. **Slippage**: Always set reasonable slippage (5-15%) for volatile memecoins
4. **Balance Check**: Always verify you have enough tokens before attempting deposit
5. **Offline SDK**: Use `PumpAmmSdk` (offline) for calculations, `OnlinePumpAmmSdk` for on-chain data

## SDK Methods Reference

| Method | Description |
|--------|-------------|
| `liquiditySolanaState()` | Fetch current pool state from chain |
| `depositQuoteInput()` | Calculate token amounts for SOL input |
| `depositBaseInput()` | Calculate SOL amount for token input |
| `depositInstructionsInternal()` | Generate deposit instructions |
| `withdrawInstructions()` | Generate withdraw instructions |

## Links

- [PumpSwap SDK on npm](https://www.npmjs.com/package/@pump-fun/pump-swap-sdk)
- [pump.fun](https://pump.fun)
- [Solscan](https://solscan.io)

