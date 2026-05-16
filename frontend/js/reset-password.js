import { API_URL } from './auth.js';

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (!token) {
    alert('Token no válido');
    window.location.href = 'index.html';
}

document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    const messageDiv = document.getElementById('message');

    try {
        const res = await fetch(`${API_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error al restablecer');
        messageDiv.innerHTML = `<span class="success">${data.message}</span>`;
        setTimeout(() => window.location.href = 'index.html', 3000);
    } catch (error) {
        messageDiv.innerHTML = `<span class="error">${error.message}</span>`;
    }
});