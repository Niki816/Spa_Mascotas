import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const CHECKLIST_API = API_URL.replace('/auth', '/admin/checklist');

const SECTIONS = ['resumen', 'items', 'templates', 'fichas', 'consumo'];

// ─── Estado global ───
const state = {
  items: [],
  servicios: [],
  templates: [],
};

// ══════════════════════════════════════════════════════════════
// GUARD DE AUTENTICACIÓN
// ══════════════════════════════════════════════════════════════
(function guardAuth() {
  const token = getAccessToken();
  const user  = getUser();
  if (!token || !user || user.rol !== 'admin') {
    clearTokens();
    window.location.href = 'index.html';
    return;
  }
  document.getElementById('sidebarName').textContent = user.email.split('@')[0];
})();

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

function safeHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function safeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ══════════════════════════════════════════════════════════════
function showSection(sec) {
  SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === sec ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-item[data-section]').forEach(l =>
    l.classList.toggle('active', l.dataset.section === sec)
  );

  const loaders = {
    resumen:   loadResumen,
    items:     loadItems,
    templates: loadTemplates,
    fichas:    loadFichas,
    consumo:   loadConsumo,
  };
  loaders[sec]?.();
}

document.querySelectorAll('.nav-item[data-section]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); showSection(link.dataset.section); });
});

// ══════════════════════════════════════════════════════════════
// RESUMEN
// ══════════════════════════════════════════════════════════════
async function loadResumen() {
  try {
    const res = await authFetch(`${CHECKLIST_API}/resumen`);
    const data = await res.json();
    safeText('statTotalItems', data.items.total);
    safeText('statItemsActivos', data.items.activos);
    safeText('statServiciosConfig', data.templates.servicios_configurados);
    safeText('statFichasHoy', data.hoy.fichas_completadas);
    safeText('resumenConsumoCount', data.hoy.insumos_consumidos);
    safeText('resumenConsumoCantidad', `${data.hoy.cantidad_total} unid.`);
  } catch (err) {
    console.error('Error resumen:', err);
  }
}

// ══════════════════════════════════════════════════════════════
// ÍTEMS
// ══════════════════════════════════════════════════════════════
async function loadItems() {
  const tbody = document.getElementById('itemsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;">⏳ Cargando...</td></tr>';

  try {
    const estado = document.getElementById('filtroEstadoItem')?.value ?? '';
    const search = document.getElementById('buscarItemInput')?.value ?? '';
    const params = new URLSearchParams();
    if (estado) params.set('estado', estado);
    if (search) params.set('search', search);

    const res = await authFetch(`${CHECKLIST_API}/items?${params}`);
    state.items = await res.json();

    if (!state.items.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:16px;color:#8aab97;">Sin ítems</td></tr>';
      return;
    }

    tbody.innerHTML = state.items.map(item => `
      <tr style="${!item.estado_activo ? 'opacity:.6;' : ''}">
        <td>${item.id}</td>
        <td><strong>${esc(item.nombre)}</strong>
          ${item.descripcion ? `<br><small style="color:var(--text-light);">${esc(item.descripcion)}</small>` : ''}
        </td>
        <td style="text-align:center;">${item.requiere_observacion ? '📝 Sí' : '—'}</td>
        <td style="text-align:center;">${item.orden}</td>
        <td style="text-align:center;">${item.veces_asignado}</td>
        <td style="text-align:center;">${item.veces_usado}</td>
        <td>${item.estado_activo
          ? '<span class="badge-ok">Activo</span>'
          : '<span class="badge-inactive">Inactivo</span>'}</td>
        <td style="display:flex;gap:4px;">
          <button class="btn btn-outline btn-sm" data-action="edit" data-id="${item.id}">✏️</button>
          <button class="btn btn-outline btn-sm" data-action="toggle" data-id="${item.id}">
            ${item.estado_activo ? '🚫' : '✅'}
          </button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${item.id}">🗑️</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        if (btn.dataset.action === 'edit') openItemModal(id);
        if (btn.dataset.action === 'toggle') toggleItem(id);
        if (btn.dataset.action === 'delete') deleteItem(id);
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#dc2626;padding:14px;">❌ ${esc(err.message)}</td></tr>`;
  }
}

// ─── Modal Item ───
async function openItemModal(id = null) {
  const modal = document.getElementById('itemModal');
  document.getElementById('itemForm').reset();
  document.getElementById('itemId').value = '';
  document.getElementById('itemModalAlert').className = 'alert';

  if (id) {
    document.getElementById('itemModalTitle').textContent = '✏️ Editar Ítem';
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemNombre').value = item.nombre;
    document.getElementById('itemDescripcion').value = item.descripcion ?? '';
    document.getElementById('itemOrden').value = item.orden;
    document.getElementById('itemRequiereObs').checked = item.requiere_observacion;
  } else {
    document.getElementById('itemModalTitle').textContent = '➕ Nuevo Ítem';
  }

  modal.classList.add('open');
}

function closeItemModal() {
  document.getElementById('itemModal')?.classList.remove('open');
}

document.getElementById('closeItemModalBtn')?.addEventListener('click', closeItemModal);
document.getElementById('itemModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeItemModal();
});

document.getElementById('itemForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('itemId').value;
  const payload = {
    nombre: document.getElementById('itemNombre').value.trim(),
    descripcion: document.getElementById('itemDescripcion').value.trim() || null,
    orden: parseInt(document.getElementById('itemOrden').value) || 1,
    requiere_observacion: document.getElementById('itemRequiereObs').checked,
  };

  if (!payload.nombre) return showAlert('itemModalAlert', '⚠️ El nombre es obligatorio', 'error');

  try {
    const url = id ? `${CHECKLIST_API}/items/${id}` : `${CHECKLIST_API}/items`;
    const method = id ? 'PUT' : 'POST';
    const res = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('itemModalAlert', `✅ ${data.message}`, 'success');
    setTimeout(() => { closeItemModal(); loadItems(); loadResumen(); }, 1000);
  } catch (err) {
    showAlert('itemModalAlert', `❌ ${err.message}`, 'error');
  }
});

async function toggleItem(id) {
  try {
    const res = await authFetch(`${CHECKLIST_API}/items/${id}/toggle`, { method: 'PATCH' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('itemsMessage', `✅ ${data.message}`, 'success');
    loadItems();
    loadResumen();
  } catch (err) {
    showAlert('itemsMessage', `❌ ${err.message}`, 'error');
  }
}

async function deleteItem(id) {
  if (!confirm('¿Desactivar este ítem? Solo se puede si no está asignado a servicios activos.')) return;
  try {
    const res = await authFetch(`${CHECKLIST_API}/items/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('itemsMessage', `✅ ${data.message}`, 'success');
    loadItems();
    loadResumen();
  } catch (err) {
    showAlert('itemsMessage', `❌ ${err.message}`, 'error');
  }
}

document.getElementById('btnNuevoItem')?.addEventListener('click', () => openItemModal());
document.getElementById('btnRefrescarItems')?.addEventListener('click', loadItems);
document.getElementById('btnBuscarItem')?.addEventListener('click', loadItems);
document.getElementById('filtroEstadoItem')?.addEventListener('change', loadItems);
document.getElementById('buscarItemInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadItems();
});

// ══════════════════════════════════════════════════════════════
// TEMPLATES
// ══════════════════════════════════════════════════════════════
async function loadTemplates() {
  const container = document.getElementById('templatesContainer');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">⏳ Cargando...</div>';

  try {
    const res = await authFetch(`${CHECKLIST_API}/templates`);
    const templates = await res.json();

    if (!templates.length) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">Sin templates configurados. ¡Asigna ítems a un servicio!</div>';
      return;
    }

    container.innerHTML = templates.map(t => `
      <div class="servicio-card" style="${!t.servicio_activo ? 'opacity:.5;' : ''}">
        <div class="servicio-card-header">
          <h4>🐾 ${esc(t.servicio_nombre)} ${!t.servicio_activo ? '<span class="badge-inactive">Inactivo</span>' : ''}</h4>
          <div class="btn-group">
            <span style="font-size:11px;color:var(--text-light);">${t.total_items} ítems (${t.obligatorios} oblig.)</span>
            <button class="btn btn-outline btn-sm" onclick="editTemplate(${t.servicio_id})">✏️ Editar</button>
            <button class="btn btn-danger btn-sm" onclick="clearTemplate(${t.servicio_id})">🗑️ Limpiar</button>
          </div>
        </div>
        <div>
          ${t.items.map(item => `
            <span class="item-tag ${item.obligatorio ? 'obligatorio' : 'opcional'}">
              ${item.obligatorio ? '🔴' : '⚪'} ${esc(item.nombre)}
              ${!item.item_activo ? '<span class="badge-inactive" style="font-size:9px;">inactivo</span>' : ''}
              ${item.requiere_observacion ? '📝' : ''}
            </span>`).join('')}
        </div>
      </div>`).join('');

    // Guardar templates en state
    state.templates = templates;
  } catch (err) {
    container.innerHTML = `<div style="color:#dc2626;padding:14px;">❌ ${esc(err.message)}</div>`;
  }
}

// ─── Modal Template ───
async function openTemplateModal(servicioId = null) {
  // Cargar servicios e items
  try {
    const [servRes, itemsRes] = await Promise.all([
      authFetch(`${API_URL.replace('/auth', '/admin')}/servicios`),
      authFetch(`${CHECKLIST_API}/items?estado=activo`),
    ]);
    const servicios = await servRes.json();
    const items = await itemsRes.json();
    state.servicios = Array.isArray(servicios) ? servicios : servicios.data ?? [];
    state.items = items;

    const select = document.getElementById('templateServicio');
    select.innerHTML = '<option value="">— Seleccionar —</option>' +
      state.servicios.map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('');

    // Renderizar items disponibles
    const container = document.getElementById('itemsDisponibles');
    let itemsAsignados = [];
    if (servicioId) {
      select.value = servicioId;
      select.disabled = true;
      // Cargar asignaciones actuales
      const templateRes = await authFetch(`${CHECKLIST_API}/templates?servicio_id=${servicioId}`);
      const templates = await templateRes.json();
      if (templates.length > 0) {
        itemsAsignados = templates[0].items.map(i => ({ item_id: i.item_id, obligatorio: i.obligatorio, orden: i.orden }));
      }
    }

    container.innerHTML = items.map(item => {
      const asignado = itemsAsignados.find(a => a.item_id === item.id);
      return `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f5f2;cursor:pointer;">
          <input type="checkbox" value="${item.id}" ${asignado ? 'checked' : ''} style="width:16px;height:16px;">
          <span style="flex:1;">${esc(item.nombre)} ${item.requiere_observacion ? '📝' : ''}</span>
          <label style="font-size:11px;display:flex;align-items:center;gap:4px;">
            <input type="checkbox" class="obligatorio-check" ${asignado?.obligatorio !== false ? 'checked' : ''} style="width:14px;height:14px;"> Oblig.
          </label>
          <input type="number" class="orden-input" value="${asignado?.orden ?? ''}" placeholder="Orden" style="width:55px;font-size:11px;padding:2px 5px;" min="1">
        </label>`;
    }).join('');

    document.getElementById('templateModal').classList.add('open');
    document.getElementById('templateModal').dataset.editando = servicioId ?? '';
  } catch (err) {
    alert('Error cargando datos: ' + err.message);
  }
}

function closeTemplateModal() {
  document.getElementById('templateModal')?.classList.remove('open');
}

document.getElementById('closeTemplateModalBtn')?.addEventListener('click', closeTemplateModal);
document.getElementById('templateModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTemplateModal();
});

document.getElementById('templateForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const servicio_id = parseInt(document.getElementById('templateServicio').value);
  if (!servicio_id) return showAlert('templateModalAlert', '⚠️ Selecciona un servicio', 'error');

  const checkboxes = document.querySelectorAll('#itemsDisponibles input[type="checkbox"]');
  const items = [];
  checkboxes.forEach((cb, i) => {
    if (cb.checked) {
      const row = cb.closest('label');
      const obligatorio = row.querySelector('.obligatorio-check')?.checked ?? true;
      const ordenInput = row.querySelector('.orden-input');
      const orden = parseInt(ordenInput?.value) || i + 1;
      items.push({ item_id: parseInt(cb.value), obligatorio, orden });
    }
  });

  if (!items.length) return showAlert('templateModalAlert', '⚠️ Selecciona al menos un ítem', 'error');

  try {
    const res = await authFetch(`${CHECKLIST_API}/templates`, {
      method: 'POST',
      body: JSON.stringify({ servicio_id, items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('templateModalAlert', `✅ ${data.message}`, 'success');
    setTimeout(() => { closeTemplateModal(); loadTemplates(); loadResumen(); }, 1000);
  } catch (err) {
    showAlert('templateModalAlert', `❌ ${err.message}`, 'error');
  }
});

document.getElementById('btnNuevoTemplate')?.addEventListener('click', () => openTemplateModal());

// Exponer funciones al scope global para los onclick inline
window.editTemplate = (servicioId) => openTemplateModal(servicioId);
window.clearTemplate = async (servicioId) => {
  if (!confirm('¿Eliminar TODOS los ítems asignados a este servicio?')) return;
  try {
    const res = await authFetch(`${CHECKLIST_API}/templates/${servicioId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('templatesMessage', `✅ ${data.message}`, 'success');
    loadTemplates();
    loadResumen();
  } catch (err) {
    showAlert('templatesMessage', `❌ ${err.message}`, 'error');
  }
};

// ══════════════════════════════════════════════════════════════
// FICHAS COMPLETADAS
// ══════════════════════════════════════════════════════════════
async function loadFichas() {
  const container = document.getElementById('fichasContainer');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">⏳ Cargando...</div>';

  try {
    const fecha = document.getElementById('filtroFechaFichas')?.value ?? '';
    const servicio_id = document.getElementById('filtroServicioFichas')?.value ?? '';
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (servicio_id) params.set('servicio_id', servicio_id);

    const res = await authFetch(`${CHECKLIST_API}/fichas?${params}`);
    const fichas = await res.json();

    if (!fichas.length) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">Sin fichas para mostrar</div>';
      return;
    }

    container.innerHTML = fichas.map(f => {
      const pct = f.total_items > 0 ? Math.round((f.completados / f.total_items) * 100) : 0;
      return `
      <div class="servicio-card">
        <div class="servicio-card-header">
          <h4>🐶 ${esc(f.mascota)} — ${esc(f.servicio)}</h4>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:var(--text-light);">${esc(f.groomer)}</span>
            <span class="badge-${f.estado_ficha === 'completada' ? 'ok' : 'warn'}">${f.estado_ficha}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:12px;">${f.completados}/${f.total_items} completados</span>
          <div class="progress-bar" style="flex:1;">
            <div class="progress-fill" style="width:${pct}%;${pct < 100 ? 'background:#f59e0b;' : ''}"></div>
          </div>
          <span style="font-size:12px;font-weight:600;">${pct}%</span>
        </div>
        <div>
          ${f.items.map(item => `
            <span class="item-tag ${item.completado ? 'obligatorio' : 'opcional'}">
              ${item.completado ? '✅' : '⬜'} ${esc(item.nombre)}
              ${item.observacion ? `<br><small style="color:var(--text-mid);">📝 ${esc(item.observacion)}</small>` : ''}
              ${item.completado_en ? `<br><small style="color:var(--text-light);">${new Date(item.completado_en).toLocaleString('es-BO')}</small>` : ''}
            </span>`).join('')}
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:#dc2626;padding:14px;">❌ ${esc(err.message)}</div>`;
  }
}

document.getElementById('btnBuscarFichas')?.addEventListener('click', loadFichas);

// ══════════════════════════════════════════════════════════════
// CONSUMO INSUMOS
// ══════════════════════════════════════════════════════════════
async function loadConsumo() {
  const tbody = document.getElementById('consumoTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;">⏳ Cargando...</td></tr>';

  try {
    const fecha = document.getElementById('filtroFechaConsumo')?.value ?? '';
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);

    const res = await authFetch(`${CHECKLIST_API}/consumo?${params}`);
    const data = await res.json();
    const consumos = data.items;

    // Mostrar resumen
    const resumenDiv = document.getElementById('consumoResumen');
    if (resumenDiv) {
      resumenDiv.className = 'alert alert-info show';
      resumenDiv.innerHTML = `
        📊 <strong>Total registros:</strong> ${data.resumen.total_items} ·
        💰 <strong>Costo total:</strong> Bs ${data.resumen.costo_total.toFixed(2)} ·
        ✅ <strong>Descontados:</strong> ${data.resumen.descontados} ·
        ⏳ <strong>Pendientes:</strong> ${data.resumen.pendientes_descuento}
      `;
    }

    if (!consumos.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:16px;color:#8aab97;">Sin consumo registrado</td></tr>';
      return;
    }

    tbody.innerHTML = consumos.map(c => `
      <tr>
        <td>${c.id}</td>
        <td><small>#${c.ficha_id}</small></td>
        <td>${esc(c.mascota)}</td>
        <td style="font-size:12px;">${esc(c.servicio)}</td>
        <td>${esc(c.producto)}</td>
        <td style="font-size:11px;">${c.variante ? esc(c.variante) : '—'}</td>
        <td style="text-align:center;">${c.cantidad}</td>
        <td class="monto">Bs ${c.costo_total.toFixed(2)}</td>
        <td>${c.descontado
          ? '<span class="badge-ok">✅ Sí</span>'
          : '<span class="badge-warn">⏳ No</span>'}</td>
        <td style="font-size:11px;">${new Date(c.creado_en).toLocaleString('es-BO')}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="color:#dc2626;padding:14px;">❌ ${esc(err.message)}</td></tr>`;
  }
}

document.getElementById('btnBuscarConsumo')?.addEventListener('click', loadConsumo);

// ══════════════════════════════════════════════════════════════
// CARGA DE SERVICIOS PARA FILTROS
// ══════════════════════════════════════════════════════════════
async function cargarServicios() {
  try {
    const res = await authFetch(`${API_URL.replace('/auth', '/admin')}/servicios`);
    const servicios = await res.json();
    const lista = Array.isArray(servicios) ? servicios : servicios.data ?? [];
    const select = document.getElementById('filtroServicioFichas');
    if (select) {
      select.innerHTML = '<option value="">Todos los servicios</option>' +
        lista.map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('');
    }
  } catch (err) {
    console.error('Error cargando servicios:', err);
  }
}

// ══════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
});

// ══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════
cargarServicios();
showSection('resumen');