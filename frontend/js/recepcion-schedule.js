import { authFetch, getAccessToken, getUser, clearTokens, API_BASE } from './auth.js';

const token = getAccessToken();
const user = getUser();
if (!token || !user || user.rol !== 'recepcion') {
  clearTokens();
  window.location.href = 'index.html';
}

const RECEPCION_API = `${API_BASE}/recepcion`;

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

// Cargar servicios (endpoint: GET /api/recepcion/servicios)
async function loadServicios() {
  try {
    const res = await authFetch(`${RECEPCION_API}/servicios`);
    const data = await res.json();
    servicioSelect.innerHTML = '<option value="">Seleccionar servicio</option>' + 
      data.map(s => `<option value="${s.id}">${s.nombre} - ${s.duracion} min - $${s.precio_base}</option>`).join('');
  } catch (err) {
    console.error(err);
    showAlert(servicioSelect.parentElement, 'Error cargando servicios', 'error');
  }
}

// Cargar groomers activos (endpoint: GET /api/recepcion/groomers)
async function loadGroomers() {
  try {
    const res = await authFetch(`${RECEPCION_API}/groomers`);
    const data = await res.json();
    groomerSelect.innerHTML = '<option value="">— Todos los groomers —</option>' + 
      data.map(g => `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`).join('');
  } catch (err) {
    console.error(err);
    showAlert(groomerSelect.parentElement, 'Error cargando groomers', 'error');
  }
}

// Cargar mascotas (endpoint: GET /api/recepcion/mascotas)
async function loadMascotas() {
  try {
    const res = await authFetch(`${RECEPCION_API}/mascotas`);
    const data = await res.json();
    mascotaSelect.innerHTML = '<option value="">Seleccionar mascota</option>' + 
      data.map(m => `<option value="${m.id}">${m.nombre} (dueño: ${m.dueno})</option>`).join('');
  } catch (err) {
    console.error(err);
    showAlert(mascotaSelect.parentElement, 'Error cargando mascotas', 'error');
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