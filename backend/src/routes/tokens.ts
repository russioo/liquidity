import { Router, Request, Response } from "express";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { supabase } from "../index.js";
import { getTokenInfo } from "../services/pumpfun.js";
import { createTokenWithOfficialSdk } from "../services/tokenCreatorSdk.js";

export const tokenRoutes = Router();

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

/**
 * GET /api/tokens - Get all tokens
 */
tokenRoutes.get("/", async (req: Request, res: Response) => {
  try {
    const { status, creator, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from("tokens")
      .select(`
        id,
        mint,
        name,
        symbol,
        description,
        image_url,
        creator_wallet,
        status,
        twitter,
        telegram,
        website,
        total_lp_fed,
        total_fees_claimed,
        total_volume,
        created_at,
        graduated_at,
        last_feed_at
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (creator) {
      query = query.eq("creator_wallet", creator);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Failed to fetch tokens" });
    }

    res.json({
      tokens: data || [],
      total: count,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error("Error fetching tokens:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tokens/stats/global - Get global stats
 * NOTE: Must be before /:id route to not be captured
 */
tokenRoutes.get("/stats/global", async (req: Request, res: Response) => {
  try {
    const { data: tokens, error } = await supabase
      .from("tokens")
      .select("total_lp_fed, total_fees_claimed, total_volume, status")
      .eq("is_active", true);

    if (error) {
      return res.status(500).json({ error: "Failed to fetch stats" });
    }

    const stats = {
      totalTokens: tokens?.length || 0,
      liveTokens: tokens?.filter((t) => t.status === "live").length || 0,
      totalLpFed: tokens?.reduce((sum, t) => sum + (t.total_lp_fed || 0), 0) || 0,
      totalFeesClaimed: tokens?.reduce((sum, t) => sum + (t.total_fees_claimed || 0), 0) || 0,
      totalVolume: tokens?.reduce((sum, t) => sum + (t.total_volume || 0), 0) || 0,
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tokens/:id - Get single token
 */
tokenRoutes.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("tokens")
      .select(`
        *,
        feed_history (
          id,
          fees_claimed,
          sol_added,
          tokens_added,
          created_at
        )
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Token not found" });
    }

    // Remove sensitive data
    const { bot_wallet_private, ...tokenData } = data;

    res.json(tokenData);
  } catch (error) {
    console.error("Error fetching token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tokens/mint/:mint - Get token by mint address
 */
tokenRoutes.get("/mint/:mint", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;

    const { data, error } = await supabase
      .from("tokens")
      .select("*")
      .eq("mint", mint)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Token not found" });
    }

    const { bot_wallet_private, ...tokenData } = data;
    res.json(tokenData);
  } catch (error) {
    console.error("Error fetching token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tokens/import - Import an existing Pumpfun token
 */
tokenRoutes.post("/import", async (req: Request, res: Response) => {
  try {
    const { mint, creatorWallet } = req.body;

    if (!mint || !creatorWallet) {
      return res.status(400).json({ error: "Missing mint or creatorWallet" });
    }

    console.log(`[API] Importing token: ${mint}`);

    // Check if already imported
    const { data: existing } = await supabase
      .from("tokens")
      .select("id")
      .eq("mint", mint)
      .single();

    if (existing) {
      return res.status(400).json({ error: "Token already imported" });
    }

    // Fetch token info from Pumpfun
    const pumpfunInfo = await getTokenInfo(mint);
    
    if (!pumpfunInfo) {
      return res.status(404).json({ error: "Token not found on Pumpfun. Make sure the mint address is correct." });
    }

    console.log(`[API] Found token: ${pumpfunInfo.name} (${pumpfunInfo.symbol})`);

    // Generate LP wallet for this token
    const lpWallet = Keypair.generate();
    console.log(`[API] Generated bot wallet: ${lpWallet.publicKey.toBase58()}`);

    // Determine status
    const status = pumpfunInfo.complete ? "graduating" : "bonding";

    // Insert into database
    const { data: tokenData, error: insertError } = await supabase
      .from("tokens")
      .insert({
        mint,
        name: pumpfunInfo.name,
        symbol: pumpfunInfo.symbol,
        description: pumpfunInfo.description || "",
        image_url: pumpfunInfo.image_uri || null,
        creator_wallet: creatorWallet,
        bot_wallet_public: lpWallet.publicKey.toBase58(),
        bot_wallet_private: bs58.encode(lpWallet.secretKey),
        status,
        pumpfun_bonding_curve: pumpfunInfo.bonding_curve,
        pumpfun_associated_bonding_curve: pumpfunInfo.associated_bonding_curve,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      return res.status(500).json({ error: "Failed to import token" });
    }

    console.log(`[API] Token imported successfully: ${tokenData.id}`);

    res.json({
      success: true,
      tokenId: tokenData.id,
      name: pumpfunInfo.name,
      symbol: pumpfunInfo.symbol,
      status,
      lpWallet: lpWallet.publicKey.toBase58(),
    });
  } catch (error: any) {
    console.error("Error importing token:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * POST /api/tokens/create - Create a new token on Pumpfun
 */
tokenRoutes.post("/create", async (req: Request, res: Response) => {
  try {
    const {
      name,
      symbol,
      description,
      image, // base64 encoded image
      twitter,
      telegram,
      website,
      creatorWallet,
      devPrivateKey, // Optional: user's dev wallet private key for automation
    } = req.body;

    // Validate required fields
    if (!name || !symbol || !creatorWallet) {
      return res.status(400).json({ 
        error: "Missing required fields: name, symbol, creatorWallet" 
      });
    }

    console.log(`[API] Creating token: ${name} (${symbol})`);

    // 1. Use provided dev wallet or generate new one
    let lpWallet: Keypair;
    if (devPrivateKey) {
      try {
        lpWallet = Keypair.fromSecretKey(bs58.decode(devPrivateKey));
        console.log(`[API] Using dev wallet: ${lpWallet.publicKey.toBase58()}`);
        
        // Verify that the private key matches the connected wallet
        if (lpWallet.publicKey.toBase58() !== creatorWallet) {
          console.error(`[API] Private key mismatch! Expected ${creatorWallet}, got ${lpWallet.publicKey.toBase58()}`);
          return res.status(400).json({ 
            error: "Private key does not match connected wallet. Make sure you paste the private key from your currently connected wallet." 
          });
        }
      } catch (e) {
        return res.status(400).json({ error: "Invalid private key format" });
      }
    } else {
      return res.status(400).json({ 
        error: "Private key required. Paste the private key of your connected wallet." 
      });
    }

    // 2. Upload image to Supabase Storage + metadata to IPFS
    let metadataUri = "";
    let imageUrl = "";
    
    if (image) {
      // Extract base64 from data URL
      let imageBase64 = image;
      let mimeType = "image/png";
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          imageBase64 = matches[2];
        } else {
          imageBase64 = image.split(",")[1];
        }
      }
      
      const imageBuffer = Buffer.from(imageBase64, "base64");
      const fileExt = mimeType.split("/")[1] || "png";
      const fileName = `${symbol.toLowerCase()}-${Date.now()}.${fileExt}`;
      
      // Upload to Supabase Storage
      console.log(`[API] Uploading image to Supabase Storage...`);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("token-images")
        .upload(fileName, imageBuffer, {
          contentType: mimeType,
          upsert: true,
        });
      
      if (uploadError) {
        console.warn(`[API] Supabase Storage upload failed:`, uploadError.message);
      } else {
        // Get public URL
        const { data: urlData } = supabase.storage
          .from("token-images")
          .getPublicUrl(fileName);
        
        imageUrl = urlData.publicUrl;
        console.log(`[API] Image uploaded to Supabase: ${imageUrl}`);
      }
      
      // Also upload to pump.fun IPFS for token creation
      console.log(`[API] Uploading metadata to IPFS...`);
      const formData = new FormData();
      formData.append("file", new Blob([imageBuffer], { type: mimeType }), "token.png");
      formData.append("name", name);
      formData.append("symbol", symbol);
      formData.append("description", description || "");
      if (twitter) formData.append("twitter", twitter);
      if (telegram) formData.append("telegram", telegram);
      if (website) formData.append("website", website);
      formData.append("showName", "true");

      try {
        // Try pump.fun's IPFS endpoint
        const ipfsResponse = await fetch("https://pump.fun/api/ipfs", {
          method: "POST",
          body: formData,
        });

        if (ipfsResponse.ok) {
          const ipfsResult = await ipfsResponse.json() as any;
          console.log(`[API] IPFS Response:`, JSON.stringify(ipfsResult));
          
          metadataUri = ipfsResult.metadataUri;
          
          // If Supabase upload failed, try to use IPFS image
          if (!imageUrl && ipfsResult.metadata?.image) {
            imageUrl = ipfsResult.metadata.image;
            if (imageUrl.startsWith("ipfs://")) {
              imageUrl = `https://ipfs.io/ipfs/${imageUrl.replace("ipfs://", "")}`;
            }
          }
          
          console.log(`[API] Final image URL: ${imageUrl}`);
          console.log(`[API] Metadata URI: ${metadataUri}`);
        } else {
          // If pump.fun IPFS fails, try alternative or skip
          console.warn("[API] IPFS upload failed, will create token without metadata URI");
          // Create a placeholder metadata URI - token will still work
          metadataUri = `https://pump.fun/coin/${name.toLowerCase().replace(/\s/g, "-")}`;
        }
      } catch (ipfsError) {
        console.warn("[API] IPFS upload error, continuing without metadata:", ipfsError);
        metadataUri = `https://pump.fun/coin/${name.toLowerCase().replace(/\s/g, "-")}`;
      }
    }

    // 3. Get Pumpfun create transaction using official SDK
    const INITIAL_BUY_SOL = 0.05; // Dev buys 0.05 SOL worth on creation
    console.log(`[API] Creating token with official pump-fun SDK...`);
    const txResult = await createTokenWithOfficialSdk({
      name,
      symbol,
      metadataUri,
      creatorWallet,
      initialBuySol: INITIAL_BUY_SOL,
    });

    if (!txResult.success || !txResult.transaction) {
      return res.status(500).json({ error: txResult.error || "Failed to get create transaction" });
    }

    // 4. Store token in database with "pending" status
    // Status changes to "bonding" after frontend confirms the transaction was sent
    const { data: tokenData, error: insertError } = await supabase
      .from("tokens")
      .insert({
        name,
        symbol,
        description: description || "",
        image_url: imageUrl || null,
        creator_wallet: creatorWallet, // This is the connected wallet public key
        bot_wallet_public: lpWallet.publicKey.toBase58(), // Dev wallet for automation
        bot_wallet_private: bs58.encode(lpWallet.secretKey), // Private key for signing txs
        status: "pending", // Waiting for frontend to sign and send transaction
        twitter: twitter || null,
        telegram: telegram || null,
        website: website || null,
        mint: txResult.mint,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      return res.status(500).json({ error: "Failed to create token record" });
    }

    console.log(`[API] Token record created: ${tokenData.id}, mint: ${txResult.mint}`);

    // Return transaction for frontend to sign
    res.json({
      success: true,
      tokenId: tokenData.id,
      mint: txResult.mint,
      lpWallet: lpWallet.publicKey.toBase58(),
      transaction: txResult.transaction,
      mintSecretKey: txResult.mintSecretKey,
    });
  } catch (error: any) {
    console.error("Error creating token:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * POST /api/tokens/:id/confirm - Confirm token creation after signing
 */
tokenRoutes.post("/:id/confirm", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { signature, bondingCurve, associatedBondingCurve } = req.body;

    if (!signature) {
      return res.status(400).json({ error: "Missing signature" });
    }

    // Verify the transaction on-chain
    const txInfo = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      return res.status(400).json({ error: "Transaction not found on-chain" });
    }

    // Update token status
    const { error } = await supabase
      .from("tokens")
      .update({
        status: "bonding",
        pumpfun_bonding_curve: bondingCurve,
        pumpfun_associated_bonding_curve: associatedBondingCurve,
      })
      .eq("id", id);

    if (error) {
      return res.status(500).json({ error: "Failed to update token" });
    }

    // Record transaction
    await supabase.from("transactions").insert({
      token_id: id,
      type: "create",
      signature,
      status: "confirmed",
    });

    // Get updated token
    const { data: token } = await supabase
      .from("tokens")
      .select("mint")
      .eq("id", id)
      .single();

    res.json({ success: true, mint: token?.mint });
  } catch (error: any) {
    console.error("Error confirming token:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tokens/:id/feed - Manually trigger LP feed for a token
 * Note: Feed happens automatically via cron job every minute
 */
tokenRoutes.post("/:id/feed", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Feed happens automatically via cron, this endpoint is for manual trigger
    res.json({ 
      success: true, 
      message: "Feed runs automatically every minute via cron job",
      tokenId: id 
    });
  } catch (error: unknown) {
    console.error("Error triggering feed:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * GET /api/tokens/:id/history - Get feed history for a token
 */
tokenRoutes.get("/:id/history", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const { data, error } = await supabase
      .from("feed_history")
      .select("*")
      .eq("token_id", id)
      .order("created_at", { ascending: false })
      .limit(Number(limit));

    if (error) {
      return res.status(500).json({ error: "Failed to fetch history" });
    }

    res.json(data || []);
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
