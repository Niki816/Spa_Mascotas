// ─── js/recepcion-calendario.js ──────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ══════════════════════════════════════════════════════════════
const hoy         = new Date();
let   viewYear    = hoy.getFullYear();
let   viewMonth   = hoy.getMonth() + 1;
let   selectedDay = null;
let   calData     = {};
let   capacidadMax= 10;

// Estado de drag & drop
let draggedCita = null; // { id, fecha, hora, mascota, servicio }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const TIPO_BLOQUEO_LABEL = {
  feriado:'🎉 Feriado', mantenimiento:'🔧 Mantenimiento',
  vacaciones:'🏖️ Vacaciones', ausencia:'🚫 Ausencia',
};

const ESTADO_LABEL = {
  agendada:'Agendada', confirmada:'Confirmada', cancelada:'Cancelada',
  completada:'Completada', no_asistio:'No asistió', en_progreso:'En progreso',
};

const ESTADO_CLASS = {
  agendada:'agendada', confirmada:'confirmada', cancelada:'cancelada',
  completada:'completada', no_asistio:'no_asistio', en_progreso:'en_progreso',
};

// Cache de selects (mascotas, servicios, groomers)
const cache = { mascotas: [], servicios: [], groomers: [], loaded: false };

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
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatFechaLarga(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-BO', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
}

function horaDeISO(isoStr) {
  return new Date(isoStr).toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit' });
}

function horaNum(horaStr) {
  if (!horaStr) return 0;
  if (horaStr.includes(':')) return parseInt(horaStr.split(':')[0], 10);
  const dt = new Date(horaStr);
  return isNaN(dt.getTime()) ? 0 : dt.getHours();
}

function resolveHora(fechaHora) {
  if (!fechaHora) return '00:00';
  return new Date(fechaHora).toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit', hour12:false });
}

function diaEsBloqueado(fecha) {
  return calData[fecha]?.estado === 'bloqueo';
}

function iconoBloqueo(tipo) {
  return { feriado:'🎉', mantenimiento:'🔧', vacaciones:'🏖️', ausencia:'🚫' }[tipo] ?? '🔒';
}

function fillSel(id, items, labelFn, valueFn = i => i.id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">— Seleccionar —</option>'
    + items.map(i => `<option value="${valueFn(i)}">${escapeHtml(labelFn(i))}</option>`).join('');
}

async function ensureSelects() {
  if (cache.loaded) return;
  const [mRes, sRes, gRes] = await Promise.all([
    authFetch(`${RECEPCION_API}/mascotas`),
    authFetch(`${RECEPCION_API}/servicios`),
    authFetch(`${RECEPCION_API}/groomers`),
  ]);
  cache.mascotas  = await mRes.json();
  cache.servicios = await sRes.json();
  cache.groomers  = await gRes.json();
  cache.loaded = true;
}

// ══════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════
function doLogout() {
  authFetch(`${API_URL}/logout`, { method:'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn')?.addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2')?.addEventListener('click', doLogout);

// ══════════════════════════════════════════════════════════════
// CARGAR CALENDARIO MENSUAL
// ══════════════════════════════════════════════════════════════
async function loadCalendario() {
  const mes = `${viewYear}-${String(viewMonth).padStart(2,'0')}`;
  document.getElementById('mesTitle').textContent = `${MESES[viewMonth-1]} ${viewYear}`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = `<div style="grid-column:span 7;text-align:center;padding:24px;color:var(--text-light);">⏳ Cargando...</div>`;

  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/calendario?mes=${mes}`);
    if (!res.ok) throw new Error((await res.json()).message);
    const data = await res.json();

    capacidadMax = data.capacidad_max ?? 10;
    calData = {};
    for (const d of data.dias) calData[d.fecha] = d;

    renderGrid();
  } catch (err) {
    showAlert('calAlert', `❌ ${err.message}`, 'error');
    grid.innerHTML = `<div style="grid-column:span 7;text-align:center;padding:24px;color:#dc2626;">Error al cargar calendario</div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER GRID
// ══════════════════════════════════════════════════════════════
function renderGrid() {
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const firstDay  = new Date(viewYear, viewMonth - 1, 1).getDay();
  const offset    = firstDay === 0 ? 6 : firstDay - 1;
  const diasEnMes = new Date(viewYear, viewMonth, 0).getDate();
  const todayStr  = hoy.toISOString().split('T')[0];

  // Celdas vacías de relleno
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day vacio';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha  = `${viewYear}-${String(viewMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const info   = calData[fecha];
    const estado = info?.estado ?? 'libre';
    const total  = info?.total  ?? 0;
    const blq    = info?.bloqueo;

    const cell = document.createElement('div');
    cell.className = `cal-day ${estado}`;
    if (fecha === todayStr)    cell.classList.add('hoy');
    if (fecha === selectedDay) cell.classList.add('selected');

    if (estado === 'bloqueo') {
      const label = TIPO_BLOQUEO_LABEL[blq?.tipo] ?? '🚫 Bloqueado';
      cell.innerHTML = `
        <div class="day-num">${d}</div>
        <div class="day-bloqueo-badge">${label}</div>
        ${blq?.descripcion ? `<div class="day-bloqueo-desc">${escapeHtml(blq.descripcion)}</div>` : ''}`;
    } else {
      cell.innerHTML = `
        <div class="day-num">${d}${fecha === todayStr ? ' ●' : ''}</div>
        ${total > 0 ? `<span class="day-count">${total}/${capacidadMax}</span>` : ''}`;

      // ── Drop zone para drag & drop ──────────────────────────
      cell.addEventListener('dragover', e => {
        e.preventDefault();
        if (draggedCita) cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        if (draggedCita) openReprogramarModal(draggedCita, fecha);
      });
    }

    cell.addEventListener('click', () => selectDay(fecha));
    grid.appendChild(cell);
  }
}

// ══════════════════════════════════════════════════════════════
// SELECCIONAR DÍA
// ══════════════════════════════════════════════════════════════
async function selectDay(fecha) {
  selectedDay = fecha;
  renderGrid();

  const panel    = document.getElementById('dayPanel');
  const title    = document.getElementById('dayPanelTitle');
  const timeline = document.getElementById('dayTimeline');
  const btnNueva = document.getElementById('btnNuevaCitaDia');

  panel.classList.add('open');
  title.textContent = `📅 ${formatFechaLarga(fecha)}`;

  if (diaEsBloqueado(fecha)) {
    const blq   = calData[fecha]?.bloqueo;
    const label = TIPO_BLOQUEO_LABEL[blq?.tipo] ?? '🚫 Bloqueado';
    if (btnNueva) btnNueva.style.display = 'none';
    timeline.innerHTML = `
      <div class="bloqueo-banner">
        <div class="bloqueo-banner-icon">${iconoBloqueo(blq?.tipo)}</div>
        <div class="bloqueo-banner-body">
          <div class="bloqueo-banner-title">${label}</div>
          ${blq?.descripcion ? `<div class="bloqueo-banner-desc">${escapeHtml(blq.descripcion)}</div>` : ''}
          <div class="bloqueo-banner-scope">${!blq?.es_global ? '⚠️ Bloqueo de groomer específico' : '🏥 Bloqueo general del spa'}</div>
          <div class="bloqueo-banner-note">
            No es posible registrar citas en esta fecha.
            Para modificar los bloqueos, accede a
            <a href="recepcion-availability.html" class="bloqueo-link">Horarios &amp; Bloques</a>.
          </div>
        </div>
      </div>`;
    return;
  }

  if (btnNueva) btnNueva.style.display = '';
  timeline.innerHTML = '<div class="empty-day">⏳ Cargando citas...</div>';

  try {
    const res   = await authFetch(`${RECEPCION_API}/citas/todas?desde=${fecha}&hasta=${fecha}`);
    if (!res.ok) throw new Error((await res.json()).message);
    const citas = await res.json();
    renderTimeline(citas, fecha);
  } catch (err) {
    timeline.innerHTML = `<div class="empty-day" style="color:#dc2626;">❌ ${escapeHtml(err.message)}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER TIMELINE
// ══════════════════════════════════════════════════════════════
function renderTimeline(citas, fecha) {
  const timeline = document.getElementById('dayTimeline');

  if (!citas.length) {
    timeline.innerHTML = `
      <div class="empty-day">
        📭 No hay citas para este día
        <br><br>
        <button class="btn btn-primary btn-sm" onclick="openCitaModal(null,'${fecha}','')">
          ➕ Agendar la primera cita
        </button>
      </div>`;
    return;
  }

  const porHora = {};
  for (const c of citas) {
    const h = horaNum(c.hora || resolveHora(c.fechaHora) || '00:00');
    if (!porHora[h]) porHora[h] = [];
    porHora[h].push(c);
  }

  const horasPresentes = Object.keys(porHora).map(Number).sort((a,b) => a-b);
  const horaMin = horasPresentes[0];
  const horaMax = horasPresentes[horasPresentes.length - 1];

  let html = '<div class="timeline">';

  for (let h = horaMin; h <= horaMax; h++) {
    const label  = `${String(h).padStart(2,'0')}:00`;
    const citasH = porHora[h] || [];

    html += `<div class="timeline-hora">
      <div class="hora-label">${label}</div>
      <div class="citas-en-hora">`;

    for (const c of citasH) {
      const estado    = c.estado || 'agendada';
      const horaStr   = c.hora || horaDeISO(c.fechaHora);
      const editable  = ['agendada','confirmada','en_progreso'].includes(estado);
      const cancelable= ['agendada','confirmada'].includes(estado);

      html += `
        <div class="cita-block ${ESTADO_CLASS[estado] || ''}"
             draggable="${editable ? 'true' : 'false'}"
             data-cita-id="${c.id}"
             data-cita-fecha="${fecha}"
             data-cita-hora="${horaStr}"
             data-cita-mascota="${escapeHtml(c.mascota)}"
             data-cita-servicio="${escapeHtml(c.servicio)}">
          ${editable ? '<div class="drag-handle" title="Arrastrar para reprogramar">⠿⠿</div>' : ''}
          <div class="cita-info">
            <div class="cita-mascota">🐾 <strong>${escapeHtml(c.mascota)}</strong></div>
            <div class="cita-meta">
              ✂️ ${escapeHtml(c.servicio)} &nbsp;·&nbsp; 👤 ${escapeHtml(c.groomer)} &nbsp;·&nbsp; ⏰ ${escapeHtml(horaStr)}
              ${c.duracion ? `&nbsp;·&nbsp; ⏱️ ${c.duracion}min` : ''}
            </div>
            <span class="estado-pill estado-${estado}">${ESTADO_LABEL[estado] || estado}</span>
          </div>
          <div class="cita-actions">
            ${editable
              ? `<button class="btn btn-outline btn-sm" data-action="editar" data-id="${c.id}" data-fecha="${fecha}">✏️ Editar</button>`
              : ''}
            ${cancelable
              ? `<button class="btn btn-danger btn-sm"  data-action="cancelar" data-id="${c.id}" data-mascota="${escapeHtml(c.mascota)}">❌ Anular</button>`
              : ''}
          </div>
        </div>`;
    }

    const horaPreFill = `${String(h).padStart(2,'0')}:00`;
    html += `<button class="hora-add-btn" onclick="openCitaModal(null,'${fecha}','${horaPreFill}')">
               + Agregar cita a las ${horaPreFill}
             </button>`;
    html += `</div></div>`;
  }

  html += '</div>';
  timeline.innerHTML = html;

  // ── Drag events en cita-blocks ──────────────────────────────
  timeline.querySelectorAll('.cita-block[draggable="true"]').forEach(block => {
    block.addEventListener('dragstart', e => {
      draggedCita = {
        id:       parseInt(block.dataset.citaId),
        fecha:    block.dataset.citaFecha,
        hora:     block.dataset.citaHora,
        mascota:  block.dataset.citaMascota,
        servicio: block.dataset.citaServicio,
      };
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      draggedCita = null;
    });
  });

  // ── Botones de editar / cancelar ───────────────────────────
  timeline.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'editar')
        openEditarCitaModal(parseInt(btn.dataset.id), btn.dataset.fecha);
      if (btn.dataset.action === 'cancelar')
        openCancelarModal(parseInt(btn.dataset.id), btn.dataset.mascota);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// MODAL: EDITAR CITA (completo + cambio de estado)
// ══════════════════════════════════════════════════════════════
window.openEditarCitaModal = async function(citaId, fecha) {
  const modal = document.getElementById('editarCitaModal');
  if (!modal) return;

  document.getElementById('editCitaTitle').textContent = `✏️ Editar Cita #${citaId}`;
  const alertEl = document.getElementById('editCitaAlert');
  if (alertEl) alertEl.className = 'alert';

  try {
    await ensureSelects();

    const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}`);
    if (!res.ok) throw new Error((await res.json()).message);
    const cita = await res.json();

    // Llenar selects
    fillSel('editCitaMascota',  cache.mascotas,  m => `${m.nombre} (${m.dueno})`);
    fillSel('editCitaServicio', cache.servicios, s => `${s.nombre} · ${s.duracion_base_minutos ?? s.duracion}min · Bs${s.precio_base}`);
    fillSel('editCitaGroomer',  cache.groomers,  g => `${g.nombre} ${g.apellido}`);

    // Llenar estado (excluye cancelada — eso va por modal de anular)
    const estadosEditables = [
      { val: 'agendada',    label: '📅 Agendada'     },
      { val: 'confirmada',  label: '✅ Confirmada'   },
      { val: 'en_progreso', label: '🔄 En progreso'  },
      { val: 'completada',  label: '✔️ Completada'   },
      { val: 'no_asistio',  label: '⚠️ No asistió'   },
    ];
    const estadoSel = document.getElementById('editCitaEstado');
    if (estadoSel) {
      estadoSel.innerHTML = estadosEditables.map(e =>
        `<option value="${e.val}" ${cita.estado === e.val ? 'selected' : ''}>${e.label}</option>`
      ).join('');
    }

    // Valores
    document.getElementById('editCitaId').value       = cita.id;
    document.getElementById('editCitaMascota').value  = cita.mascota_id;
    document.getElementById('editCitaServicio').value = cita.servicio_id;
    document.getElementById('editCitaGroomer').value  = cita.groomer_id;
    document.getElementById('editCitaFecha').value    = cita.fecha;
    document.getElementById('editCitaHora').value     = cita.hora;
    document.getElementById('editCitaNotas').value    = cita.notas || '';

    // Info bar
    const infoEl = document.getElementById('editCitaInfo');
    if (infoEl) infoEl.innerHTML = `
      <span>📅 ${formatFechaLarga(cita.fecha)}</span>
      <span>⏱️ ${cita.duracion_estimada_min ?? '—'}min</span>
      <span>💰 Bs ${cita.precio_calculado ?? '—'}</span>`;

    modal.classList.add('open');
  } catch (err) {
    alert(`Error al cargar cita: ${err.message}`);
  }
};

function closeEditarCitaModal() {
  document.getElementById('editarCitaModal')?.classList.remove('open');
}
document.getElementById('closeEditarCitaBtn')?.addEventListener('click', closeEditarCitaModal);
document.getElementById('editarCitaModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeEditarCitaModal();
});

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
    estado:      document.getElementById('editCitaEstado').value,
  };

  if (!payload.mascota_id || !payload.servicio_id || !payload.groomer_id || !payload.fecha || !payload.hora) {
    return showAlert('editCitaAlert', '⚠️ Completa todos los campos obligatorios', 'error');
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = '⏳ Guardando...';

  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}`, {
      method: 'PATCH', body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    const info    = data._info;
    const infoTxt = info ? ` · ${info.duracion_ajustada_min}min (${info.tamanio_mascota})` : '';
    showAlert('editCitaAlert', `✅ Cita actualizada${infoTxt}`, 'success');

    setTimeout(async () => {
      closeEditarCitaModal();
      await selectDay(selectedDay);
      await loadCalendario();
    }, 1200);
  } catch (err) {
    showAlert('editCitaAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Guardar cambios';
  }
});

// ══════════════════════════════════════════════════════════════
// MODAL: ANULAR CITA (con motivo obligatorio)
// ══════════════════════════════════════════════════════════════
window.openCancelarModal = function(citaId, mascota) {
  const modal = document.getElementById('cancelarCitaModal');
  if (!modal) return;

  document.getElementById('cancelarCitaId').value = citaId;
  document.getElementById('cancelarCitaSubtitle').textContent =
    `Cita #${citaId} — 🐾 ${mascota}`;
  document.getElementById('cancelarMotivo').value = '';
  document.getElementById('cancelarAlert').className = 'alert';
  modal.classList.add('open');
};

function closeCancelarModal() {
  document.getElementById('cancelarCitaModal')?.classList.remove('open');
}
document.getElementById('closeCancelarBtn')?.addEventListener('click', closeCancelarModal);
document.getElementById('cancelarCitaModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCancelarModal();
});

document.getElementById('formCancelarCita')?.addEventListener('submit', async e => {
  e.preventDefault();
  const citaId = document.getElementById('cancelarCitaId').value;
  const motivo = document.getElementById('cancelarMotivo').value.trim();

  if (!motivo) {
    return showAlert('cancelarAlert', '⚠️ El motivo de cancelación es obligatorio', 'error');
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = '⏳ Cancelando...';

  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}/cancelar`, {
      method: 'PATCH', body: JSON.stringify({ motivo }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    showAlert('cancelarAlert', '✅ Cita cancelada correctamente', 'success');
    setTimeout(async () => {
      closeCancelarModal();
      await selectDay(selectedDay);
      await loadCalendario();
    }, 1200);
  } catch (err) {
    showAlert('cancelarAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '❌ Confirmar cancelación';
  }
});

// ══════════════════════════════════════════════════════════════
// MODAL: REPROGRAMAR (drag & drop)
// ══════════════════════════════════════════════════════════════
function openReprogramarModal(cita, nuevaFecha) {
  const modal = document.getElementById('reprogramarModal');
  if (!modal) return;

  // Si la nueva fecha es igual a la original, no hacer nada
  if (cita.fecha === nuevaFecha) return;

  document.getElementById('reprogramarCitaId').value     = cita.id;
  document.getElementById('reprogramarNuevaFecha').value = nuevaFecha;
  document.getElementById('reprogramarNuevaHora').value  = cita.hora || '';
  document.getElementById('reprogramarAlert').className  = 'alert';

  document.getElementById('reprogramarDe').innerHTML = `
    <strong>${formatFechaLarga(cita.fecha)}</strong> a las <strong>${cita.hora}</strong>`;
  document.getElementById('reprogramarA').innerHTML = `
    <strong>${formatFechaLarga(nuevaFecha)}</strong>`;
  document.getElementById('reprogramarCitaInfo').textContent =
    `#${cita.id} — 🐾 ${cita.mascota} · ✂️ ${cita.servicio}`;

  modal.classList.add('open');
}

function closeReprogramarModal() {
  document.getElementById('reprogramarModal')?.classList.remove('open');
}
document.getElementById('closeReprogramarBtn')?.addEventListener('click', closeReprogramarModal);
document.getElementById('reprogramarModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeReprogramarModal();
});

document.getElementById('formReprogramarCita')?.addEventListener('submit', async e => {
  e.preventDefault();
  const citaId      = document.getElementById('reprogramarCitaId').value;
  const nuevaFecha  = document.getElementById('reprogramarNuevaFecha').value;
  const nuevaHora   = document.getElementById('reprogramarNuevaHora').value.substring(0, 5);

  if (!nuevaHora) {
    return showAlert('reprogramarAlert', '⚠️ Indica la nueva hora', 'error');
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = '⏳ Reprogramando...';

  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fecha: nuevaFecha, hora: nuevaHora }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    showAlert('reprogramarAlert',
      `✅ Cita reprogramada para ${formatFechaLarga(nuevaFecha)} a las ${nuevaHora}`,
      'success',
    );
    setTimeout(async () => {
      closeReprogramarModal();
      selectedDay = nuevaFecha;
      await selectDay(nuevaFecha);
      await loadCalendario();
    }, 1400);
  } catch (err) {
    showAlert('reprogramarAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '📅 Confirmar reprogramación';
  }
});

// ══════════════════════════════════════════════════════════════
// MODAL: NUEVA CITA (desde el calendario)
// ══════════════════════════════════════════════════════════════
window.openCitaModal = async function(citaId, fecha, horaPreFill) {
  if (!citaId && fecha && diaEsBloqueado(fecha)) {
    const blq   = calData[fecha]?.bloqueo;
    showAlert('dayAlert',
      `⛔ No se pueden registrar citas el ${formatFechaLarga(fecha)}: ${TIPO_BLOQUEO_LABEL[blq?.tipo] ?? 'Bloqueado'}`,
      'error',
    );
    return;
  }

  const modal     = document.getElementById('citaModal');
  const titleEl   = document.getElementById('citaModalTitle');
  const infoEl    = document.getElementById('citaModalInfo');
  const alertEl   = document.getElementById('citaModalAlert');
  const submitBtn = document.getElementById('citaModalSubmitBtn');

  document.getElementById('citaModalForm').reset();
  document.getElementById('citaModalId').value    = '';
  document.getElementById('citaModalFecha').value = fecha;
  alertEl.className = 'alert';

  await ensureSelects();
  fillSel('citaModalMascota',  cache.mascotas,  m => `${m.nombre} (${m.dueno})`);
  fillSel('citaModalServicio', cache.servicios, s => `${s.nombre} · ${s.duracion_base_minutos ?? s.duracion}min · Bs${s.precio_base}`);
  fillSel('citaModalGroomer',  cache.groomers,  g => `${g.nombre} ${g.apellido}`);

  if (citaId) {
    titleEl.textContent   = `✏️ Editar Cita #${citaId}`;
    submitBtn.textContent = '💾 Guardar cambios';
    try {
      const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}`);
      if (!res.ok) throw new Error((await res.json()).message);
      const cita = await res.json();
      document.getElementById('citaModalId').value       = cita.id;
      document.getElementById('citaModalFecha').value    = cita.fecha;
      document.getElementById('citaModalMascota').value  = cita.mascota_id;
      document.getElementById('citaModalServicio').value = cita.servicio_id;
      document.getElementById('citaModalGroomer').value  = cita.groomer_id;
      document.getElementById('citaModalHora').value     = cita.hora;
      document.getElementById('citaModalNotas').value    = cita.notas || '';
      infoEl.textContent = `📅 ${formatFechaLarga(cita.fecha)} | ${cita.duracion_estimada_min}min | ${cita.estado}`;
    } catch (err) { alert(`Error: ${err.message}`); return; }
  } else {
    titleEl.textContent   = '➕ Nueva Cita';
    submitBtn.textContent = '📅 Agendar cita';
    infoEl.textContent    = `📅 Fecha: ${formatFechaLarga(fecha)}`;
    if (horaPreFill) document.getElementById('citaModalHora').value = horaPreFill;
  }
  modal.classList.add('open');
};

function closeCitaModal() { document.getElementById('citaModal').classList.remove('open'); }
document.getElementById('closeCitaModalBtn')?.addEventListener('click', closeCitaModal);
document.getElementById('citaModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCitaModal();
});

document.getElementById('citaModalForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const citaId = document.getElementById('citaModalId').value;
  const fecha  = document.getElementById('citaModalFecha').value;

  if (!citaId && diaEsBloqueado(fecha)) {
    return showAlert('citaModalAlert',
      `⛔ Esta fecha está bloqueada (${TIPO_BLOQUEO_LABEL[calData[fecha]?.bloqueo?.tipo] ?? 'Bloqueado'}).`,
      'error',
    );
  }

  const payload = {
    mascota_id:  parseInt(document.getElementById('citaModalMascota').value),
    servicio_id: parseInt(document.getElementById('citaModalServicio').value),
    groomer_id:  parseInt(document.getElementById('citaModalGroomer').value),
    fecha,
    hora:  document.getElementById('citaModalHora').value.substring(0, 5),
    notas: document.getElementById('citaModalNotas').value.trim() || null,
  };

  if (!payload.mascota_id || !payload.servicio_id || !payload.groomer_id || !payload.hora) {
    return showAlert('citaModalAlert', '⚠️ Completa todos los campos obligatorios', 'error');
  }

  const submitBtn = document.getElementById('citaModalSubmitBtn');
  submitBtn.disabled = true; submitBtn.textContent = '⏳ Guardando...';

  try {
    const res = citaId
      ? await authFetch(`${RECEPCION_API}/citas/${citaId}`, { method:'PATCH', body: JSON.stringify(payload) })
      : await authFetch(`${RECEPCION_API}/citas`,            { method:'POST',  body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    const info    = data._info;
    const infoTxt = info ? ` · ${info.duracion_ajustada_min}min (${info.tamanio_mascota}, ×${info.multiplicador_aplicado?.toFixed(2)})` : '';
    showAlert('citaModalAlert', `✅ ${citaId ? 'Cita actualizada' : 'Cita agendada'}${infoTxt}`, 'success');

    setTimeout(async () => {
      closeCitaModal();
      await selectDay(fecha);
      await loadCalendario();
    }, 1400);
  } catch (err) {
    showAlert('citaModalAlert', `❌ ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = citaId ? '💾 Guardar cambios' : '📅 Agendar cita';
  }
});

// ══════════════════════════════════════════════════════════════
// BOTÓN NUEVA CITA DEL PANEL DÍA
// ══════════════════════════════════════════════════════════════
document.getElementById('btnNuevaCitaDia')?.addEventListener('click', () => {
  if (!selectedDay) return alert('Selecciona un día primero');
  if (diaEsBloqueado(selectedDay)) {
    return showAlert('dayAlert',
      `⛔ Este día está bloqueado (${TIPO_BLOQUEO_LABEL[calData[selectedDay]?.bloqueo?.tipo] ?? 'Bloqueado'}).`,
      'error',
    );
  }
  openCitaModal(null, selectedDay, '');
});

// ══════════════════════════════════════════════════════════════
// NAVEGACIÓN DE MES
// ══════════════════════════════════════════════════════════════
document.getElementById('btnMesAnterior')?.addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 1) { viewMonth = 12; viewYear--; }
  selectedDay = null;
  document.getElementById('dayPanel').classList.remove('open');
  loadCalendario();
});

document.getElementById('btnMesSiguiente')?.addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 12) { viewMonth = 1; viewYear++; }
  selectedDay = null;
  document.getElementById('dayPanel').classList.remove('open');
  loadCalendario();
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
loadCalendario();
ensureSelects().catch(() => {});