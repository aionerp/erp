const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { handleApiRequest } = require('../server-api');

test('SEC-02 a SEC-05 - Proteção contra SQL Injection e RPC Não Autorizado', async (t) => {
    const TEST_PORT = 3993;
    const server = http.createServer(async (req, res) => {
        if (req.url.startsWith('/api/')) {
            const handled = await handleApiRequest(req, res);
            if (handled) return;
        }
        res.writeHead(404);
        res.end();
    });

    await new Promise(r => server.listen(TEST_PORT, r));

    function makePost(path, body) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(body);
            const req = http.request({
                hostname: '127.0.0.1',
                port: TEST_PORT,
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
                    } catch (e) {
                        resolve({ statusCode: res.statusCode, headers: res.headers, raw: data });
                    }
                });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }

    try {
        await t.test('SEC-02: Rejeita tabela não permitida / fora da allowlist com HTTP 400', async () => {
            const res = await makePost('/api/data/cliente01/pg_user', {
                action: 'select',
                select: '*'
            });
            assert.strictEqual(res.statusCode, 400, `Esperado 400 para tabela não permitida, obtido: ${res.statusCode}`);
        });

        await t.test('SEC-02: Rejeita subqueries maliciosas na cláusula select com HTTP 400', async () => {
            const res = await makePost('/api/data/cliente01/produtos', {
                action: 'select',
                select: '*, (SELECT senha FROM public.usuarios LIMIT 1) as secret'
            });
            assert.strictEqual(res.statusCode, 400, `Esperado 400 para subquery maliciosa no select, obtido: ${res.statusCode}`);
        });

        await t.test('SEC-03: Rejeita operador SQL malicioso em filtros com HTTP 400', async () => {
            const res = await makePost('/api/data/cliente01/produtos', {
                action: 'select',
                select: 'id, nome',
                filters: [{ column: 'id', operator: '= 1 OR 1=1 --', value: 1 }]
            });
            assert.strictEqual(res.statusCode, 400, `Esperado 400 para operador malicioso, obtido: ${res.statusCode}`);
        });

        await t.test('SEC-03: Rejeita coluna maliciosa em filtros com HTTP 400', async () => {
            const res = await makePost('/api/data/cliente01/produtos', {
                action: 'select',
                select: 'id, nome',
                filters: [{ column: 'id = 1; DROP TABLE produtos; --', operator: '=', value: 1 }]
            });
            assert.strictEqual(res.statusCode, 400, `Esperado 400 para coluna maliciosa, obtido: ${res.statusCode}`);
        });

        await t.test('SEC-04: Rejeita SQL Injection na coluna de ordenação order.column com HTTP 400', async () => {
            const res = await makePost('/api/data/cliente01/produtos', {
                action: 'select',
                select: 'id, nome',
                order: { column: '(CASE WHEN (SELECT 1)=1 THEN id ELSE nome END)' }
            });
            assert.strictEqual(res.statusCode, 400, `Esperado 400 para order.column malicioso, obtido: ${res.statusCode}`);
        });

        await t.test('SEC-05: Bloqueia chamadas RPC fora da allowlist com HTTP 403', async () => {
            const res = await makePost('/api/rpc/cliente01/pg_sleep', {
                seconds: 5
            });
            assert.strictEqual(res.statusCode, 403, `Esperado 403 para RPC fora da allowlist, obtido: ${res.statusCode}`);
        });

        await t.test('SEC-09: Respostas de erro não devem vazar err.detail ou stack interno', async () => {
            const res = await makePost('/api/data/cliente01/produtos', {
                action: 'invalid_action'
            });
            assert.strictEqual(res.body?.error?.detail, undefined, 'Não deve expor err.detail');
        });
    } finally {
        server.close();
    }
});
