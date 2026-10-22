const test = require('node:test');
const assert = require('node:assert');
const Security = require('../js/security');

test('SEC-10 - Proteção contra Stored XSS no Frontend', async (t) => {
    await t.test('Security.sanitizeHtml escapa tags script e eventos maliciosos', () => {
        const payloadScript = '<script>alert("XSS")</script>';
        const escapedScript = Security.sanitizeHtml(payloadScript);
        assert.strictEqual(escapedScript.includes('<script>'), false);
        assert.strictEqual(escapedScript, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');

        const payloadImg = '<img src=x onerror=alert(1)>';
        const escapedImg = Security.sanitizeHtml(payloadImg);
        assert.strictEqual(escapedImg.includes('<img'), false);
        assert.strictEqual(escapedImg, '&lt;img src=x onerror=alert(1)&gt;');
    });

    await t.test('Security.sanitizeHtml lida com valores null, undefined e números com segurança', () => {
        assert.strictEqual(Security.sanitizeHtml(null), '');
        assert.strictEqual(Security.sanitizeHtml(undefined), '');
        assert.strictEqual(Security.sanitizeHtml(12345), '12345');
        assert.strictEqual(Security.sanitizeHtml(0), '0');
    });

    await t.test('Simulação de render seguro de cliente não permite injeção de HTML no DOM', () => {
        const escapeHtml = (str) => Security.sanitizeHtml(str);

        const clienteMalicioso = {
            id: 1,
            nome: '<img src=x onerror=alert(1)>',
            cpf_cnpj: '"><script>alert(2)</script>',
            telefone: '<b>119999</b>',
            email: '"><svg onload=alert(3)>',
            cidade: 'SP',
            estado: 'SP'
        };

        const html = `
            <tr>
                <td>${Number(clienteMalicioso.id)}</td>
                <td><strong>${escapeHtml(clienteMalicioso.nome || '-')}</strong><br><small>${escapeHtml(clienteMalicioso.cpf_cnpj || '')}</small></td>
                <td>${escapeHtml(clienteMalicioso.telefone || '-')}</td>
                <td>${escapeHtml(clienteMalicioso.email || '-')}</td>
                <td>${escapeHtml(clienteMalicioso.cidade || '-')}/${escapeHtml(clienteMalicioso.estado || '-')}</td>
            </tr>
        `;

        assert.strictEqual(html.includes('<img src=x onerror=alert(1)>'), false);
        assert.strictEqual(html.includes('<script>'), false);
        assert.strictEqual(html.includes('<svg onload='), false);
        assert.strictEqual(html.includes('&lt;img src=x onerror=alert(1)&gt;'), true);
    });
});
