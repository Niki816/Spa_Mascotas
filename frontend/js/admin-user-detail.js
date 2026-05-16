import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const ADMIN_API = API_URL.replace('/auth', '/admin');
const token = getAccessToken();
const user = getUser();

// Proteger ruta
if (!token || !user) window.location.href = 'index.html';
if (user?.rol !== 'admin') window.location.href = 'dashboard.html';

// Obtener ID de la URL
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');
if (!userId) {
  alert('ID de usuario no proporcionado');
  window.location.href = 'admin-dashboard.html';
}

let currentUserData = null;

// Elementos del DOM
const form = document.getElementById('userForm');
const formAlert = document.getElementById('formAlert');
const userRolBadge = document.getElementById('userRolBadge');
const userStatusBadge = document.getElementById('userStatusBadge');
const toggleActivateBtn = document.getElementById('toggleActivateBtn');
const deletePermanentBtn = document.getElementById('deletePermanentBtn');

// Campos
const userIdInput = document.getElementById('userId');
const emailInput = document.getElementById('email');
const nombreInput = document.getElementById('nombre');
const apellidoInput = document.getElementById('apellido');
const clienteFields = document.getElementById('clienteFields');
const groomerFields = document.getElementById('groomerFields');
const ciInput = document.getElementById('ci');
const telefonoInput = document.getElementById('telefono');
const direccionInput = document.getElementById('direccion');
const groomerTelefono = document.getElementById('groomerTelefono');
const especialidadInput = document.getElementById('especialidad');

function showAlert(msg, type = 'error') {
  formAlert.textContent = msg;
  formAlert.className = `alert alert-${type} show`;
  setTimeout(() => formAlert.classList.remove('show'), 5000);
}

function updateUIByRol(rol, userData) {
  // Ocultar todos primero
  clienteFields.style.display = 'none';
  groomerFields.style.display = 'none';
  userRolBadge.textContent = rol.toUpperCase();

  if (rol === 'cliente') {
    clienteFields.style.display = 'block';
    ciInput.value = userData.clientes?.ci || '';
    telefonoInput.value = userData.clientes?.telefono || '';
    direccionInput.value = userData.clientes?.direccion || '';
  } else if (rol === 'groomer') {
    groomerFields.style.display = 'block';
    groomerTelefono.value = userData.groomers?.telefono || '';
    especialidadInput.value = userData.groomers?.especialidad || '';
  } else {
    // admin o recepcion (si existe)
    telefonoInput.value = '';
  }
}

async function loadUser() {
  try {
    const res = await authFetch(`${ADMIN_API}/users/${userId}`);
    if (!res.ok) throw new Error('Error cargando usuario');
    const data = await res.json();
    currentUserData = data;

    // Llenar campos comunes
    userIdInput.value = data.id;
    emailInput.value = data.email;
    nombreInput.value = data.clientes?.nombre || data.groomers?.nombre || '';
    apellidoInput.value = data.clientes?.apellido || data.groomers?.apellido || '';

    // Estado
    const activo = data.estado_activo;
    userStatusBadge.textContent = activo ? '✅ ACTIVO' : '❌ INACTIVO';
    userStatusBadge.className = `status-badge ${activo ? 'status-active' : 'status-inactive'}`;
    toggleActivateBtn.textContent = activo ? '🔴 Desactivar Usuario' : '🟢 Reactivar Usuario';

    // Mostrar campos según rol
    updateUIByRol(data.roles.nombre, data);
  } catch (err) {
    console.error(err);
    showAlert('Error al cargar usuario: ' + err.message);
  }
}

// Guardar cambios (edición general)
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    email: emailInput.value,
    nombre: nombreInput.value,
    apellido: apellidoInput.value,
  };

  const rol = currentUserData?.roles?.nombre;
  if (rol === 'cliente') {
    payload.ci = ciInput.value;
    payload.telefono = telefonoInput.value;
    payload.direccion = direccionInput.value;
  } else if (rol === 'groomer') {
    payload.telefono = groomerTelefono.value;
    payload.especialidad = especialidadInput.value;
  }

  try {
    const res = await authFetch(`${ADMIN_API}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('✅ Usuario actualizado correctamente', 'success');
    loadUser(); // recargar datos para actualizar posible cambio de estado
  } catch (err) {
    showAlert('Error: ' + err.message);
  }
});

// Activar/Desactivar
toggleActivateBtn.addEventListener('click', async () => {
  if (!currentUserData) return;
  const activo = currentUserData.estado_activo;
  const action = activo ? 'desactivar' : 'reactivar';
  const confirmMsg = activo
    ? '¿Desactivar este usuario? Podrás reactivarlo después.'
    : '¿Reactivar este usuario?';
  if (!confirm(confirmMsg)) return;

  try {
    let res;
    if (activo) {
      res = await authFetch(`${ADMIN_API}/users/${userId}/deactivate`, { method: 'PATCH' });
    } else {
      res = await authFetch(`${ADMIN_API}/users/${userId}/reactivate`, { method: 'PATCH' });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert(`✅ Usuario ${activo ? 'desactivado' : 'reactivado'} correctamente`, 'success');
    loadUser(); // refrescar datos
  } catch (err) {
    showAlert('Error: ' + err.message);
  }
});

// Eliminar permanentemente (solo si está inactivo)
deletePermanentBtn.addEventListener('click', async () => {
  if (!currentUserData) return;
  if (currentUserData.estado_activo) {
    showAlert('❌ No se puede eliminar un usuario activo. Desactívelo primero.', 'error');
    return;
  }
  const confirmMsg = '⚠️ Esta acción BORRARÁ TODOS LOS DATOS del usuario (citas, historial, etc.) de la base de datos. No se puede deshacer. ¿Estás seguro?';
  if (!confirm(confirmMsg)) return;

  try {
    const res = await authFetch(`${ADMIN_API}/users/${userId}/permanent`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('✅ Usuario eliminado permanentemente. Redirigiendo...', 'success');
    setTimeout(() => {
      window.location.href = 'admin-dashboard.html';
    }, 2000);
  } catch (err) {
    showAlert('Error: ' + err.message);
  }
});

// Cargar datos inicial
loadUser();