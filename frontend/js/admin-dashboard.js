import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';

const ADMIN_API = API_URL.replace('/auth', '/admin');

// ── Proteger ruta ──
const token = getAccessToken();
const user  = getUser();
if (!token || !user)       { window.location.href = 'index.html'; }
if (user?.rol !== 'admin') { window.location.href = 'dashboard.html'; }

document.getElementById('sidebarName').textContent  = user.email.split('@')[0];
document.getElementById('adminEmail').textContent   = user.email;
document.getElementById('profileEmail').textContent = user.email;

// ════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════
const sections = ['inicio','crear-groomer','crear-recepcion','crear-cliente','auth-logs','usuarios','seguridad'];
document.querySelectorAll('.nav-item[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    sections.forEach(s => {
      const el = document.getElementById(`section-${s}`);
      if (el) el.style.display = s === sec ? 'block' : 'none';
    });
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    if (sec === 'auth-logs') loadAuthLogs(true);
    if (sec === 'usuarios') loadUsuarios(true);
  });
});

// Helpers
function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.className = 'alert', 6000);
}

function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2').addEventListener('click', doLogout);
// ════════════════════════════════════════
// 2FA (obligatorio para admin)
// ════════════════════════════════════════
document.getElementById('generate2FABtn').addEventListener('click', async () => {
  try {
    const res  = await authFetch(`${API_URL}/2fa/generate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    document.getElementById('qrContainer').innerHTML = `
      <div class="twofa-box">
        <img src="${data.qrCode}" alt="QR 2FA">
        <p style="font-size:11px;color:var(--text-light);margin-top:8px;">Escanea con Google Authenticator o Authy</p>
        <div class="secret-box">${data.secret}</div>
      </div>`;
    document.getElementById('enable2FAForm').style.display = 'block';
  } catch (err) { alert(err.message); }
});

document.getElementById('cancel2FA').addEventListener('click', () => {
  document.getElementById('enable2FAForm').style.display = 'none';
  document.getElementById('qrContainer').innerHTML = '';
});

document.getElementById('enable2FAForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res  = await authFetch(`${API_URL}/2fa/enable`, {
      method: 'POST',
      body: JSON.stringify({ totpCode: document.getElementById('totpCode').value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('tfaMessage', '✅ 2FA activado correctamente', 'success');
    document.getElementById('card2fa').style.cssText += 'border-color:#a8d5b5 !important;background:#e8f5ed !important;';
    document.getElementById('enable2FAForm').style.display = 'none';
    document.getElementById('generate2FABtn').textContent = '✅ 2FA ya está activo';
    document.getElementById('generate2FABtn').disabled    = true;
    document.getElementById('status2FA').textContent = '✅ Activo';
  } catch (err) { showAlert('tfaMessage', err.message, 'error'); }
});

// ════════════════════════════════════════
// CREAR GROOMER (versión con horario automático y validaciones)
// ════════════════════════════════════════
function actualizarHorarioAutomatico() {
  const turno = document.getElementById('groomerTurno').value;
  const wrap = document.getElementById('groomerHorarioWrap');
  const texto = document.getElementById('groomerHorarioTexto');
  const hidden = document.getElementById('groomerHorarioJSON');

  const horarios = {
    'mañana': {
      texto: 'Turno mañana: 08:00 – 14:00',
      json: {
        lunes: { inicio: '08:00', fin: '14:00' },
        martes: { inicio: '08:00', fin: '14:00' },
        miercoles: { inicio: '08:00', fin: '14:00' },
        jueves: { inicio: '08:00', fin: '14:00' },
        viernes: { inicio: '08:00', fin: '14:00' },
        sabado: { inicio: '08:00', fin: '13:00' }
      }
    },
    'tarde': {
      texto: 'Turno tarde: 14:00 – 20:00',
      json: {
        lunes: { inicio: '14:00', fin: '20:00' },
        martes: { inicio: '14:00', fin: '20:00' },
        miercoles: { inicio: '14:00', fin: '20:00' },
        jueves: { inicio: '14:00', fin: '20:00' },
        viernes: { inicio: '14:00', fin: '20:00' },
        sabado: { inicio: '14:00', fin: '19:00' }
      }
    },
    'completo': {
      texto: 'Turno completo: 08:00 – 20:00',
      json: {
        lunes: { inicio: '08:00', fin: '20:00' },
        martes: { inicio: '08:00', fin: '20:00' },
        miercoles: { inicio: '08:00', fin: '20:00' },
        jueves: { inicio: '08:00', fin: '20:00' },
        viernes: { inicio: '08:00', fin: '20:00' },
        sabado: { inicio: '08:00', fin: '18:00' }
      }
    }
  };

  if (horarios[turno]) {
    texto.textContent = horarios[turno].texto;
    hidden.value = JSON.stringify(horarios[turno].json);
    wrap.style.display = 'block';
  } else {
    texto.textContent = '—';
    hidden.value = '';
    wrap.style.display = 'none';
  }
}

// Validar contraseña en tiempo real
function validarPasswordInput() {
  const el = document.getElementById('groomerPassword');
  const div = document.getElementById('groomerPasswordStrength');
  if (!el || !div) return;
  const val = el.value;
  if (!val) { div.textContent = ''; div.style.color = ''; return; }
  const checks = {
    length: val.length >= 8,
    upper: /[A-Z]/.test(val),
    lower: /[a-z]/.test(val),
    digit: /[0-9]/.test(val),
    symbol: /[^A-Za-z0-9]/.test(val)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  if (passed === 5) {
    div.textContent = '✅ Contraseña segura';
    div.style.color = '#2d5a45';
  } else {
    const missing = [];
    if (!checks.length) missing.push('8 caracteres');
    if (!checks.upper) missing.push('mayúscula');
    if (!checks.lower) missing.push('minúscula');
    if (!checks.digit) missing.push('número');
    if (!checks.symbol) missing.push('símbolo');
    div.textContent = `⚠️ Falta: ${missing.join(', ')}`;
    div.style.color = '#92400e';
  }
}

// Asignar eventos del groomer
document.addEventListener('DOMContentLoaded', () => {
  const turnoSelect = document.getElementById('groomerTurno');
  if (turnoSelect) turnoSelect.addEventListener('change', actualizarHorarioAutomatico);
  const passInput = document.getElementById('groomerPassword');
  if (passInput) passInput.addEventListener('input', validarPasswordInput);
  actualizarHorarioAutomatico(); // inicializar
});

document.getElementById('createGroomerForm').addEventListener('submit', async e => {
  e.preventDefault();

  // Validar contraseña
  const password = document.getElementById('groomerPassword').value;
  const isValidPass = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password);
  if (!isValidPass) {
    showAlert('groomerMessage', '❌ La contraseña no cumple los requisitos: mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.', 'error');
    return;
  }

  // Validar nombre/apellido (solo letras)
  const nombre = document.getElementById('groomerNombre').value.trim();
  const apellido = document.getElementById('groomerApellido').value.trim();
  if (!/^[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+$/.test(nombre) || !/^[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+$/.test(apellido)) {
    showAlert('groomerMessage', '❌ Nombre y apellido solo pueden contener letras.', 'error');
    return;
  }

  // Obtener horario desde campo oculto
  const horarioRaw = document.getElementById('groomerHorarioJSON').value;
  let horario = null;
  if (horarioRaw) {
    try {
      horario = JSON.parse(horarioRaw);
    } catch { /* ignorar */ }
  }

  const body = {
    nombre,
    apellido,
    email: document.getElementById('groomerEmail').value.trim(),
    password,
    telefono: document.getElementById('groomerTelefono').value.trim(),
    especialidad: document.getElementById('groomerEspecialidad').value.trim(),
    sucursal_id: parseInt(document.getElementById('groomerSucursal').value) || null,
    turno: document.getElementById('groomerTurno').value,
    capacidad_simultanea: parseInt(document.getElementById('groomerCapacidad').value) || 1,
    horario_trabajo: horario,
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Creando...';

  try {
    const res = await authFetch(`${ADMIN_API}/groomer`, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('groomerMessage', `✅ ${data.message}`, 'success');
    e.target.reset();
    document.getElementById('groomerSucursal').value = '';
    actualizarHorarioAutomatico(); // resetear horario oculto
    loadStats();
  } catch (err) {
    showAlert('groomerMessage', err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '➕ Crear groomer';
  }
});
 
 
// ════════════════════════════════════════
// CREAR CLIENTE
// ════════════════════════════════════════
document.getElementById('createClienteForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    nombre:    document.getElementById('clienteNombre').value.trim(),
    apellido:  document.getElementById('clienteApellido').value.trim(),
    email:     document.getElementById('clienteEmail').value.trim(),
    password:  document.getElementById('clientePassword').value,
    ci:        document.getElementById('clienteCI').value.trim(),
    telefono:  document.getElementById('clienteTelefono').value.trim(),
    direccion: document.getElementById('clienteDireccion').value.trim(),
  };
  try {
    const res  = await authFetch(`${ADMIN_API}/cliente`, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('clienteMessage', `✅ ${data.message}`, 'success');
    document.getElementById('createClienteForm').reset();
    loadStats();
  } catch (err) { showAlert('clienteMessage', err.message, 'error'); }
});

// ════════════════════════════════════════
// AUTH LOGS
// ════════════════════════════════════════
const ACCION_STYLE = {
  login_exitoso:            { bg:'#d1fae5', color:'#065f46' },
  login_fallido:            { bg:'#fee2e2', color:'#991b1b' },
  logout:                   { bg:'#f3f4f6', color:'#374151' },
  bloqueo_cuenta:           { bg:'#fef3c7', color:'#92400e' },
  registro_cuenta:          { bg:'#dbeafe', color:'#1e40af' },
  verificacion_email:       { bg:'#e0e7ff', color:'#3730a3' },
  solicitud_reset_password: { bg:'#fef9c3', color:'#713f12' },
  reset_password_exitoso:   { bg:'#d1fae5', color:'#065f46' },
  cambio_password:          { bg:'#ede9fe', color:'#5b21b6' },
  activacion_2fa:           { bg:'#fce7f3', color:'#831843' },
  verificacion_2fa_exitosa: { bg:'#d1fae5', color:'#065f46' },
  verificacion_2fa_fallida: { bg:'#fee2e2', color:'#991b1b' },
  oauth_login:              { bg:'#dbeafe', color:'#1e40af' },
};

let logsPage = 0;
const PAGE_SIZE = 20;

async function loadAuthLogs(reset = true) {
  if (reset) logsPage = 0;
  const accion = document.getElementById('filtroAccion')?.value || '';
  try {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(logsPage * PAGE_SIZE) });
    if (accion) params.set('accion', accion);

    const res  = await authFetch(`${ADMIN_API}/auth-logs?${params}`);
    const data = await res.json();

    document.getElementById('logsTotal').textContent    = `${data.total} registros`;
    document.getElementById('logsPageInfo').textContent = `Página ${logsPage + 1}`;
    document.getElementById('btnPrevLogs').disabled = logsPage === 0;
    document.getElementById('btnNextLogs').disabled = (logsPage + 1) * PAGE_SIZE >= data.total;

    const tbody = document.getElementById('logsTable');
    if (!data.logs?.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-light);">Sin registros para este filtro</td></tr>`;
      return;
    }

    tbody.innerHTML = data.logs.map(l => {
      const s = ACCION_STYLE[l.accion] || { bg:'#f3f4f6', color:'#374151' };
      const fecha = new Date(l.fecha).toLocaleString('es-BO', { dateStyle:'short', timeStyle:'short' });
      return `<tr>
        <td style="font-size:11px;color:var(--text-light);white-space:nowrap;">${fecha}</td>
        <td><span style="background:${s.bg};color:${s.color};padding:3px 8px;border-radius:10px;font-size:11px;white-space:nowrap;">${l.accion.replace(/_/g,' ')}</span></td>
        <td style="font-size:12px;">${l.emailIntento || l.usuarioEmail || '<span style="color:var(--text-light)">—</span>'}</td>
        <td style="font-size:12px;color:var(--text-light);">${l.ip || '—'}</td>
        <td style="font-size:12px;color:var(--text-light);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${l.detalle || ''}">${l.detalle || '—'}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Error cargando logs:', err);
  }
}

document.getElementById('filtroAccion')?.addEventListener('change', () => loadAuthLogs(true));
document.getElementById('btnRefreshLogs')?.addEventListener('click', () => loadAuthLogs(true));
document.getElementById('btnPrevLogs')?.addEventListener('click', () => { logsPage--; loadAuthLogs(false); });
document.getElementById('btnNextLogs')?.addEventListener('click', () => { logsPage++; loadAuthLogs(false); });

// ════════════════════════════════════════
// USUARIOS
// ════════════════════════════════════════
let currentUserPage = 1;
const USER_PAGE_SIZE = 10;
let currentUserFilter = 'todos';
let currentUserSearch = '';
let pendingDeletePermanentId = null;

async function loadUsuarios(resetPage = true) {
  if (resetPage) currentUserPage = 1;
  const estado = currentUserFilter === 'todos' ? '' : currentUserFilter;
  const params = new URLSearchParams({
    page: currentUserPage,
    limit: USER_PAGE_SIZE,
    estado,
    search: currentUserSearch,
  });
  try {
    const res = await authFetch(`${ADMIN_API}/users/list?${params}`);
    const data = await res.json();
    document.getElementById('usersCount').textContent = data.total;
    const tbody = document.getElementById('usersTable');
    if (!data.data.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;">No hay usuarios</td></tr>`;
      document.getElementById('userPrevPage').disabled = true;
      document.getElementById('userNextPage').disabled = true;
      document.getElementById('userPageInfo').textContent = 'Página 1';
      return;
    }
    tbody.innerHTML = data.data.map(u => {
      const rol = u.roles.nombre;
      const verificado = u.email_verificado ? '✅' : '❌';
      const activo = u.estado_activo;
      const ultimoAcceso = u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleDateString('es-BO') : '—';
      const acciones = [];
      if (activo && rol !== 'admin') {
        acciones.push(`<button class="btn btn-danger btn-sm" onclick="deactivateUser(${u.id})">Desactivar</button>`);
      }
      if (!activo) {
        acciones.push(`<button class="btn btn-outline btn-sm" onclick="reactivateUser(${u.id})">Reactivar</button>`);
        acciones.push(`<button class="btn btn-danger btn-sm" onclick="prepareDeletePermanent(${u.id})">Eliminar</button>`);
      }
      acciones.unshift(`<a href="admin-user-detail.html?id=${u.id}" class="btn btn-primary btn-sm">Administrar</a>`);
      return `
        <tr>
          <td style="font-size:13px;">${u.email}</td>
          <td><span class="rol-badge rol-${rol}">${rol}</span></td>
          <td style="text-align:center;">${verificado}</td>
          <td><span class="status-dot ${activo ? 'dot-active':'dot-inactive'}"></span>${activo ? 'Activo':'Inactivo'}</td>
          <td style="font-size:11px;">${ultimoAcceso}</td>
          <td style="display:flex; gap:5px; flex-wrap:wrap;">${acciones.join(' ')}</td>
        </tr>`;
    }).join('');
    const totalPages = Math.ceil(data.total / USER_PAGE_SIZE);
    document.getElementById('userPrevPage').disabled = currentUserPage === 1;
    document.getElementById('userNextPage').disabled = currentUserPage >= totalPages;
    document.getElementById('userPageInfo').textContent = `Página ${currentUserPage} de ${totalPages || 1}`;
  } catch (err) {
    console.error('Error cargando usuarios:', err);
  }
}

// Filtros y paginación
document.getElementById('userEstadoFiltro')?.addEventListener('change', (e) => {
  currentUserFilter = e.target.value;
  loadUsuarios(true);
});
document.getElementById('userSearchBtn')?.addEventListener('click', () => {
  currentUserSearch = document.getElementById('userSearchInput').value.trim();
  loadUsuarios(true);
});
document.getElementById('userPrevPage')?.addEventListener('click', () => {
  if (currentUserPage > 1) { currentUserPage--; loadUsuarios(false); }
});
document.getElementById('userNextPage')?.addEventListener('click', () => {
  currentUserPage++; loadUsuarios(false);
});

// Desactivar (ya existente)
window.deactivateUser = async (userId) => {
  if (!confirm('¿Desactivar este usuario? Puedes reactivarlo después.')) return;
  try {
    await authFetch(`${ADMIN_API}/users/${userId}/deactivate`, { method: 'PATCH' });
    loadUsuarios(true);
    showAlert('usersMessage', 'Usuario desactivado correctamente', 'success');
  } catch (err) { alert(err.message); }
};

// Reactivar
window.reactivateUser = async (userId) => {
  if (!confirm('¿Reactivar este usuario?')) return;
  try {
    await authFetch(`${ADMIN_API}/users/${userId}/reactivate`, { method: 'PATCH' });
    loadUsuarios(true);
    showAlert('usersMessage', 'Usuario reactivado', 'success');
  } catch (err) { alert(err.message); }
};

// Preparar eliminación permanente
window.prepareDeletePermanent = (userId) => {
  pendingDeletePermanentId = userId;
  document.getElementById('confirmDeletePermanentModal').classList.add('open');
};
document.getElementById('confirmDeletePermanentBtn')?.addEventListener('click', async () => {
  if (!pendingDeletePermanentId) return;
  try {
    await authFetch(`${ADMIN_API}/users/${pendingDeletePermanentId}/permanent`, { method: 'DELETE' });
    document.getElementById('confirmDeletePermanentModal').classList.remove('open');
    loadUsuarios(true);
    showAlert('usersMessage', 'Usuario eliminado permanentemente', 'success');
  } catch (err) { alert(err.message); }
  pendingDeletePermanentId = null;
});
document.getElementById('cancelDeletePermanentBtn')?.addEventListener('click', () => {
  document.getElementById('confirmDeletePermanentModal').classList.remove('open');
  pendingDeletePermanentId = null;
});

// Editar usuario - abre modal con datos
window.editUser = (userId) => {
  window.location.href = `admin-user-detail.html?id=${userId}`;
};

document.getElementById('closeEditModalBtn')?.addEventListener('click', () => {
  document.getElementById('editUserModal').classList.remove('open');
});
document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('editUserId').value;
  const payload = {
    email: document.getElementById('editEmail').value,
    nombre: document.getElementById('editNombre').value,
    apellido: document.getElementById('editApellido').value,
    telefono: document.getElementById('editTelefono').value,
    ci: document.getElementById('editCi')?.value,
    direccion: document.getElementById('editDireccion')?.value,
    especialidad: document.getElementById('editEspecialidad')?.value,
  };
  try {
    const res = await authFetch(`${ADMIN_API}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    document.getElementById('editUserModal').classList.remove('open');
    loadUsuarios(true);
    showAlert('usersMessage', 'Usuario actualizado correctamente', 'success');
  } catch (err) {
    showAlert('editUserAlert', err.message, 'error');
  }
});


// ════════════════════════════════════════
// CAMBIAR CONTRASEÑA
// ════════════════════════════════════════
async function loadStats() {
  try {
    const res = await authFetch(`${ADMIN_API}/stats`);
    const data = await res.json();
    document.getElementById('totalUsuarios').textContent = data.totalUsuarios ?? '—';
    document.getElementById('totalGroomers').textContent = data.totalGroomers ?? '—';
    document.getElementById('totalClientes').textContent = data.totalClientes ?? '—';
    document.getElementById('totalCitas').textContent = data.citasHoy ?? '—';
  } catch { }
}

async function loadProfile() {
  try {
    const res = await authFetch(`${API_URL}/me`);
    const data = await res.json();
    const status2FAEl = document.getElementById('status2FA');
    if (data.twoFactorEnabled) {
      status2FAEl.innerHTML = '✅ Activo';
      status2FAEl.style.color = '#2d5a45';
      const generateBtn = document.getElementById('generate2FABtn');
      if (generateBtn) {
        generateBtn.textContent = '✅ 2FA ya está activo';
        generateBtn.disabled = true;
        const card2fa = document.getElementById('card2fa');
        if (card2fa && !document.getElementById('disable2FABtn')) {
          const disableBtn = document.createElement('button');
          disableBtn.id = 'disable2FABtn';
          disableBtn.className = 'btn btn-outline';
          disableBtn.style.marginTop = '10px';
          disableBtn.textContent = '🔓 Desactivar 2FA';
          card2fa.appendChild(disableBtn);
          disableBtn.addEventListener('click', async () => {
            const totpCode = prompt('Ingresa tu código TOTP actual para desactivar 2FA:');
            if (!totpCode) return;
            try {
              const r = await authFetch(`${API_URL}/2fa/disable`, { method: 'POST', body: JSON.stringify({ totpCode }) });
              const d = await r.json();
              if (!r.ok) throw new Error(d.message);
              alert('✅ 2FA desactivado. Recarga la página.');
              loadProfile();
            } catch (err) { alert(`Error: ${err.message}`); }
          });
        }
      }
    } else {
      status2FAEl.innerHTML = '❌ No activo';
      status2FAEl.style.color = '#dc2626';
    }
  } catch (err) { console.error(err); }
}

document.getElementById('changePasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res = await authFetch(`${API_URL}/change-password`, {
      method: 'POST',
      body: JSON.stringify({
        oldPassword: document.getElementById('oldPassword').value,
        newPassword: document.getElementById('newPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('pwMessage', '✅ Contraseña actualizada. Redirigiendo...', 'success');
    setTimeout(() => { clearTokens(); window.location.href = 'index.html'; }, 2000);
  } catch (err) { showAlert('pwMessage', err.message, 'error'); }
});


// ════════════════════════════════════════
// CREAR RECEPCIONISTA
// ════════════════════════════════════════
document.getElementById('createRecepcionForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    nombre:   document.getElementById('recepcionNombre').value.trim(),
    apellido: document.getElementById('recepcionApellido').value.trim(),
    email:    document.getElementById('recepcionEmail').value.trim(),
    password: document.getElementById('recepcionPassword').value,
    telefono: document.getElementById('recepcionTelefono').value.trim(),
  };
  try {
    const res = await authFetch(`${ADMIN_API}/recepcion`, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showAlert('recepcionMessage', `✅ ${data.message}`, 'success');
    document.getElementById('createRecepcionForm').reset();
    loadStats();
  } catch (err) {
    showAlert('recepcionMessage', err.message, 'error');
  }
});

async function loadSucursales() {
  try {
    const res = await authFetch(`${ADMIN_API}/sucursales`);
    const data = await res.json();
    const select = document.getElementById('groomerSucursal');
    if (select) {
      select.innerHTML = '<option value="">Seleccionar sucursal</option>';
      data.forEach(suc => {
        select.innerHTML += `<option value="${suc.id}">${suc.nombre}</option>`;
      });
    }
  } catch (err) {
    console.error('Error cargando sucursales:', err);
  }
}
// Llama a esta función al inicio (junto con loadProfile, loadStats)
loadSucursales();
// ── Llamar al cargar ──
loadProfile();

loadStats();