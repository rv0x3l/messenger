// Меняем const на var, чтобы браузер не ругался на переопределение
var SUPABASE_URL = 'https://edgkjpixloxbvjronmhl.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_2mDzLUq_H6743UOGR4BV6w_7cMWnzmX';

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


let currentUser = null;

// ... и дальше пошла функция async function init() ...

// Инициализация приложения
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        await loadProfile();
        showScreen('chat-screen');
        loadMessages();
        subscribeToMessages();
    } else {
        showScreen('auth-screen');
    }
}

// ИСПРАВЛЕНО: Переключение между Входом и Регистрацией
function toggleAuthMode() {
    const loginBox = document.getElementById('login-box');
    const regBox = document.getElementById('register-box');
    
    if (loginBox.style.display !== 'none') {
        loginBox.style.display = 'none';
        regBox.style.display = 'block';
    } else {
        loginBox.style.display = 'block';
        regBox.style.display = 'none';
    }
}

// ИСПРАВЛЕНО: Вход (Login)
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if(!email || !password) return alert('Введите почту и пароль');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert('Ошибка: ' + error.message);
    } else {
        location.reload(); // Перезагрузка для входа в чат
    }
}

// ИСПРАВЛЕНО: Регистрация по инвайту
async function register() {
    const code = document.getElementById('reg-invite').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if(!code || !email || !password) return alert('Заполните все поля!');

    // 1. Проверяем инвайт в таблице
    const { data: invite, error: inviteErr } = await supabase
        .from('invites')
        .select('*')
        .eq('code', code)
        .eq('is_used', false)
        .single();

    if (inviteErr || !invite) {
        return alert('Инвайт неверный или уже использован!');
    }

    // 2. Регистрация в Auth
    const { error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) return alert('Ошибка: ' + authErr.message);

    // 3. Помечаем инвайт как использованный
    await supabase.from('invites')
        .update({ is_used: true, used_by_email: email })
        .eq('code', code);

    alert('Регистрация успешна! Теперь войдите.');
    toggleAuthMode();
}

// Загрузка своего профиля (ник и галочка)
async function loadProfile() {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (error) return console.error('Ошибка профиля:', error);

    const nameBtn = document.getElementById('my-profile-name');
    nameBtn.innerText = profile.username + (profile.is_verified ? ' ☑' : ' ▼');

    if (profile.is_verified) {
        document.getElementById('admin-panel').style.display = 'block';
    }
}

// Отправка сообщения
async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content) return;

    input.value = '';
    const { error } = await supabase.from('messages').insert([
        { user_id: currentUser.id, content: content }
    ]);
    if (error) console.error(error);
}

// Отрисовка сообщений
function renderMessage(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = 'msg';

    const profile = msg.profiles || { username: 'user', is_verified: false };
    const badge = profile.is_verified ? '<span class="msg-badge">☑</span>' : '';
    
    div.innerHTML = `
        <div class="msg-header">@${profile.username} ${badge}</div>
        <div class="msg-content">${escapeHTML(msg.content)}</div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Загрузка истории чата
async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(username, is_verified)')
        .order('created_at', { ascending: true });

    if (error) return console.error(error);
    
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    data.forEach(renderMessage);
}

// Realtime: слушаем новые сообщения
function subscribeToMessages() {
    supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            const { data: prof } = await supabase
                .from('profiles')
                .select('username, is_verified')
                .eq('id', payload.new.user_id)
                .single();
            
            payload.new.profiles = prof;
            renderMessage(payload.new);
        })
        .subscribe();
}

// Вспомогательные функции
function showScreen(id) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'none';
    document.getElementById(id).style.display = 'flex';
}

function toggleProfileMenu() {
    const m = document.getElementById('profile-menu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

async function logout() {
    await supabase.auth.signOut();
    location.reload();
}

function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

init();
