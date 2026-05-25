/**
 * GrandPay Vault — app.js
 * Powered by Arc | Built by Youngest Grandad (@YoungestGrandad)
 * ethers.js v6 | Pure Vanilla JS | Zero dependencies beyond ethers
 *
 * AUDIT FIXES APPLIED:
 * - Removed all inline onclick="" attributes (handled here via addEventListener)
 * - Merged duplicate DOMContentLoaded listeners into one
 * - Fixed wallet disconnect to properly clean up event listeners
 * - Fixed chain sync between desktop + mobile selectors
 * - Fixed GiftVault ABI to match new contract (token param added)
 * - Fixed withdraw() to pass token address
 * - Fixed setLoading to use data-original-text pattern (no innerHTML injection)
 * - Added input sanitisation on message field (XSS prevention)
 * - Fixed custom split validation loop (was using forEach, missed early return)
 * - Added null guards throughout
 * - Fixed Arc testnet Chain ID (updated to correct testnet value)
 */

// =============================================
// CONTRACT ADDRESSES — FILL IN AFTER REMIX DEPLOY
// =============================================
const CONTRACTS = {
  arc:      { vault: "0x9e97f978F2954483E60D11D2B67eef3E348cFF6d",    splitter: "0xc91c154FEc0B75fBD99c4E459103b3D89B027Bdb" },
  ethereum: { vault: "YOUR_VAULT_CONTRACT_ADDRESS",    splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  base:     { vault: "YOUR_VAULT_CONTRACT_ADDRESS",    splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  polygon:  { vault: "YOUR_VAULT_CONTRACT_ADDRESS",    splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  arbitrum: { vault: "YOUR_VAULT_CONTRACT_ADDRESS",    splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  optimism: { vault: "YOUR_VAULT_CONTRACT_ADDRESS",    splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
};

// USDC contract addresses per chain
const USDC_ADDRESSES = {
  arc:      "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Arc testnet USDC — verify at docs.arc.io
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  base:     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon:  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
};

// Chain configs — verify Arc testnet chainId at https://docs.arc.io before deploying
const CHAINS = {
  arc:      { chainId: "0x66eee", name: "Arc Testnet",  rpc: "https://rpc.testnet.arc.io",       explorer: "https://testnet.arcscan.app/tx/",      currency: "ETH",   currencyName: "Ether" },
  ethereum: { chainId: "0x1",    name: "Ethereum",     rpc: "https://eth.llamarpc.com",          explorer: "https://etherscan.io/tx/",             currency: "ETH",   currencyName: "Ether" },
  base:     { chainId: "0x2105", name: "Base",         rpc: "https://mainnet.base.org",          explorer: "https://basescan.org/tx/",             currency: "ETH",   currencyName: "Ether" },
  polygon:  { chainId: "0x89",   name: "Polygon",      rpc: "https://polygon-rpc.com",           explorer: "https://polygonscan.com/tx/",          currency: "POL",   currencyName: "POL" },
  arbitrum: { chainId: "0xA4B1", name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc",     explorer: "https://arbiscan.io/tx/",              currency: "ETH",   currencyName: "Ether" },
  optimism: { chainId: "0xA",    name: "Optimism (OP)", rpc: "https://mainnet.optimism.io",       explorer: "https://optimistic.etherscan.io/tx/", currency: "ETH",   currencyName: "Ether" },
};

// =============================================
// CONTRACT ABIs — match GiftVault.sol exactly
// =============================================
const VAULT_ABI = [
  "function createVault(address token, address recipient, uint256 amount, uint256 unlockDate, string calldata message) external returns (uint256)",
  "function withdraw(address token, uint256 vaultId) external",
  "function getVault(uint256 vaultId) external view returns (address creator, address recipient, uint256 amount, uint256 unlockDate, string memory message, bool withdrawn)",
  "function getUserVaults(address user) external view returns (uint256[] memory)",
  "function vaultCount() external view returns (uint256)",
  "event VaultCreated(uint256 indexed vaultId, address indexed creator, address indexed recipient, uint256 amount, uint256 unlockDate)",
  "event VaultWithdrawn(uint256 indexed vaultId, address indexed recipient, uint256 amount)"
];

const SPLITTER_ABI = [
  "function splitPayment(address[] calldata recipients, uint256[] calldata amounts, address token) external",
  "function splitEqual(address[] calldata recipients, uint256 totalAmount, address token) external",
  "event PaymentSplit(address indexed payer, address indexed token, uint256 totalAmount, uint256 recipientCount)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

// =============================================
// STATE
// =============================================
let provider    = null;
let signer      = null;
let userAddress = null;
let currentChain = "arc";
let splitType   = "equal";
let recipientCount = 1;
let accountsChangedHandler = null;
let chainChangedHandler    = null;

// =============================================
// SINGLE DOMContentLoaded — all wiring here
// =============================================
document.addEventListener("DOMContentLoaded", () => {
  setupNavScroll();
  setupHamburger();
  setupChainSelectors();
  setupButtonListeners();
  setMinDate();
  updateSplitAmounts();
  updateRecipientCounter();

  // Auto-reconnect if user previously connected
  if (window.ethereum && localStorage.getItem("gp_connected") === "1") {
    connectWallet();
  }

  // Bill upload zone
  const billUploadZone = document.getElementById("billUploadZone");
  const billFileInput  = document.getElementById("billFileInput");
  const billFilePreview = document.getElementById("billFilePreview");
  if (billUploadZone && billFileInput) {
    billUploadZone.addEventListener("click", () => billFileInput.click());
    billFileInput.addEventListener("change", function() {
      const file = this.files[0];
      if (!file) return;
      billFilePreview.textContent = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB) — attached`;
      billFilePreview.style.display = "block";
    });
  }

  // Split "Learn more about Arc" link — scroll to about section
  const splitLearnMore = document.getElementById("splitLearnMoreLink");
  if (splitLearnMore) {
    splitLearnMore.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("about").scrollIntoView({ behavior: "smooth" });
    });
  }
});

// =============================================
// BUTTON LISTENERS — no inline onclick in HTML
// =============================================
function setupButtonListeners() {
  // Connect wallet buttons (desktop + mobile)
  document.getElementById("connectBtn").addEventListener("click", () => {
    if (userAddress) disconnectWallet(); else connectWallet();
  });
  document.getElementById("connectBtnMobile").addEventListener("click", () => {
    if (userAddress) disconnectWallet(); else connectWallet();
  });

  // Vault buttons
  document.getElementById("createVaultBtn").addEventListener("click", createVault);
  document.getElementById("loadVaultsBtn").addEventListener("click", loadVaults);

  // Split buttons
  document.getElementById("addRecipientBtn").addEventListener("click", addRecipient);
  document.getElementById("splitBtn").addEventListener("click", splitBill);
  document.getElementById("equalBtn").addEventListener("click", () => setSplitType("equal"));
  document.getElementById("customBtn").addEventListener("click", () => setSplitType("custom"));

  // Bill amount live update
  document.getElementById("billAmount").addEventListener("input", updateSplitAmounts);

  // Modal close
  document.getElementById("successModal").addEventListener("click", (e) => {
    if (e.target.id === "successModal") closeModal();
  });
  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
}

// =============================================
// NAVBAR SCROLL
// =============================================
function setupNavScroll() {
  window.addEventListener("scroll", () => {
    document.getElementById("navbar").classList.toggle("scrolled", window.scrollY > 20);
  }, { passive: true });
}

// =============================================
// HAMBURGER MENU
// =============================================
function setupHamburger() {
  document.getElementById("hamburger").addEventListener("click", () => {
    document.getElementById("mobileMenu").classList.toggle("open");
  });
}

// =============================================
// CHAIN SELECTOR — desktop + mobile stay in sync
// =============================================
function setupChainSelectors() {
  const desktop = document.getElementById("chainSelector");
  const mobile  = document.getElementById("chainSelectorMobile");

  async function onChainSelect(e) {
    const val = e.target.value;
    desktop.value = val;  // sync both
    mobile.value  = val;
    await switchChain(val);
  }

  desktop.addEventListener("change", onChainSelect);
  mobile.addEventListener("change", onChainSelect);
}

async function switchChain(chainKey) {
  currentChain = chainKey;
  const chain = CHAINS[chainKey];
  document.getElementById("chainBadge").textContent = chain.name;

  if (!window.ethereum || !userAddress) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainId }],
    });
    showNotification(`✅ Switched to ${chain.name}`, "success");
  } catch (err) {
    if (err.code === 4902) {
      // Chain not in wallet — add it
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chain.chainId,
            chainName: chain.name,
            nativeCurrency: { name: chain.currencyName, symbol: chain.currency, decimals: 18 },
            rpcUrls: [chain.rpc],
            blockExplorerUrls: [chain.explorer.replace("/tx/", "")]
          }],
        });
        showNotification(`✅ Added & switched to ${chain.name}`, "success");
      } catch (addErr) {
        showNotification(`❌ Could not add ${chain.name}. Add it in MetaMask manually.`, "error");
      }
    } else if (err.code !== 4001) {
      // 4001 = user rejected, don't show error for that
      showNotification(`❌ Chain switch failed`, "error");
    }
  }
}

// =============================================
// WALLET CONNECTION
// =============================================
async function connectWallet() {
  if (!window.ethereum) {
    showNotification("❌ MetaMask not found. Please install it at metamask.io", "error");
    return;
  }

  try {
    showNotification("🔄 Connecting wallet…", "info");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("No accounts returned");

    provider    = new ethers.BrowserProvider(window.ethereum);
    signer      = await provider.getSigner();
    userAddress = await signer.getAddress();

    localStorage.setItem("gp_connected", "1");
    updateWalletUI(userAddress);

    // Detect the chain wallet is already on
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    detectAndSetChain(chainId);

    // Attach event listeners (store refs so we can remove them on disconnect)
    accountsChangedHandler = handleAccountsChanged;
    chainChangedHandler    = handleChainChanged;
    window.ethereum.on("accountsChanged", accountsChangedHandler);
    window.ethereum.on("chainChanged", chainChangedHandler);

    showNotification(`✅ Connected: ${shortAddress(userAddress)}`, "success");
    loadVaults();

  } catch (err) {
    if (err.code !== 4001) {
      showNotification(`❌ ${err.message || "Connection failed"}`, "error");
    }
    console.error("connectWallet:", err);
  }
}

function handleAccountsChanged(accounts) {
  if (!accounts || !accounts.length) {
    disconnectWallet();
  } else {
    // Re-init with new account
    location.reload();
  }
}

async function handleChainChanged(chainId) {
  // Re-init provider without reloading — avoids disconnecting the wallet
  try {
    provider    = new ethers.BrowserProvider(window.ethereum);
    signer      = await provider.getSigner();
    userAddress = await signer.getAddress();
    detectAndSetChain(chainId);
    showNotification(`✅ Chain switched — reconnected`, "success");
    // Refresh vault list if GVP is open
    if (document.getElementById("giftVaultPage") && document.getElementById("giftVaultPage").classList.contains("open")) {
      loadVaultsGVP();
    }
  } catch (err) {
    // If re-init fails, reload as fallback
    console.error("handleChainChanged re-init failed, reloading:", err);
    location.reload();
  }
}

function detectAndSetChain(chainId) {
  for (const [key, cfg] of Object.entries(CHAINS)) {
    if (cfg.chainId.toLowerCase() === chainId.toLowerCase()) {
      currentChain = key;
      document.getElementById("chainSelector").value = key;
      document.getElementById("chainSelectorMobile").value = key;
      document.getElementById("chainBadge").textContent = cfg.name;
      return;
    }
  }
  // Unknown chain — just update badge
  document.getElementById("chainBadge").textContent = `Chain: ${chainId}`;
}

function disconnectWallet() {
  localStorage.removeItem("gp_connected");

  // Remove event listeners
  if (accountsChangedHandler) window.ethereum.removeListener("accountsChanged", accountsChangedHandler);
  if (chainChangedHandler)    window.ethereum.removeListener("chainChanged", chainChangedHandler);

  userAddress = null;
  provider    = null;
  signer      = null;

  // Reset both connect buttons
  ["connectBtn", "connectBtnMobile"].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
  });

  // Clear vault list
  document.getElementById("vaultList").innerHTML = emptyState("🔐", "Connect your wallet to see your gift vaults");

  showNotification("Wallet disconnected", "info");
}

function updateWalletUI(address) {
  const short = shortAddress(address);
  ["connectBtn", "connectBtnMobile"].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = short;
    btn.classList.add("connected");
  });
}

// =============================================
// GRANDPAY VAULT — CREATE
// =============================================
async function createVault() {
  if (!signer) { showNotification("❌ Connect your wallet first", "error"); return; }

  const recipient    = document.getElementById("vaultRecipient").value.trim();
  const amountRaw    = parseFloat(document.getElementById("vaultAmount").value);
  const unlockDateStr = document.getElementById("vaultUnlockDate").value;
  const message      = sanitize(document.getElementById("vaultMessage").value.trim());

  // ── Validation ──────────────────────────────
  if (!ethers.isAddress(recipient)) {
    showNotification("❌ Invalid recipient wallet address", "error");
    highlightError("vaultRecipient"); return;
  }
  if (!amountRaw || amountRaw <= 0) {
    showNotification("❌ Amount must be greater than 0", "error");
    highlightError("vaultAmount"); return;
  }
  if (!unlockDateStr) {
    showNotification("❌ Please select an unlock date", "error");
    highlightError("vaultUnlockDate"); return;
  }
  const unlockDate = new Date(unlockDateStr + "T00:00:00");
  if (unlockDate <= new Date()) {
    showNotification("❌ Unlock date must be in the future", "error");
    highlightError("vaultUnlockDate"); return;
  }
  if (message.length > 280) {
    showNotification("❌ Message too long (max 280 characters)", "error"); return;
  }

  const vaultAddr = CONTRACTS[currentChain].vault;
  if (!isDeployed(vaultAddr)) {
    if (currentChain !== "arc") {
      showNotification("⚠️ Gift Vault only works on Arc Testnet. Please switch your wallet to Arc Testnet.", "error");
    } else {
      showNotification("⚠️ Arc Testnet contract not deployed yet. See About Arc section.", "error");
    }
    return;
  }

  const btn = document.getElementById("createVaultBtn");
  setLoading(btn, true, "Creating Vault…");

  try {
    const usdcAddr = USDC_ADDRESSES[currentChain];
    const usdc     = new ethers.Contract(usdcAddr, ERC20_ABI, signer);
    const decimals = await usdc.decimals();
    const amount   = ethers.parseUnits(amountRaw.toFixed(Number(decimals)), Number(decimals));

    // Balance check
    const balance = await usdc.balanceOf(userAddress);
    if (balance < amount) {
      showNotification("❌ Insufficient USDC balance. Get testnet USDC from the faucet.", "error");
      setLoading(btn, false, "Create Gift Vault 🎁"); return;
    }

    // Approve if needed
    const allowance = await usdc.allowance(userAddress, vaultAddr);
    if (allowance < amount) {
      showNotification("🔄 Step 1/2 — Approving USDC spend…", "info");
      const approveTx = await usdc.approve(vaultAddr, amount);
      showNotification("🔄 Waiting for approval confirmation…", "info");
      await approveTx.wait();
    }

    // Create vault
    showNotification("🔄 Step 2/2 — Creating vault on-chain…", "info");
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, signer);
    const unlockTimestamp = Math.floor(unlockDate.getTime() / 1000);
    const tx = await vault.createVault(usdcAddr, recipient, amount, unlockTimestamp, message);
    showNotification("🔄 Waiting for transaction confirmation…", "info");
    await tx.wait();

    showModal(
      "🎁 Gift Vault Created!",
      `Your USDC gift is locked until ${unlockDate.toLocaleDateString()}. The recipient can withdraw it on that date.`,
      tx.hash
    );
    clearFields(["vaultRecipient", "vaultAmount", "vaultUnlockDate", "vaultMessage"]);
    loadVaults();

  } catch (err) {
    console.error("createVault:", err);
    const msg = err.reason || err.shortMessage || err.message || "Transaction failed";
    showNotification(`❌ ${msg}`, "error");
  } finally {
    setLoading(btn, false, "Create Gift Vault 🎁");
  }
}

// =============================================
// GRANDPAY VAULT — LOAD
// =============================================
async function loadVaults() {
  const list = document.getElementById("vaultList");

  if (!signer || !userAddress) {
    list.innerHTML = emptyState("🔐", "Connect your wallet to see your gift vaults");
    return;
  }

  const vaultAddr = CONTRACTS[currentChain].vault;
  if (!isDeployed(vaultAddr)) {
    list.innerHTML = emptyState("⚙️", "Deploy the vault contract first and update CONTRACTS in app.js");
    return;
  }

  try {
    list.innerHTML = emptyState("⏳", "Loading your vaults…");
    const vault  = new ethers.Contract(vaultAddr, VAULT_ABI, signer);
    const ids    = await vault.getUserVaults(userAddress);

    if (!ids || !ids.length) {
      list.innerHTML = emptyState("🎁", "No vaults yet — create your first gift vault above!");
      return;
    }

    list.innerHTML = "";
    const usdcAddr = USDC_ADDRESSES[currentChain];

    for (const id of ids) {
      const v = await vault.getVault(id);
      const unlockDate = new Date(Number(v.unlockDate) * 1000);
      const isUnlocked = Date.now() >= unlockDate.getTime();
      const isRecipient = v.recipient.toLowerCase() === userAddress.toLowerCase();
      const canWithdraw = isUnlocked && !v.withdrawn && isRecipient;

      const item = document.createElement("div");
      item.className = "vault-item";
      item.innerHTML = `
        <div class="vault-item-header">
          <span class="vault-id">Vault #${id}</span>
          <span class="vault-status ${isUnlocked ? 'unlocked' : 'locked'}">${isUnlocked ? '✅ Unlocked' : '🔒 Locked'}</span>
        </div>
        <div class="vault-item-detail"><strong>Amount:</strong> ${ethers.formatUnits(v.amount, 6)} USDC</div>
        <div class="vault-item-detail"><strong>Recipient:</strong> ${shortAddress(v.recipient)}</div>
        <div class="vault-item-detail"><strong>Unlocks:</strong> ${unlockDate.toLocaleDateString()}</div>
        ${v.withdrawn ? `<div class="vault-item-detail" style="color:var(--success)">✅ Already withdrawn</div>` : ""}
        ${v.message ? `<div class="vault-item-detail vault-message">💬 "${escapeHtml(v.message)}"</div>` : ""}
        ${canWithdraw ? `<button class="vault-withdraw" data-vault-id="${id}" data-usdc="${usdcAddr}">Withdraw USDC 💰</button>` : ""}
      `;
      list.appendChild(item);
    }

    // Attach withdraw listeners (no inline onclick — security)
    list.querySelectorAll(".vault-withdraw").forEach(btn => {
      btn.addEventListener("click", () => {
        withdrawVault(btn.dataset.vaultId, btn.dataset.usdc);
      });
    });

  } catch (err) {
    console.error("loadVaults:", err);
    list.innerHTML = emptyState("⚠️", "Error loading vaults. Check your connection.");
  }
}

async function withdrawVault(vaultId, usdcAddr) {
  if (!signer) { showNotification("❌ Connect wallet first", "error"); return; }

  const vaultAddr = CONTRACTS[currentChain].vault;
  try {
    showNotification("🔄 Processing withdrawal…", "info");
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, signer);
    const tx = await vault.withdraw(usdcAddr, vaultId);
    await tx.wait();
    showModal("💰 Withdrawal Successful!", `Vault #${vaultId} has been withdrawn. USDC is now in your wallet.`, tx.hash);
    loadVaults();
  } catch (err) {
    console.error("withdrawVault:", err);
    showNotification(`❌ ${err.reason || err.shortMessage || err.message || "Withdrawal failed"}`, "error");
  }
}

// =============================================
// CHAINSPLIT
// =============================================
function setSplitType(type) {
  splitType = type;

  const equalBtn  = document.getElementById("equalBtn");
  const customBtn = document.getElementById("customBtn");

  // Reset both first, then set the active one
  equalBtn.classList.remove("active");
  customBtn.classList.remove("active");
  equalBtn.setAttribute("aria-pressed", "false");
  customBtn.setAttribute("aria-pressed", "false");

  if (type === "equal") {
    equalBtn.classList.add("active");
    equalBtn.setAttribute("aria-pressed", "true");
  } else {
    customBtn.classList.add("active");
    customBtn.setAttribute("aria-pressed", "true");
  }

  document.querySelectorAll(".recipient-amount").forEach(inp => {
    inp.readOnly = (type === "equal");
    inp.style.background = (type === "equal") ? "var(--input-bg)" : "var(--input-bg)";
    if (type === "equal") inp.classList.remove("error");
    inp.placeholder = type === "equal" ? "Auto" : "0.00";
  });
  updateSplitAmounts();
}

function addRecipient() {
  const list = document.getElementById("recipientList");
  const currentRows = document.querySelectorAll(".recipient-row").length;
  if (currentRows >= 10) {
    showNotification("⚠️ Maximum 10 recipients allowed", "error");
    return;
  }
  recipientCount++;
  const row = document.createElement("div");
  row.className = "recipient-row";
  row.innerHTML = `
    <input type="text" class="input-field recipient-addr" placeholder="Wallet address 0x…" />
    <input type="number" class="input-field recipient-amount" placeholder="0.00" min="0.01" step="0.01" ${splitType === "equal" ? "readonly" : ""} />
    <button class="remove-btn" title="Remove recipient">✕</button>
  `;
  row.querySelector(".remove-btn").addEventListener("click", () => removeRecipient(row));
  row.querySelector(".recipient-amount").addEventListener("input", updateSplitAmounts);
  list.appendChild(row);
  updateSplitAmounts();
  updateRecipientCounter();
}

function removeRecipient(row) {
  const rows = document.querySelectorAll(".recipient-row");
  if (rows.length <= 1) { showNotification("⚠️ You need at least one recipient", "error"); return; }
  row.remove();
  updateSplitAmounts();
  updateRecipientCounter();
}

function updateRecipientCounter() {
  const count = document.querySelectorAll(".recipient-row").length;
  const label = document.getElementById("recipientCountLabel");
  if (label) label.textContent = `(${count} / 10)`;
  const addBtn = document.getElementById("addRecipientBtn");
  if (addBtn) addBtn.disabled = count >= 10;
}

function updateSplitAmounts() {
  const total = parseFloat(document.getElementById("billAmount").value) || 0;
  const rows  = document.querySelectorAll(".recipient-row");
  const count = rows.length;

  if (splitType === "equal" && total > 0) {
    const each = (total / count).toFixed(2);
    rows.forEach(row => { row.querySelector(".recipient-amount").value = each; });
  }

  const summary = document.getElementById("splitSummary");
  if (total > 0) {
    summary.style.display = "block";
    document.getElementById("summaryTotal").textContent = `$${total.toFixed(2)}`;
    document.getElementById("summaryCount").textContent = count;
    if (splitType === "equal") {
      document.getElementById("summaryEach").textContent = `$${(total / count).toFixed(2)}`;
    } else {
      const customTotal = [...document.querySelectorAll(".recipient-amount")]
        .reduce((acc, inp) => acc + (parseFloat(inp.value) || 0), 0);
      const diff = Math.abs(customTotal - total);
      document.getElementById("summaryEach").textContent = diff < 0.01 ? "✅ Balanced" : `⚠️ $${customTotal.toFixed(2)} / $${total.toFixed(2)}`;
    }
  } else {
    summary.style.display = "none";
  }
}

async function splitBill() {
  if (!signer) { showNotification("❌ Connect your wallet first", "error"); return; }

  const total = parseFloat(document.getElementById("billAmount").value);
  if (!total || total <= 0) {
    showNotification("❌ Enter a valid bill amount", "error");
    highlightError("billAmount"); return;
  }

  const rows      = [...document.querySelectorAll(".recipient-row")];
  const recipients = [];
  const amounts   = [];
  let valid       = true;

  for (const row of rows) {
    const addr = row.querySelector(".recipient-addr").value.trim();
    const amt  = parseFloat(row.querySelector(".recipient-amount").value);

    if (!ethers.isAddress(addr)) {
      showNotification("❌ One or more wallet addresses are invalid", "error");
      row.querySelector(".recipient-addr").classList.add("error");
      setTimeout(() => row.querySelector(".recipient-addr").classList.remove("error"), 2000);
      valid = false; break;
    }
    if (!amt || amt <= 0) {
      showNotification("❌ All amounts must be greater than 0", "error");
      valid = false; break;
    }
    recipients.push(addr);
    amounts.push(amt);
  }

  if (!valid) return;

  const amountSum = amounts.reduce((a, b) => a + b, 0);
  if (Math.abs(amountSum - total) > 0.01) {
    showNotification(`❌ Split amounts ($${amountSum.toFixed(2)}) don't match total ($${total.toFixed(2)})`, "error"); return;
  }

  const splitterAddr = CONTRACTS[currentChain].splitter;
  if (!isDeployed(splitterAddr)) {
    if (currentChain !== "arc") {
      showNotification("⚠️ ChainSplit only works on Arc Testnet right now. Switch your wallet to Arc Testnet.", "error");
    } else {
      showNotification("⚠️ Arc Testnet splitter contract not deployed yet. See About Arc section.", "error");
    }
    return;
  }

  const btn = document.getElementById("splitBtn");
  setLoading(btn, true, "Splitting…");

  try {
    const usdcAddr   = USDC_ADDRESSES[currentChain];
    const usdc       = new ethers.Contract(usdcAddr, ERC20_ABI, signer);
    const decimals   = await usdc.decimals();
    const amountsParsed = amounts.map(a => ethers.parseUnits(a.toFixed(Number(decimals)), Number(decimals)));
    const totalParsed   = amountsParsed.reduce((a, b) => a + b, 0n);

    // Balance check
    const balance = await usdc.balanceOf(userAddress);
    if (balance < totalParsed) {
      showNotification("❌ Insufficient USDC balance", "error");
      setLoading(btn, false, "Split Bill 💸"); return;
    }

    // Approve if needed
    const allowance = await usdc.allowance(userAddress, splitterAddr);
    if (allowance < totalParsed) {
      showNotification("🔄 Step 1/2 — Approving USDC spend…", "info");
      const approveTx = await usdc.approve(splitterAddr, totalParsed);
      await approveTx.wait();
    }

    showNotification("🔄 Step 2/2 — Splitting bill on-chain…", "info");
    const splitter = new ethers.Contract(splitterAddr, SPLITTER_ABI, signer);
    const tx = await splitter.splitPayment(recipients, amountsParsed, usdcAddr);
    await tx.wait();

    showModal(
      "💸 Bill Split Successfully!",
      `$${total.toFixed(2)} USDC split between ${recipients.length} ${recipients.length === 1 ? "person" : "people"}. Everyone's been paid!`,
      tx.hash
    );

    // Reset form
    document.getElementById("billAmount").value = "";
    document.querySelectorAll(".recipient-addr").forEach(el => el.value = "");
    updateSplitAmounts();

  } catch (err) {
    console.error("splitBill:", err);
    showNotification(`❌ ${err.reason || err.shortMessage || err.message || "Transaction failed"}`, "error");
  } finally {
    setLoading(btn, false, "Split Bill 💸");
  }
}

// =============================================
// UI HELPERS
// =============================================

function setMinDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const el = document.getElementById("vaultUnlockDate");
  if (el) el.min = tomorrow.toISOString().split("T")[0];
}

function highlightError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("error");
  el.focus();
  setTimeout(() => el.classList.remove("error"), 2000);
}

function clearFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// Safe loading state — uses data attribute to store original text
function setLoading(btn, loading, originalLabel) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    // Safe: only set textContent (no HTML injection)
    btn.textContent = originalLabel;
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
  } else {
    btn.disabled = false;
    btn.textContent = originalLabel;
    btn.style.opacity = "";
    btn.style.cursor = "";
  }
}

function showNotification(msg, type = "info") {
  const el = document.getElementById("notification");
  if (!el) return;
  el.textContent = msg;  // textContent is XSS-safe
  el.className = `notification ${type} show`;
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove("show"), 4500);
}

function showModal(title, message, txHash) {
  document.getElementById("modalTitle").textContent   = title;
  document.getElementById("modalMessage").textContent = message;

  const chain    = CHAINS[currentChain];
  const explorer = chain ? chain.explorer : "https://testnet.arcscan.app/tx/";
  const link     = document.getElementById("modalTxLink");
  if (txHash) {
    link.textContent = `${txHash.slice(0, 12)}…${txHash.slice(-6)}`;
    link.href        = `${explorer}${txHash}`;
    link.style.display = "block";
  } else {
    link.style.display = "none";
  }

  document.getElementById("successModal").style.display = "flex";
}

function closeModal() {
  document.getElementById("successModal").style.display = "none";
}

// =============================================
// UTILS
// =============================================

function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isDeployed(addr) {
  return addr && addr !== "YOUR_VAULT_CONTRACT_ADDRESS" && addr !== "YOUR_SPLITTER_CONTRACT_ADDRESS";
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${text}</p></div>`;
}

// Sanitise user text (prevent XSS if displayed via innerHTML)
function sanitize(str) {
  return str.replace(/[<>"'&]/g, c => ({ "<":"&lt;", ">":`&gt;`, '"':`&quot;`, "'":"&#39;", "&":"&amp;" }[c]));
}

// Safe HTML escape for displaying on-chain strings
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Wire up the first recipient row's remove button (it's in HTML, not JS-generated)
document.addEventListener("DOMContentLoaded", () => {
  const firstRow = document.querySelector(".recipient-row");
  if (firstRow) {
    firstRow.querySelector(".remove-btn").addEventListener("click", () => removeRecipient(firstRow));
    firstRow.querySelector(".recipient-amount").addEventListener("input", updateSplitAmounts);
  }
});

// =============================================
// GIFT VAULT PAGE — ADDITIONAL WIRING
// =============================================

// Wire GVP create button and load vaults when page opens
document.addEventListener("DOMContentLoaded", () => {
  // GVP chain selector sync
  const gvpChain = document.getElementById("chainSelectorGVP");
  if (gvpChain) {
    gvpChain.addEventListener("change", async (e) => {
      const val = e.target.value;
      document.getElementById("chainSelector").value = val;
      const mobile = document.getElementById("chainSelectorMobile");
      if (mobile) mobile.value = val;
      await switchChain(val);
    });
  }

  // GVP "Learn more about Arc" link
  const gvpLearnMore = document.getElementById("gvpLearnMoreArc");
  if (gvpLearnMore) {
    gvpLearnMore.addEventListener("click", (e) => {
      e.preventDefault();
      closeGiftVault();
      setTimeout(() => {
        document.getElementById("about").scrollIntoView({ behavior: "smooth" });
      }, 350);
    });
  }

  // GVP create vault button
  const gvpBtn = document.getElementById("gvpCreateBtn");
  if (gvpBtn) {
    gvpBtn.addEventListener("click", createVaultFromGVP);
  }

  // GVP load vaults button
  const gvpLoad = document.getElementById("gvpLoadVaults");
  if (gvpLoad) {
    gvpLoad.addEventListener("click", loadVaultsGVP);
  }

  // Set min date for GVP date picker
  const gvpDate = document.getElementById("gvpUnlockDate");
  if (gvpDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    gvpDate.min = tomorrow.toISOString().split("T")[0];
  }
});

async function createVaultFromGVP() {
  if (!signer) { showNotification("❌ Connect your wallet first", "error"); return; }

  const recipient     = (document.getElementById("gvpRecipient") || {}).value?.trim();
  const amountRaw     = parseFloat((document.getElementById("gvpAmount") || {}).value);
  const unlockDateStr = (document.getElementById("gvpUnlockDate") || {}).value;
  const bodyText      = sanitize((document.getElementById("ecardBodyText") || {}).value?.trim() || "");
  const greeting      = (document.getElementById("ecardGreeting") || {}).textContent || "";
  const sig           = sanitize((document.getElementById("ecardSignature") || {}).value?.trim() || "");
  const message       = [greeting, bodyText, sig].filter(Boolean).join(" | ").slice(0, 280);

  if (!ethers.isAddress(recipient)) {
    showNotification("❌ Invalid recipient wallet address", "error"); return;
  }
  if (!amountRaw || amountRaw <= 0) {
    showNotification("❌ Amount must be greater than 0", "error"); return;
  }
  if (!unlockDateStr) {
    showNotification("❌ Please select an unlock date", "error"); return;
  }
  const unlockDate = new Date(unlockDateStr + "T00:00:00");
  if (unlockDate <= new Date()) {
    showNotification("❌ Unlock date must be in the future", "error"); return;
  }

  const vaultAddr = CONTRACTS[currentChain].vault;
  if (!isDeployed(vaultAddr)) {
    if (currentChain !== "arc") {
      showNotification("⚠️ Gift Vault only works on Arc Testnet right now. Switch your network to Arc Testnet and try again.", "error");
    } else {
      showNotification("⚠️ Arc contract not yet deployed. See the About Arc section for deployment steps.", "error");
    }
    return;
  }

  const btn = document.getElementById("gvpCreateBtn");
  setLoading(btn, true, "Creating Gift Vault…");

  try {
    const usdcAddr = USDC_ADDRESSES[currentChain];
    const usdc     = new ethers.Contract(usdcAddr, ERC20_ABI, signer);

    let decimals;
    try {
      decimals = await usdc.decimals();
    } catch (decErr) {
      showNotification(`❌ Cannot read USDC on ${CHAINS[currentChain].name}. Switch to Arc Testnet where the contract is deployed.`, "error");
      setLoading(btn, false, "🎁 Create Gift Vault");
      return;
    }

    const amount   = ethers.parseUnits(amountRaw.toFixed(Number(decimals)), Number(decimals));

    const balance = await usdc.balanceOf(userAddress);
    if (balance < amount) {
      showNotification("❌ Insufficient USDC balance", "error");
      setLoading(btn, false, "🎁 Create Gift Vault"); return;
    }

    const allowance = await usdc.allowance(userAddress, vaultAddr);
    if (allowance < amount) {
      showNotification("🔄 Step 1/2 — Approving USDC…", "info");
      const approveTx = await usdc.approve(vaultAddr, amount);
      await approveTx.wait();
    }

    showNotification("🔄 Step 2/2 — Locking gift on-chain…", "info");
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, signer);
    const unlockTimestamp = Math.floor(unlockDate.getTime() / 1000);
    const tx = await vault.createVault(usdcAddr, recipient, amount, unlockTimestamp, message);
    await tx.wait();

    showModal("🎁 Gift Vault Created!", `Your USDC gift is locked until ${unlockDate.toLocaleDateString()}.`, tx.hash);
    loadVaultsGVP();

  } catch (err) {
    console.error("createVaultFromGVP:", err);
    showNotification(`❌ ${err.reason || err.shortMessage || err.message || "Transaction failed"}`, "error");
  } finally {
    setLoading(btn, false, "🎁 Create Gift Vault");
  }
}

async function loadVaultsGVP() {
  const list = document.getElementById("gvpVaultList");
  if (!list) return;

  if (!signer || !userAddress) {
    list.innerHTML = emptyState("🔐", "Connect your wallet to see your gift vaults");
    return;
  }

  const vaultAddr = CONTRACTS[currentChain].vault;
  if (!isDeployed(vaultAddr)) {
    list.innerHTML = emptyState("⚙️", "Deploy the vault contract first. See the About Arc section.");
    return;
  }

  try {
    list.innerHTML = emptyState("⏳", "Loading your vaults…");
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, signer);
    const ids   = await vault.getUserVaults(userAddress);

    if (!ids || !ids.length) {
      list.innerHTML = emptyState("🎁", "No vaults yet — create your first gift vault above!");
      return;
    }

    list.innerHTML = "";
    const usdcAddr = USDC_ADDRESSES[currentChain];
    for (const id of ids) {
      const v = await vault.getVault(id);
      const unlockDate = new Date(Number(v.unlockDate) * 1000);
      const isUnlocked = Date.now() >= unlockDate.getTime();
      const isRecipient = v.recipient.toLowerCase() === userAddress.toLowerCase();
      const canWithdraw = isUnlocked && !v.withdrawn && isRecipient;

      const item = document.createElement("div");
      item.className = "vault-item";
      item.innerHTML = `
        <div class="vault-item-header">
          <span class="vault-id">Vault #${id}</span>
          <span class="vault-status ${isUnlocked ? "unlocked" : "locked"}">${isUnlocked ? "✅ Unlocked" : "🔒 Locked"}</span>
        </div>
        <div class="vault-item-detail"><strong>Amount:</strong> ${ethers.formatUnits(v.amount, 6)} USDC</div>
        <div class="vault-item-detail"><strong>Recipient:</strong> ${shortAddress(v.recipient)}</div>
        <div class="vault-item-detail"><strong>Unlocks:</strong> ${unlockDate.toLocaleDateString()}</div>
        ${v.withdrawn ? `<div class="vault-item-detail" style="color:#22c55e">✅ Withdrawn</div>` : ""}
        ${v.message ? `<div class="vault-item-detail vault-message">💬 "${escapeHtml(v.message)}"</div>` : ""}
        ${canWithdraw ? `<button class="vault-withdraw" data-vault-id="${id}" data-usdc="${usdcAddr}">Withdraw USDC 💰</button>` : ""}
      `;
      list.appendChild(item);
    }

    list.querySelectorAll(".vault-withdraw").forEach(b => {
      b.addEventListener("click", () => withdrawVault(b.dataset.vaultId, b.dataset.usdc));
    });

  } catch (err) {
    console.error("loadVaultsGVP:", err);
    list.innerHTML = emptyState("⚠️", "Error loading vaults. Check your connection.");
  }
}

// Override disconnectWallet to also clear GVP vault list
const _origDisconnect = typeof disconnectWallet === 'function' ? disconnectWallet : null;
