export const API_URL = 'http://localhost:4000/api/auth'; // ← export es CRÍTICO
export const API_BASE = 'http://localhost:4000/api';     // ← para el resto
export function setTokens(accessToken, refreshToken) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
}

export function getAccessToken() {
    return localStorage.getItem('accessToken');
}

export function getRefreshToken() {
    return localStorage.getItem('refreshToken');
}

export function clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
}

export function saveUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
}

export function getUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
}

export async function authFetch(url, options = {}) {
    let accessToken = getAccessToken();
    
    // ✅ Si el body es FormData, NO pongas Content-Type
    const isFormData = options.body instanceof FormData;
    
    options.headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`
    };

    let response = await fetch(url, options);

    if (response.status === 401) {
        const refreshToken = getRefreshToken();
        if (refreshToken) {
            const refreshRes = await fetch(`${API_URL}/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });
            if (refreshRes.ok) {
                const { accessToken: newAt, refreshToken: newRt } = await refreshRes.json();
                setTokens(newAt, newRt);
                options.headers['Authorization'] = `Bearer ${newAt}`;
                response = await fetch(url, options);
            } else {
                clearTokens();
                window.location.href = 'index.html';
                throw new Error('Sesión expirada');
            }
        } else {
            clearTokens();
            window.location.href = 'index.html';
            throw new Error('No autenticado');
        }
    }
    return response;
}