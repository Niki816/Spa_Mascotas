// js/groomer-galeria.js
import { authFetch, getUser, clearTokens, API_URL } from './auth.js';

// Verificación
const user = getUser();
if (!user) { window.location.href = 'index.html'; }
if (user?.rol !== 'groomer') { window.location.href = 'dashboard.html'; }

// Sidebar
document.getElementById('sidebarName').textContent = user.email.split('@')[0];
document.getElementById('groomerEmail').textContent = user.email;

// Logout
function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', (e) => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

// Lightbox
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
document.getElementById('lightboxClose').addEventListener('click', () => {
  lightbox.classList.remove('active');
});
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.classList.remove('active');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lightbox.classList.remove('active');
});

// Cargar galería
async function loadGaleria() {
  const container = document.getElementById('galeriaContainer');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando galería...</p></div>`;

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers/galeria`);
    if (!res.ok) throw new Error('Error al cargar la galería');
    const data = await res.json();
    const galeria = data.galeria || [];

    if (!galeria.length) {
      container.innerHTML = `<div class="empty-state"><p>📸 Aún no tienes fotos de servicios.</p></div>`;
      return;
    }

    let html = '<div class="galeria-grid">';
    galeria.forEach(servicio => {
      const { citaId, mascota, servicio: nombreServicio, fecha, fotos } = servicio;
      const fechaFormateada = new Date(fecha).toLocaleDateString('es-BO', {
        day: 'numeric', month: 'long', year: 'numeric'
      });

      const antes = fotos.filter(f => f.tipo === 'antes')[0];
      const despues = fotos.filter(f => f.tipo === 'despues')[0];

      html += `
        <div class="servicio-card">
          <div class="card-header">
            <div class="mascota-info">
              <h3>${mascota.nombre}</h3>
              <span>${mascota.raza || mascota.especie}</span>
            </div>
            <div class="servicio-info">✂️ ${nombreServicio}</div>
            <div class="fecha">📅 ${fechaFormateada}</div>
          </div>
          <div class="fotos-container">
            <div class="foto-wrapper">
              ${antes 
                ? `<img src="http://localhost:4000${antes.url}" alt="Antes" onclick="openLightbox('${antes.url}')" />
                   <span class="foto-label">ANTES</span>`
                : `<div class="empty-foto">📷</div>`
              }
            </div>
            <div class="foto-wrapper">
              ${despues 
                ? `<img src="http://localhost:4000${despues.url}" alt="Después" onclick="openLightbox('${despues.url}')" />
                   <span class="foto-label">DESPUÉS</span>`
                : `<div class="empty-foto">📷</div>`
              }
            </div>
          </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    // Exponer función openLightbox globalmente
    window.openLightbox = (url) => {
      lightboxImg.src = `http://localhost:4000${url}`;
      lightbox.classList.add('active');
    };
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>❌ ${err.message}</p></div>`;
  }
}

loadGaleria();