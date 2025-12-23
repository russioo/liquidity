// ============================================
// liquid - Dashboard Application
// ============================================

const API_URL = 'http://localhost:3001/api';

// State
let walletConnected = false;
let walletAddress = null;
let provider = null;
let userTokens = [];

// DOM Elements
const connectWalletBtn = document.getElementById('connectWallet');
const connectPrompt = document.getElementById('connectPrompt');
const dashboardContent = document.getElementById('dashboardContent');
const tokensList = document.getElementById('tokensList');
const loadingTokens = document.getElementById('loadingTokens');
const emptyState = document.getElementById('emptyState');
const tokenModal = document.getElementById('tokenModal');

// ============================================
// Wallet Connection
// ============================================

async function connectWallet() {
  try {
    if (!window.solana || !window.solana.isPhantom) {
      alert('Please install Phantom wallet to continue.\nhttps://phantom.app');
      window.open('https://phantom.app', '_blank');
      return;
    }

    provider = window.solana;
    const response = await provider.connect();
    walletAddress = response.publicKey.toString();
    walletConnected = true;

    // Update UI
    connectWalletBtn.innerHTML = `<span class="btn-text">${shortenAddress(walletAddress)}</span>`;
    connectWalletBtn.classList.add('connected');
    
    // Show dashboard
    connectPrompt.style.display = 'none';
    dashboardContent.style.display = 'block';

    // Load user's tokens
    await loadUserTokens();

  } catch (error) {
    console.error('❌ Wallet connection failed:', error);
  }
}

function shortenAddress(address) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// ============================================
// Load Tokens
// ============================================

async function loadUserTokens() {
  loadingTokens.style.display = 'flex';
  emptyState.style.display = 'none';

  try {
    const response = await fetch(`${API_URL}/tokens/by-creator/${walletAddress}`);
    const data = await response.json();

    userTokens = data.tokens || [];

    // Update overview stats
    updateOverviewStats();

    // Render tokens
    renderTokens();

  } catch (error) {
    console.error('❌ Failed to load tokens:', error);
    loadingTokens.innerHTML = `
      <p style="color: var(--error);">Failed to load tokens. Please try again.</p>
    `;
  }
}

function updateOverviewStats() {
  document.getElementById('tokenCount').textContent = userTokens.length;
  
  const totalFees = userTokens.reduce((sum, t) => sum + (t.total_fees_claimed || 0), 0);
  document.getElementById('totalFees').textContent = `${totalFees.toFixed(2)} SOL`;
  
  const totalLP = userTokens.reduce((sum, t) => sum + (t.total_lp_added || 0), 0);
  document.getElementById('totalLP').textContent = `${totalLP.toFixed(2)} SOL`;
  
  const graduated = userTokens.filter(t => t.is_graduated).length;
  document.getElementById('graduatedCount').textContent = graduated;
}

function renderTokens() {
  loadingTokens.style.display = 'none';

  if (userTokens.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  // Clear existing tokens (but keep loading and empty states)
  const existingCards = tokensList.querySelectorAll('.token-card');
  existingCards.forEach(card => card.remove());

  // Render each token
  userTokens.forEach(token => {
    const card = createTokenCard(token);
    tokensList.appendChild(card);
  });
}

function createTokenCard(token) {
  const card = document.createElement('div');
  card.className = 'token-card';
  card.onclick = () => openTokenDetail(token.mint);

  const statusClass = token.is_graduated ? 'graduated' : 'bonding';
  const statusText = token.is_graduated ? '🎓 Graduated' : '⏳ Bonding';

  card.innerHTML = `
    <div class="token-image placeholder">${token.symbol?.charAt(0) || '?'}</div>
    <div class="token-info">
      <div class="token-name">
        ${escapeHtml(token.name)}
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
      <div class="token-symbol">${escapeHtml(token.symbol)}</div>
      <div class="token-mint">${shortenAddress(token.mint)}</div>
    </div>
    <div class="token-stats">
      <div class="token-stat">
        <div class="token-stat-value">${(token.total_fees_claimed || 0).toFixed(3)}</div>
        <div class="token-stat-label">Fees (SOL)</div>
      </div>
      <div class="token-stat">
        <div class="token-stat-value">${(token.total_lp_added || 0).toFixed(3)}</div>
        <div class="token-stat-label">LP Added (SOL)</div>
      </div>
    </div>
    <div class="token-actions" onclick="event.stopPropagation()">
      <a href="https://pump.fun/${token.mint}" target="_blank" class="btn-icon" title="View on Pumpfun">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      <button class="btn-icon" title="View Details" onclick="openTokenDetail('${token.mint}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>
    </div>
  `;

  return card;
}

// ============================================
// Token Detail Modal
// ============================================

async function openTokenDetail(mint) {
  tokenModal.style.display = 'flex';
  
  const content = document.getElementById('tokenDetailContent');
  content.innerHTML = `
    <div class="loading-state">
      <div class="loader-big"></div>
      <p>Loading token details...</p>
    </div>
  `;

  try {
    const response = await fetch(`${API_URL}/tokens/${mint}`);
    const data = await response.json();

    if (!data.token) {
      throw new Error('Token not found');
    }

    renderTokenDetail(data.token, data.lpHistory || []);

  } catch (error) {
    console.error('❌ Failed to load token detail:', error);
    content.innerHTML = `
      <div class="loading-state">
        <p style="color: var(--error);">Failed to load token details.</p>
      </div>
    `;
  }
}

function renderTokenDetail(token, lpHistory) {
  const content = document.getElementById('tokenDetailContent');
  
  const statusClass = token.is_graduated ? 'graduated' : 'bonding';
  const statusText = token.is_graduated ? '🎓 Graduated' : '⏳ Bonding Curve';

  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-image placeholder">${token.symbol?.charAt(0) || '?'}</div>
      <div class="detail-title">
        <h2>
          ${escapeHtml(token.name)}
          <span class="status-badge ${statusClass}">${statusText}</span>
        </h2>
        <div class="token-symbol">${escapeHtml(token.symbol)}</div>
        <div class="detail-mint">
          <span>${shortenAddress(token.mint)}</span>
          <button class="copy-btn" onclick="copyToClipboard('${token.mint}')" title="Copy mint address">
            📋
          </button>
        </div>
      </div>
    </div>

    <div class="detail-stats">
      <div class="detail-stat">
        <span class="detail-stat-value">${(token.total_fees_claimed || 0).toFixed(4)}</span>
        <span class="detail-stat-label">Fees Claimed (SOL)</span>
      </div>
      <div class="detail-stat">
        <span class="detail-stat-value">${(token.total_lp_added || 0).toFixed(4)}</span>
        <span class="detail-stat-label">LP Added (SOL)</span>
      </div>
      <div class="detail-stat">
        <span class="detail-stat-value">${lpHistory.length}</span>
        <span class="detail-stat-label">LP Transactions</span>
      </div>
    </div>

    <div class="detail-body">
      <div class="detail-section">
        <h3>Token Wallet</h3>
        <div class="wallet-address">
          <span class="icon">🔑</span>
          <span>${token.token_wallet_public}</span>
          <button class="copy-btn" onclick="copyToClipboard('${token.token_wallet_public}')" title="Copy wallet address">
            📋
          </button>
        </div>
      </div>

      ${token.meteora_pool ? `
        <div class="detail-section">
          <h3>Meteora Pool</h3>
          <div class="wallet-address">
            <span class="icon">🌊</span>
            <span>${token.meteora_pool}</span>
          </div>
        </div>
      ` : ''}

      <div class="detail-section">
        <h3>Recent LP Transactions</h3>
        ${lpHistory.length > 0 ? `
          <div class="lp-list">
            ${lpHistory.map(lp => `
              <div class="lp-item">
                <div class="lp-info">
                  <div class="lp-icon">💧</div>
                  <div>
                    <div class="lp-amount">+${lp.sol_amount?.toFixed(4) || 0} SOL</div>
                    <div class="lp-time">${formatTime(lp.created_at)}</div>
                  </div>
                </div>
                ${lp.tx_signature ? `
                  <a href="https://solscan.io/tx/${lp.tx_signature}" target="_blank" class="lp-link" title="View on Solscan">
                    🔗
                  </a>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="no-transactions">
            <p>No LP transactions yet.</p>
            <p style="font-size: 0.875rem; margin-top: 0.5rem;">LP will be added once the token graduates.</p>
          </div>
        `}
      </div>
    </div>

    <div class="detail-actions">
      <a href="https://pump.fun/${token.mint}" target="_blank" class="btn-action primary">
        View on Pumpfun
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      ${token.meteora_pool ? `
        <a href="https://app.meteora.ag/pools/${token.meteora_pool}" target="_blank" class="btn-action secondary">
          View Pool
        </a>
      ` : ''}
    </div>
  `;
}

function closeTokenModal() {
  tokenModal.style.display = 'none';
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeTokenModal();
  }
});

// ============================================
// Utilities
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Could show a toast notification here
    console.log('Copied to clipboard:', text);
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return date.toLocaleDateString();
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  connectWalletBtn.addEventListener('click', connectWallet);

  // Check if wallet is already connected
  if (window.solana && window.solana.isConnected) {
    connectWallet();
  }

  console.log('📊 Dashboard initialized');
});

// Make functions available globally
window.openTokenDetail = openTokenDetail;
window.closeTokenModal = closeTokenModal;
window.copyToClipboard = copyToClipboard;

