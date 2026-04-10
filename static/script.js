// ==========================================
// メンバー入力フォームの追加
// ==========================================
function addMemberInput(isDriver) {
    const container = document.getElementById('member-inputs');
    const div = document.createElement('div');
    div.className = 'member-card ' + (isDriver ? 'is-driver' : 'is-passenger');

    div.innerHTML = `
        <div class="member-header">
            <span class="role-badge">${isDriver ? '🚗 運転手' : '👤 乗客'}</span>
            <button class="btn-remove" onclick="this.closest('.member-card').remove()">✕</button>
        </div>
        <div class="member-fields">
            <input type="hidden" class="m-is-driver" value="${isDriver}">
            <input type="text" placeholder="名前 *" class="m-name">
            <input type="text" placeholder="最寄り駅 *" class="m-station">
            ${isDriver ? `<input type="number" placeholder="定員（運転手含む）" class="m-capacity" value="4" min="2">` : ''}
        </div>
        <details class="relation-section">
            <summary>人間関係を設定する（任意）</summary>
            <div class="relation-fields">
                <input type="text" placeholder="一緒になりたい人（カンマ区切り）" class="m-want">
                <input type="text" placeholder="気まずい人（カンマ区切り）" class="m-awkward">
            </div>
        </details>
    `;
    container.appendChild(div);
}

// 初期表示: 運転手1・乗客3を追加
window.onload = () => {
    addMemberInput(true);
    addMemberInput(false);
    addMemberInput(false);
    addMemberInput(false);
};

// ==========================================
// 配車計算リクエスト
// ==========================================
async function calculate() {
    const cards = document.querySelectorAll('.member-card');
    const members = Array.from(cards).map(card => {
        const isDriver = card.querySelector('.m-is-driver').value === 'true';
        const wantRaw = card.querySelector('.m-want')?.value || '';
        const awkwardRaw = card.querySelector('.m-awkward')?.value || '';
        return {
            name: card.querySelector('.m-name').value.trim(),
            station: card.querySelector('.m-station').value.trim(),
            can_drive: isDriver,
            capacity: isDriver ? parseInt(card.querySelector('.m-capacity')?.value || '4') : null,
            want_with: wantRaw ? wantRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
            awkward_with: awkwardRaw ? awkwardRaw.split(',').map(s => s.trim()).filter(Boolean) : []
        };
    }).filter(m => m.name !== '' && m.station !== '');

    if (members.length === 0) {
        alert('メンバーを入力してください。');
        return;
    }

    const resultArea = document.getElementById('result-area');
    resultArea.innerHTML = '<p class="loading">⏳ 計算中...</p>';

    try {
        const response = await fetch('/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                members,
                google_maps_api_key: document.getElementById('gmaps-key').value.trim(),
                fixstars_api_key: document.getElementById('fixstars-key').value.trim(),
                target_arrival: document.getElementById('target-arrival').value,
                p_score: -5
            })
        });

        const data = await response.json();
        displayResult(data);
    } catch (e) {
        resultArea.innerHTML = `<p class="error">通信エラーが発生しました: ${e.message}</p>`;
    }
}

// ==========================================
// 結果表示
// ==========================================
function displayResult(data) {
    const resultArea = document.getElementById('result-area');

    if (data.error) {
        resultArea.innerHTML = `<div class="result-error">⚠️ ${data.error}</div>`;
        return;
    }

    const methodLabel = {
        amplify: '🔬 Amplify最適化（量子アニーリング）',
        greedy:  '📐 グリーディ法（近似最適化）'
    }[data.method] || data.method;

    let html = `<h2>📋 配車結果</h2>`;
    html += `<p class="method-label">${methodLabel}</p>`;

    if (data.method === 'amplify') {
        const feasible = data.feasible
            ? '<span class="feasible ok">✅ 制約を満たしています</span>'
            : '<span class="feasible ng">⚠️ 制約違反あり（ペナルティ係数を上げてください）</span>';
        html += `<p>最小エネルギー: <strong>${data.objective?.toFixed(2)}</strong>　${feasible}</p>`;
    }

    data.assignments.forEach(car => {
        html += `
        <div class="car-box">
            <div class="car-header">🚗 車 ${car.car_id}　<span class="driver-name">運転手: ${car.driver}</span></div>
            <ul>
                ${car.members.map(m => `<li>${m}</li>`).join('')}
            </ul>
        </div>`;
    });

    if (data.unassigned && data.unassigned.length > 0) {
        html += `<div class="unassigned">⚠️ 乗れなかった人: ${data.unassigned.join('、')}</div>`;
    }

    resultArea.innerHTML = html;
}


// ==========================================
// Service Worker 登録（PWA対応）
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/service-worker.js')
            .then(reg => console.log('[PWA] Service Worker 登録成功:', reg.scope))
            .catch(err => console.warn('[PWA] Service Worker 登録失敗:', err));
    });
}