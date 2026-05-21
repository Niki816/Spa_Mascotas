import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const token = getAccessToken();
const user = getUser();
if (!token || !user || user.rol !== 'recepcion') {
  clearTokens();
  window.location.href = 'index.html';
}

const RECEPCION_API = API_URL.replace('/auth', '/recepcion');

// Elementos
const searchForm = document.getElementById('searchForm');
const fechaInput = document.getElementById('fecha');
const servicioSelect = document.getElementById('servicio');
const groomerSelect = document.getElementById('groomer');
const slotsCard = document.getElementById('slotsCard');
const slotsContainer = document.getElementById('slotsContainer');
const crearCitaCard = document.getElementById('crearCitaCard');
const mascotaSelect = document.getElementById('mascota');
const slotGroomerId = document.getElementById('slotGroomerId');
const slotFechaHora = document.getElementById('slotFechaHora');
const citaForm = document.getElementById('citaForm');
const citaAlert = document.getElementById('citaAlert');

let selectedSlot = null;

function showAlert(element, msg, type = 'success') {
  element.textContent = msg;
  element.className = `alert alert-${type} show`;
  setTimeout(() => element.classList.remove('show'), 5000);
}

// Cargar servicios
async function loadServicios() {
  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/servicios`); // necesitas este endpoint público? Mejor crear uno en recepción, pero por simplicidad usamos un endpoint que deberías tener en admin o crear uno para recepción
    // Como no tenemos endpoint público de servicios, usaré una llamada directa a /admin/servicios? No. Lo mejor es agregar en recepción.routes: router.get('/servicios', ...)
    // Asumiré que existe un endpoint /api/servicios público (deberías implementarlo). Mientras tanto, pediré al backend.
    // Si no existe, crea en un controlador general: serviciosController.getServiciosActivos
    const data = await res.json();
    servicioSelect.innerHTML = '<option value="">Seleccionar servicio</option>' + data.map(s => `<option value="${s.id}">${s.nombre} - ${s.duracion_base_minutos} min - $${s.precio_base}</option>`).join('');
  } catch (err) {
    console.error(err);
  }
}

// Cargar groomers activos
async function loadGroomers() {
  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/groomers`); // mismo caso, crear endpoint para recepción
    const data = await res.json();
    groomerSelect.innerHTML = '<option value="">— Todos los groomers —</option>' + data.map(g => `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`).join('');
  } catch (err) {
    console.error(err);
  }
}

// Cargar mascotas del cliente (suponiendo que la recepcionista puede ver todas las mascotas)
// Necesitas un endpoint que liste todas las mascotas con su dueño
async function loadMascotas() {
  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/mascotas`); // endpoint a crear
    const data = await res.json();
    mascotaSelect.innerHTML = '<option value="">Seleccionar mascota</option>' + data.map(m => `<option value="${m.id}">${m.nombre} (dueño: ${m.cliente_nombre})</option>`).join('');
  } catch (err) {
    console.error(err);
  }
}

// Buscar slots
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = fechaInput.value;
  const servicio_id = servicioSelect.value;
  const groomer_id = groomerSelect.value || '';
  if (!fecha || !servicio_id) return;

  try {
    const params = new URLSearchParams({ fecha, servicio_id });
    if (groomer_id) params.append('groomer_id', groomer_id);
    const res = await authFetch(`${RECEPCION_API}/slots?${params}`);
    const data = await res.json();
    if (data.slots.length === 0) {
      slotsContainer.innerHTML = '<p>No hay slots disponibles para los criterios seleccionados.</p>';
    } else {
      renderSlots(data.slots);
    }
    slotsCard.style.display = 'block';
    crearCitaCard.style.display = 'none';
  } catch (err) {
    showAlert(slotsCard, err.message, 'error');
  }
});

function renderSlots(slots) {
  slotsContainer.innerHTML = `
    <div class="slot-grid">
      ${slots.map(slot => `
        <div class="slot-card" data-groomer="${slot.groomer_id}" data-inicio="${slot.inicio}">
          <div class="slot-hour">${new Date(slot.inicio).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
          <div class="slot-groomer">Groomer ID: ${slot.groomer_id}</div>
        </div>
      `).join('')}
    </div>
  `;
  document.querySelectorAll('.slot-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedSlot = {
        groomer_id: parseInt(card.dataset.groomer),
        fecha_hora_inicio: card.dataset.inicio
      };
      slotGroomerId.value = selectedSlot.groomer_id;
      slotFechaHora.value = selectedSlot.fecha_hora_inicio;
      crearCitaCard.style.display = 'block';
    });
  });
}

// Crear cita
citaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedSlot) return;
  const payload = {
    mascota_id: parseInt(mascotaSelect.value),
    servicio_id: parseInt(servicioSelect.value),
    groomer_id: selectedSlot.groomer_id,
    fecha_hora_inicio: selectedSlot.fecha_hora_inicio,
    notas: document.getElementById('notas').value
  };
  try {
    const res = await authFetch(`${RECEPCION_API}/citas`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert(citaAlert, '✅ Cita agendada correctamente', 'success');
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } catch (err) {
    showAlert(citaAlert, err.message, 'error');
  }
});

// Inicialización
loadServicios();
loadGroomers();
loadMascotas();