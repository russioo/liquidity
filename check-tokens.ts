import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://mainnet.helius-rpc.com/?api-key=79f04b6a-679c-420b-adc0-63e8109280ca";
const WALLET = "8Q2PYkXiqPwCQLs59nbjbDhuXnG6VpmhnXR4U7Yt7bbM";
const TOKEN = "FJvjng3A2BSYuHmQd1jQyDfz8Rvi7n9gcFYWHAFWpump";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const wallet = new PublicKey(WALLET);
  const tokenMint = new PublicKey(TOKEN);
  
  console.log("=== CHECKING TOKEN ACCOUNTS ===\n");
  console.log(`Wallet: ${wallet.toBase58()}`);
  console.log(`Token: ${tokenMint.toBase58()}\n`);
  
  // Get all token accounts for this wallet
  console.log("All token accounts:");
  
  const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });
  
  for (const acc of accounts.value) {
    const parsed = acc.account.data.parsed.info;
    console.log(`  ${parsed.mint.slice(0, 12)}... : ${parsed.tokenAmount.uiAmount} (${acc.pubkey.toBase58().slice(0, 8)}...)`);
  }
  
  // Try Token-2022
  console.log("\nToken-2022 accounts:");
  const accounts2022 = await connection.getParsedTokenAccountsByOwner(wallet, {
    programId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
  });
  
  for (const acc of accounts2022.value) {
    const parsed = acc.account.data.parsed.info;
    console.log(`  ${parsed.mint.slice(0, 12)}... : ${parsed.tokenAmount.uiAmount} (${acc.pubkey.toBase58().slice(0, 8)}...)`);
    
    if (parsed.mint === TOKEN) {
      console.log(`  ^^^ THIS IS OUR TOKEN!`);
    }
  }
  
  // Look for our specific token
  console.log(`\n\nLooking for ${TOKEN.slice(0, 12)}...:`);
  
  const tokenAccounts = await connection.getTokenAccountsByOwner(wallet, { mint: tokenMint });
  console.log(`Found ${tokenAccounts.value.length} account(s)`);
  
  for (const acc of tokenAccounts.value) {
    console.log(`  Address: ${acc.pubkey.toBase58()}`);
    console.log(`  Owner program: ${acc.account.owner.toBase58()}`);
  }
}

main().catch(console.error);






