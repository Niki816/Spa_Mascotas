import { authFetch, getAccessToken, getUser, clearTokens, API_URL } from './auth.js';
const BACKEND_URL = 'http://localhost:4000';
const BASE_API = 'http://localhost:4000/api';
const token = getAccessToken();
const user  = getUser();
if (!token || !user) { window.location.href = 'index.html'; }
if (user?.rol !== 'cliente') { window.location.href = 'dashboard.html'; }

const firstName = user.email.split('@')[0];
document.getElementById('userName').textContent    = firstName;
document.getElementById('sidebarName').textContent = firstName;
document.getElementById('userEmail').textContent   = user.email;
document.getElementById('profileEmail').textContent = user.email;

// ── Navegación ──
const sections = ['inicio', 'mascotas', 'citas', 'tienda', 'perfil', 'facturas'];
document.querySelectorAll('.nav-item[data-section], a[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const sec = link.dataset.section;
    sections.forEach(s => document.getElementById(`section-${s}`).style.display = s === sec ? 'block' : 'none');
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    if (sec === 'mascotas') loadMascotas();
    if (sec === 'citas')    loadCitas();
    if (sec === 'tienda')   { loadCatalogo(); loadCarrito();}
    if (sec === 'facturas') loadFacturas();
       // ← agregar esta línea
  });
});

function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.className = 'alert', 5000);
}

function doLogout() {
  authFetch(`${API_URL}/logout`, { method: 'POST' }).catch(() => {});
  clearTokens();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); doLogout(); });
document.getElementById('logoutBtn2').addEventListener('click', doLogout);

async function loadMascotas() {
  try {
    const res  = await authFetch(`${BASE_API}/clientes/mis-mascotas`);
    const data = await res.json();
    document.getElementById('mascotasCount').textContent = data.length ?? 0;
    document.getElementById('statMascotas').textContent  = data.length ?? 0;
    const container = document.getElementById('mascotasList');
    if (!data.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">🐶</div><p>Aún no tienes mascotas registradas.</p></div>`;
      return;
    }
    container.innerHTML = data.map(m => `
    <div class="mascota-card">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="font-size:32px;">${m.especie === 'gato' ? '🐱' : '🐶'}</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:15px;">${m.nombre}</div>
          <div style="font-size:12px;color:var(--text-light);">${m.especie} · ${m.raza || 'Sin raza'} · ${m.peso_kg ? m.peso_kg + ' kg' : '—'}</div>
          <div style="margin-top:6px; display:flex; gap:6px;">
            ${m.foto_url ? `<div class="carnet-thumb" data-url="${m.foto_url}" onclick="previewCarnet('${m.foto_url}')">📋 Carnet</div>` : ''}
            <button class="btn" style="background:var(--green-pale);color:var(--green-soft);font-size:11px;padding:4px 8px;border:none;border-radius:6px;" onclick="abrirReporte(${m.id}, '${m.nombre}')">
              📊 Reporte
            </button>
            ${!m.foto_url ? `<button class="btn-upload-carnet" onclick="triggerCarnetUpload(${m.id})">📎 Subir carnet</button>` : ''}
          </div>
        </div>
      </div>
    </div>`).join('');
  } catch { }
}

// ── Cargar citas ──
async function loadCitas() {
  try {
    const res  = await authFetch(`${BASE_API}/clientes/mis-citas`);
    const data = await res.json();
    document.getElementById('citasCount').textContent = data.length ?? 0;
    document.getElementById('statCitas').textContent  = data.length ?? 0;
    const container = document.getElementById('citasList');
    if (!data.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>No tienes citas programadas.</p></div>`;
      return;
    }
    const estadoColor = { agendada:'#fbbf24', confirmada:'#22c55e', en_progreso:'#3b82f6', completada:'#6b7280', cancelada:'#ef4444' };
    container.innerHTML = data.map(c => {
    const fecha = new Date(c.fecha_hora_inicio);
    const puedeCancelar = c.estado === 'agendada' || c.estado === 'confirmada';
    return `
      <div style="padding:14px;border:1px solid #f0f5f2;border-radius:10px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${c.servicio}</strong>
          <span style="background:${estadoColor[c.estado] || '#ccc'}22;color:${estadoColor[c.estado] || '#666'};padding:3px 10px;border-radius:12px;font-size:11px;">${c.estado}</span>
        </div>
        <div style="font-size:12px;color:var(--text-light);margin-top:4px;">
          📅 ${fecha.toLocaleString('es-BO')} · 🐶 ${c.mascota}
        </div>
        ${puedeCancelar ? `
          <div style="margin-top:8px;">
            <button class="btn" style="background:#fee2e2;color:#b91c1c;font-size:11px;padding:4px 10px;border:none;border-radius:6px;"
                    onclick="abrirCancelarCita(${c.id}, '${c.fecha_hora_inicio}', '${c.mascota}', '${c.servicio}')">
              ❌ Cancelar
            </button>
          </div>` : ''}
      </div>`;
  }).join('');
  } catch { }
}

// ── Cambiar contraseña ──
document.getElementById('changePasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res  = await authFetch(`${API_URL}/change-password`, {
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

// ── Modal nueva mascota ──
const modalMascota = document.getElementById('modalMascota');
const btnNuevaMascota = document.getElementById('btnNuevaMascota');
const closeModalMascota = document.getElementById('closeModalMascota');

btnNuevaMascota?.addEventListener('click', () => {
  modalMascota.style.display = 'flex';
  document.getElementById('formRegistrarMascota').reset();
  document.getElementById('petMessage').className = 'alert';
  document.getElementById('petMessage').textContent = '';
});

closeModalMascota?.addEventListener('click', () => {
  modalMascota.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === modalMascota) modalMascota.style.display = 'none';
});

// ── Envío del formulario ──
document.getElementById('formRegistrarMascota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  const body = {
    nombre: document.getElementById('petNombre').value.trim(),
    especie: document.getElementById('petEspecie').value,
    raza: document.getElementById('petRaza').value.trim(),
    tamanio: document.getElementById('petTamanio').value,
    fecha_nacimiento: document.getElementById('petFechaNac').value || null,
    temperamento: document.getElementById('petTemperamento').value,
    alergias: document.getElementById('petAlergias').value.trim(),
  };

  const carnetFile = document.getElementById('petCarnet').files[0];

  try {
    // 1. Crear la mascota (sin archivo)
    const res = await authFetch(`${API_URL.replace('/auth', '')}/clientes/mascotas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al registrar');

    // 2. Si hay archivo, subirlo usando el ID de la mascota creada
    if (carnetFile && data.mascota?.id) {
      const formData = new FormData();
      formData.append('carnet', carnetFile);
      const uploadRes = await authFetch(`${API_URL.replace('/auth', '')}/clientes/mascotas/${data.mascota.id}/carnet`, {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        // Si falla la subida, avisamos pero no bloqueamos (el carnet es opcional)
        showAlert('petMessage', '⚠️ Mascota creada, pero falló la subida del carnet: ' + uploadData.message, 'success');
      } else {
        showAlert('petMessage', '✅ Mascota y carnet guardados correctamente', 'success');
      }
    } else {
      showAlert('petMessage', '✅ ' + data.message, 'success');
    }

    modalMascota.style.display = 'none';
    loadMascotas(); // refrescar lista
  } catch (err) {
    showAlert('petMessage', '❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar mascota';
  }
});

// Input file oculto para subir carnet
const inputCarnet = document.createElement('input');
inputCarnet.type = 'file';
inputCarnet.accept = 'image/*,.pdf';
inputCarnet.style.display = 'none';
inputCarnet.id = 'carnetFileInput';
document.body.appendChild(inputCarnet);

let mascotaSeleccionadaParaCarnet = null;

window.triggerCarnetUpload = (mascotaId) => {
  mascotaSeleccionadaParaCarnet = mascotaId;
  inputCarnet.click();
};

inputCarnet.addEventListener('change', async () => {
  if (!inputCarnet.files.length || !mascotaSeleccionadaParaCarnet) return;
  const file = inputCarnet.files[0];
  const formData = new FormData();
  formData.append('carnet', file);

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/clientes/mascotas/${mascotaSeleccionadaParaCarnet}/carnet`, {
      method: 'POST',
      body: formData, // no pongas Content-Type, el navegador lo hará
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al subir');
    showAlert('global', '✅ Carnet subido correctamente', 'success');
    loadMascotas(); // refrescar lista
  } catch (err) {
    showAlert('global', '❌ ' + err.message, 'error');
  } finally {
    inputCarnet.value = '';
    mascotaSeleccionadaParaCarnet = null;
  }
});

// Vista previa al hacer clic en miniatura
window.previewCarnet = (url) => {

  const fullURL = `${BACKEND_URL}${url}`;

  const ext = url.split('.').pop().toLowerCase();

  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {

    const modal = document.createElement('div');

    modal.className = 'modal';

    modal.style.display = 'flex';

    modal.innerHTML = `
      <div class="modal-content" style="text-align:center;">
        <span class="modal-close"
              onclick="this.parentElement.parentElement.remove()">
          &times;
        </span>

        <img src="${fullURL}"
             style="max-width:100%; max-height:80vh;" />
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

  } else {

    window.open(fullURL, '_blank');

  }
};

// ── Modal nueva cita ──
const modalCita = document.getElementById('modalCita');
const btnNuevaCita = document.getElementById('btnNuevaCita');
const closeModalCita = document.getElementById('closeModalCita');

btnNuevaCita?.addEventListener('click', () => {
  modalCita.style.display = 'flex';
  cargarDatosCita(); // llena mascotas, servicios, groomers
  document.getElementById('formNuevaCita').reset();
  document.getElementById('citaMessage').className = 'alert';
  document.getElementById('citaMessage').textContent = '';
  document.getElementById('citaHora').innerHTML = '<option value="">Primero selecciona fecha y servicio</option>';
  document.getElementById('citaHora').disabled = true;
});

closeModalCita?.addEventListener('click', () => {
  modalCita.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === modalCita) modalCita.style.display = 'none';
});

async function cargarDatosCita() {
  try {
    // Mascotas del cliente
    const resM = await authFetch(`${API_URL.replace('/auth', '')}/clientes/mis-mascotas`);
    const mascotas = await resM.json();
    const selMascota = document.getElementById('citaMascota');
    selMascota.innerHTML = '<option value="">Seleccionar mascota...</option>';
    mascotas.forEach(m => {
      selMascota.innerHTML += `<option value="${m.id}">${m.nombre} (${m.especie})</option>`;
    });

    // Servicios
    const resS = await authFetch(`${API_URL.replace('/auth', '')}/clientes/servicios`);
    const servicios = await resS.json();
    const selServicio = document.getElementById('citaServicio');
    selServicio.innerHTML = '<option value="">Seleccionar servicio...</option>';
    servicios.forEach(s => {
      selServicio.innerHTML += `<option value="${s.id}" data-duracion="${s.duracion}" data-precio="${s.precio}">${s.nombre} (${s.duracion} min, Bs ${s.precio})</option>`;
    });

    // Groomers
    const resG = await authFetch(`${API_URL.replace('/auth', '')}/clientes/groomers`);
    const groomers = await resG.json();
    const selGroomer = document.getElementById('citaGroomer');
    selGroomer.innerHTML = '<option value="">Cualquiera disponible</option>';
    groomers.forEach(g => {
      selGroomer.innerHTML += `<option value="${g.id}">${g.nombre} ${g.apellido}</option>`;
    });

    // Fecha mínima = hoy
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('citaFecha').setAttribute('min', hoy);
  } catch (err) {
    console.error('Error cargando datos para cita', err);
  }
}

// Evento cambio de fecha/servicio/groomer -> cargar slots
async function cargarSlots() {
  const fecha = document.getElementById('citaFecha').value;
  const servicio_id = document.getElementById('citaServicio').value;
  const groomer_id = document.getElementById('citaGroomer').value || '';
  const horaSelect = document.getElementById('citaHora');

  if (!fecha || !servicio_id) {
    horaSelect.innerHTML = '<option value="">Primero selecciona fecha y servicio</option>';
    horaSelect.disabled = true;
    return;
  }

  try {
    const params = new URLSearchParams({ fecha, servicio_id });
    if (groomer_id) params.append('groomer_id', groomer_id);
    const res = await authFetch(`${API_URL.replace('/auth', '')}/clientes/slots?${params}`);
    const data = await res.json();
    horaSelect.innerHTML = '';
    if (data.slots && data.slots.length > 0) {
      horaSelect.disabled = false;
      horaSelect.innerHTML = '<option value="">Selecciona un horario</option>';
      data.slots.forEach(slot => {
        horaSelect.innerHTML += `<option value="${slot.inicio}" data-groomer="${slot.groomer_id}">${slot.hora} (Groomer #${slot.groomer_id})</option>`;
      });
    } else {
      horaSelect.innerHTML = '<option value="">No hay horarios disponibles</option>';
      horaSelect.disabled = true;
    }
  } catch (err) {
    console.error(err);
    horaSelect.innerHTML = '<option value="">Error al cargar horarios</option>';
    horaSelect.disabled = true;
  }
}

// Escuchar cambios en fecha, servicio, groomer
['citaFecha', 'citaServicio', 'citaGroomer'].forEach(id => {
  document.getElementById(id).addEventListener('change', cargarSlots);
});

// Mostrar duración y precio al seleccionar servicio
document.getElementById('citaServicio').addEventListener('change', function() {
  const opt = this.options[this.selectedIndex];
  const duracion = opt.getAttribute('data-duracion');
  const precio = opt.getAttribute('data-precio');
  document.getElementById('servicioDuracion').textContent =
    duracion ? `Duración base: ${duracion} min | Precio base: Bs ${precio}` : '';
  cargarSlots(); // actualizar slots
});

// Enviar formulario
document.getElementById('formNuevaCita').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';

  const mascota_id = document.getElementById('citaMascota').value;
  const servicio_id = document.getElementById('citaServicio').value;
  const citaHoraSelect = document.getElementById('citaHora');
  const selectedOption = citaHoraSelect.options[citaHoraSelect.selectedIndex];
  const groomer_id = selectedOption ? selectedOption.dataset.groomer : null;
  const fecha = document.getElementById('citaFecha').value;
  const horaISO = document.getElementById('citaHora').value;
  const notas = document.getElementById('citaNotas').value.trim();

  // Extraer solo la hora HH:MM del ISO
  const hora = horaISO ? new Date(horaISO).toTimeString().slice(0, 5) : '';

  if (!mascota_id || !servicio_id || !fecha || !hora || !groomer_id) {
    showAlert('citaMessage', 'Por favor completa todos los campos obligatorios (incluyendo groomer)', 'error');
    btn.disabled = false;
    btn.textContent = '✅ Solicitar cita';
    return;
  }

  const body = {
    mascota_id: Number(mascota_id),
    servicio_id: Number(servicio_id),
    groomer_id: Number(groomer_id),
    fecha,
    hora,
    notas,
  };

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/clientes/citas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al crear cita');

    showAlert('citaMessage', '✅ Cita solicitada exitosamente. Quedará en revisión.', 'success');
    modalCita.style.display = 'none';
    loadCitas(); // refrescar lista de citas
  } catch (err) {
    showAlert('citaMessage', '❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Solicitar cita';
  }
});

// ── Cancelar cita ──
const modalCancelar = document.getElementById('modalCancelarCita');
const closeModalCancelar = document.getElementById('closeModalCancelar');

closeModalCancelar?.addEventListener('click', () => {
  modalCancelar.style.display = 'none';
});
window.addEventListener('click', (e) => {
  if (e.target === modalCancelar) modalCancelar.style.display = 'none';
});

// Función que se llama desde el botón "Cancelar" en cada cita
window.abrirCancelarCita = (citaId, fechaStr, mascota, servicio) => {
  document.getElementById('cancelarCitaId').value = citaId;
  document.getElementById('cancelarInfo').textContent =
    `Vas a cancelar la cita de ${mascota} - ${servicio} el ${new Date(fechaStr).toLocaleString('es-BO')}`;
  document.getElementById('formCancelarCita').reset();
  document.getElementById('cancelarMessage').className = 'alert';
  document.getElementById('cancelarMessage').textContent = '';
  modalCancelar.style.display = 'flex';
};

document.getElementById('formCancelarCita').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Cancelando...';

  const citaId = document.getElementById('cancelarCitaId').value;
  const motivo = document.getElementById('cancelarMotivo').value;

  try {
    const res = await authFetch(`${API_URL.replace('/auth', '')}/clientes/citas/${citaId}/cancelar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ motivo }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al cancelar');

    showAlert('cancelarMessage', '✅ Cita cancelada correctamente', 'success');
    modalCancelar.style.display = 'none';
    loadCitas(); // refrescar lista
  } catch (err) {
    showAlert('cancelarMessage', '❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🗑️ Confirmar cancelación';
  }
});

// ── Historial de mascota ──
const modalHistorial = document.getElementById('modalHistorial');
const closeModalHistorial = document.getElementById('closeModalHistorial');

closeModalHistorial?.addEventListener('click', () => {
  modalHistorial.style.display = 'none';
});
window.addEventListener('click', (e) => {
  if (e.target === modalHistorial) modalHistorial.style.display = 'none';
});

// ── Reporte de mascota (modal unificado) ──
const modalReporte = document.getElementById('modalReporte');


// ── Modal detalle factura ──
const modalFactura = document.getElementById('modalFacturaDetalle');
const closeModalFactura = document.getElementById('closeModalFactura');
closeModalFactura?.addEventListener('click', () => { modalFactura.style.display = 'none'; });
window.addEventListener('click', (e) => { if (e.target === modalFactura) modalFactura.style.display = 'none'; });

async function verDetalleFactura(facturaId) {
  try {
    modalFactura.style.display = 'flex';
    document.getElementById('facturaDetalleContenido').innerHTML = '<p style="text-align:center;">Cargando...</p>';
    const res = await authFetch(`${BASE_API}/clientes/facturas/${facturaId}`);
    const f = await res.json();
    if (!res.ok) throw new Error(f.message);

    document.getElementById('facturaDetalleContenido').innerHTML = `
      <p><strong>Factura N°:</strong> ${f.numero_factura}</p>
      <p><strong>Fecha:</strong> ${new Date(f.fecha_emision).toLocaleDateString('es-BO', { year:'numeric', month:'long', day:'numeric' })}</p>
      <p><strong>Estado:</strong> <span style="color:${f.estado === 'pagada' ? 'green' : 'orange'}">${f.estado.toUpperCase()}</span></p>
      <p><strong>Método de pago:</strong> ${f.metodo_pago}</p>
      <p><strong>Origen:</strong> ${f.origen}</p>
      ${f.notas ? `<p><strong>Notas:</strong> ${f.notas}</p>` : ''}
      <hr><h3>Detalle</h3>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr style="background:var(--green-pale);"><th>Descripción</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${f.items.map(i => `<tr style="border-bottom:1px solid #eee;"><td>${i.descripcion}</td><td style="text-align:center;">${i.cantidad}</td><td style="text-align:right;">Bs ${i.precio_unitario.toFixed(2)}</td><td style="text-align:right;">Bs ${i.subtotal.toFixed(2)}</td></tr>`).join('')}</tbody>
      </table>
      <div style="margin-top:16px; text-align:right;">
        <p><strong>Subtotal:</strong> Bs ${f.subtotal.toFixed(2)}</p>
        ${f.descuento > 0 ? `<p><strong>Descuento:</strong> -Bs ${f.descuento.toFixed(2)}</p>` : ''}
        ${f.impuesto > 0 ? `<p><strong>Impuesto:</strong> Bs ${f.impuesto.toFixed(2)}</p>` : ''}
        <p style="font-size:1.2em;"><strong>TOTAL: Bs ${f.total.toFixed(2)}</strong></p>
      </div>
      <div style="text-align:center; margin-top:20px;">
        <a href="${BASE_API}/clientes/facturas/${f.id}/pdf" target="_blank" class="btn btn-primary" style="width:auto;">📥 Descargar PDF</a>
      </div>
    `;
  } catch (err) {
    document.getElementById('facturaDetalleContenido').innerHTML = `<p style="color:red;">${err.message}</p>`;
  }
}

window.verDetalleFactura = verDetalleFactura;
const closeModalReporte = document.getElementById('closeModalReporte');

closeModalReporte?.addEventListener('click', () => { modalReporte.style.display = 'none'; });
window.addEventListener('click', (e) => { if (e.target === modalReporte) modalReporte.style.display = 'none'; });

let reporteData = null; // guardamos los datos para las pestañas

window.abrirReporte = async (mascotaId, nombreMascota) => {
  modalReporte.style.display = 'flex';
  document.getElementById('reporteContenido').innerHTML = '<p style="text-align:center;">Cargando reporte...</p>';

  try {
    const res = await authFetch(`${BASE_API}/clientes/mascotas/${mascotaId}/reporte`);
    reporteData = await res.json();
    if (!res.ok) throw new Error(reporteData.message || 'Error al cargar reporte');

    mostrarPestaña('resumen'); // pestaña por defecto
  } catch (err) {
    document.getElementById('reporteContenido').innerHTML = `<p style="color:red;">${err.message}</p>`;
  }
};

function mostrarPestaña(pestana) {
  if (!reporteData) return;
  const { mascota, total_servicios, nivel_fidelidad, descuento, historial, recomendaciones, alertas } = reporteData;

  let html = `<h2 style="font-family:'Playfair Display',serif;">📊 Reporte de ${mascota.nombre}</h2>`;

  // Tabs
  html += `<div class="tabs">
    <div class="tab ${pestana === 'resumen' ? 'active' : ''}" onclick="mostrarPestaña('resumen')">📋 Resumen</div>
    <div class="tab ${pestana === 'historial' ? 'active' : ''}" onclick="mostrarPestaña('historial')">📜 Historial</div>
    <div class="tab ${pestana === 'recomendaciones' ? 'active' : ''}" onclick="mostrarPestaña('recomendaciones')">💡 Recomendaciones</div>
  </div>`;

  if (pestana === 'resumen') {
    html += `<p>${mascota.especie} · ${mascota.raza || 'Sin raza'} · Peso: ${mascota.peso_kg ?? '?'} kg</p>`;
    html += `<p><strong>Servicios completados:</strong> ${total_servicios}</p>`;
    html += `<p><strong>Nivel de fidelidad:</strong> <span class="badge-nivel badge-${nivel_fidelidad.toLowerCase()}">${nivel_fidelidad}</span></p>`;
    if (descuento) html += `<p style="color:green;">🎉 ${descuento}</p>`;
    if (mascota.alergias) html += `<p><strong>Alergias:</strong> ${mascota.alergias}</p>`;
    if (alertas.length > 0) {
      html += `<p><strong>Alertas de salud:</strong></p><ul>`;
      alertas.forEach(a => html += `<li>${a.descripcion} (${new Date(a.creado_en).toLocaleDateString('es-BO')})</li>`);
      html += `</ul>`;
    }
  } else if (pestana === 'historial') {
    if (historial.length === 0) {
      html += `<p>No hay servicios completados.</p>`;
    } else {
      historial.forEach(h => {
        html += `<div style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:10px;">`;
        html += `<strong>${h.servicio}</strong> - ${new Date(h.fecha).toLocaleDateString('es-BO', { year:'numeric', month:'long', day:'numeric' })}`;
        html += `<br>Groomer: ${h.groomer}`;
        if (h.estado_inicial) html += `<br>📝 Estado inicial: ${h.estado_inicial}`;
        if (h.estado_final) html += `<br>✅ Estado final: ${h.estado_final}`;
        if (h.notas_internas) html += `<br>📌 Notas: ${h.notas_internas}`;
        if (h.fotos.antes.length > 0 || h.fotos.despues.length > 0) {
          html += `<div style="display:flex; gap:10px; margin-top:8px;">`;
          h.fotos.antes.forEach(f => html += `<img src="${BACKEND_URL}${f.url}" style="width:100px;height:100px;object-fit:cover;border-radius:6px;" alt="Antes">`);
          h.fotos.despues.forEach(f => html += `<img src="${BACKEND_URL}${f.url}" style="width:100px;height:100px;object-fit:cover;border-radius:6px;" alt="Después">`);
          html += `</div>`;
        }
        html += `</div>`;
      });
    }
  } else if (pestana === 'recomendaciones') {
    if (recomendaciones.length === 0) {
      html += `<p>No hay recomendaciones registradas.</p>`;
    } else {
      recomendaciones.forEach(r => {
        html += `<div style="border-left:4px solid var(--green-soft); padding-left:12px; margin-bottom:8px;">
          <p>${r.descripcion}</p>
          <small>${new Date(r.creado_en).toLocaleDateString('es-BO')}</small>
        </div>`;
      });
    }
  }

  document.getElementById('reporteContenido').innerHTML = html;
}
window.mostrarPestaña = mostrarPestaña;

// Función auxiliar para previsualizar una imagen en grande (reutilizable)
window.previewImage = (url) => {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="text-align:center;">
      <span class="modal-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
      <img src="${url}" style="max-width:100%; max-height:80vh;" />
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
};

// ── Sección Tienda ──
const loadCatalogo = async () => {
  try {
    const res = await authFetch(`${BASE_API}/clientes/productos`);
    const productos = await res.json();
    const grid = document.getElementById('catalogoProductos');

    if (!productos.length) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">🛍️</div><p>No hay productos disponibles.</p></div>`;
      return;
    }

    let html = '';
    productos.forEach(p => {
      let imgSrc = '<span style="font-size:64px;">📦</span>';
      if (p.imagen_url) {
        let urlLimpia = String(p.imagen_url).trim();
        // Si empieza con http/https, la usamos tal cual
        if (urlLimpia.startsWith('http')) {
          imgSrc = `<img src="${urlLimpia}" alt="${p.nombre}">`;
        }
        // Si empieza con /, asumimos que es relativa a nuestro servidor
        else if (urlLimpia.startsWith('/')) {
          imgSrc = `<img src="${BACKEND_URL}${urlLimpia}" alt="${p.nombre}">`;
        }
        // Si no tiene barra inicial pero no es una URL, le ponemos la barra y el servidor
        else if (urlLimpia.length > 0) {
          imgSrc = `<img src="${BACKEND_URL}/${urlLimpia}" alt="${p.nombre}">`;
        }
        // Si está vacía, queda el placeholder
      }

      const tieneVariantes = p.variantes && p.variantes.length > 0;

      const variantesOptions = tieneVariantes
        ? p.variantes.map(v =>
            `<option value="${v.id}" data-precio="${v.precio_final}" data-stock="${v.stock}">
              ${v.atributo}: ${v.valor} (+Bs ${v.precio_extra})
            </option>`
          ).join('')
        : '';

      const precioBase = p.precio_base.toFixed(2);

      const stockMessage = p.agotado
        ? '<span style="color:#e74c3c;">❌ Agotado</span>'
        : `Disponible: ${p.stock}`;

      html += `
        <div class="producto-card">
          <div class="img-container">${imgSrc}</div>
          <div class="card-body">
            <div class="nombre">${p.nombre}</div>
            <div class="categoria">${p.categoria}</div>
            <div class="precio">
              Bs ${precioBase}
              <span class="precio-extra" id="precioExtra_${p.id}"></span>
            </div>
            ${tieneVariantes ? `
              <select id="variante_${p.id}" onchange="actualizarPrecio(${p.id}, ${p.precio_base})">
                <option value="">Sin variante</option>
                ${variantesOptions}
              </select>` : ''}
            <input type="number" id="cant_${p.id}" value="1" min="1" max="${p.stock}">
            <div class="stock-info">${stockMessage}</div>
            <button class="btn-agregar" onclick="agregarAlCarrito(${p.id})"
              ${p.agotado ? 'disabled' : ''}>
              🛒 Agregar
            </button>
          </div>
        </div>`;
    });

    grid.innerHTML = html;
  } catch (err) {
    console.error('Error cargando catálogo', err);
  }
};

// Actualiza el precio mostrado según la variante seleccionada
window.actualizarPrecio = (productoId, precioBase) => {
  const select = document.getElementById(`variante_${productoId}`);
  const precioExtraSpan = document.getElementById(`precioExtra_${productoId}`);
  if (!select || !precioExtraSpan) return;

  const selectedOption = select.options[select.selectedIndex];
  if (selectedOption && selectedOption.dataset.precio) {
    const precioFinal = parseFloat(selectedOption.dataset.precio).toFixed(2);
    precioExtraSpan.textContent = `(Final: Bs ${precioFinal})`;
  } else {
    precioExtraSpan.textContent = '';
  }
};

const loadCarrito = async () => {
  try {
    const res = await authFetch(`${BASE_API}/clientes/carrito`);
    const data = await res.json();
    const { items, total } = data;
    document.getElementById('carritoTotal').textContent = `Total: Bs ${total.toFixed(2)}`;
    const container = document.getElementById('carritoItems');

    if (!items || items.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="icon">🛒</div><p>Carrito vacío.</p></div>`;
      return;
    }

    let html = '';
    items.forEach(item => {
      html += `
        <div class="carrito-item">
          <div class="item-info">
            <div class="nombre">${item.producto_nombre}</div>
            ${item.variante_descripcion ? `<div class="variante">${item.variante_descripcion}</div>` : ''}
          </div>
          <div class="item-actions">
            <input type="number" value="${item.cantidad}" min="1"
              onchange="actualizarItem(${item.id}, this.value)">
            <span style="font-weight:600; min-width:50px;">Bs ${item.subtotal.toFixed(2)}</span>
            <button class="btn-delete" onclick="eliminarItem(${item.id})">🗑️</button>
          </div>
        </div>`;
    });
    container.innerHTML = html;
  } catch (err) { console.error(err); }
};

// Funciones globales para el catálogo/carrito
window.agregarAlCarrito = async (productoId) => {
  const varianteSelect = document.getElementById(`variante_${productoId}`);
  const varianteId = varianteSelect.value || null;
  const cantidad = parseInt(document.getElementById(`cant_${productoId}`).value) || 1;
  try {
    const res = await authFetch(`${BASE_API}/clientes/carrito`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: productoId, variante_id: varianteId ? Number(varianteId) : null, cantidad }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    loadCarrito();
  } catch (err) { alert(err.message); }
};

window.actualizarItem = async (itemId, cantidad) => {
  try {
    const res = await authFetch(`${BASE_API}/clientes/carrito/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: Number(cantidad) }),
    });
    if (!res.ok) throw new Error('Error al actualizar');
    loadCarrito();
  } catch (err) { alert(err.message); }
};

window.eliminarItem = async (itemId) => {
  try {
    const res = await authFetch(`${BASE_API}/clientes/carrito/${itemId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    loadCarrito();
  } catch (err) { alert(err.message); }
};


// ── Pedido ──
const modalPedido = document.getElementById('modalPedido');
const closeModalPedido = document.getElementById('closeModalPedido');
const btnPedirCarrito = document.getElementById('btnPedirCarrito');

btnPedirCarrito?.addEventListener('click', async () => {
  // Mostrar resumen del carrito antes de pedir
  try {
    const res = await authFetch(`${BASE_API}/clientes/carrito`);
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      alert('El carrito está vacío.');
      return;
    }
    let html = '<h3>Resumen del carrito</h3>';
    data.items.forEach(item => {
      html += `<p>${item.producto_nombre} ${item.variante_descripcion ? '(' + item.variante_descripcion + ')' : ''} x${item.cantidad} — Bs ${item.subtotal.toFixed(2)}</p>`;
    });
    html += `<p><strong>Total: Bs ${data.total.toFixed(2)}</strong></p>`;
    document.getElementById('pedidoResumen').innerHTML = html;
    document.getElementById('formPedido').reset(); // por si acaso, aunque el select ya no exista
    document.getElementById('pedidoMessage').className = 'alert';
    document.getElementById('pedidoMessage').textContent = '';
    document.getElementById('pedidoMessage').className = 'alert';
    document.getElementById('pedidoMessage').textContent = '';
    modalPedido.style.display = 'flex';
  } catch (err) { alert('Error al cargar carrito'); }
});

closeModalPedido?.addEventListener('click', () => { modalPedido.style.display = 'none'; });
window.addEventListener('click', (e) => { if (e.target === modalPedido) modalPedido.style.display = 'none'; });

document.getElementById('formPedido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Creando pedido...';

  try {
    const res = await authFetch(`${BASE_API}/clientes/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // No necesita enviar método de contacto
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || 'Error al crear pedido');

    // ── Manejar la respuesta del envío automático ────────────────
    const wa = data.whatsapp || {};

    if (wa.enviado) {
      showAlert('pedidoMessage', '✅ Pedido creado y resumen enviado a tu WhatsApp.', 'success');
    } else if (wa.numero_no_existe_wa) {
      showAlert('pedidoMessage', '⚠️ Tu número de teléfono no está activo en WhatsApp. Comunicate con recepción.', 'error');
    } else {
      // Falló el envío por otro motivo
      showAlert('pedidoMessage', '⚠️ No se pudo enviar el resumen por WhatsApp. Comunicate con recepción.', 'error');
    }

    modalPedido.style.display = 'none';
    loadCarrito(); // refrescar carrito (vacío)

  } catch (err) {
    showAlert('pedidoMessage', '❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Confirmar y enviar resumen';
  }
});

// ── Facturas ──
async function loadFacturas() {
  try {
    const res = await authFetch(`${BASE_API}/clientes/facturas`);
    const data = await res.json();
    document.getElementById('facturasCount').textContent = data.length ?? 0;
    const container = document.getElementById('facturasList');
    if (!data.length) {
      container.innerHTML = `<div class="empty-state"><div class="icon">🧾</div><p>No tienes facturas registradas.</p></div>`;
      return;
    }
    container.innerHTML = data.map(f => `
      <div style="padding:14px; border:1px solid #f0f5f2; border-radius:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
        <div style="cursor:pointer;" onclick="verDetalleFactura(${f.id})">
          <div style="font-weight:600; color:var(--green-soft);">#${f.numero_factura}</div>
          <div style="font-size:12px; color:var(--text-light);">${new Date(f.fecha_emision).toLocaleDateString('es-BO')} · ${f.origen}</div>
          <div style="font-size:12px; margin-top:2px;">Estado: <span style="color:${f.estado === 'pagada' ? 'green' : 'orange'}">${f.estado}</span></div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;">Bs ${f.total.toFixed(2)}</div>
          <button onclick="verDetalleFactura(${f.id})" class="btn" style="background:var(--green-pale); color:var(--green-soft); font-size:11px; padding:4px 8px; margin-top:4px;">🔍 Ver</button>
        </div>
      </div>
    `).join('');
  } catch { }
}

// Llamar al cargar la sección de facturas
document.querySelector('[data-section="facturas"]').addEventListener('click', loadFacturas);