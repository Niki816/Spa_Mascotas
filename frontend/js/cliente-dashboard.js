import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const token = getAccessToken();
const user  = getUser();
if (!token || !user) { window.location.href = 'index.html'; }
if (user?.rol !== 'cliente') { window.location.href = 'dashboard.html'; }

const firstName = user.email.split('@')[0];
document.getElementById('userName').textContent    = firstName;
document.getElementById('sidebarName').textContent = firstName;
document.getElementById('userEmail').textContent   = user.email;
document.getElementById('profileEmail').textContent = user.email;

// ── Navegación ──
const sections = ['inicio', 'mascotas', 'citas', 'perfil'];
document.querySelectorAll('.nav-item[data-section], a[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    sections.forEach(s => document.getElementById(`section-${s}`).style.display = s === sec ? 'block' : 'none');
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    if (sec === 'mascotas') loadMascotas();
    if (sec === 'citas')    loadCitas();
  });
});

function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.className = 'alert', 5000);
}

function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

// ── Cargar mascotas ──
async function loadMascotas() {
  try {
    const res  = await authFetch(`${API_URL.replace('/auth', '')}/clientes/mis-mascotas`);
    const data = await res.json();
    document.getElementById('mascotasCount').textContent = data.length ?? 0;
    document.getElementById('statMascotas').textContent  = data.length ?? 0;
    const container = document.getElementById('mascotasList');
    if (!data.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">🐶</div><p>Aún no tienes mascotas registradas.</p></div>`;
      return;
    }
    container.innerHTML = data.map(m => `
      <div style="padding:14px;border:1px solid #f0f5f2;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:14px;">
        <div style="font-size:32px;">${m.especie === 'Gato' ? '🐱' : '🐶'}</div>
        <div>
          <div style="font-weight:600;font-size:15px;">${m.nombre}</div>
          <div style="font-size:12px;color:var(--text-light);">${m.especie} · ${m.raza || 'Sin raza'} · ${m.peso_kg ? m.peso_kg + ' kg' : '—'}</div>
        </div>
      </div>`).join('');
  } catch { }
}

// ── Cargar citas ──
async function loadCitas() {
  try {
    const res  = await authFetch(`${API_URL.replace('/auth', '')}/clientes/mis-citas`);
    const data = await res.json();
    document.getElementById('citasCount').textContent = data.length ?? 0;
    document.getElementById('statCitas').textContent  = data.length ?? 0;
    const container = document.getElementById('citasList');
    if (!data.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>No tienes citas programadas.</p></div>`;
      return;
    }
    const estadoColor = { agendada:'#fbbf24', confirmada:'#22c55e', en_progreso:'#3b82f6', completada:'#6b7280', cancelada:'#ef4444' };
    container.innerHTML = data.map(c => `
      <div style="padding:14px;border:1px solid #f0f5f2;border-radius:10px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${c.servicio}</strong>
          <span style="background:${estadoColor[c.estado] || '#ccc'}22;color:${estadoColor[c.estado] || '#666'};padding:3px 10px;border-radius:12px;font-size:11px;">${c.estado}</span>
        </div>
        <div style="font-size:12px;color:var(--text-light);margin-top:4px;">📅 ${new Date(c.fecha_hora_inicio).toLocaleString('es-BO')} · 🐶 ${c.mascota}</div>
      </div>`).join('');
  } catch { }
}

// ── Cambiar contraseña ──
document.getElementById('changePasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res  = await authFetch(`${API_URL}/change-password`, {
      method: 'POST',
      body: JSON.stringify({
        oldPassword: document.getElementById('oldPassword').value,
        newPassword: document.getElementById('newPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('pwMessage', '✅ Contraseña actualizada. Redirigiendo...', 'success');
    setTimeout(() => { clearTokens(); window.location.href = 'index.html'; }, 2000);
  } catch (err) { showAlert('pwMessage', err.message, 'error'); }
});