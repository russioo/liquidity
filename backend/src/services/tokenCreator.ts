/**
 * Token Creator Service
 * Uses @pump-fun/pump-sdk for creating tokens on Pumpfun
 */

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_FUN_TOKEN_2022_PROGRAM_ID } from "@pump-fun/pump-sdk";
import bs58 from "bs58";
import BN from "bn.js";

const RPC_URL = process.env.HELIUS_RPC_URL || 
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` ||
  "https://api.mainnet-beta.solana.com";

interface CreateTokenParams {
  name: string;
  symbol: string;
  description: string;
  imageBase64: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  creatorWallet: PublicKey;
  initialBuyLamports?: number;
}

interface CreateTokenResult {
  success: boolean;
  mint?: string;
  signature?: string;
  bondingCurve?: string;
  error?: string;
}

/**
 * Create a new token on Pumpfun using the SDK
 */
export async function createTokenWithSdk(
  params: CreateTokenParams
): Promise<CreateTokenResult> {
  const connection = new Connection(RPC_URL, "confirmed");
  const pumpSdk = new OnlinePumpSdk(connection);

  try {
    console.log(`[TokenCreator] Creating token: ${params.name} (${params.symbol})`);

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    console.log(`[TokenCreator] Mint: ${mintKeypair.publicKey.toBase58()}`);

    // Convert base64 image to Buffer
    let imageBuffer: Buffer;
    if (params.imageBase64.startsWith("data:")) {
      // Extract base64 from data URL
      const base64Data = params.imageBase64.split(",")[1];
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      imageBuffer = Buffer.from(params.imageBase64, "base64");
    }

    // Create metadata object
    const metadata = {
      name: params.name,
      symbol: params.symbol,
      description: params.description,
      twitter: params.twitter,
      telegram: params.telegram,
      website: params.website,
      image: new Blob([imageBuffer], { type: "image/png" }),
    };

    // Upload metadata to IPFS via Pumpfun
    console.log("[TokenCreator] Uploading metadata to IPFS...");
    const metadataUri = await uploadMetadataToPumpfun(metadata);
    
    if (!metadataUri) {
      // Try alternative: use Pinata or return error
      console.error("[TokenCreator] Failed to upload metadata");
      return { success: false, error: "Failed to upload metadata to IPFS" };
    }

    console.log(`[TokenCreator] Metadata URI: ${metadataUri}`);

    // Get create instructions from SDK
    const global = await pumpSdk.fetchGlobal();
    
    // Create token instructions
    const createInstructions = await pumpSdk.createInstructions({
      global,
      creator: params.creatorWallet,
      mint: mintKeypair.publicKey,
      name: params.name,
      symbol: params.symbol,
      uri: metadataUri,
      tokenProgram: PUMP_FUN_TOKEN_2022_PROGRAM_ID,
    });

    // If initial buy is requested, add buy instructions
    let allInstructions = [...createInstructions];
    
    if (params.initialBuyLamports && params.initialBuyLamports > 0) {
      // Fetch bonding curve info (will be created by create instruction)
      const bondingCurve = await pumpSdk.fetchBondingCurve(mintKeypair.publicKey);
      const buyState = await pumpSdk.fetchBuyState(mintKeypair.publicKey, params.creatorWallet);
      
      const buyInstructions = await pumpSdk.buyInstructions({
        global,
        bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
        bondingCurve: buyState.bondingCurve,
        associatedUserAccountInfo: buyState.associatedUserAccountInfo,
        mint: mintKeypair.publicKey,
        user: params.creatorWallet,
        solAmount: new BN(params.initialBuyLamports),
        amount: new BN(0),
        slippage: new BN(500), // 5%
        tokenProgram: PUMP_FUN_TOKEN_2022_PROGRAM_ID,
      });
      
      allInstructions = [...allInstructions, ...buyInstructions];
    }

    // Build transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: params.creatorWallet,
      recentBlockhash: blockhash,
      instructions: allInstructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    
    // Return transaction for frontend to sign
    // The frontend has the creator's private key via wallet
    const serializedTx = Buffer.from(transaction.serialize()).toString("base64");

    return {
      success: true,
      mint: mintKeypair.publicKey.toBase58(),
      signature: serializedTx, // This is actually the serialized transaction
      bondingCurve: undefined, // Will be available after creation
    };

  } catch (error: any) {
    console.error("[TokenCreator] Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Upload metadata to Pumpfun IPFS
 */
async function uploadMetadataToPumpfun(metadata: {
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  image: Blob;
}): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("file", metadata.image, "token.png");
    formData.append("name", metadata.name);
    formData.append("symbol", metadata.symbol);
    formData.append("description", metadata.description);
    if (metadata.twitter) formData.append("twitter", metadata.twitter);
    if (metadata.telegram) formData.append("telegram", metadata.telegram);
    if (metadata.website) formData.append("website", metadata.website);
    formData.append("showName", "true");

    const response = await fetch("https://pumpportal.fun/api/ipfs", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      console.error("IPFS upload failed:", response.status, await response.text());
      return null;
    }

    const result = await response.json() as { metadataUri: string };
    return result.metadataUri;
  } catch (error) {
    console.error("Error uploading to IPFS:", error);
    return null;
  }
}

/**
 * Get transaction for Pumpfun token creation (to be signed by frontend)
 */
export async function getCreateTokenTransaction(params: {
  name: string;
  symbol: string;
  metadataUri: string;
  creatorWallet: string;
  initialBuySol?: number;
}): Promise<{
  success: boolean;
  transaction?: string;
  mint?: string;
  mintSecretKey?: string;
  error?: string;
}> {
  try {
    const mintKeypair = Keypair.generate();
    
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
        amount: params.initialBuySol || 0,
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Pumpfun API error:", errorText);
      return { success: false, error: `Pumpfun API error: ${errorText}` };
    }

    const txBytes = await response.arrayBuffer();
    const txBase64 = Buffer.from(txBytes).toString("base64");

    return {
      success: true,
      transaction: txBase64,
      mint: mintKeypair.publicKey.toBase58(),
      mintSecretKey: bs58.encode(mintKeypair.secretKey),
    };
  } catch (error: any) {
    console.error("Error getting create transaction:", error);
    return { success: false, error: error.message };
  }
}

