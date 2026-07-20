/**
 * GrandPay Vault — app.js  (fixed build)
 * Built on Arc | Built by Youngest Grandad (@YoungestGrandad)
 * ethers.js v6 | Pure Vanilla JS
 *
 * FIXES IN THIS BUILD:
 * - Arc Testnet chain ID corrected to 0x66eee (419430)
 * - Chain switching no longer disconnects wallet (re-inits provider)
 * - Equal/Custom split tabs fully working with clear visual state
 * - Add Recipient fully working, capped at 10
 * - Bill upload properly wired (input outside zone div)
 * - Gift Vault: friendly error messages instead of raw contract errors
 * - All isDeployed checks give clear "Arc Testnet only" guidance
 * - "Learn more about Arc" links scroll to #about section
 * - WhatsApp share shows "Coming Soon" toast
 */

// =============================================
// CONTRACT ADDRESSES
// =============================================
const CONTRACTS = {
  arc:      { vault: "0x9e97f978F2954483E60D11D2B67eef3E348cFF6d", splitter: "0xc91c154FEc0B75fBD99c4E459103b3D89B027Bdb" },
  ethereum: { vault: "YOUR_VAULT_CONTRACT_ADDRESS",                splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  base:     { vault: "YOUR_VAULT_CONTRACT_ADDRESS",                splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  polygon:  { vault: "YOUR_VAULT_CONTRACT_ADDRESS",                splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  arbitrum: { vault: "YOUR_VAULT_CONTRACT_ADDRESS",                splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
  optimism: { vault: "YOUR_VAULT_CONTRACT_ADDRESS",                splitter: "YOUR_SPLITTER_CONTRACT_ADDRESS" },
};

const USDC_ADDRESSES = {
  // Arc: USDC is the native gas token. ERC-20 interface address confirmed from docs.arc.io/arc/references/contract-addresses
  // Uses 6 decimals via ERC-20 interface (native balance uses 18 — we always use the ERC-20 interface)
  arc:      "0x3600000000000000000000000000000000000000",
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  base:     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon:  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
};

const CHAINS = {
  // Arc Testnet — Chain ID 5042002 (0x4CFED2). Confirmed from docs.arc.io/arc/references/connect-to-arc
  // RPC: https://rpc.testnet.arc.network  |  Explorer: https://testnet.arcscan.app
  arc:      { chainId: "0x4CFED2", name: "Arc Testnet",   rpc: "https://rpc.testnet.arc.network",   explorer: "https://testnet.arcscan.app/tx/",      currency: "USDC", currencyName: "USDC" },
  ethereum: { chainId: "0x1",      name: "Ethereum",      rpc: "https://eth.llamarpc.com",           explorer: "https://etherscan.io/tx/",             currency: "ETH",  currencyName: "Ether" },
  base:     { chainId: "0x2105",   name: "Base",          rpc: "https://mainnet.base.org",           explorer: "https://basescan.org/tx/",             currency: "ETH",  currencyName: "Ether" },
  polygon:  { chainId: "0x89",     name: "Polygon",       rpc: "https://polygon-rpc.com",            explorer: "https://polygonscan.com/tx/",          currency: "POL",  currencyName: "POL"   },
  arbitrum: { chainId: "0xa4b1",   name: "Arbitrum One",  rpc: "https://arb1.arbitrum.io/rpc",       explorer: "https://arbiscan.io/tx/",              currency: "ETH",  currencyName: "Ether" },
  optimism: { chainId: "0xa",      name: "Optimism (OP)", rpc: "https://mainnet.optimism.io",        explorer: "https://optimistic.etherscan.io/tx/", currency: "ETH",  currencyName: "Ether" },
};

// Arc chain ID aliases — handles wallets that added Arc testnet under different IDs
const ARC_CHAIN_ID_ALIASES = new Set([
  "0x4cfed2",  // 5042002 — official (docs.arc.io)
  "0x66eee",   // 419430  — older Arc testnet ID, still appears in some MetaMask installs
  "0x7a69",    // 31337   — Hardhat/Anvil default used in some manual installs
]);

// =============================================
// ABIs
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
let accountsChangedHandler = null;
let chainChangedHandler    = null;

// =============================================
// INIT — single DOMContentLoaded
// =============================================
document.addEventListener("DOMContentLoaded", () => {
  setupNavScroll();
  setupHamburger();
  setupChainSelectors();
  setupButtonListeners();
  setupBillUpload();
  setupSplitLearnMore();
  setupGVPLearnMore();
  setupGVPPage();
  setupFirstRecipientRow();
  setMinDate();
  updateSplitAmounts();
  updateRecipientCounter();

  // Auto-reconnect
  if (window.ethereum && localStorage.getItem("gp_connected") === "1") {
    connectWallet();
  }
});

// =============================================
// BILL UPLOAD — standalone setup (no conflict)
// =============================================
function setupBillUpload() {
  const zone    = document.getElementById("billUploadZone");
  const input   = document.getElementById("billFileInput");
  const preview = document.getElementById("billFilePreview");
  if (!zone || !input) return;

  // Click zone → trigger file input (input is OUTSIDE the zone in HTML)
  zone.addEventListener("click", function(e) {
    e.stopPropagation();
    input.click();
  });

  input.addEventListener("change", function() {
    const file = this.files[0];
    if (!file) return;
    const sizeKB = (file.size / 1024).toFixed(1);
    preview.innerHTML = `✅ <strong>${escapeHtml(file.name)}</strong> &nbsp;·&nbsp; ${sizeKB} KB attached`;
    preview.style.display = "block";
    zone.style.borderColor = "var(--blue)";
    zone.style.background  = "rgba(10,102,255,0.05)";
  });
}

// =============================================
// LEARN MORE LINKS
// =============================================
function setupSplitLearnMore() {
  const el = document.getElementById("splitLearnMoreLink");
  if (!el) return;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("about").scrollIntoView({ behavior: "smooth" });
  });
}

function setupGVPLearnMore() {
  const el = document.getElementById("gvpLearnMoreArc");
  if (!el) return;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    closeGiftVault();
    setTimeout(() => document.getElementById("about").scrollIntoView({ behavior: "smooth" }), 350);
  });
}

// =============================================
// FIRST RECIPIENT ROW (pre-rendered in HTML)
// =============================================
function setupFirstRecipientRow() {
  const firstRow = document.querySelector(".recipient-row");
  if (!firstRow) return;
  const removeBtn = firstRow.querySelector(".remove-btn");
  const amtInput  = firstRow.querySelector(".recipient-amount");
  if (removeBtn) removeBtn.addEventListener("click", () => removeRecipient(firstRow));
  if (amtInput)  amtInput.addEventListener("input", updateSplitAmounts);
}

// =============================================
// BUTTON LISTENERS
// =============================================
function setupButtonListeners() {
  safeOn("connectBtn",      "click", () => { if (userAddress) disconnectWallet(); else connectWallet(); });
  safeOn("connectBtnMobile","click", () => { if (userAddress) disconnectWallet(); else connectWallet(); });
  safeOn("createVaultBtn",  "click", createVault);
  safeOn("loadVaultsBtn",   "click", loadVaults);
  safeOn("addRecipientBtn", "click", addRecipient);
  safeOn("splitBtn",        "click", splitBill);
  safeOn("equalBtn",        "click", () => setSplitType("equal"));
  safeOn("customBtn",       "click", () => setSplitType("custom"));
  safeOn("billAmount",      "input", updateSplitAmounts);
  safeOn("successModal",    "click", (e) => { if (e.target.id === "successModal") closeModal(); });
  safeOn("modalCloseBtn",   "click", closeModal);
}

function safeOn(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

// =============================================
// NAVBAR SCROLL
// =============================================
function setupNavScroll() {
  window.addEventListener("scroll", () => {
    const nb = document.getElementById("navbar");
    if (nb) nb.classList.toggle("scrolled", window.scrollY > 20);
  }, { passive: true });
}

// =============================================
// HAMBURGER MENU
// =============================================
function setupHamburger() {
  safeOn("hamburger", "click", () => {
    const menu = document.getElementById("mobileMenu");
    if (menu) menu.classList.toggle("open");
  });
}

// =============================================
// CHAIN SELECTORS
// =============================================
function setupChainSelectors() {
  const desktop = document.getElementById("chainSelector");
  const mobile  = document.getElementById("chainSelectorMobile");
  if (!desktop || !mobile) return;

  async function onChainSelect(e) {
    const val = e.target.value;
    desktop.value = val;
    mobile.value  = val;
    await switchChain(val);
  }
  desktop.addEventListener("change", onChainSelect);
  mobile.addEventListener("change",  onChainSelect);
}

async function switchChain(chainKey) {
  currentChain = chainKey;
  const chain  = CHAINS[chainKey];
  const badge  = document.getElementById("chainBadge");
  if (badge) badge.textContent = chain.name;

  if (!window.ethereum || !userAddress) return;

  // For Arc, MetaMask may have saved it under 0x66eee (419430) OR 0x4cfed2 (5042002).
  // Try all known aliases so we find whichever one MetaMask has saved.
  const chainIdsToTry = chainKey === "arc"
    ? [...ARC_CHAIN_ID_ALIASES]
    : [chain.chainId];

  for (const tryId of chainIdsToTry) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: tryId }],
      });
      showNotification(`✅ Switched to ${chain.name}`, "success");
      return;
    } catch (err) {
      if (err.code === 4001) return;   // user rejected — stop trying
      if (err.code === 4902) continue; // not found under this ID — try next
    }
  }

  // None of the known IDs worked — add Arc fresh with the official chain ID
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
    if (addErr.code !== 4001) {
      showNotification(`❌ Could not switch to ${chain.name}. Add it manually in MetaMask.`, "error");
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

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    detectAndSetChain(chainId);

    accountsChangedHandler = handleAccountsChanged;
    chainChangedHandler    = handleChainChanged;
    window.ethereum.on("accountsChanged", accountsChangedHandler);
    window.ethereum.on("chainChanged",    chainChangedHandler);

    showNotification(`✅ Connected: ${shortAddress(userAddress)}`, "success");
    loadVaults();
  } catch (err) {
    if (err.code !== 4001) showNotification(`❌ ${err.message || "Connection failed"}`, "error");
    console.error("connectWallet:", err);
  }
}

async function handleAccountsChanged(accounts) {
  if (!accounts || !accounts.length) {
    disconnectWallet();
  } else {
    // Re-init with new account without reloading
    try {
      provider    = new ethers.BrowserProvider(window.ethereum);
      signer      = await provider.getSigner();
      userAddress = await signer.getAddress();
      updateWalletUI(userAddress);
      showNotification(`✅ Account switched: ${shortAddress(userAddress)}`, "success");
    } catch (e) { location.reload(); }
  }
}

async function handleChainChanged(chainId) {
  // Re-init provider without page reload — keeps wallet connected
  try {
    provider    = new ethers.BrowserProvider(window.ethereum);
    signer      = await provider.getSigner();
    userAddress = await signer.getAddress();
    detectAndSetChain(chainId);
    showNotification(`✅ Network changed`, "success");
  } catch (e) {
    location.reload();
  }
}

function detectAndSetChain(chainId) {
  const id = chainId.toLowerCase();

  // Check Arc aliases first — handles all the different chain IDs MetaMask
  // reports for Arc depending on how the network was added
  if (ARC_CHAIN_ID_ALIASES.has(id)) {
    currentChain = "arc";
    const sel   = document.getElementById("chainSelector");
    const mob   = document.getElementById("chainSelectorMobile");
    const badge = document.getElementById("chainBadge");
    if (sel)   sel.value        = "arc";
    if (mob)   mob.value        = "arc";
    if (badge) badge.textContent = "Arc Testnet";
    return;
  }

  // Standard lookup for all other chains
  for (const [key, cfg] of Object.entries(CHAINS)) {
    if (cfg.chainId.toLowerCase() === id) {
      currentChain = key;
      const sel   = document.getElementById("chainSelector");
      const mob   = document.getElementById("chainSelectorMobile");
      const badge = document.getElementById("chainBadge");
      if (sel)   sel.value        = key;
      if (mob)   mob.value        = key;
      if (badge) badge.textContent = cfg.name;
      return;
    }
  }

  // Unknown chain — show ID but do NOT reset currentChain
  const badge = document.getElementById("chainBadge");
  if (badge) badge.textContent = `Chain ${chainId}`;
  console.warn("Unknown chain ID:", chainId, "— currentChain kept as:", currentChain);
}

function disconnectWallet() {
  localStorage.removeItem("gp_connected");
  if (window.ethereum) {
    if (accountsChangedHandler) window.ethereum.removeListener("accountsChanged", accountsChangedHandler);
    if (chainChangedHandler)    window.ethereum.removeListener("chainChanged",    chainChangedHandler);
  }
  userAddress = null;
  provider    = null;
  signer      = null;

  ["connectBtn","connectBtnMobile"].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
  });

  const vl = document.getElementById("vaultList");
  if (vl) vl.innerHTML = emptyState("🔐", "Connect your wallet to see your gift vaults");
  showNotification("Wallet disconnected", "info");
}

function updateWalletUI(address) {
  const short = shortAddress(address);
  ["connectBtn","connectBtnMobile"].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = short;
    btn.classList.add("connected");
  });
}

// =============================================
// VAULT — CREATE (old form, still kept)
// =============================================
async function createVault() {
  if (!signer) { showNotification("❌ Connect your wallet first", "error"); return; }

  const recipient    = document.getElementById("vaultRecipient")?.value?.trim() || "";
  const amountRaw    = parseFloat(document.getElementById("vaultAmount")?.value || "0");
  const unlockDateStr = document.getElementById("vaultUnlockDate")?.value || "";
  const message      = sanitize(document.getElementById("vaultMessage")?.value?.trim() || "");

  if (!ethers.isAddress(recipient)) { showNotification("❌ Invalid recipient wallet address", "error"); return; }
  if (!amountRaw || amountRaw <= 0)  { showNotification("❌ Amount must be greater than 0", "error"); return; }
  if (!unlockDateStr)                { showNotification("❌ Please select an unlock date", "error"); return; }

  const unlockDate = new Date(unlockDateStr + "T00:00:00");
  if (unlockDate <= new Date()) { showNotification("❌ Unlock date must be in the future", "error"); return; }
  if (message.length > 280)    { showNotification("❌ Message too long (max 280 chars)", "error"); return; }

  if (!requireArcTestnet()) return;

  const vaultAddr = CONTRACTS[currentChain].vault;
  const btn = document.getElementById("createVaultBtn");
  setLoading(btn, true, "Creating Vault…");

  try {
    const { usdc, decimals, amount } = await getUSDCAndAmount(amountRaw);
    if (!usdc) { setLoading(btn, false, "Create Gift Vault 🎁"); return; }

    await checkBalance(usdc, amount, btn, "Create Gift Vault 🎁");

    const allowance = await usdc.allowance(userAddress, vaultAddr);
    if (allowance < amount) {
      showNotification("🔄 Step 1/2 — Approving USDC spend…", "info");
      const tx = await usdc.approve(vaultAddr, amount);
      await tx.wait();
    }

    showNotification("🔄 Step 2/2 — Creating vault on-chain…", "info");
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, signer);
    const ts    = Math.floor(unlockDate.getTime() / 1000);
    const tx    = await vault.createVault(USDC_ADDRESSES[currentChain], recipient, amount, ts, message);
    await tx.wait();

    showModal("🎁 Gift Vault Created!", `Your USDC gift is locked until ${unlockDate.toLocaleDateString()}.`, tx.hash);
    clearFields(["vaultRecipient","vaultAmount","vaultUnlockDate","vaultMessage"]);
    loadVaults();
  } catch (err) {
    console.error("createVault:", err);
    showNotification(`❌ ${friendlyError(err)}`, "error");
  } finally {
    setLoading(btn, false, "Create Gift Vault 🎁");
  }
}

// =============================================
// VAULT — LOAD
// =============================================
async function loadVaults() {
  const list = document.getElementById("vaultList");
  if (!list) return;

  if (!signer || !userAddress) {
    list.innerHTML = emptyState("🔐", "Connect your wallet to see your gift vaults");
    return;
  }
  if (!isDeployed(CONTRACTS[currentChain].vault)) {
    list.innerHTML = emptyState("⚙️", "Gift Vault is only deployed on Arc Testnet. Switch your wallet to Arc Testnet.");
    return;
  }

  try {
    list.innerHTML = emptyState("⏳", "Loading your vaults…");
    const vault   = new ethers.Contract(CONTRACTS[currentChain].vault, VAULT_ABI, signer);
    const ids     = await vault.getUserVaults(userAddress);

    if (!ids || !ids.length) {
      list.innerHTML = emptyState("🎁", "No vaults yet — create your first gift vault above!");
      return;
    }

    list.innerHTML = "";
    const usdcAddr = USDC_ADDRESSES[currentChain];

    for (const id of ids) {
      const v          = await vault.getVault(id);
      const unlockDate = new Date(Number(v.unlockDate) * 1000);
      const isUnlocked = Date.now() >= unlockDate.getTime();
      const isRecip    = v.recipient.toLowerCase() === userAddress.toLowerCase();
      const canWithdraw = isUnlocked && !v.withdrawn && isRecip;

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
        ${v.message   ? `<div class="vault-item-detail vault-message">💬 "${escapeHtml(v.message)}"</div>` : ""}
        ${canWithdraw ? `<button class="vault-withdraw" data-vault-id="${id}" data-usdc="${usdcAddr}">Withdraw USDC 💰</button>` : ""}
      `;
      list.appendChild(item);
    }

    list.querySelectorAll(".vault-withdraw").forEach(b => {
      b.addEventListener("click", () => withdrawVault(b.dataset.vaultId, b.dataset.usdc));
    });
  } catch (err) {
    console.error("loadVaults:", err);
    list.innerHTML = emptyState("⚠️", "Error loading vaults. Check your connection.");
  }
}

async function withdrawVault(vaultId, usdcAddr) {
  if (!signer) { showNotification("❌ Connect wallet first", "error"); return; }
  try {
    showNotification("🔄 Processing withdrawal…", "info");
    const vault = new ethers.Contract(CONTRACTS[currentChain].vault, VAULT_ABI, signer);
    const tx    = await vault.withdraw(usdcAddr, vaultId);
    await tx.wait();
    showModal("💰 Withdrawal Successful!", `Vault #${vaultId} withdrawn. USDC is now in your wallet.`, tx.hash);
    loadVaults();
  } catch (err) {
    console.error("withdrawVault:", err);
    showNotification(`❌ ${friendlyError(err)}`, "error");
  }
}

// =============================================
// CHAINSPLIT — TABS
// =============================================
function setSplitType(type) {
  splitType = type;

  const equalBtn  = document.getElementById("equalBtn");
  const customBtn = document.getElementById("customBtn");
  if (!equalBtn || !customBtn) return;

  // Clear both
  equalBtn.classList.remove("active");
  customBtn.classList.remove("active");
  equalBtn.setAttribute("aria-pressed",  "false");
  customBtn.setAttribute("aria-pressed", "false");

  // Set active
  if (type === "equal") {
    equalBtn.classList.add("active");
    equalBtn.setAttribute("aria-pressed", "true");
  } else {
    customBtn.classList.add("active");
    customBtn.setAttribute("aria-pressed", "true");
  }

  // Update amount fields
  document.querySelectorAll(".recipient-amount").forEach(inp => {
    inp.readOnly    = (type === "equal");
    inp.placeholder = (type === "equal") ? "Auto" : "0.00";
    if (type === "equal") { inp.classList.remove("error"); }
  });

  updateSplitAmounts();
}

// =============================================
// CHAINSPLIT — RECIPIENTS
// =============================================
function addRecipient() {
  const list = document.getElementById("recipientList");
  if (!list) return;

  const currentCount = list.querySelectorAll(".recipient-row").length;
  if (currentCount >= 10) {
    showNotification("⚠️ Maximum 10 recipients allowed", "error");
    return;
  }

  const row = document.createElement("div");
  row.className = "recipient-row";
  row.innerHTML = `
    <input type="text"   class="input-field recipient-addr"   placeholder="Wallet address 0x…" autocomplete="off" spellcheck="false" />
    <input type="number" class="input-field recipient-amount" placeholder="${splitType === "equal" ? "Auto" : "0.00"}" min="0.01" step="0.01" ${splitType === "equal" ? "readonly" : ""} />
    <button class="remove-btn" type="button" title="Remove recipient" aria-label="Remove">✕</button>
  `;

  row.querySelector(".remove-btn").addEventListener("click", () => removeRecipient(row));
  row.querySelector(".recipient-amount").addEventListener("input", updateSplitAmounts);
  list.appendChild(row);

  updateSplitAmounts();
  updateRecipientCounter();
}

function removeRecipient(row) {
  const list = document.getElementById("recipientList");
  if (!list) return;
  if (list.querySelectorAll(".recipient-row").length <= 1) {
    showNotification("⚠️ You need at least one recipient", "error");
    return;
  }
  row.remove();
  updateSplitAmounts();
  updateRecipientCounter();
}

function updateRecipientCounter() {
  const list  = document.getElementById("recipientList");
  const count = list ? list.querySelectorAll(".recipient-row").length : 0;
  const label = document.getElementById("recipientCountLabel");
  if (label) label.textContent = `(${count} / 10)`;
  const addBtn = document.getElementById("addRecipientBtn");
  if (addBtn) {
    addBtn.disabled      = count >= 10;
    addBtn.style.opacity = count >= 10 ? "0.5" : "";
  }
}

function updateSplitAmounts() {
  const total = parseFloat(document.getElementById("billAmount")?.value || "0") || 0;
  const list  = document.getElementById("recipientList");
  if (!list) return;
  const rows  = list.querySelectorAll(".recipient-row");
  const count = rows.length;

  if (splitType === "equal" && total > 0) {
    const each = (total / count).toFixed(2);
    rows.forEach(row => {
      const inp = row.querySelector(".recipient-amount");
      if (inp) inp.value = each;
    });
  }

  const summary = document.getElementById("splitSummary");
  if (!summary) return;

  if (total > 0) {
    summary.style.display = "block";
    const tot = document.getElementById("summaryTotal");
    const cnt = document.getElementById("summaryCount");
    const ea  = document.getElementById("summaryEach");
    if (tot) tot.textContent = `$${total.toFixed(2)}`;
    if (cnt) cnt.textContent = count;
    if (ea) {
      if (splitType === "equal") {
        ea.textContent = `$${(total / count).toFixed(2)}`;
      } else {
        const customTotal = [...list.querySelectorAll(".recipient-amount")]
          .reduce((acc, inp) => acc + (parseFloat(inp.value) || 0), 0);
        const diff = Math.abs(customTotal - total);
        ea.textContent = diff < 0.01 ? "✅ Balanced" : `⚠️ $${customTotal.toFixed(2)} / $${total.toFixed(2)}`;
      }
    }
  } else {
    summary.style.display = "none";
  }
}

// =============================================
// CHAINSPLIT — SPLIT BILL
// =============================================
async function splitBill() {
  if (!signer) { showNotification("❌ Connect your wallet first", "error"); return; }

  const total = parseFloat(document.getElementById("billAmount")?.value || "0");
  if (!total || total <= 0) { showNotification("❌ Enter a valid bill amount", "error"); return; }

  const list = document.getElementById("recipientList");
  if (!list) return;
  const rows = [...list.querySelectorAll(".recipient-row")];

  const recipients = [];
  const amounts    = [];

  for (const row of rows) {
    const addr = row.querySelector(".recipient-addr")?.value?.trim() || "";
    const amt  = parseFloat(row.querySelector(".recipient-amount")?.value || "0");

    if (!ethers.isAddress(addr)) {
      showNotification("❌ One or more wallet addresses are invalid", "error");
      row.querySelector(".recipient-addr")?.classList.add("error");
      setTimeout(() => row.querySelector(".recipient-addr")?.classList.remove("error"), 2000);
      return;
    }
    if (!amt || amt <= 0) {
      showNotification("❌ All amounts must be greater than 0", "error");
      return;
    }
    recipients.push(addr);
    amounts.push(amt);
  }

  const amountSum = amounts.reduce((a, b) => a + b, 0);
  if (Math.abs(amountSum - total) > 0.01) {
    showNotification(`❌ Split amounts ($${amountSum.toFixed(2)}) don't match total ($${total.toFixed(2)})`, "error");
    return;
  }

  if (!requireArcTestnet()) return;

  const splitterAddr = CONTRACTS[currentChain].splitter;
  const btn = document.getElementById("splitBtn");
  setLoading(btn, true, "Splitting…");

  try {
    const { usdc, decimals, amount: totalParsed } = await getUSDCAndAmount(total);
    if (!usdc) { setLoading(btn, false, "Split Bill 💸"); return; }

    const amountsParsed = amounts.map(a => ethers.parseUnits(a.toFixed(Number(decimals)), Number(decimals)));

    const balance = await usdc.balanceOf(userAddress);
    if (balance < totalParsed) {
      showNotification("❌ Insufficient USDC balance", "error");
      setLoading(btn, false, "Split Bill 💸"); return;
    }

    const allowance = await usdc.allowance(userAddress, splitterAddr);
    if (allowance < totalParsed) {
      showNotification("🔄 Step 1/2 — Approving USDC spend…", "info");
      const approveTx = await usdc.approve(splitterAddr, totalParsed);
      await approveTx.wait();
    }

    showNotification("🔄 Step 2/2 — Splitting bill on-chain…", "info");
    const splitter = new ethers.Contract(splitterAddr, SPLITTER_ABI, signer);
    const tx = await splitter.splitPayment(recipients, amountsParsed, USDC_ADDRESSES[currentChain]);
    await tx.wait();

    showModal("💸 Bill Split Successfully!", `$${total.toFixed(2)} USDC split between ${recipients.length} people. Everyone's been paid!`, tx.hash);
    document.getElementById("billAmount").value = "";
    list.querySelectorAll(".recipient-addr").forEach(el => el.value = "");
    updateSplitAmounts();
  } catch (err) {
    console.error("splitBill:", err);
    showNotification(`❌ ${friendlyError(err)}`, "error");
  } finally {
    setLoading(btn, false, "Split Bill 💸");
  }
}

// =============================================
// GIFT VAULT PAGE (GVP) — WIRING
// =============================================
function setupGVPPage() {
  // Chain selector sync
  const gvpChain = document.getElementById("chainSelectorGVP");
  if (gvpChain) {
    gvpChain.addEventListener("change", async (e) => {
      const val = e.target.value;
      const sel = document.getElementById("chainSelector");
      const mob = document.getElementById("chainSelectorMobile");
      if (sel) sel.value = val;
      if (mob) mob.value = val;
      await switchChain(val);
    });
  }

  safeOn("gvpCreateBtn",  "click", createVaultFromGVP);
  safeOn("gvpLoadVaults", "click", loadVaultsGVP);

  // Min date
  const gvpDate = document.getElementById("gvpUnlockDate");
  if (gvpDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    gvpDate.min = tomorrow.toISOString().split("T")[0];
  }
}

async function createVaultFromGVP() {
  if (!signer) { showNotification("❌ Connect your wallet first", "error"); return; }

  const recipient     = document.getElementById("gvpRecipient")?.value?.trim()  || "";
  const amountRaw     = parseFloat(document.getElementById("gvpAmount")?.value  || "0");
  const unlockDateStr = document.getElementById("gvpUnlockDate")?.value          || "";
  const bodyText      = sanitize(document.getElementById("ecardBodyText")?.value?.trim() || "");
  const greeting      = document.getElementById("ecardGreeting")?.textContent   || "";
  const sig           = sanitize(document.getElementById("ecardSignature")?.value?.trim() || "");
  const message       = [greeting, bodyText, sig].filter(Boolean).join(" | ").slice(0, 280);

  if (!ethers.isAddress(recipient)) { showNotification("❌ Invalid recipient wallet address", "error"); return; }
  if (!amountRaw || amountRaw <= 0) { showNotification("❌ Amount must be greater than 0", "error"); return; }
  if (!unlockDateStr)               { showNotification("❌ Please select a send/unlock date", "error"); return; }

  const unlockDate = new Date(unlockDateStr + "T00:00:00");
  if (unlockDate <= new Date()) { showNotification("❌ Unlock date must be in the future", "error"); return; }

  // Only works on Arc Testnet — clear message
  if (!requireArcTestnet()) return;

  const vaultAddr = CONTRACTS[currentChain].vault;
  const btn = document.getElementById("gvpCreateBtn");
  setLoading(btn, true, "Creating Gift Vault…");

  try {
    const usdcAddr = USDC_ADDRESSES[currentChain];
    const usdc     = new ethers.Contract(usdcAddr, ERC20_ABI, signer);

    let decimals;
    try {
      decimals = await usdc.decimals();
    } catch (e) {
      let actualId = "?";
      try { actualId = await window.ethereum.request({ method: "eth_chainId" }); } catch {}
      console.error("[GrandPay] usdc.decimals() failed in createVaultFromGVP:", { usdcAddr, actualId, e });
      showNotification(
        `❌ Could not read USDC. MetaMask is on chain ${actualId}. ` +
        `Switch MetaMask to "Arc Testnet" and try again.`,
        "error"
      );
      setLoading(btn, false, "🎁 Create Gift Vault");
      return;
    }

    const amount = ethers.parseUnits(amountRaw.toFixed(Number(decimals)), Number(decimals));

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
    const ts    = Math.floor(unlockDate.getTime() / 1000);
    const tx    = await vault.createVault(usdcAddr, recipient, amount, ts, message);
    await tx.wait();

    showModal("🎁 Gift Vault Created!", `Your USDC gift is locked until ${unlockDate.toLocaleDateString()}.`, tx.hash);
    loadVaultsGVP();
  } catch (err) {
    console.error("createVaultFromGVP:", err);
    showNotification(`❌ ${friendlyError(err)}`, "error");
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
  if (!isDeployed(CONTRACTS[currentChain].vault)) {
    list.innerHTML = emptyState("⚙️", "Gift Vault is only deployed on Arc Testnet. Switch your wallet to Arc Testnet.");
    return;
  }

  try {
    list.innerHTML = emptyState("⏳", "Loading your vaults…");
    const vault   = new ethers.Contract(CONTRACTS[currentChain].vault, VAULT_ABI, signer);
    const ids     = await vault.getUserVaults(userAddress);

    if (!ids || !ids.length) {
      list.innerHTML = emptyState("🎁", "No vaults yet — create your first gift vault above!");
      return;
    }

    list.innerHTML = "";
    const usdcAddr = USDC_ADDRESSES[currentChain];

    for (const id of ids) {
      const v          = await vault.getVault(id);
      const unlockDate = new Date(Number(v.unlockDate) * 1000);
      const isUnlocked = Date.now() >= unlockDate.getTime();
      const isRecip    = v.recipient.toLowerCase() === userAddress.toLowerCase();
      const canWithdraw = isUnlocked && !v.withdrawn && isRecip;

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
        ${v.message   ? `<div class="vault-item-detail vault-message">💬 "${escapeHtml(v.message)}"</div>` : ""}
        ${canWithdraw ? `<button class="vault-withdraw" data-vault-id="${id}" data-usdc="${usdcAddr}">Withdraw USDC 💰</button>` : ""}
      `;
      list.appendChild(item);
    }

    list.querySelectorAll(".vault-withdraw").forEach(b => {
      b.addEventListener("click", () => withdrawVault(b.dataset.vaultId, b.dataset.usdc));
    });
  } catch (err) {
    console.error("loadVaultsGVP:", err);
    list.innerHTML = emptyState("⚠️", "Error loading vaults. Check your network connection.");
  }
}

// =============================================
// UI HELPERS
// =============================================
function setMinDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = tomorrow.toISOString().split("T")[0];
  const el = document.getElementById("vaultUnlockDate");
  if (el) el.min = d;
}

function clearFields(ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
}

function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled       = loading;
  btn.textContent    = label;
  btn.style.opacity  = loading ? "0.7" : "";
  btn.style.cursor   = loading ? "not-allowed" : "";
}

function showNotification(msg, type = "info") {
  const el = document.getElementById("notification");
  if (!el) return;
  el.textContent = msg;
  el.className   = `notification ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 5000);
}

function showModal(title, message, txHash) {
  const titleEl = document.getElementById("modalTitle");
  const msgEl   = document.getElementById("modalMessage");
  if (titleEl) titleEl.textContent = title;
  if (msgEl)   msgEl.textContent   = message;

  const chain  = CHAINS[currentChain];
  const link   = document.getElementById("modalTxLink");
  if (link) {
    if (txHash) {
      link.textContent    = `${txHash.slice(0, 12)}…${txHash.slice(-6)}`;
      link.href           = `${chain ? chain.explorer : "https://testnet.arcscan.app/tx/"}${txHash}`;
      link.style.display  = "block";
    } else {
      link.style.display = "none";
    }
  }
  const modal = document.getElementById("successModal");
  if (modal) modal.style.display = "flex";
}

function closeModal() {
  const modal = document.getElementById("successModal");
  if (modal) modal.style.display = "none";
}

// =============================================
// UTILS
// =============================================
function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0,6)}…${addr.slice(-4)}`;
}

function isDeployed(addr) {
  return addr && addr !== "YOUR_VAULT_CONTRACT_ADDRESS" && addr !== "YOUR_SPLITTER_CONTRACT_ADDRESS";
}

function requireArcTestnet() {
  if (currentChain !== "arc") {
    showNotification("⚠️ This feature only works on Arc Testnet. Please switch your MetaMask to Arc Testnet and try again.", "error");
    return false;
  }
  if (!isDeployed(CONTRACTS.arc.vault)) {
    showNotification("⚠️ Arc Testnet contract is not deployed yet. See About Arc section.", "error");
    return false;
  }
  return true;
}

async function getUSDCAndAmount(amountRaw) {
  const usdcAddr = USDC_ADDRESSES[currentChain];
  if (!usdcAddr) {
    showNotification(`❌ No USDC address for chain "${currentChain}". Switch MetaMask to Arc Testnet.`, "error");
    return { usdc: null, decimals: null, amount: null };
  }

  // Confirm MetaMask is on an Arc alias before touching the contract
  if (currentChain === "arc") {
    let actualId = "?";
    try { actualId = (await window.ethereum.request({ method: "eth_chainId" })).toLowerCase(); } catch {}
    if (!ARC_CHAIN_ID_ALIASES.has(actualId)) {
      showNotification(
        `❌ Could not read USDC on this network. Make sure you are on Arc Testnet.`,
        "error"
      );
      return { usdc: null, decimals: null, amount: null };
    }
  }

  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, signer);

  // Arc USDC ERC-20 interface always uses 6 decimals — hardcode to avoid fragile RPC call
  let decimals = currentChain === "arc" ? 6 : null;
  if (decimals === null) {
    try {
      decimals = await usdc.decimals();
    } catch (e) {
      console.error("[GrandPay] decimals() call failed.", { currentChain, usdcAddr, error: e });
      showNotification(`❌ Could not read USDC on this network. Make sure you are on Arc Testnet.`, "error");
      return { usdc: null, decimals: null, amount: null };
    }
  }

  try {
    const amount = ethers.parseUnits(amountRaw.toFixed(Number(decimals)), Number(decimals));
    return { usdc, decimals, amount };
  } catch (e) {
    console.error("[GrandPay] parseUnits failed.", { amountRaw, decimals, error: e });
    showNotification(`❌ Invalid amount. Please enter a valid USDC amount.`, "error");
    return { usdc: null, decimals: null, amount: null };
  }
}

async function checkBalance(usdc, amount, btn, btnLabel) {
  const balance = await usdc.balanceOf(userAddress);
  if (balance < amount) {
    showNotification("❌ Insufficient USDC balance. Get testnet USDC from the faucet.", "error");
    setLoading(btn, false, btnLabel);
    return false;
  }
  return true;
}

function friendlyError(err) {
  if (err.code === 4001) return "Transaction rejected by user.";
  return err.reason || err.shortMessage || err.message || "Transaction failed";
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${text}</p></div>`;
}

function sanitize(str) {
  return str.replace(/[<>"'&]/g, c => ({"<":"&lt;",">":`&gt;`,'"':`&quot;`,"'":"&#39;","&":"&amp;"}[c]));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function highlightError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("error");
  el.focus();
  setTimeout(() => el.classList.remove("error"), 2000);
}
