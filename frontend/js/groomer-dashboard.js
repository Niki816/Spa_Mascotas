// js/groomer-dashboard.js
import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

// ─────────────────────────────────────────────────────────
// VERIFICACIÓN Y SETUP
// ─────────────────────────────────────────────────────────
const token = getAccessToken();
const user = getUser();
if (!token || !user) { window.location.href = 'index.html'; }
if (user?.rol !== 'groomer') { window.location.href = 'dashboard.html'; }

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('groomerEmail').textContent = user.email;

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let fichaActualCitaId = null;
let productosDisponibles = [];

// ─────────────────────────────────────────────────────────
// NAVEGACIÓN
// ─────────────────────────────────────────────────────────
const sections = ['agenda', 'fichas', 'perfil'];
const navItems = document.querySelectorAll('.nav-item[data-section]');

function showSection(sec) {
  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === sec ? 'block' : 'none';
  });
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.section === sec);
  });

  if (sec === 'agenda') loadAgendaHoy();
  else if (sec === 'fichas') loadFichasActivas();
}

navItems.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    if (sec) showSection(sec);
  });
});

// ─────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────
function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn')?.addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2')?.addEventListener('click', doLogout);

// ─────────────────────────────────────────────────────────
// MODAL HELPERS
// ─────────────────────────────────────────────────────────
function openModal(modalId) {
  document.getElementById(modalId)?.classList.add('show');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('show');
}
// ─────────────────────────────────────────────────────────
// MODAL DE CONFIRMACIÓN
// ─────────────────────────────────────────────────────────
function showConfirm(mensaje, onConfirm) {
  document.getElementById('confirmModalMessage').textContent = mensaje;
  openModal('confirmModal');

  // Limpiar callbacks anteriores
  const okBtn = document.getElementById('confirmOkBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');
  const closeBtn = document.getElementById('confirmModalClose');

  function limpiarYConfirmar() {
    closeModal('confirmModal');
    onConfirm();
  }

  // Reemplazar listeners para evitar duplicados
  const newOkBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOkBtn, okBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  const newCloseBtn = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

  document.getElementById('confirmOkBtn').addEventListener('click', limpiarYConfirmar);
  document.getElementById('confirmCancelBtn').addEventListener('click', () => closeModal('confirmModal'));
  document.getElementById('confirmModalClose').addEventListener('click', () => closeModal('confirmModal'));
}

// ─────────────────────────────────────────────────────────
// AGENDA HOY
// ─────────────────────────────────────────────────────────
async function loadAgendaHoy() {
  const container = document.getElementById('agendaContainer');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Cargando agenda...</p></div>';

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/activas`);
    if (!res.ok) throw new Error('Error al obtener la agenda');
    const data = await res.json();

    if (!data.agenda || data.agenda.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>No tienes citas programadas para hoy 🎉</p></div>';
      return;
    }

    let html = '';
    data.agenda.forEach(cita => {
      const horaInicio = new Date(cita.horaInicio).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      const horaFin = new Date(cita.horaFin).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
      const estadoClass = cita.estado.replace(/_/g, '_');
      
      // ✅ CAMBIADO: en lugar de redirigir a la página checklist, abrimos el modal de ficha
      const onclick = `abrirFicha(${cita.cita_id})`;

      html += `
        <div class="timeline-item" onclick="${onclick}">
          <div class="timeline-time">${horaInicio}</div>
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="cita-mascota">
              🐶 ${cita.mascota.nombre}
              <span class="cita-estado estado-${estadoClass}">${cita.estado}</span>
            </div>
            <div class="cita-servicio">✂️ ${cita.servicio.nombre} · ${cita.servicio.duracionEstimada} min</div>
            ${cita.notas ? `<div style="font-size:12px;color:var(--text-light);margin-top:4px;">📝 ${cita.notas}</div>` : ''}
          </div>
        </div>`;
    });
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>Error: ${error.message}</p></div>`;
  }
}

document.getElementById('refreshAgendaBtn')?.addEventListener('click', loadAgendaHoy);

// ─────────────────────────────────────────────────────────
// FICHAS ACTIVAS
// ─────────────────────────────────────────────────────────
async function loadFichasActivas() {
  const container = document.getElementById('fichasActivasList');
  if (!container) return;
  container.innerHTML = '<div class="empty-state">⏳ Cargando...</div>';
  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/activas`);
    if (!res.ok) throw new Error('Error al cargar fichas');
    const data = await res.json();

    if (!data.agenda || data.agenda.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>No tienes citas activas hoy</p></div>';
      return;
    }

    container.innerHTML = data.agenda.map(f => {
      const estadoClass = f.estado.replace(/_/g, '_');
      return `
        <div class="ficha-card">
          <div class="ficha-head">
            <div class="ficha-mascota-img">🐶</div>
            <div class="ficha-info">
              <div class="ficha-mascota-name">${f.mascota.nombre}</div>
              <div class="ficha-mascota-raza">${f.mascota.raza || f.mascota.especie || 'Mascota'}</div>
              <div class="ficha-servicio">✂️ ${f.servicio.nombre}</div>
            </div>
          </div>
          <span class="ficha-estado-badge estado-${estadoClass}">${f.estado}</span>
          <!-- ✅ CAMBIADO: abrir modal en lugar de navegar -->
          <button class="btn btn-outline btn-sm ficha-btn" onclick="abrirFicha(${f.cita_id})">📋 Ver ficha</button>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">❌ ${err.message}</div>`;
  }
}

document.getElementById('refreshFichasBtn')?.addEventListener('click', loadFichasActivas);

// ─────────────────────────────────────────────────────────
// ABRIR FICHA (MODAL)
// ─────────────────────────────────────────────────────────
window.abrirFicha = async function(citaId) {
  fichaActualCitaId = citaId;
  openModal('fichaModal');
  const body = document.getElementById('fichaModalBody');
  body.innerHTML = '<div class="empty-state">⏳ Cargando detalle...</div>';

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/${citaId}`);
    if (!res.ok) throw new Error('Error al obtener detalle');
    const data = await res.json();

    if (!data.ficha) {
      renderizarFichaNoIniciada(data, citaId);
    } else {
      renderizarFichaIniciada(data, citaId);
    }
  } catch (err) {
    body.innerHTML = `<div class="empty-state">❌ ${err.message}</div>`;
  }
};

function renderizarFichaNoIniciada(data, citaId) {
  const body = document.getElementById('fichaModalBody');
  const { cita, template } = data;

  document.getElementById('fichaModalTitle').textContent = `${cita.mascota.nombre} – ${cita.servicio.nombre}`;

  body.innerHTML = `
    <div style="text-align: center; padding: 24px;">
      <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
      <h4 style="font-size: 16px; margin-bottom: 8px;">Ficha aún no iniciada</h4>
      <p style="color: var(--text-light); margin-bottom: 24px;">Haz clic en el botón para comenzar el servicio de grooming</p>
      <button class="btn btn-primary" onclick="iniciarServicio(${citaId})">▶️ Iniciar Servicio</button>
    </div>
  `;
}

function renderizarFichaIniciada(data, citaId) {
  const body = document.getElementById('fichaModalBody');
  const { cita, ficha, checklist, fotos, consumo } = data;

  document.getElementById('fichaModalTitle').textContent = `${cita.mascota.nombre} – ${cita.servicio.nombre}`;

  // CHECKLIST
  const checklistHtml = checklist.map(cl => `
    <div class="checklist-item">
      <input type="checkbox" id="check-${cl.item_id}" ${cl.completado ? 'checked' : ''} onchange="toggleChecklistItem(${citaId}, ${cl.item_id}, this.checked)">
      <div class="checklist-item-content">
        <label for="check-${cl.item_id}" class="checklist-item-label">
          ${cl.nombre} ${cl.requiere_observacion ? '📝' : ''}
        </label>
        ${cl.requiere_observacion ? `
          <div class="checklist-obs" style="margin-top: 8px;">
            <input type="text" class="form-input" placeholder="Observación" value="${cl.observacion || ''}" onchange="guardarObservacion(${citaId}, ${cl.item_id}, this.value)" style="font-size: 12px;">
          </div>
        ` : ''}
        ${cl.completado_en ? `<div class="checklist-time">✓ ${new Date(cl.completado_en).toLocaleTimeString()}</div>` : ''}
      </div>
    </div>
  `).join('');

  // FOTOS
  const fotosHtml = fotos.length ? fotos.map(f => `
    <div class="foto-item">
      <img src="http://localhost:4000${f.url}" alt="${f.tipo}" class="foto-img">
      <div class="foto-label">${f.tipo === 'antes' ? 'ANTES' : 'DESPUÉS'}</div>
    </div>
  `).join('') : '<p style="color: var(--text-light); text-align: center;">Sin fotos aún</p>';

  // CONSUMO
  const consumoHtml = consumo.length ? consumo.map(c => `
    <div class="consumo-item">
      <div class="consumo-info">
        <div class="consumo-producto">${c.producto}</div>
        <div class="consumo-detalle">
          ${c.variante ? `${c.variante} · ` : ''}
          ${c.descontado ? '✅ Descontado' : '⏳ Pendiente descontar'}
        </div>
      </div>
      <div class="consumo-cantidad">${c.cantidad}</div>
      ${!c.descontado ? `<button class="consumo-delete" onclick="eliminarConsumo(${citaId}, ${c.id})" title="Eliminar">✕</button>` : ''}
    </div>
  `).join('') : '<p style="color: var(--text-light); text-align: center;">Sin consumo registrado</p>';

  body.innerHTML = `
    <div class="divider"></div>
    
    <div class="checklist-section">
      <div class="checklist-section-title">✅ Checklist del Servicio</div>
      ${checklistHtml}
    </div>

    <div class="divider"></div>

    <div class="checklist-section">
      <div class="checklist-section-title">📸 Fotos</div>
      <div class="foto-grid">
        ${fotosHtml}
      </div>
      <button class="btn btn-outline btn-sm" style="width: 100%; margin-top: 12px;" onclick="abrirModalFoto(${citaId})">➕ Subir foto</button>
    </div>

    <div class="divider"></div>

    <div class="checklist-section">
      <div class="checklist-section-title">🧴 Consumo de Insumos</div>
      <div class="consumo-list">
        ${consumoHtml}
      </div>
      <button class="btn btn-outline btn-sm" style="width: 100%; margin-top: 12px;" onclick="abrirModalConsumo(${citaId})">➕ Registrar consumo</button>
    </div>

    <div class="divider"></div>

    <div style="display: flex; gap: 10px;">
      <button class="btn btn-amber" style="flex: 1;" onclick="cerrarFicha(${citaId})">🔒 Cerrar Ficha</button>
      <button class="btn btn-outline" style="flex: 1;" id="fichaModalClose">✕ Volver</button>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────
// INICIAR SERVICIO
// ─────────────────────────────────────────────────────────
window.iniciarServicio = async function(citaId) {
  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/${citaId}/iniciar`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    
    // ✅ CAMBIADO: en lugar de redirigir a la página checklist, recargamos el modal
    showNotification('✅ Servicio iniciado', 'success');
    window.abrirFicha(citaId);  // Esto vuelve a cargar el detalle (ahora con ficha iniciada)
  } catch (err) {
    showNotification(err.message, 'error');
  }
};

// ─────────────────────────────────────────────────────────
// CHECKLIST
// ─────────────────────────────────────────────────────────
window.toggleChecklistItem = async function(citaId, itemId, checked) {
  const obsInput = document.querySelector(`input[onchange*="guardarObservacion(${citaId}, ${itemId}"]`);
  const observacion = obsInput ? obsInput.value : null;

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/${citaId}/checklist/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ completado: checked, observacion }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message);
    }
    showNotification(checked ? '✓ Ítem completado' : 'Ítem desmarcado', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
    window.abrirFicha(citaId); // Recargar el modal para reflejar el estado real
  }
};

window.guardarObservacion = function(citaId, itemId, valor) {
  const checkbox = document.getElementById(`check-${itemId}`);
  if (checkbox && checkbox.checked) {
    window.toggleChecklistItem(citaId, itemId, true);
  }
};

// ─────────────────────────────────────────────────────────
// MODAL FOTOS
// ─────────────────────────────────────────────────────────
window.abrirModalFoto = function(citaId) {
  fichaActualCitaId = citaId;
  document.getElementById('fotoForm').reset();
  document.getElementById('fotoMessage').innerHTML = '';
  openModal('fotoModal');
};

document.getElementById('fotoModalClose')?.addEventListener('click', e => {
  e.preventDefault();
  closeModal('fotoModal');
});

document.getElementById('fotoForm')?.addEventListener('submit', async e => {
  e.preventDefault();

  const tipo = document.getElementById('fotoTipo').value;
  const file = document.getElementById('fotoFile').files[0];
  const descripcion = document.getElementById('fotoDescripcion').value;

  if (!tipo || !file) {
    showNotification('Debes seleccionar tipo y archivo', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('foto', file);
  formData.append('tipo', tipo);
  formData.append('descripcion', descripcion);

  try {
    const res = await authFetch(
      `${API_URL.replace('/auth', '')}/groomers/fichas/${fichaActualCitaId}/foto`,
      {
        method: 'POST',
        body: formData,
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    showNotification('✓ Foto subida correctamente', 'success');
    closeModal('fotoModal');
    window.abrirFicha(fichaActualCitaId); // Recargar el modal principal
  } catch (err) {
    showNotification(err.message, 'error');
  }
});

// ─────────────────────────────────────────────────────────
// MODAL CONSUMO
// ─────────────────────────────────────────────────────────
window.abrirModalConsumo = async function(citaId) {
  fichaActualCitaId = citaId;
  
  if (!productosDisponibles.length) {
    await cargarProductos();
  }

  document.getElementById('consumoForm').reset();
  document.getElementById('consumoMessage').innerHTML = '';
  
  const selectProducto = document.getElementById('consumoProducto');
  selectProducto.innerHTML = '<option value="">Selecciona un producto</option>';
  productosDisponibles.forEach(p => {
    selectProducto.innerHTML += `<option value="${p.id}" data-variantes='${JSON.stringify(p.variantes)}'>${p.nombre} (Stock: ${p.stock})</option>`;
  });

  selectProducto.addEventListener('change', actualizarVariantes);
  
  openModal('consumoModal');
};

document.getElementById('consumoModalClose')?.addEventListener('click', e => {
  e.preventDefault();
  closeModal('consumoModal');
});

async function cargarProductos() {
  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/productos-consumo`);
    if (!res.ok) throw new Error('Error al cargar productos');
    productosDisponibles = await res.json();
  } catch (err) {
    showNotification('Error al cargar productos: ' + err.message, 'error');
  }
}

function actualizarVariantes() {
  const selectProducto = document.getElementById('consumoProducto');
  const option = selectProducto.options[selectProducto.selectedIndex];
  const variantes = option.dataset.variantes ? JSON.parse(option.dataset.variantes) : [];

  const selectVariante = document.getElementById('consumoVariante');
  selectVariante.innerHTML = '<option value="">Sin variante</option>';
  variantes.forEach(v => {
    const restante = (v.cantidad_actual !== null && v.cantidad_actual > 0)
      ? ` | Abierta: ${v.cantidad_actual} ${v.unidad_medida || ''}`
      : '';
    selectVariante.innerHTML += `<option value="${v.id}">${v.atributo}: ${v.valor} (Stock: ${v.stock}${restante})</option>`;
  });
}

document.getElementById('consumoForm')?.addEventListener('submit', async e => {
  e.preventDefault();

  const producto_id = parseInt(document.getElementById('consumoProducto').value);
  const variante_id = document.getElementById('consumoVariante').value ? parseInt(document.getElementById('consumoVariante').value) : null;
  const cantidad = parseFloat(document.getElementById('consumoCantidad').value);

  if (!producto_id || !cantidad || cantidad <= 0) {
    showNotification('Datos inválidos', 'error');
    return;
  }

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/${fichaActualCitaId}/consumo`, {
      method: 'POST',
      body: JSON.stringify({ producto_id, variante_id, cantidad }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    showNotification('✓ Consumo registrado', 'success');
    closeModal('consumoModal');
    window.abrirFicha(fichaActualCitaId); // Recargar
  } catch (err) {
    window.alert('Error al registrar consumo: ' + err.message);
    showNotification(err.message, 'error');
  }
});

// ─────────────────────────────────────────────────────────
// ELIMINAR CONSUMO
// ─────────────────────────────────────────────────────────
window.eliminarConsumo = async function(citaId, consumoId) {
  showConfirm(
    '¿Eliminar este registro de consumo?',
    async () => {
      try {
        const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/${citaId}/consumo/${consumoId}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        showNotification('✓ Consumo eliminado', 'success');
        window.abrirFicha(citaId);
      } catch (err) {
        showNotification(err.message, 'error');
      }
    }
  );
};

// ─────────────────────────────────────────────────────────
// CERRAR FICHA
// ─────────────────────────────────────────────────────────
window.cerrarFicha = async function(citaId) {
  showConfirm(
    '¿Cerrar la ficha? Se descontará el inventario y la cita se marcará como completada.',
    async () => {
      try {
        const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/fichas/${citaId}/cerrar`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        showNotification('✓ Ficha cerrada exitosamente', 'success');
        closeModal('fichaModal');
        loadFichasActivas();
        loadAgendaHoy();
      } catch (err) {
        showNotification(err.message, 'error');
      }
    }
  );
};

// ─────────────────────────────────────────────────────────
// CAMBIO DE CONTRASEÑA
// ─────────────────────────────────────────────────────────
document.getElementById('changePasswordForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;

  try {
    const res = await authFetch(`${API_URL}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    showNotification('✓ Contraseña actualizada. Redirigiendo...', 'success');
    setTimeout(() => {
      clearTokens();
      window.location.href = 'index.html';
    }, 2000);
  } catch (err) {
    showNotification(err.message, 'error');
  }
});

// ─────────────────────────────────────────────────────────
// NOTIFICACIONES
// ─────────────────────────────────────────────────────────
function showNotification(message, type = 'info') {
  // Buscar elemento .alert visible
  const messageEls = document.querySelectorAll('.alert');
  messageEls.forEach(el => {
    if (el.classList.contains('show')) {
      el.classList.remove('show');
    }
  });

  const alertEl = document.querySelector('.alert:not(.show)') 
    || document.getElementById('fotoMessage') 
    || document.getElementById('consumoMessage') 
    || document.getElementById('pwMessage');

  if (alertEl) {
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type} show`;
  } else {
    // ✅ FALLBACK: si no hay elemento alert, usar window.alert
    window.alert(message); 
  }
}

// ─────────────────────────────────────────────────────────
// CERRAR MODALES CON ESC
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('fichaModal');
    closeModal('fotoModal');
    closeModal('consumoModal');
    closeModal('confirmModal');  // ← añadir
  }
});

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) {
      backdrop.classList.remove('show');
    }
  });
});

// ─────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────
showSection('agenda');