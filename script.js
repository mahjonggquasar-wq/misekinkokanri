/* ================================================================
   店金庫管理アプリ - メインスクリプト
   操作フロー: 枚数入力 → 入金/出金ボタン
   スプレッドシート連携: Google Apps Script Web API
   通信方式: GET=JSONP / POST=no-cors fetch（CORS回避）
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

  // --- GAS API URL（localStorageに保存）---
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

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- ローディング ---
  function showLoading() {
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }

  // --- 同期ステータス ---
  function setSyncStatus(status) {
    const text = syncStatus.querySelector('.sync-text');
    syncStatus.className = 'sync-status sync-' + status;
    switch (status) {
      case 'connected':
        text.textContent = '接続済み';
        break;
      case 'syncing':
        text.textContent = '同期中...';
        break;
      case 'error':
        text.textContent = 'エラー';
        break;
      default:
        text.textContent = '未接続';
    }
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
    DENOMINATIONS.forEach(d => {
      total += d.value * (vault[d.id] || 0);
    });
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
    if (vault[denomId] > 0) {
      item.classList.add('has-stock');
    } else {
      item.classList.remove('has-stock');
    }
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
  // API通信（CORS回避版）
  // GET: JSONP（<script>タグ方式）
  // POST: fetch mode:'no-cors'
  // =============================================

  /**
   * JSONP方式でGETリクエスト（CORS完全回避）
   */
  function apiGetJsonp() {
    const url = getGasUrl();
    if (!url) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const callbackName = '_gasCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('タイムアウト（15秒）'));
      }, 15000);

      function cleanup() {
        clearTimeout(timeoutId);
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      // グローバルコールバック関数を登録
      window[callbackName] = (data) => {
        cleanup();
        resolve(data);
      };

      // <script>タグでリクエスト
      const script = document.createElement('script');
      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
      script.onerror = () => {
        cleanup();
        reject(new Error('スクリプト読み込みエラー'));
      };
      document.body.appendChild(script);
    });
  }

  /**
   * no-cors mode でPOSTリクエスト（レスポンスは読めないが記録される）
   */
  async function apiPostNoCorst(data) {
    const url = getGasUrl();
    if (!url) return null;

    try {
      setSyncStatus('syncing');
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
      });
      // no-cors ではレスポンスは読めないが、GAS側で正常に記録される
      setSyncStatus('connected');
      return { success: true };
    } catch (err) {
      setSyncStatus('error');
      showToast('通信エラー: ' + err.message, 'error');
      return null;
    }
  }

  // --- シートから在庫を復元 ---
  async function loadVaultFromSheet() {
    const url = getGasUrl();
    if (!url) return;

    try {
      setSyncStatus('syncing');
      showLoading();
      const result = await apiGetJsonp();
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
    const result = await apiPostNoCorst(data);
    if (result && result.success) {
      showToast(`${type}を記録しました: ${denomId}円 × ${count}枚`, 'success');
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
    DENOMINATIONS.forEach(d => {
      vault[d.id] = 0;
    });
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
