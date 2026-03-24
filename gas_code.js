/**
 * ============================================================
 * 店金庫管理アプリ - Google Apps Script (GAS)
 * 
 * このコードをスプレッドシートの Apps Script エディタに
 * コピー＆ペーストしてデプロイしてください。
 * 
 * セットアップ手順:
 *   1. スプレッドシートを開く
 *   2. メニュー「拡張機能」→「Apps Script」
 *   3. このコード全体をコピーして貼り付け → 保存
 *   4. 「デプロイ」→「新しいデプロイ」→ ウェブアプリ
 *      （更新時は「デプロイを管理」→ 鉛筆 → 新バージョン）
 *   5. アクセスできるユーザー:「全員」→ デプロイ
 *   6. 表示されたURLをアプリに設定
 * 
 * ※ スプレッドシートを開き直すと、メニューに
 *   「金庫管理」→「レジ金精算」が追加されます。
 * ============================================================
 */

var SHEET_KINKO = '金庫管理';
var SHEET_REGISTER = 'レジ金確認';

/**
 * スプレッドシート起動時にカスタムメニューを追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💰 金庫管理')
    .addItem('🔄 レジ金精算', 'registerCheck')
    .addToUi();
}

/**
 * ヘッダー行を初期化
 */
function ensureHeaders(sheet) {
  var headers = [
    '日時', '区分', '金種', '枚数', '金額',
    '50円在庫', '100円在庫', '500円在庫', '1000円在庫', '5000円在庫',
    '合計残高'
  ];
  
  var firstCell = sheet.getRange('A1').getValue();
  if (firstCell !== '日時') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a1a2e');
    headerRange.setFontColor('#f0d78c');
    sheet.setFrozenRows(1);
  }
}

/**
 * 金庫管理シートから最新の在庫を取得
 */
function getCurrentVault() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_KINKO);
  
  if (!sheet) return { '50': 0, '100': 0, '500': 0, '1000': 0, '5000': 0 };
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { '50': 0, '100': 0, '500': 0, '1000': 0, '5000': 0 };
  }
  
  var data = sheet.getRange(lastRow, 1, 1, 11).getValues()[0];
  return {
    '50': data[5] || 0,
    '100': data[6] || 0,
    '500': data[7] || 0,
    '1000': data[8] || 0,
    '5000': data[9] || 0
  };
}

/**
 * 在庫の合計金額を計算
 */
function calcTotal(vault) {
  return (vault['50'] || 0) * 50
       + (vault['100'] || 0) * 100
       + (vault['500'] || 0) * 500
       + (vault['1000'] || 0) * 1000
       + (vault['5000'] || 0) * 5000;
}

/**
 * レジ金精算 — 「レジ金確認」タブのB10~B14を参照して規定数と比較
 * 
 * 規定数:
 *   5000円: 0枚  (B10)
 *   1000円: 20枚 (B11)
 *    500円: 13枚 (B12)
 *    100円: 30枚 (B13)
 *     50円: 10枚 (B14)
 * 
 * 在庫 > 規定数 → 差分を入金（金庫に入れる）
 * 在庫 < 規定数 → 差分を出金（金庫から出す）
 */
function registerCheck() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // レジ金確認タブから枚数を読み取る
  var regSheet = ss.getSheetByName(SHEET_REGISTER);
  if (!regSheet) {
    ui.alert('エラー', '「レジ金確認」シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }
  
  // C10~C14 = 枚数（5000円, 1000円, 500円, 100円, 50円）
  var regValues = regSheet.getRange('C10:C14').getValues();
  var registerCounts = {
    '5000': Number(regValues[0][0]) || 0,
    '1000': Number(regValues[1][0]) || 0,
    '500':  Number(regValues[2][0]) || 0,
    '100':  Number(regValues[3][0]) || 0,
    '50':   Number(regValues[4][0]) || 0
  };
  
  // 規定数
  var standard = {
    '5000': 0,
    '1000': 20,
    '500':  13,
    '100':  30,
    '50':   10
  };
  
  // 差分を計算
  var denomOrder = ['5000', '1000', '500', '100', '50'];
  var denomLabels = { '5000': '5,000円', '1000': '1,000円', '500': '500円', '100': '100円', '50': '50円' };
  var changes = [];
  
  for (var i = 0; i < denomOrder.length; i++) {
    var d = denomOrder[i];
    var current = registerCounts[d];
    var std = standard[d];
    var diff = current - std;
    
    if (diff > 0) {
      // レジに規定数より多い → 多い分を金庫に入金
      changes.push({ denom: d, label: denomLabels[d], type: '入金（精算）', count: diff });
    } else if (diff < 0) {
      // レジに規定数より少ない → 不足分を金庫から出金
      changes.push({ denom: d, label: denomLabels[d], type: '出金（精算）', count: Math.abs(diff) });
    }
  }
  
  if (changes.length === 0) {
    ui.alert('レジ金精算', 'すべての金種が規定数と一致しています。調整は不要です。', ui.ButtonSet.OK);
    return;
  }
  
  // 変更内容のプレビュー
  var preview = 'レジ金と規定数の差分:\n\n';
  for (var j = 0; j < changes.length; j++) {
    var c = changes[j];
    preview += c.label + ': ' + c.count + '枚 → ' + c.type + '\n';
  }
  preview += '\nこの精算を実行しますか？';
  
  var response = ui.alert('レジ金精算', preview, ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;
  
  // 金庫管理シートに記録
  var kinkoSheet = ss.getSheetByName(SHEET_KINKO);
  if (!kinkoSheet) {
    ui.alert('エラー', '「金庫管理」シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }
  
  ensureHeaders(kinkoSheet);
  
  // 最新の在庫を取得
  var vault = getCurrentVault();
  
  // 各差分を処理して記録
  for (var k = 0; k < changes.length; k++) {
    var change = changes[k];
    var denomValue = parseInt(change.denom);
    var amount = denomValue * change.count;
    
    // 在庫を更新
    if (change.type === '入金（精算）') {
      vault[change.denom] = (vault[change.denom] || 0) + change.count;
    } else {
      vault[change.denom] = (vault[change.denom] || 0) - change.count;
      if (vault[change.denom] < 0) vault[change.denom] = 0;
    }
    
    var totalBalance = calcTotal(vault);
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    
    var newRow = [
      now, change.type, change.denom + '円', change.count,
      (change.type.indexOf('入金') >= 0 ? '+' : '-') + amount,
      vault['50'] || 0, vault['100'] || 0, vault['500'] || 0,
      vault['1000'] || 0, vault['5000'] || 0,
      totalBalance
    ];
    
    kinkoSheet.appendRow(newRow);
    
    // 書式設定
    var lastRow = kinkoSheet.getLastRow();
    var typeCell = kinkoSheet.getRange(lastRow, 2);
    var amountCell = kinkoSheet.getRange(lastRow, 5);
    
    if (change.type.indexOf('入金') >= 0) {
      typeCell.setFontColor('#00e676');
      amountCell.setFontColor('#00e676');
    } else {
      typeCell.setFontColor('#ff4466');
      amountCell.setFontColor('#ff4466');
    }
  }
  
  ui.alert('完了', 'レジ金精算を完了しました。\n金庫管理シートに ' + changes.length + ' 件の記録を追加しました。', ui.ButtonSet.OK);
}

/**
 * POST: 入出金データを記録（Webアプリからの呼び出し用）
 */
function doPost(e) {
  try {
    var rawData = '';
    if (e.postData && e.postData.contents) {
      rawData = e.postData.contents;
    } else if (e.parameter && e.parameter.data) {
      rawData = e.parameter.data;
    }
    
    Logger.log('受信データ: ' + rawData);
    
    if (!rawData) {
      return jsonResponse({ success: false, error: 'データが空です' });
    }
    
    var data = JSON.parse(rawData);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_KINKO);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: 'シートが見つかりません' });
    }
    
    ensureHeaders(sheet);
    
    var type = data.type;
    var denom = data.denom;
    var count = data.count;
    var vault = data.vault;
    var totalBalance = data.totalBalance;
    
    if (!type || !denom || !count) {
      return jsonResponse({ success: false, error: 'パラメータ不足' });
    }
    
    var denomValue = parseInt(denom);
    var amount = denomValue * count;
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    
    var newRow = [
      now, type, denom + '円', count,
      (type === '入金' ? '+' : '-') + amount,
      vault ? (vault['50'] || 0) : 0,
      vault ? (vault['100'] || 0) : 0,
      vault ? (vault['500'] || 0) : 0,
      vault ? (vault['1000'] || 0) : 0,
      vault ? (vault['5000'] || 0) : 0,
      totalBalance || 0
    ];
    
    sheet.appendRow(newRow);
    
    var lastRow = sheet.getLastRow();
    var typeCell = sheet.getRange(lastRow, 2);
    var amountCell = sheet.getRange(lastRow, 5);
    
    if (type.indexOf('入金') >= 0) {
      typeCell.setFontColor('#00e676');
      amountCell.setFontColor('#00e676');
    } else {
      typeCell.setFontColor('#ff4466');
      amountCell.setFontColor('#ff4466');
    }
    
    return jsonResponse({
      success: true,
      message: type + 'を記録: ' + denom + '円 × ' + count + '枚'
    });
    
  } catch (error) {
    Logger.log('エラー: ' + error.toString());
    return jsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * GET: テスト用
 */
function doGet(e) {
  return jsonResponse({
    success: true,
    message: '金庫管理 GAS API は正常に動作しています',
    timestamp: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
  });
}

/**
 * JSONレスポンス
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * テスト用関数
 */
function testDoPost() {
  var mockEvent = {
    postData: {
      contents: JSON.stringify({
        type: '入金',
        denom: '1000',
        count: 1,
        vault: { '50': 0, '100': 0, '500': 0, '1000': 1, '5000': 0 },
        totalBalance: 1000
      }),
      type: 'text/plain'
    },
    parameter: {}
  };
  var result = doPost(mockEvent);
  Logger.log(result.getContent());
}
