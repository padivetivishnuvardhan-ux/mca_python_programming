const ROWS = 8, COLS = 8;
const GLYPHS = ['◆', '●', '■', '★', '⬟', '▲'];
const TILE_COLORS = ['#00f6ff', '#ff2bd6', '#37ff9b', '#ffe600', '#9b5cff', '#ff9b3d'];

let gameId = null, gameState = null, selected = null, busy = false;
let drag = null; // {r, c, el, startX, startY, cellSize, axisLocked}

wireLogout('logoutBtn');
$('newGameBtn').onclick = () => !busy && startGame();
$('hintBtn').onclick = () => !busy && showHint();

spawnFloaters($('floaters'), 14);

(async function boot() {
    const me = await requireLogin('who');
    if (!me) return;
    await startGame();
})();

async function startGame() {
    busy = true;
    $('gameMsg').textContent = '';
    const d = await api('/game/new', { method: 'POST', body: JSON.stringify({ difficulty: 0.5 }) });
    gameId = d.game_id;
    gameState = d.state;
    $('aiText').textContent = d.explanation;
    renderBoard(gameState.board, { entrance: true });
    updateStats(gameState);
    updatePrediction(d.prediction);
    busy = false;
}

function cellPos(r, c) {
    return { top: (r * 12.5) + 0.6 + '%', left: (c * 12.5) + 0.6 + '%' };
}

function makeTileEl(r, c, v) {
    const el = document.createElement('div');
    el.className = `tile t${v}`;
    el.dataset.r = r; el.dataset.c = c; el.dataset.v = v;
    el.textContent = GLYPHS[v] || '?';
    el.style.setProperty('--shimmer-delay', (Math.random() * 5.5).toFixed(2) + 's');
    const pos = cellPos(r, c);
    el.style.top = pos.top; el.style.left = pos.left;

    el.addEventListener('pointerdown', (e) => onPointerDown(e, +el.dataset.r, +el.dataset.c, el));
    el.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'top' || e.propertyName === 'left') {
            el.classList.add('squash');
            setTimeout(() => el.classList.remove('squash'), 260);
        }
    });

    return el;
}

function renderBoard(board, opts = {}) {
    const boardEl = $('board');
    boardEl.innerHTML = '';
    board.forEach((row, r) => row.forEach((v, c) => {
        const el = makeTileEl(r, c, v);
        if (opts.entrance) {
            el.classList.add('tile-enter');
            el.style.top = ((r - 2) * 12.5) + '%';
        }
        boardEl.appendChild(el);
    }));
    if (opts.entrance) {
        requestAnimationFrame(() => {
            document.querySelectorAll('.tile-enter').forEach((el, i) => {
                setTimeout(() => {
                    el.classList.remove('tile-enter');
                    const r = +el.dataset.r, c = +el.dataset.c;
                    const pos = cellPos(r, c);
                    el.style.top = pos.top; el.style.left = pos.left;
                }, i * 6);
            });
        });
    }
}

function tileAt(r, c) {
    return document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
}

/* ============ TAP-TO-SELECT ============ */

function selectTap(r, c, el) {
    if (selected) {
        const [sr, sc] = selected;
        selected = null;
        document.querySelectorAll('.tile.selected').forEach(x => x.classList.remove('selected'));
        if (sr === r && sc === c) return;
        const dist = Math.abs(sr - r) + Math.abs(sc - c);
        if (dist !== 1) { selected = [r, c]; el.classList.add('selected'); return; }
        doMove(sr, sc, r, c);
    } else {
        selected = [r, c];
        el.classList.add('selected');
    }
}

/* ============ DRAG / SWIPE (candy-crush style) ============ */

function onPointerDown(e, r, c, el) {
    if (busy) return;
    e.preventDefault();
    const boardRect = $('board').getBoundingClientRect();
    drag = {
        r, c, el,
        startX: e.clientX, startY: e.clientY,
        cellSize: boardRect.width / COLS,
        moved: false, axis: null, dx: 0, dy: 0
    };
    el.classList.add('dragging');
    el.setPointerCapture(e.pointerId);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
    if (!drag) return;
    let dx = e.clientX - drag.startX;
    let dy = e.clientY - drag.startY;

    if (!drag.axis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (drag.axis === 'x') dy = 0; else if (drag.axis === 'y') dx = 0;

    const max = drag.cellSize * 0.95;
    dx = Math.max(-max, Math.min(max, dx));
    dy = Math.max(-max, Math.min(max, dy));
    drag.dx = dx; drag.dy = dy;
    drag.moved = Math.abs(dx) > 6 || Math.abs(dy) > 6;

    drag.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
}

function onPointerUp(e) {
    if (!drag) return;
    const { r, c, el, cellSize, dx, dy, moved } = drag;

    el.classList.remove('dragging');
    el.style.transform = '';
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    drag = null;

    if (!moved) { selectTap(r, c, el); return; }

    const threshold = cellSize * 0.32;
    let r2 = r, c2 = c;
    if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > threshold) c2 = c + (dx > 0 ? 1 : -1);
    } else {
        if (Math.abs(dy) > threshold) r2 = r + (dy > 0 ? 1 : -1);
    }

    document.querySelectorAll('.tile.selected').forEach(x => x.classList.remove('selected'));
    selected = null;

    // Small finger jitter can cross the 6px "moved" threshold without
    // crossing the (larger) swap threshold. Previously that silently did
    // nothing, so the tap felt "dead". Treat it as a tap-select instead.
    if (r2 === r && c2 === c) { selectTap(r, c, el); return; }
    if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return;

    doMove(r, c, r2, c2);
}

/* ============ MOVE + CASCADE ANIMATION ============ */

async function doMove(r1, c1, r2, c2) {
    busy = true;
    const a = tileAt(r1, c1), b = tileAt(r2, c2);

    if (a && b) {
        const posA = cellPos(r1, c1), posB = cellPos(r2, c2);
        a.style.top = posB.top; a.style.left = posB.left;
        b.style.top = posA.top; b.style.left = posA.left;
    }

    await sleep(320);

    let d = null;
    try {
        d = await api('/game/move', {
            method: 'POST',
            body: JSON.stringify({ game_id: gameId, from: [r1, c1], to: [r2, c2] })
        });

        if (!d.result.valid) {
            if (a && b) {
                const posA = cellPos(r1, c1), posB = cellPos(r2, c2);
                a.style.top = posA.top; a.style.left = posA.left;
                b.style.top = posB.top; b.style.left = posB.left;
                a.classList.add('invalid-shake'); b.classList.add('invalid-shake');
                setTimeout(() => { a.classList.remove('invalid-shake'); b.classList.remove('invalid-shake'); }, 420);
            }
            setMsg(d.result.reason || 'Invalid move', 'bad');
            return;
        }

        if (a && b) {
            a.dataset.r = r2; a.dataset.c = c2;
            b.dataset.r = r1; b.dataset.c = c1;
        }

        setMsg(`+${d.result.score_gained} points`, 'good');

        for (const step of d.result.cascades) {
            try {
                await playCascadeStep(step);
            } catch (stepErr) {
                // Never let a single animation hiccup abort the whole move —
                // the finally-block resync below guarantees the board still
                // ends up correct even if a step's animation misbehaves.
                console.error('Cascade animation step failed, board will resync', stepErr);
                break;
            }
        }

        gameState = d.state;
        updateStats(gameState);
        bump('score'); bump('moves');

        if (d.won) {
            setMsg('🎉 Level complete!', 'win');
        } else if (d.over) {
            setMsg('Game over — starting a new level…', 'bad');
        }

    } catch (e) {
        setMsg(e.message, 'bad');
    } finally {
        // Belt-and-braces: whatever happened above, make absolutely sure
        // what's on screen matches the server's authoritative board before
        // we hand control back to the player. This is what guarantees a
        // missed pop/animation glitch can never leave stray or stuck tiles.
        if (gameState) reconcileBoard(gameState.board);
        busy = false;
    }

    if (d && d.over) { await sleep(1400); await startGame(); }
}

// Verifies the DOM's tiles exactly match the authoritative server board
// (right count, right position, right value) and silently re-renders from
// scratch if anything is off. Cheap, and the only way to make "sometimes
// desynced after a hiccup" impossible instead of just "less likely".
function reconcileBoard(board) {
    const boardEl = $('board');
    const tiles = boardEl.querySelectorAll('.tile');
    let ok = tiles.length === ROWS * COLS;
    if (ok) {
        const seen = new Set();
        for (const el of tiles) {
            const r = +el.dataset.r, c = +el.dataset.c;
            const key = `${r},${c}`;
            if (seen.has(key) || board[r] === undefined || board[r][c] === undefined || +el.dataset.v !== board[r][c]) {
                ok = false; break;
            }
            seen.add(key);
        }
        if (ok && seen.size !== ROWS * COLS) ok = false;
    }
    if (!ok) renderBoard(board);
}

async function playCascadeStep(step) {
    const matchedSet = new Set(step.matched.map(([r, c]) => `${r},${c}`));
    const boardRect = $('board').getBoundingClientRect();

    let cx = 0, cy = 0, n = 0;
    const poppingEls = [];
    step.matched.forEach(([r, c]) => {
        const el = tileAt(r, c);
        if (el) {
            el.classList.add('popping');
            poppingEls.push(el);
            const rect = el.getBoundingClientRect();
            spawnSparks(rect.left - boardRect.left + rect.width / 2, rect.top - boardRect.top + rect.height / 2, TILE_COLORS[+el.dataset.v] || '#00f6ff');
            cx += rect.left - boardRect.left; cy += rect.top - boardRect.top; n++;
        }
    });
    if (n > 0) {
        spawnCombo(cx / n, cy / n, step.cascade, step.gained);
    }

    // Wait for the tiles' actual pop animation to finish (instead of a
    // fixed guess-timer that could fire before or after the CSS animation
    // was really done) — this is the fix for tiles "sometimes not popping".
    await Promise.all(poppingEls.map(waitForAnimation));
    poppingEls.forEach(el => el.remove());

    for (let c = 0; c < COLS; c++) {
        const survivors = [];
        for (let r = 0; r < ROWS; r++) {
            if (!matchedSet.has(`${r},${c}`)) survivors.push(r);
        }
        const numNew = ROWS - survivors.length;
        survivors.forEach((fromRow, i) => {
            const destRow = numNew + i;
            const el = tileAt(fromRow, c);
            if (el && fromRow !== destRow) {
                el.dataset.r = destRow;
                const pos = cellPos(destRow, c);
                el.style.top = pos.top;
            } else if (el) {
                el.dataset.r = destRow;
            }
        });
    }

    await sleep(380);

    for (let c = 0; c < COLS; c++) {
        const survivors = ROWS - step.matched.filter(([, mc]) => mc === c).length;
        const numNew = ROWS - survivors;
        for (let i = 0; i < numNew; i++) {
            const destRow = i;
            const v = step.board_after[destRow][c];
            const el = makeTileEl(destRow, c, v);
            el.classList.add('tile-enter');
            el.style.top = ((destRow - numNew) * 12.5) + '%';
            $('board').appendChild(el);
        }
    }

    await sleep(20);
    document.querySelectorAll('.tile-enter').forEach(el => {
        el.classList.remove('tile-enter');
        const r = +el.dataset.r, c = +el.dataset.c;
        const pos = cellPos(r, c);
        el.style.top = pos.top; el.style.left = pos.left;
    });

    await sleep(380);
}

function waitForAnimation(el) {
    return new Promise(resolve => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            el.removeEventListener('animationend', onEnd);
            el.removeEventListener('animationcancel', onEnd);
            resolve();
        };
        const onEnd = (e) => { if (e.target === el) finish(); };
        el.addEventListener('animationend', onEnd);
        el.addEventListener('animationcancel', onEnd);
        // Safety net so a backgrounded tab / interrupted animation can
        // never hang the game — always resolves within one animation cycle.
        setTimeout(finish, 450);
    });
}

function spawnSparks(x, y, color) {
    const layer = $('particles');
    for (let i = 0; i < 8; i++) {
        const s = document.createElement('div');
        s.className = 'spark';
        s.style.left = x + 'px'; s.style.top = y + 'px';
        s.style.background = color;
        s.style.boxShadow = `0 0 10px ${color}`;
        const angle = Math.random() * Math.PI * 2;
        const dist = 22 + Math.random() * 34;
        s.style.setProperty('--fly', `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`);
        layer.appendChild(s);
        setTimeout(() => s.remove(), 620);
    }
}

function spawnCombo(x, y, cascade, gained) {
    const layer = $('particles');
    const el = document.createElement('div');
    el.className = 'combo-pop';
    el.textContent = cascade > 1 ? `COMBO x${cascade}  +${gained}` : `+${gained}`;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function updateStats(s) {
    $('score').textContent = s.score;
    $('moves').textContent = `${s.moves}/${s.moves_limit}`;
    $('target').textContent = s.target_score;
    $('difficulty').textContent = s.difficulty;
}

function bump(id) {
    const el = $(id);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

function setMsg(text, kind) {
    const el = $('gameMsg');
    el.textContent = text;
    el.className = 'gameMsg' + (kind ? ' ' + kind : '');
}

async function showHint() {
    if (!gameId) return;
    try {
        const d = await api('/game/hint?game_id=' + encodeURIComponent(gameId));
        document.querySelectorAll('.tile.hint-glow').forEach(x => x.classList.remove('hint-glow'));
        if (d.move) {
            const [[r1, c1], [r2, c2]] = d.move;
            const a = tileAt(r1, c1), b = tileAt(r2, c2);
            if (a) a.classList.add('hint-glow');
            if (b) b.classList.add('hint-glow');
            setMsg(`Hint: swap (${r1 + 1},${c1 + 1}) ↔ (${r2 + 1},${c2 + 1})`, 'good');
            $('aiText').textContent = d.reason;
        } else {
            setMsg('No legal move found', 'bad');
        }
    } catch (e) {
        setMsg(e.message, 'bad');
    }
}

function updatePrediction(p) {
    $('success').textContent = (p.success_probability * 100).toFixed(1) + '%';
    $('cluster').textContent = p.behavior_cluster;
    $('class').textContent = ['Easy', 'Balanced', 'Hard'][p.difficulty_class] ?? p.difficulty_class;
}

async function refreshAnalyticsPanel() {
    try {
        const d = await api('/analytics');
        updatePrediction(d.prediction);
        $('factors').innerHTML = (d.explanation.top_factors || []).map(x =>
            `<div class="factor"><b>${x.feature}</b>: ${x.impact >= 0 ? '+' : ''}${x.impact}</div>`
        ).join('') || '<div class="factor">No data yet — play a few games.</div>';
    } catch (e) { /* silent on the game page */ }
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

refreshAnalyticsPanel();
