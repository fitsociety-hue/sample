/* ============================================================
   물품검수조서 v2 - gas-code.js
   Google Apps Script 백엔드
   ============================================================ */

const SPREADSHEET_ID = '1CrB6AQEMm8JxnJ8HTVK-gVkwCWtcC8NhIecsEBUSL5M';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const LOG_SHEET_NAME = '제출기록';
const DRIVE_FOLDER = '물품검수조서';

/* ============================================================
   POST - 새 검수조서 제출
   ============================================================ */
function doPost(e) {
    const cors = buildCORS();
    try {
        const data = JSON.parse(e.postData.contents);

        // 1. 스프레드시트에 양식 저장
        const { sheetName, sheetUrl } = writeToSpreadsheet(data);

        // 2. 비밀번호 해시
        const pinHash = hashPIN(data.pin || '');

        // 3. 제출 기록 로그
        addToLog({
            sheetName, sheetUrl, pinHash,
            itemName: data.itemName || '',
            itemTotal: data.itemTotal || '',
            authorName: data.authorName || '',
            teamName: data.teamName || '',
            deptType: data.deptType || '개인',
            inspectionDate: data.inspectionDate || '',
        });

        return cors.createTextOutput(JSON.stringify({
            status: 'ok', sheetName, sheetUrl, spreadsheetUrl: SPREADSHEET_URL
        })).setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return cors.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/* ============================================================
   GET - 목록 / 삭제
   ============================================================ */
function doGet(e) {
    const action = e.parameter.action;

    if (action === 'list') {
        return buildCORS()
            .createTextOutput(JSON.stringify(getSubmissionLog()))
            .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'delete') {
        const rowId = e.parameter.rowId;
        const pin = e.parameter.pin || '';
        const result = deleteRecord(rowId, pin);
        return buildCORS()
            .createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // health check
    return buildCORS()
        .createTextOutput(JSON.stringify({ status: 'ok', version: 2 }))
        .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   SPREADSHEET WRITER
   ============================================================ */
function writeToSpreadsheet(data) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const now = new Date();
    const dept = data.deptType === '사업팀' && data.teamName
        ? `${data.teamName} (${data.authorName})`
        : data.authorName || '';

    const sheetName = `${data.itemName || '물품'}_${Utilities.formatDate(now, 'Asia/Seoul', 'MMdd_HHmm')}`;

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    sheet.clearContents();

    // 기본 정보
    const rows = [
        ['물품검수조서'],
        [],
        ['검수일자', data.inspectionDate || '', '', '영수증일자', data.receiptDate || ''],
        ['관련문서', data.relatedDoc || '', '', '', ''],
        ['구입부서', data.department || '', '', '작성자', dept],
        [],
        ['물품명', data.itemName || '', '', '', ''],
        ['규격', data.itemSpec || '', '', '단위', data.itemUnit || ''],
        ['수량', data.itemQty || '', '', '단가', data.itemPrice || ''],
        ['합계금액', data.itemTotal || '', '', '공급업체', data.supplier || ''],
        [],
        ['물품구매자', data.buyerName || '', '', '검수입회자', data.inspectorName || ''],
    ];

    sheet.getRange(1, 1, rows.length, 5).setValues(rows);
    sheet.getRange(1, 1).setFontSize(16).setFontWeight('bold');

    // 사진 저장 (이미지는 구글 드라이브에)
    if (data.photos && data.photos.length) {
        const folder = getOrCreateFolder(DRIVE_FOLDER);
        data.photos.forEach((b64, i) => {
            try {
                const blob = Utilities.newBlob(
                    Utilities.base64Decode(b64.split(',')[1]),
                    'image/jpeg',
                    `${sheetName}_사진${i + 1}.jpg`
                );
                const file = folder.createFile(blob);
                sheet.getRange(rows.length + i + 1, 1).setValue(`사진${i + 1}: ${file.getUrl()}`);
            } catch (e) { /* 사진 저장 실패는 무시 */ }
        });
    }

    SpreadsheetApp.flush();
    const sheetUrl = `${SPREADSHEET_URL}#gid=${sheet.getSheetId()}`;
    return { sheetName, sheetUrl };
}

/* ============================================================
   LOG SHEET
   ============================================================ */
function addToLog(info) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let log = ss.getSheetByName(LOG_SHEET_NAME);

    if (!log) {
        log = ss.insertSheet(LOG_SHEET_NAME);
        log.appendRow(['rowId', '제출일시', '물품명', '금액', '구분', '팀명', '작성자', '검수일', '시트명', '시트URL', 'pinHash']);
        log.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#DBEAFE');
    }

    const rowId = Utilities.getUuid();
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    log.appendRow([
        rowId, now,
        info.itemName, info.itemTotal,
        info.deptType, info.teamName, info.authorName,
        info.inspectionDate,
        info.sheetName, info.sheetUrl,
        info.pinHash,
    ]);
    SpreadsheetApp.flush();
}

function getSubmissionLog() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const log = ss.getSheetByName(LOG_SHEET_NAME);
    if (!log || log.getLastRow() < 2) return [];

    const rows = log.getRange(2, 1, log.getLastRow() - 1, 11).getValues();
    return rows.map(r => ({
        rowId: r[0],
        submittedAt: r[1],
        itemName: r[2],
        itemTotal: r[3],
        deptType: r[4],
        teamName: r[5],
        authorName: r[6],
        inspectionDate: r[7],
        sheetName: r[8],
        sheetUrl: r[9],
        // pinHash 는 반환하지 않음
    }));
}

/* ============================================================
   DELETE (비밀번호 확인 후)
   ============================================================ */
function deleteRecord(rowId, pin) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const log = ss.getSheetByName(LOG_SHEET_NAME);
    if (!log) return { status: 'error', message: '기록 시트 없음' };

    const data = log.getDataRange().getValues();
    const headers = data[0];
    const rowIdCol = headers.indexOf('rowId');
    const pinHashCol = headers.indexOf('pinHash');

    for (let i = 1; i < data.length; i++) {
        if (data[i][rowIdCol] === rowId) {
            const storedHash = data[i][pinHashCol];
            const inputHash = hashPIN(pin);
            if (storedHash !== inputHash) return { status: 'error', message: '비밀번호가 맞지 않습니다' };
            log.deleteRow(i + 1);
            SpreadsheetApp.flush();
            return { status: 'ok' };
        }
    }
    return { status: 'error', message: '기록을 찾을 수 없습니다' };
}

/* ============================================================
   HELPERS
   ============================================================ */
function hashPIN(pin) {
    if (!pin) return '';
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
    return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function buildCORS() {
    return ContentService;
}

function getOrCreateFolder(name) {
    const it = DriveApp.getFoldersByName(name);
    return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
