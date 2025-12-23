import {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";

const JUPITER_API = "https://quote-api.jup.ag/v6";

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: any[];
}

interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount?: number;
  outputAmount?: number;
  error?: string;
}

/**
 * Get swap quote from Jupiter
 */
export async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: number, // in lamports or smallest unit
  slippageBps: number = 50 // 0.5%
): Promise<SwapQuote | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });

    const response = await fetch(`${JUPITER_API}/quote?${params}`);
    if (!response.ok) {
      console.error("Quote error:", await response.text());
      return null;
    }

    return await response.json() as SwapQuote;
  } catch (error) {
    console.error("Error getting quote:", error);
    return null;
  }
}

/**
 * Execute swap via Jupiter
 */
export async function swap(
  connection: Connection,
  payerKeypair: Keypair,
  inputMint: string,
  outputMint: string,
  amount: number, // in lamports for SOL, or smallest unit for tokens
  slippageBps: number = 50
): Promise<SwapResult> {
  try {
    console.log(`[Jupiter] Swapping ${amount} ${inputMint} -> ${outputMint}`);

    // 1. Get quote
    const quote = await getQuote(inputMint, outputMint, amount, slippageBps);
    if (!quote) {
      return { success: false, error: "Failed to get quote" };
    }

    console.log(`[Jupiter] Quote: ${quote.inAmount} -> ${quote.outAmount}`);
    console.log(`[Jupiter] Price impact: ${quote.priceImpactPct}%`);

    // 2. Get swap transaction
    const swapResponse = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: payerKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });

    if (!swapResponse.ok) {
      const error = await swapResponse.text();
      return { success: false, error: `Swap request failed: ${error}` };
    }

    const { swapTransaction } = await swapResponse.json() as { swapTransaction: string };

    // 3. Deserialize and sign transaction
    const txBuffer = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuffer);
    tx.sign([payerKeypair]);

    // 4. Send transaction
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // 5. Confirm
    const confirmation = await connection.confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    console.log(`[Jupiter] Swap successful: ${signature}`);

    return {
      success: true,
      signature,
      inputAmount: parseInt(quote.inAmount),
      outputAmount: parseInt(quote.outAmount),
    };
  } catch (error: any) {
    console.error("Error executing swap:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Swap SOL to token
 */
export async function swapSolToToken(
  connection: Connection,
  payerKeypair: Keypair,
  tokenMint: string,
  solAmount: number, // in SOL (e.g., 0.5)
  slippageBps: number = 50
): Promise<SwapResult> {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  return swap(
    connection,
    payerKeypair,
    NATIVE_MINT.toBase58(),
    tokenMint,
    lamports,
    slippageBps
  );
}

/**
 * Swap token to SOL
 */
export async function swapTokenToSol(
  connection: Connection,
  payerKeypair: Keypair,
  tokenMint: string,
  tokenAmount: number, // in smallest unit
  slippageBps: number = 50
): Promise<SwapResult> {
  return swap(
    connection,
    payerKeypair,
    tokenMint,
    NATIVE_MINT.toBase58(),
    tokenAmount,
    slippageBps
  );
}

/**
 * Get token price in SOL
 */
export async function getTokenPrice(tokenMint: string): Promise<number | null> {
  try {
    // Get quote for 1 SOL worth
    const quote = await getQuote(
      NATIVE_MINT.toBase58(),
      tokenMint,
      LAMPORTS_PER_SOL,
      50
    );
    
    if (!quote) return null;

    // Price = output amount / input amount
    const price = parseInt(quote.outAmount) / parseInt(quote.inAmount);
    return price;
  } catch (error) {
    console.error("Error getting token price:", error);
    return null;
  }
}



