import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const token = getAccessToken();
const user  = getUser();
if (!token || !user) { window.location.href = 'index.html'; }
if (user?.rol !== 'groomer') { window.location.href = 'dashboard.html'; }

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('groomerEmail').textContent = user.email;

const sections = ['inicio', 'citas', 'perfil'];
document.querySelectorAll('.nav-item[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    sections.forEach(s => document.getElementById(`section-${s}`).style.display = s === sec ? 'block' : 'none');
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    if (sec === 'citas') loadTodasCitas();
  });
});

function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

function renderCita(c) {
  const statusClass = { agendada:'st-agendada', confirmada:'st-confirmada', en_progreso:'st-en_progreso', completada:'st-completada' };
  return `<div class="cita-item">
    <div class="cita-head">
      <span class="cita-service">${c.servicio} · 🐶 ${c.mascota}</span>
      <span class="cita-status ${statusClass[c.estado] || ''}">${c.estado}</span>
    </div>
    <div class="cita-meta">📅 ${new Date(c.fecha_hora_inicio).toLocaleString('es-BO')} · ⏱ ${c.duracion_estimada_min} min</div>
  </div>`;
}

async function loadCitasHoy() {
  try {
    const res  = await authFetch(`${API_URL.replace('/auth', '')}/groomers/mis-citas/hoy`);
    const data = await res.json();
    document.getElementById('citasHoy').textContent  = data.length ?? 0;
    document.getElementById('hoyCount').textContent  = data.length ?? 0;
    const el = document.getElementById('citasHoyList');
    el.innerHTML = data.length
      ? data.map(renderCita).join('')
      : '<div class="empty-state"><div class="icon">📅</div><p>No tienes citas para hoy.</p></div>';
  } catch { }
}

async function loadTodasCitas() {
  try {
    const res  = await authFetch(`${API_URL.replace('/auth', '')}/groomers/mis-citas`);
    const data = await res.json();
    document.getElementById('totalCount').textContent = data.length ?? 0;
    const el = document.getElementById('todasCitasList');
    el.innerHTML = data.length
      ? data.map(renderCita).join('')
      : '<div class="empty-state"><div class="icon">📅</div><p>Sin citas.</p></div>';
  } catch { }
}

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
    const el = document.getElementById('pwMessage');
    el.textContent = '✅ Contraseña actualizada. Redirigiendo...';
    el.className = 'alert alert-success show';
    setTimeout(() => { clearTokens(); window.location.href = 'index.html'; }, 2000);
  } catch (err) {
    const el = document.getElementById('pwMessage');
    el.textContent = err.message;
    el.className = 'alert alert-error show';
  }
});

loadCitasHoy();