import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

// Verificación de autenticación y rol
const token = getAccessToken();
const user = getUser();
if (!token || !user) { window.location.href = 'index.html'; }
if (user?.rol !== 'groomer') { window.location.href = 'dashboard.html'; }

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('groomerEmail').textContent = user.email;

// Navegación entre secciones
const sections = ['agenda', 'fichas', 'checklist', 'fotos', 'insumos', 'perfil'];
const navItems = document.querySelectorAll('.nav-item[data-section]');

function showSection(sec) {
  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === sec ? 'block' : 'none';
  });
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.section === sec);
  });

  // Cargar datos cuando se entra en la sección agenda
  if (sec === 'agenda') loadAgendaHoy();
}

navItems.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    if (sec) showSection(sec);
  });
});

// Logout
function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

// ─── AGENDA ─────────────────────────────────────────────
async function loadAgendaHoy() {
  const container = document.getElementById('agendaContainer');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Cargando agenda...</p></div>';

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/agenda/hoy`);
    if (!res.ok) throw new Error('Error al obtener la agenda');
    const data = await res.json();

    if (!data.agenda || data.agenda.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>No tienes citas programadas para hoy 🎉</p></div>';
      return;
    }

    // Construir timeline
    let html = `<div style="margin-top: 8px;">`;
    data.agenda.forEach((cita, index) => {
      const horaInicio = new Date(cita.horaInicio).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      const horaFin = new Date(cita.horaFin).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      const estadoClass = cita.estado.replace('_', '-'); // en_progreso → en-progreso
      html += `
        <div class="timeline-item">
          <div class="timeline-time">${horaInicio} – ${horaFin}</div>
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="cita-mascota">
              🐶 ${cita.mascota.nombre} 
              <span class="cita-estado estado-${estadoClass}">${cita.estado}</span>
            </div>
            <div class="cita-servicio">✂️ ${cita.servicio.nombre} · ${cita.duracionEstimada} min</div>
            ${cita.notas ? `<div style="font-size:12px;color:var(--text-light);margin-top:4px;">📝 ${cita.notas}</div>` : ''}
          </div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>Error al cargar la agenda: ${error.message}</p></div>`;
  }
}

// Botón de refrescar
document.getElementById('refreshAgendaBtn')?.addEventListener('click', loadAgendaHoy);

// Cambio de contraseña (igual que antes)
document.getElementById('changePasswordForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res = await authFetch(`${API_URL}/change-password`, {
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

// Al cargar la página, mostrar agenda por defecto
showSection('agenda');