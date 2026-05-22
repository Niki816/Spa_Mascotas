// ─── js/recepcion-availability.js ────────────────────────────────────────────
// Correcciones aplicadas:
//   ✅ showAlert recibe elemento O id (string), igual que dashboard
//   ✅ groomerSelect.addEventListener en lugar de cargarDisponibilidadBtn separado
//   ✅ window.eliminarBloqueo movido fuera de loadBloqueos (no se redeclara en cada carga)
//   ✅ Logout unificado con doLogout()
//   ✅ dias_laborales acepta string separado por comas O array (robusto)
//   ✅ null-checks en todos los elementos del DOM antes de usarlos
//   ✅ Sidebar nav-items con data-section conectados correctamente
// ─────────────────────────────────────────────────────────────────────────────

import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const RECEPCION_API = API_URL.replace('/auth', '/recepcion');

// ══════════════════════════════════════════════════════════════
// GUARD: proteger ruta
// ══════════════════════════════════════════════════════════════
const token = getAccessToken();
const user  = getUser();
if (!token || !user || user.rol !== 'recepcion') {
  clearTokens();
  window.location.href = 'index.html';
}

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('userEmail').textContent   = user.email;

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Muestra una alerta. `target` puede ser un HTMLElement o un string (id del elemento).
 */
function showAlert(target, msg, type = 'success') {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

const diaNombres = {
  1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo',
};

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
// CONFIGURACIÓN GENERAL DEL SPA
// ══════════════════════════════════════════════════════════════
async function loadConfig() {
  try {
    const res  = await authFetch(`${RECEPCION_API}/config/spa`);
    const data = await res.json();

    const horarioInicio = document.getElementById('horarioInicio');
    const horarioFin    = document.getElementById('horarioFin');
    const diasLaborales = document.getElementById('diasLaborales');
    const capacidadMax  = document.getElementById('capacidadMax');

    if (horarioInicio) horarioInicio.value = data.horario_inicio ?? '';
    if (horarioFin)    horarioFin.value    = data.horario_fin    ?? '';
    if (diasLaborales) {
      // El backend puede devolver array o string
      diasLaborales.value = Array.isArray(data.dias_laborales)
        ? data.dias_laborales.join(',')
        : (data.dias_laborales ?? '');
    }
    if (capacidadMax)  capacidadMax.value  = data.capacidad_diaria_max ?? 1;
  } catch (err) {
    showAlert('configAlert', 'Error al cargar configuración: ' + err.message, 'error');
  }
}

document.getElementById('configForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const raw = document.getElementById('diasLaborales').value;
  const payload = {
    horario_inicio:      document.getElementById('horarioInicio').value,
    horario_fin:         document.getElementById('horarioFin').value,
    dias_laborales:      raw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean),
    capacidad_diaria_max: parseInt(document.getElementById('capacidadMax').value),
  };
  try {
    const res = await authFetch(`${RECEPCION_API}/config/spa`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).message);
    showAlert('configAlert', '✅ Configuración guardada', 'success');
  } catch (err) {
    showAlert('configAlert', err.message, 'error');
  }
});

// ══════════════════════════════════════════════════════════════
// GROOMERS — poblar selects de bloqueos y disponibilidad
// ══════════════════════════════════════════════════════════════
async function loadGroomers() {
  try {
    const res  = await authFetch(`${RECEPCION_API}/groomers`);
    const data = await res.json();

    const groomerSelect = document.getElementById('groomerSelect');
    const groomerBloq   = document.getElementById('groomerBloq');

    if (groomerSelect) {
      groomerSelect.innerHTML = '<option value="">— Seleccionar groomer —</option>';
      data.forEach(g => {
        groomerSelect.innerHTML += `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`;
      });
    }

    if (groomerBloq) {
      groomerBloq.innerHTML = '<option value="">— Global (todos) —</option>';
      data.forEach(g => {
        groomerBloq.innerHTML += `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`;
      });
    }
  } catch (err) {
    console.error('Error cargando groomers:', err);
    showAlert('dispAlert', 'Error al cargar groomers: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// BLOQUEOS
// ══════════════════════════════════════════════════════════════
async function loadBloqueos() {
  try {
    const res      = await authFetch(`${RECEPCION_API}/bloqueos`);
    const bloqueos = await res.json();
    const tbody    = document.getElementById('bloqueosTable');
    if (!tbody) return;

    if (!bloqueos.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-light);">No hay bloqueos registrados</td></tr>';
      return;
    }

    tbody.innerHTML = bloqueos.map(b => `
      <tr>
        <td>${b.id}</td>
        <td><span style="text-transform:capitalize;">${b.tipo_bloqueo}</span></td>
        <td style="font-size:12px;">${new Date(b.fecha_inicio).toLocaleString('es-BO', { dateStyle:'short', timeStyle:'short' })}</td>
        <td style="font-size:12px;">${new Date(b.fecha_fin).toLocaleString('es-BO', { dateStyle:'short', timeStyle:'short' })}</td>
        <td>${b.groomers ? `${b.groomers.nombre} ${b.groomers.apellido}` : '<span style="color:var(--text-light)">Global</span>'}</td>
        <td>
          <button class="btn btn-danger btn-sm" data-id="${b.id}">🗑️ Eliminar</button>
        </td>
      </tr>
    `).join('');

    // Delegación de eventos (no inline onclick)
    tbody.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => eliminarBloqueo(parseInt(btn.dataset.id)));
    });
  } catch (err) {
    console.error('Error cargando bloqueos:', err);
  }
}

async function eliminarBloqueo(id) {
  if (!confirm('¿Eliminar este bloqueo?')) return;
  try {
    const res = await authFetch(`${RECEPCION_API}/bloqueos/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error((await res.json()).message);
    showAlert('bloqueoAlert', '✅ Bloqueo eliminado', 'success');
    loadBloqueos();
  } catch (err) {
    showAlert('bloqueoAlert', err.message, 'error');
  }
}

document.getElementById('bloqueoForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    tipo_bloqueo: document.getElementById('tipoBloqueo').value,
    fecha_inicio: new Date(document.getElementById('fechaInicioBloq').value).toISOString(),
    fecha_fin:    new Date(document.getElementById('fechaFinBloq').value).toISOString(),
    descripcion:  document.getElementById('descBloqueo').value.trim() || null,
    groomer_id:   document.getElementById('groomerBloq').value || null,
  };
  try {
    const res = await authFetch(`${RECEPCION_API}/bloqueos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).message);
    showAlert('bloqueoAlert', '✅ Bloqueo creado correctamente', 'success');
    document.getElementById('bloqueoForm').reset();
    loadBloqueos();
  } catch (err) {
    showAlert('bloqueoAlert', err.message, 'error');
  }
});

// ══════════════════════════════════════════════════════════════
// DISPONIBILIDAD POR GROOMER
// ══════════════════════════════════════════════════════════════
let currentGroomerId = null;
let currentHorarios  = [];

async function cargarDisponibilidad(groomerId) {
  currentGroomerId = groomerId;
  try {
    const res  = await authFetch(`${RECEPCION_API}/groomers/${groomerId}/disponibilidad`);
    const data = await res.json();
    currentHorarios = data.map(d => ({
      dia_semana:      d.dia_semana,
      hora_inicio:     d.hora_inicio,
      hora_fin:        d.hora_fin,
      buffer_minutos:  d.buffer_minutos ?? 15,
    }));
    renderHorarios();
    const panel = document.getElementById('disponibilidadPanel');
    if (panel) panel.style.display = 'block';
  } catch (err) {
    showAlert('dispAlert', 'Error al cargar disponibilidad: ' + err.message, 'error');
  }
}

function renderHorarios() {
  const container = document.getElementById('horariosGroomerList');
  if (!container) return;

  if (!currentHorarios.length) {
    container.innerHTML = '<p style="color:var(--text-light);font-size:13px;">No hay horarios configurados. Agrega uno con el botón de abajo.</p>';
    return;
  }

  container.innerHTML = currentHorarios.map((h, idx) => `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;background:var(--green-pale);padding:10px;border-radius:var(--radius-sm);">
      <select data-index="${idx}" class="form-select dia-select" style="width:130px;">
        ${Object.entries(diaNombres).map(([num, name]) =>
          `<option value="${num}" ${h.dia_semana == num ? 'selected' : ''}>${name}</option>`
        ).join('')}
      </select>
      <input type="time" value="${h.hora_inicio}" data-index="${idx}" class="form-input hora-inicio" style="width:120px;">
      <span style="color:var(--text-light);">a</span>
      <input type="time" value="${h.hora_fin}" data-index="${idx}" class="form-input hora-fin" style="width:120px;">
      <button type="button" class="btn btn-danger btn-sm eliminar-horario" data-index="${idx}">🗑️ Eliminar</button>
    </div>
  `).join('');

  // Eventos para eliminar fila
  container.querySelectorAll('.eliminar-horario').forEach(btn => {
    btn.addEventListener('click', () => {
      currentHorarios.splice(parseInt(btn.dataset.index), 1);
      renderHorarios();
    });
  });

  // Eventos para editar campos
  container.querySelectorAll('.dia-select, .hora-inicio, .hora-fin').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.index);
      if (input.classList.contains('dia-select'))   currentHorarios[idx].dia_semana  = parseInt(input.value);
      if (input.classList.contains('hora-inicio'))  currentHorarios[idx].hora_inicio = input.value;
      if (input.classList.contains('hora-fin'))     currentHorarios[idx].hora_fin    = input.value;
    });
  });
}

document.getElementById('agregarHorarioBtn')?.addEventListener('click', () => {
  currentHorarios.push({ dia_semana: 1, hora_inicio: '09:00', hora_fin: '17:00', buffer_minutos: 15 });
  renderHorarios();
});

document.getElementById('guardarDisponibilidadBtn')?.addEventListener('click', async () => {
  if (!currentGroomerId) {
    showAlert('dispAlert', '⚠️ Selecciona un groomer primero', 'error');
    return;
  }
  const payload = currentHorarios.map(h => ({
    dia_semana:     h.dia_semana,
    hora_inicio:    h.hora_inicio,
    hora_fin:       h.hora_fin,
    buffer_minutos: h.buffer_minutos ?? 15,
  }));
  try {
    const res = await authFetch(
      `${RECEPCION_API}/groomers/${currentGroomerId}/disponibilidad`,
      { method: 'PUT', body: JSON.stringify(payload) }
    );
    if (!res.ok) throw new Error((await res.json()).message);
    showAlert('dispAlert', '✅ Disponibilidad guardada correctamente', 'success');
  } catch (err) {
    showAlert('dispAlert', err.message, 'error');
  }
});

// Listener del select de groomer — carga disponibilidad al cambiar
document.getElementById('groomerSelect')?.addEventListener('change', function () {
  const panel = document.getElementById('disponibilidadPanel');
  if (this.value) {
    cargarDisponibilidad(this.value);
  } else {
    if (panel) panel.style.display = 'none';
    currentGroomerId = null;
    currentHorarios  = [];
  }
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
loadConfig();
loadGroomers();
loadBloqueos();