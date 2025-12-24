import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";
const TOKEN = "FJvjng3A2BSYuHmQd1jQyDfz8Rvi7n9gcFYWHAFWpump";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  
  // From working TX (liquid token)
  const workingBaseVault = new PublicKey("FjTQW6189zyNmsAg7bchqMNdPboqzQR9pYtHskKEHya4");
  const workingQuoteVault = new PublicKey("49B3uYQeTuaC4dqqtzvFqWfPqh9ZQwuZnSgGEVeJgsGR");
  
  // From our parsing
  const ourBaseVault = new PublicKey("ksvxLU42dQWa27sqZUk124emzJMJPMus9VZNFvSf2XT");
  const ourQuoteVault = new PublicKey("4tyQB4Ea9HZTEp8G1SMF7yju5qDW5AgNRFJa2H6QLb64");
  
  console.log("=== VERIFYING VAULTS ===\n");
  
  // Check working vaults
  console.log("Working TX vaults (liquid token):");
  try {
    const baseInfo = await connection.getParsedAccountInfo(workingBaseVault);
    console.log(`  Base: ${workingBaseVault.toBase58().slice(0,12)}...`);
    console.log(`    Owner: ${(baseInfo.value?.owner as PublicKey)?.toBase58()}`);
    if (baseInfo.value && 'parsed' in baseInfo.value.data) {
      console.log(`    Mint: ${baseInfo.value.data.parsed.info.mint}`);
    }
  } catch (e) {
    console.log("  Error:", e);
  }
  
  try {
    const quoteInfo = await connection.getParsedAccountInfo(workingQuoteVault);
    console.log(`  Quote: ${workingQuoteVault.toBase58().slice(0,12)}...`);
    console.log(`    Owner: ${(quoteInfo.value?.owner as PublicKey)?.toBase58()}`);
    if (quoteInfo.value && 'parsed' in quoteInfo.value.data) {
      console.log(`    Mint: ${quoteInfo.value.data.parsed.info.mint}`);
    }
  } catch (e) {
    console.log("  Error:", e);
  }
  
  // Check our vaults
  console.log("\nOur parsed vaults (test token):");
  try {
    const baseInfo = await connection.getParsedAccountInfo(ourBaseVault);
    console.log(`  Base: ${ourBaseVault.toBase58().slice(0,12)}...`);
    console.log(`    Owner: ${(baseInfo.value?.owner as PublicKey)?.toBase58()}`);
    if (baseInfo.value && 'parsed' in baseInfo.value.data) {
      console.log(`    Mint: ${baseInfo.value.data.parsed.info.mint}`);
      console.log(`    Balance: ${baseInfo.value.data.parsed.info.tokenAmount.uiAmount}`);
    }
  } catch (e) {
    console.log("  Base vault error:", e);
  }
  
  try {
    const quoteInfo = await connection.getParsedAccountInfo(ourQuoteVault);
    console.log(`  Quote: ${ourQuoteVault.toBase58().slice(0,12)}...`);
    console.log(`    Owner: ${(quoteInfo.value?.owner as PublicKey)?.toBase58()}`);
    if (quoteInfo.value && 'parsed' in quoteInfo.value.data) {
      console.log(`    Mint: ${quoteInfo.value.data.parsed.info.mint}`);
      console.log(`    Balance: ${quoteInfo.value.data.parsed.info.tokenAmount.uiAmount}`);
    }
  } catch (e) {
    console.log("  Quote vault error:", e);
  }
  
  // Let's also dump the raw pool data to find correct vault offsets
  console.log("\n\n=== RAW POOL DATA ===");
  const pool = new PublicKey("EuqWcVvd2UYazehf1XLWrxrW7v3t9KpFV5nU8za6433");
  const poolInfo = await connection.getAccountInfo(pool);
  
  if (poolInfo) {
    const data = poolInfo.data;
    console.log(`Size: ${data.length}`);
    
    // Print all pubkeys at various offsets
    for (let offset = 40; offset <= 220; offset += 32) {
      const pk = new PublicKey(data.slice(offset, offset + 32));
      console.log(`Offset ${offset}: ${pk.toBase58()}`);
    }
    
    // Also check offset 43, 75, etc.
    console.log("\nNon-aligned offsets:");
    for (const offset of [43, 75, 107, 139, 171, 203]) {
      const pk = new PublicKey(data.slice(offset, offset + 32));
      console.log(`Offset ${offset}: ${pk.toBase58()}`);
    }
  }
}

main().catch(console.error);






