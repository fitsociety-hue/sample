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
    // GAS 에디터에서 직접 실행 시 e가 undefined일 수 있음
    if (!e || !e.parameter) return json({ status: 'ok', message: 'GAS is running. Use web app URL.', version: 4 });

    const action = e.parameter.action || '';
    if (action === 'register') return handleRegister(e);
    if (action === 'login') return handleLogin(e);
    if (action === 'list') return handleList(e);
    if (action === 'get_ci') return handleGetCI(e);

    return json({ status: 'ok', version: 4 });
}

/* ── POST ────────────────────────────────────── */
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        if (data.action === 'register') return handleRegisterPost(data);
        if (data.action === 'update') return handleUpdate(data);
        if (data.action === 'delete') return handleDelete(data);
        if (data.action === 'update_ci') return handleUpdateCI(data);
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
                ciImage: rows[i][5] || '', // 6번째 열 (F열)에 CI 저장
            });
        }
    }
    return json({ status: 'error', message: '이름 또는 비밀번호가 맞지 않습니다' });
}

function handleGetCI(e) {
    const userId = e.parameter.userId;
    if (!userId) return json({ status: 'error', message: 'userId가 필요합니다' });

    const sheet = getUserSheet();
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === userId) {
            return json({
                status: 'ok',
                ciImage: rows[i][5] || ''
            });
        }
    }
    return json({ status: 'error', message: '사용자를 찾을 수 없습니다' });
}

/* ══════════════════════════════════════════════
   문서 제출
   ══════════════════════════════════════════════ */
function handleSubmit(data) {
    try {
        const { sheetName, sheetUrl, photoUrls } = writeToSpreadsheet(data);
        addToLog(data, sheetName, sheetUrl, photoUrls);
        return json({ status: 'ok', sheetName, sheetUrl });
    } catch (err) {
        return json({ status: 'error', message: '저장 실패: ' + err.toString() });
    }
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
    const photoUrls = [];
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
                try {
                    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                } catch (e) {
                    // 권한 설정 실패 무시 (업로드는 성공)
                }
                const fileId = file.getId();
                const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
                photoUrls.push(directUrl);
                sheet.getRange(rows.length + i + 2, 1).setValue(`사진${i + 1}: ${file.getUrl()}`);
            } catch (_) { }
        });
    }

    SpreadsheetApp.flush();
    return { sheetName, sheetUrl: `${SPREADSHEET_URL}#gid=${sheet.getSheetId()}`, photoUrls };
}

/* ══════════════════════════════════════════════
   기록 조회 (userId 필터)
   ══════════════════════════════════════════════ */
function handleList(e) {
    const userId = e.parameter.userId || '';
    const log = getLogSheet();
    if (!log || log.getLastRow() < 2) return json([]);

    const lastCol = log.getLastColumn();
    const rows = log.getRange(2, 1, log.getLastRow() - 1, Math.max(lastCol, 15)).getValues();
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
            relatedDoc: r[10] || '',
            inspectionPlace: r[11] || '',
            buyerName: r[12] || '',
            inspectorName: r[13] || '',
            photoUrls: r[14] ? String(r[14]).split('|') : [],
        }));
    return json(result);
}

function addToLog(data, sheetName, sheetUrl, photoUrls) {
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
        data.relatedDoc || '',
        data.inspectionPlace || '',
        data.buyerName || '',
        data.inspectorName || '',
        (photoUrls || []).join('|'),
    ]);
    SpreadsheetApp.flush();
}

/* ══════════════════════════════════════════════
   기록 수정
   ══════════════════════════════════════════════ */
function handleUpdate(data) {
    try {
        const rowId = data.rowId;
        if (!rowId) return json({ status: 'error', message: 'rowId가 없습니다' });

        const log = getLogSheet();
        const rows = log.getDataRange().getValues();
        let targetRow = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === rowId) { targetRow = i + 1; break; }
        }
        if (targetRow < 0) return json({ status: 'error', message: '해당 기록을 찾을 수 없습니다' });

        // 필드 업데이트
        log.getRange(targetRow, 4).setValue(data.itemName || '');
        log.getRange(targetRow, 5).setValue(data.itemTotal || '');
        log.getRange(targetRow, 8).setValue(data.inspectionDate || '');
        log.getRange(targetRow, 11).setValue(data.relatedDoc || '');
        log.getRange(targetRow, 12).setValue(data.inspectionPlace || '');
        log.getRange(targetRow, 13).setValue(data.buyerName || '');
        log.getRange(targetRow, 14).setValue(data.inspectorName || '');

        // 기존 사진 URL
        let photoUrls = rows[targetRow - 1][14] ? String(rows[targetRow - 1][14]).split('|') : [];

        // 삭제할 사진 인덱스 처리 (먼저 삭제)
        if (data.deletePhotoIndexes && data.deletePhotoIndexes.length > 0) {
            const sorted = [...data.deletePhotoIndexes].sort((a, b) => b - a);
            sorted.forEach(idx => {
                if (idx >= 0 && idx < photoUrls.length) photoUrls.splice(idx, 1);
            });
        }

        // 새 사진 업로드
        if (data.newPhotos && data.newPhotos.length > 0) {
            const folder = getOrCreateFolder(DRIVE_FOLDER);
            const sheetName = rows[targetRow - 1][8] || 'edit';
            data.newPhotos.forEach((b64, i) => {
                try {
                    const blob = Utilities.newBlob(
                        Utilities.base64Decode(b64.split(',')[1]),
                        'image/jpeg',
                        `${sheetName}_수정사진${photoUrls.length + i + 1}.jpg`
                    );
                    const file = folder.createFile(blob);
                    try {
                        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                    } catch (e) {
                        // 권한 설정 실패 무시
                    }
                    const fileId = file.getId();
                    photoUrls.push(`https://lh3.googleusercontent.com/d/${fileId}`);
                } catch (_) { }
            });
        }

        log.getRange(targetRow, 15).setValue(photoUrls.join('|'));
        SpreadsheetApp.flush();

        return json({ status: 'ok', photoUrls });
    } catch (err) {
        return json({ status: 'error', message: '수정 실패: ' + err.toString() });
    }
}

/* ══════════════════════════════════════════════
   기록 삭제
   ══════════════════════════════════════════════ */
function handleDelete(data) {
    try {
        const rowId = data.rowId;
        if (!rowId) return json({ status: 'error', message: 'rowId가 없습니다' });

        const log = getLogSheet();
        const rows = log.getDataRange().getValues();
        let targetRow = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === rowId) { targetRow = i + 1; break; }
        }
        if (targetRow < 0) return json({ status: 'error', message: '해당 기록을 찾을 수 없습니다' });

        log.deleteRow(targetRow);
        SpreadsheetApp.flush();

        return json({ status: 'ok', message: '삭제 완료' });
    } catch (err) {
        return json({ status: 'error', message: '삭제 실패: ' + err.toString() });
    }
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
        s.appendRow(['rowId', 'userId', '제출일시', '품목', '금액', '이름', '팀명', '검수일', '시트명', '시트URL', '관련문서', '검수장소', '물품구매자', '검수입회자', '사진URL']);
        s.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#DBEAFE');
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

/* ══════════════════════════════════════════════
   CI 이미지 업데이트
   ══════════════════════════════════════════════ */
function handleUpdateCI(data) {
    const sheet = getUserSheet();
    const rows = sheet.getDataRange().getValues();
    const userId = data.userId;
    const ciImage = data.ciImage || '';

    // Find the user row and update 6th column (index 5)
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === userId) {
            sheet.getRange(i + 1, 6).setValue(ciImage);
            return json({ status: 'ok' });
        }
    }
    return json({ status: 'error', message: '사용자를 찾을 수 없습니다' });
}
