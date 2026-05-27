import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const API = API_URL.replace('/auth', '/recepcion');

console.log(`[INIT] API_URL: ${API_URL}`);
console.log(`[INIT] API (Recepción): ${API}`);

// ══════════════════════════════════════════════════════════════
// GUARD
// ══════════════════════════════════════════════════════════════
const token = getAccessToken();
const user  = getUser();

console.log(`[GUARD] Token: ${token ? '✓' : '✗'}`);
console.log(`[GUARD] Usuario: ${user?.email ?? '✗'}`);
console.log(`[GUARD] Rol: ${user?.rol ?? '✗'}`);

if (!token || !user || !['recepcion', 'admin'].includes(user.rol)) {
  console.error(`❌ Acceso denegado. Rol requerido: recepcion|admin. Rol actual: ${user?.rol}`);
  clearTokens();
  window.location.href = 'index.html';
}

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('userEmail').textContent   = user.email;

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
// HELPERS
// ══════════════════════════════════════════════════════════════
const fmt = n =>
  `Bs ${Number(n).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function esc(str = '') {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  console.log(`[ALERT] ${id}: ${msg} (${type})`);
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  if (type !== 'error') setTimeout(() => { el.className = 'alert'; }, 6000);
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.className = 'alert';
}

const NIVEL_COLOR = { 0:'#64748b', 1:'#2d5a45', 2:'#d97706', 3:'#7c3aed' };
const METODO_ICO  = { efectivo:'💵', qr:'📱', transferencia:'🏦' };

// ══════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════
const TAB_IDS = ['cobrar','facturas','cierre'];

function activarTab(tabId) {
  console.log(`[TAB] Activando: ${tabId}`);
  TAB_IDS.forEach(id => {
    document.querySelector(`[data-tab="${id}"]`)?.classList.toggle('active', id === tabId);
    const p = document.getElementById(`tab-${id}`);
    if (p) p.style.display = id === tabId ? '' : 'none';
  });
  if (tabId === 'cobrar')   initPOS();
  if (tabId === 'facturas') loadFacturas();
  if (tabId === 'cierre')   initCierre();
}

document.querySelectorAll('.tab-btn').forEach(b =>
  b.addEventListener('click', () => activarTab(b.dataset.tab)));

document.querySelectorAll('[data-goto-tab]').forEach(lnk =>
  lnk.addEventListener('click', e => { e.preventDefault(); activarTab(lnk.dataset.gotoTab); }));

// ══════════════════════════════════════════════════════════════
// ESTADO GLOBAL POS
// ══════════════════════════════════════════════════════════════
let posMetodo      = 'efectivo';
let posDescTipo    = 'sin_descuento';
let posDescValor   = 0;
let posModalMetodo = 'efectivo';
let clientesPendientes = [];
let clienteActivo      = null;

// ══════════════════════════════════════════════════════════════
// TAB 1 — POS / COBRAR
// ══════════════════════════════════════════════════════════════
async function initPOS() {
  console.log(`[POS] Inicializando...`);
  posMetodo    = 'efectivo';
  posDescTipo  = 'sin_descuento';
  posDescValor = 0;
  clienteActivo = null;

  setupPromos();
  setupDescuento();
  setupMetodosPOS();

  await cargarClientesPendientes();
  recalcularTotal();
}

async function cargarClientesPendientes() {
  const sel = document.getElementById('posClienteSelect');
  sel.innerHTML = '<option value="">⏳ Cargando...</option>';
  document.getElementById('posCitasContainer').innerHTML = '';
  document.getElementById('btnCobrar').disabled = true;
  hideAlert('posSelAlert');

  try {
    console.log(`[FETCH] GET ${API}/clientes/pendientes-pago`);
    const res = await authFetch(`${API}/clientes/pendientes-pago`);
    
    console.log(`[RESPONSE] Status: ${res.status}`);
    console.log(`[RESPONSE] Content-Type: ${res.headers.get('content-type')}`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[ERROR] Response no OK:`, errorText);
      throw new Error(`Error ${res.status}: ${res.statusText}`);
    }

    clientesPendientes = await res.json();
    console.log(`[DATA] Clientes cargados: ${clientesPendientes.length}`);

    if (!clientesPendientes.length) {
      sel.innerHTML = '<option value="">✅ No hay citas pendientes de cobro</option>';
      return;
    }

    sel.innerHTML = '<option value="">— Selecciona un cliente —</option>'
      + clientesPendientes.map(c => `
          <option value="${c.cliente_id}">
            ${esc(c.cliente_nombre)}
            ${c.cliente_ci ? ` · CI ${esc(c.cliente_ci)}` : ''}
            — ${c.total_citas} cita${c.total_citas !== 1 ? 's' : ''} pendiente${c.total_citas !== 1 ? 's' : ''}
            (${fmt(c.subtotal)})
          </option>`).join('');

  } catch (err) {
    console.error(`[ERROR] cargarClientesPendientes:`, err);
    sel.innerHTML = '<option value="">❌ Error al cargar</option>';
    showAlert('posSelAlert', `❌ ${err.message}`, 'error');
  }
}

document.getElementById('posClienteSelect')?.addEventListener('change', function () {
  const cid = parseInt(this.value);
  clienteActivo = clientesPendientes.find(c => c.cliente_id === cid) ?? null;

  console.log(`[EVENT] Cliente seleccionado: ${cid}`, clienteActivo);

  const container = document.getElementById('posCitasContainer');
  const nivelBox  = document.getElementById('posNivelBox');

  if (!clienteActivo) {
    container.innerHTML = '';
    if (nivelBox) nivelBox.style.display = 'none';
    document.getElementById('btnCobrar').disabled = true;
    resetDescuento();
    recalcularTotal();
    return;
  }

  const nv = clienteActivo.cliente_nivel;
  if (nivelBox) {
    nivelBox.style.display = '';
    nivelBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                  background:var(--green-pale);border-radius:var(--radius-sm);
                  border-left:4px solid ${NIVEL_COLOR[nv.nivel]};">
        <span style="font-size:20px;">${esc(nv.badge)}</span>
        <div>
          <div style="font-weight:700;color:${NIVEL_COLOR[nv.nivel]};">${esc(nv.label)}</div>
          <div style="font-size:11px;color:var(--text-mid);">${esc(nv.descripcion)}</div>
        </div>
        ${nv.descuento_pct > 0
          ? `<button class="btn btn-amber btn-sm" style="margin-left:auto;"
               onclick="aplicarDescuentoNivel(${nv.descuento_pct})">
               Aplicar ${nv.descuento_pct}%
             </button>`
          : ''}
      </div>`;
  }

  container.innerHTML = `
    <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;font-weight:600;color:var(--text-mid);">
        Citas pendientes de cobro
      </span>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" onclick="toggleTodasCitas(true)">Todas</button>
        <button class="btn btn-outline btn-sm" onclick="toggleTodasCitas(false)">Ninguna</button>
      </div>
    </div>
    ${clienteActivo.citas.map(c => `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
                    background:#fff;border:1.5px solid #e0ebe5;border-radius:var(--radius-sm);
                    margin-bottom:8px;cursor:pointer;transition:border-color .2s;"
             class="cita-check-row" data-cita-id="${c.id}">
        <input type="checkbox" class="cita-checkbox" data-id="${c.id}"
               data-precio="${c.precio_calculado}" checked
               style="margin-top:2px;width:16px;height:16px;cursor:pointer;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;">
            🐾 ${esc(c.mascota)} — ${esc(c.servicio)}
          </div>
          <div style="font-size:11px;color:var(--text-mid);margin-top:2px;">
            📅 ${esc(c.fecha)} ${esc(c.hora)} · ✂️ ${esc(c.groomer)}
          </div>
        </div>
        <div style="font-weight:700;font-size:13px;white-space:nowrap;">${fmt(c.precio_calculado)}</div>
      </label>`).join('')}`;

  container.querySelectorAll('.cita-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = cb.closest('.cita-check-row');
      row.style.borderColor = cb.checked ? 'var(--green-soft)' : '#e0ebe5';
      row.style.background  = cb.checked ? 'var(--green-pale)' : '#fff';
      recalcularTotal();
    });
    const row = cb.closest('.cita-check-row');
    row.style.borderColor = 'var(--green-soft)';
    row.style.background  = 'var(--green-pale)';
  });

  if (nv.descuento_pct > 0) {
    aplicarDescuentoNivel(nv.descuento_pct);
  } else {
    resetDescuento();
  }

  document.getElementById('btnCobrar').disabled = false;
  recalcularTotal();
});

window.toggleTodasCitas = function(estado) {
  document.querySelectorAll('.cita-checkbox').forEach(cb => {
    cb.checked = estado;
    const row = cb.closest('.cita-check-row');
    row.style.borderColor = estado ? 'var(--green-soft)' : '#e0ebe5';
    row.style.background  = estado ? 'var(--green-pale)' : '#fff';
  });
  recalcularTotal();
};

function getCitasSeleccionadas() {
  const checks = [...document.querySelectorAll('.cita-checkbox:checked')];
  return checks.map(cb => ({
    id:     parseInt(cb.dataset.id),
    precio: parseFloat(cb.dataset.precio),
  }));
}

function recalcularTotal() {
  const lista   = document.getElementById('posResumenList');
  const totalEl = document.getElementById('posTotalDisplay');
  const detEl   = document.getElementById('posTotalDet');

  const seleccionadas = getCitasSeleccionadas();

  if (!clienteActivo || !seleccionadas.length) {
    lista.innerHTML = `<li class="detail-item"><span class="item-name">Sin citas seleccionadas</span><span>Bs 0.00</span></li>`;
    totalEl.textContent = 'Bs 0.00';
    detEl.textContent   = '—';
    document.getElementById('btnCobrar').disabled = !clienteActivo;
    return;
  }

  const subtotal = seleccionadas.reduce((s, c) => s + c.precio, 0);
  let   descuento = 0;

  if (posDescTipo === 'porcentaje') descuento = subtotal * (posDescValor / 100);
  else if (posDescTipo === 'fijo') descuento = posDescValor;
  descuento = Math.min(descuento, subtotal);

  const total = Math.max(0, subtotal - descuento);

  let html = '';
  if (clienteActivo) {
    seleccionadas.forEach(s => {
      const cita = clienteActivo.citas.find(c => c.id === s.id);
      if (cita) html += `
        <li class="detail-item">
          <span class="item-name">🐾 ${esc(cita.mascota)} — ${esc(cita.servicio)}</span>
          <span>${fmt(cita.precio_calculado)}</span>
        </li>`;
    });
  }

  if (seleccionadas.length > 1) {
    html += `<li class="detail-item" style="border-top:1px dashed var(--green-pale);color:var(--text-mid);font-size:12px;">
               <span>Subtotal (${seleccionadas.length} citas)</span>
               <span>${fmt(subtotal)}</span>
             </li>`;
  }

  if (descuento > 0) {
    const etq = posDescTipo === 'porcentaje' ? `Descuento (${posDescValor}%)` : 'Descuento fijo';
    html += `<li class="detail-item"><span class="item-discount">🏷️ ${etq}</span><span class="item-discount">−${fmt(descuento)}</span></li>`;
  }

  html += `<li class="detail-item item-total-row"><span>TOTAL</span><span>${fmt(total)}</span></li>`;

  lista.innerHTML = html;
  totalEl.textContent = fmt(total);
  detEl.textContent   = `${seleccionadas.length} cita${seleccionadas.length !== 1 ? 's' : ''} · Subtotal: ${fmt(subtotal)}${descuento > 0 ? ` · Desc: −${fmt(descuento)}` : ''}`;
  document.getElementById('btnCobrar').disabled = false;
}

window.aplicarDescuentoNivel = function(pct) {
  document.querySelectorAll('.promo-tag').forEach(t => t.classList.remove('applied'));
  document.querySelectorAll(`.promo-tag[data-tipo="porcentaje"][data-valor="${pct}"]`)
    .forEach(t => t.classList.add('applied'));
  document.getElementById('descuentoTipo').value  = 'porcentaje';
  document.getElementById('descuentoValor').value = pct;
  posDescTipo  = 'porcentaje';
  posDescValor = pct;
  recalcularTotal();
};

function resetDescuento() {
  document.querySelectorAll('.promo-tag').forEach(t => t.classList.remove('applied'));
  document.getElementById('descuentoTipo').value  = 'sin_descuento';
  document.getElementById('descuentoValor').value = '0';
  posDescTipo  = 'sin_descuento';
  posDescValor = 0;
  recalcularTotal();
}

function setupPromos() {
  document.querySelectorAll('.promo-tag').forEach(tag => {
    tag.addEventListener('click', function () {
      document.querySelectorAll('.promo-tag').forEach(t => t.classList.remove('applied'));
      this.classList.add('applied');
      posDescTipo  = this.dataset.tipo;
      posDescValor = parseFloat(this.dataset.valor);
      document.getElementById('descuentoTipo').value  = posDescTipo;
      document.getElementById('descuentoValor').value = posDescValor;
      recalcularTotal();
    });
  });
}

function setupDescuento() {
  document.getElementById('descuentoTipo')?.addEventListener('change', function () {
    posDescTipo = this.value;
    if (posDescTipo === 'sin_descuento') {
      document.getElementById('descuentoValor').value = '0';
      posDescValor = 0;
      document.querySelectorAll('.promo-tag').forEach(t => t.classList.remove('applied'));
    }
    recalcularTotal();
  });
  document.getElementById('descuentoValor')?.addEventListener('input', function () {
    posDescValor = parseFloat(this.value) || 0;
    document.querySelectorAll('.promo-tag').forEach(t => t.classList.remove('applied'));
    recalcularTotal();
  });
}

function setupMetodosPOS() {
  document.querySelectorAll('.metodo-btn[data-metodo]').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.metodo-btn[data-metodo]').forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
      posMetodo = this.dataset.metodo;
      document.getElementById('posRefWrap').style.display = posMetodo !== 'efectivo' ? '' : 'none';
    });
  });
}

document.getElementById('btnCobrar')?.addEventListener('click', async () => {
  if (!clienteActivo) return showAlert('posAlert', '⚠️ Selecciona un cliente primero', 'error');

  const seleccionadas = getCitasSeleccionadas();
  if (!seleccionadas.length) return showAlert('posAlert', '⚠️ Selecciona al menos una cita', 'error');

  const referencia = document.getElementById('posReferencia')?.value.trim() || null;
  if (posMetodo !== 'efectivo' && !referencia)
    return showAlert('posAlert', '⚠️ Ingresa la referencia de transacción', 'error');

  const subtotal = seleccionadas.reduce((s, c) => s + c.precio, 0);
  let   descuento = 0;
  if (posDescTipo === 'porcentaje') descuento = subtotal * (posDescValor / 100);
  else if (posDescTipo === 'fijo') descuento = posDescValor;
  descuento = Math.min(descuento, subtotal);
  const total = Math.max(0, subtotal - descuento);

  const items = seleccionadas.map(s => {
    const cita = clienteActivo.citas.find(c => c.id === s.id);
    return {
      descripcion:     `${cita?.servicio ?? 'Servicio'} — ${cita?.mascota ?? ''}`,
      cantidad:        1,
      precio_unitario: s.precio,
    };
  });

  const btn = document.getElementById('btnCobrar');
  btn.disabled    = true;
  btn.textContent = '⏳ Procesando...';
  hideAlert('posAlert');

  try {
    console.log(`[POST] Creando factura...`);
    console.log(`  Cliente: ${clienteActivo.cliente_id}`);
    console.log(`  Citas: ${seleccionadas.map(s => s.id).join(', ')}`);
    console.log(`  Total: Bs ${total}`);

    const res = await authFetch(`${API}/facturas`, {
      method: 'POST',
      body: JSON.stringify({
        cliente_id:             clienteActivo.cliente_id,
        cita_ids:               seleccionadas.map(s => s.id),
        metodo_pago:            posMetodo,
        descuento,
        impuesto:               0,
        referencia_transaccion: referencia,
        items,
      }),
    });

    console.log(`[RESPONSE] Status: ${res.status}`);

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);

    console.log(`[SUCCESS] Factura creada:`, data.recibo.numero_factura);

    mostrarComprobante(data.recibo);

    clienteActivo = null;
    document.getElementById('posClienteSelect').value = '';
    document.getElementById('posCitasContainer').innerHTML = '';
    const nivelBox = document.getElementById('posNivelBox');
    if (nivelBox) nivelBox.style.display = 'none';
    resetDescuento();
    recalcularTotal();
    await cargarClientesPendientes();
    showAlert('posAlert', `✅ Factura ${data.recibo.numero_factura} registrada correctamente`, 'success');

  } catch (err) {
    console.error(`[ERROR] crearFactura:`, err);
    showAlert('posAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = '💳 Generar factura y cobrar';
  }
});

// ══════════════════════════════════════════════════════════════
// TAB 2 — FACTURAS
// ══════════════════════════════════════════════════════════════
async function loadFacturas() {
  const estado = document.getElementById('filtroEstado')?.value || '';
  const desde  = document.getElementById('filtroDesde')?.value  || '';
  const hasta  = document.getElementById('filtroHasta')?.value  || '';
  const tbody  = document.getElementById('facturasBody');

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-light);">⏳ Cargando...</td></tr>`;
  hideAlert('facturasAlert');

  try {
    const params = new URLSearchParams();
    if (estado) params.set('estado', estado);
    if (desde)  params.set('desde',  desde);
    if (hasta)  params.set('hasta',  hasta);

    const url = `${API}/facturas?${params}`;
    console.log(`[FETCH] GET ${url}`);
    console.log(`  Filtros:`, { estado, desde, hasta });

    const res = await authFetch(url);
    
    console.log(`[RESPONSE] Status: ${res.status}`);
    console.log(`[RESPONSE] Content-Type: ${res.headers.get('content-type')}`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[ERROR] Response:`, errorText);
      throw new Error(`Error ${res.status}: ${res.statusText}`);
    }

    const facturas = await res.json();
    console.log(`[DATA] Facturas cargadas: ${facturas.length}`);

    if (!facturas.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-light);">No se encontraron facturas</td></tr>`;
      return;
    }

    const PILL = {
      pagada:    'pill-pagada',
      pendiente: 'pill-pendiente',
      cancelada: 'pill-cancelada',
    };

    tbody.innerHTML = facturas.map(f => `
      <tr>
        <td><span style="font-family:monospace;font-size:12px;">${esc(f.numero_factura)}</span></td>
        <td>${new Date(f.fecha).toLocaleDateString('es-BO')}</td>
        <td>
          <div style="font-weight:600;">${esc(f.cliente)}</div>
          <div style="font-size:11px;color:var(--text-light);">CI: ${esc(f.ci ?? '—')}</div>
        </td>
        <td style="font-size:12px;color:var(--text-mid);">${esc(f.cita_desc ?? '—')}</td>
        <td>
          <div style="font-weight:700;">${fmt(f.total)}</div>
          ${f.descuento > 0 ? `<div style="font-size:11px;color:#16a34a;">Desc: −${fmt(f.descuento)}</div>` : ''}
        </td>
        <td>${METODO_ICO[f.metodo_pago] ?? ''} ${esc(f.metodo_pago)}</td>
        <td><span class="pill ${PILL[f.estado] ?? ''}">${f.estado}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="abrirFacturaModal(${f.id})">🔍 Ver</button>
        </td>
      </tr>`).join('');

  } catch (err) {
    console.error(`[ERROR] loadFacturas:`, err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#dc2626;">❌ Error al cargar</td></tr>`;
    showAlert('facturasAlert', `❌ ${err.message}`, 'error');
  }
}

document.getElementById('btnFiltrar')?.addEventListener('click',    loadFacturas);
document.getElementById('btnRefrescarF')?.addEventListener('click', loadFacturas);

let facturaModalId = null;

window.abrirFacturaModal = async function (facturaId) {
  facturaModalId = facturaId;
  const modal   = document.getElementById('facturaModal');
  const content = document.getElementById('facturaModalContent');
  const pagoSec = document.getElementById('facturaModalPagoSection');
  const titleEl = document.getElementById('facturaModalTitle');

  modal.classList.add('open');
  content.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-light);">⏳ Cargando...</div>`;
  pagoSec.style.display = 'none';
  hideAlert('facturaModalAlert');

  try {
    console.log(`[FETCH] GET ${API}/facturas/${facturaId}/recibo`);
    const res = await authFetch(`${API}/facturas/${facturaId}/recibo`);
    if (!res.ok) throw new Error((await res.json()).message);
    const f = await res.json();

    titleEl.textContent = `🧾 Factura ${f.numero_factura}`;

    content.innerHTML = `
      <div style="font-size:12px;color:var(--text-mid);margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>📅 Fecha</span><strong>${esc(f.fecha)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>👤 Cliente</span><strong>${esc(f.cliente)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>🪪 CI</span><strong>${esc(f.ci || '—')}</strong>
        </div>
      </div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #e5e7eb;color:var(--text-light);">
            <th style="text-align:left;padding:6px 0;">Descripción</th>
            <th style="text-align:center;">Cant</th>
            <th style="text-align:right;">P.Unit</th>
            <th style="text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${f.items.map(i => `
            <tr style="border-bottom:1px solid #f9fafb;">
              <td style="padding:6px 0;">${esc(i.descripcion)}</td>
              <td style="text-align:center;">${i.cantidad}</td>
              <td style="text-align:right;">${fmt(i.precio_unitario)}</td>
              <td style="text-align:right;font-weight:600;">${fmt(i.subtotal)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:13px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>Subtotal</span><span>${fmt(f.subtotal)}</span>
        </div>
        ${f.descuento > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#16a34a;">
          <span>Descuento</span><span>−${fmt(f.descuento)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;
                    margin-top:6px;padding-top:6px;border-top:2px solid var(--green-pale);">
          <span>TOTAL</span><span>${fmt(f.total)}</span>
        </div>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--text-light);">
        ${METODO_ICO[f.metodo_pago] ?? ''} ${esc(f.metodo_pago)}
        ${f.referencia ? ` · Ref: ${esc(f.referencia)}` : ''}
      </div>`;

    modal.dataset.recibo = JSON.stringify(f);
    if (f.estado === 'pendiente') pagoSec.style.display = '';

  } catch (err) {
    console.error(`[ERROR] abrirFacturaModal:`, err);
    content.innerHTML = `<div style="color:#dc2626;">❌ ${esc(err.message)}</div>`;
  }
};

document.querySelectorAll('.metodo-btn[data-modal-metodo]').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.metodo-btn[data-modal-metodo]').forEach(b => b.classList.remove('selected'));
    this.classList.add('selected');
    posModalMetodo = this.dataset.modalMetodo;
    document.getElementById('modalRefWrap').style.display =
      posModalMetodo !== 'efectivo' ? '' : 'none';
  });
});

document.getElementById('btnImprimirFactura')?.addEventListener('click', () => {
  try {
    mostrarComprobante(JSON.parse(document.getElementById('facturaModal').dataset.recibo || '{}'));
  } catch { window.print(); }
});

function cerrarFacturaModal() {
  document.getElementById('facturaModal').classList.remove('open');
  facturaModalId = null;
}
document.getElementById('closeFacturaModal')?.addEventListener('click', cerrarFacturaModal);
document.getElementById('facturaModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) cerrarFacturaModal();
});

// ══════════════════════════════════════════════════════════════
// TAB 3 — CIERRE DE CAJA
// ══════════════════════════════════════════════════════════════
function initCierre() {
  const input = document.getElementById('cierreFecha');
  if (input && !input.value) input.value = new Date().toISOString().slice(0, 10);
  cargarCierre(document.getElementById('cierreFecha').value);
}

async function cargarCierre(fecha) {
  if (!fecha) return;
  const tbody = document.getElementById('cierreBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-light);">⏳ Cargando...</td></tr>`;

  ['cierreTotalDia','cierreEfectivo','cierreQR','cierreTransf','cierrePendiente'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = 'Bs 0.00';
  });
  ['cierreTotalCnt','cierreEfectivoCnt','cierreQRCnt','cierreTransfCnt','cierrePendienteCnt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '0 pagos';
  });

  try {
    console.log(`[FETCH] GET ${API}/caja/resumen?fecha=${fecha}`);
    const res = await authFetch(`${API}/caja/resumen?fecha=${fecha}`);
    if (!res.ok) throw new Error((await res.json()).message);
    const data = await res.json();

    document.getElementById('cierreTotalDia').textContent  = fmt(data.total_general);
    document.getElementById('cierreTotalCnt').textContent  = `${data.cantidad_transacciones} pago${data.cantidad_transacciones !== 1 ? 's' : ''}`;
    document.getElementById('cierreEfectivo').textContent  = fmt(data.totales.efectivo ?? 0);
    document.getElementById('cierreQR').textContent        = fmt(data.totales.qr ?? 0);
    document.getElementById('cierreTransf').textContent    = fmt(data.totales.transferencia ?? 0);

    const cntM = m => data.transacciones.filter(t => t.metodo_pago === m).length;
    document.getElementById('cierreEfectivoCnt').textContent = `${cntM('efectivo')} pago${cntM('efectivo') !== 1 ? 's' : ''}`;
    document.getElementById('cierreQRCnt').textContent       = `${cntM('qr')} pago${cntM('qr') !== 1 ? 's' : ''}`;
    document.getElementById('cierreTransfCnt').textContent   = `${cntM('transferencia')} pago${cntM('transferencia') !== 1 ? 's' : ''}`;

    if (data.pendientes) {
      document.getElementById('cierrePendiente').textContent    = fmt(data.pendientes.total ?? 0);
      document.getElementById('cierrePendienteCnt').textContent =
        `${data.pendientes.cantidad ?? 0} factura${data.pendientes.cantidad !== 1 ? 's' : ''}`;
    }

    if (!data.transacciones.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-light);">Sin transacciones para el ${fecha}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.transacciones.map(t => `
      <tr>
        <td style="font-family:monospace;">${esc(t.hora)}</td>
        <td><span style="font-family:monospace;font-size:12px;">${esc(t.numero_factura)}</span></td>
        <td>
          <div style="font-weight:600;">${esc(t.cliente)}</div>
          <div style="font-size:11px;color:var(--text-light);">CI: ${esc(t.ci ?? '—')}</div>
        </td>
        <td style="font-size:12px;color:var(--text-mid);">${esc(t.cita_desc ?? '—')}</td>
        <td>${METODO_ICO[t.metodo_pago] ?? ''} ${esc(t.metodo_pago)}</td>
        <td style="font-weight:700;">${fmt(t.monto)}</td>
        <td><span class="pill pill-pagada">completado</span></td>
      </tr>`).join('');

  } catch (err) {
    console.error(`[ERROR] cargarCierre:`, err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#dc2626;">❌ ${esc(err.message)}</td></tr>`;
  }
}

document.getElementById('btnCargarCierre')?.addEventListener('click', () => {
  const f = document.getElementById('cierreFecha')?.value;
  if (f) cargarCierre(f);
});
document.getElementById('btnImprimirCierre')?.addEventListener('click', () => window.print());

// ══════════════════════════════════════════════════════════════
// MODAL COMPROBANTE
// ══════════════════════════════════════════════════════════════
function mostrarComprobante(recibo) {
  const modal   = document.getElementById('comprobanteModal');
  const content = document.getElementById('comprobanteContent');

  const itemsHTML = (recibo.items || []).map(i => `
    <div class="receipt-row">
      <span>${esc(i.descripcion)} ×${i.cantidad}</span>
      <span>${fmt(i.subtotal)}</span>
    </div>`).join('');

  const citasHTML = (recibo.citas_incluidas?.length > 1)
    ? `<div class="receipt-row" style="font-size:10px;color:#6b7280;">
         <span>Citas incluidas</span><span>#${recibo.citas_incluidas.join(', #')}</span>
       </div>`
    : '';

  content.innerHTML = `
    <div class="receipt-box">
      <div class="receipt-hdr">
        <div class="receipt-logo">🐾</div>
        <div class="receipt-title">Pet Spa</div>
        <div class="receipt-sub">Comprobante de pago</div>
        <div class="receipt-sub">${esc(recibo.fecha ?? '')}</div>
      </div>
      <div class="receipt-row"><span>Factura</span><strong>${esc(recibo.numero_factura)}</strong></div>
      <div class="receipt-row"><span>Cliente</span><span>${esc(recibo.cliente)}</span></div>
      <div class="receipt-row"><span>CI</span><span>${esc(recibo.ci || '—')}</span></div>
      ${citasHTML}
      <div class="receipt-divider"></div>
      ${itemsHTML}
      <div class="receipt-divider"></div>
      <div class="receipt-row"><span>Subtotal</span><span>${fmt(recibo.subtotal)}</span></div>
      ${recibo.descuento > 0
        ? `<div class="receipt-row" style="color:#16a34a;"><span>Descuento</span><span>−${fmt(recibo.descuento)}</span></div>` : ''}
      ${recibo.impuesto > 0
        ? `<div class="receipt-row"><span>Impuesto</span><span>${fmt(recibo.impuesto)}</span></div>` : ''}
      <div class="receipt-divider"></div>
      <div class="receipt-total-row"><span>TOTAL</span><span>${fmt(recibo.total)}</span></div>
      <div class="receipt-divider"></div>
      <div class="receipt-row">
        <span>Método</span>
        <span>${{efectivo:'💵 Efectivo',qr:'📱 QR',transferencia:'🏦 Transferencia'}[recibo.metodo_pago] ?? esc(recibo.metodo_pago)}</span>
      </div>
      ${recibo.referencia
        ? `<div class="receipt-row"><span>Referencia</span><span>${esc(recibo.referencia)}</span></div>` : ''}
      <div class="receipt-footer">¡Gracias por su preferencia! 🐾<br>Vuelva pronto con su mascota</div>
    </div>`;

  modal.classList.add('open');
}

document.getElementById('closeComprobanteModal')?.addEventListener('click', () => {
  document.getElementById('comprobanteModal').classList.remove('open');
});
document.getElementById('comprobanteModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('comprobanteModal').classList.remove('open');
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
console.log(`[INIT] Activando tab default: cobrar`);
activarTab('cobrar');