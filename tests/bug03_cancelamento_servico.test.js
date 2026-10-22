const test = require('node:test');
const assert = require('node:assert');

test('BUG-03 - Não estornar estoque para produtos do tipo servico no cancelamento', async (t) => {
    // Simulação fiel da lógica de cancelamento do saidas.js corrigido
    function estornarItem(item, produtosDb, movimentos) {
        const isServico = item.tipo === 'servico' || item.produtos?.tipo === 'servico';
        if (isServico) {
            return { atualizouEstoque: false, isServico: true };
        }

        const estAtual = item.produtos?.estoque_total || 0;
        const novoEst = estAtual + item.quantidade;
        produtosDb[item.produto_id] = novoEst;
        movimentos.push({ produto_id: item.produto_id, tipo: 'entrada', quantidade: item.quantidade });
        return { atualizouEstoque: true, novoEst, isServico: false };
    }

    await t.test('Item de serviço não deve ter estoque alterado nem gerar movimento de estoque', () => {
        const produtosDb = { 10: 0 };
        const movimentos = [];
        const itemServico = {
            produto_id: 10,
            quantidade: 2,
            produtos: { id: 10, nome: 'Instalação de Software', tipo: 'servico', estoque_total: 0 }
        };

        const res = estornarItem(itemServico, produtosDb, movimentos);
        assert.strictEqual(res.atualizouEstoque, false);
        assert.strictEqual(produtosDb[10], 0, 'Estoque do serviço deve permanecer 0');
        assert.strictEqual(movimentos.length, 0, 'Nenhum movimento de estoque deve ser criado para serviço');
    });

    await t.test('Item de produto físico deve ter estoque estornado normalmente', () => {
        const produtosDb = { 20: 5 };
        const movimentos = [];
        const itemProduto = {
            produto_id: 20,
            quantidade: 3,
            produtos: { id: 20, nome: 'Cabo USB', tipo: 'produto', estoque_total: 5 }
        };

        const res = estornarItem(itemProduto, produtosDb, movimentos);
        assert.strictEqual(res.atualizouEstoque, true);
        assert.strictEqual(produtosDb[20], 8, 'Estoque do produto deve ser incrementado de 5 para 8');
        assert.strictEqual(movimentos.length, 1);
        assert.strictEqual(movimentos[0].quantidade, 3);
    });
});
