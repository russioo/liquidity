// ============================================
// liquid - Frontend Application
// ============================================

const API_URL = 'http://localhost:3001/api';

// State
let walletConnected = false;
let walletAddress = null;
let provider = null;

// DOM Elements
const connectWalletBtn = document.getElementById('connectWallet');
const launchBtn = document.getElementById('launchBtn');
const tokenForm = document.getElementById('tokenForm');
const imageUpload = document.getElementById('imageUpload');
const tokenImage = document.getElementById('tokenImage');
const imagePreview = document.getElementById('imagePreview');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');

// ============================================
// Wallet Connection
// ============================================

async function connectWallet() {
  try {
    // Check for Phantom wallet
    if (!window.solana || !window.solana.isPhantom) {
      alert('Please install Phantom wallet to continue.\nhttps://phantom.app');
      window.open('https://phantom.app', '_blank');
      return;
    }

    provider = window.solana;
    
    // Connect
    const response = await provider.connect();
    walletAddress = response.publicKey.toString();
    walletConnected = true;

    // Update UI
    connectWalletBtn.innerHTML = `
      <span class="btn-text">${shortenAddress(walletAddress)}</span>
    `;
    connectWalletBtn.classList.add('connected');
    
    // Enable launch button
    launchBtn.disabled = false;
    launchBtn.querySelector('.btn-text').textContent = 'Launch Token 🚀';

    console.log('✅ Wallet connected:', walletAddress);

    // Fetch user's tokens
    fetchUserTokens();

  } catch (error) {
    console.error('❌ Wallet connection failed:', error);
    if (error.code === 4001) {
      // User rejected
      console.log('User rejected connection');
    }
  }
}

function shortenAddress(address) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Listen for wallet disconnect
if (window.solana) {
  window.solana.on('disconnect', () => {
    walletConnected = false;
    walletAddress = null;
    connectWalletBtn.innerHTML = `<span class="btn-text">Connect Wallet</span>`;
    connectWalletBtn.classList.remove('connected');
    launchBtn.disabled = true;
    launchBtn.querySelector('.btn-text').textContent = 'Connect Wallet to Launch';
  });
}

// ============================================
// Image Upload
// ============================================

imageUpload.addEventListener('click', () => {
  tokenImage.click();
});

imageUpload.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageUpload.style.borderColor = 'var(--primary)';
  imageUpload.style.background = 'rgba(0, 255, 163, 0.05)';
});

imageUpload.addEventListener('dragleave', (e) => {
  e.preventDefault();
  imageUpload.style.borderColor = '';
  imageUpload.style.background = '';
});

imageUpload.addEventListener('drop', (e) => {
  e.preventDefault();
  imageUpload.style.borderColor = '';
  imageUpload.style.background = '';
  
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    handleImageFile(file);
  }
});

tokenImage.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handleImageFile(file);
  }
});

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    imagePreview.style.display = 'block';
    uploadPlaceholder.style.display = 'none';
    imageUpload.classList.add('has-image');
  };
  reader.readAsDataURL(file);
}

// ============================================
// Token Creation
// ============================================

tokenForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!walletConnected) {
    alert('Please connect your wallet first');
    return;
  }

  // Get form data
  const name = document.getElementById('tokenName').value.trim();
  const symbol = document.getElementById('tokenSymbol').value.trim().toUpperCase();
  const description = document.getElementById('tokenDescription').value.trim();
  const twitter = document.getElementById('twitter').value.trim();
  const telegram = document.getElementById('telegram').value.trim();
  const website = document.getElementById('website').value.trim();
  const image = imagePreview.src || null;

  if (!name || !symbol) {
    alert('Please fill in token name and symbol');
    return;
  }

  // Show loading state
  setLoading(true);

  try {
    const response = await fetch(`${API_URL}/tokens/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        symbol,
        description,
        image,
        twitter,
        telegram,
        website,
        creatorWallet: walletAddress
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create token');
    }

    // Success!
    console.log('✅ Token created:', data);
    
    // Show success message
    showSuccessModal(data.token);

    // Reset form
    tokenForm.reset();
    imagePreview.src = '';
    imagePreview.style.display = 'none';
    uploadPlaceholder.style.display = 'flex';
    imageUpload.classList.remove('has-image');

  } catch (error) {
    console.error('❌ Token creation failed:', error);
    alert(`Failed to create token: ${error.message}`);
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  const btnText = launchBtn.querySelector('.btn-text');
  const btnLoader = launchBtn.querySelector('.btn-loader');
  
  if (loading) {
    launchBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
  } else {
    launchBtn.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}

function showSuccessModal(token) {
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'success-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="this.parentElement.remove()"></div>
    <div class="modal-content">
      <div class="modal-icon">🎉</div>
      <h2>Token Launched!</h2>
      <p class="modal-subtitle">Your token is now live on Pumpfun</p>
      
      <div class="modal-details">
        <div class="detail-row">
          <span class="detail-label">Name</span>
          <span class="detail-value">${token.name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Symbol</span>
          <span class="detail-value">${token.symbol}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Mint</span>
          <span class="detail-value mint">${shortenAddress(token.mint)}</span>
        </div>
      </div>

      <div class="modal-info">
        <span>⚡</span>
        <span>Auto-liquidity will activate once your token graduates!</span>
      </div>

      <div class="modal-actions">
        <a href="${token.pumpfunUrl}" target="_blank" class="btn-pumpfun">
          View on Pumpfun
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
        <button class="btn-close" onclick="this.closest('.success-modal').remove()">Close</button>
      </div>
    </div>
  `;

  // Add modal styles
  const style = document.createElement('style');
  style.textContent = `
    .success-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.8);
      backdrop-filter: blur(4px);
    }
    .modal-content {
      position: relative;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--border-radius-lg);
      padding: 2.5rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      animation: modalIn 0.3s ease-out;
    }
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .modal-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    .modal-content h2 {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
    }
    .modal-subtitle {
      color: var(--text-secondary);
      margin-bottom: 1.5rem;
    }
    .modal-details {
      background: rgba(0,0,0,0.3);
      border-radius: var(--border-radius);
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: var(--text-muted);
    }
    .detail-value {
      font-weight: 600;
    }
    .detail-value.mint {
      font-family: var(--font-mono);
      color: var(--primary);
    }
    .modal-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: rgba(0, 255, 163, 0.1);
      border-radius: var(--border-radius);
      font-size: 0.875rem;
      color: var(--primary);
      margin-bottom: 1.5rem;
    }
    .modal-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .btn-pumpfun {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      background: var(--gradient-primary);
      border-radius: var(--border-radius);
      color: var(--bg-dark);
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s;
    }
    .btn-pumpfun:hover {
      box-shadow: 0 4px 20px rgba(0, 255, 163, 0.4);
    }
    .btn-pumpfun svg {
      width: 18px;
      height: 18px;
    }
    .btn-close {
      padding: 0.75rem;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-close:hover {
      border-color: var(--text-secondary);
      color: var(--text-primary);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);
}

// ============================================
// Stats & Data
// ============================================

async function fetchStats() {
  try {
    // This would fetch from your API
    // For now, we'll use placeholder data
    document.getElementById('totalTokens').textContent = '0';
    document.getElementById('totalLiquidity').textContent = '0';
  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
}

async function fetchUserTokens() {
  if (!walletAddress) return;

  try {
    const response = await fetch(`${API_URL}/tokens/by-creator/${walletAddress}`);
    const data = await response.json();
    
    if (data.tokens && data.tokens.length > 0) {
      console.log('📦 User tokens:', data.tokens);
      // Could show a notification or update UI
    }
  } catch (error) {
    console.error('Failed to fetch user tokens:', error);
  }
}

// ============================================
// Utilities
// ============================================

function scrollToCreate() {
  document.getElementById('create').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Connect wallet button
  connectWalletBtn.addEventListener('click', connectWallet);

  // Fetch initial stats
  fetchStats();

  // Check if wallet is already connected
  if (window.solana && window.solana.isConnected) {
    connectWallet();
  }

  console.log('🚀 liquid initialized');
});

// Expose functions globally
window.scrollToCreate = scrollToCreate;

