var SUPABASE_URL = 'https://edgkjpixloxbvjronmhl.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_2mDzLUq_H6743UOGR4BV6w_7cMWnzmX'
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

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

function showScreen(id) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('chat-screen').style.display = 'none';
    document.getElementById(id).style.display = 'flex';
}

// МОДАЛКА НАСТРОЕК
function toggleProfileModal() {
    const modal = document.getElementById('profile-modal');
    modal.style.display = 'flex';
}

function closeModal(e) {
    if (e.target.id === 'profile-modal') {
        document.getElementById('profile-modal').style.display = 'none';
    }
}

// ПРОФИЛЬ
async function loadProfile() {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (!profile) return;
    
    document.getElementById('my-profile-name').innerText = profile.username + (profile.is_verified ? ' ☑' : '');
    document.getElementById('edit-username').value = profile.username;
    
    if (profile.is_verified) {
        document.getElementById('admin-panel').style.display = 'block';
    }
}

async function updateUsername() {
    const newName = document.getElementById('edit-username').value.trim();
    if (!newName) return;
    await supabase.from('profiles').update({ username: newName }).eq('id', currentUser.id);
    location.reload();
}

// ИНВАЙТЫ
async function generateInvite() {
    const resBox = document.getElementById('invite-result');
    resBox.style.display = 'block';
    resBox.innerText = 'Создаю...';
    
    const { data, error } = await supabase.rpc('create_new_invite');
    if (error) {
        alert('Ошибка! Ты добавил SQL функцию в Supabase?');
        resBox.style.display = 'none';
    } else {
        resBox.innerText = data;
    }
}

// ЧАТ
async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    await supabase.from('messages').insert([{ user_id: currentUser.id, content }]);
}

async function loadMessages() {
    const { data } = await supabase.from('messages').select('*, profiles(username, is_verified)').order('created_at', { ascending: true });
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    data.forEach(renderMessage);
}

function renderMessage(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = 'msg';
    const prof = msg.profiles || { username: 'user', is_verified: false };
    const badge = prof.is_verified ? '<div class="verified-badge"></div>' : '';
    
    div.innerHTML = `<div class="msg-header">@${prof.username} ${badge}</div>
                     <div class="msg-content">${escapeHTML(msg.content)}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function subscribeToMessages() {
    supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
        const { data: prof } = await supabase.from('profiles').select('username, is_verified').eq('id', p.new.user_id).single();
        p.new.profiles = prof;
        renderMessage(p.new);
    }).subscribe();
}

// АВТ
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message); else location.reload();
}

async function register() {
    const code = document.getElementById('reg-invite').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    
    const { data: invite } = await supabase.from('invites').select('*').eq('code', code).eq('is_used', false).single();
    if (!invite) return alert('Инвайт сдох');

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return alert(error.message);

    await supabase.from('invites').update({ is_used: true, used_by_email: email }).eq('code', code);
    alert('Успех! Входи.');
    toggleAuthMode();
}

function toggleAuthMode() {
    const l = document.getElementById('login-box'), r = document.getElementById('register-box');
    l.style.display = l.style.display==='none' ? 'block' : 'none';
    r.style.display = r.style.display==='none' ? 'block' : 'none';
}

function logout() { supabase.auth.signOut(); location.reload(); }
function escapeHTML(s) { const p = document.createElement('p'); p.textContent = s; return p.innerHTML; }

init();
