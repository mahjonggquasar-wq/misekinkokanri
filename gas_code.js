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
 * ============================================================
 */

var SHEET_NAME = '金庫管理';

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
 * POST: 入出金データを記録
 * no-cors モードのリクエストに対応
 * （Content-Type が text/plain の場合でも正しくパース）
 */
function doPost(e) {
  try {
    // no-cors fetch では postData の形式が異なる場合がある
    var rawData = '';
    
    // postData.contents から取得（通常のPOST）
    if (e.postData && e.postData.contents) {
      rawData = e.postData.contents;
    }
    // parameter.data から取得（form送信）
    else if (e.parameter && e.parameter.data) {
      rawData = e.parameter.data;
    }
    
    // デバッグログ
    Logger.log('受信データ: ' + rawData);
    Logger.log('postData type: ' + (e.postData ? e.postData.type : 'none'));
    
    if (!rawData) {
      Logger.log('データが空です');
      return jsonResponse({ success: false, error: 'データが空です' });
    }
    
    var data = JSON.parse(rawData);
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    
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
      Logger.log('パラメータ不足: type=' + type + ' denom=' + denom + ' count=' + count);
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
    Logger.log('記録完了: ' + newRow.join(', '));
    
    // 書式設定
    var lastRow = sheet.getLastRow();
    var typeCell = sheet.getRange(lastRow, 2);
    var amountCell = sheet.getRange(lastRow, 5);
    
    if (type === '入金') {
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
    Logger.log('エラー発生: ' + error.toString());
    Logger.log('スタックトレース: ' + error.stack);
    return jsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * GET: テスト用（ブラウザで直接アクセスして動作確認）
 */
function doGet(e) {
  return jsonResponse({
    success: true,
    message: '店金庫管理 GAS API は正常に動作しています',
    timestamp: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
  });
}

/**
 * JSONレスポンスを作成
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * テスト用関数（Apps Scriptエディタから実行して動作確認）
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
