-- LIQUIDIFY Database Schema
-- Run this in Supabase SQL Editor

-- Drop existing tables if needed
DROP TABLE IF EXISTS feed_history CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;

-- Tokens table
CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Token info
  mint TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  
  -- Creator info
  creator_wallet TEXT NOT NULL,
  
  -- LP wallet (dedicated wallet for this token's liquidity operations)
  bot_wallet_public TEXT NOT NULL,
  bot_wallet_private TEXT NOT NULL, -- Dev wallet for automation
  
  -- Status: 'pending' | 'bonding' | 'graduating' | 'live' | 'paused'
  status TEXT DEFAULT 'bonding',
  
  -- PumpFun info
  pumpfun_bonding_curve TEXT,
  pumpfun_associated_bonding_curve TEXT,
  
  -- PumpSwap pool (after graduation)
  pumpswap_pool_address TEXT,
  
  -- Stats
  total_fees_claimed DECIMAL DEFAULT 0,
  total_buyback DECIMAL DEFAULT 0,
  total_lp_added DECIMAL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_feed_at TIMESTAMPTZ,
  graduated_at TIMESTAMPTZ
);

-- Feed history table (logs every cycle)
CREATE TABLE feed_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  
  -- Transaction type: 'claim_fees' | 'buyback' | 'add_liquidity'
  type TEXT NOT NULL,
  
  -- Transaction signature
  signature TEXT NOT NULL,
  
  -- Amounts
  sol_amount DECIMAL,
  token_amount DECIMAL,
  lp_tokens DECIMAL,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tokens_status ON tokens(status);
CREATE INDEX idx_tokens_mint ON tokens(mint);
CREATE INDEX idx_tokens_creator ON tokens(creator_wallet);
CREATE INDEX idx_feed_history_token ON feed_history(token_id);
CREATE INDEX idx_feed_history_created ON feed_history(created_at);

-- Enable RLS
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_history ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for service role)
CREATE POLICY "Allow all for service role" ON tokens FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON feed_history FOR ALL USING (true);
