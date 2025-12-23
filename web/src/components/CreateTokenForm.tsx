"use client";

import { useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { createToken, confirmToken } from "@/lib/api";

// Use Helius RPC - set NEXT_PUBLIC_HELIUS_API_KEY in .env.local
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY || "79f04b6a-679c-420b-adc0-63e8109280ca";
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const INITIAL_BUY_SOL = 0.05; // Dev wallet buys 0.05 SOL worth

export function CreateTokenForm() {
  const { publicKey, connected, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    privateKey: "", // Dev wallet private key for automation
  });
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setTxSignature(null);

    if (!connected || !publicKey || !signTransaction) {
      setVisible(true);
      return;
    }

    if (!formData.name || !formData.symbol) {
      setError("name and symbol are required");
      return;
    }

    if (!image) {
      setError("image is required");
      return;
    }

    if (!formData.privateKey) {
      setError("dev wallet private key is required for automation");
      return;
    }

    // Validate private key format
    try {
      const keyBytes = bs58.decode(formData.privateKey);
      if (keyBytes.length !== 64) {
        setError("invalid private key format");
        return;
      }
    } catch {
      setError("invalid private key - must be base58 encoded");
      return;
    }

    setIsLoading(true);

    try {
      // Check wallet balance
      const connection = new Connection(RPC_URL, "confirmed");
      const balance = await connection.getBalance(publicKey);
      const minBalance = 0.1 * 1e9; // 0.1 SOL minimum
      
      if (balance < minBalance) {
        setError(`need at least 0.1 SOL. you have ${(balance / 1e9).toFixed(4)} SOL`);
        setIsLoading(false);
        return;
      }

      setStatus("uploading to ipfs...");
      
      // Convert image to base64
      const reader = new FileReader();
      const imageBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(image);
      });

      setStatus("preparing transaction...");
      
      // Get transaction from backend
      const result = await createToken({
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        description: formData.description,
        image: imageBase64,
        twitter: formData.twitter || undefined,
        telegram: formData.telegram || undefined,
        website: formData.website || undefined,
        creatorWallet: publicKey.toBase58(),
        devPrivateKey: formData.privateKey, // Use dev wallet for automation
      });

      console.log("Backend result:", result);

      if (!result.transaction || !result.mintSecretKey) {
        throw new Error("Failed to get transaction from backend");
      }

      setStatus("sign transaction in wallet...");

      // Deserialize transaction
      const txBuffer = Buffer.from(result.transaction, "base64");
      const transaction = VersionedTransaction.deserialize(txBuffer);

      // Create mint keypair from secret key
      const mintKeypair = Keypair.fromSecretKey(bs58.decode(result.mintSecretKey));
      console.log("Mint keypair:", mintKeypair.publicKey.toBase58());

      // Sign with mint keypair first
      transaction.sign([mintKeypair]);
      console.log("Transaction signed with mint keypair");

      // Sign with user's wallet
      const signedTx = await signTransaction(transaction);
      console.log("Transaction signed with user wallet");

      setStatus("sending to pumpfun...");

      // Send transaction
      const signature = await connection.sendTransaction(signedTx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      console.log("Transaction sent:", signature);
      setStatus("confirming transaction...");

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Confirm with backend
      setStatus("finalizing...");
      await confirmToken(result.tokenId, {
        signature,
      });

      setMintAddress(result.mint);
      setTxSignature(signature);
      setSuccess(true);
      setStatus("token created successfully!");

      setTimeout(() => {
        router.push("/");
      }, 5000);

    } catch (error: any) {
      console.error("Error creating token:", error);
      setError(error.message || "failed to create token");
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  };

  // Not connected state
  if (!connected) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-6 border border-[var(--accent)]/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="6" width="20" height="12" rx="2"/>
            <path d="M22 10h-4a2 2 0 100 4h4"/>
            <circle cx="18" cy="12" r="1"/>
          </svg>
        </div>
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-6">
          connect wallet to create
        </h3>
        <button
          onClick={() => setVisible(true)}
          className="px-8 py-3 bg-[var(--accent)] text-black text-xs uppercase tracking-widest font-bold hover:shadow-[0_0_20px_rgba(0,255,136,0.5)] transition-all"
        >
          connect wallet
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-xs uppercase tracking-widest">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 border border-[var(--accent)]/30 bg-[var(--accent-muted)]">
          <div className="text-[var(--accent)] text-xs uppercase tracking-widest flex items-center gap-2 mb-3">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {status}
          </div>
          {mintAddress && (
            <div className="space-y-2">
              <div className="font-mono text-xs text-[var(--text-muted)] break-all">
                mint: {mintAddress}
              </div>
              {txSignature && (
                <a 
                  href={`https://solscan.io/tx/${txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--purple)] hover:underline"
                >
                  view on solscan →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Image Upload */}
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">
          token image *
        </label>
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-28 h-28 border border-dashed border-[var(--border)] hover:border-[var(--accent)] cursor-pointer flex items-center justify-center overflow-hidden transition-all"
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center">
              <svg className="w-6 h-6 mx-auto text-[var(--text-muted)] mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">upload</span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="hidden"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">
            name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="my token"
            maxLength={32}
            className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_10px_rgba(0,255,136,0.2)] transition-all"
          />
        </div>

        {/* Symbol */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">
            symbol *
          </label>
          <input
            type="text"
            value={formData.symbol}
            onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
            placeholder="TOKEN"
            maxLength={10}
            className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] text-sm font-mono uppercase placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_10px_rgba(0,255,136,0.2)] transition-all"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">
          description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="describe your token..."
          rows={2}
          maxLength={500}
          className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_10px_rgba(0,255,136,0.2)] transition-all resize-none"
        />
      </div>

      {/* Dev Wallet Private Key - MUST BE CONNECTED WALLET */}
      <div className="border-t border-[var(--border)] pt-5">
        <div className="p-3 border border-red-500/50 bg-red-500/10 mb-4">
          <div className="text-red-400 text-xs uppercase tracking-widest font-bold mb-1">
            ⚠ important: use connected wallet
          </div>
          <p className="text-[10px] text-red-300/80">
            the private key MUST be from your currently connected wallet ({publicKey?.toBase58().slice(0, 8)}...). 
            this wallet receives creator fees and runs all automation.
          </p>
        </div>
        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">
          private key of connected wallet *
        </label>
        <input
          type="password"
          value={formData.privateKey}
          onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
          placeholder="paste private key of your connected wallet"
          className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] text-sm font-mono placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_10px_rgba(0,255,136,0.2)] transition-all"
        />
        <p className="text-[9px] text-[var(--text-muted)] mt-2 uppercase tracking-widest">
          phantom: settings → security → export private key
        </p>
      </div>

      {/* Social Links */}
      <div className="border-t border-[var(--border)] pt-5">
        <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3">
          social links (optional)
        </label>
        <div className="space-y-3">
          {/* Twitter */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border border-[var(--border)] flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            <input
              type="text"
              value={formData.twitter}
              onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
              placeholder="https://x.com/yourtoken"
              className="flex-1 px-4 py-2 bg-[var(--bg)] border border-[var(--border)] text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] transition-all"
            />
          </div>

          {/* Telegram */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border border-[var(--border)] flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </div>
            <input
              type="text"
              value={formData.telegram}
              onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
              placeholder="https://t.me/yourtoken"
              className="flex-1 px-4 py-2 bg-[var(--bg)] border border-[var(--border)] text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] transition-all"
            />
          </div>

          {/* Website */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border border-[var(--border)] flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <input
              type="text"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://yourtoken.com"
              className="flex-1 px-4 py-2 bg-[var(--bg)] border border-[var(--border)] text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] transition-all"
            />
          </div>
        </div>
      </div>

      {isLoading && status && !success && (
        <div className="p-3 border border-[var(--accent)]/30 text-[var(--accent)] text-xs uppercase tracking-widest flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          {status}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading || !formData.name || !formData.symbol || !image || !formData.privateKey}
        className="w-full py-4 bg-[var(--accent)] text-black text-xs uppercase tracking-widest font-bold disabled:bg-[var(--bg-card)] disabled:text-[var(--text-muted)] hover:shadow-[0_0_20px_rgba(0,255,136,0.5)] transition-all disabled:cursor-not-allowed disabled:shadow-none"
      >
        {isLoading ? "creating..." : "create token (~0.1 sol)"}
      </button>

      <p className="text-[10px] text-center text-[var(--text-muted)] uppercase tracking-widest">
        powered by pumpfun + auto-liquidity
      </p>
    </form>
  );
}
