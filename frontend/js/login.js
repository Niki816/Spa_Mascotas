import { setTokens, saveUser, API_URL } from './auth.js';

const form       = document.getElementById('loginForm');
const messageDiv = document.getElementById('message');
const totpGroup  = document.getElementById('totpGroup');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageDiv.innerHTML = 'Cargando...';

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const totpCode = document.getElementById('totpCode').value.trim();

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, totpCode: totpCode || undefined })
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.message === 'Código 2FA requerido') {
        totpGroup.style.display = 'block';
        messageDiv.innerHTML = '<span style="color:orange">Ingresa tu código 2FA</span>';
        return;
      }
      throw new Error(data.message || 'Error en login');
    }

    setTokens(data.accessToken, data.refreshToken);
    saveUser({ email, rol: data.rol });
    messageDiv.innerHTML = '<span style="color:green">¡Bienvenido! Redirigiendo...</span>';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);

  } catch (error) {
    messageDiv.innerHTML = `<span class="error">${error.message}</span>`;
  }
});

// Olvidé contraseña
document.getElementById('forgotPasswordLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = prompt('Ingresa tu email:');
  if (!email) return;
  try {
    const res  = await fetch(`${API_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    alert(data.message);
  } catch {
    alert('Error al solicitar recuperación');
  }
});

// Reenviar verificación
document.getElementById('resendVerificationLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = prompt('Ingresa tu email para reenviar la verificación:');
  if (!email) return;
  try {
    const res  = await fetch(`${API_URL}/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    alert(data.message);
  } catch {
    alert('Error al reenviar verificación');
  }
});

// Emergencia 2FA
document.getElementById('emergency2FALink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email    = prompt('Tu email de administrador:');
  if (!email) return;
  const password = prompt('Tu contraseña:');
  if (!password) return;

  try {
    const res  = await fetch(`${API_URL}/2fa/emergency-disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    alert(data.message);
  } catch {
    alert('Error al conectar con el servidor');
  }
});