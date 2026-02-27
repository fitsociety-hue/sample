/* ============================================================
   물품검수조서 v3 - app.js (간소화 버전)
   ============================================================ */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwh0EwoVOnjegLvD3ZsIAHguAPkNZuMzGy1cpgM1PXMxgfJVJhWbz2G5w3wMMpE-HRFsg/exec';

const state = {
    currentStep: 1,
    photos: [],
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
    setVal('inspectionDate', new Date().toISOString().split('T')[0]);
    $id('itemTotal').addEventListener('blur', () => formatNumber('itemTotal'));
    $id('itemTotal').addEventListener('focus', () => unformatNumber('itemTotal'));
});

/* ---- PIN ---- */
function movePIN(el, next) {
    el.value = el.value.replace(/\D/g, '').slice(0, 1);
    if (el.value && next !== null) $id('pin' + next).focus();
}
function backPIN(e, el, prev) {
    if (e.key === 'Backspace' && !el.value && prev !== null) $id('pin' + prev).focus();
}

/* ---- STEP NAVIGATION ---- */
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
        if (!getVal('authorName')) {
            showToast('작성자 이름을 입력해주세요', 'error'); return false;
        }
        const pin = getPIN();
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            showToast('비밀번호 4자리를 모두 입력해주세요', 'error');
            $id('pin0').focus(); return false;
        }
        if (!getVal('inspectionDate')) {
            showToast('검수 연월일을 선택해주세요', 'error'); return false;
        }
        if (!getVal('itemName')) {
            showToast('품목을 입력해주세요', 'error'); return false;
        }
        if (!getVal('itemTotal')) {
            showToast('구매금액을 입력해주세요', 'error'); return false;
        }
        return true;
    }
    if (step === 2) {
        if (!state.photos.length) {
            showToast('사진을 1장 이상 등록해주세요', 'error'); return false;
        }
        return true;
    }
    return true;
}

/* ---- PHOTOS ---- */
function handlePhotoUpload(input) {
    const files = Array.from(input.files);
    const remaining = 4 - state.photos.length;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length < files.length) showToast(`최대 4장까지 등록 가능 (${toAdd.length}장 추가)`);

    let loaded = 0;
    toAdd.forEach(file => {
        const r = new FileReader();
        r.onload = e => {
            state.photos.push({ dataUrl: e.target.result });
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

    const labels = ['', '전체 1장', '좌우 2분할', '메인+서브 3장', '2×2 4분할'];
    $id('layoutBadge').textContent = '✓ ' + (labels[n] || '자동 배치');
}

function removePhoto(i) { state.photos.splice(i, 1); renderPhotos(); }

/* ---- PREVIEW (서식과 동일한 레이아웃) ---- */
function buildPreview() {
    const teamName = getVal('teamName');
    const authorName = getVal('authorName');
    const writerLabel = teamName ? `${teamName} / ${authorName}` : authorName;
    const fmt = d => d ? d.replace(/-/g, '.') : '';

    // 사진 영역
    const photosHTML = () => {
        if (!state.photos.length) return '<div class="doc-photo-empty">📷 사진 없음</div>';
        const n = state.photos.length;
        return `<div class="preview-photo-grid grid-${n}">${state.photos.map(p => `<div class="preview-photo"><img src="${p.dataUrl}"></div>`).join('')
            }</div>`;
    };

    $id('documentPreview').innerHTML = `
    <div class="doc-wrapper">
      <div class="doc-head-info">
        작성자: <strong>${writerLabel}</strong>
      </div>
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

      <div class="doc-footer">
        <span>사단법인 한국지체장애인협회 강동어울림복지관</span>
      </div>
    </div>`;
}

/* ---- SUBMIT ---- */
async function submitDocument() {
    const btn = $id('submitBtn');
    btn.disabled = true;

    const payload = {
        teamName: getVal('teamName'),
        authorName: getVal('authorName'),
        relatedDoc: getVal('relatedDoc'),
        itemName: getVal('itemName'),
        itemTotal: getVal('itemTotal').replace(/,/g, ''),
        inspectionDate: getVal('inspectionDate'),
        inspectionPlace: getVal('inspectionPlace'),
        buyerName: getVal('buyerName'),
        inspectorName: getVal('inspectorName'),
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
    const label = team ? `${team} / ${author}` : author;
    $id('successModal').style.display = 'flex';
    $id('successModal').querySelector('.modal-content').innerHTML = `
    <div class="modal-icon">✅</div>
    <h3>제출 완료!</h3>
    <p><strong>${label}</strong>의 물품검수조서가<br>저장되었습니다.</p>
    ${link}
    <button class="btn btn-outline" style="width:100%;box-sizing:border-box;" onclick="resetForm()">새 문서 작성</button>`;
}

/* ---- RESET ---- */
function resetForm() {
    state.photos = [];
    document.querySelectorAll('input[type="text"], input[type="date"]').forEach(el => el.value = '');
    document.querySelectorAll('.pin-input').forEach(el => el.value = '');
    setVal('inspectionDate', new Date().toISOString().split('T')[0]);
    renderPhotos();
    $id('successModal').style.display = 'none';
    state.currentStep = 1;
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
        <span class="history-item-name">${r.itemName || '(품목 없음)'}</span>
        <span class="history-date">${r.submittedAt || ''}</span>
      </div>
      ${r.teamName ? `<div class="history-team">🏢 ${r.teamName}</div>` : ''}
      <div class="history-details">
        <span class="history-badge">👤 ${r.authorName || ''}</span>
        ${r.itemTotal ? `<span class="history-badge">💰 ${Number(r.itemTotal || 0).toLocaleString('ko-KR')}원</span>` : ''}
        ${r.inspectionDate ? `<span class="history-badge">📅 ${r.inspectionDate}</span>` : ''}
      </div>
      <div class="history-actions">
        ${r.sheetUrl ? `<a href="${r.sheetUrl}" target="_blank" class="history-link">📄 열기</a>` : ''}
        <a href="https://docs.google.com/spreadsheets/d/1CrB6AQEMm8JxnJ8HTVK-gVkwCWtcC8NhIecsEBUSL5M/edit" target="_blank" class="history-link history-link-outline">📊 시트</a>
      </div>
    </div>`).join('');
}
