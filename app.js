const SUPABASE_URL = 'https://edgkjpixloxbvjronmhl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2mDzLUq_H6743UOGR4BV6w_7cMWnzmX';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// === ИНИЦИАЛИЗАЦИЯ ===
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

// === АВТОРИЗАЦИЯ ===
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

async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if(!email || !password) return alert('Введите почту и пароль');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert('Ошибка: ' + error.message);
    } else {
        location.reload();
    }
}

async function register() {
    const code = document.getElementById('reg-invite').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if(!code || !email || !password) return alert('Заполните все поля!');

    // Проверяем инвайт
    const { data: invite, error: inviteErr } = await supabase
        .from('invites')
        .select('*')
        .eq('code', code)
        .eq('is_used', false)
        .single();

    if (inviteErr || !invite) {
        return alert('Инвайт неверный или уже использован!');
    }

    // Регистрация
    const { error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) return alert('Ошибка: ' + authErr.message);

    // Гасим инвайт
    await supabase.from('invites')
        .update({ is_used: true, used_by_email: email })
        .eq('code', code);

    alert('Регистрация успешна! Теперь войдите.');
    toggleAuthMode();
}

async function logout() {
    await supabase.auth.signOut();
    location.reload();
}

// === ПРОФИЛЬ И МОДАЛЬНОЕ ОКНО ===
async function loadProfile() {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (error) return console.error('Ошибка профиля:', error);

    const nameBtn = document.getElementById('my-profile-name');
    nameBtn.innerText = profile.username; // Кнопка открытия профиля
    document.getElementById('edit-username').value = profile.username;

    // Если есть галочка — показываем админ-панель в модалке
    if (profile.is_verified) {
        document.getElementById('admin-panel').style.display = 'block';
    }
}

function toggleProfileModal() {
    document.getElementById('profile-modal').style.display = 'flex';
}

function closeModal(event) {
    // Закрываем модалку только если кликнули по темному фону
    if (event.target.id === 'profile-modal') {
        document.getElementById('profile-modal').style.display = 'none';
        document.getElementById('invite-result').style.display = 'none';
    }
}

async function updateUsername() {
    const newName = document.getElementById('edit-username').value.trim();
    if(!newName) return;

    const { error } = await supabase
        .from('profiles')
        .update({ username: newName })
        .eq('id', currentUser.id);

    if (error) {
        alert('Ошибка: ' + error.message);
    } else {
        alert('Ник обновлен!');
        loadProfile();
        document.getElementById('profile-modal').style.display = 'none';
    }
}

async function generateInvite() {
    const inviteBox = document.getElementById('invite-result');
    inviteBox.innerText = 'Генерация...';
    inviteBox.style.display = 'block';

    const { data, error } = await supabase.rpc('create_new_invite');
    
    if (error) {
        console.error("Ошибка SQL:", error);
        inviteBox.innerText = 'Ошибка базы!';
        inviteBox.style.background = '#7f1d1d';
        inviteBox.style.color = '#fca5a5';
        alert('Не удалось создать код. Проверь, добавил ли ты SQL функцию create_new_invite в Supabase.');
    } else {
        inviteBox.style.background = '#022c22';
        inviteBox.style.color = '#34d399';
        inviteBox.innerText = data; // Показываем код прямо в окне
    }
}

// === ЧАТ И СООБЩЕНИЯ ===
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

function renderMessage(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = 'msg';

    const profile = msg.profiles || { username: 'user', is_verified: false };
    
    // Новая телеграм-галочка
    const badge = profile.is_verified ? '<span class="verified-badge" title="Подтвержден"></span>' : '';
    
    div.innerHTML = `
        <div class="msg-header">@${escapeHTML(profile.username)} ${badge}</div>
        <div class="msg-content">${escapeHTML(msg.content)}</div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(username, is_verified)')
        .order('created_at', { ascending: true })
        .limit(100); // Грузим последние 100 сообщений

    if (error) return console.error(error);
    
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    data.forEach(renderMessage);
}

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

// === УТИЛИТЫ ===
function showScreen(id) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'none';
    document.getElementById(id).style.display = 'flex';
}

function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// Запускаем приложение
init();
