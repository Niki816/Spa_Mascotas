// ─── js/recepcion-dashboard.js ────────────────────────────────────────────────
import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const RECEPCION_API = API_URL.replace('/auth', '/recepcion');

// ══════════════════════════════════════════════════════════════
// GUARD
// ══════════════════════════════════════════════════════════════
const token = getAccessToken();
const user  = getUser();
if (!token || !user || user.rol !== 'recepcion') {
  clearTokens();
  window.location.href = 'index.html';
}

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('userEmail').textContent   = user.email;
const perfilEmailEl = document.getElementById('perfilEmail');
if (perfilEmailEl) perfilEmailEl.textContent = user.email;

// ══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ══════════════════════════════════════════════════════════════
const ALL_SECTIONS = [
  'inicio', 'citas', 'clientes', 'nueva-cita',
  'registrar-cliente', 'registrar-mascota',
  'cancelar-cita', 'perfil', 'gestionar-mascotas',
  'gestionar-citas',   // ← sección CRUD citas
];

function showSection(sec) {
  ALL_SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === sec ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-item[data-section]').forEach(l =>
    l.classList.toggle('active', l.dataset.section === sec)
  );
}

document.querySelectorAll('.nav-item[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    showSection(sec);
    if (sec === 'inicio')             loadDashboard();
    if (sec === 'citas')              loadCitasHoy();
    if (sec === 'clientes')           loadClientes();
    if (sec === 'nueva-cita')         loadFormularioNuevaCita();
    if (sec === 'registrar-mascota')  loadClientesParaSelect('regMascotaClienteId');
    if (sec === 'cancelar-cita')      loadCitasParaCancelar();
    if (sec === 'gestionar-mascotas') loadMascotasCRUD();
    if (sec === 'gestionar-citas')    loadCitasCRUD();
  });
});

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => { el.className = 'alert'; }, 5000);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ESTADO_BADGE = {
  agendada:    { bg: '#e8f5ed', color: '#2d5a45', label: 'Agendada'    },
  confirmada:  { bg: '#dbeafe', color: '#1d4ed8', label: 'Confirmada'  },
  cancelada:   { bg: '#fee2e2', color: '#dc2626', label: 'Cancelada'   },
  completada:  { bg: '#f3f4f6', color: '#374151', label: 'Completada'  },
  no_asistio:  { bg: '#fef3c7', color: '#92400e', label: 'No asistió'  },
};
function estadoBadge(estado) {
  const s = ESTADO_BADGE[estado] || { bg: '#f3f4f6', color: '#374151', label: estado };
  return `<span style="background:${s.bg};color:${s.color};padding:2px 9px;border-radius:10px;font-size:11px;font-weight:500;">${s.label}</span>`;
}

// ══════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════
function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn')?.addEventListener('click',  e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2')?.addEventListener('click', doLogout);

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    const res  = await authFetch(`${RECEPCION_API}/dashboard`);
    const data = await res.json();

    document.getElementById('citasHoyCount').textContent = data.citasHoy?.length ?? 0;
    document.getElementById('clientesCount').textContent = data.totalClientes ?? 0;

    const tableCitas = document.querySelector('#citasHoyTable tbody');
    if (tableCitas) {
      tableCitas.innerHTML = data.citasHoy?.length
        ? data.citasHoy.map(c => `
            <tr>
              <td>${escapeHtml(c.hora)}</td>
              <td>${escapeHtml(c.mascota)}</td>
              <td>${escapeHtml(c.servicio)}</td>
              <td>${escapeHtml(c.groomer)}</td>
            </tr>`).join('')
        : '<tr><td colspan="4" style="text-align:center;color:#8aab97;">No hay citas hoy</td></tr>';
    }

    const tableClientes = document.querySelector('#clientesTable tbody');
    if (tableClientes) {
      tableClientes.innerHTML = data.ultimosClientes?.length
        ? data.ultimosClientes.map(c => `
            <tr>
              <td>${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</td>
              <td>${escapeHtml(c.email)}</td>
              <td>${escapeHtml(c.telefono || '—')}</td>
            </tr>`).join('')
        : '<tr><td colspan="3">Sin clientes recientes</td></tr>';
    }
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

// ══════════════════════════════════════════════════════════════
// CITAS DE HOY
// ══════════════════════════════════════════════════════════════
async function loadCitasHoy() {
  try {
    const res   = await authFetch(`${RECEPCION_API}/citas/hoy`);
    const citas = await res.json();
    const tbody = document.querySelector('#citasDetalleTable tbody');
    if (!tbody) return;

    tbody.innerHTML = citas.length
      ? citas.map(c => `
          <tr>
            <td>${escapeHtml(c.hora)}</td>
            <td>${escapeHtml(c.mascota)}</td>
            <td>${escapeHtml(c.servicio)}</td>
            <td>${escapeHtml(c.groomer)}</td>
            <td>${estadoBadge(c.estado)}</td>
            <td style="display:flex;gap:5px;flex-wrap:wrap;">
              ${c.estado === 'agendada'
                ? `<button class="btn btn-outline btn-sm" data-action="confirmar" data-id="${c.id}">✅ Confirmar</button>`
                : ''}
              ${['agendada','confirmada'].includes(c.estado)
                ? `<button class="btn btn-danger btn-sm" data-action="cancelar" data-id="${c.id}">❌ Cancelar</button>`
                : ''}
            </td>
          </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:20px;color:#8aab97;">No hay citas hoy</td></tr>';

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        if (btn.dataset.action === 'confirmar') confirmarCitaDirecto(id);
        if (btn.dataset.action === 'cancelar')  irACancelar(id);
      });
    });
  } catch (err) {
    console.error(err);
  }
}

async function confirmarCitaDirecto(citaId) {
  try {
    const res = await authFetch(`${RECEPCION_API}/citas/${citaId}/confirmar`, { method: 'PATCH' });
    if (!res.ok) throw new Error((await res.json()).message);
    loadCitasHoy();
    loadDashboard();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function irACancelar(citaId) {
  showSection('cancelar-cita');
  loadCitasParaCancelar(citaId);
}

document.getElementById('btnRefrescarCitas')?.addEventListener('click', loadCitasHoy);

// ══════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════
async function loadClientes(search = '') {
  try {
    const res      = await authFetch(`${RECEPCION_API}/clientes?search=${encodeURIComponent(search)}`);
    const clientes = await res.json();
    const tbody    = document.querySelector('#clientesListaTable tbody');
    if (!tbody) return;
    tbody.innerHTML = clientes.length
      ? clientes.map(c => `
          <tr>
            <td>${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</td>
            <td>${escapeHtml(c.email)}</td>
            <td>${escapeHtml(c.telefono || '—')}</td>
            <td>${escapeHtml(c.ci || '—')}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;">No se encontraron clientes</td></tr>';
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('searchCliente')?.addEventListener('input', e => loadClientes(e.target.value));

// ══════════════════════════════════════════════════════════════
// NUEVA CITA
// ══════════════════════════════════════════════════════════════
async function loadFormularioNuevaCita() {
  try {
    const [mascotas, servicios, groomers] = await Promise.all([
      authFetch(`${RECEPCION_API}/mascotas`).then(r => r.json()),
      authFetch(`${RECEPCION_API}/servicios`).then(r => r.json()),
      authFetch(`${RECEPCION_API}/groomers`).then(r => r.json()),
    ]);

    fillSelect('citaMascota',  mascotas,  m => `${m.nombre} (${m.dueno})`);
    fillSelect('citaServicio', servicios, s => `${s.nombre} · ${s.duracion_base_minutos ?? s.duracion}min · Bs${s.precio_base}`);
    fillSelect('citaGroomer',  groomers,  g => `${g.nombre} ${g.apellido}`);
  } catch (err) {
    console.error('Error cargando formulario nueva cita:', err);
  }
}

document.getElementById('nuevaCitaForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const horaRaw    = document.getElementById('citaHora').value;
  const horaLimpia = horaRaw.substring(0, 5);
  const payload = {
    mascota_id:  parseInt(document.getElementById('citaMascota').value),
    servicio_id: parseInt(document.getElementById('citaServicio').value),
    groomer_id:  parseInt(document.getElementById('citaGroomer').value),
    fecha:       document.getElementById('citaFecha').value,
    hora:        horaLimpia,
    notas:       document.getElementById('citaNotas').value.trim() || null,
  };

  if (!payload.mascota_id || !payload.servicio_id || !payload.groomer_id) {
    return showAlert('citaMessage', '⚠️ Completa todos los campos obligatorios', 'error');
  }
  if (!payload.fecha || !payload.hora) {
    return showAlert('citaMessage', '⚠️ Indica la fecha y hora', 'error');
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Agendando...';

  try {
    const res  = await authFetch(`${RECEPCION_API}/citas`, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    const info   = data._info;
    const infoTxt = info
      ? ` · Duración: ${info.duracion_ajustada_min}min (${info.tamanio_mascota}, ×${info.multiplicador_aplicado?.toFixed(2)})`
      : '';
    showAlert('citaMessage', `✅ Cita agendada correctamente${infoTxt}`, 'success');
    e.target.reset();
    loadDashboard();
  } catch (err) {
    showAlert('citaMessage', `❌ ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '📅 Agendar cita';
  }
});

// ══════════════════════════════════════════════════════════════
// REGISTRAR CLIENTE
// ══════════════════════════════════════════════════════════════
document.getElementById('formRegistrarCliente')?.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    nombre:    document.getElementById('regClienteNombre').value.trim(),
    apellido:  document.getElementById('regClienteApellido').value.trim(),
    email:     document.getElementById('regClienteEmail').value.trim(),
    password:  document.getElementById('regClientePassword').value,
    ci:        document.getElementById('regClienteCI').value.trim(),
    telefono:  document.getElementById('regClienteTelefono').value.trim(),
    direccion: document.getElementById('regClienteDireccion').value.trim(),
  };
  try {
    const res  = await authFetch(`${RECEPCION_API}/clientes`, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('regClienteMessage', `✅ ${data.message}`, 'success');
    e.target.reset();
  } catch (err) {
    showAlert('regClienteMessage', err.message, 'error');
  }
});

document.getElementById('togglePassBtn')?.addEventListener('click', function () {
  const inp = document.getElementById('regClientePassword');
  inp.type  = inp.type === 'password' ? 'text' : 'password';
  this.textContent = inp.type === 'password' ? '👁️' : '🙈';
});

// ══════════════════════════════════════════════════════════════
// REGISTRAR MASCOTA
// ══════════════════════════════════════════════════════════════
async function loadClientesParaSelect(selectId) {
  try {
    const res      = await authFetch(`${RECEPCION_API}/clientes`);
    const clientes = await res.json();
    const select   = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">— Seleccionar dueño —</option>'
      + clientes.map(c =>
          `<option value="${c.id}">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)} (CI: ${c.ci || '—'})</option>`
        ).join('');
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('formRegistrarMascota')?.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    cliente_id:            parseInt(document.getElementById('regMascotaClienteId').value),
    nombre:                document.getElementById('regMascotaNombre').value.trim(),
    especie:               document.getElementById('regMascotaEspecie').value,
    raza:                  document.getElementById('regMascotaRaza').value.trim() || null,
    fecha_nacimiento:      document.getElementById('regMascotaFechaNac').value || null,
    peso_kg:               document.getElementById('regMascotaPeso').value || null,
    temperamento:          document.getElementById('regMascotaTemperamento').value || null,
    alergias:              document.getElementById('regMascotaAlergias').value.trim() || null,
    restricciones_medicas: document.getElementById('regMascotaRestricciones').value.trim() || null,
  };
  try {
    const res  = await authFetch(`${RECEPCION_API}/mascotas`, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('regMascotaMessage', `✅ ${data.message} — Tamaño: ${data.tamanio_estimado}`, 'success');
    e.target.reset();
  } catch (err) {
    showAlert('regMascotaMessage', err.message, 'error');
  }
});

// ══════════════════════════════════════════════════════════════
// CANCELAR CITA
// ══════════════════════════════════════════════════════════════
async function loadCitasParaCancelar(preselectedId = null) {
  const select = document.getElementById('cancelarCitaId');
  if (!select) return;
  select.innerHTML = '<option value="">⏳ Cargando citas...</option>';
  select.disabled  = true;
  try {
    const res   = await authFetch(`${RECEPCION_API}/citas/activas`);
    if (!res.ok) throw new Error((await res.json()).message);
    const citas = await res.json();
    if (!citas.length) {
      select.innerHTML = '<option value="">— No hay citas activas —</option>';
    } else {
      select.innerHTML = '<option value="">— Seleccionar cita —</option>'
        + citas.map(c =>
            `<option value="${c.id}">${escapeHtml(c.fechaHora)} — ${escapeHtml(c.mascota)} — ${escapeHtml(c.servicio)} (${escapeHtml(c.estado)})</option>`
          ).join('');
      if (preselectedId) select.value = preselectedId;
    }
  } catch (err) {
    select.innerHTML = '<option value="">— Error al cargar —</option>';
    showAlert('cancelarMessage', `Error: ${err.message}`, 'error');
  } finally {
    select.disabled = false;
  }
}

document.getElementById('formCancelarCita')?.addEventListener('submit', async e => {
  e.preventDefault();
  const citaId = document.getElementById('cancelarCitaId').value;
  const motivo = document.getElementById('cancelarMotivo').value.trim();
  if (!citaId) return showAlert('cancelarMessage', '⚠️ Selecciona una cita', 'error');

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Cancelando...';
  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}/cancelar`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('cancelarMessage', `✅ ${data.message}`, 'success');
    e.target.reset();
    loadCitasParaCancelar();
    loadDashboard();
  } catch (err) {
    showAlert('cancelarMessage', `❌ ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '❌ Cancelar cita';
  }
});

// ══════════════════════════════════════════════════════════════
// ██████████████████████████████████████████████████████████████
//   GESTIÓN DE CITAS — CRUD COMPLETO
// ██████████████████████████████████████████████████████████████
// ══════════════════════════════════════════════════════════════

async function loadCitasCRUD() {
  const tbody     = document.getElementById('citasCRUDTableBody');
  const selectFil = document.getElementById('filtroCitasEstado');
  if (!tbody) return;
 
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">⏳ Cargando...</td></tr>';
 
  // Leer filtro activo del select (si existe en el HTML)
  const estadoFiltro = selectFil ? selectFil.value : '';
  const qs = estadoFiltro ? `?estado=${encodeURIComponent(estadoFiltro)}` : '';
 
  try {
    // Llama a /citas/todas — devuelve TODAS las citas (cualquier estado)
    const res   = await authFetch(`${RECEPCION_API}/citas/todas${qs}`);
    if (!res.ok) throw new Error((await res.json()).message);
    const citas = await res.json();
 
    if (!citas.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#8aab97;">No hay citas para mostrar</td></tr>';
      return;
    }
 
    tbody.innerHTML = citas.map(c => {
      // Los botones se muestran según el estado
      const puedeEditar   = ['agendada', 'confirmada'].includes(c.estado);
      const puedeEliminar = c.estado !== 'completada'; // completadas no se eliminan
 
      return `
      <tr style="${!puedeEditar ? 'opacity:0.75;' : ''}">
        <td style="font-weight:600;color:var(--text-mid);">#${c.id}</td>
        <td>${escapeHtml(c.fechaHora)}</td>
        <td>${escapeHtml(c.mascota)}</td>
        <td>${escapeHtml(c.servicio)}</td>
        <td>${escapeHtml(c.groomer)}</td>
        <td>${estadoBadge(c.estado)}</td>
        <td style="display:flex;gap:5px;flex-wrap:wrap;">
          ${puedeEditar
            ? `<button class="btn btn-outline btn-sm" data-action="editar" data-id="${c.id}">✏️ Editar</button>`
            : `<button class="btn btn-outline btn-sm" style="opacity:0.4;cursor:not-allowed;" disabled title="Solo se pueden editar citas agendadas o confirmadas">✏️ Editar</button>`
          }
          ${puedeEliminar
            ? `<button class="btn btn-danger btn-sm" data-action="eliminar" data-id="${c.id}">🗑️ Eliminar</button>`
            : `<button class="btn btn-danger btn-sm" style="opacity:0.4;cursor:not-allowed;" disabled title="Las citas completadas no se pueden eliminar">🗑️ Eliminar</button>`
          }
        </td>
      </tr>`;
    }).join('');
 
    // Solo los botones habilitados reciben el listener
    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        if (btn.dataset.action === 'editar')   openEditarCitaModal(id);
        if (btn.dataset.action === 'eliminar') eliminarCita(id);
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#dc2626;padding:14px;">❌ Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}
 
// ── Helper: llenar un <select> ─────────────────────────────────
function fillSelect(id, items, labelFn, valueFn = i => i.id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">— Seleccionar —</option>'
    + items.map(i => `<option value="${valueFn(i)}">${escapeHtml(labelFn(i))}</option>`).join('');
}
 
// ── Abrir modal de edición ─────────────────────────────────────
async function openEditarCitaModal(citaId) {
  const modal = document.getElementById('editarCitaModal');
  if (!modal) return;
 
  document.getElementById('editCitaId').value = citaId;
  document.getElementById('editCitaModalTitle').textContent = `✏️ Editar Cita #${citaId}`;
 
  // Limpiar alerta previa
  const alertEl = document.getElementById('editCitaMessage');
  if (alertEl) alertEl.className = 'alert';
 
  try {
    const [citaRes, mascotasRes, serviciosRes, groomersRes] = await Promise.all([
      authFetch(`${RECEPCION_API}/citas/${citaId}`),
      authFetch(`${RECEPCION_API}/mascotas`),
      authFetch(`${RECEPCION_API}/servicios`),
      authFetch(`${RECEPCION_API}/groomers`),
    ]);
 
    if (!citaRes.ok) throw new Error((await citaRes.json()).message);
    const cita      = await citaRes.json();
    const mascotas  = await mascotasRes.json();
    const servicios = await serviciosRes.json();
    const groomers  = await groomersRes.json();
 
    fillSelect('editCitaMascota',  mascotas,  m => `${m.nombre} (${m.dueno})`);
    fillSelect('editCitaServicio', servicios, s => `${s.nombre} · ${s.duracion_base_minutos ?? s.duracion}min · Bs${s.precio_base}`);
    fillSelect('editCitaGroomer',  groomers,  g => `${g.nombre} ${g.apellido}`);
 
    document.getElementById('editCitaMascota').value  = cita.mascota_id;
    document.getElementById('editCitaServicio').value = cita.servicio_id;
    document.getElementById('editCitaGroomer').value  = cita.groomer_id;
    document.getElementById('editCitaFecha').value    = cita.fecha;
    document.getElementById('editCitaHora').value     = cita.hora;
    document.getElementById('editCitaNotas').value    = cita.notas || '';
 
    document.getElementById('editCitaInfoDuracion').textContent =
      `Duración actual: ${cita.duracion_estimada_min}min  |  Estado: ${cita.estado}  |  Precio: Bs${cita.precio_calculado}`;
 
    modal.classList.add('open');
  } catch (err) {
    alert(`Error al cargar la cita: ${err.message}`);
  }
}
 
function closeEditarCitaModal() {
  document.getElementById('editarCitaModal')?.classList.remove('open');
}
document.getElementById('closeEditarCitaModalBtn')?.addEventListener('click', closeEditarCitaModal);
document.getElementById('editarCitaModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeEditarCitaModal();
});
 
// ── Submit edición ─────────────────────────────────────────────
document.getElementById('formEditarCita')?.addEventListener('submit', async e => {
  e.preventDefault();
  const citaId = document.getElementById('editCitaId').value;
  if (!citaId) return;
 
  const payload = {
    mascota_id:  parseInt(document.getElementById('editCitaMascota').value),
    servicio_id: parseInt(document.getElementById('editCitaServicio').value),
    groomer_id:  parseInt(document.getElementById('editCitaGroomer').value),
    fecha:       document.getElementById('editCitaFecha').value,
    hora:        document.getElementById('editCitaHora').value.substring(0, 5),
    notas:       document.getElementById('editCitaNotas').value.trim() || null,
  };
 
  if (!payload.mascota_id || !payload.servicio_id || !payload.groomer_id || !payload.fecha || !payload.hora) {
    return showAlert('editCitaMessage', '⚠️ Completa todos los campos', 'error');
  }
 
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Guardando...';
 
  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
 
    const info    = data._info;
    const infoTxt = info
      ? ` · Duración: ${info.duracion_ajustada_min}min (${info.tamanio_mascota})`
      : '';
    showAlert('editCitaMessage', `✅ Cita actualizada${infoTxt}`, 'success');
 
    setTimeout(() => {
      closeEditarCitaModal();
      loadCitasCRUD();
      loadDashboard();
    }, 1500);
  } catch (err) {
    showAlert('editCitaMessage', `❌ ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Guardar cambios';
  }
});
 
// ── Eliminar cita ──────────────────────────────────────────────
async function eliminarCita(citaId) {
  if (!confirm(`¿Eliminar permanentemente la cita #${citaId}?\n\nEsta acción no se puede deshacer.`)) return;
  try {
    const res = await authFetch(`${RECEPCION_API}/citas/${citaId}`, { method: 'DELETE' });
    if (res.status === 204) {
      showAlert('citasCRUDMessage', `✅ Cita #${citaId} eliminada`, 'success');
      loadCitasCRUD();
      loadDashboard();
    } else {
      throw new Error((await res.json()).message);
    }
  } catch (err) {
    showAlert('citasCRUDMessage', `❌ ${err.message}`, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// CRUD MASCOTAS (sin cambios)
// ══════════════════════════════════════════════════════════════
async function loadMascotasCRUD() {
  try {
    const res   = await authFetch(`${RECEPCION_API}/mascotas`);
    const data  = await res.json();
    const tbody = document.getElementById('mascotasCRUDTableBody');
    if (!tbody) return;

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay mascotas registradas</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(m => `
      <tr>
        <td>${m.id}</td>
        <td>${escapeHtml(m.nombre)}</td>
        <td>${escapeHtml(m.especie)}</td>
        <td>${escapeHtml(m.dueno || '—')}</td>
        <td>${m.peso_kg ?? '—'}</td>
        <td>${escapeHtml(m.temperamento || '—')}</td>
        <td>${m.foto_url
          ? `<img src="${escapeHtml(m.foto_url)}" width="40" height="40" style="object-fit:cover;border-radius:8px;">`
          : '—'}</td>
        <td style="display:flex;gap:5px;">
          <button class="btn btn-outline btn-sm" data-action="editar"   data-id="${m.id}">✏️ Editar</button>
          <button class="btn btn-danger  btn-sm" data-action="eliminar" data-id="${m.id}">🗑️ Eliminar</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        if (btn.dataset.action === 'editar')   openMascotaCRUDModal(id);
        if (btn.dataset.action === 'eliminar') deleteMascotaCRUD(id);
      });
    });
  } catch (err) {
    console.error('Error cargando mascotas CRUD:', err);
  }
}

async function openMascotaCRUDModal(id = null) {
  const modal = document.getElementById('mascotaCRUDModal');
  const title = document.getElementById('mascotaCRUDModalTitle');
  document.getElementById('mascotaCRUDForm').reset();
  document.getElementById('mascotaCRUDId').value = '';
  await loadClientesParaSelect('mascotaCRUDClienteId');

  if (id) {
    title.textContent = 'Editar Mascota';
    try {
      const res = await authFetch(`${RECEPCION_API}/mascotas/${id}`);
      const m   = await res.json();
      document.getElementById('mascotaCRUDId').value            = m.id;
      document.getElementById('mascotaCRUDClienteId').value     = m.dueno_principal_id;
      document.getElementById('mascotaCRUDNombre').value        = m.nombre;
      document.getElementById('mascotaCRUDEspecie').value       = m.especie;
      document.getElementById('mascotaCRUDRaza').value          = m.raza || '';
      document.getElementById('mascotaCRUDPeso').value          = m.peso_kg || '';
      document.getElementById('mascotaCRUDTemperamento').value  = m.temperamento || '';
      document.getElementById('mascotaCRUDAlergias').value      = m.alergias || '';
      document.getElementById('mascotaCRUDRestricciones').value = m.restricciones_medicas || '';
      document.getElementById('mascotaCRUDNotas').value         = m.notas_adicionales || '';
      document.getElementById('mascotaCRUDFotoUrl').value       = m.foto_url || '';
      if (m.fecha_nacimiento) {
        document.getElementById('mascotaCRUDFechaNac').value =
          new Date(m.fecha_nacimiento).toISOString().split('T')[0];
      }
    } catch {
      showAlert('mascotaCRUDMessage', 'Error al cargar datos de la mascota', 'error');
    }
  } else {
    title.textContent = 'Nueva Mascota';
  }
  modal.classList.add('open');
}

async function deleteMascotaCRUD(id) {
  if (!confirm('¿Eliminar esta mascota? Solo es posible si no tiene citas asociadas.')) return;
  try {
    const res = await authFetch(`${RECEPCION_API}/mascotas/${id}`, { method: 'DELETE' });
    if (res.status !== 204) throw new Error((await res.json()).message);
    showAlert('mascotaCRUDMessage', '✅ Mascota eliminada', 'success');
    loadMascotasCRUD();
  } catch (err) {
    showAlert('mascotaCRUDMessage', err.message, 'error');
  }
}

document.getElementById('btnNuevaMascotaCRUD')?.addEventListener('click', () => openMascotaCRUDModal());

document.getElementById('closeMascotaCRUDModalBtn')?.addEventListener('click', () => {
  document.getElementById('mascotaCRUDModal').classList.remove('open');
});
document.getElementById('mascotaCRUDModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

document.getElementById('mascotaCRUDForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('mascotaCRUDId').value;
  const payload = {
    cliente_id:            parseInt(document.getElementById('mascotaCRUDClienteId').value),
    nombre:                document.getElementById('mascotaCRUDNombre').value.trim(),
    especie:               document.getElementById('mascotaCRUDEspecie').value,
    raza:                  document.getElementById('mascotaCRUDRaza').value.trim() || null,
    fecha_nacimiento:      document.getElementById('mascotaCRUDFechaNac').value || null,
    peso_kg:               document.getElementById('mascotaCRUDPeso').value || null,
    temperamento:          document.getElementById('mascotaCRUDTemperamento').value || null,
    alergias:              document.getElementById('mascotaCRUDAlergias').value.trim() || null,
    restricciones_medicas: document.getElementById('mascotaCRUDRestricciones').value.trim() || null,
    notas_adicionales:     document.getElementById('mascotaCRUDNotas').value.trim() || null,
    foto_url:              document.getElementById('mascotaCRUDFotoUrl').value.trim() || null,
  };
  try {
    const url    = id ? `${RECEPCION_API}/mascotas/${id}` : `${RECEPCION_API}/mascotas`;
    const method = id ? 'PUT' : 'POST';
    const res    = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data   = await res.json();
    if (!res.ok) throw new Error(data.message);
    document.getElementById('mascotaCRUDModal').classList.remove('open');
    showAlert('mascotaCRUDMessage', id ? '✅ Mascota actualizada' : '✅ Mascota creada', 'success');
    loadMascotasCRUD();
  } catch (err) {
    showAlert('mascotaCRUDMessage', err.message, 'error');
  }
});

// ══════════════════════════════════════════════════════════════
// CAMBIAR CONTRASEÑA
// ══════════════════════════════════════════════════════════════
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
    showAlert('passMessage', '✅ Contraseña actualizada. Redirigiendo...', 'success');
    setTimeout(() => { clearTokens(); window.location.href = 'index.html'; }, 2000);
  } catch (err) {
    showAlert('passMessage', err.message, 'error');
  }
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
loadDashboard();