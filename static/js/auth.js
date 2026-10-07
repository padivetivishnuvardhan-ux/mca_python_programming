let mode = 'login';

spawnFloaters($('floaters'), 20);

// If already logged in, skip straight to the game.
api('/me').then(m => { if (m.logged_in) window.location.href = '/game'; }).catch(() => {});

document.querySelectorAll('.tab').forEach((btn, i) => {
    btn.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        mode = btn.dataset.mode;
        $('tabSlider').className = 'tab-slider' + (i === 1 ? ' pos-1' : '');
        $('authBtn').querySelector('.label').textContent = mode === 'login' ? 'Login' : 'Create account';
        $('strengthMeter').style.display = mode === 'register' ? 'flex' : 'none';
        $('authMsg').textContent = '';
    };
});

const pwField = $('password');
$('togglePw').onclick = () => {
    const show = pwField.type === 'password';
    pwField.type = show ? 'text' : 'password';
    $('togglePw').textContent = show ? 'hide' : 'show';
};

pwField.addEventListener('input', () => {
    if (mode !== 'register') return;
    const v = pwField.value;
    let score = 0;
    if (v.length >= 4) score++;
    if (v.length >= 8) score++;
    if (/[0-9]/.test(v) && /[a-zA-Z]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v)) score++;
    $('strengthMeter').className = 'strength-meter' + (score > 0 ? ' s' + score : '');
});

function setMsg(text, ok) {
    const el = $('authMsg');
    el.textContent = text;
    el.className = ok ? 'success' : '';
}

function setLoading(loading) {
    $('authBtn').classList.toggle('loading', loading);
    $('authBtn').disabled = loading;
}

$('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = $('username').value.trim();
    const password = $('password').value;

    if (!username || !password) {
        setMsg('Please fill in both fields.', false);
        $('authCard').classList.add('shake');
        setTimeout(() => $('authCard').classList.remove('shake'), 500);
        return;
    }

    setLoading(true);
    setMsg('');

    try {
        await api('/' + mode, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        setMsg(mode === 'login' ? 'Welcome back! Redirecting…' : 'Account created! Redirecting…', true);
        setTimeout(() => { window.location.href = '/game'; }, 500);
    } catch (err) {
        setLoading(false);
        setMsg(err.message, false);
        $('authCard').classList.add('shake');
        setTimeout(() => $('authCard').classList.remove('shake'), 500);
    }
});
