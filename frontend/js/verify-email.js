import { API_URL } from './auth.js';

const titleEl   = document.getElementById('title');
const messageEl = document.getElementById('message');
const actionsEl = document.getElementById('actions');

const params = new URLSearchParams(window.location.search);
const token  = params.get('token');

async function verificar() {
  if (!token) {
    titleEl.innerText   = '❌ Token inválido';
    messageEl.innerText = 'No se encontró ningún token en el enlace.';
    actionsEl.innerHTML = `<a href="index.html">Volver al inicio</a>`;
    return;
  }

  try {
    const res  = await fetch(`${API_URL}/verify-email/${token}`);
    const data = await res.json();

    if (res.ok) {
      titleEl.innerText   = '✅ ¡Email verificado!';
      messageEl.innerText = data.message;
      actionsEl.innerHTML = `<a href="index.html" style="color:#2c7a2c;font-weight:bold;">
        Ir al inicio de sesión →
      </a>`;
    } else {
      titleEl.innerText   = '❌ Error de verificación';
      messageEl.innerText = data.message || 'Token inválido o expirado.';
      actionsEl.innerHTML = `<a href="index.html">Volver al inicio</a>`;
    }
  } catch {
    titleEl.innerText   = '❌ Error de conexión';
    messageEl.innerText = 'No se pudo conectar con el servidor.';
  }
}

verificar();