/* ============================================================
   물품검수조서 v4 - gas-code.js
   회원가입 / 로그인 / 제출 / 기록 조회
   ============================================================ */

const SPREADSHEET_ID = '1CrB6AQEMm8JxnJ8HTVK-gVkwCWtcC8NhIecsEBUSL5M';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const LOG_SHEET = '제출기록';
const USER_SHEET = '회원정보';
const DRIVE_FOLDER = '물품검수조서';

/* ── GET ─────────────────────────────────────── */
function doGet(e) {
    const action = e.parameter.action || '';

    if (action === 'register') return handleRegister(e);
    if (action === 'login') return handleLogin(e);
    if (action === 'list') return handleList(e);

    return json({ status: 'ok', version: 4 });
}

/* ── POST ────────────────────────────────────── */
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        if (data.action === 'register') return handleRegisterPost(data);
        return handleSubmit(data);
    } catch (err) {
        return json({ status: 'error', message: err.toString() });
    }
}

/* ══════════════════════════════════════════════
   회원가입
   ══════════════════════════════════════════════ */
function handleRegisterPost(data) {
    const name = (data.name || '').trim();
    const teamName = (data.teamName || '').trim();
    const pin = (data.pin || '').trim();

    if (!name || pin.length !== 4) return json({ status: 'error', message: '이름과 비밀번호(4자리)를 입력하세요' });

    const sheet = getUserSheet();
    const rows = sheet.getDataRange().getValues();

    // 중복 이름 확인
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] === name) return json({ status: 'error', message: '이미 등록된 이름입니다' });
    }

    const userId = Utilities.getUuid();
    const pinHash = hashPIN(pin);
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    sheet.appendRow([userId, name, teamName, pinHash, now]);
    SpreadsheetApp.flush();

    return json({ status: 'ok', userId, name, teamName });
}

function handleRegister(e) {
    // GET 방식도 지원 (CORS 우회)
    const data = {
        action: 'register',
        name: e.parameter.name || '',
        teamName: e.parameter.teamName || '',
        pin: e.parameter.pin || '',
    };
    return handleRegisterPost(data);
}

/* ══════════════════════════════════════════════
   로그인
   ══════════════════════════════════════════════ */
function handleLogin(e) {
    const name = (e.parameter.name || '').trim();
    const pin = (e.parameter.pin || '').trim();
    const pinHash = hashPIN(pin);

    const sheet = getUserSheet();
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] === name && rows[i][3] === pinHash) {
            return json({
                status: 'ok',
                userId: rows[i][0],
                name: rows[i][1],
                teamName: rows[i][2],
            });
        }
    }
    return json({ status: 'error', message: '이름 또는 비밀번호가 맞지 않습니다' });
}

/* ══════════════════════════════════════════════
   문서 제출
   ══════════════════════════════════════════════ */
function handleSubmit(data) {
    const { sheetName, sheetUrl } = writeToSpreadsheet(data);
    addToLog(data, sheetName, sheetUrl);
    return json({ status: 'ok', sheetName, sheetUrl });
}

function writeToSpreadsheet(data) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const now = new Date();
    const label = data.teamName ? `${data.teamName} / ${data.name}` : (data.name || '');
    const sheetName = `${data.itemName || '물품'}_${Utilities.formatDate(now, 'Asia/Seoul', 'MMdd_HHmm')}`;

    let sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    sheet.clearContents();

    const rows = [
        ['물품검수조서', '', '', ''],
        ['', '', '', ''],
        ['관련 문서', data.relatedDoc || '', '', ''],
        ['품  목', data.itemName || '', '구매금액', data.itemTotal || ''],
        ['검수연월일', data.inspectionDate || '', '물품구매자', data.buyerName || ''],
        ['검수 장소', data.inspectionPlace || '', '검수입회자', data.inspectorName || ''],
        ['', '', '', ''],
        ['작성자', label, '', ''],
    ];
    sheet.getRange(1, 1, rows.length, 4).setValues(rows);
    sheet.getRange(1, 1, 1, 4).merge().setHorizontalAlignment('center').setFontSize(16).setFontWeight('bold');

    // 사진 → 드라이브 저장
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
                sheet.getRange(rows.length + i + 2, 1).setValue(`사진${i + 1}: ${file.getUrl()}`);
            } catch (_) { }
        });
    }

    SpreadsheetApp.flush();
    return { sheetName, sheetUrl: `${SPREADSHEET_URL}#gid=${sheet.getSheetId()}` };
}

/* ══════════════════════════════════════════════
   기록 조회 (userId 필터)
   ══════════════════════════════════════════════ */
function handleList(e) {
    const userId = e.parameter.userId || '';
    const log = getLogSheet();
    if (!log || log.getLastRow() < 2) return json([]);

    const rows = log.getRange(2, 1, log.getLastRow() - 1, 10).getValues();
    const result = rows
        .filter(r => !userId || r[1] === userId)
        .map(r => ({
            rowId: r[0],
            userId: r[1],
            submittedAt: r[2],
            itemName: r[3],
            itemTotal: r[4],
            name: r[5],
            teamName: r[6],
            inspectionDate: r[7],
            sheetUrl: r[9],
        }));
    return json(result);
}

function addToLog(data, sheetName, sheetUrl) {
    const log = getLogSheet();
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    log.appendRow([
        Utilities.getUuid(),  // rowId
        data.userId || '',
        now,
        data.itemName || '',
        data.itemTotal || '',
        data.name || '',
        data.teamName || '',
        data.inspectionDate || '',
        sheetName,
        sheetUrl,
    ]);
    SpreadsheetApp.flush();
}

/* ══════════════════════════════════════════════
   시트 헬퍼
   ══════════════════════════════════════════════ */
function getUserSheet() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let s = ss.getSheetByName(USER_SHEET);
    if (!s) {
        s = ss.insertSheet(USER_SHEET);
        s.appendRow(['userId', 'name', 'teamName', 'pinHash', 'createdAt']);
        s.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#DBEAFE');
    }
    return s;
}

function getLogSheet() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let s = ss.getSheetByName(LOG_SHEET);
    if (!s) {
        s = ss.insertSheet(LOG_SHEET);
        s.appendRow(['rowId', 'userId', '제출일시', '품목', '금액', '이름', '팀명', '검수일', '시트명', '시트URL']);
        s.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#DBEAFE');
    }
    return s;
}

function getOrCreateFolder(name) {
    const it = DriveApp.getFoldersByName(name);
    return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/* ══════════════════════════════════════════════
   유틸
   ══════════════════════════════════════════════ */
function hashPIN(pin) {
    if (!pin) return '';
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
    return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function json(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
