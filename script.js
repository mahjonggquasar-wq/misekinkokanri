/* ================================================================
   店金庫管理アプリ - メインスクリプト
   
   在庫管理: localStorage（マスター）
   記録ログ: Googleスプレッドシート（no-cors POST）
   ================================================================ */

(() => {
  'use strict';

  // --- 金種定義 ---
  const DENOMINATIONS = [
    { value: 5000, id: '5000', label: '5,000円', type: 'bill' },
    { value: 1000, id: '1000', label: '1,000円', type: 'bill' },
    { value: 500,  id: '500',  label: '500円',   type: 'coin' },
    { value: 100,  id: '100',  label: '100円',   type: 'coin' },
    { value: 50,   id: '50',   label: '50円',    type: 'coin' },
  ];

  // --- 金庫の在庫 ---
  const vault = {};
  DENOMINATIONS.forEach(d => { vault[d.id] = 0; });

  // --- ストレージキー ---
  const STORAGE_KEY_URL = 'kinko_gas_url';
  const STORAGE_KEY_VAULT = 'kinko_vault';

  function getGasUrl() { return localStorage.getItem(STORAGE_KEY_URL) || ''; }
  function setGasUrl(url) { localStorage.setItem(STORAGE_KEY_URL, url); }

  // --- 在庫の永続化（localStorage）---
  function saveVaultLocal() {
    localStorage.setItem(STORAGE_KEY_VAULT, JSON.stringify(vault));
  }

  function loadVaultLocal() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VAULT);
      if (saved) {
        const data = JSON.parse(saved);
        DENOMINATIONS.forEach(d => {
          vault[d.id] = data[d.id] || 0;
        });
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  // --- DOM参照 ---
  const balanceValueEl = document.getElementById('balance-value');
  const balanceAmountEl = document.getElementById('balance-amount');
  const setupPanel = document.getElementById('setup-panel');
  const gasUrlInput = document.getElementById('gas-url-input');
  const syncStatus = document.getElementById('sync-status');
  const loadingOverlay = document.getElementById('loading-overlay');
  const toastContainer = document.getElementById('toast-container');

  function formatNumber(num) { return num.toLocaleString('ja-JP'); }

  // --- トースト通知 ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- ローディング ---
  function showLoading() { loadingOverlay.classList.add('active'); }
  function hideLoading() { loadingOverlay.classList.remove('active'); }

  // --- 同期ステータス ---
  function setSyncStatus(status) {
    const text = syncStatus.querySelector('.sync-text');
    syncStatus.className = 'sync-status sync-' + status;
    const labels = {
      connected: '記録中',
      syncing: '送信中...',
      error: '送信エラー',
      disconnected: '未接続',
      offline: 'オフライン',
    };
    text.textContent = labels[status] || '未接続';
  }

  // --- セットアップパネル ---
  function showSetupPanel() {
    setupPanel.classList.add('active');
    gasUrlInput.value = getGasUrl();
  }
  function hideSetupPanel() { setupPanel.classList.remove('active'); }

  // --- 合計計算 ---
  function calculateTotal() {
    let total = 0;
    DENOMINATIONS.forEach(d => { total += d.value * (vault[d.id] || 0); });
    return total;
  }

  // --- UI更新 ---
  function updateBalance() {
    balanceValueEl.textContent = formatNumber(calculateTotal());
    balanceAmountEl.classList.remove('updated');
    void balanceAmountEl.offsetWidth;
    balanceAmountEl.classList.add('updated');
  }

  function updateStockDisplay(denomId) {
    const stockEl = document.getElementById(`stock-${denomId}`);
    stockEl.textContent = vault[denomId];
    const item = stockEl.closest('.breakdown-item');
    vault[denomId] > 0 ? item.classList.add('has-stock') : item.classList.remove('has-stock');
  }

  function updateAllUI() {
    updateBalance();
    DENOMINATIONS.forEach(d => updateStockDisplay(d.id));
  }

  // --- フラッシュエフェクト ---
  function flashCard(denomId, type) {
    const card = document.querySelector(`.denomination-card[data-denom="${denomId}"]`);
    card.classList.remove('flash-deposit', 'flash-withdraw');
    void card.offsetWidth;
    card.classList.add(type === 'deposit' ? 'flash-deposit' : 'flash-withdraw');
    setTimeout(() => card.classList.remove('flash-deposit', 'flash-withdraw'), 500);
  }

  function flashBreakdown(denomId) {
    const stockEl = document.getElementById(`stock-${denomId}`);
    stockEl.classList.remove('stock-updated');
    void stockEl.offsetWidth;
    stockEl.classList.add('stock-updated');
    setTimeout(() => stockEl.classList.remove('stock-updated'), 600);
  }

  // =============================================
  // スプレッドシート記録（no-cors POST）
  // データは確実に送信されるが、レスポンスは読めない
  // =============================================

  async function sendToSheet(type, denomId, count) {
    const url = getGasUrl();
    if (!url) return;

    const data = {
      type: type,
      denom: denomId,
      count: count,
      vault: { ...vault },
      totalBalance: calculateTotal(),
    };

    try {
      setSyncStatus('syncing');

      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        body: JSON.stringify(data),
      });

      // no-cors: レスポンスは読めないが、GAS側で確実に処理される
      setSyncStatus('connected');
      showToast(`${type}を記録: ${denomId}円 × ${count}枚`, 'success');

    } catch (err) {
      setSyncStatus('error');
      showToast('送信エラー（ローカルには保存済み）', 'error');
      console.error('GAS送信エラー:', err);
    }
  }

  // --- イベントハンドラ ---
  function getInputCount(denomId) {
    const val = parseInt(document.getElementById(`input-${denomId}`).value, 10);
    return isNaN(val) || val < 1 ? 1 : val;
  }

  function handleDeposit(denomId) {
    const count = getInputCount(denomId);
    vault[denomId] += count;
    saveVaultLocal();
    updateAllUI();
    flashCard(denomId, 'deposit');
    flashBreakdown(denomId);
    sendToSheet('入金', denomId, count);
  }

  function handleWithdraw(denomId) {
    const count = getInputCount(denomId);
    if (vault[denomId] < count) {
      const card = document.querySelector(`.denomination-card[data-denom="${denomId}"]`);
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 500);
      showToast('在庫が不足しています', 'error');
      return;
    }
    vault[denomId] -= count;
    saveVaultLocal();
    updateAllUI();
    flashCard(denomId, 'withdraw');
    flashBreakdown(denomId);
    sendToSheet('出金', denomId, count);
  }

  // --- カスタム確認モーダル（confirm代替） ---
  const confirmModal = document.getElementById('confirm-modal');
  const confirmOkBtn = document.getElementById('confirm-ok');
  const confirmCancelBtn = document.getElementById('confirm-cancel');

  function showConfirm(message) {
    return new Promise((resolve) => {
      document.getElementById('confirm-modal-text').textContent = message;
      confirmModal.classList.add('active');

      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function cleanup() {
        confirmOkBtn.removeEventListener('click', onOk);
        confirmCancelBtn.removeEventListener('click', onCancel);
        confirmModal.classList.remove('active');
      }

      confirmOkBtn.addEventListener('click', onOk);
      confirmCancelBtn.addEventListener('click', onCancel);
    });
  }

  async function handleReset() {
    const ok = await showConfirm('すべての在庫をリセットしますか？');
    if (!ok) return;
    DENOMINATIONS.forEach(d => { vault[d.id] = 0; });
    saveVaultLocal();
    updateAllUI();
    showToast('在庫をリセットしました', 'info');
  }

  function handleConnect() {
    const url = gasUrlInput.value.trim();
    if (!url) { showToast('URLを入力してください', 'error'); return; }
    if (!url.startsWith('https://script.google.com/')) {
      showToast('正しいGAS URLを入力してください', 'error');
      return;
    }
    setGasUrl(url);
    hideSetupPanel();
    setSyncStatus('connected');
    showToast('スプレッドシート連携を設定しました', 'success');
  }

  // --- スプレッドシートから在庫を同期（JSONP） ---
  function fetchVaultFromSheet() {
    return new Promise((resolve, reject) => {
      const url = getGasUrl();
      if (!url) { reject(new Error('GAS URLが未設定です')); return; }

      const callbackName = '_gasSync_' + Date.now();
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        delete window[callbackName];
        script.remove();
        reject(new Error('同期タイムアウト'));
      }, 15000);

      window[callbackName] = (data) => {
        clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        resolve(data);
      };

      script.src = url + '?callback=' + callbackName;
      script.onerror = () => {
        clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        reject(new Error('同期エラー'));
      };
      document.body.appendChild(script);
    });
  }

  async function handleSync() {
    const syncBtn = document.getElementById('btn-sync');
    syncBtn.classList.add('syncing');
    setSyncStatus('syncing');

    try {
      const data = await fetchVaultFromSheet();
      if (data && data.success && data.vault) {
        // スプレッドシートの最新在庫でlocalStorageを更新
        DENOMINATIONS.forEach(d => {
          vault[d.id] = data.vault[d.id] || 0;
        });
        saveVaultLocal();
        updateAllUI();
        setSyncStatus('connected');
        showToast('スプレッドシートと同期しました', 'success');
      } else {
        setSyncStatus('error');
        showToast('同期データが不正です', 'error');
      }
    } catch (err) {
      setSyncStatus('error');
      showToast(err.message || '同期に失敗しました', 'error');
      console.error('同期エラー:', err);
    } finally {
      syncBtn.classList.remove('syncing');
    }
  }

  // --- イベント登録 ---
  function bindEvents() {
    DENOMINATIONS.forEach(d => {
      document.getElementById(`deposit-${d.id}`).addEventListener('click', () => handleDeposit(d.id));
      document.getElementById(`withdraw-${d.id}`).addEventListener('click', () => handleWithdraw(d.id));
      const inputEl = document.getElementById(`input-${d.id}`);
      inputEl.addEventListener('focus', () => inputEl.select());
      inputEl.addEventListener('blur', () => {
        const val = parseInt(inputEl.value, 10);
        if (isNaN(val) || val < 1) inputEl.value = 1;
      });
    });
    document.getElementById('btn-reset').addEventListener('click', handleReset);
    document.getElementById('btn-sync').addEventListener('click', handleSync);
    document.getElementById('btn-settings').addEventListener('click', showSetupPanel);
    document.getElementById('btn-setup-close').addEventListener('click', hideSetupPanel);
    document.getElementById('btn-connect').addEventListener('click', handleConnect);
  }

  // --- 初期化 ---
  function init() {
    bindEvents();

    // localStorageから在庫を復元
    const loaded = loadVaultLocal();
    updateAllUI();

    if (loaded) {
      showToast('在庫データを復元しました', 'info');
    }

    const savedUrl = getGasUrl();
    if (savedUrl) {
      gasUrlInput.value = savedUrl;
      hideSetupPanel();
      setSyncStatus('connected');
    } else {
      showSetupPanel();
      setSyncStatus('disconnected');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
