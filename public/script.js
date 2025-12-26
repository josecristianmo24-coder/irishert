const form = document.getElementById('uploadForm');
const result = document.getElementById('result');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) return;
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    result.textContent = 'Subiendo...';
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        let data;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            data = await res.json();
        } else {
            data = { error: await res.text() };
        }
        if (res.ok && data.link) {
            const a = document.createElement('a');
            a.href = data.link;
            a.textContent = data.link;
            a.target = '_blank';
            result.innerHTML = '';
            result.appendChild(a);
        } else {
            result.textContent = data.error || ('Error en la subida (status ' + res.status + ')');
        }
    } catch (err) {
        result.textContent = 'Error: ' + err.message;
    }
});