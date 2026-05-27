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
let   viewMonth   = hoy.getMonth() + 1; // 1–12
let   selectedDay = null;               // "YYYY-MM-DD"
let   calData     = {};                 // { "YYYY-MM-DD": { total, estado, bloqueo? } }
let   capacidadMax= 10;

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Etiquetas legibles para tipos de bloqueo
const TIPO_BLOQUEO_LABEL = {
  feriado:       '🎉 Feriado',
  mantenimiento: '🔧 Mantenimiento',
  vacaciones:    '🏖️ Vacaciones',
  ausencia:      '🚫 Ausencia',
};

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
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('es-BO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function horaDeISO(isoStr) {
  const dt = new Date(isoStr);
  return dt.toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit' });
}

function horaNum(horaStr) {
  if (!horaStr) return 0;
  if (horaStr.includes(':')) return parseInt(horaStr.split(':')[0], 10);
  const dt = new Date(horaStr);
  if (!isNaN(dt.getTime())) return dt.getHours();
  return 0;
}

const ESTADO_CLASS = {
  agendada:'agendada', confirmada:'confirmada', cancelada:'cancelada',
  completada:'completada', no_asistio:'no_asistio',
};
const ESTADO_LABEL = {
  agendada:'Agendada', confirmada:'Confirmada', cancelada:'Cancelada',
  completada:'Completada', no_asistio:'No asistió',
};

/** Retorna true si la fecha dada tiene un bloqueo activo */
function diaEsBloqueado(fecha) {
  return calData[fecha]?.estado === 'bloqueo';
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
  document.getElementById('mesTitle').textContent =
    `${MESES[viewMonth-1]} ${viewYear}`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = `<div style="grid-column:span 7;text-align:center;padding:24px;color:var(--text-light);">⏳ Cargando...</div>`;

  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/calendario?mes=${mes}`);
    if (!res.ok) throw new Error((await res.json()).message);
    const data = await res.json();

    capacidadMax = data.capacidad_max ?? 10;

    // Indexar por fecha (incluye bloqueo si existe)
    calData = {};
    for (const d of data.dias) calData[d.fecha] = d;

    renderGrid();
  } catch (err) {
    showAlert('calAlert', `❌ ${err.message}`, 'error');
    grid.innerHTML = `<div style="grid-column:span 7;text-align:center;padding:24px;color:#dc2626;">Error al cargar calendario</div>`;
  }
}

function renderGrid() {
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
  const offset   = (firstDay === 0) ? 6 : firstDay - 1;
  const diasEnMes = new Date(viewYear, viewMonth, 0).getDate();
  const todayStr  = hoy.toISOString().split('T')[0];

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
      // Días bloqueados: no-pointer + ícono de candado + tipo
      const label = TIPO_BLOQUEO_LABEL[blq?.tipo] ?? '🚫 Bloqueado';
      cell.innerHTML = `
        <div class="day-num">${d}</div>
        <div class="day-bloqueo-badge">${label}</div>
        ${blq?.descripcion ? `<div class="day-bloqueo-desc">${escapeHtml(blq.descripcion)}</div>` : ''}
      `;
    } else {
      cell.innerHTML = `
        <div class="day-num">${d}${fecha === todayStr ? ' ●' : ''}</div>
        ${total > 0 ? `<span class="day-count">${total}/${capacidadMax}</span>` : ''}
      `;
    }

    cell.addEventListener('click', () => selectDay(fecha));
    grid.appendChild(cell);
  }
}

// ══════════════════════════════════════════════════════════════
// SELECCIONAR DÍA → cargar citas (o mostrar info de bloqueo)
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

  // ── Día bloqueado: mostrar banner informativo ──────────────────────────
  if (diaEsBloqueado(fecha)) {
    const blq   = calData[fecha]?.bloqueo;
    const label = TIPO_BLOQUEO_LABEL[blq?.tipo] ?? '🚫 Bloqueado';

    // Ocultar botón de nueva cita
    if (btnNueva) {
      btnNueva.style.display  = 'none';
    }

    timeline.innerHTML = `
      <div class="bloqueo-banner">
        <div class="bloqueo-banner-icon">${iconoBloqueo(blq?.tipo)}</div>
        <div class="bloqueo-banner-body">
          <div class="bloqueo-banner-title">${label}</div>
          ${blq?.descripcion
            ? `<div class="bloqueo-banner-desc">${escapeHtml(blq.descripcion)}</div>`
            : ''}
          ${!blq?.es_global
            ? `<div class="bloqueo-banner-scope">⚠️ Bloqueo de groomer específico</div>`
            : `<div class="bloqueo-banner-scope">🏥 Bloqueo general del spa</div>`}
          <div class="bloqueo-banner-note">
            No es posible registrar citas en esta fecha bloqueada.<br>
            Para modificar los bloqueos, accede a
            <a href="recepcion-availability.html" class="bloqueo-link">Horarios &amp; Bloques</a>.
          </div>
        </div>
      </div>`;
    return;
  }

  // ── Día normal: mostrar botón nueva cita y cargar timeline ────────────
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

function iconoBloqueo(tipo) {
  const iconos = {
    feriado:       '🎉',
    mantenimiento: '🔧',
    vacaciones:    '🏖️',
    ausencia:      '🚫',
  };
  return iconos[tipo] ?? '🔒';
}

// ══════════════════════════════════════════════════════════════
// RENDERIZAR TIMELINE POR HORA
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

    if (citasH.length) {
      for (const c of citasH) {
        const estado   = c.estado || 'agendada';
        const horaStr  = c.hora || horaDeISO(c.fechaHora);
        const puedeEd  = ['agendada','confirmada'].includes(estado);
        const puedeCan = ['agendada','confirmada'].includes(estado);

        html += `
        <div class="cita-block ${ESTADO_CLASS[estado] || ''}">
          <div class="cita-info">
            <div class="cita-mascota">🐾 ${escapeHtml(c.mascota)}</div>
            <div class="cita-meta">
              ✂️ ${escapeHtml(c.servicio)} · 👤 ${escapeHtml(c.groomer)} · ⏰ ${escapeHtml(horaStr)}
              ${c.duracion ? `· ${c.duracion}min` : ''}
            </div>
            <span class="estado-pill estado-${estado}">${ESTADO_LABEL[estado] || estado}</span>
          </div>
          <div class="cita-actions">
            ${puedeEd ? `<button class="btn btn-outline btn-sm" onclick="openCitaModal(${c.id},'${fecha}','${horaStr}')">✏️</button>` : ''}
            ${puedeCan ? `<button class="btn btn-danger btn-sm" onclick="cancelarCitaDesdeCalendario(${c.id})">❌</button>` : ''}
          </div>
        </div>`;
      }
    }

    const horaPreFill = `${String(h).padStart(2,'0')}:00`;
    html += `<button class="hora-add-btn" onclick="openCitaModal(null,'${fecha}','${horaPreFill}')">
               + Agregar cita a las ${horaPreFill}
             </button>`;

    html += `</div></div>`;
  }

  html += '</div>';
  timeline.innerHTML = html;
}

function resolveHora(fechaHora) {
  if (!fechaHora) return '00:00';
  const dt = new Date(fechaHora);
  return dt.toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit', hour12: false });
}

// ══════════════════════════════════════════════════════════════
// CANCELAR DESDE EL CALENDARIO
// ══════════════════════════════════════════════════════════════
window.cancelarCitaDesdeCalendario = async function(citaId) {
  if (!confirm(`¿Cancelar la cita #${citaId}?`)) return;
  try {
    const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}/cancelar`, {
      method:'PATCH', body: JSON.stringify({ motivo: 'Cancelada desde calendario' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('dayAlert', '✅ Cita cancelada', 'success');
    await selectDay(selectedDay);
    await loadCalendario();
  } catch (err) {
    showAlert('dayAlert', `❌ ${err.message}`, 'error');
  }
};

// ══════════════════════════════════════════════════════════════
// MODAL NUEVA / EDITAR CITA
// ══════════════════════════════════════════════════════════════
let _mascotas  = [];
let _servicios = [];
let _groomers  = [];
let _selectsLoaded = false;

async function loadSelects() {
  if (_selectsLoaded) return;
  try {
    const [mRes, sRes, gRes] = await Promise.all([
      authFetch(`${RECEPCION_API}/mascotas`),
      authFetch(`${RECEPCION_API}/servicios`),
      authFetch(`${RECEPCION_API}/groomers`),
    ]);
    _mascotas  = await mRes.json();
    _servicios = await sRes.json();
    _groomers  = await gRes.json();
    _selectsLoaded = true;
  } catch (err) {
    console.error('Error cargando selects:', err);
  }
}

function fillSelect(id, items, labelFn, valueFn = i => i.id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">— Seleccionar —</option>'
    + items.map(i => `<option value="${valueFn(i)}">${escapeHtml(labelFn(i))}</option>`).join('');
}

window.openCitaModal = async function(citaId, fecha, horaPreFill) {
  // ── GUARD: si el día está bloqueado no abrir el modal ────────────────────
  if (!citaId && fecha && diaEsBloqueado(fecha)) {
    const blq   = calData[fecha]?.bloqueo;
    const label = TIPO_BLOQUEO_LABEL[blq?.tipo] ?? 'Bloqueado';
    showAlert('dayAlert',
      `⛔ No se pueden registrar citas el ${formatFechaLarga(fecha)}: ${label}` +
      `${blq?.descripcion ? ` — "${blq.descripcion}"` : ''}.`,
      'error',
    );
    return;
  }

  const modal      = document.getElementById('citaModal');
  const titleEl    = document.getElementById('citaModalTitle');
  const infoEl     = document.getElementById('citaModalInfo');
  const alertEl    = document.getElementById('citaModalAlert');
  const submitBtn  = document.getElementById('citaModalSubmitBtn');

  document.getElementById('citaModalForm').reset();
  document.getElementById('citaModalId').value    = '';
  document.getElementById('citaModalFecha').value = fecha;
  alertEl.className = 'alert';

  await loadSelects();
  fillSelect('citaModalMascota',  _mascotas,  m => `${m.nombre} (${m.dueno})`);
  fillSelect('citaModalServicio', _servicios, s => `${s.nombre} · ${s.duracion_base_minutos ?? s.duracion}min · Bs${s.precio_base}`);
  fillSelect('citaModalGroomer',  _groomers,  g => `${g.nombre} ${g.apellido}`);

  if (citaId) {
    titleEl.textContent    = `✏️ Editar Cita #${citaId}`;
    submitBtn.textContent  = '💾 Guardar cambios';
    infoEl.textContent     = `📅 Fecha: ${formatFechaLarga(fecha)}`;
    try {
      const res  = await authFetch(`${RECEPCION_API}/citas/${citaId}`);
      if (!res.ok) throw new Error((await res.json()).message);
      const cita = await res.json();

      document.getElementById('citaModalId').value        = cita.id;
      document.getElementById('citaModalFecha').value     = cita.fecha;
      document.getElementById('citaModalMascota').value   = cita.mascota_id;
      document.getElementById('citaModalServicio').value  = cita.servicio_id;
      document.getElementById('citaModalGroomer').value   = cita.groomer_id;
      document.getElementById('citaModalHora').value      = cita.hora;
      document.getElementById('citaModalNotas').value     = cita.notas || '';
      infoEl.textContent = `📅 ${formatFechaLarga(cita.fecha)} | Duración actual: ${cita.duracion_estimada_min}min | Estado: ${cita.estado}`;
    } catch (err) {
      alert(`Error al cargar la cita: ${err.message}`);
      return;
    }
  } else {
    titleEl.textContent    = `➕ Nueva Cita`;
    submitBtn.textContent  = '📅 Agendar cita';
    infoEl.textContent     = `📅 Fecha seleccionada: ${formatFechaLarga(fecha)}`;
    if (horaPreFill) document.getElementById('citaModalHora').value = horaPreFill;
  }

  modal.classList.add('open');
};

function closeCitaModal() {
  document.getElementById('citaModal').classList.remove('open');
}
document.getElementById('closeCitaModalBtn')?.addEventListener('click', closeCitaModal);
document.getElementById('citaModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCitaModal();
});

// ── Submit del modal ───────────────────────────────────────────
document.getElementById('citaModalForm')?.addEventListener('submit', async e => {
  e.preventDefault();

  const citaId    = document.getElementById('citaModalId').value;
  const fecha     = document.getElementById('citaModalFecha').value;

  // Doble-check de bloqueo al momento de guardar
  if (!citaId && diaEsBloqueado(fecha)) {
    const blq = calData[fecha]?.bloqueo;
    return showAlert('citaModalAlert',
      `⛔ Esta fecha está bloqueada (${TIPO_BLOQUEO_LABEL[blq?.tipo] ?? 'Bloqueado'}). No se puede agendar.`,
      'error',
    );
  }

  const horaRaw   = document.getElementById('citaModalHora').value;
  const horaLimpia= horaRaw.substring(0, 5);

  const payload = {
    mascota_id:  parseInt(document.getElementById('citaModalMascota').value),
    servicio_id: parseInt(document.getElementById('citaModalServicio').value),
    groomer_id:  parseInt(document.getElementById('citaModalGroomer').value),
    fecha,
    hora: horaLimpia,
    notas: document.getElementById('citaModalNotas').value.trim() || null,
  };

  if (!payload.mascota_id || !payload.servicio_id || !payload.groomer_id || !payload.hora) {
    return showAlert('citaModalAlert', '⚠️ Completa todos los campos obligatorios', 'error');
  }

  const submitBtn = document.getElementById('citaModalSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Guardando...';

  try {
    let res, data;
    if (citaId) {
      res = await authFetch(`${RECEPCION_API}/citas/${citaId}`, {
        method:'PATCH', body: JSON.stringify(payload),
      });
    } else {
      res = await authFetch(`${RECEPCION_API}/citas`, {
        method:'POST', body: JSON.stringify(payload),
      });
    }
    data = await res.json();
    if (!res.ok) throw new Error(data.message);

    const info    = data._info;
    const infoTxt = info
      ? ` · Duración: ${info.duracion_ajustada_min}min (${info.tamanio_mascota}, ×${info.multiplicador_aplicado?.toFixed(2)})`
      : '';

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
// BOTÓN "NUEVA CITA" DEL PANEL DÍA
// ══════════════════════════════════════════════════════════════
document.getElementById('btnNuevaCitaDia')?.addEventListener('click', () => {
  if (!selectedDay) return alert('Selecciona un día primero');
  if (diaEsBloqueado(selectedDay)) {
    const blq = calData[selectedDay]?.bloqueo;
    return showAlert('dayAlert',
      `⛔ Este día está bloqueado (${TIPO_BLOQUEO_LABEL[blq?.tipo] ?? 'Bloqueado'}). No se pueden agendar citas.`,
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
loadSelects().catch(() => {});