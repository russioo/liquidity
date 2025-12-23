# liquid - Auto-Liquidity Token Launchpad

Launch tokens on Pumpfun with perpetual auto-compounding liquidity via Meteora.

## How It Works

1. **Create Token** - Launch your token on Pumpfun via our interface
2. **Graduate** - When bonding curve completes (~85 SOL), a Meteora DLMM pool is auto-created
3. **Auto-LP** - Every 3 minutes, creator fees are claimed and added to the liquidity pool

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Solana, Pumpfun, Meteora, Jupiter

## Project Structure

```
buyback/
├── backend/           # Express API server
│   ├── src/
│   │   ├── index.ts          # Main server entry
│   │   ├── routes/
│   │   │   └── tokens.ts     # Token API endpoints
│   │   ├── services/
│   │   │   ├── pumpfun.ts    # Pumpfun integration
│   │   │   ├── meteora.ts    # Meteora pool creation
│   │   │   ├── jupiter.ts    # Jupiter swaps
│   │   │   └── liquidityFeeder.ts  # Cron job
│   │   └── database/
│   │       └── schema.sql    # Supabase schema
│   └── package.json
│
├── web/               # Next.js frontend
│   ├── src/
│   │   ├── app/              # App router pages
│   │   ├── components/       # React components
│   │   └── lib/
│   │       └── api.ts        # API client
│   └── package.json
│
└── frontend/          # Legacy static frontend (deprecated)
```

## Setup

### 1. Supabase Database

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `backend/src/database/schema.sql`
3. Get your project URL and service role key from Settings > API

### 2. Backend Setup

```bash
cd backend
npm install

# Create .env file with:
# HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your-service-role-key
# PORT=3001
# FRONTEND_URL=http://localhost:3000

npm run dev
```

### 3. Frontend Setup

```bash
cd web
npm install

# Create .env.local file with:
# NEXT_PUBLIC_API_URL=http://localhost:3001
# NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

npm run dev
```

### 4. Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/health

## API Endpoints

### Tokens

- `GET /api/tokens` - List all tokens
- `GET /api/tokens/:id` - Get single token
- `GET /api/tokens/mint/:mint` - Get token by mint address
- `POST /api/tokens/create` - Create new token
- `POST /api/tokens/:id/confirm` - Confirm Pumpfun launch
- `GET /api/tokens/:id/history` - Get feed history
- `GET /api/tokens/stats/global` - Get global stats

## Flow Details

### Token Creation

1. User fills form in frontend
2. Frontend calls `POST /api/tokens/create`
3. Backend generates dedicated LP wallet
4. Backend uploads metadata to IPFS via Pumpfun
5. Backend returns token ID + LP wallet address
6. Frontend builds Pumpfun create transaction
7. User signs with their wallet
8. Frontend confirms with backend

### Liquidity Feeding (Every 3 Minutes)

1. Cron job fetches all active tokens from DB
2. For each "live" token:
   - Check LP wallet balance
   - Claim creator fees from Pumpfun
   - Swap 50% of SOL to token via Jupiter
   - Add both sides to Meteora LP
   - Record in database

## Environment Variables

### Backend (.env)

```
HELIUS_RPC_URL=       # Helius RPC URL with API key
SUPABASE_URL=         # Supabase project URL
SUPABASE_SERVICE_KEY= # Supabase service role key
PORT=3001             # Server port
FRONTEND_URL=         # Frontend URL for CORS
```

### Frontend (.env.local)

```
NEXT_PUBLIC_API_URL=  # Backend API URL
NEXT_PUBLIC_RPC_URL=  # Solana RPC URL
```

## Production Deployment

### Backend
- Deploy to Railway, Render, or any Node.js host
- Set environment variables
- Ensure cron job runs continuously

### Frontend
- Deploy to Vercel (recommended for Next.js)
- Set environment variables in Vercel dashboard

## Notes

- The Meteora SDK integration requires `@meteora-ag/dlmm` package
- Pumpfun creator fee claiming requires direct program interaction
- Always test on devnet first with test tokens

## License

MIT
