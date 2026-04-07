// Твои актуальные ключи
const SUPABASE_URL = 'https://edgkjpixloxbvjronmhl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2mDzLUq_H6743UOGR4BV6w_7cMWnzmX';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


let currentUser = null;
let currentProfile = null;

// Инициализация
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

    // Слушатель изменения состояния авторизации
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            await loadProfile();
            showScreen('chat-screen');
            loadMessages();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showScreen('auth-screen');
        }
    });
}

// === АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ===

function toggleAuthMode() {
    const loginBox = document.getElementById('login-box');
    const regBox = document.getElementById('register-box');
    loginBox.style.display = loginBox.style.display === 'none' ? 'block' : 'none';
    regBox.style.display = regBox.style.display === 'none' ? 'block' : 'none';
}

async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if(!email || !password) return alert('Введите данные');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert('Ошибка входа: ' + error.message);
}

async function register() {
    const code = document.getElementById('reg-invite').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if(!code || !email || !password) return alert('Заполните все поля');

    // 1. Проверка инвайта
    const { data: invite, error: inviteErr } = await supabase
        .from('invites')
        .select('*')
        .eq('code', code)
        .eq('is_used', false)
        .single();

    if (inviteErr || !invite) return alert('Инвайт недействителен!');

    // 2. Регистрация
    const { error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) return alert(authErr.message);

    // 3. Гасим инвайт
    await supabase.from('invites')
        .update({ is_used: true, used_by_email: email })
        .eq('code', code);

    alert('Успех! Теперь войдите в систему.');
    toggleAuthMode();
}

async function logout() {
    await supabase.auth.signOut();
    document.getElementById('profile-menu').style.display = 'none';
}

// === ПРОФИЛЬ ===

async function loadProfile() {
    const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    currentProfile = data;
    
    const nameEl = document.getElementById('my-profile-name');
    nameEl.innerHTML = `${data.username} ${data.is_verified ? '☑' : '▼'}`;
    document.getElementById('edit-username').value = data.username;

    if (data.is_verified) {
        document.getElementById('admin-panel').style.display = 'block';
    }
}

function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

async function updateUsername() {
    const newName = document.getElementById('edit-username').value;
    if(!newName) return;

    const { error } = await supabase
        .from('profiles')
        .update({ username: newName })
        .eq('id', currentUser.id);

    if (error) alert('Ошибка: ' + error.message);
    else {
        alert('Ник обновлен!');
        loadProfile();
    }
}

async function generateInvite() {
    const { data, error } = await supabase.rpc('create_new_invite');
    if (error) alert('Ошибка: ' + error.message);
    else prompt('Ваш новый инвайт-код (скопируйте):', data);
}

// === ЧАТ ===

async function loadMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(username, is_verified, verification_comment)')
        .order('created_at', { ascending: true })
        .limit(50);

    if (error) return console.error(error);
    
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    data.forEach(renderMessage);
}

function renderMessage(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = 'msg';

    const profile = msg.profiles;
    const badge = profile.is_verified 
        ? `<span class="msg-badge" title="${profile.verification_comment}">☑</span>` 
        : '';
    
    const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    div.innerHTML = `
        <div class="msg-header">
            <span class="msg-author">${escapeHTML(profile.username)}</span>
            ${badge}
            <span class="msg-time">${time}</span>
        </div>
        <div class="msg-content">${escapeHTML(msg.content)}</div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = ''; // Сразу очищаем для удобства

    await supabase.from('messages').insert([
        { user_id: currentUser.id, content: text }
    ]);
}

function handleEnter(e) {
    if (e.key === 'Enter') sendMessage();
}

// Подписка на новые сообщения в реальном времени
function subscribeToMessages() {
    supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            // Supabase Realtime не подтягивает JOIN (данные профиля), запрашиваем вручную
            const { data: profileData } = await supabase
                .from('profiles')
                .select('username, is_verified, verification_comment')
                .eq('id', payload.new.user_id)
                .single();
            
            payload.new.profiles = profileData;
            renderMessage(payload.new);
        })
        .subscribe();
}

// Защита от XSS
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Утилита
function showScreen(id) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'none';
    document.getElementById(id).style.display = 'flex';
}

// Запуск
init();
      
