/* ============================================================
   물품검수조서 v2 - app.js
   ============================================================ */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwh0EwoVOnjegLvD3ZsIAHguAPkNZuMzGy1cpgM1PXMxgfJVJhWbz2G5w3wMMpE-HRFsg/exec';

/* ---- STATE ---- */
const state = {
    currentStep: 1,
    photos: [],
    buyerSig: null, inspectorSig: null,
    buyerStamp: null, inspectorStamp: null,
    buyerMode: 'draw', inspectorMode: 'draw',
};

/* ---- HELPERS ---- */
const $id = id => document.getElementById(id);
const setVal = (id, v) => { const el = $id(id); if (el) el.value = v; };
const getVal = id => { const el = $id(id); return el ? el.value.trim() : ''; };
const getPIN = () => [0, 1, 2, 3].map(i => getVal('pin' + i)).join('');

function showToast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function formatNumber(id) {
    const n = parseFloat(getVal(id).replace(/,/g, ''));
    if (!isNaN(n)) setVal(id, n.toLocaleString('ko-KR'));
}
function unformatNumber(id) { setVal(id, getVal(id).replace(/,/g, '')); }

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    setVal('inspectionDate', today);
    setVal('receiptDate', today);
    initCanvas('buyerCanvas', 'buyer');
    initCanvas('inspectorCanvas', 'inspector');
    $id('itemTotal').addEventListener('blur', () => formatNumber('itemTotal'));
    $id('itemTotal').addEventListener('focus', () => unformatNumber('itemTotal'));
});

/* ---- PIN navigation ---- */
function movePIN(el, nextIdx) {
    el.value = el.value.replace(/\D/g, '').slice(0, 1);
    if (el.value && nextIdx !== null) $id('pin' + nextIdx).focus();
}
function backPIN(e, el, prevIdx) {
    if (e.key === 'Backspace' && !el.value && prevIdx !== null) $id('pin' + prevIdx).focus();
}

/* ---- STEP NAVIGATION (3 steps) ---- */
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

/* ---- VALIDATION ---- */
function validateStep(step) {
    if (step === 1) {
        if (!getVal('authorName')) { showToast('작성자 이름을 입력해주세요', 'error'); return false; }
        const pin = getPIN();
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            showToast('비밀번호 4자리를 모두 입력해주세요', 'error');
            $id('pin0').focus(); return false;
        }
        if (!getVal('inspectionDate')) { showToast('검수일자를 선택해주세요', 'error'); return false; }
        if (!getVal('itemName')) { showToast('물품명을 입력해주세요', 'error'); return false; }
        return true;
    }
    if (step === 2) {
        if (!state.photos.length) { showToast('사진을 1장 이상 등록해주세요', 'error'); return false; }
        return true;
    }
    return true;
}

/* ---- PHOTOS ---- */
function handlePhotoUpload(input) {
    const files = Array.from(input.files);
    const remaining = 4 - state.photos.length;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length < files.length) showToast(`최대 4장까지 등록 가능합니다 (${toAdd.length}장 추가됨)`);
    let loaded = 0;
    toAdd.forEach(file => {
        const r = new FileReader();
        r.onload = e => {
            state.photos.push({ dataUrl: e.target.result, name: file.name });
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
    const labels = ['', '전체 1장', '좌우 2등분', '메인+서브 3장', '2×2 4등분'];
    $id('layoutBadge').textContent = '✓ ' + (labels[n] || '자동 배치');
}

function removePhoto(i) { state.photos.splice(i, 1); renderPhotos(); }

/* ---- SIGNATURE ---- */
function initCanvas(id, person) {
    const canvas = $id(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 400;
    canvas.height = 140;
    let drawing = false, lx = 0, ly = 0;

    const pos = e => {
        const r = canvas.getBoundingClientRect();
        const s = e.touches ? e.touches[0] : e;
        return { x: s.clientX - r.left, y: s.clientY - r.top };
    };

    const start = e => {
        e.preventDefault(); drawing = true;
        const p = pos(e); lx = p.x; ly = p.y;
        ctx.beginPath(); ctx.arc(lx, ly, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#1E40AF'; ctx.fill();
        $id(person + 'Placeholder').style.display = 'none';
    };
    const draw = e => {
        if (!drawing) return; e.preventDefault();
        const p = pos(e);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = '#1E40AF'; ctx.lineWidth = 2;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        lx = p.x; ly = p.y;
    };
    const end = () => { drawing = false; state[person + 'Sig'] = canvas.toDataURL(); };

    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', draw, { passive: false }); canvas.addEventListener('touchend', end);
}

function clearSignature(person) {
    const c = $id(person + 'Canvas');
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    state[person + 'Sig'] = null;
    $id(person + 'Placeholder').style.display = '';
}

function switchSigTab(person, mode, btn) {
    state[person + 'Mode'] = mode;
    btn.parentElement.querySelectorAll('.sig-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $id(person + 'DrawArea').style.display = mode === 'draw' ? '' : 'none';
    $id(person + 'StampArea').style.display = mode === 'stamp' ? '' : 'none';
}

function loadStamp(person, input) {
    const file = input.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = e => {
        state[person + 'Stamp'] = e.target.result;
        $id(person + 'StampPreview').innerHTML = `<img src="${e.target.result}" style="max-width:110px;max-height:90px;object-fit:contain;">`;
    };
    r.readAsDataURL(file);
}

/* ---- PREVIEW ---- */
function buildPreview() {
    const teamName = getVal('teamName');
    const authorName = getVal('authorName');
    const deptLine = teamName ? `${teamName} (${authorName})` : authorName;
    const fmt = d => d ? d.replace(/-/g, '.') : '';

    const sigCell = p => {
        const img = state[p + 'Mode'] === 'draw' ? state[p + 'Sig'] : state[p + 'Stamp'];
        return img ? `<img src="${img}">` : '';
    };

    const photosHTML = () => {
        if (!state.photos.length) return '<span class="no-photo-text">📷 사진 없음</span>';
        const n = state.photos.length;
        return `<div class="preview-photo-grid grid-${n}">${state.photos.map(p => `<div class="preview-photo"><img src="${p.dataUrl}"></div>`).join('')}</div>`;
    };

    $id('documentPreview').innerHTML = `
    <div class="doc-title">물품검수조서</div>
    <table class="doc-table">
      <tr>
        <td class="label-cell">검수일자</td><td colspan="3">${fmt(getVal('inspectionDate'))}</td>
        <td class="label-cell">영수증일자</td><td colspan="3">${fmt(getVal('receiptDate'))}</td>
      </tr>
      <tr><td class="label-cell">관련문서</td><td colspan="7">${getVal('relatedDoc')}</td></tr>
      <tr>
        <td class="label-cell">작성자</td><td colspan="3">${deptLine}</td>
        <td class="label-cell">물품명</td><td colspan="3">${getVal('itemName')}</td>
      </tr>
      <tr><td class="label-cell">합계금액</td><td colspan="7">${getVal('itemTotal') || ''} 원</td></tr>
      <tr>
        <td class="label-cell" rowspan="2">검수자</td>
        <td class="label-cell">구분</td><td class="label-cell" colspan="2">이름</td>
        <td class="label-cell" colspan="2">서명/날인</td><td class="label-cell" colspan="2">비고</td>
      </tr>
      <tr>
        <td class="name-cell">물품구매자</td><td colspan="2" class="name-cell">${getVal('buyerName')}</td>
        <td colspan="2" class="sign-cell">${sigCell('buyer')}</td><td colspan="2"></td>
      </tr>
      <tr>
        <td class="label-cell"></td>
        <td class="name-cell">검수입회자</td><td colspan="2" class="name-cell">${getVal('inspectorName')}</td>
        <td colspan="2" class="sign-cell">${sigCell('inspector')}</td><td colspan="2"></td>
      </tr>
    </table>
    <div class="doc-photo-area">${photosHTML()}</div>
    <div class="doc-logo">
      <div class="logo-text">사단법인 한국지체장애인협회</div>
      <div class="logo-org">강동어울림복지관</div>
    </div>`;
}

/* ---- SUBMIT ---- */
async function submitDocument() {
    const btn = $id('submitBtn');
    btn.disabled = true;
    const payload = {
        inspectionDate: getVal('inspectionDate'),
        receiptDate: getVal('receiptDate'),
        relatedDoc: getVal('relatedDoc'),
        teamName: getVal('teamName'),
        authorName: getVal('authorName'),
        itemName: getVal('itemName'),
        itemTotal: getVal('itemTotal').replace(/,/g, ''),
        buyerName: getVal('buyerName'),
        inspectorName: getVal('inspectorName'),
        buyerSignature: state.buyerMode === 'draw' ? state.buyerSig : state.buyerStamp,
        inspectorSignature: state.inspectorMode === 'draw' ? state.inspectorSig : state.inspectorStamp,
        photos: state.photos.map(p => p.dataUrl),
        pin: getPIN(),
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
    showSuccessModal(result, payload.authorName, payload.teamName);
}

function showSuccessModal(result, author, team) {
    const link = result?.sheetUrl
        ? `<a href="${result.sheetUrl}" target="_blank" class="btn btn-primary" style="text-decoration:none;display:block;margin-bottom:10px;width:100%;box-sizing:border-box;">📄 저장된 문서 열기</a>`
        : `<a href="https://docs.google.com/spreadsheets/d/1CrB6AQEMm8JxnJ8HTVK-gVkwCWtcC8NhIecsEBUSL5M/edit" target="_blank" class="btn btn-primary" style="text-decoration:none;display:block;margin-bottom:10px;width:100%;box-sizing:border-box;">📊 스프레드시트 열기</a>`;
    const label = team ? `${team} · ${author}` : author;
    $id('successModal').style.display = 'flex';
    $id('successModal').querySelector('.modal-content').innerHTML = `
    <div class="modal-icon">✅</div>
    <h3>제출 완료!</h3>
    <p><strong>${label}</strong>의 물품검수조서가<br>성공적으로 저장되었습니다.</p>
    ${link}
    <button class="btn btn-outline" style="width:100%;box-sizing:border-box;" onclick="resetForm()">새 문서 작성</button>`;
}

/* ---- RESET ---- */
function resetForm() {
    state.photos = []; state.buyerSig = state.inspectorSig = state.buyerStamp = state.inspectorStamp = null;
    document.querySelectorAll('input[type="text"],input[type="date"]').forEach(el => el.value = '');
    document.querySelectorAll('.pin-input').forEach(el => el.value = '');
    const today = new Date().toISOString().split('T')[0];
    setVal('inspectionDate', today); setVal('receiptDate', today);
    ['buyer', 'inspector'].forEach(p => clearSignature(p));
    renderPhotos();
    $id('successModal').style.display = 'none';
    goToStep(1);
}

/* ---- TABS ---- */
function switchTab(tab) {
    $id('tabForm').classList.toggle('active', tab === 'form');
    $id('tabHistory').classList.toggle('active', tab === 'history');
    $id('mainApp').style.display = tab === 'form' ? '' : 'none';
    $id('historyPanel').style.display = tab === 'history' ? '' : 'none';
    if (tab === 'history') loadHistory();
}

/* ---- HISTORY ---- */
async function loadHistory() {
    $id('historyLoading').style.display = 'flex';
    $id('historyEmpty').style.display = 'none';
    $id('historyList').innerHTML = '';
    try {
        const res = await fetch(GAS_URL + '?action=list');
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
    $id('historyList').innerHTML = [...records].reverse().map(r => `
    <div class="history-card">
      <div class="history-header">
        <span class="history-item-name">${r.itemName || '(물품명 없음)'}</span>
        <span class="history-date">${r.submittedAt || ''}</span>
      </div>
      ${r.teamName ? `<div class="history-team">🏢 ${r.teamName}</div>` : ''}
      <div class="history-details">
        <span class="history-badge">👤 ${r.authorName || ''}</span>
        ${r.itemTotal ? `<span class="history-badge">💰 ${Number(r.itemTotal).toLocaleString('ko-KR')}원</span>` : ''}
        ${r.inspectionDate ? `<span class="history-badge">📅 ${r.inspectionDate}</span>` : ''}
      </div>
      <div class="history-actions">
        ${r.sheetUrl ? `<a href="${r.sheetUrl}" target="_blank" class="history-link">📄 열기</a>` : ''}
        <a href="https://docs.google.com/spreadsheets/d/1CrB6AQEMm8JxnJ8HTVK-gVkwCWtcC8NhIecsEBUSL5M/edit" target="_blank" class="history-link history-link-outline">📊 시트</a>
      </div>
    </div>`).join('');
}
