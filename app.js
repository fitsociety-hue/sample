/* ============================================================
   물품검수조서 v4 - app.js
   로그인 / 회원가입 / 검수 정보 / 사진 / 미리보기
   ============================================================ */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbyg0vhhxTu5_lDtJzfgb3GSzvlsv5Cyp1cHEG5Qkcgj_-4_lDauQkFeTXoGGkqz3XthNg/exec';

/* ── 상태 ── */
const state = {
    user: null,       // { userId, name, teamName }
    currentStep: 1,
    photos: [],
    editRecord: null,
    editPhotos: [],       // { src, type:'existing'|'new', originalIndex?, markedDelete? }
    editNewPhotos: [],    // data URLs of newly added photos
    editDeleteIndexes: [], // indexes of existing photos to delete
    photoPickerTarget: 'main', // 'main' or 'edit'
    deleteTargetIndex: -1,     // index in _historyRecords for pending delete
};

/* ── 헬퍼 ── */
const $id = id => document.getElementById(id);
const getVal = id => { const el = $id(id); return el ? el.value.trim() : ''; };
const setVal = (id, v) => { const el = $id(id); if (el) el.value = v; };
const show = id => { const el = $id(id); if (el) el.style.display = ''; };
const hide = id => { const el = $id(id); if (el) el.style.display = 'none'; };

function showToast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
    // 저장된 세션 확인
    try {
        const saved = localStorage.getItem('gi_user');
        if (saved) {
            state.user = JSON.parse(saved);
            showMainApp();

            // 백그라운드 CI 동기화
            fetch(`${GAS_URL}?action=get_ci&userId=${encodeURIComponent(state.user.userId)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'ok') {
                        if (data.ciImage) localStorage.setItem('gi_ci_image', data.ciImage);
                        else localStorage.removeItem('gi_ci_image');
                        loadCIPreview();
                    }
                }).catch(console.error);

            return;
        }
    } catch (_) { }
    showAuthScreen();
});

/* ════════════════════════════════════════════════
   AUTH
   ════════════════════════════════════════════════ */
function showAuthScreen() {
    hide('mainWrapper');
    show('authScreen');
    hide('headerUser');
}

function showMainApp() {
    hide('authScreen');
    show('mainWrapper');
    show('headerUser');
    $id('headerUserName').textContent =
        (state.user.teamName ? state.user.teamName + ' / ' : '') + state.user.name;
    setVal('inspectionDate', new Date().toISOString().split('T')[0]);

    $id('itemTotal').addEventListener('blur', () => formatNumber('itemTotal'));
    $id('itemTotal').addEventListener('focus', () => unformatNumber('itemTotal'));
}

function switchAuthTab(tab) {
    $id('loginTab').classList.toggle('active', tab === 'login');
    $id('registerTab').classList.toggle('active', tab === 'register');
    $id('loginForm').style.display = tab === 'login' ? '' : 'none';
    $id('registerForm').style.display = tab === 'register' ? '' : 'none';
    $id('loginError').textContent = '';
    $id('registerError').textContent = '';
}

function getPINValue(prefix) {
    return [0, 1, 2, 3].map(i => (getVal(prefix + 'pin' + i))).join('');
}

/* ── 로그인 ── */
async function login() {
    const name = getVal('loginName');
    const pin = getPINValue('l');
    if (!name || pin.length !== 4) {
        $id('loginError').textContent = '이름과 비밀번호를 입력해주세요'; return;
    }
    const btn = $id('loginBtn');
    btn.disabled = true; btn.textContent = '확인 중...';
    try {
        const res = await fetch(`${GAS_URL}?action=login&name=${encodeURIComponent(name)}&pin=${pin}`);
        const data = await res.json();
        if (data.status === 'ok') {
            state.user = { userId: data.userId, name: data.name, teamName: data.teamName };
            localStorage.setItem('gi_user', JSON.stringify(state.user));

            if (data.ciImage) localStorage.setItem('gi_ci_image', data.ciImage);
            else localStorage.removeItem('gi_ci_image');
            loadCIPreview();

            showMainApp();
        } else {
            $id('loginError').textContent = data.message || '로그인 실패';
        }
    } catch {
        $id('loginError').textContent = '서버 연결 오류. 잠시 후 다시 시도해주세요.';
    }
    btn.disabled = false; btn.textContent = '로그인';
}

function tryAutoLogin(e) {
    if (e.key === 'Enter') login();
}

/* ── 회원가입 ── */
async function register() {
    const name = getVal('regName');
    const teamName = getVal('regTeam');
    const pin = getPINValue('r');
    if (!name) { $id('registerError').textContent = '이름을 입력해주세요'; return; }
    if (pin.length !== 4) { $id('registerError').textContent = '비밀번호 4자리를 입력해주세요'; return; }

    const btn = $id('registerBtn');
    btn.disabled = true; btn.textContent = '처리 중...';
    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'register', name, teamName, pin }),
        });
        const data = await res.json();
        if (data.status === 'ok') {
            state.user = { userId: data.userId, name: data.name, teamName: data.teamName };
            localStorage.setItem('gi_user', JSON.stringify(state.user));
            showToast('🎉 환영합니다, ' + data.name + '님!');
            showMainApp();
        } else {
            $id('registerError').textContent = data.message || '회원가입 실패';
        }
    } catch {
        // no-cors fallback
        try {
            await fetch(GAS_URL, {
                method: 'POST', mode: 'no-cors',
                body: JSON.stringify({ action: 'register', name, teamName, pin })
            });
            showToast('가입 요청을 전송했습니다. 잠시 후 로그인해주세요.');
            switchAuthTab('login');
        } catch {
            $id('registerError').textContent = '서버 연결 오류';
        }
    }
    btn.disabled = false; btn.textContent = '회원가입';
}

/* ── 로그아웃 ── */
function logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    localStorage.removeItem('gi_user');
    state.user = null; state.photos = []; state.currentStep = 1;
    hide('mainWrapper');
    showAuthScreen();
    resetForm(true);
}

/* ════════════════════════════════════════════════
   PIN INPUT
   ════════════════════════════════════════════════ */
function movePIN(el, nextId) {
    el.value = el.value.replace(/\D/g, '').slice(0, 1);
    if (el.value && nextId) $id(nextId).focus();
}
function backPIN(e, el, prevId) {
    if (e.key === 'Backspace' && !el.value && prevId) $id(prevId).focus();
}

/* ════════════════════════════════════════════════
   NUMBER FORMATTING
   ════════════════════════════════════════════════ */
function formatNumber(id) {
    const n = parseFloat(getVal(id).replace(/,/g, ''));
    if (!isNaN(n)) setVal(id, n.toLocaleString('ko-KR'));
}
function unformatNumber(id) { setVal(id, getVal(id).replace(/,/g, '')); }

/* ════════════════════════════════════════════════
   STEP NAVIGATION
   ════════════════════════════════════════════════ */
function goToStep(step) {
    if (step > state.currentStep && !validateStep(state.currentStep)) return;
    state.currentStep = step;

    document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
    $id('step' + step).classList.add('active');

    document.querySelectorAll('.progress-step').forEach(el => {
        const n = +el.dataset.step;
        el.classList.toggle('active', n === step);
        el.classList.toggle('completed', n < step);
        el.querySelector('.step-circle').textContent = n < step ? '✓' : n;
    });

    if (step === 3) buildPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(step) {
    if (step === 1) {
        if (!getVal('itemName')) { showToast('품목을 입력해주세요', 'error'); return false; }
        if (!getVal('itemTotal')) { showToast('구매금액을 입력해주세요', 'error'); return false; }
        if (!getVal('inspectionDate')) { showToast('검수 연월일을 선택해주세요', 'error'); return false; }
        return true;
    }
    if (step === 2) {
        if (!state.photos.length) { showToast('사진을 1장 이상 등록해주세요', 'error'); return false; }
        return true;
    }
    return true;
}

/* ════════════════════════════════════════════════
   IMAGE COMPRESSION
   ════════════════════════════════════════════════ */
function compressImage(dataUrl, maxWidth = 800, quality = 0.7) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    });
}

/* ════════════════════════════════════════════════
   DATE FORMATTING
   ════════════════════════════════════════════════ */
function formatKoreanDate(dateStr) {
    if (!dateStr) return '';
    // Handle ISO format: 2026-02-26T15:00:00.000Z
    if (dateStr.includes('T')) {
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}년 ${m}월 ${day}일`;
    }
    // Handle YYYY-MM-DD format
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[0]}년 ${parts[1]}월 ${parts[2]}일`;
    }
    // Handle YYYY.MM.DD format
    const dotParts = dateStr.split('.');
    if (dotParts.length === 3) {
        return `${dotParts[0]}년 ${dotParts[1]}월 ${dotParts[2]}일`;
    }
    return dateStr;
}

/* ════════════════════════════════════════════════
   PHOTO SOURCE PICKER (카메라/앨범 선택)
   ════════════════════════════════════════════════ */
function showPhotoSourcePicker(target) {
    state.photoPickerTarget = target;
    $id('photoSourcePicker').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePhotoSourcePicker() {
    $id('photoSourcePicker').style.display = 'none';
    document.body.style.overflow = '';
}

function pickPhotoSource(source) {
    closePhotoSourcePicker();
    const isEdit = state.photoPickerTarget === 'edit';
    if (source === 'camera') {
        // capture 속성이 있는 input 사용 → 카메라 직접 열기
        const cameraInput = $id(isEdit ? 'editPhotoCameraInput' : 'photoCameraInput');
        if (cameraInput) cameraInput.click();
    } else {
        // capture 없는 input 사용 → 앨범/파일 선택
        const albumInput = $id(isEdit ? 'editPhotoInput' : 'photoInput');
        if (albumInput) albumInput.click();
    }
}

/* ════════════════════════════════════════════════
   DRIVE URL 변환 (크로스 디바이스 사진 표시 수정)
   ════════════════════════════════════════════════ */
function getReliablePhotoUrl(url) {
    if (!url || typeof url !== 'string') return '';
    // data URL은 그대로
    if (url.startsWith('data:')) return url;

    // Drive file ID 추출
    let fileId = '';
    // https://drive.google.com/uc?export=view&id=XXX
    let m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) fileId = m[1];
    // https://drive.google.com/file/d/XXX/view
    if (!fileId) { m = url.match(/\/d\/([a-zA-Z0-9_-]+)/); if (m) fileId = m[1]; }
    // https://drive.google.com/thumbnail?id=XXX
    if (!fileId) { m = url.match(/thumbnail\?id=([a-zA-Z0-9_-]+)/); if (m) fileId = m[1]; }
    // https://lh3.googleusercontent.com/d/XXX
    if (!fileId) { m = url.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/); if (m) fileId = m[1]; }

    if (fileId) {
        // 가장 안정적인 형식 사용
        return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
    return url;
}

function getPhotoFallbackUrl(url) {
    if (!url) return '';
    let fileId = '';
    let m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) fileId = m[1];
    if (!fileId) { m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/); if (m) fileId = m[1]; }
    if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    return '';
}

/* ════════════════════════════════════════════════
   GAS IMAGE PROXY (크로스 디바이스 권한 우회)
   ════════════════════════════════════════════════ */
async function loadFallbackImage(imgElement) {
    if (imgElement.dataset.retried) return;
    imgElement.dataset.retried = '1';

    const srcUrl = imgElement.src;
    let fileId = '';

    // Drive file ID 추출
    let m = srcUrl.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) m = srcUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) m = srcUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) fileId = m[1];

    if (!fileId) {
        imgElement.style.display = 'none';
        return;
    }

    const cacheKey = 'gi_photo_' + fileId;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        imgElement.src = cached;
        return;
    }

    try {
        const res = await fetch(`${GAS_URL}?action=get_image&fileId=${fileId}`);
        const result = await res.json();
        if (result.status === 'ok' && result.dataUrl) {
            localStorage.setItem(cacheKey, result.dataUrl);
            imgElement.src = result.dataUrl;
        } else {
            // fallback to thumbnail if proxy fails
            imgElement.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
        }
    } catch (e) {
        console.error('Proxy image load failed:', e);
        imgElement.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    }
}

/* ════════════════════════════════════════════════
   PHOTOS
   ════════════════════════════════════════════════ */
function handlePhotoUpload(input) {
    const files = Array.from(input.files);
    const toAdd = files.slice(0, 4 - state.photos.length);
    if (toAdd.length < files.length) showToast(`최대 4장 (${toAdd.length}장 추가)`);

    let loaded = 0;
    toAdd.forEach(file => {
        const r = new FileReader();
        r.onload = async e => {
            const compressed = await compressImage(e.target.result);
            state.photos.push({ dataUrl: compressed });
            if (++loaded === toAdd.length) renderPhotos();
        };
        r.readAsDataURL(file);
    });
    input.value = '';
}

function renderPhotos() {
    const n = state.photos.length;
    const area = $id('photoPreviewArea');
    if (!n) { area.style.display = 'none'; return; }
    area.style.display = '';
    $id('photoCountNum').textContent = n;

    const grid = $id('photoGrid');
    grid.className = 'photo-grid grid-' + n;
    grid.innerHTML = state.photos.map((p, i) => `
    <div class="photo-item">
      <img src="${p.dataUrl}" alt="사진${i + 1}">
      <button class="photo-remove" onclick="removePhoto(${i})">✕</button>
      <span class="photo-number">사진 ${i + 1}</span>
    </div>`).join('');

    const labels = ['', '1장 중앙', '위아래 2장', '상1 하2장', '2×2 그리드'];
    $id('layoutBadge').textContent = '✓ ' + (labels[n] || '자동 배치');
}

function removePhoto(i) { state.photos.splice(i, 1); renderPhotos(); }

/* ════════════════════════════════════════════════
   PREVIEW (서식 레이아웃)
   ════════════════════════════════════════════════ */
function buildPreview() {
    const u = state.user || {};
    const label = u.teamName ? `${u.teamName} / ${u.name}` : (u.name || '');
    const fmt = d => formatKoreanDate(d);

    const photosHTML = () => {
        if (!state.photos.length) return '<div class="doc-photo-empty">📷 사진 없음</div>';
        const n = state.photos.length;
        return `<div class="preview-photo-grid grid-${n}">${state.photos.map(p => `<div class="preview-photo"><img src="${p.dataUrl}"></div>`).join('')
            }</div>`;
    };

    $id('documentPreview').innerHTML = `
    <div class="doc-wrapper">
      <div class="doc-head-info">작성자: <strong>${label}</strong></div>
      <div class="doc-title">물 품 검 수 조 서</div>
      <table class="doc-table">
        <tr>
          <td class="doc-label">관련 문서</td>
          <td class="doc-value" colspan="3">${getVal('relatedDoc')}</td>
        </tr>
        <tr>
          <td class="doc-label">품&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목</td>
          <td class="doc-value">${getVal('itemName')}</td>
          <td class="doc-label" style="width:22%">구매금액</td>
          <td class="doc-value">${getVal('itemTotal') ? Number(getVal('itemTotal').replace(/,/g, '')).toLocaleString('ko-KR') + '원' : ''}</td>
        </tr>
        <tr>
          <td colspan="4" class="doc-photo-cell">${photosHTML()}</td>
        </tr>
        <tr>
          <td class="doc-label">검수 연월일</td>
          <td class="doc-value">${fmt(getVal('inspectionDate'))}</td>
          <td class="doc-label">물품구매자</td>
          <td class="doc-value sign-row">${getVal('buyerName')}<span class="doc-seal">(인)</span></td>
        </tr>
        <tr>
          <td class="doc-label">검 수 장 소</td>
          <td class="doc-value">${getVal('inspectionPlace')}</td>
          <td class="doc-label">검수입회자</td>
          <td class="doc-value sign-row">${getVal('inspectorName')}<span class="doc-seal">(인)</span></td>
        </tr>
      </table>
      <div class="doc-footer">사단법인 한국지체장애인협회 강동어울림복지관</div>
    </div>`;
}

/* ════════════════════════════════════════════════
   SUBMIT
   ════════════════════════════════════════════════ */
/* ── 로컬 캐시 (인쇄용) ── */
function saveSubmissionToLocal(payload) {
    try {
        const cache = JSON.parse(localStorage.getItem('gi_submissions') || '{}');
        const key = `${payload.itemName}_${payload.inspectionDate}_${payload.userId}`;
        cache[key] = {
            relatedDoc: payload.relatedDoc,
            itemName: payload.itemName,
            itemTotal: payload.itemTotal,
            inspectionDate: payload.inspectionDate,
            inspectionPlace: payload.inspectionPlace,
            buyerName: payload.buyerName,
            inspectorName: payload.inspectorName,
            name: payload.name,
            teamName: payload.teamName,
            photos: payload.photos,
            savedAt: new Date().toISOString(),
        };
        localStorage.setItem('gi_submissions', JSON.stringify(cache));
    } catch (_) { /* quota exceeded 등 무시 */ }
}

function getLocalSubmission(r) {
    try {
        const cache = JSON.parse(localStorage.getItem('gi_submissions') || '{}');
        // inspectionDate 형식 정규화하여 매칭
        const normalizeDate = d => {
            if (!d) return '';
            if (d.includes('T')) return d.split('T')[0];
            return d.replace(/\./g, '-');
        };
        const key = `${r.itemName}_${normalizeDate(r.inspectionDate)}_${r.userId}`;
        if (cache[key]) return cache[key];
        // fallback: itemName + userId로 최근 매칭 시도
        const matches = Object.values(cache).filter(c => c.itemName === r.itemName && (c.name === r.name || !r.name));
        if (matches.length) return matches[matches.length - 1];
    } catch (_) { }
    return null;
}

function saveSubmissionToLocal(data) {
    try {
        const cache = JSON.parse(localStorage.getItem('gi_submissions') || '{}');
        const normalizeDate = d => {
            if (!d) return '';
            if (d.includes('T')) return d.split('T')[0];
            return d.replace(/\./g, '-');
        };
        const key = `${data.itemName}_${normalizeDate(data.inspectionDate)}_${data.userId}`;
        cache[key] = {
            ...data,
            _savedAt: new Date().toISOString(),
        };
        localStorage.setItem('gi_submissions', JSON.stringify(cache));
    } catch (_) { }
}

async function submitDocument() {
    const btn = $id('submitBtn');
    btn.disabled = true;

    const u = state.user || {};
    const payload = {
        userId: u.userId || '',
        name: u.name || '',
        teamName: u.teamName || '',
        relatedDoc: getVal('relatedDoc'),
        itemName: getVal('itemName'),
        itemTotal: getVal('itemTotal').replace(/,/g, ''),
        inspectionDate: getVal('inspectionDate'),
        inspectionPlace: getVal('inspectionPlace'),
        buyerName: getVal('buyerName'),
        inspectorName: getVal('inspectorName'),
        photos: state.photos.map(p => p.dataUrl),
    };

    $id('loadingOverlay').style.display = 'flex';
    let result = null;
    try {
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        result = await res.json();
    } catch {
        try { await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }); } catch { }
    }
    $id('loadingOverlay').style.display = 'none';
    btn.disabled = false;

    if (result && result.status === 'ok') {
        saveSubmissionToLocal(payload);
        showSuccessModal(result, u);
    } else {
        const msg = result?.message || '저장 중 오류가 발생했습니다. 다시 시도해 주세요.';
        alert('❌ 오류 발생\n' + msg);
    }
}

function showSuccessModal(result, u) {
    const link = `<a href="${result.sheetUrl}" target="_blank" class="btn btn-primary"
         style="text-decoration:none;display:block;margin-bottom:10px;width:100%;box-sizing:border-box;">📄 저장된 문서 열기</a>`;
    const label = (u.teamName ? `${u.teamName} / ` : '') + (u.name || '');
    $id('successModal').style.display = 'flex';
    $id('successModal').querySelector('.modal-content').innerHTML = `
    <div class="modal-icon">✅</div>
    <h3>제출 완료!</h3>
    <p><strong>${label}</strong>의<br>물품검수조서가 저장되었습니다.</p>
    ${link}
    <button class="btn btn-outline" style="width:100%;box-sizing:border-box;" onclick="resetForm()">새 문서 작성</button>`;
}

/* ════════════════════════════════════════════════
   RESET
   ════════════════════════════════════════════════ */
function resetForm(full) {
    state.photos = [];
    document.querySelectorAll('#step1 input').forEach(el => {
        if (el.type === 'date') el.value = new Date().toISOString().split('T')[0];
        else el.value = '';
    });
    if ($id('photoPreviewArea')) $id('photoPreviewArea').style.display = 'none';
    $id('successModal').style.display = 'none';
    if (!full) { state.currentStep = 1; goToStep(1); }
}

/* ════════════════════════════════════════════════
   TABS
   ════════════════════════════════════════════════ */
function switchTab(tab) {
    $id('tabForm').classList.toggle('active', tab === 'form');
    $id('tabHistory').classList.toggle('active', tab === 'history');
    $id('tabSettings').classList.toggle('active', tab === 'settings');
    $id('mainApp').style.display = tab === 'form' ? '' : 'none';
    $id('historyPanel').style.display = tab === 'history' ? '' : 'none';
    $id('settingsPanel').style.display = tab === 'settings' ? '' : 'none';
    if (tab === 'history') loadHistory();
    if (tab === 'settings') loadCIPreview();
}

/* ════════════════════════════════════════════════
   CI 로고 관리
   ════════════════════════════════════════════════ */
function handleCIUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const maxW = 400;
            const scale = Math.min(1, maxW / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png', 0.9);
            localStorage.setItem('gi_ci_image_pending', dataUrl);
            loadCIPreview();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function deleteCIImage() {
    if (!confirm('CI 이미지를 삭제하고 설정을 저장하시겠습니까?')) return;
    localStorage.removeItem('gi_ci_image_pending');
    localStorage.removeItem('gi_ci_image');
    loadCIPreview();
    syncCIToServer('');
    showToast('CI 이미지가 삭제되었습니다.');
}

async function saveCIImage() {
    const pendingData = localStorage.getItem('gi_ci_image_pending');
    if (!pendingData) return;

    const btn = $id('ciSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

    // 서버로 동기화
    await syncCIToServer(pendingData);

    // 확정
    localStorage.setItem('gi_ci_image', pendingData);
    localStorage.removeItem('gi_ci_image_pending');

    if (btn) { btn.disabled = false; btn.textContent = '💾 설정 저장'; }
    showToast('새로운 CI 이미지가 저장되었습니다.');
    loadCIPreview();
}

async function syncCIToServer(ciImage) {
    if (!state.user) return;
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'update_ci',
                userId: state.user.userId,
                ciImage: ciImage
            })
        });
    } catch (err) {
        console.error('CI 동기화 실패:', err);
    }
}

function loadCIPreview() {
    const pendingData = localStorage.getItem('gi_ci_image_pending');
    const ciData = pendingData || localStorage.getItem('gi_ci_image');
    const saveBtn = $id('ciSaveBtn');

    if (ciData) {
        $id('ciPreview').style.display = '';
        $id('ciPreviewImg').src = ciData;
        $id('ciEmpty').style.display = 'none';
        $id('ciDeleteBtn').style.display = '';
        if (saveBtn) saveBtn.style.display = pendingData ? '' : 'none';
    } else {
        $id('ciPreview').style.display = 'none';
        $id('ciEmpty').style.display = '';
        $id('ciDeleteBtn').style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
    }
}

/* ════════════════════════════════════════════════
   HISTORY
   ════════════════════════════════════════════════ */
async function loadHistory() {
    $id('historyLoading').style.display = 'flex';
    $id('historyEmpty').style.display = 'none';
    $id('historyList').innerHTML = '';
    const userId = state.user?.userId || '';
    try {
        const res = await fetch(`${GAS_URL}?action=list${userId ? '&userId=' + encodeURIComponent(userId) : ''}`);
        renderHistory(await res.json());
    } catch {
        $id('historyLoading').style.display = 'none';
        $id('historyEmpty').style.display = '';
        $id('historyEmpty').textContent = '⚠️ 기록을 불러올 수 없습니다';
    }
}

function renderHistory(records) {
    $id('historyLoading').style.display = 'none';
    if (!records?.length) { $id('historyEmpty').style.display = ''; return; }
    $id('historyEmpty').style.display = 'none';

    // 서버 데이터 + 로컬 캐시 병합
    const enriched = records.map(r => {
        const local = getLocalSubmission(r);
        if (local) {
            return {
                ...r,
                relatedDoc: r.relatedDoc || local.relatedDoc || '',
                inspectionPlace: r.inspectionPlace || local.inspectionPlace || '',
                buyerName: r.buyerName || local.buyerName || '',
                inspectorName: r.inspectorName || local.inspectorName || '',
                photos: (r.photos && r.photos.length) ? r.photos : (local.photos || []),
            };
        }
        return r;
    });

    // 전역 참조용으로 저장
    window._historyRecords = [...enriched].reverse();

    $id('historyList').innerHTML = window._historyRecords.map((r, i) => {
        const photoSrcs = (r.photos && r.photos.length) ? r.photos : (r.photoUrls && r.photoUrls.length) ? r.photoUrls : [];
        // Drive URL 변환 적용
        const reliableSrcs = photoSrcs.map(src => getReliablePhotoUrl(src));
        const thumbsHTML = reliableSrcs.length ? `<div class="history-photos">${reliableSrcs.slice(0, 4).map(src => {
            return `<img class="history-thumb" src="${src}" onerror="loadFallbackImage(this)">`;
        }).join('')}${reliableSrcs.length > 4 ? `<span class="history-badge" style="align-self:center;">+${reliableSrcs.length - 4}</span>` : ''}</div>` : '';
        return `
    <div class="history-card">
      <div class="history-header">
        <span class="history-item-name">${r.itemName || '(품목 없음)'}</span>
        <span class="history-date">${r.submittedAt || ''}</span>
      </div>
      ${r.teamName ? `<div class="history-team">🏢 ${r.teamName}</div>` : ''}
      <div class="history-details">
        <span class="history-badge">👤 ${r.name || ''}</span>
        ${r.itemTotal ? `<span class="history-badge">💰 ${Number(r.itemTotal || 0).toLocaleString('ko-KR')}원</span>` : ''}
        ${r.inspectionDate ? `<span class="history-badge">📅 ${r.inspectionDate}</span>` : ''}
      </div>
      ${thumbsHTML}
      <div class="history-actions">
        <button class="history-link" onclick="openEditRecord(${i})">✏️ 수정</button>
        ${r.sheetUrl ? `<a href="${r.sheetUrl}" target="_blank" class="history-link">📄 열기</a>` : ''}
        <button class="history-link history-print-btn" onclick="printRecord(window._historyRecords[${i}])">🖨️ 인쇄/PDF</button>
        <button class="history-link btn-delete" onclick="deleteRecord(${i})">🗑️ 삭제</button>
      </div>
    </div>`;
    }).join('');
}

/* ════════════════════════════════════════════════
   기록 수정 모달
   ════════════════════════════════════════════════ */
function openEditRecord(index) {
    const r = window._historyRecords[index];
    if (!r) return;
    state.editRecord = { ...r, _index: index };
    state.editNewPhotos = [];
    state.editDeleteIndexes = [];

    // 기존 사진 목록 구성 (URL 변환 적용)
    const photoSrcs = (r.photos && r.photos.length) ? r.photos : (r.photoUrls && r.photoUrls.length) ? r.photoUrls : [];
    state.editPhotos = photoSrcs.map((src, i) => ({ src: getReliablePhotoUrl(src), type: 'existing', originalIndex: i, markedDelete: false }));

    // 폼 필드 채우기
    setVal('editRelatedDoc', r.relatedDoc || '');
    setVal('editItemName', r.itemName || '');
    setVal('editItemTotal', r.itemTotal || '');
    setVal('editInspectionPlace', r.inspectionPlace || '');
    setVal('editBuyerName', r.buyerName || '');
    setVal('editInspectorName', r.inspectorName || '');

    // 날짜 처리
    let dateVal = r.inspectionDate || '';
    if (dateVal.includes('T')) dateVal = dateVal.split('T')[0];
    if (dateVal.includes('.')) dateVal = dateVal.replace(/\./g, '-');
    setVal('editInspectionDate', dateVal);

    renderEditPhotos();
    $id('editModal').style.display = 'flex';
}

function closeEditModal() {
    $id('editModal').style.display = 'none';
    state.editRecord = null;
    state.editPhotos = [];
    state.editNewPhotos = [];
    state.editDeleteIndexes = [];
}

function renderEditPhotos() {
    const grid = $id('editPhotoGrid');
    if (!grid) return;
    const activeCount = state.editPhotos.filter(p => !p.markedDelete).length;
    grid.innerHTML = state.editPhotos.map((p, i) => {
        const fallback = getPhotoFallbackUrl(p.src);
        const isDeleted = p.markedDelete;
        return `
        <div class="edit-photo-item${isDeleted ? ' marked-delete' : ''}">
            <img src="${p.src}" onerror="loadFallbackImage(this)">
            ${isDeleted
                ? `<div class="edit-photo-delete-overlay">
                     <span>삭제 예정</span>
                     <button class="edit-photo-undo" onclick="undoRemoveEditPhoto(${i})">↩ 복원</button>
                   </div>`
                : `<button class="edit-photo-remove" onclick="removeEditPhoto(${i})">&times;</button>`
            }
            ${!isDeleted && p.type === 'new' ? '<span class="edit-photo-new-badge">NEW</span>' : ''}
        </div>`;
    }).join('');
}

async function handleEditPhotoUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    const activeCount = state.editPhotos.filter(p => !p.markedDelete).length;
    if (activeCount + files.length > 4) {
        showToast('사진은 최대 4장까지 가능합니다', 'error');
        event.target.value = '';
        return;
    }
    for (const file of files) {
        const dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
        const compressed = await compressImage(dataUrl);
        state.editPhotos.push({ src: compressed, type: 'new', markedDelete: false });
        state.editNewPhotos.push(compressed);
    }
    renderEditPhotos();
    event.target.value = '';
}

function removeEditPhoto(index) {
    const photo = state.editPhotos[index];
    if (photo.type === 'existing') {
        // 마크만 해 두고 실제 삭제는 저장 시
        photo.markedDelete = true;
        state.editDeleteIndexes.push(photo.originalIndex);
    } else {
        // 새 사진은 바로 제거
        const newIdx = state.editNewPhotos.indexOf(photo.src);
        if (newIdx >= 0) state.editNewPhotos.splice(newIdx, 1);
        state.editPhotos.splice(index, 1);
    }
    renderEditPhotos();
}

function undoRemoveEditPhoto(index) {
    const photo = state.editPhotos[index];
    if (!photo) return;
    photo.markedDelete = false;
    // editDeleteIndexes에서 해당 인덱스 제거
    const delIdx = state.editDeleteIndexes.indexOf(photo.originalIndex);
    if (delIdx >= 0) state.editDeleteIndexes.splice(delIdx, 1);
    renderEditPhotos();
}

async function saveEditRecord() {
    const r = state.editRecord;
    if (!r || !r.rowId) {
        showToast('수정할 수 없는 기록입니다', 'error');
        return;
    }

    const btn = $id('editSaveBtn');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    // markedDelete된 기존 사진 인덱스 수집
    const deleteIndexes = state.editPhotos
        .filter(p => p.type === 'existing' && p.markedDelete)
        .map(p => p.originalIndex);

    const payload = {
        action: 'update',
        rowId: r.rowId,
        itemName: getVal('editItemName'),
        itemTotal: getVal('editItemTotal'),
        inspectionDate: getVal('editInspectionDate'),
        relatedDoc: getVal('editRelatedDoc'),
        inspectionPlace: getVal('editInspectionPlace'),
        buyerName: getVal('editBuyerName'),
        inspectorName: getVal('editInspectorName'),
        newPhotos: state.editNewPhotos,
        deletePhotoIndexes: deleteIndexes,
    };

    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (result.status === 'ok') {
            // localStorage 캐시도 업데이트
            const updatedRecord = {
                ...r,
                itemName: payload.itemName,
                itemTotal: payload.itemTotal,
                inspectionDate: payload.inspectionDate,
                relatedDoc: payload.relatedDoc,
                inspectionPlace: payload.inspectionPlace,
                buyerName: payload.buyerName,
                inspectorName: payload.inspectorName,
            };
            if (result.photoUrls) updatedRecord.photoUrls = result.photoUrls;
            saveSubmissionToLocal(updatedRecord);

            closeEditModal();
            showToast('✅ 수정이 완료되었습니다');
            loadHistory();
        } else {
            showToast('❌ ' + (result.message || '수정 실패'), 'error');
        }
    } catch (err) {
        showToast('❌ 네트워크 오류: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 저장';
    }
}

function printRecord(r) {
    /* 로컬 캐시에서 누락 데이터 보완 */
    const local = getLocalSubmission(r);
    if (local) {
        const hasServerPhotos = (r.photoUrls && r.photoUrls.length > 0);
        r.relatedDoc = r.relatedDoc || local.relatedDoc || '';
        r.inspectionPlace = r.inspectionPlace || local.inspectionPlace || '';
        r.buyerName = r.buyerName || local.buyerName || '';
        r.inspectorName = r.inspectorName || local.inspectorName || '';
        if (!hasServerPhotos && (!r.photos || !r.photos.length) && local.photos && local.photos.length) {
            r.photos = local.photos;
        }
    }

    const label = (r.teamName ? `${r.teamName} / ` : '') + (r.name || '');
    const formattedDate = formatKoreanDate(r.inspectionDate || '');
    const amount = r.itemTotal ? Number(r.itemTotal).toLocaleString('ko-KR') + '원' : '';

    /* 사진 HTML 생성 - photos (data URLs) 또는 photoUrls (Drive URLs) 사용 */
    let photosHTML = '';
    const rawPhotoSrcs = (r.photoUrls && r.photoUrls.length > 0) ? r.photoUrls : (r.photos && r.photos.length > 0) ? r.photos : [];

    // Drive URL 변환 적용 및 로컬 캐시 확인
    const photoSrcs = rawPhotoSrcs.map(src => {
        const reliable = getReliablePhotoUrl(src);
        let m = reliable.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
        if (!m) m = reliable.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (!m) m = reliable.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (m) {
            const cached = localStorage.getItem('gi_photo_' + m[1]);
            if (cached) return cached;
        }
        return reliable;
    });

    if (photoSrcs.length > 0) {
        const n = photoSrcs.length;
        let gridStyle = '';
        let photoItems = '';
        if (n === 1) {
            gridStyle = 'display:flex; justify-content:center; align-items:center; height:100%;';
            photoItems = `<div style="width:70%; text-align:center;"><img src="${photoSrcs[0]}" onerror="loadFallback(this)" style="max-width:100%; max-height:380px; object-fit:contain;"></div>`;
        } else if (n === 2) {
            gridStyle = 'display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:center;';
            photoItems = photoSrcs.map(p => `<div style="width:80%;"><img src="${p}" onerror="loadFallback(this)" style="width:100%; max-height:190px; object-fit:contain;"></div>`).join('');
        } else if (n === 3) {
            gridStyle = 'display:grid; grid-template-columns:1fr 1fr; gap:4px; height:100%;';
            photoItems = `<div style="grid-column:span 2;"><img src="${photoSrcs[0]}" onerror="loadFallback(this)" style="width:100%; max-height:220px; object-fit:contain;"></div>`;
            photoItems += photoSrcs.slice(1).map(p => `<div><img src="${p}" onerror="loadFallback(this)" style="width:100%; max-height:160px; object-fit:contain;"></div>`).join('');
        } else {
            gridStyle = 'display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:4px; height:100%;';
            photoItems = photoSrcs.map(p => `<div><img src="${p}" onerror="loadFallback(this)" style="width:100%; height:100%; max-height:190px; object-fit:contain;"></div>`).join('');
        }
        photosHTML = `<div style="${gridStyle}">${photoItems}</div>`;
    }

    const w = window.open('', '_blank', 'width=800,height=1000');
    /* CI 로고 가져오기 */
    const ciData = localStorage.getItem('gi_ci_image') || '';
    const ciHTML = ciData ? `<img src="${ciData}" style="max-height:60px; object-fit:contain;">` : '';

    w.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>물품검수조서 - ${r.itemName || ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 20mm 15mm; }
  html, body { height: 100%; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: #111; }
  .page {
    width: 100%; min-height: calc(297mm - 40mm);
    display: flex; flex-direction: column;
    padding: 0;
  }
  .title { text-align: center; font-size: 24px; font-weight: 900; letter-spacing: 0.2em; margin-bottom: 16px; padding-top: 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { border: 1px solid #333; padding: 7px 10px; font-size: 13px; vertical-align: middle; }
  .label { background: #e8e8e8; font-weight: 700; text-align: center; width: 18%; white-space: nowrap; font-size: 12px; }
  .photo-area { padding: 6px !important; }
  .photo-area-inner { flex: 1; display: flex; align-items: center; justify-content: center; }
  .sign-cell { text-align: right; padding-right: 16px !important; }
  .seal { margin-left: 12px; color: #555; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 16px; }
  .footer-left { font-size: 12px; color: #666; flex: 1; }
  .footer-right { text-align: right; }
  .footer-right img { max-height: 60px; }
  .main-table-wrap { flex: 1; display: flex; flex-direction: column; }
  .main-table-wrap table { flex: 1; }
  .main-table-wrap tr.photo-row { height: 100%; }
  .main-table-wrap tr.photo-row td { height: 100%; vertical-align: middle; }
  .print-btn-wrap { text-align: center; margin: 20px 0; }
  .print-btn { padding: 12px 36px; background: #2563EB; color: #fff; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
  .print-btn:hover { background: #1D4ED8; }
  @media print {
    .print-btn-wrap { display: none !important; }
    .page { min-height: 100%; }
    .photo-area { page-break-inside: avoid; }
  }
  @media screen {
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm 15mm; min-height: 297mm; }
  }
</style>
<script>
const GAS_URL = '${GAS_URL}';
async function loadFallback(img) {
    if (img.dataset.retried) return;
    img.dataset.retried = '1';
    let id = '';
    let m = img.src.match(/lh3\\.googleusercontent\\.com\\/d\\/([a-zA-Z0-9_-]+)/);
    if (!m) m = img.src.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
    if (!m) m = img.src.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) id = m[1];
    
    if (id) {
        try { // 로컬 스토리지에 있으면 바로 사용
            const cached = window.opener && window.opener.localStorage ? window.opener.localStorage.getItem('gi_photo_' + id) : null;
            if (cached) { img.src = cached; return; }
        } catch(e) {}
        try {
            const res = await fetch(GAS_URL + '?action=get_image&fileId=' + id);
            const data = await res.json();
            if (data.status === 'ok' && data.dataUrl) img.src = data.dataUrl;
            else img.src = 'https://drive.google.com/thumbnail?id='+id+'&sz=w800';
        } catch(e) {
            img.src = 'https://drive.google.com/thumbnail?id='+id+'&sz=w800';
        }
    }
}
</script>
</head>
<body>
<div class="page">
  <div class="title">물 품 검 수 조 서</div>
  <div class="main-table-wrap">
  <table>
    <tr>
      <td class="label">관련문서</td>
      <td colspan="3">${r.relatedDoc || ''}</td>
    </tr>
    <tr>
      <td class="label">품 &nbsp; &nbsp; 목</td>
      <td>${r.itemName || ''}</td>
      <td class="label">구매금액</td>
      <td>${amount}</td>
    </tr>
    <tr class="photo-row">
      <td colspan="4" class="photo-area">${photosHTML || '<div style="min-height:200px;"></div>'}</td>
    </tr>
    <tr>
      <td class="label">검수연월일</td>
      <td>${formattedDate}</td>
      <td class="label">물품구매자</td>
      <td class="sign-cell">${r.buyerName || ''}<span class="seal">(인)</span></td>
    </tr>
    <tr>
      <td class="label">검 수 장 소</td>
      <td>${r.inspectionPlace || ''}</td>
      <td class="label">검수입회자</td>
      <td class="sign-cell">${r.inspectorName || ''}<span class="seal">(인)</span></td>
    </tr>
  </table>
  </div>
  <div class="footer">
    <div class="footer-left"></div>
    <div class="footer-right">${ciHTML}</div>
  </div>
</div>
<div class="print-btn-wrap">
  <button class="print-btn" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
</div>
</body>
</html>`);
    w.document.close();
}

/* ════════════════════════════════════════════════
   기록 삭제
   ════════════════════════════════════════════════ */
function deleteRecord(index) {
    const r = window._historyRecords[index];
    if (!r) return;
    state.deleteTargetIndex = index;
    $id('deleteItemName').textContent = r.itemName || '(품목 없음)';
    $id('deleteConfirmModal').style.display = 'flex';
}

function cancelDeleteRecord() {
    state.deleteTargetIndex = -1;
    $id('deleteConfirmModal').style.display = 'none';
}

async function confirmDeleteRecord() {
    const index = state.deleteTargetIndex;
    const r = window._historyRecords[index];
    if (!r || !r.rowId) {
        showToast('삭제할 수 없는 기록입니다', 'error');
        cancelDeleteRecord();
        return;
    }

    const btn = $id('deleteConfirmBtn');
    btn.disabled = true;
    btn.textContent = '삭제 중...';

    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'delete', rowId: r.rowId }),
        });
        const result = await res.json();
        if (result.status === 'ok') {
            cancelDeleteRecord();
            showToast('✅ 기록이 삭제되었습니다');
            loadHistory();
        } else {
            showToast('❌ ' + (result.message || '삭제 실패'), 'error');
        }
    } catch (err) {
        showToast('❌ 네트워크 오류: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🗑️ 삭제하기';
    }
}
