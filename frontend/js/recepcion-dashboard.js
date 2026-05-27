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
// NAVEGACIÓN SPA
// ══════════════════════════════════════════════════════════════
const ALL_SECTIONS = [
  'inicio', 'citas', 'clientes', 'nueva-cita',
  'registrar-cliente', 'registrar-mascota',
  'perfil', 'gestionar-mascotas',
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
    if (sec === 'gestionar-mascotas') loadMascotasCRUD();
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fillSelect(id, items, labelFn, valueFn = i => i.id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">— Seleccionar —</option>'
    + items.map(i => `<option value="${valueFn(i)}">${escapeHtml(labelFn(i))}</option>`).join('');
}

const ESTADO_BADGE = {
  agendada:    { bg: '#e8f5ed', color: '#2d5a45', label: 'Agendada'    },
  confirmada:  { bg: '#dbeafe', color: '#1d4ed8', label: 'Confirmada'  },
  cancelada:   { bg: '#fee2e2', color: '#dc2626', label: 'Cancelada'   },
  completada:  { bg: '#f3f4f6', color: '#374151', label: 'Completada'  },
  no_asistio:  { bg: '#fef3c7', color: '#92400e', label: 'No asistió'  },
  en_progreso: { bg: '#ede9fe', color: '#5b21b6', label: 'En progreso' },
};

function estadoBadge(estado) {
  const s = ESTADO_BADGE[estado] || { bg: '#f3f4f6', color: '#374151', label: estado };
  return `<span style="background:${s.bg};color:${s.color};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;">${s.label}</span>`;
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
// DASHBOARD (INICIO)
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
              <td><strong>${escapeHtml(c.hora)}</strong></td>
              <td>🐾 ${escapeHtml(c.mascota)}</td>
              <td>${escapeHtml(c.servicio)}</td>
              <td>${escapeHtml(c.groomer)}</td>
              <td>${estadoBadge(c.estado)}</td>
            </tr>`).join('')
        : '<tr><td colspan="5" style="text-align:center;color:#8aab97;padding:16px;">No hay citas hoy</td></tr>';
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
// CITAS HOY — DETALLE COMPLETO
// ══════════════════════════════════════════════════════════════
async function loadCitasHoy() {
  const tbody = document.querySelector('#citasDetalleTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;">⏳ Cargando citas...</td></tr>';

  try {
    const today = new Date().toISOString().split('T')[0];
    // Usa /citas/todas para obtener el detalle completo del día
    const res   = await authFetch(`${RECEPCION_API}/citas/todas?desde=${today}&hasta=${today}`);
    if (!res.ok) throw new Error((await res.json()).message);
    const citas = await res.json();

    if (!citas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:32px;color:#8aab97;">
            📭 No hay citas programadas para hoy<br>
            <a href="recepcion-calendario.html" style="color:var(--green-soft);font-size:13px;margin-top:8px;display:inline-block;">
              → Ir al Calendario para agendar una cita
            </a>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = citas.map(c => {
      const puedeConfirmar = c.estado === 'agendada';
      return `
      <tr>
        <td><strong style="font-size:15px;">${escapeHtml(c.hora || '—')}</strong></td>
        <td>
          <div style="font-weight:600;">🐾 ${escapeHtml(c.mascota)}</div>
        </td>
        <td>✂️ ${escapeHtml(c.servicio)}</td>
        <td>👤 ${escapeHtml(c.groomer)}</td>
        <td style="font-size:12px;color:var(--text-mid);">
          ${c.duracion ? `⏱️ ${c.duracion}min` : '—'}
        </td>
        <td>${estadoBadge(c.estado)}</td>
        <td style="display:flex;gap:5px;flex-wrap:wrap;">
          ${puedeConfirmar
            ? `<button class="btn btn-outline btn-sm" data-action="confirmar" data-id="${c.id}">✅ Confirmar</button>`
            : ''}
          <a href="recepcion-calendario.html" class="btn btn-outline btn-sm" style="text-decoration:none;font-size:11px;">📆 Calendario</a>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-action="confirmar"]').forEach(btn => {
      btn.addEventListener('click', () => confirmarCitaDirecto(parseInt(btn.dataset.id)));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#dc2626;padding:14px;">❌ Error: ${escapeHtml(err.message)}</td></tr>`;
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
  const payload = {
    mascota_id:  parseInt(document.getElementById('citaMascota').value),
    servicio_id: parseInt(document.getElementById('citaServicio').value),
    groomer_id:  parseInt(document.getElementById('citaGroomer').value),
    fecha:       document.getElementById('citaFecha').value,
    hora:        document.getElementById('citaHora').value.substring(0, 5),
    notas:       document.getElementById('citaNotas').value.trim() || null,
  };
  if (!payload.mascota_id || !payload.servicio_id || !payload.groomer_id)
    return showAlert('citaMessage', '⚠️ Completa todos los campos obligatorios', 'error');
  if (!payload.fecha || !payload.hora)
    return showAlert('citaMessage', '⚠️ Indica la fecha y hora', 'error');

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = '⏳ Agendando...';
  try {
    const res  = await authFetch(`${RECEPCION_API}/citas`, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    const info    = data._info;
    const infoTxt = info ? ` · ${info.duracion_ajustada_min}min (${info.tamanio_mascota}, ×${info.multiplicador_aplicado?.toFixed(2)})` : '';
    showAlert('citaMessage', `✅ Cita agendada${infoTxt}`, 'success');
    e.target.reset();
    loadDashboard();
  } catch (err) {
    showAlert('citaMessage', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '📅 Agendar cita';
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
  } catch (err) { console.error(err); }
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
// GESTIONAR MASCOTAS — CRUD
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
        <td>${m.foto_url ? `<img src="${escapeHtml(m.foto_url)}" width="40" height="40" style="object-fit:cover;border-radius:8px;">` : '—'}</td>
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
  } catch (err) { console.error('Error cargando mascotas CRUD:', err); }
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
      if (m.fecha_nacimiento)
        document.getElementById('mascotaCRUDFechaNac').value = new Date(m.fecha_nacimiento).toISOString().split('T')[0];
    } catch { showAlert('mascotaCRUDMessage', 'Error al cargar datos de la mascota', 'error'); }
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
  } catch (err) { showAlert('mascotaCRUDMessage', err.message, 'error'); }
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
  } catch (err) { showAlert('mascotaCRUDMessage', err.message, 'error'); }
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
  } catch (err) { showAlert('passMessage', err.message, 'error'); }
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
loadDashboard();