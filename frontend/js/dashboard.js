import { setTokens, saveUser, getAccessToken, getUser, clearTokens } from './auth.js';

// ── 1. Leer tokens de Google OAuth desde la URL (si vienen) ──
const urlParams = new URLSearchParams(window.location.search);
const oauthToken    = urlParams.get('token');
const oauthRefresh  = urlParams.get('refreshToken');
const oauthEmail    = urlParams.get('email');
const oauthRol      = urlParams.get('rol');
const oauthError    = urlParams.get('error');

if (oauthError) {
  // Google OAuth falló
  clearTokens();
  window.location.href = 'index.html?error=oauth';
  throw new Error('OAuth error');
}

if (oauthToken && oauthRefresh && oauthEmail && oauthRol) {
  // Guardar tokens que vienen del callback de Google
  setTokens(oauthToken, oauthRefresh);
  saveUser({ email: oauthEmail, rol: oauthRol });
  // Limpiar la URL (quitar los params sensibles)
  window.history.replaceState({}, document.title, window.location.pathname);
}

// ── 2. Verificar sesión ──
const token = getAccessToken();
const user  = getUser();

if (!token || !user) {
  clearTokens();
  window.location.href = 'index.html';
  throw new Error('No autenticado');
}

// ── 3. Redirigir según rol ──
const RUTAS = {
  admin:   'admin-dashboard.html',
  groomer: 'groomer-dashboard.html',
  cliente: 'cliente-dashboard.html',
};

const destino = RUTAS[user.rol];

if (!destino) {
  // Rol desconocido — limpiar y volver al login
  clearTokens();
  window.location.href = 'index.html';
} else {
  window.location.href = destino;
}