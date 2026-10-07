// Shared helpers used across every page.
const $ = id => document.getElementById(id);

const api = (url, opts = {}) => fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
}).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
});

function wireLogout(id) {
    const btn = $(id);
    if (!btn) return;
    btn.onclick = async () => {
        try { await api('/logout', { method: 'POST' }); } finally {
            window.location.href = '/login';
        }
    };
}

async function requireLogin(usernameElId) {
    try {
        const m = await api('/me');
        if (!m.logged_in) {
            window.location.href = '/login';
            return null;
        }
        if (usernameElId && $(usernameElId)) $(usernameElId).textContent = m.username;
        return m;
    } catch (e) {
        window.location.href = '/login';
        return null;
    }
}

function spawnFloaters(container, count = 18) {
    if (!container) return;
    const colors = ['#00f6ff', '#9b5cff', '#ff2bd6', '#37ff9b'];
    for (let i = 0; i < count; i++) {
        const f = document.createElement('div');
        f.className = 'floater';
        const size = 4 + Math.random() * 10;
        f.style.width = size + 'px';
        f.style.height = size + 'px';
        f.style.left = Math.random() * 100 + 'vw';
        f.style.background = colors[i % colors.length];
        f.style.boxShadow = `0 0 ${size * 2}px ${colors[i % colors.length]}`;
        f.style.animationDuration = (10 + Math.random() * 14) + 's';
        f.style.animationDelay = (Math.random() * -20) + 's';
        container.appendChild(f);
    }
}

function fmtPct(v) { return (Number(v || 0)).toFixed(1) + '%'; }
function fmtNum(v, d = 1) { return Number(v || 0).toFixed(d); }

/**
 * Animate a numeric element from 0 (or its current value) up to `target`.
 * suffix: text appended after the number (e.g. '%', 's').
 * decimals: number of decimal places to render.
 */
function countUp(id, target, { suffix = '', decimals = 0, duration = 900 } = {}) {
    const el = $(id);
    if (!el) return;
    const start = 0;
    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3); // ease-out cubic
    function tick(now) {
        const p = Math.min(1, (now - t0) / duration);
        const val = start + (target - start) * ease(p);
        el.textContent = val.toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = Number(target).toFixed(decimals) + suffix;
    }
    requestAnimationFrame(tick);
}
