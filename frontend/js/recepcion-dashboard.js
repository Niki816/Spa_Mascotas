import { authFetch, getAccessToken, getUser, clearTokens, API_BASE} from './auth.js';

const token = getAccessToken();
const user = getUser();
if (!token || !user) window.location.href = 'index.html';
if (user.rol !== 'recepcion') window.location.href = 'dashboard.html'; // o panel según rol

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('userEmail').textContent = user.email;
document.getElementById('perfilEmail').textContent = user.email;

// Navegación
const sections = ['inicio', 'citas', 'clientes', 'nueva-cita', 'perfil'];
document.querySelectorAll('.nav-item[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    sections.forEach(s => {
      const el = document.getElementById(`section-${s}`);
      if (el) el.style.display = s === sec ? 'block' : 'none';
    });
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    if (sec === 'citas') loadCitasHoy();
    if (sec === 'clientes') loadClientes();
    if (sec === 'nueva-cita') loadFormularioNuevaCita();
  });
});

// Helpers
function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.className = 'alert', 4000);
}

// Cargar estadísticas (citas hoy + clientes count)
async function loadDashboard() {
  try {
    const res = await authFetch(`${API_BASE}/recepcion/dashboard`);
    const data = await res.json();
    document.getElementById('citasHoyCount').textContent = data.citasHoy.length;
    const table = document.querySelector('#citasHoyTable tbody');
    if (data.citasHoy.length === 0) {
      table.innerHTML = '<tr><td colspan="4">No hay citas hoy</td></tr>';
    } else {
      table.innerHTML = data.citasHoy.map(c => `
        <tr><td>${c.hora}</td><td>${c.mascota}</td><td>${c.servicio}</td><td>${c.groomer}</td></tr>
      `).join('');
    }
    document.getElementById('clientesCount').textContent = data.totalClientes;
    const clientesTable = document.querySelector('#clientesTable tbody');
    if (data.ultimosClientes.length === 0) {
      clientesTable.innerHTML = '<tr><td colspan="3">Sin clientes</td></tr>';
    } else {
      clientesTable.innerHTML = data.ultimosClientes.map(c => `
        <tr><td>${c.nombre} ${c.apellido}</td><td>${c.email}</td><td>${c.telefono || '—'}</td></tr>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadCitasHoy() {
  try {
    const res = await authFetch(`${API_URL}/recepcion/citas/hoy`);
    const citas = await res.json();
    const tbody = document.querySelector('#citasDetalleTable tbody');
    if (citas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">No hay citas hoy</td></tr>';
      return;
    }
    tbody.innerHTML = citas.map(c => `
      <tr>
        <td>${c.hora}</td>
        <td>${c.mascota}</td>
        <td>${c.servicio}</td>
        <td>${c.groomer}</td>
        <td><span class="badge" style="background:#e8f5ed;color:#2d5a45;">${c.estado}</span></td>
        <td><button class="btn btn-outline btn-sm" onclick="confirmarCita(${c.id})">Confirmar</button></td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

window.confirmarCita = async (citaId) => {
  try {
    await authFetch(`${API_URL}/recepcion/citas/${citaId}/confirmar`, { method: 'PATCH' });
    loadCitasHoy();
    showAlert('citaMessage', '✅ Cita confirmada', 'success');
  } catch (err) { alert(err.message); }
};

async function loadClientes() {
  const search = document.getElementById('searchCliente')?.value || '';
  try {
    const res = await authFetch(`${API_URL}/recepcion/clientes?search=${encodeURIComponent(search)}`);
    const clientes = await res.json();
    const tbody = document.querySelector('#clientesListaTable tbody');
    if (clientes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">No se encontraron clientes</td></tr>';
      return;
    }
    tbody.innerHTML = clientes.map(c => `
      <tr>
        <td>${c.nombre} ${c.apellido}</td>
        <td>${c.email}</td>
        <td>${c.telefono || '—'}</td>
        <td>${c.ci || '—'}</td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}
document.getElementById('searchCliente')?.addEventListener('input', () => loadClientes());

async function loadFormularioNuevaCita() {
  try {
    const [mascotas, servicios, groomers] = await Promise.all([
      authFetch(`${API_URL}/recepcion/mascotas`).then(r => r.json()),
      authFetch(`${API_URL}/recepcion/servicios`).then(r => r.json()),
      authFetch(`${API_URL}/recepcion/groomers`).then(r => r.json()),
    ]);
    const mascotaSelect = document.getElementById('citaMascota');
    mascotaSelect.innerHTML = '<option value="">Seleccionar...</option>' + mascotas.map(m => `<option value="${m.id}">${m.nombre} (dueño: ${m.dueno})</option>`).join('');
    const servicioSelect = document.getElementById('citaServicio');
    servicioSelect.innerHTML = '<option value="">Seleccionar...</option>' + servicios.map(s => `<option value="${s.id}">${s.nombre} - ${s.duracion}min - $${s.precio_base}</option>`).join('');
    const groomerSelect = document.getElementById('citaGroomer');
    groomerSelect.innerHTML = '<option value="">Seleccionar...</option>' + groomers.map(g => `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`).join('');
  } catch (err) { console.error(err); }
}

document.getElementById('nuevaCitaForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    mascota_id: parseInt(document.getElementById('citaMascota').value),
    servicio_id: parseInt(document.getElementById('citaServicio').value),
    groomer_id: parseInt(document.getElementById('citaGroomer').value),
    fecha: document.getElementById('citaFecha').value,
    hora: document.getElementById('citaHora').value,
    notas: document.getElementById('citaNotas').value,
  };
  try {
    const res = await authFetch(`${API_URL}/recepcion/citas`, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('citaMessage', '✅ Cita agendada correctamente', 'success');
    e.target.reset();
    loadDashboard();
  } catch (err) { showAlert('citaMessage', err.message, 'error'); }
});

document.getElementById('cambiarPassForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res = await authFetch(`${API_URL}/change-password`, {
      method: 'POST',
      body: JSON.stringify({
        oldPassword: document.getElementById('oldPass').value,
        newPassword: document.getElementById('newPass').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('passMessage', '✅ Contraseña actualizada', 'success');
    setTimeout(() => { clearTokens(); window.location.href = 'index.html'; }, 2000);
  } catch (err) { showAlert('passMessage', err.message, 'error'); }
});

function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', doLogout);
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

loadDashboard();