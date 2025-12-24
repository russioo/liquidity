const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface Token {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  creator_wallet: string; // This is the dev wallet where all automation happens
  status: "bonding" | "graduating" | "live" | "failed";
  meteora_pool_address: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  total_fees_claimed: number;
  total_buyback: number;
  total_lp_added: number;
  created_at: string;
  graduated_at: string | null;
  last_feed_at: string | null;
}

export interface GlobalStats {
  totalTokens: number;
  liveTokens: number;
  totalFeesClaimed: number;
  totalBuyback: number;
  totalLpAdded: number;
}

export interface FeedHistory {
  id: string;
  fees_claimed: number;
  sol_added: number;
  tokens_added: number;
  created_at: string;
}

/**
 * Get all tokens
 */
export async function getTokens(params?: {
  status?: string;
  creator?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tokens: Token[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.creator) searchParams.set("creator", params.creator);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const response = await fetch(`${API_URL}/api/tokens?${searchParams}`);
  if (!response.ok) throw new Error("Failed to fetch tokens");
  return response.json();
}

/**
 * Get single token by ID
 */
export async function getToken(id: string): Promise<Token & { feed_history: FeedHistory[] }> {
  const response = await fetch(`${API_URL}/api/tokens/${id}`);
  if (!response.ok) throw new Error("Token not found");
  return response.json();
}

/**
 * Get token by mint address
 */
export async function getTokenByMint(mint: string): Promise<Token> {
  const response = await fetch(`${API_URL}/api/tokens/mint/${mint}`);
  if (!response.ok) throw new Error("Token not found");
  return response.json();
}

/**
 * Get global stats
 */
export async function getGlobalStats(): Promise<GlobalStats> {
  const response = await fetch(`${API_URL}/api/tokens/stats/global`);
  if (!response.ok) throw new Error("Failed to fetch stats");
  return response.json();
}

/**
 * Create a new token - returns transaction for user to sign
 */
export async function createToken(data: {
  name: string;
  symbol: string;
  description?: string;
  image?: string; // base64
  twitter?: string;
  telegram?: string;
  website?: string;
  creatorWallet: string;
  devPrivateKey?: string; // Private key for automation wallet
  initialBuySol?: number; // Initial buy amount in SOL
}): Promise<{ 
  success: boolean; 
  tokenId: string; 
  mint: string; 
  lpWallet: string;
  transaction: string; // base64 serialized transaction
  mintSecretKey: string; // base58 encoded mint secret key
}> {
  const response = await fetch(`${API_URL}/api/tokens/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create token");
  }

  return response.json();
}

/**
 * Import an existing Pumpfun token
 */
export async function importToken(data: {
  mint: string;
  creatorWallet: string;
}): Promise<{ success: boolean; tokenId: string; name: string; symbol: string }> {
  const response = await fetch(`${API_URL}/api/tokens/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to import token");
  }

  return response.json();
}

/**
 * Confirm token creation after Pumpfun launch
 */
export async function confirmToken(
  tokenId: string,
  data: {
    signature: string;
    bondingCurve?: string;
    associatedBondingCurve?: string;
  }
): Promise<{ success: boolean; mint: string }> {
  const response = await fetch(`${API_URL}/api/tokens/${tokenId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to confirm token");
  }

  return response.json();
}

/**
 * Get feed history for a token
 */
export async function getFeedHistory(tokenId: string, limit = 50): Promise<FeedHistory[]> {
  const response = await fetch(`${API_URL}/api/tokens/${tokenId}/history?limit=${limit}`);
  if (!response.ok) throw new Error("Failed to fetch history");
  return response.json();
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) throw new Error("API unavailable");
  return response.json();
}



