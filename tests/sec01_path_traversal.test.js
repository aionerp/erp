const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { server } = require('../server');

test('SEC-01 - Path Traversal e Exposição de Arquivos Confidenciais', async (t) => {
    const TEST_PORT = 3992;
    await new Promise(r => server.listen(TEST_PORT, r));

    function makeRequest(urlPath) {
        return new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${TEST_PORT}${urlPath}`, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
            }).on('error', reject);
        });
    }

    try {
        await t.test('Bloqueia acesso direto a /.env com 403 Forbidden', async () => {
            const res = await makeRequest('/.env');
            assert.strictEqual(res.statusCode, 403, `Esperado 403 para /.env, obtido: ${res.statusCode}`);
            assert.match(res.body, /403 Acesso Proibido/);
        });

        await t.test('Bloqueia Path Traversal /..%2F..%2F.env com 403 Forbidden', async () => {
            const res = await makeRequest('/..%2F..%2F.env');
            assert.strictEqual(res.statusCode, 403, `Esperado 403 para ../../.env, obtido: ${res.statusCode}`);
        });

        await t.test('Bloqueia acesso a /package.json com 403 Forbidden', async () => {
            const res = await makeRequest('/package.json');
            assert.strictEqual(res.statusCode, 403, `Esperado 403 para /package.json, obtido: ${res.statusCode}`);
        });

        await t.test('Bloqueia acesso a /package-lock.json com 403 Forbidden', async () => {
            const res = await makeRequest('/package-lock.json');
            assert.strictEqual(res.statusCode, 403, `Esperado 403 para /package-lock.json, obtido: ${res.statusCode}`);
        });

        await t.test('Bloqueia acesso a /server.js com 403 Forbidden', async () => {
            const res = await makeRequest('/server.js');
            assert.strictEqual(res.statusCode, 403, `Esperado 403 para /server.js, obtido: ${res.statusCode}`);
        });

        await t.test('Bloqueia acesso a /server-api.js com 403 Forbidden', async () => {
            const res = await makeRequest('/server-api.js');
            assert.strictEqual(res.statusCode, 403, `Esperado 403 para /server-api.js, obtido: ${res.statusCode}`);
        });

        await t.test('Permite acesso a arquivos estáticos legítimos (/index.html) com 200 OK e headers de segurança', async () => {
            const res = await makeRequest('/index.html');
            assert.strictEqual(res.statusCode, 200, `Esperado 200 para /index.html, obtido: ${res.statusCode}`);
            assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
            assert.strictEqual(res.headers['x-frame-options'], 'DENY');
        });
    } finally {
        server.close();
    }
});
