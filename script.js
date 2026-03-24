/* ================================================================
   店金庫管理アプリ - メインスクリプト
   操作フロー: 枚数入力 → 入金/出金ボタン
   スプレッドシート連携: GAS Web API (fetch)
   ※ HTTPS環境（GitHub Pages等）からの利用を前提
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
  function getGasUrl() { return localStorage.getItem(STORAGE_KEY_URL) || ''; }
  function setGasUrl(url) { localStorage.setItem(STORAGE_KEY_URL, url); }

  // --- DOM参照 ---
  const balanceValueEl = document.getElementById('balance-value');
  const balanceAmountEl = document.getElementById('balance-amount');
  const setupPanel = document.getElementById('setup-panel');
  const gasUrlInput = document.getElementById('gas-url-input');
  const syncStatus = document.getElementById('sync-status');
  const loadingOverlay = document.getElementById('loading-overlay');
  const toastContainer = document.getElementById('toast-container');

  // --- ユーティリティ ---
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
    const labels = { connected: '接続済み', syncing: '同期中...', error: 'エラー' };
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
  // API通信（fetch — HTTPS環境前提）
  // GAS Web Appはリダイレクト(302)するため
  // redirect:'follow' で追従する
  // =============================================

  async function apiGet() {
    const url = getGasUrl();
    if (!url) return null;

    try {
      setSyncStatus('syncing');
      showLoading();

      const res = await fetch(url, { redirect: 'follow' });
      const result = await res.json();

      hideLoading();

      if (result.success) {
        setSyncStatus('connected');
      } else {
        setSyncStatus('error');
        showToast('読込エラー: ' + (result.error || '不明'), 'error');
      }
      return result;
    } catch (err) {
      hideLoading();
      setSyncStatus('error');
      showToast('通信エラー: ' + err.message, 'error');
      return null;
    }
  }

  async function apiPost(data) {
    const url = getGasUrl();
    if (!url) return null;

    try {
      setSyncStatus('syncing');

      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (result.success) {
        setSyncStatus('connected');
      } else {
        setSyncStatus('error');
        showToast('記録エラー: ' + (result.error || '不明'), 'error');
      }
      return result;
    } catch (err) {
      setSyncStatus('error');
      showToast('通信エラー: ' + err.message, 'error');
      return null;
    }
  }

  // --- シートから在庫を復元 ---
  async function loadVaultFromSheet() {
    const result = await apiGet();
    if (result && result.success) {
      DENOMINATIONS.forEach(d => {
        vault[d.id] = result.vault[d.id] || 0;
      });
      updateAllUI();
      showToast('シートから在庫を読み込みました', 'success');
    }
  }

  // --- シートに記録 ---
  async function recordToSheet(type, denomId, count) {
    const data = {
      type, denom: denomId, count,
      vault: { ...vault },
      totalBalance: calculateTotal(),
    };
    const result = await apiPost(data);
    if (result && result.success) {
      showToast(result.message, 'success');
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
    if (!url) { showToast('URLを入力してください', 'error'); return; }
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
