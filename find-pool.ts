/**
 * Find PumpSwap pool for a token
 */

import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";
const TOKEN_MINT = process.env.TOKEN_MINT || "FJvjng3A2BSYuHmQd1jQyDfz8Rvi7n9gcFYWHAFWpump";

const PUMPSWAP_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

async function main() {
  console.log("Finding pool for:", TOKEN_MINT);
  
  const connection = new Connection(RPC, "confirmed");
  const tokenMint = new PublicKey(TOKEN_MINT);
  
  // Method 1: Check if token exists on Jupiter
  console.log("\n1. Checking Jupiter...");
  try {
    const jupRes = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${WSOL.toBase58()}&outputMint=${TOKEN_MINT}&amount=1000000`);
    if (jupRes.ok) {
      const data = await jupRes.json();
      console.log("   ✅ Token tradeable on Jupiter");
      console.log("   Route:", data.routePlan?.[0]?.swapInfo?.ammKey || "N/A");
    } else {
      console.log("   ❌ Not on Jupiter:", await jupRes.text());
    }
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Method 2: Check DexScreener
  console.log("\n2. Checking DexScreener...");
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_MINT}`);
    if (dexRes.ok) {
      const data = await dexRes.json();
      if (data.pairs && data.pairs.length > 0) {
        console.log("   ✅ Found on DexScreener:");
        for (const pair of data.pairs.slice(0, 3)) {
          console.log(`      ${pair.dexId}: ${pair.pairAddress}`);
        }
      } else {
        console.log("   ❌ No pairs found");
      }
    }
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  // Method 3: Try different PDA seeds
  console.log("\n3. Trying PDA derivation...");
  
  const seedPatterns = [
    { name: "pool + mints", seeds: [Buffer.from("pool"), tokenMint.toBuffer(), WSOL.toBuffer()] },
    { name: "mints only", seeds: [tokenMint.toBuffer(), WSOL.toBuffer()] },
    { name: "reversed", seeds: [WSOL.toBuffer(), tokenMint.toBuffer()] },
  ];
  
  for (const pattern of seedPatterns) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(pattern.seeds, PUMPSWAP_PROGRAM);
      const info = await connection.getAccountInfo(pda);
      if (info) {
        console.log(`   ✅ Found with "${pattern.name}": ${pda.toBase58()}`);
        console.log(`      Owner: ${info.owner.toBase58()}`);
        console.log(`      Size: ${info.data.length} bytes`);
      } else {
        console.log(`   ❌ "${pattern.name}": ${pda.toBase58()} (not found)`);
      }
    } catch (e: any) {
      console.log(`   Error with "${pattern.name}":`, e.message);
    }
  }
  
  // Method 4: Search all PumpSwap pools
  console.log("\n4. Searching PumpSwap pools...");
  try {
    const accounts = await connection.getProgramAccounts(PUMPSWAP_PROGRAM, {
      dataSlice: { offset: 0, length: 100 },
    });
    console.log(`   Found ${accounts.length} PumpSwap accounts`);
    
    // Check first few for our token
    let found = false;
    for (const acc of accounts.slice(0, 100)) {
      const data = acc.account.data;
      // Look for token mint in the data
      for (let offset = 0; offset < data.length - 32; offset++) {
        try {
          const slice = data.slice(offset, offset + 32);
          const pk = new PublicKey(slice);
          if (pk.equals(tokenMint)) {
            console.log(`   ✅ FOUND! Pool: ${acc.pubkey.toBase58()} (token at offset ${offset})`);
            found = true;
            break;
          }
        } catch {}
      }
      if (found) break;
    }
    
    if (!found) {
      console.log("   ❌ Token not found in first 100 pools");
    }
  } catch (e: any) {
    console.log("   Error:", e.message);
  }
  
  console.log("\n✅ Done");
}

main().catch(console.error);

