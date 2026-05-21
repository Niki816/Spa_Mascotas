import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const RECEPCION_API = API_URL.replace('/auth', '/recepcion');

const token = getAccessToken();
const user = getUser();
if (!token || !user || user.rol !== 'recepcion') {
  clearTokens();
  window.location.href = 'index.html';
}

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('userEmail').textContent = user.email;

// Elementos (igual que admin-availability.js)
const configForm = document.getElementById('configForm');
const horarioInicio = document.getElementById('horarioInicio');
const horarioFin = document.getElementById('horarioFin');
const diasLaborales = document.getElementById('diasLaborales');
const capacidadMax = document.getElementById('capacidadMax');
const configAlert = document.getElementById('configAlert');

const bloqueoForm = document.getElementById('bloqueoForm');
const tipoBloqueo = document.getElementById('tipoBloqueo');
const fechaInicioBloq = document.getElementById('fechaInicioBloq');
const fechaFinBloq = document.getElementById('fechaFinBloq');
const groomerBloq = document.getElementById('groomerBloq');
const descBloqueo = document.getElementById('descBloqueo');
const bloqueoAlert = document.getElementById('bloqueoAlert');

const groomerSelect = document.getElementById('groomerSelect');
const disponibilidadPanel = document.getElementById('disponibilidadPanel');
const horariosGroomerList = document.getElementById('horariosGroomerList');
const agregarHorarioBtn = document.getElementById('agregarHorarioBtn');
const guardarDisponibilidadBtn = document.getElementById('guardarDisponibilidadBtn');
const dispAlert = document.getElementById('dispAlert');

let currentGroomerId = null;
let currentHorarios = [];

const diaNombres = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };

function showAlert(element, msg, type = 'success') {
  element.textContent = msg;
  element.className = `alert alert-${type} show`;
  setTimeout(() => element.classList.remove('show'), 5000);
}

// Configuración
async function loadConfig() {
  try {
    const res = await authFetch(`${RECEPCION_API}/config/spa`);
    const data = await res.json();
    horarioInicio.value = data.horario_inicio;
    horarioFin.value = data.horario_fin;
    diasLaborales.value = data.dias_laborales.join(',');
    capacidadMax.value = data.capacidad_diaria_max;
  } catch (err) {
    showAlert(configAlert, 'Error al cargar configuración', 'error');
  }
}

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    horario_inicio: horarioInicio.value,
    horario_fin: horarioFin.value,
    dias_laborales: diasLaborales.value.split(',').map(d => d.trim().toLowerCase()),
    capacidad_diaria_max: parseInt(capacidadMax.value)
  };
  try {
    const res = await authFetch(`${RECEPCION_API}/config/spa`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).message);
    showAlert(configAlert, '✅ Configuración guardada', 'success');
  } catch (err) { showAlert(configAlert, err.message, 'error'); }
});

// Groomers
async function loadGroomers() {
  try {
    // Para recepción, podemos usar el mismo endpoint de admin o crear uno en recepción.
    // Usamos el endpoint de admin ya que reception tiene permisos (pero podemos usar /api/recepcion/groomers si existe)
    // Simplificamos usando el mismo endpoint que usa admin, pero con token de recepción (debe funcionar si el middleware permite)
    // Nota: el endpoint /admin/users/list requiere rol admin, así que necesitamos un endpoint específico para recepción.
    // Crearemos un endpoint en recepción: router.get('/groomers', ...) más fácil.
    // Como no lo tenemos, usamos el mismo de admin? No, dará 403. Mejor implementamos en recepción.controller una función getGroomersList.
    // Asumiremos que existe /api/recepcion/groomers (lo agregaremos).
    // Por ahora, si no existe, mostrar error.
    const res = await authFetch(`${RECEPCION_API}/groomers`);
    const data = await res.json();
    groomerSelect.innerHTML = '<option value="">Seleccionar groomer</option>';
    groomerBloq.innerHTML = '<option value="">— Global (todos) —</option>';
    data.forEach(g => {
      groomerSelect.innerHTML += `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`;
      groomerBloq.innerHTML += `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`;
    });
  } catch (err) { console.error(err); showAlert(dispAlert, 'Error cargando groomers', 'error'); }
}

// Bloqueos
async function loadBloqueos() {
  try {
    const res = await authFetch(`${RECEPCION_API}/bloqueos`);
    const bloqueos = await res.json();
    const tbody = document.getElementById('bloqueosTable');
    if (!bloqueos.length) { tbody.innerHTML = '<tr><td colspan="6">No hay bloqueos</td></tr>'; return; }
    tbody.innerHTML = bloqueos.map(b => `
      <tr>
        <td>${b.id}</td><td>${b.tipo_bloqueo}</td>
        <td>${new Date(b.fecha_inicio).toLocaleString()}</td>
        <td>${new Date(b.fecha_fin).toLocaleString()}</td>
        <td>${b.groomers ? `${b.groomers.nombre} ${b.groomers.apellido}` : 'Global'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="eliminarBloqueo(${b.id})">Eliminar</button></td>
      </tr>
    `).join('');
    window.eliminarBloqueo = async (id) => {
      if (!confirm('¿Eliminar este bloqueo?')) return;
      await authFetch(`${RECEPCION_API}/bloqueos/${id}`, { method: 'DELETE' });
      loadBloqueos();
    };
  } catch (err) { console.error(err); }
}

bloqueoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    tipo_bloqueo: tipoBloqueo.value,
    fecha_inicio: new Date(fechaInicioBloq.value).toISOString(),
    fecha_fin: new Date(fechaFinBloq.value).toISOString(),
    descripcion: descBloqueo.value,
    groomer_id: groomerBloq.value || null,
  };
  try {
    const res = await authFetch(`${RECEPCION_API}/bloqueos`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).message);
    showAlert(bloqueoAlert, 'Bloqueo creado', 'success');
    bloqueoForm.reset();
    loadBloqueos();
  } catch (err) { showAlert(bloqueoAlert, err.message, 'error'); }
});

// Disponibilidad
async function cargarDisponibilidad(groomerId) {
  currentGroomerId = groomerId;
  try {
    const res = await authFetch(`${RECEPCION_API}/groomers/${groomerId}/disponibilidad`);
    const data = await res.json();
    currentHorarios = data.map(d => ({ dia_semana: d.dia_semana, hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, buffer_minutos: d.buffer_minutos || 15 }));
    renderHorarios();
    disponibilidadPanel.style.display = 'block';
  } catch (err) { showAlert(dispAlert, 'Error cargando disponibilidad', 'error'); }
}

function renderHorarios() {
  if (currentHorarios.length === 0) { horariosGroomerList.innerHTML = '<p>No hay horarios configurados.</p>'; return; }
  horariosGroomerList.innerHTML = currentHorarios.map((h, idx) => `
    <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
      <select data-index="${idx}" class="dia-select">${Object.entries(diaNombres).map(([num, name]) => `<option value="${num}" ${h.dia_semana == num ? 'selected' : ''}>${name}</option>`).join('')}</select>
      <input type="time" value="${h.hora_inicio}" data-index="${idx}" class="hora-inicio">
      <span>a</span>
      <input type="time" value="${h.hora_fin}" data-index="${idx}" class="hora-fin">
      <button class="btn btn-danger btn-sm eliminar-horario" data-index="${idx}">Eliminar</button>
    </div>
  `).join('');
  document.querySelectorAll('.eliminar-horario').forEach(btn => btn.addEventListener('click', (e) => { const idx = parseInt(btn.dataset.index); currentHorarios.splice(idx,1); renderHorarios(); }));
  document.querySelectorAll('.dia-select, .hora-inicio, .hora-fin').forEach(input => input.addEventListener('change', (e) => { const idx = parseInt(input.dataset.index); if (input.classList.contains('dia-select')) currentHorarios[idx].dia_semana = parseInt(input.value); if (input.classList.contains('hora-inicio')) currentHorarios[idx].hora_inicio = input.value; if (input.classList.contains('hora-fin')) currentHorarios[idx].hora_fin = input.value; }));
}

agregarHorarioBtn.addEventListener('click', () => { currentHorarios.push({ dia_semana:1, hora_inicio:'09:00', hora_fin:'17:00', buffer_minutos:15 }); renderHorarios(); });
guardarDisponibilidadBtn.addEventListener('click', async () => {
  if (!currentGroomerId) return;
  const payload = currentHorarios.map(h => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, buffer_minutos: h.buffer_minutos || 15 }));
  try {
    const res = await authFetch(`${RECEPCION_API}/groomers/${currentGroomerId}/disponibilidad`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).message);
    showAlert(dispAlert, 'Disponibilidad guardada', 'success');
  } catch (err) { showAlert(dispAlert, err.message, 'error'); }
});

groomerSelect.addEventListener('change', () => { const id = groomerSelect.value; if (id) cargarDisponibilidad(id); else disponibilidadPanel.style.display = 'none'; });

// Logout
function doLogout() { authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(()=>{}); clearTokens(); window.location.href = 'index.html'; }
document.getElementById('logoutBtn').addEventListener('click', doLogout);
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

// Inicialización
loadConfig();
loadGroomers();
loadBloqueos();