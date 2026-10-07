const CHART_COLORS = {
    cyan: '#00f6ff', purple: '#9b5cff', pink: '#ff2bd6',
    green: '#37ff9b', yellow: '#ffe600', orange: '#ff9b3d',
    muted: '#8f9bb8', grid: 'rgba(255,255,255,.06)'
};

const chartsReady = typeof Chart !== 'undefined';

if (chartsReady) {
    Chart.defaults.color = CHART_COLORS.muted;
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.borderColor = CHART_COLORS.grid;
}

function safeChart(canvasId, config) {
    if (!chartsReady) {
        const el = $(canvasId);
        if (el && el.parentElement) el.parentElement.innerHTML = '<div class="empty-state">Chart library unavailable — showing data below.</div>';
        return null;
    }
    try {
        return new Chart($(canvasId), config);
    } catch (e) {
        console.error('Chart render failed for', canvasId, e);
        return null;
    }
}

wireLogout('logoutBtn');

const page = document.body.dataset.dashboard;

spawnFloaters(document.getElementById('floaters'), 10);

// On mobile, give the stat-tile carousel a gentle one-time swipe hint.
if (window.innerWidth <= 640) {
    const grid = document.querySelector('.dash-grid');
    if (grid) grid.classList.add('hint-swipe');
}

(async function boot() {
    const me = await requireLogin('who');
    if (!me) return;
    if (page === 'game') await loadGameDashboard();
    if (page === 'player') await loadPlayerDashboard();
    if (page === 'hints') { await loadHintsDashboard(); await loadSampleBoard(); }
})();

/* ============ GAME ANALYTICS ============ */

async function loadGameDashboard() {
    try {
        const d = await api('/analytics/game');
        const s = d.summary;

        countUp('stTotalGames', s.total_games);
        $('stWinLoss').textContent = `${s.wins}W / ${s.losses}L`;
        countUp('stBestScore', s.best_score);
        countUp('stAvgScore', s.avg_score, { decimals: 1 });
        $('stAvgMoves').textContent = `avg ${s.avg_moves} moves`;
        countUp('stAvgTime', s.avg_time, { decimals: 1, suffix: 's' });
        $('stHints').textContent = s.total_hints + ' hints used';

        const trend = d.trend;
        const labels = trend.map(t => 'G' + t.game_no);

        safeChart('scoreChart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Score', data: trend.map(t => t.score),
                    borderColor: CHART_COLORS.cyan, backgroundColor: 'rgba(0,246,255,.18)',
                    fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: CHART_COLORS.cyan
                }]
            },
            options: { ...baseLineOpts('Score per Game'), animation: { duration: 1100, easing: 'easeOutQuart' } }
        });

        safeChart('movesChart', {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Moves used', data: trend.map(t => t.moves),
                    backgroundColor: trend.map(t => t.won ? 'rgba(55,255,155,.65)' : 'rgba(255,43,214,.6)'),
                    borderRadius: 6
                }]
            },
            options: { ...baseLineOpts('Moves per Game'), animation: { duration: 1100, delay: (c) => c.dataIndex * 40, easing: 'easeOutBack' } }
        });

        safeChart('difficultyChart', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Games',
                    data: trend.map(t => ({ x: t.difficulty, y: t.score })),
                    backgroundColor: trend.map(t => t.won ? CHART_COLORS.green : CHART_COLORS.pink),
                    pointRadius: 7, pointHoverRadius: 10
                }]
            },
            options: {
                animation: { duration: 900, easing: 'easeOutElastic' },
                plugins: { legend: { display: false }, title: { display: true, text: 'Difficulty vs Score (green = win)', color: '#dce4f7' } },
                scales: {
                    x: { title: { display: true, text: 'Difficulty' }, grid: { color: CHART_COLORS.grid } },
                    y: { title: { display: true, text: 'Score' }, grid: { color: CHART_COLORS.grid } }
                }
            }
        });

        // Cumulative score growth — running total across sessions
        let running = 0;
        const cumulative = trend.map(t => { running += (t.score || 0); return running; });
        safeChart('cumulativeScoreChart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Cumulative Score', data: cumulative,
                    borderColor: CHART_COLORS.orange, backgroundColor: 'rgba(255,155,61,.18)',
                    fill: true, tension: .3, pointRadius: 0, borderWidth: 3
                }]
            },
            options: { ...baseLineOpts('Cumulative Score Growth'), animation: { duration: 1200, easing: 'easeOutQuart' } }
        });

        // Games played per level — colorful bar histogram
        const byLevel = {};
        trend.forEach(t => { const lvl = t.level ?? '—'; byLevel[lvl] = (byLevel[lvl] || 0) + 1; });
        const levelLabels = Object.keys(byLevel);
        const levelPalette = [CHART_COLORS.cyan, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.green, CHART_COLORS.yellow, CHART_COLORS.orange];
        safeChart('levelDistChart', {
            type: 'bar',
            data: {
                labels: levelLabels.map(l => 'Level ' + l),
                datasets: [{
                    label: 'Games played', data: Object.values(byLevel),
                    backgroundColor: levelLabels.map((_, i) => levelPalette[i % levelPalette.length]),
                    borderRadius: 8
                }]
            },
            options: {
                ...baseLineOpts('Games Played per Level'),
                animation: { duration: 1000, delay: (c) => c.dataIndex * 70, easing: 'easeOutBack' },
                scales: { x: { grid: { display: false } }, y: { grid: { color: CHART_COLORS.grid }, ticks: { precision: 0 } } }
            }
        });

        safeChart('winLossDonut', {
            type: 'doughnut',
            data: {
                labels: ['Wins', 'Losses'],
                datasets: [{
                    data: [s.wins, s.losses],
                    backgroundColor: [CHART_COLORS.green, CHART_COLORS.pink],
                    borderColor: 'rgba(7,13,35,.9)', borderWidth: 3, hoverOffset: 10
                }]
            },
            options: {
                animation: { animateRotate: true, animateScale: true, duration: 1000 },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#dce4f7' } },
                    title: { display: true, text: 'Win / Loss Ratio', color: '#dce4f7' }
                }
            }
        });

        safeChart('hintUsageDonut', {
            type: 'doughnut',
            data: {
                labels: ['Total Hints Used', 'Games Played'],
                datasets: [{
                    data: [s.total_hints, Math.max(0, s.total_games - s.total_hints)],
                    backgroundColor: [CHART_COLORS.yellow, 'rgba(255,255,255,.08)'],
                    borderColor: 'rgba(7,13,35,.9)', borderWidth: 3, hoverOffset: 10
                }]
            },
            options: {
                animation: { animateRotate: true, animateScale: true, duration: 1000 },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#dce4f7' } },
                    title: { display: true, text: 'Hint Usage Volume', color: '#dce4f7' }
                }
            }
        });

        const rows = trend.slice().reverse();
        $('gameLog').innerHTML = rows.length ? rows.map(t => `
            <tr>
                <td>${t.game_no}</td><td>${t.level ?? '-'}</td><td>${t.score}</td>
                <td>${t.moves}</td><td>${t.time_seconds}s</td><td>${t.difficulty}</td>
                <td class="${t.won ? 'pill-won' : 'pill-lost'}">${t.won ? 'Won' : 'Lost'}</td>
            </tr>`).join('') : '<tr><td colspan="7">No completed games yet — play a level!</td></tr>';

    } catch (e) {
        $('gameLog').innerHTML = `<tr><td colspan="7">Unable to load analytics: ${e.message}</td></tr>`;
    }
}

/* ============ PLAYER ANALYTICS ============ */

async function loadPlayerDashboard() {
    try {
        const [d, a] = await Promise.all([api('/analytics/player'), api('/analytics')]);

        $('stKnowledge').textContent = d.knowledge_level;
        const badge = $('knowledgeBadge');
        badge.textContent = d.knowledge_level;
        badge.className = 'badge badge-' + d.knowledge_level.toLowerCase();

        const successPct = d.prediction.success_probability * 100;
        countUp('stSuccess', successPct, { decimals: 1, suffix: '%' });
        $('stCluster').textContent = d.behavior_label;
        const latestDiff = d.difficulty_trend.length ? d.difficulty_trend[d.difficulty_trend.length - 1].difficulty : 0;
        countUp('stDifficulty', latestDiff, { decimals: 2 });
        $('stDifficultyClass').textContent = ['Easy', 'Balanced', 'Hard'][d.prediction.difficulty_class] ?? '-';

        const radar = d.radar;
        const radarLabels = Object.keys(radar).map(k => k[0].toUpperCase() + k.slice(1));
        const radarValues = Object.values(radar);
        const skillColors = [CHART_COLORS.cyan, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.green, CHART_COLORS.yellow, CHART_COLORS.orange];

        safeChart('radarChart', {
            type: 'radar',
            data: {
                labels: radarLabels,
                datasets: [{
                    label: 'Skill score', data: radarValues,
                    backgroundColor: 'rgba(155,92,255,.25)', borderColor: CHART_COLORS.purple,
                    pointBackgroundColor: skillColors, pointRadius: 5, borderWidth: 2
                }]
            },
            options: {
                animation: { duration: 1000, easing: 'easeOutQuart' },
                plugins: { legend: { display: false }, title: { display: true, text: 'Skill Radar', color: '#dce4f7' } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        grid: { color: CHART_COLORS.grid }, angleLines: { color: CHART_COLORS.grid },
                        pointLabels: { color: '#dce4f7', font: { size: 11 } },
                        ticks: { display: false }
                    }
                }
            }
        });

        safeChart('skillBarChart', {
            type: 'bar',
            data: {
                labels: radarLabels,
                datasets: [{
                    label: 'Score (0-100)', data: radarValues,
                    backgroundColor: skillColors,
                    borderRadius: 6
                }]
            },
            options: {
                ...baseLineOpts('Skill Breakdown', { y: { min: 0, max: 100 } }),
                animation: { duration: 1000, delay: (c) => c.dataIndex * 90, easing: 'easeOutBack' }
            }
        });

        safeChart('successGauge', {
            type: 'doughnut',
            data: {
                labels: ['Predicted Success', 'Remaining'],
                datasets: [{
                    data: [successPct, 100 - successPct],
                    backgroundColor: [gradientOrFallback(successPct), 'rgba(255,255,255,.07)'],
                    borderColor: 'rgba(7,13,35,.9)', borderWidth: 3, circumference: 270, rotation: 225, cutout: '72%'
                }]
            },
            options: {
                animation: { animateRotate: true, duration: 1100 },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: `Success Confidence — ${successPct.toFixed(1)}%`, color: '#dce4f7' }
                }
            }
        });

        safeChart('skillDonut', {
            type: 'doughnut',
            data: {
                labels: radarLabels,
                datasets: [{
                    data: radarValues,
                    backgroundColor: skillColors,
                    borderColor: 'rgba(7,13,35,.9)', borderWidth: 3, hoverOffset: 10
                }]
            },
            options: {
                animation: { animateRotate: true, animateScale: true, duration: 1100 },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#dce4f7', boxWidth: 12, font: { size: 10 } } },
                    title: { display: true, text: 'Skill Mix', color: '#dce4f7' }
                }
            }
        });

        const dtrend = d.difficulty_trend;
        safeChart('difficultyTrendChart', {
            type: 'line',
            data: {
                labels: dtrend.map(t => 'G' + t.game_no),
                datasets: [{
                    label: 'Difficulty', data: dtrend.map(t => t.difficulty),
                    borderColor: CHART_COLORS.cyan, backgroundColor: 'rgba(0,246,255,.14)',
                    fill: true, tension: .3, pointBackgroundColor: dtrend.map(t => t.won ? CHART_COLORS.green : CHART_COLORS.pink),
                    pointRadius: 5, pointHoverRadius: 8
                }]
            },
            options: { ...baseLineOpts('Adaptive Difficulty Over Time', { y: { min: 0, max: 1 } }), animation: { duration: 1100, easing: 'easeOutQuart' } }
        });

        const factors = (a.explanation && a.explanation.top_factors) || [];
        $('explanationFactors').innerHTML = factors.length ? factors.map(x => `
            <div class="factor"><b>${x.feature}</b>: ${x.impact >= 0 ? '+' : ''}${x.impact}</div>
        `).join('') : '<div class="factor">Play a few games to unlock explainable-AI factors.</div>';

    } catch (e) {
        $('explanationFactors').innerHTML = `<div class="factor">Unable to load analytics: ${e.message}</div>`;
    }
}

function gradientOrFallback(pct) {
    if (pct >= 66) return CHART_COLORS.green;
    if (pct >= 40) return CHART_COLORS.yellow;
    return CHART_COLORS.pink;
}

/* ============ AI HINT DASHBOARD ============ */

async function loadHintsDashboard() {
    try {
        const d = await api('/analytics/hints');
        const s = d.summary;

        countUp('stTotalHints', s.total_hints_used);
        countUp('stAvgHints', s.avg_hints_per_game, { decimals: 2 });
        $('stReliance').textContent = fmtPct(s.hint_reliance_pct) + ' of games';
        countUp('stWinWith', s.win_rate_with_hints, { decimals: 1, suffix: '%' });
        countUp('stWinWithout', s.win_rate_without_hints, { decimals: 1, suffix: '%' });

        const trend = d.hints_trend;
        safeChart('hintsTrendChart', {
            type: 'bar',
            data: {
                labels: trend.map(t => 'G' + t.game_no),
                datasets: [{
                    label: 'Hints used', data: trend.map(t => t.hints_used),
                    backgroundColor: CHART_COLORS.yellow, borderRadius: 6
                }]
            },
            options: { ...baseLineOpts('Hints Used per Game'), animation: { duration: 1000, delay: (c) => c.dataIndex * 40, easing: 'easeOutBack' } }
        });

        safeChart('relianceDonut', {
            type: 'doughnut',
            data: {
                labels: ['Games With Hints', 'Games Without Hints'],
                datasets: [{
                    data: [s.hint_reliance_pct, 100 - s.hint_reliance_pct],
                    backgroundColor: [CHART_COLORS.purple, 'rgba(255,255,255,.08)'],
                    borderColor: 'rgba(7,13,35,.9)', borderWidth: 3, hoverOffset: 10
                }]
            },
            options: {
                animation: { animateRotate: true, animateScale: true, duration: 1100 },
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#dce4f7' } },
                    title: { display: true, text: `${s.hint_reliance_pct}% of games used a hint`, color: '#dce4f7' }
                }
            }
        });

        const history = d.history;
        $('hintHistory').innerHTML = history.length ? history.map(h => `
            <div class="hint-card">
                <div class="hc-move">Swap (${h.from_r + 1},${h.from_c + 1}) ↔ (${h.to_r + 1},${h.to_c + 1})</div>
                <div class="hc-reason">${h.reasoning}</div>
                <div class="hc-time">${h.created_at}</div>
            </div>
        `).join('') : '<div class="empty-state">No hints requested yet — try the AI Hint button on the game page.</div>';

    } catch (e) {
        $('hintHistory').innerHTML = `<div class="empty-state">Unable to load: ${e.message}</div>`;
    }
}

/* ============ AI HINT SAMPLE BOARD ============ */

const SAMPLE_GLYPHS = ['◆', '●', '■', '★', '⬟', '▲'];

async function loadSampleBoard() {
    const btn = $('refreshSample');
    if (btn) { btn.disabled = true; }
    try {
        const d = await api('/analytics/hint_sample');
        renderSampleBoard(d.board, d.move);

        if (d.move) {
            const [[r1, c1], [r2, c2]] = d.move;
            $('sampleMoveLabel').textContent = `(${r1 + 1},${c1 + 1}) ↔ (${r2 + 1},${c2 + 1})`;
        } else {
            $('sampleMoveLabel').textContent = 'No move found';
        }
        $('sampleReason').textContent = d.reason;

        const alts = d.alternatives || [];
        $('sampleAlts').innerHTML = alts.length ? alts.map((a, i) => {
            const [[r1, c1], [r2, c2]] = a.move;
            return `<div class="alt-move"><b>#${i + 1}</b><span>(${r1 + 1},${c1 + 1}) ↔ (${r2 + 1},${c2 + 1}) — ${a.match_size} tiles</span></div>`;
        }).join('') : '<div class="alt-move"><span>No alternatives found</span></div>';

    } catch (e) {
        $('sampleReason').textContent = 'Unable to load a sample board: ' + e.message;
    } finally {
        if (btn) { btn.disabled = false; }
    }
}

function renderSampleBoard(board, move) {
    const el = $('sampleBoard');
    if (!el) return;
    el.innerHTML = '';
    const highlighted = new Set();
    if (move) {
        const [[r1, c1], [r2, c2]] = move;
        highlighted.add(`${r1},${c1}`); highlighted.add(`${r2},${c2}`);
    }
    board.forEach((row, r) => row.forEach((v, c) => {
        const t = document.createElement('div');
        t.className = `mtile t${v}` + (highlighted.has(`${r},${c}`) ? ' hl' : '');
        t.textContent = SAMPLE_GLYPHS[v] || '?';
        t.style.top = (r * 12.5) + 0.6 + '%';
        t.style.left = (c * 12.5) + 0.6 + '%';
        t.style.animationDelay = ((r + c) * 12) + 'ms';
        el.appendChild(t);
    }));
}

if ($('refreshSample')) {
    $('refreshSample').addEventListener('click', loadSampleBoard);
}

/* ============ SHARED CHART OPTIONS ============ */

function baseLineOpts(title, scaleOverrides = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: title, color: '#dce4f7', font: { size: 13 } }
        },
        scales: {
            x: { grid: { color: CHART_COLORS.grid }, ...(scaleOverrides.x || {}) },
            y: { grid: { color: CHART_COLORS.grid }, ...(scaleOverrides.y || {}) }
        }
    };
}
