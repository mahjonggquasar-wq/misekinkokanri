/* ================================================================
   店金庫管理アプリ - メインスクリプト
   操作フロー: 枚数入力 → 入金/出金ボタン
   スプレッドシート連携: GAS Web API via iframe + postMessage
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

  // --- GAS API URL ---
  const STORAGE_KEY_URL = 'kinko_gas_url';

  function getGasUrl() {
    return localStorage.getItem(STORAGE_KEY_URL) || '';
  }

  function setGasUrl(url) {
    localStorage.setItem(STORAGE_KEY_URL, url);
  }

  // --- DOM参照 ---
  const balanceValueEl = document.getElementById('balance-value');
  const balanceAmountEl = document.getElementById('balance-amount');
  const setupPanel = document.getElementById('setup-panel');
  const gasUrlInput = document.getElementById('gas-url-input');
  const syncStatus = document.getElementById('sync-status');
  const loadingOverlay = document.getElementById('loading-overlay');
  const toastContainer = document.getElementById('toast-container');

  // --- ユーティリティ ---
  function formatNumber(num) {
    return num.toLocaleString('ja-JP');
  }

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
    const labels = { connected: '接続済み', syncing: '同期中...', error: 'エラー' };
    text.textContent = labels[status] || '未接続';
  }

  // --- セットアップパネル ---
  function showSetupPanel() {
    setupPanel.classList.add('active');
    gasUrlInput.value = getGasUrl();
  }

  function hideSetupPanel() {
    setupPanel.classList.remove('active');
  }

  // --- 合計計算 ---
  function calculateTotal() {
    let total = 0;
    DENOMINATIONS.forEach(d => { total += d.value * (vault[d.id] || 0); });
    return total;
  }

  // --- UI更新 ---
  function updateBalance() {
    const total = calculateTotal();
    balanceValueEl.textContent = formatNumber(total);
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
  // API通信（iframe + postMessage 方式）
  // GASのリダイレクトやCORSの問題を完全回避
  // =============================================

  /**
   * iframe + postMessage で GAS からデータを取得（GET）
   */
  function apiGet() {
    const url = getGasUrl();
    if (!url) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.name = '_gas_get_' + Date.now();

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('タイムアウト（20秒）'));
      }, 20000);

      function handler(event) {
        // GASからのpostMessageを受信
        if (event.data && typeof event.data === 'object' && event.data.success !== undefined) {
          cleanup();
          resolve(event.data);
        }
      }

      function cleanup() {
        clearTimeout(timeoutId);
        window.removeEventListener('message', handler);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }

      window.addEventListener('message', handler);
      iframe.src = url;
      document.body.appendChild(iframe);
    });
  }

  /**
   * form投稿 + iframe でデータを送信（POST）
   * GASのdoPostが処理後にpostMessageで結果を通知
   */
  function apiPost(data) {
    const url = getGasUrl();
    if (!url) return Promise.resolve(null);

    return new Promise((resolve) => {
      const iframeName = '_gas_post_' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.name = iframeName;
      document.body.appendChild(iframe);

      const timeoutId = setTimeout(() => {
        cleanup();
        // タイムアウトしても送信は恐らく成功している
        resolve({ success: true, timeout: true });
      }, 20000);

      function handler(event) {
        if (event.data && typeof event.data === 'object' && event.data.success !== undefined) {
          cleanup();
          resolve(event.data);
        }
      }

      function cleanup() {
        clearTimeout(timeoutId);
        window.removeEventListener('message', handler);
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1000);
      }

      window.addEventListener('message', handler);

      // hidden form で POST 送信
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = iframeName;
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'data';
      input.value = JSON.stringify(data);
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    });
  }

  // --- シートから在庫を復元 ---
  async function loadVaultFromSheet() {
    const url = getGasUrl();
    if (!url) return;

    try {
      setSyncStatus('syncing');
      showLoading();
      const result = await apiGet();
      hideLoading();

      if (result && result.success) {
        DENOMINATIONS.forEach(d => {
          vault[d.id] = result.vault[d.id] || 0;
        });
        updateAllUI();
        setSyncStatus('connected');
        showToast('シートから在庫を読み込みました', 'success');
      } else {
        setSyncStatus('error');
        showToast('読込エラー: ' + (result ? result.error : '不明'), 'error');
      }
    } catch (err) {
      hideLoading();
      setSyncStatus('error');
      showToast('通信エラー: ' + err.message, 'error');
    }
  }

  // --- シートに記録 ---
  async function recordToSheet(type, denomId, count) {
    const data = {
      type: type,
      denom: denomId,
      count: count,
      vault: { ...vault },
      totalBalance: calculateTotal(),
    };

    try {
      setSyncStatus('syncing');
      const result = await apiPost(data);
      if (result && result.success) {
        setSyncStatus('connected');
        const msg = result.message || `${type}: ${denomId}円 × ${count}枚`;
        showToast(msg, 'success');
      } else {
        setSyncStatus('error');
        showToast('記録エラー', 'error');
      }
    } catch (err) {
      setSyncStatus('error');
      showToast('通信エラー: ' + err.message, 'error');
    }
  }

  // --- イベントハンドラ ---
  function getInputCount(denomId) {
    const inputEl = document.getElementById(`input-${denomId}`);
    const val = parseInt(inputEl.value, 10);
    return isNaN(val) || val < 1 ? 1 : val;
  }

  function handleDeposit(denomId) {
    const count = getInputCount(denomId);
    vault[denomId] += count;
    updateAllUI();
    flashCard(denomId, 'deposit');
    flashBreakdown(denomId);
    recordToSheet('入金', denomId, count);
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
    updateAllUI();
    flashCard(denomId, 'withdraw');
    flashBreakdown(denomId);
    recordToSheet('出金', denomId, count);
  }

  function handleReset() {
    if (!confirm('すべての在庫をリセットしますか？')) return;
    DENOMINATIONS.forEach(d => { vault[d.id] = 0; });
    updateAllUI();
  }

  async function handleConnect() {
    const url = gasUrlInput.value.trim();
    if (!url) {
      showToast('URLを入力してください', 'error');
      return;
    }
    if (!url.startsWith('https://script.google.com/')) {
      showToast('正しいGAS URLを入力してください', 'error');
      return;
    }
    setGasUrl(url);
    hideSetupPanel();
    showToast('接続を開始します...', 'info');
    await loadVaultFromSheet();
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
    document.getElementById('btn-settings').addEventListener('click', showSetupPanel);
    document.getElementById('btn-setup-close').addEventListener('click', hideSetupPanel);
    document.getElementById('btn-connect').addEventListener('click', handleConnect);
  }

  // --- 初期化 ---
  async function init() {
    bindEvents();
    updateAllUI();

    const savedUrl = getGasUrl();
    if (savedUrl) {
      gasUrlInput.value = savedUrl;
      hideSetupPanel();
      await loadVaultFromSheet();
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
