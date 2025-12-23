"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  const handleClick = () => {
    if (publicKey) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <button
      onClick={handleClick}
      disabled={connecting}
      className={`w-full py-3 px-4 text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 ${
        publicKey
          ? "bg-[var(--bg)] text-[var(--accent)] border border-[var(--accent)]"
          : "bg-[var(--accent)] text-black hover:shadow-[0_0_20px_rgba(0,255,136,0.5)]"
      }`}
    >
      <span
        className={`w-2 h-2 ${
          publicKey ? "bg-[var(--accent)] animate-pulse" : "bg-black/30"
        }`}
      />
      {connecting
        ? "connecting..."
        : publicKey
        ? formatAddress(publicKey.toBase58())
        : "connect"}
    </button>
  );
}
