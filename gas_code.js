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
 *   3. このコード全体をコピーして貼り付け
 *   4. 保存（Ctrl+S）
 *   5. 「デプロイ」→「新しいデプロイ」
 *   6. 種類:「ウェブアプリ」を選択
 *   7. アクセスできるユーザー:「全員」
 *   8. 「デプロイ」をクリック
 *   9. 表示されたURLをコピーしてアプリに設定
 * ============================================================
 */

const SHEET_NAME = '金庫管理';

/**
 * ヘッダー行を初期化（存在しなければ作成）
 */
function ensureHeaders(sheet) {
  const headers = [
    '日時', '区分', '金種', '枚数', '金額',
    '50円在庫', '100円在庫', '500円在庫', '1000円在庫', '5000円在庫',
    '合計残高'
  ];
  
  const firstCell = sheet.getRange('A1').getValue();
  if (firstCell !== '日時') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // ヘッダーの書式設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return createJsonResponse({ success: false, error: 'シートが見つかりません' });
    }
    
    ensureHeaders(sheet);
    
    const lastRow = sheet.getLastRow();
    
    // データが無い場合（ヘッダーのみ）
    if (lastRow <= 1) {
      return createJsonResponse({
        success: true,
        vault: { '50': 0, '100': 0, '500': 0, '1000': 0, '5000': 0 },
        totalBalance: 0,
        lastUpdated: null
      });
    }
    
    // 最終行から在庫情報を取得
    const lastRowData = sheet.getRange(lastRow, 1, 1, 11).getValues()[0];
    
    return createJsonResponse({
      success: true,
      vault: {
        '50': lastRowData[5] || 0,
        '100': lastRowData[6] || 0,
        '500': lastRowData[7] || 0,
        '1000': lastRowData[8] || 0,
        '5000': lastRowData[9] || 0,
      },
      totalBalance: lastRowData[10] || 0,
      lastUpdated: lastRowData[0] ? lastRowData[0].toString() : null
    });
    
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * POST: 入出金データを記録
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return createJsonResponse({ success: false, error: 'シートが見つかりません' });
    }
    
    ensureHeaders(sheet);
    
    // データの検証
    const type = data.type;       // '入金' or '出金'
    const denom = data.denom;     // '50', '100', '500', '1000', '5000'
    const count = data.count;     // 枚数
    const vault = data.vault;     // 現在の在庫状態 { '50': n, '100': n, ... }
    const totalBalance = data.totalBalance;
    
    if (!type || !denom || !count || !vault) {
      return createJsonResponse({ success: false, error: 'パラメータ不足' });
    }
    
    const denomValue = parseInt(denom);
    const amount = denomValue * count;
    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    
    // 新しい行を追加
    const newRow = [
      now,
      type,
      denom + '円',
      count,
      (type === '入金' ? '+' : '-') + amount.toLocaleString(),
      vault['50'] || 0,
      vault['100'] || 0,
      vault['500'] || 0,
      vault['1000'] || 0,
      vault['5000'] || 0,
      totalBalance
    ];
    
    sheet.appendRow(newRow);
    
    // 金額列の書式設定（入金は緑、出金は赤）
    const lastRow = sheet.getLastRow();
    const typeCell = sheet.getRange(lastRow, 2);
    const amountCell = sheet.getRange(lastRow, 5);
    
    if (type === '入金') {
      typeCell.setFontColor('#00e676');
      amountCell.setFontColor('#00e676');
    } else {
      typeCell.setFontColor('#ff4466');
      amountCell.setFontColor('#ff4466');
    }
    
    return createJsonResponse({
      success: true,
      message: `${type}を記録しました: ${denom}円 × ${count}枚`,
      row: lastRow
    });
    
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

/**
 * JSON レスポンスを作成（CORS対応）
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
