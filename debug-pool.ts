/**
 * Debug script to analyze PumpSwap pool data
 */

import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";

// Our test token pool
const POOL = "EuqWcVvd2UYazehf1XLWrxrW7v3t9KpFV5nU8za6433";

// Known working pool from the successful transaction (liquid token)
const WORKING_POOL = "7fPyJvq8LAhhkBwrscHLaqGEcfSqyJSEmEwu5NULpFUj";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  
  console.log("=== ANALYZING POOLS ===\n");
  
  for (const poolAddress of [POOL, WORKING_POOL]) {
    console.log(`\n--- Pool: ${poolAddress} ---`);
    
    const poolPubkey = new PublicKey(poolAddress);
    const accountInfo = await connection.getAccountInfo(poolPubkey);
    
    if (!accountInfo) {
      console.log("  NOT FOUND");
      continue;
    }
    
    const data = accountInfo.data;
    console.log(`  Size: ${data.length} bytes`);
    console.log(`  Owner: ${accountInfo.owner.toBase58()}`);
    
    // Print all 32-byte pubkeys found in the data
    console.log("\n  Pubkeys in data:");
    for (let offset = 8; offset < data.length - 31; offset++) {
      try {
        const slice = data.slice(offset, offset + 32);
        // Check if it looks like a valid pubkey (not all zeros)
        if (!slice.every(b => b === 0)) {
          const pk = new PublicKey(slice);
          // Only print if it's on a 32-byte boundary after offset 8
          if ((offset - 8) % 32 === 0 || offset === 43 || offset === 75) {
            console.log(`    Offset ${offset.toString().padStart(3)}: ${pk.toBase58()}`);
          }
        }
      } catch {}
    }
    
    // Known layout based on successful TX
    console.log("\n  Parsing known offsets:");
    const offsets = [
      { name: "base_mint", offset: 43 },
      { name: "quote_mint", offset: 75 },
      { name: "lp_mint", offset: 107 },
      { name: "base_vault", offset: 139 },
      { name: "quote_vault", offset: 171 },
    ];
    
    for (const { name, offset } of offsets) {
      if (offset + 32 <= data.length) {
        const pk = new PublicKey(data.slice(offset, offset + 32));
        console.log(`    ${name.padEnd(12)}: ${pk.toBase58()}`);
      }
    }
  }
  
  // From the successful TX, print the expected accounts
  console.log("\n\n=== SUCCESSFUL TX ACCOUNTS ===");
  console.log("From TX: 5gLqanTmQYXhs3bY3HHRUnbjFcUEAmgf7snFLW2SRG7P4v5kTRMLo7YP91y6hv34urbZhA45H8VDcQ7dCjGrRiEY");
  console.log(`
Pool:               7fPyJvq8LAhhkBwrscHLaqGEcfSqyJSEmEwu5NULpFUj
Global Config:      ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw
User:               F8LcFUwa9YPkfnWiL2obFyNNs869vz5tzMob6CTt9ta5
Base Mint:          5AzEfXDXnmSFwSQdkbDm6jUX2t4Z8iEPxDVbfKrkpump
Quote Mint:         So11111111111111111111111111111111111111112
LP Mint:            4kZcPmHPdT2UkKnRpgW7QZcqc3X5dC8tbKM741uHeBto
User Base ATA:      CRgSLpawFw69WVAijcQWGcci1cdeY1X1agwqn2JXnck8
User Quote ATA:     3fAy4StD7c5pp6gZZt2uXWJ4PN8fQiqGRCvUfQb5C89W
User LP ATA:        DSVQ6uT6iLe382hhdQWR4FoY8Z85sNn5H1yDpUR6zGuz
Pool Base Vault:    FjTQW6189zyNmsAg7bchqMNdPboqzQR9pYtHskKEHya4
Pool Quote Vault:   49B3uYQeTuaC4dqqtzvFqWfPqh9ZQwuZnSgGEVeJgsGR
Token Program:      TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
Token 2022 Program: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
Event Authority:    GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR
Program:            pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA
`);
}

main().catch(console.error);

