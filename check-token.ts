/**
 * Check token status using PumpSwap SDK
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { OnlinePumpAmmSdk, PumpAmmSdk } from "@pump-fun/pump-swap-sdk";

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";
const TOKEN_MINT = process.env.TOKEN_MINT || "2HVRLzKh4uDHLAaXAuW3zGF27KuEdFBSnULwRS21pump";

async function main() {
  console.log("=== TOKEN STATUS CHECK ===\n");
  console.log(`Token: ${TOKEN_MINT}\n`);

  const connection = new Connection(RPC, "confirmed");
  const onlineSdk = new OnlinePumpAmmSdk(connection);
  const offlineSdk = new PumpAmmSdk();
  const mint = new PublicKey(TOKEN_MINT);

  // Try to find pools for this token
  console.log("Searching for PumpSwap pools...");
  
  try {
    // The SDK might have a method to find pools
    // Let's check what methods are available
    console.log("OnlineSDK methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(onlineSdk)).slice(0, 10));
    
    // Try fetching pool by deriving the address
    // PumpSwap pools are typically derived from the base mint
    const PUMP_AMM_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
    const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
    
    // Try common pool derivation
    const [poolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        mint.toBuffer(),
        WSOL.toBuffer(),
      ],
      PUMP_AMM_PROGRAM
    );
    
    console.log(`Derived pool PDA: ${poolPda.toBase58()}`);
    
    // Check if pool exists
    const poolAccount = await connection.getAccountInfo(poolPda);
    
    if (poolAccount) {
      console.log("\n✅ POOL FOUND!");
      console.log(`Pool size: ${poolAccount.data.length} bytes`);
      
      // Decode pool data
      const pool = offlineSdk.decodePool(poolAccount);
      console.log("\nPool info:");
      console.log(`  Base mint: ${pool.baseMint.toBase58()}`);
      console.log(`  Quote mint: ${pool.quoteMint.toBase58()}`);
      console.log(`  LP mint: ${pool.lpMint.toBase58()}`);
    } else {
      console.log("\n❌ No pool found at derived PDA");
      console.log("Token may still be on bonding curve or pool derivation is different");
      
      // Try alternative: search via DexScreener
      console.log("\nTrying DexScreener...");
      const fetch = (await import("node-fetch")).default;
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_MINT}`);
      const data = await res.json() as any;
      
      if (data.pairs && data.pairs.length > 0) {
        console.log("\n✅ Found on DexScreener:");
        for (const pair of data.pairs) {
          console.log(`  DEX: ${pair.dexId}`);
          console.log(`  Pool: ${pair.pairAddress}`);
          console.log(`  Price: $${pair.priceUsd}`);
          console.log(`  Liquidity: $${pair.liquidity?.usd || 0}`);
          console.log("");
        }
      } else {
        console.log("❌ Not found on DexScreener either");
        console.log("\nToken is likely still on bonding curve.");
      }
    }
    
  } catch (err: any) {
    console.log("Error:", err.message);
  }
}

main().catch(console.error);

