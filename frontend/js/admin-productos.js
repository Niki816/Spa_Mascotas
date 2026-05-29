import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN Y CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════

const ADMIN_API   = API_URL.replace('/auth', '/admin');
const BACKEND_URL = new URL(ADMIN_API).origin; // → http://localhost:4000

const SECTIONS = ['inicio', 'productos', 'categorias', 'alertas', 'reporte'];

// ──────────────────────────────────────────────────────────────────────────────
// Estado global de la app (agrupado y documentado)
// ──────────────────────────────────────────────────────────────────────────────
const state = {
  imagenSeleccionada:       null,   // File | null — imagen elegida para subir
  categorias:               [],     // cache de categorías
  productos:                [],     // cache de productos del listado actual
  filtros: {
    categoria:  '',
    estado:     '',
    search:     '',
    bajo_stock: false,
  },
  // Variantes del panel lateral (producto activo en la tabla)
  variantesProductoId:      null,
  variantesProductoNombre:  '',
  // Variantes del card de catálogo
  catalogoVarianteProductoId: null,
  catalogoVariantesData:      [],
  // Stock modal
  stockProductoId: null,
};

// ══════════════════════════════════════════════════════════════════════════════
// GUARD DE AUTENTICACIÓN
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS DE UI
// ══════════════════════════════════════════════════════════════════════════════

function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => { el.className = 'alert'; }, 5000);
}

function safeSetHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function safeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeStock(p) {
  if (p.agotado)    return `<span class="badge-agotado">⛔ Agotado</span>`;
  if (p.bajo_stock) return `<span class="badge-bajo">⚠️ Bajo stock</span>`;
  return `<span class="badge-ok">✅ OK</span>`;
}

/** Resuelve la URL completa de una imagen del backend */
function resolveImgUrl(url) {
  if (!url) return '';
  return url.startsWith('/') ? BACKEND_URL + url : url;
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE SKU DE PRODUCTO
// ══════════════════════════════════════════════════════════════════════════════

async function generarSKU(categoriaNombre, nombreProducto = 'NUEVO') {
  const codCat  = categoriaNombre.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'CAT';
  const codProd = nombreProducto .replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'PRD';
  const sufijo  = Date.now().toString().slice(-6);
  const skuBase = `${codCat}-${codProd}-${sufijo}`;

  try {
    const res      = await authFetch(`${ADMIN_API}/productos?search=${skuBase}`);
    const productos = await res.json();
    if (productos.some(p => p.sku === skuBase)) {
      return `${skuBase}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }
  } catch (err) {
    console.warn('[SKU] No se pudo verificar unicidad:', err.message);
  }

  return skuBase;
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERACIÓN DE SKU DE VARIANTE (NUEVA LÓGICA)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Genera un SKU de variante con el formato:
 *   [ABRV-ATRIBUTO]-[ABRV-VALOR]-[CONTADOR]
 * donde ABRV-ATRIBUTO son las 3 primeras letras del atributo (ej. Dog Chow → DOG),
 * y ABRV-VALOR se extrae del valor: primero el número/unidad (1kg → 1K) y luego
 * la primera palabra descriptiva (Carne → CAR). Si hay más características, se
 * concatenan separadas por guión. Al final se añade un contador para evitar colisiones.
 */
async function generarSKUVariante(skuProducto, atributo, valor) {
  // 1. Abreviatura del atributo (marca) → primeras 3 letras sin espacios
  const attrAbr = atributo
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase() || 'ATR';

  // 2. Parsear el valor para extraer cantidad/unidad y descripción
  // Buscar un número seguido opcionalmente de "kg", "g", "ml", etc. y luego palabras separadas.
  const valorPartes = valor.split(/[\s,]+/); // separar por espacio o coma
  let numero = '';
  let unidad = '';
  const descripciones = [];
  for (const parte of valorPartes) {
    const match = parte.match(/^(\d+)(kg|g|ml|l|unid)?$/i);
    if (match) {
      numero = match[1];
      unidad = (match[2] || '').toUpperCase().replace('KG','K').replace('ML','ML').replace('L','L').replace('UNID','U');
    } else {
      // tomar primera palabra significativa (más de 2 letras)
      const limpio = parte.replace(/[^A-Za-z]/g, '');
      if (limpio.length > 2) descripciones.push(limpio);
    }
  }

  // Armar la parte del valor: [numero][unidad] + descripciones (una o más)
  const valorAbr = (numero + unidad) +
    (descripciones.length ? '-' + descripciones.map(w => w.slice(0,3).toUpperCase()).join('-') : '');

  // 3. Base del SKU
  const base = `${attrAbr}-${valorAbr}`.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase();

  // 4. Obtener todas las variantes existentes de este producto para calcular el contador
  let contador = 1;
  try {
    const prodId = state.variantesProductoId || state.catalogoVarianteProductoId;
    if (prodId) {
      const res = await authFetch(`${ADMIN_API}/productos/${prodId}/variantes`);
      const variantes = await res.json();
      const regex = new RegExp(`^${base}-(\\d+)$`, 'i');
      let max = 0;
      variantes.forEach(v => {
        const m = v.sku_variante.match(regex);
        if (m) {
          const n = parseInt(m[1]);
          if (n > max) max = n;
        }
      });
      contador = max + 1;
    }
  } catch (err) {
    console.warn('[SKU Var] No se pudo verificar contador:', err.message);
    contador = Math.floor(Math.random() * 1000) + 1; // fallback
  }

  return `${base}-${String(contador).padStart(3, '0')}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN DEL STOCK DEL PRODUCTO CON SUS VARIANTES
// ══════════════════════════════════════════════════════════════════════════════

async function syncProductStockFromVariants(productoId) {
  try {
    // Obtener variantes activas del producto
    const res = await authFetch(`${ADMIN_API}/productos/${productoId}/variantes`);
    const variantes = await res.json();

    // Sumar stocks de variantes activas
    const totalStock = variantes
      .filter(v => v.estado_activo)
      .reduce((sum, v) => sum + (v.stock || 0), 0);

    // Actualizar el stock del producto con el total calculado
    await authFetch(`${ADMIN_API}/productos/${productoId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({
        cantidad: totalStock,
        operacion: 'ajustar',
        motivo: 'Sincronización automática con variantes'
      })
    });

    // Refrescar la lista de productos para reflejar el nuevo stock
    await loadProductos();
  } catch (err) {
    console.error('[Sync Stock] Error:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NAVEGACIÓN ENTRE SECCIONES
// ══════════════════════════════════════════════════════════════════════════════

function showSection(sec) {
  SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === sec ? 'block' : 'none';
  });

  document.querySelectorAll('.nav-item[data-section]').forEach(l =>
    l.classList.toggle('active', l.dataset.section === sec)
  );

  const loaders = {
    inicio:     loadOverview,
    productos:  () => { loadProductos(); loadVariantesCatalogo(); },
    categorias: loadCategorias,
    alertas:    loadAlertas,
    reporte:    loadReporte,
  };
  loaders[sec]?.();
}

document.querySelectorAll('.nav-item[data-section]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); showSection(link.dataset.section); });
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════════════════════

function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}

document.getElementById('logoutBtn') ?.addEventListener('click',  e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2')?.addEventListener('click', doLogout);

// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN: OVERVIEW / INICIO
// ══════════════════════════════════════════════════════════════════════════════

async function loadOverview() {
  try {
    const [alertasRes, productosRes, categoriasRes, vendidosRes, usadosRes] = await Promise.all([
      authFetch(`${ADMIN_API}/productos/alertas`),
      authFetch(`${ADMIN_API}/productos`),
      authFetch(`${ADMIN_API}/categorias`),
      authFetch(`${ADMIN_API}/productos/mas-vendidos`),
      authFetch(`${ADMIN_API}/productos/mas-usados`),
    ]);

    const alertas    = await alertasRes.json();
    const productos  = await productosRes.json();
    const categorias = await categoriasRes.json();
    const masVendidos = await vendidosRes.json();
    const masUsados  = await usadosRes.json();

    const activos = productos.filter(p => p.estado_activo);
    const valor   = activos.reduce((s, p) => s + p.precio_base * p.stock, 0);

    safeText('statTotalProductos', productos.length);
    safeText('statActivos',        activos.length);
    safeText('statCategorias',     categorias.length);
    safeText('statValorInv',       `Bs ${valor.toFixed(2)}`);
    safeText('statAgotados',       alertas.resumen.agotados);
    safeText('statBajoStock',      alertas.resumen.bajo_stock);

    // ── Tabla urgentes ────────────────────────────────────────
    const tbody = document.getElementById('alertasUrgentesList');
    if (tbody) {
      const urgentes = [...alertas.agotados, ...alertas.bajo_stock].slice(0, 8);
      tbody.innerHTML = urgentes.length
        ? urgentes.map(p => `
            <tr>
              <td>${escapeHtml(p.nombre)}</td>
              <td><code>${escapeHtml(p.sku)}</code></td>
              <td>${escapeHtml(p.categoria)}</td>
              <td style="text-align:center;">
                ${p.stock === 0
                  ? '<span class="badge-agotado">⛔ 0</span>'
                  : `<span class="badge-bajo">⚠️ ${p.stock}</span>`}
              </td>
              <td>${p.stock_minimo}</td>
            </tr>`).join('')
        : '<tr><td colspan="5" style="text-align:center;color:#8aab97;padding:16px;">✅ Sin alertas urgentes</td></tr>';
    }
    const tvendidos = document.getElementById('topVendidosBody');
    if (tvendidos) {
      tvendidos.innerHTML = masVendidos.length
        ? masVendidos.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${escapeHtml(p.nombre)}</strong></td>
              <td style="text-align:center;">${p.total_vendido}</td>
              <td style="text-align:right;">Bs ${Number(p.ingreso).toFixed(2)}</td>
            </tr>`).join('')
        : '<tr><td colspan="4" style="text-align:center;color:var(--text-light);">Sin ventas en los últimos 30 días</td></tr>';
    }
     const tusados = document.getElementById('topUsadosBody');
    if (tusados) {
      tusados.innerHTML = masUsados.length
        ? masUsados.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${escapeHtml(p.nombre)}</strong></td>
              <td style="text-align:center;">${Number(p.total_consumido).toFixed(2)} L / unid.</td>
              <td style="text-align:center;">${p.stock_actual}</td>
              <td>${p.riesgo
                    ? '<span class="badge-bajo">⚠️ Bajo</span>'
                    : '<span class="badge-ok">✅ OK</span>'}</td>
            </tr>`).join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--text-light);">Sin consumo registrado</td></tr>';
    }
  } catch (err) {
    console.error('[Overview] Error:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN: CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════

async function loadCategorias() {
  const tbody = document.getElementById('categoriasTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;">⏳ Cargando...</td></tr>';

  try {
    const res = await authFetch(`${ADMIN_API}/categorias`);
    state.categorias = await res.json();

    if (!state.categorias.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:#8aab97;">Sin categorías. ¡Crea la primera!</td></tr>';
      return;
    }

    tbody.innerHTML = state.categorias.map(c => `
      <tr>
        <td>${c.id}</td>
        <td><strong>${escapeHtml(c.nombre)}</strong></td>
        <td style="font-size:12px;color:var(--text-mid);">
          ${c.padre_nombre
            ? `↳ ${escapeHtml(c.padre_nombre)}`
            : '<span style="color:var(--text-light);">—</span>'}
        </td>
        <td style="text-align:center;">${c.total_productos}</td>
        <td style="display:flex;gap:5px;">
          <button class="btn btn-outline btn-sm" data-action="editar"   data-id="${c.id}">✏️ Editar</button>
          ${c.total_productos === 0
            ? `<button class="btn btn-danger btn-sm" data-action="eliminar" data-id="${c.id}">🗑️ Eliminar</button>`
            : `<span style="font-size:11px;color:var(--text-light);align-self:center;">Con productos</span>`}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      const id = parseInt(btn.dataset.id);
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'editar')   openCategoriaModal(id);
        if (btn.dataset.action === 'eliminar') deleteCategoria(id);
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:#dc2626;padding:14px;">❌ ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function openCategoriaModal(id = null) {
  const modal = document.getElementById('categoriaModal');
  document.getElementById('categoriaForm').reset();
  document.getElementById('categoriaId').value = '';
  document.getElementById('categoriaModalAlert').className = 'alert';

  const padreSelect = document.getElementById('categoriaPadre');
  padreSelect.innerHTML = '<option value="">— Sin padre (raíz) —</option>'
    + state.categorias
        .filter(c => c.id !== id)
        .map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`)
        .join('');

  if (id) {
    const cat = state.categorias.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('categoriaModalTitle').textContent = '✏️ Editar Categoría';
    document.getElementById('categoriaId').value           = cat.id;
    document.getElementById('categoriaNombre').value       = cat.nombre;
    document.getElementById('categoriaDescripcion').value  = cat.descripcion || '';
    if (cat.padre_id) padreSelect.value = cat.padre_id;
  } else {
    document.getElementById('categoriaModalTitle').textContent = '➕ Nueva Categoría';
  }

  modal.classList.add('open');
}

function closeCategoriaModal() {
  document.getElementById('categoriaModal')?.classList.remove('open');
}

document.getElementById('closeCategoriaModalBtn')?.addEventListener('click', closeCategoriaModal);
document.getElementById('categoriaModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCategoriaModal();
});

document.getElementById('categoriaForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('categoriaId').value;
  const payload = {
    nombre:      document.getElementById('categoriaNombre').value.trim(),
    descripcion: document.getElementById('categoriaDescripcion').value.trim() || null,
    padre_id:    document.getElementById('categoriaPadre').value || null,
  };

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const url    = id ? `${ADMIN_API}/categorias/${id}` : `${ADMIN_API}/categorias`;
    const method = id ? 'PUT' : 'POST';
    const res    = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data   = await res.json();
    if (!res.ok) throw new Error(data.message);

    showAlert('categoriaModalAlert', `✅ ${data.message}`, 'success');
    setTimeout(() => { closeCategoriaModal(); loadCategorias(); loadOverview(); }, 1000);
  } catch (err) {
    showAlert('categoriaModalAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar';
  }
});

async function deleteCategoria(id) {
  if (!confirm('¿Eliminar esta categoría? Solo es posible si no tiene productos.')) return;
  try {
    const res = await authFetch(`${ADMIN_API}/categorias/${id}`, { method: 'DELETE' });
    if (res.status !== 204) throw new Error((await res.json()).message);
    showAlert('categoriasMessage', '✅ Categoría eliminada', 'success');
    loadCategorias();
    loadOverview();
  } catch (err) {
    showAlert('categoriasMessage', `❌ ${err.message}`, 'error');
  }
}

document.getElementById('btnNuevaCategoría')?.addEventListener('click', () => openCategoriaModal());

// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN: PRODUCTOS – listado y filtros
// ══════════════════════════════════════════════════════════════════════════════

async function loadProductos() {
  const tbody = document.getElementById('productosTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;">⏳ Cargando...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (state.filtros.categoria)  params.set('categoria_id', state.filtros.categoria);
    if (state.filtros.estado)     params.set('estado',       state.filtros.estado);
    if (state.filtros.search)     params.set('search',       state.filtros.search);
    if (state.filtros.bajo_stock) params.set('bajo_stock',   'true');

    const res = await authFetch(`${ADMIN_API}/productos?${params}`);
    state.productos = await res.json();

    if (!state.productos.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#8aab97;">Sin productos para mostrar</td></tr>';
    } else {
      tbody.innerHTML = state.productos.map(p => `
        <tr style="${!p.estado_activo ? 'opacity:.65;' : ''}">
          <td style="font-weight:600;color:var(--text-mid);">${p.id}</td>
          <td>
            ${p.imagen_url
              ? `<img src="${escapeHtml(resolveImgUrl(p.imagen_url))}" width="36" height="36"
                      style="object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:6px;">`
              : ''}
            <strong>${escapeHtml(p.nombre)}</strong>
            <div style="font-size:11px;color:var(--text-light);"><code>${escapeHtml(p.sku)}</code></div>
          </td>
          <td style="font-size:12px;">${escapeHtml(p.categoria?.nombre ?? '—')}</td>
          <td><strong>Bs ${Number(p.precio_base).toFixed(2)}</strong></td>
          <td style="text-align:center;">
            ${badgeStock(p)}
            <div style="font-size:13px;font-weight:600;">${p.stock}</div>
            <div style="font-size:10px;color:var(--text-light);">mín: ${p.stock_minimo}</div>
          </td>
          <td style="text-align:center;">
            <span style="background:#f0f5f2;padding:2px 8px;border-radius:8px;font-size:12px;">${p.variantes_count}</span>
          </td>
          <td>${p.estado_activo
                ? '<span class="badge-ok">Activo</span>'
                : '<span class="badge-agotado">Inactivo</span>'}</td>
          <td style="display:flex;gap:4px;flex-wrap:wrap;">
            ${p.estado_activo ? `
              <!-- PRODUCTO ACTIVO: mostrar opciones normales -->
              <button class="btn btn-outline btn-sm" data-action="editar"      data-id="${p.id}">✏️</button>
              <button class="btn btn-outline btn-sm" data-action="stock"       data-id="${p.id}">📦</button>
              <button class="btn btn-outline btn-sm" data-action="variantes"   data-id="${p.id}">🔀</button>
              <button class="btn btn-danger btn-sm"  data-action="desactivar" data-id="${p.id}">🚫</button>
            ` : `
              <!-- PRODUCTO INACTIVO: mostrar opciones de reactivar y eliminar -->
              <button class="btn btn-outline btn-sm" data-action="reactivar"  data-id="${p.id}">♻️ Reactivar</button>
              <button class="btn btn-danger btn-sm"  data-action="eliminar-permanente" data-id="${p.id}">🗑️ Eliminar</button>
            `}
          </td>
        </tr>`).join('');

      tbody.querySelectorAll('button[data-action]').forEach(btn => {
        const id = parseInt(btn.dataset.id);
        const actions = {
          editar:                () => openProductoModal(id),
          stock:                 () => openStockModal(id),
          variantes:             () => openVariantesPanel(id),
          desactivar:            () => toggleProductoEstado(id, false),
          reactivar:             () => toggleProductoEstado(id, true),
          'eliminar-permanente': () => deleteProductoPermanent(id),  // ← NUEVA ACCIÓN
        };
        btn.addEventListener('click', () => actions[btn.dataset.action]?.());
      });
    }
    // Banner de alertas inline
    try {
      const alertRes  = await authFetch(`${ADMIN_API}/productos/alertas`);
      const alertas   = await alertRes.json();
      const alertDiv  = document.getElementById('catalogoAlertas');
      if (alertDiv) {
        const msgs = [
          ...alertas.agotados.map(p  => `⛔ ${p.nombre} AGOTADO`),
          ...alertas.bajo_stock.map(p => `⚠️ ${p.nombre} bajo (${p.stock}/${p.stock_minimo})`),
        ];
        alertDiv.innerHTML = msgs.length
          ? `<div class="alert alert-error show" style="margin-bottom:12px;">
               🚨 ${msgs.join(' · ')} —
               <a href="#" onclick="showSection('alertas');return false;">Ver todas</a>
             </div>`
          : '';
      }
    } catch (_) { /* banner de alertas es opcional */ }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#dc2626;padding:14px;">❌ ${escapeHtml(err.message)}</td></tr>`;
  }
}

// ── Filtros de la tabla de productos ─────────────────────────
document.getElementById('filtroCategoriaProducto')?.addEventListener('change', e => {
  state.filtros.categoria = e.target.value;
  loadProductos();
});
document.getElementById('filtroEstadoProducto')?.addEventListener('change', e => {
  state.filtros.estado = e.target.value;
  loadProductos();
});
document.getElementById('filtroBajoStock')?.addEventListener('change', e => {
  state.filtros.bajo_stock = e.target.checked;
  loadProductos();
});

const buscarInput = document.getElementById('buscarProductoInput');
document.getElementById('buscarProductoBtn')?.addEventListener('click', () => {
  state.filtros.search = buscarInput?.value.trim() ?? '';
  loadProductos();
});
buscarInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { state.filtros.search = e.target.value.trim(); loadProductos(); }
});
document.getElementById('btnRefrescarProductos')?.addEventListener('click', loadProductos);
document.getElementById('btnNuevoProducto')      ?.addEventListener('click', () => openProductoModal());


// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CREAR / EDITAR PRODUCTO
// ══════════════════════════════════════════════════════════════════════════════

async function openProductoModal(id = null) {
  const modal = document.getElementById('productoModal');

  // Reset
  state.imagenSeleccionada = null;
  document.getElementById('productoForm').reset();
  document.getElementById('productoId').value = '';
  document.getElementById('productoAlert').className = 'alert';
  const imgPreview = document.getElementById('imgPreview');
  if (imgPreview) imgPreview.style.display = 'none';
  const fileInput = document.getElementById('productoImagenFile');
  if (fileInput) fileInput.value = '';
  const urlInput = document.getElementById('productoImagenUrl');
  if (urlInput) urlInput.value = '';

  // ✅ Reset del toggle de variantes (siempre al abrir)
  const noVariantesRadio = document.getElementById('noVariantes');
  if (noVariantesRadio) {
    noVariantesRadio.checked = true;
    actualizarVistaStock();
  }

  // Asegurar categorías cargadas
  if (!state.categorias.length) await loadCategorias();
  const catSelect = document.getElementById('productoCategoria');
  catSelect.innerHTML = '<option value="">— Seleccionar categoría —</option>'
    + state.categorias.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');

  if (id) {
    document.getElementById('productoModalTitle').textContent = `✏️ Editar Producto #${id}`;
    try {
      const res = await authFetch(`${ADMIN_API}/productos/${id}`);
      if (!res.ok) throw new Error((await res.json()).message);
      const p = await res.json();

      document.getElementById('productoId').value          = p.id;
      document.getElementById('productoNombre').value      = p.nombre;
      document.getElementById('productoDescripcion').value = p.descripcion || '';
      document.getElementById('productoCategoria').value   = p.categoria_id;
      document.getElementById('productoSKU').value         = p.sku;
      document.getElementById('productoPrecio').value      = p.precio_base;
      document.getElementById('productoStockMin').value    = p.stock_minimo;
      document.getElementById('productoEstado').value      = String(p.estado_activo);
      if (urlInput) urlInput.value = p.imagen_url || '';

      if (p.imagen_url && imgPreview) {
        imgPreview.src = resolveImgUrl(p.imagen_url);
        imgPreview.style.display = 'block';
      }

      const stockInputGroup = document.getElementById('stockInicialGroup');
      const productoStockInicial = document.getElementById('productoStockInicial');
      
      if (p.variantes_count > 0) {
        // Tiene variantes: ocultar y desactivar stock
        stockInputGroup.style.display = 'none';
        if (productoStockInicial) productoStockInicial.disabled = true;
      } else {
        // Sin variantes: mostrar y permitir editar
        stockInputGroup.style.display = 'block';
        if (productoStockInicial) {
          productoStockInicial.disabled = false;
          productoStockInicial.value = p.stock; // ← Llenar con stock actual
        }
      }
      // Si ya tiene variantes, marcar "Sí tendrá variantes"
      if (p.variantes_count > 0) {
        const siVariantesRadio = document.getElementById('siVariantes');
        if (siVariantesRadio) {
          siVariantesRadio.checked = true;
          actualizarVistaStock();
        }
      }

    } catch (err) {
      alert(`Error cargando producto: ${err.message}`);
      return;
    }
  } else {
    document.getElementById('productoModalTitle').textContent = '➕ Nuevo Producto';
  }

  modal.classList.add('open');
}

function closeProductoModal() {
  document.getElementById('productoModal')?.classList.remove('open');
}

document.getElementById('closeProductoModalBtn')?.addEventListener('click', closeProductoModal);
// ── Toggle stock/variantes en el modal ───────────────────────
function actualizarVistaStock() {
  const tieneVariantes = document.querySelector('input[name="tieneVariantes"]:checked')?.value === 'si';
  const stockGroup  = document.getElementById('stockInicialGroup');
  const aviso       = document.getElementById('stockVariantesAviso');
  if (stockGroup) stockGroup.style.display  = tieneVariantes ? 'none' : 'block';
  if (aviso)      aviso.style.display       = tieneVariantes ? 'block' : 'none';
}

document.querySelectorAll('input[name="tieneVariantes"]').forEach(radio => {
  radio.addEventListener('change', actualizarVistaStock);
});
document.getElementById('productoModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeProductoModal();
});

// ── Preview de imagen al seleccionar archivo ──────────────────
document.getElementById('productoImagenFile')?.addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  state.imagenSeleccionada = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('imgPreview');
    if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
});

// ── Auto-generación de SKU al cambiar categoría o nombre ──────
// Un solo handler delegado que atiende ambos cambios (evita doble listener)
async function onProductoFieldChange() {
  const productoId = document.getElementById('productoId').value;
  if (productoId) return; // Solo para productos nuevos

  const catId = document.getElementById('productoCategoria').value;
  if (!catId) return;

  const catNombre   = document.querySelector(`#productoCategoria option[value="${catId}"]`)?.textContent ?? 'CAT';
  const prodNombre  = document.getElementById('productoNombre').value || 'NUEVO';
  const sku = await generarSKU(catNombre, prodNombre);
  document.getElementById('productoSKU').value = sku;
}

document.getElementById('productoCategoria')?.addEventListener('change', onProductoFieldChange);
document.getElementById('productoNombre')    ?.addEventListener('change', onProductoFieldChange);

// ── Submit del formulario de producto ────────────────────────
document.getElementById('productoForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('productoId').value;
  
  // Subir imagen si se seleccionó un archivo local
  let imagenUrl = document.getElementById('productoImagenUrl')?.value || null;
  if (state.imagenSeleccionada) {
    try {
      const formData = new FormData();
      formData.append('imagen', state.imagenSeleccionada);
      const uploadRes = await fetch(`${ADMIN_API}/productos/imagen`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body:    formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.message || 'Error al subir imagen');
      imagenUrl = BACKEND_URL + uploadData.url;
      document.getElementById('productoImagenUrl').value = imagenUrl;
    } catch (err) {
      showAlert('productoAlert', `❌ Error al subir imagen: ${err.message}`, 'error');
      return;
    }
  }

  const payload = {
    nombre:        document.getElementById('productoNombre').value.trim(),
    descripcion:   document.getElementById('productoDescripcion').value.trim() || null,
    categoria_id:  parseInt(document.getElementById('productoCategoria').value),
    sku:           document.getElementById('productoSKU').value.trim(),
    precio_base:   parseFloat(document.getElementById('productoPrecio').value),
    stock_minimo:  parseInt(document.getElementById('productoStockMin').value),
    imagen_url:    imagenUrl,
    estado_activo: document.getElementById('productoEstado').value === 'true',
  };

  // ✅ SIEMPRE INCLUIR STOCK (sea creación o edición)
  const productoStockInicial = document.getElementById('productoStockInicial');
  if (productoStockInicial) {
    payload.stock = parseInt(productoStockInicial.value) || 0;
  }

  console.log('Payload final con STOCK:', payload);

  if (!payload.nombre || !payload.categoria_id || !payload.sku || isNaN(payload.precio_base)) {
    return showAlert('productoAlert', '⚠️ Completa todos los campos obligatorios', 'error');
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const url    = id ? `${ADMIN_API}/productos/${id}` : `${ADMIN_API}/productos`;
    const method = id ? 'PUT' : 'POST';
    
    console.log('URL:', url, '| Método:', method);
    console.log('Stock a guardar:', payload.stock);

    const res    = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data   = await res.json();
    
    console.log('Respuesta:', { status: res.status, data });

    if (!res.ok) throw new Error(data.message);

    showAlert('productoAlert', `✅ ${data.message}`, 'success');
    setTimeout(() => { closeProductoModal(); loadProductos(); loadOverview(); }, 1000);
  } catch (err) {
    console.error('Error:', err);
    showAlert('productoAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar producto';
    state.imagenSeleccionada = null;
  }
});

async function toggleProductoEstado(id, activar) {
  if (!confirm(activar ? '¿Reactivar este producto?' : '¿Desactivar este producto?')) return;
  try {
    const res = await authFetch(`${ADMIN_API}/productos/${id}`, {
      method: activar ? 'PUT' : 'DELETE',
      body:   activar ? JSON.stringify({ estado_activo: true }) : undefined,
    });
    if (!activar && res.status === 204) {
      showAlert('productosMessage', '✅ Producto desactivado', 'success');
    } else if (activar) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showAlert('productosMessage', '✅ Producto reactivado', 'success');
    }
    loadProductos();
    loadOverview();
  } catch (err) {
    showAlert('productosMessage', `❌ ${err.message}`, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: AJUSTAR STOCK
// ══════════════════════════════════════════════════════════════════════════════

function openStockModal(id) {
  state.stockProductoId = id;
  const p = state.productos.find(p => p.id === id);
  if (!p) return;

  safeText('stockModalTitle',   `📦 Ajustar Stock — ${p.nombre}`);
  safeText('stockActualDisplay', p.stock);
  safeText('stockMinimoDisplay', p.stock_minimo);

  const cantInput  = document.getElementById('stockCantidad');
  const opSelect   = document.getElementById('stockOperacion');
  const motivoInput = document.getElementById('stockMotivo');
  const alertEl    = document.getElementById('stockAlert');

  if (cantInput)   cantInput.value   = '';
  if (opSelect)    opSelect.value    = 'agregar';
  if (motivoInput) motivoInput.value = '';
  if (alertEl)     alertEl.className = 'alert';

  document.getElementById('stockModal')?.classList.add('open');
}

function closeStockModal() {
  document.getElementById('stockModal')?.classList.remove('open');
}

document.getElementById('closeStockModalBtn')?.addEventListener('click', closeStockModal);
document.getElementById('stockModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeStockModal();
});

document.getElementById('formAjustarStock')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!state.stockProductoId) return;

  const payload = {
    cantidad:  parseInt(document.getElementById('stockCantidad')?.value),
    operacion: document.getElementById('stockOperacion')?.value,
    motivo:    document.getElementById('stockMotivo')?.value?.trim() || null,
  };

  if (isNaN(payload.cantidad) || payload.cantidad <= 0) {
    return showAlert('stockAlert', '⚠️ La cantidad debe ser un número positivo', 'error');
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Actualizando...';

  try {
    const res  = await authFetch(`${ADMIN_API}/productos/${state.stockProductoId}/stock`, {
      method: 'PATCH',
      body:   JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    const alertaMsg = data.agotado    ? ' — ⛔ ¡Producto AGOTADO!'
                    : data.alerta_bajo ? ' — ⚠️ Stock bajo mínimo'
                    : '';
    const tipo = (data.agotado || data.alerta_bajo) ? 'error' : 'success';
    showAlert('stockAlert', `✅ ${data.message}${alertaMsg}`, tipo);
    safeText('stockActualDisplay', data.stock_nuevo);
    setTimeout(() => { closeStockModal(); loadProductos(); loadOverview(); }, 1400);
  } catch (err) {
    showAlert('stockAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Actualizar stock';
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PANEL LATERAL: VARIANTES DE UN PRODUCTO
// ══════════════════════════════════════════════════════════════════════════════

async function openVariantesPanel(productoId) {
  state.variantesProductoId     = productoId;
  const p = state.productos.find(p => p.id === productoId);
  state.variantesProductoNombre = p?.nombre ?? `#${productoId}`;

  safeText('variantesPanelTitle', `🔀 Variantes — ${state.variantesProductoNombre}`);

  const precioBaseEl = document.getElementById('variantesPrecioBase');
  if (precioBaseEl) precioBaseEl.textContent = `Precio base: Bs ${p?.precio_base?.toFixed(2) ?? '—'}`;

  const alertEl = document.getElementById('variantesAlert');
  if (alertEl) alertEl.className = 'alert';

  document.getElementById('variantesPanel')?.classList.add('open');

  // Limpiar filas del formulario batch y dejar una vacía
  const rowsContainer = document.getElementById('varianteRows');
  if (rowsContainer) rowsContainer.innerHTML = '';
  addVarianteRow();

  await loadVariantes();
}

function closeVariantesPanel() {
  document.getElementById('variantesPanel')?.classList.remove('open');
}

document.getElementById('closeVariantesPanelBtn')?.addEventListener('click', closeVariantesPanel);

async function loadVariantes() {
  const container = document.getElementById('variantesList');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">⏳ Cargando...</div>';

  try {
    const res      = await authFetch(`${ADMIN_API}/productos/${state.variantesProductoId}/variantes`);
    const variantes = await res.json();

    if (!variantes.length) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">Sin variantes. Agrega la primera.</div>';
      return;
    }

    container.innerHTML = variantes.map(v => `
      <div class="variante-card ${!v.estado_activo ? 'variante-inactiva' : ''}">
        <div class="variante-info">
          <div class="variante-atributo">${escapeHtml(v.atributo)}: <strong>${escapeHtml(v.valor)}</strong></div>
          <div class="variante-sku"><code>${escapeHtml(v.sku_variante)}</code></div>
          <div class="variante-precio">
            +Bs ${Number(v.precio_extra).toFixed(2)} &nbsp;·&nbsp;
            <strong>Total: Bs ${Number(v.precio_final).toFixed(2)}</strong>
          </div>
          <div class="variante-stock">
            Stock: <strong>${v.stock}</strong>
            ${v.stock <= 3 ? '<span class="badge-bajo" style="font-size:10px;margin-left:4px;">⚠️ Bajo</span>' : ''}
          </div>
          ${v.cantidad ? `<div class="variante-stock" style="font-size:11px; color:var(--text-mid);">
            Contenido: ${v.cantidad} ${v.unidad_medida || 'unid.'}
            ${v.cantidad_actual > 0 ? ` · Restante: ${v.cantidad_actual} ${v.unidad_medida || ''}` : ''}
          </div>` : ''}
        </div>
        <div class="variante-actions">
          <button class="btn btn-outline btn-sm" data-action="editar"   data-id="${v.id}">✏️</button>
          <button class="btn btn-danger btn-sm"  data-action="eliminar" data-id="${v.id}">🗑️</button>
        </div>
      </div>`).join('');

    container.querySelectorAll('button[data-action]').forEach(btn => {
      const id = parseInt(btn.dataset.id);
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'editar')   openVarianteModal(id);
        if (btn.dataset.action === 'eliminar') deleteVariante(id);
      });
    });
  } catch (err) {
    container.innerHTML = `<div style="color:#dc2626;padding:14px;">❌ ${escapeHtml(err.message)}</div>`;
  }
}

// ── Formulario batch de variantes ────────────────────────────

function createVarianteRow(containerId, removeBtnClass) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'form-row variante-row';
  row.style.marginBottom = '8px';
  row.innerHTML = `
  <input type="text"   class="form-input" placeholder="Atributo" data-var="atributo" required>
  <input type="text"   class="form-input" placeholder="Valor"     data-var="valor"    required>
  <input type="text"   class="form-input" placeholder="SKU"       data-var="sku"      required>
  <input type="number" class="form-input" placeholder="Precio extra" step="0.01" data-var="precio" value="0">
  <input type="number" class="form-input" placeholder="Stock"     min="0" data-var="stock" value="0">
  <input type="number" class="form-input" placeholder="Cantidad (1, 5…)" step="0.01" min="0.01" data-var="cantidad">
  <input type="text"   class="form-input" placeholder="Unidad (L, kg…)" data-var="unidad">
  <button type="button" class="btn btn-danger btn-sm ${removeBtnClass}">✕</button>
`;

  // ── Autocompletado del SKU con el nuevo generador ──
  const attrInput = row.querySelector('[data-var="atributo"]');
  const valInput  = row.querySelector('[data-var="valor"]');
  const skuInput  = row.querySelector('[data-var="sku"]');

  async function actualizarSKU() {
    const atributo = attrInput.value.trim();
    const valor    = valInput.value.trim();
    if (!atributo || !valor) return;

    // Determinar el producto padre según contexto
    let prodId = state.variantesProductoId;
    if (containerId === 'varianteCatalogoRows') {
      prodId = state.catalogoVarianteProductoId;
    }
    const prod = state.productos.find(p => p.id === prodId);
    const skuProducto = prod ? prod.sku : 'PROD';

    skuInput.value = await generarSKUVariante(skuProducto, atributo, valor);
  }

  attrInput.addEventListener('input', actualizarSKU);
  valInput.addEventListener('input', actualizarSKU);

  row.querySelector(`.${removeBtnClass}`).addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function addVarianteRow()         { createVarianteRow('varianteRows',         'remove-var-row'); }
function addVarianteCatalogoRow() { createVarianteRow('varianteCatalogoRows', 'remove-var-row-cat'); }

document.getElementById('btnAddVarianteRow')        ?.addEventListener('click', addVarianteRow);
document.getElementById('btnAddVarianteCatalogoRow')?.addEventListener('click', addVarianteCatalogoRow);

function collectVarianteRows(selector) {
  const rows = document.querySelectorAll(selector);
  const result = [];
  rows.forEach(row => {
    const get = k => row.querySelector(`[data-var="${k}"]`)?.value.trim();
    const atributo = get('atributo');
    const valor    = get('valor');
    const sku      = get('sku');
    if (!atributo || !valor || !sku) return;
    result.push({
      atributo,
      valor,
      sku_variante: sku,
      precio_extra: parseFloat(get('precio')) || 0,
      stock: parseInt(get('stock')) || 0,
      cantidad: parseFloat(get('cantidad')) || null,
      unidad_medida: get('unidad') || null,
    });
  });
  return result;
}

document.getElementById('btnSaveVariantesBatch')?.addEventListener('click', async () => {
  const payload = collectVarianteRows('.variante-row');
  if (!payload.length) {
    return showAlert('variantesAlert', '⚠️ Agrega al menos una variante completa', 'error');
  }
  try {
    const res  = await authFetch(`${ADMIN_API}/productos/${state.variantesProductoId}/variantes/batch`, {
      method: 'POST',
      body:   JSON.stringify({ variantes: payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('variantesAlert', `✅ ${data.message}`, 'success');
    document.getElementById('varianteRows').innerHTML = '';
    addVarianteRow();
    await loadVariantes();
    // Sincronizar stock del producto con sus variantes
    await syncProductStockFromVariants(state.variantesProductoId);
  } catch (err) {
    showAlert('variantesAlert', `❌ ${err.message}`, 'error');
  }
});

document.getElementById('btnNuevaVariante')?.addEventListener('click', () => openVarianteModal(null));

// ══════════════════════════════════════════════════════════════════════════════
// MODAL: CREAR / EDITAR VARIANTE INDIVIDUAL
// ══════════════════════════════════════════════════════════════════════════════

async function openVarianteModal(varianteId = null, productoId = null) {
  const pid = productoId ?? state.variantesProductoId;

  const modal = document.getElementById('varianteModal');
  document.getElementById('varianteForm').reset();
  document.getElementById('varianteId').value = '';
  document.getElementById('varianteAlert').className = 'alert';
  document.getElementById('varianteForm').dataset.productoId = pid;
  if (varianteId) {
    document.getElementById('varianteModalTitle').textContent = '✏️ Editar Variante';
    try {
      const res      = await authFetch(`${ADMIN_API}/productos/${pid}/variantes`);
      const variantes = await res.json();
      const v        = variantes.find(x => x.id === varianteId);
      if (!v) return;

      document.getElementById('varianteId').value          = v.id;
      document.getElementById('varianteAtributo').value    = v.atributo;
      document.getElementById('varianteValor').value       = v.valor;
      document.getElementById('varianteSKU').value         = v.sku_variante;
      document.getElementById('variantePrecioExtra').value = v.precio_extra;
      document.getElementById('varianteStock').value       = v.stock;
      document.getElementById('varianteEstado').value      = String(v.estado_activo);
      document.getElementById('varianteCantidad').value     = v.cantidad ?? '';
      document.getElementById('varianteUnidad').value       = v.unidad_medida ?? '';
    } catch (err) {
      alert(`Error: ${err.message}`);
      return;
    }
  } else {
    document.getElementById('varianteModalTitle').textContent = '➕ Nueva Variante';
  }

  modal.classList.add('open');
}

function closeVarianteModal() {
  document.getElementById('varianteModal')?.classList.remove('open');
}

document.getElementById('closeVarianteModalBtn')?.addEventListener('click', closeVarianteModal);
document.getElementById('varianteModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeVarianteModal();
});

document.getElementById('varianteForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id  = document.getElementById('varianteId').value;
  const pid = e.target.dataset.productoId ?? state.variantesProductoId;

  // ── Obtener valores de los nuevos campos ──
  const cantidadInput = document.getElementById('varianteCantidad');
  const unidadInput   = document.getElementById('varianteUnidad');
  const cantidadVal   = cantidadInput?.value.trim() ?? '';
  const unidadVal     = unidadInput?.value.trim() ?? '';

  // ═══════════════════════════════════════════════════════════
  // 🔍 VALIDACIÓN CRUZADA: ambos o ninguno
  // ═══════════════════════════════════════════════════════════
  if ((cantidadVal && !unidadVal) || (!cantidadVal && unidadVal)) {
    showAlert('varianteAlert', '⚠️ Debes ingresar ambos: cantidad y unidad de medida, o dejarlos vacíos.', 'error');
    return; // detener envío
  }

  // Validar que la cantidad sea un número positivo si fue proporcionada
  if (cantidadVal !== '') {
    const cantidadNum = parseFloat(cantidadVal);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      showAlert('varianteAlert', '⚠️ La cantidad debe ser un número mayor que 0.', 'error');
      return;
    }
  }

  // ── Construir payload base ──
  const payload = {
    atributo:      document.getElementById('varianteAtributo').value.trim(),
    valor:         document.getElementById('varianteValor').value.trim(),
    sku_variante:  document.getElementById('varianteSKU').value.trim(),
    precio_extra:  parseFloat(document.getElementById('variantePrecioExtra').value) || 0,
    stock:         parseInt(document.getElementById('varianteStock').value) || 0,
    estado_activo: document.getElementById('varianteEstado').value === 'true',
  };

  // Solo añadir cantidad y unidad_medida si ambos tienen valor
  if (cantidadVal && unidadVal) {
    payload.cantidad = parseFloat(cantidadVal);
    payload.unidad_medida = unidadVal;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const url    = id ? `${ADMIN_API}/variantes/${id}` : `${ADMIN_API}/productos/${pid}/variantes`;
    const method = id ? 'PUT' : 'POST';
    const res    = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data   = await res.json();
    if (!res.ok) throw new Error(data.message);

    showAlert('varianteAlert', `✅ ${data.message}`, 'success');
    setTimeout(async () => {
      closeVarianteModal();
      if (state.catalogoVarianteProductoId) {
        await cargarVariantesDeProducto(state.catalogoVarianteProductoId);
      }
      await loadVariantes();
      await syncProductStockFromVariants(pid);   // <-- ¡Sincronizar stock!
    }, 1000);
  } catch (err) {
    showAlert('varianteAlert', `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar variante';
  }
});

async function deleteVariante(id) {
  if (!confirm('¿Eliminar esta variante? Esta acción es irreversible.')) return;
  try {
    const res = await authFetch(`${ADMIN_API}/variantes/${id}`, { method: 'DELETE' });
    if (res.status !== 204) throw new Error((await res.json()).message);
    showAlert('variantesAlert', '✅ Variante eliminada', 'success');
    await loadVariantes();
    await syncProductStockFromVariants(state.variantesProductoId); // <-- Sincronizar stock
  } catch (err) {
    showAlert('variantesAlert', `❌ ${err.message}`, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD DE CATÁLOGO: VARIANTES POR PRODUCTO
// ══════════════════════════════════════════════════════════════════════════════

async function loadVariantesCatalogo() {
  const catFilter     = document.getElementById('filtroCatVariantes')?.value;
  const productoSelect = document.getElementById('selectProductoVariante');
  if (!productoSelect) return;

  try {
    const params = new URLSearchParams();
    if (catFilter) params.set('categoria_id', catFilter);
    const res   = await authFetch(`${ADMIN_API}/productos?${params}`);
    const prods = await res.json();

    productoSelect.innerHTML = '<option value="">— Seleccionar producto —</option>'
      + prods.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (${p.sku})</option>`).join('');

    if (state.catalogoVarianteProductoId) {
      productoSelect.value = state.catalogoVarianteProductoId;
      await cargarVariantesDeProducto(state.catalogoVarianteProductoId);
    } else {
      safeSetHTML('variantesCatalogoList', '');
    }
  } catch (err) {
    console.error('[Catálogo variantes] Error cargando productos:', err);
  }
}

async function cargarVariantesDeProducto(productoId) {
  const listDiv = document.getElementById('variantesCatalogoList');
  if (!listDiv) return;
  listDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">⏳ Cargando variantes...</div>';

  try {
    const res      = await authFetch(`${ADMIN_API}/productos/${productoId}/variantes`);
    const variantes = await res.json();
    state.catalogoVariantesData = variantes;

    if (!variantes.length) {
      listDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);">Sin variantes. Agrega una nueva.</div>';
      return;
    }

    listDiv.innerHTML = variantes.map(v => `
      <div class="variante-card ${!v.estado_activo ? 'variante-inactiva' : ''}" data-id="${v.id}">
        <div class="variante-info">
          <div><strong>${escapeHtml(v.atributo)}:</strong> ${escapeHtml(v.valor)}</div>
          <div class="variante-sku"><code>${escapeHtml(v.sku_variante)}</code></div>
          <div>Precio extra: Bs ${Number(v.precio_extra).toFixed(2)} | Stock: ${v.stock}</div>
          ${v.cantidad ? `<div style="font-size:11px; color:var(--text-mid); margin-top:2px;">
            Contenido: ${v.cantidad} ${v.unidad_medida || 'unid.'}
            ${v.cantidad_actual > 0 ? ` · Restante: ${v.cantidad_actual} ${v.unidad_medida || ''}` : ''}
          </div>` : ''}
        </div>
        <div class="variante-actions">
          <button class="btn btn-outline btn-sm edit-var-cat" data-id="${v.id}">✏️</button>
          <button class="btn btn-danger btn-sm  del-var-cat"  data-id="${v.id}">🗑️</button>
        </div>
      </div>`).join('');

    listDiv.querySelectorAll('.edit-var-cat').forEach(btn =>
      btn.addEventListener('click', () => editarVarianteCatalogo(parseInt(btn.dataset.id)))
    );
    listDiv.querySelectorAll('.del-var-cat').forEach(btn =>
      btn.addEventListener('click', () => eliminarVarianteCatalogo(parseInt(btn.dataset.id)))
    );
  } catch (err) {
    listDiv.innerHTML = `<div style="color:#dc2626;">❌ ${escapeHtml(err.message)}</div>`;
  }
}

async function editarVarianteCatalogo(varianteId) {
  if (!state.catalogoVarianteProductoId) return;
  await openVarianteModal(varianteId, state.catalogoVarianteProductoId);
}

async function eliminarVarianteCatalogo(varianteId) {
  if (!confirm('¿Eliminar esta variante?')) return;
  try {
    const res = await authFetch(`${ADMIN_API}/variantes/${varianteId}`, { method: 'DELETE' });
    if (res.status !== 204) throw new Error((await res.json()).message);
    showAlert('variantesCatalogoAlert', '✅ Variante eliminada', 'success');
    await cargarVariantesDeProducto(state.catalogoVarianteProductoId);
    await syncProductStockFromVariants(state.catalogoVarianteProductoId); // <-- Sincronizar
  } catch (err) {
    showAlert('variantesCatalogoAlert', `❌ ${err.message}`, 'error');
  }
}

document.getElementById('filtroCatVariantes')?.addEventListener('change', loadVariantesCatalogo);

document.getElementById('selectProductoVariante')?.addEventListener('change', async function () {
  const productoId = parseInt(this.value);
  if (!productoId) {
    state.catalogoVarianteProductoId = null;
    safeSetHTML('variantesCatalogoList', '');
    return;
  }
  state.catalogoVarianteProductoId = productoId;
  await cargarVariantesDeProducto(productoId);
});

document.getElementById('btnGuardarVariantesCatalogo')?.addEventListener('click', async () => {
  if (!state.catalogoVarianteProductoId) {
    return showAlert('variantesCatalogoAlert', 'Selecciona un producto primero', 'error');
  }

  const payload = collectVarianteRows('#varianteCatalogoRows .variante-row');
  if (!payload.length) {
    return showAlert('variantesCatalogoAlert', 'Completa al menos una variante', 'error');
  }

  try {
    const res  = await authFetch(`${ADMIN_API}/productos/${state.catalogoVarianteProductoId}/variantes/batch`, {
      method: 'POST',
      body:   JSON.stringify({ variantes: payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('variantesCatalogoAlert', `✅ ${data.message}`, 'success');
    document.getElementById('varianteCatalogoRows').innerHTML = '';
    addVarianteCatalogoRow();
    await cargarVariantesDeProducto(state.catalogoVarianteProductoId);
    await syncProductStockFromVariants(state.catalogoVarianteProductoId); // <-- Sincronizar
  } catch (err) {
    showAlert('variantesCatalogoAlert', `❌ ${err.message}`, 'error');
  }
});
// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN: ALERTAS DE STOCK
// ══════════════════════════════════════════════════════════════════════════════

async function loadAlertas() {
  const container = document.getElementById('alertasContainer');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-light);">⏳ Cargando alertas...</div>';

  try {
    const res     = await authFetch(`${ADMIN_API}/productos/alertas`);
    const alertas = await res.json();

    safeText('alertaCountAgotados',  alertas.resumen.agotados);
    safeText('alertaCountBajoStock', alertas.resumen.bajo_stock);
    safeText('alertaCountEnRiesgo',  alertas.resumen.en_riesgo);
    safeText('alertaCountVariantes', alertas.resumen.variantes_bajas);

    let html = '';

    if (alertas.agotados.length)    html += renderAlertTable('⛔ Productos Agotados',              alertas.agotados,    'agotado');
    if (alertas.bajo_stock.length)  html += renderAlertTable('⚠️ Stock Bajo Mínimo',              alertas.bajo_stock,  'bajo');
    if (alertas.en_riesgo.length)   html += renderAlertTable('🟡 En Riesgo (< 1.5× mínimo)',      alertas.en_riesgo,   'riesgo');

    if (alertas.variantes_bajas.length) {
      html += `
        <div class="alert-section">
          <div class="alert-section-title">🔀 Variantes con Bajo Stock</div>
          <table>
            <thead><tr><th>Producto</th><th>Variante</th><th>SKU</th><th>Stock</th></tr></thead>
            <tbody>
              ${alertas.variantes_bajas.map(v => `
                <tr>
                  <td>${escapeHtml(v.producto)}</td>
                  <td>${escapeHtml(v.atributo)}: <strong>${escapeHtml(v.valor)}</strong></td>
                  <td><code>${escapeHtml(v.sku)}</code></td>
                  <td><span class="badge-bajo">⚠️ ${v.stock}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    if (alertas.alto_consumo?.length) {
      html += `
        <div class="alert-section">
          <div class="alert-section-title">🔥 Alto Consumo (últimos 30 días)</div>
          <table>
            <thead><tr><th>Producto</th><th>SKU</th><th>Stock actual</th><th>Consumido</th><th>Estado</th></tr></thead>
            <tbody>
              ${alertas.alto_consumo.map(p => `
                <tr>
                  <td>${escapeHtml(p.nombre ?? '—')}</td>
                  <td><code>${escapeHtml(p.sku ?? '—')}</code></td>
                  <td>${p.stock_actual ?? p.stock ?? '—'}</td>
                  <td><strong>${Number(p.consumido_30d).toFixed(1)}</strong></td>
                  <td>${p.riesgo_agotamiento
                        ? '<span class="badge-agotado">⚠️ En riesgo</span>'
                        : '<span class="badge-ok">OK</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    container.innerHTML = html
      || '<div style="text-align:center;padding:32px;color:#2d5a45;font-size:15px;">✅ ¡Sin alertas activas! El inventario está en buen estado.</div>';
  } catch (err) {
    container.innerHTML = `<div style="color:#dc2626;padding:14px;">❌ ${escapeHtml(err.message)}</div>`;
  }
}

function renderAlertTable(titulo, items, tipo) {
  const borderColor = tipo === 'agotado' ? '#dc2626' : tipo === 'bajo' ? '#f59e0b' : '#ca8a04';
  return `
    <div class="alert-section" style="border-left-color:${borderColor};">
      <div class="alert-section-title">${titulo}</div>
      <table>
        <thead>
          <tr><th>Nombre</th><th>SKU</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Rec. compra</th></tr>
        </thead>
        <tbody>
          ${items.map(p => `
            <tr>
              <td><strong>${escapeHtml(p.nombre)}</strong></td>
              <td><code>${escapeHtml(p.sku)}</code></td>
              <td style="font-size:12px;">${escapeHtml(p.categoria)}</td>
              <td style="text-align:center;">
                ${tipo === 'agotado'
                  ? '<span class="badge-agotado">⛔ 0</span>'
                  : `<span class="badge-bajo">⚠️ ${p.stock}</span>`}
              </td>
              <td style="text-align:center;">${p.stock_minimo}</td>
              <td style="text-align:center;font-weight:600;color:#2d5a45;">${p.recomendacion_compra ?? '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN: REPORTE DE INVENTARIO
// ══════════════════════════════════════════════════════════════════════════════

async function loadReporte() {
  console.log('[Reporte] Iniciando carga...');
  const container = document.getElementById('reporteContainer');
  if (!container) { console.error('[Reporte] No se encontró #reporteContainer'); return; }

  container.querySelectorAll('.card').forEach(card => card.style.display = 'none');

  let loadingDiv = document.getElementById('reporteLoading');
  if (!loadingDiv) {
    loadingDiv = document.createElement('div');
    loadingDiv.id = 'reporteLoading';
    Object.assign(loadingDiv.style, { textAlign: 'center', padding: '32px', color: 'var(--text-light)' });
    container.prepend(loadingDiv);
  }
  loadingDiv.textContent = '⏳ Generando reporte...';
  loadingDiv.style.display = 'block';

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${ADMIN_API}/productos/reporte`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);
    console.log('[Reporte] Respuesta recibida, status:', res.status);

    if (!res.ok) {
      let serverMsg = '';
      try { serverMsg = (await res.json()).message || ''; } catch (_) {}
      throw new Error(serverMsg || `Error del servidor (${res.status})`);
    }

    const reporte = await res.json();
    if (!reporte || typeof reporte !== 'object') throw new Error('El servidor devolvió un formato inesperado');

    loadingDiv.style.display = 'none';
    container.querySelectorAll('.card').forEach(card => card.style.display = '');

    safeText('reporteTotalProd', reporte.total_productos   ?? '—');
    safeText('reporteActivos',   reporte.productos_activos ?? '—');
    safeText('reporteValor',     `Bs ${Number(reporte.valor_inventario ?? 0).toFixed(2)}`);

    const catBody = document.getElementById('reporteCategoriaBody');
    if (catBody) {
      catBody.innerHTML = reporte.por_categoria?.length
        ? reporte.por_categoria.map(c => `
            <tr>
              <td><strong>${escapeHtml(c.categoria)}</strong></td>
              <td style="text-align:center;">${c.productos}</td>
              <td>Bs ${Number(c.valor).toFixed(2)}</td>
              <td style="text-align:center;">${c.bajo_stock > 0 ? `<span class="badge-bajo">⚠️ ${c.bajo_stock}</span>` : '—'}</td>
              <td style="text-align:center;">${c.agotados   > 0 ? `<span class="badge-agotado">⛔ ${c.agotados}</span>`  : '—'}</td>
            </tr>`).join('')
        : '<tr><td colspan="5">Sin datos</td></tr>';
    }

    const listaBody = document.getElementById('reporteListaBody');
    if (listaBody) {
      listaBody.innerHTML = reporte.productos_lista?.length
        ? reporte.productos_lista.map(p => `
            <tr style="${!p.estado_activo ? 'opacity:.6;' : ''}">
              <td>${p.id}</td>
              <td>
                <strong>${escapeHtml(p.nombre)}</strong><br>
                <small style="color:var(--text-light);"><code>${escapeHtml(p.sku)}</code></small>
              </td>
              <td style="font-size:12px;">${escapeHtml(p.categoria)}</td>
              <td>Bs ${Number(p.precio_base).toFixed(2)}</td>
              <td style="text-align:center;">
                ${p.agotado    ? '<span class="badge-agotado">⛔ 0</span>'
                : p.bajo_stock ? `<span class="badge-bajo">⚠️ ${p.stock}</span>`
                :                `<span class="badge-ok">${p.stock}</span>`}
              </td>
              <td style="text-align:center;">${p.stock_minimo}</td>
              <td>Bs ${Number(p.valor_total).toFixed(2)}</td>
              <td>${p.estado}</td>
            </tr>`).join('')
        : '<tr><td colspan="8">Sin productos</td></tr>';
    }

    console.log('[Reporte] Mostrado correctamente');
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[Reporte] Error:', err);
    loadingDiv.style.display = 'none';
    container.innerHTML = `
      <div style="color:#dc2626;padding:24px;text-align:center;background:white;border-radius:var(--radius);">
        ❌ ${escapeHtml(err.message || (err.name === 'AbortError' ? 'El reporte tardó demasiado' : 'Error desconocido'))}
        <br><small style="font-size:11px;">Revisa la consola (F12) para más detalles.</small>
      </div>`;
  }
}

// ── Exportaciones del reporte ─────────────────────────────────

document.getElementById('btnExportarCSV')?.addEventListener('click', async () => {
  try {
    const res     = await authFetch(`${ADMIN_API}/productos/reporte`);
    const reporte = await res.json();
    const headers = ['ID', 'Nombre', 'SKU', 'Categoría', 'Precio Base', 'Stock', 'Stock Mínimo', 'Valor Total', 'Estado'];
    const rows    = reporte.productos_lista.map(p => [
      p.id, p.nombre, p.sku, p.categoria,
      p.precio_base, p.stock, p.stock_minimo, p.valor_total, p.estado,
    ]);
    const csv  = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `inventario_${new Date().toISOString().split('T')[0]}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Error al exportar: ${err.message}`);
  }
});

async function fetchPDF() {
  const res = await authFetch(`${ADMIN_API}/productos/reporte/pdf`);
  if (!res.ok) throw new Error('Error al generar el PDF');
  return res.blob();
}

document.getElementById('btnVistaPreviaPDF')?.addEventListener('click', async () => {
  try {
    const blob = await fetchPDF();
    const url  = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert(`❌ No se pudo mostrar el PDF. ${err.message}`);
  }
});

document.getElementById('btnDescargarPDF')?.addEventListener('click', async () => {
  try {
    const blob = await fetchPDF();
    const url  = window.URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `inventario_${new Date().toISOString().split('T')[0]}.pdf`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(`❌ No se pudo descargar el PDF. ${err.message}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════════════════════
async function initFiltros() {
  try {
    const res = await authFetch(`${ADMIN_API}/categorias`);
    state.categorias = await res.json();

    const optionsHtml = '<option value="">Todas las categorías</option>'
      + state.categorias.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');

    const selProductos = document.getElementById('filtroCategoriaProducto');
    const selVariantes = document.getElementById('filtroCatVariantes');
    if (selProductos) selProductos.innerHTML = optionsHtml;
    if (selVariantes) selVariantes.innerHTML = optionsHtml;
  } catch (err) {
    console.error('[Init] Error cargando filtros:', err);
  }
}
async function deleteProductoPermanent(id) {
  const producto = state.productos.find(p => p.id === id);
  if (!producto) return;

  // Confirmación doble para evitar accidentes
  if (!confirm(`⚠️ ¿Estás seguro de que deseas ELIMINAR permanentemente el producto "${producto.nombre}"?\n\nEsta acción NO se puede deshacer.`)) {
    return;
  }

  if (!confirm('Esta acción es IRREVERSIBLE. ¿Confirmar eliminación?')) {
    return;
  }

  try {
    const res = await authFetch(`${ADMIN_API}/productos/${id}/permanent`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Error al eliminar');
    }

    showAlert('productosMessage', '✅ Producto eliminado permanentemente', 'success');
    await loadProductos();
    await loadOverview();
  } catch (err) {
    showAlert('productosMessage', `❌ ${err.message}`, 'error');
  }
}

// Inicializar fila vacía en ambos formularios batch
addVarianteRow();
addVarianteCatalogoRow();
initFiltros().then(() => {
  const savedSection = localStorage.getItem('productos_seccion') || 'inicio';
  localStorage.removeItem('productos_seccion');
  showSection(savedSection);
});
window.showSection = showSection;
