// js/groomer-insumos.js
import { authFetch, getUser, clearTokens, API_URL } from './auth.js';

const user = getUser();
if (!user) { window.location.href = 'index.html'; }
if (user?.rol !== 'groomer') { window.location.href = 'dashboard.html'; }

document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('groomerEmail').textContent = user.email;

function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

async function cargarConsumo() {
  const statsContainer = document.getElementById('statsContainer');
  const listContainer = document.getElementById('consumoContainer');
  listContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>`;

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/insumos`);
    if (!res.ok) throw new Error('Error al cargar historial');
    const data = await res.json();
    const { historial, estadisticas } = data;

    // Mostrar estadísticas
    statsContainer.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div>
          <div class="stat-num">${estadisticas.totalConsumos}</div>
          <div class="stat-label">Consumos registrados</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🧪</div>
        <div>
          <div class="stat-num">${estadisticas.totalProductosDistintos}</div>
          <div class="stat-label">Productos distintos</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚖️</div>
        <div>
          <div class="stat-num">${estadisticas.totalCantidad}</div>
          <div class="stat-label">Cantidad total</div>
        </div>
      </div>
    `;

    if (!historial.length) {
      listContainer.innerHTML = `<div class="empty-state"><p>🧴 No has registrado consumo de insumos aún.</p></div>`;
      return;
    }

    let html = '<div class="consumo-list">';
    historial.forEach(item => {
      const fecha = new Date(item.fecha).toLocaleDateString('es-BO', {
        day: 'numeric', month: 'short', year: 'numeric'
      }) + ' · ' + new Date(item.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

      const varianteTexto = item.variante
        ? `${item.variante.atributo}: ${item.variante.valor}`
        : 'Sin variante';

      const descuentoBadge = item.descontado
        ? '<span class="descontado-badge">✅ Descontado</span>'
        : '<span class="descontado-badge pendiente-badge">⏳ Pendiente</span>';

      html += `
        <div class="consumo-card">
          <div class="producto-img">🧴</div>
          <div class="producto-detalle">
            <div class="producto-nombre">${item.producto.nombre}</div>
            <div class="producto-variante">${varianteTexto}</div>
            <div class="producto-servicio">
              ✂️ ${item.servicio.nombre}
              ${descuentoBadge}
            </div>
            <div class="producto-mascota">🐾 ${item.mascota.nombre} · ${item.mascota.raza || item.mascota.especie} · ${fecha}</div>
          </div>
          <div class="consumo-cantidad">
            <div class="cantidad-num">${item.cantidad}</div>
            <div class="cantidad-label">cantidad</div>
          </div>
        </div>`;
    });
    html += '</div>';
    listContainer.innerHTML = html;
  } catch (err) {
    listContainer.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
  }
}

cargarConsumo();