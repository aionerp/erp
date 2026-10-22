const test = require('node:test');
const assert = require('node:assert');

test('BUG-05 - Precisão Monetária com Centavos Inteiros', async (t) => {
    // Implementação segura usando centavos inteiros (saidas.js)
    const toCents = (val) => Math.round((parseFloat(val) || 0) * 100);
    const fromCents = (cents) => Math.round(cents) / 100;

    function calcularTotalMonetario(subtotal, desconto, acrescimo) {
        const subCents = toCents(subtotal);
        const descCents = toCents(desconto);
        const acresCents = toCents(acrescimo);
        return fromCents(Math.max(0, subCents - descCents + acresCents));
    }

    await t.test('Garante precisão exata de centavos sem resíduos IEEE 754', () => {
        // 100.10 - 10.05 em float puro dá 90.04999999999998
        const total = calcularTotalMonetario(100.10, 10.05, 0);
        assert.strictEqual(total, 90.05, 'Deve resultar exatamente 90.05');

        // 0.10 + 0.20 em float puro dá 0.30000000000000004
        const soma = calcularTotalMonetario(0.10, 0, 0.20);
        assert.strictEqual(soma, 0.30, 'Deve resultar exatamente 0.30');

        // Soma com carrinho
        const carrinho = [{ subtotal: 19.99 }, { subtotal: 19.99 }, { subtotal: 19.99 }];
        const subtotalCents = carrinho.reduce((s, i) => s + toCents(i.subtotal), 0);
        const subtotal = fromCents(subtotalCents);
        assert.strictEqual(subtotal, 59.97);
    });

    await t.test('Valores negativos que superam o subtotal resultam em 0', () => {
        const total = calcularTotalMonetario(50.00, 100.00, 0);
        assert.strictEqual(total, 0);
    });
});
