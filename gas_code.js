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
 * GET: 最新の在庫状況を返す
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return jsonResponse({ success: false, error: 'シートが見つかりません' });
    }
    
    ensureHeaders(sheet);
    var lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return jsonResponse({
        success: true,
        vault: { '50': 0, '100': 0, '500': 0, '1000': 0, '5000': 0 },
        totalBalance: 0,
        lastUpdated: null
      });
    }
    
    var lastRowData = sheet.getRange(lastRow, 1, 1, 11).getValues()[0];
    
    return jsonResponse({
      success: true,
      vault: {
        '50': lastRowData[5] || 0,
        '100': lastRowData[6] || 0,
        '500': lastRowData[7] || 0,
        '1000': lastRowData[8] || 0,
        '5000': lastRowData[9] || 0
      },
      totalBalance: lastRowData[10] || 0,
      lastUpdated: lastRowData[0] ? lastRowData[0].toString() : null
    });
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * POST: 入出金データを記録
 */
function doPost(e) {
  try {
    var rawData = e.postData ? e.postData.contents : '';
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
    
    if (!type || !denom || !count || !vault) {
      return jsonResponse({ success: false, error: 'パラメータ不足' });
    }
    
    var denomValue = parseInt(denom);
    var amount = denomValue * count;
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    
    var newRow = [
      now, type, denom + '円', count,
      (type === '入金' ? '+' : '-') + amount,
      vault['50'] || 0, vault['100'] || 0, vault['500'] || 0,
      vault['1000'] || 0, vault['5000'] || 0,
      totalBalance
    ];
    
    sheet.appendRow(newRow);
    
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
    return jsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * JSONレスポンスを作成
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
