import { API_URL } from './auth.js';

const passwordInput = document.getElementById('password');
const strengthDiv = document.getElementById('passwordStrength');
const messageDiv = document.getElementById('message');

passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;
    let strength = 0;
    if (val.length >= 8) strength++;
    if (/[A-Z]/.test(val)) strength++;
    if (/[a-z]/.test(val)) strength++;
    if (/[0-9]/.test(val)) strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;

    strengthDiv.className = 'strength-meter';
    if (strength >= 5) strengthDiv.classList.add('strong');
    else if (strength >= 3) strengthDiv.classList.add('medium');
    else if (strength >= 2) strengthDiv.classList.add('weak');
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    messageDiv.innerHTML = 'Registrando...';

    const data = {
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        nombre: document.getElementById('nombre').value.trim(),
        apellido: document.getElementById('apellido').value.trim(),
        ci: document.getElementById('ci').value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        direccion: document.getElementById('direccion').value.trim()
    };

    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();

        if (!res.ok) throw new Error(result.message);

        messageDiv.innerHTML = `<span class="success">${result.message}</span>`;
        setTimeout(() => window.location.href = 'index.html', 3000);

    } catch (error) {
        messageDiv.innerHTML = `<span class="error">${error.message}</span>`;
    }
});