/* ================================================================
   店金庫管理アプリ - メインスクリプト
   操作フロー: 枚数入力 → 入金/出金ボタン
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

  // --- 金庫の在庫（各金種の現在枚数）---
  const vault = {};
  DENOMINATIONS.forEach(d => { vault[d.id] = 0; });

  // --- DOM参照 ---
  const balanceValueEl = document.getElementById('balance-value');
  const balanceAmountEl = document.getElementById('balance-amount');

  // --- ユーティリティ ---
  function formatNumber(num) {
    return num.toLocaleString('ja-JP');
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

    // パルスアニメーション
    balanceAmountEl.classList.remove('updated');
    void balanceAmountEl.offsetWidth;
    balanceAmountEl.classList.add('updated');
  }

  function updateStockDisplay(denomId) {
    const stockEl = document.getElementById(`stock-${denomId}`);
    stockEl.textContent = vault[denomId];

    // 0枚のときは薄く、在庫あるときは明るく
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
  }

  function handleWithdraw(denomId) {
    const count = getInputCount(denomId);
    if (vault[denomId] < count) {
      // 在庫不足 → カードを揺らす
      const card = document.querySelector(`.denomination-card[data-denom="${denomId}"]`);
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 500);
      return;
    }
    vault[denomId] -= count;
    updateAllUI();
    flashCard(denomId, 'withdraw');
    flashBreakdown(denomId);
  }

  function handleReset() {
    if (!confirm('すべての在庫をリセットしますか？')) return;
    DENOMINATIONS.forEach(d => {
      vault[d.id] = 0;
    });
    updateAllUI();
  }

  // --- イベント登録 ---
  function bindEvents() {
    DENOMINATIONS.forEach(d => {
      const depositBtn = document.getElementById(`deposit-${d.id}`);
      const withdrawBtn = document.getElementById(`withdraw-${d.id}`);
      const inputEl = document.getElementById(`input-${d.id}`);

      depositBtn.addEventListener('click', () => handleDeposit(d.id));
      withdrawBtn.addEventListener('click', () => handleWithdraw(d.id));

      // フォーカス時に全選択
      inputEl.addEventListener('focus', () => inputEl.select());

      // 値が空になったら1にリセット
      inputEl.addEventListener('blur', () => {
        const val = parseInt(inputEl.value, 10);
        if (isNaN(val) || val < 1) inputEl.value = 1;
      });
    });

    // リセットボタン
    document.getElementById('btn-reset').addEventListener('click', handleReset);
  }

  // --- 初期化 ---
  function init() {
    bindEvents();
    updateAllUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
