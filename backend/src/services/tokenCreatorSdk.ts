/**
 * Token Creator Service - Using Official @pump-fun/pump-sdk
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

interface CreateTokenResult {
  success: boolean;
  transaction?: string; // base64 serialized
  mint?: string;
  mintSecretKey?: string; // base58 encoded
  error?: string;
}

/**
 * Create a token using pumpportal.fun API
 * This is the same API that works in the FUEL bot
 */
export async function createTokenWithOfficialSdk(params: {
  name: string;
  symbol: string;
  metadataUri: string;
  creatorWallet: string;
  initialBuySol?: number;
}): Promise<CreateTokenResult> {
  try {
    console.log(`[TokenCreator] Creating token via pumpportal: ${params.name} (${params.symbol})`);
    console.log(`[TokenCreator] Metadata URI: ${params.metadataUri}`);

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    
    console.log(`[TokenCreator] Mint: ${mintKeypair.publicKey.toBase58()}`);
    console.log(`[TokenCreator] Creator: ${params.creatorWallet}`);

    // Use pumpportal.fun API (same as FUEL bot)
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: params.creatorWallet,
        action: "create",
        tokenMetadata: {
          name: params.name,
          symbol: params.symbol,
          uri: params.metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: params.initialBuySol || 0, // No initial buy by default
        slippage: 50, // 50% slippage for new tokens
        priorityFee: 0.001, // Higher priority
        pool: "pump",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TokenCreator] API error:", errorText);
      return { success: false, error: `API error: ${errorText}` };
    }

    // Get transaction bytes
    const txBytes = await response.arrayBuffer();
    const txBase64 = Buffer.from(txBytes).toString("base64");

    console.log(`[TokenCreator] Transaction received from pumpportal`);

    return {
      success: true,
      transaction: txBase64,
      mint: mintKeypair.publicKey.toBase58(),
      mintSecretKey: bs58.encode(mintKeypair.secretKey),
    };

  } catch (error: any) {
    console.error("[TokenCreator] Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

