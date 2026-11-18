// tests/relatorio_inventario.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

// Função de cálculo do inventário (mesma regra implementada em relatorios.js)
function calcularInventario(produtos, filtros = {}) {
    const {
        filtroSaldo = 'positivo',
        filtroCategoria = '',
        filtroProduto = '',
        filtroCodigoRef = ''
    } = filtros;

    const obterSaldo = (p) => {
        if (p.estoque_total !== null && p.estoque_total !== undefined && p.estoque_total !== 0) {
            return Number(p.estoque_total);
        }
        if (p.estoque !== null && p.estoque !== undefined) {
            return Number(p.estoque);
        }
        return Number(p.estoque_total) || 0;
    };

    const filtrados = produtos.filter(p => {
        if (p.tipo === 'servico') return false;
        if ((p.nome || '').trim().toLowerCase() === 'serviço' && (!p.valor_compra || Number(p.valor_compra) === 0)) return false;

        const saldo = obterSaldo(p);
        if (filtroSaldo === 'positivo' && saldo <= 0) return false;
        if (filtroSaldo === 'zero' && saldo !== 0) return false;
        if (filtroSaldo === 'negativo' && saldo >= 0) return false;

        if (filtroCategoria && (p.categoria || '') !== filtroCategoria) return false;

        if (filtroProduto) {
            const termo = filtroProduto.toLowerCase();
            const nomeMatch = (p.nome || '').toLowerCase().includes(termo);
            const descMatch = (p.descricao || '').toLowerCase().includes(termo);
            if (!nomeMatch && !descMatch) return false;
        }

        if (filtroCodigoRef) {
            const termo = filtroCodigoRef.toLowerCase();
            const codMatch = (p.codigo || '').toLowerCase().includes(termo);
            const modMatch = (p.modelo || '').toLowerCase().includes(termo);
            const marMatch = (p.marca || '').toLowerCase().includes(termo);
            const barrasMatch = Array.isArray(p.codigos_barras) && p.codigos_barras.some(b => String(b).toLowerCase().includes(termo));
            if (!codMatch && !modMatch && !marMatch && !barrasMatch) return false;
        }

        return true;
    });

    const itens = filtrados.map(p => {
        const saldo = obterSaldo(p);
        const custoUnit = Number(p.valor_compra) || 0;
        const vendaUnit = Number(p.valor_venda) || 0;
        const totalCusto = saldo * custoUnit;
        const totalVenda = saldo * vendaUnit;
        const lucroPotencial = totalVenda - totalCusto;

        let referencia = p.modelo ? (p.marca ? `${p.modelo} (${p.marca})` : p.modelo) : (p.marca || '-');
        if (referencia === '-' && Array.isArray(p.codigos_barras) && p.codigos_barras.length > 0) {
            referencia = p.codigos_barras[0];
        }

        return {
            codigo: p.codigo || '-',
            nome: p.nome,
            referencia,
            categoria: p.categoria || 'Geral',
            saldo,
            custoUnit,
            totalCusto,
            vendaUnit,
            totalVenda,
            lucroPotencial
        };
    });

    const totalQtd = itens.reduce((acc, i) => acc + i.saldo, 0);
    const totalCusto = itens.reduce((acc, i) => acc + i.totalCusto, 0);
    const totalVenda = itens.reduce((acc, i) => acc + i.totalVenda, 0);
    const totalLucro = totalVenda - totalCusto;
    const margemPotencial = totalVenda > 0 ? (totalLucro / totalVenda) * 100 : 0;

    return {
        itens,
        totais: {
            totalQtd,
            totalCusto,
            totalVenda,
            totalLucro,
            margemPotencial
        }
    };
}

test('Relatório Registro de Inventário - Cálculos e Regras de Negócio', async (t) => {
    const mockProdutos = [
        {
            codigo: 'A001',
            nome: 'Pneu Dianteiro Titan 150',
            modelo: 'Levorin',
            marca: 'Matrix',
            categoria: 'PNEUS',
            estoque: 10,
            valor_compra: 80.00,
            valor_venda: 150.00,
            tipo: 'produto'
        },
        {
            codigo: 'A002',
            nome: 'Óleo Motor 20W50 4T',
            modelo: 'Mobil Super',
            marca: 'Mobil',
            categoria: 'LUBRIFICANTES',
            estoque: 25,
            valor_compra: 18.00,
            valor_venda: 35.00,
            tipo: 'produto'
        },
        {
            codigo: 'A003',
            nome: 'Lâmpada Farol H4',
            modelo: 'Standard',
            marca: 'Philips',
            categoria: 'ILUMINACAO',
            estoque: 0, // Saldo Zero
            valor_compra: 10.00,
            valor_venda: 25.00,
            tipo: 'produto'
        },
        {
            codigo: 'A004',
            nome: 'Câmara de Ar 18',
            modelo: 'Rinaldi',
            marca: 'Rinaldi',
            categoria: 'PNEUS',
            estoque: -2, // Saldo Negativo
            valor_compra: 15.00,
            valor_venda: 30.00,
            tipo: 'produto'
        },
        {
            codigo: 'S001',
            nome: 'Troca de Óleo e Filtro',
            modelo: '',
            marca: '',
            categoria: 'SERVICOS',
            estoque: 0,
            valor_compra: 0.00,
            valor_venda: 30.00,
            tipo: 'servico' // Deve ser ignorado pelo inventário físico
        }
    ];

    await t.test('1. Visão padrão (Saldo positivo) deve ignorar produtos com saldo zero e negativo', () => {
        const res = calcularInventario(mockProdutos, { filtroSaldo: 'positivo' });
        assert.equal(res.itens.length, 2);
        assert.equal(res.itens.some(i => i.codigo === 'A003'), false, 'Não deve conter produto com saldo 0');
        assert.equal(res.itens.some(i => i.codigo === 'A004'), false, 'Não deve conter produto com saldo negativo');
        assert.equal(res.itens.some(i => i.codigo === 'S001'), false, 'Não deve conter serviços');

        // Totais
        assert.equal(res.totais.totalQtd, 35); // 10 + 25
        assert.equal(res.totais.totalCusto, 10 * 80 + 25 * 18); // 800 + 450 = 1250
        assert.equal(res.totais.totalVenda, 10 * 150 + 25 * 35); // 1500 + 875 = 2375
        assert.equal(res.totais.totalLucro, 2375 - 1250); // 1125
    });

    await t.test('2. Filtro Saldo Zero deve trazer produtos zerados para identificar necessidade de reposição', () => {
        const res = calcularInventario(mockProdutos, { filtroSaldo: 'zero' });
        assert.equal(res.itens.length, 1);
        assert.equal(res.itens[0].codigo, 'A003');
        assert.equal(res.itens[0].saldo, 0);
        assert.equal(res.totais.totalQtd, 0);
        assert.equal(res.totais.totalCusto, 0);
        assert.equal(res.totais.totalVenda, 0);
        assert.equal(res.totais.totalLucro, 0);
    });

    await t.test('3. Filtro Saldo Negativo deve trazer produtos com divergência negativa de estoque', () => {
        const res = calcularInventario(mockProdutos, { filtroSaldo: 'negativo' });
        assert.equal(res.itens.length, 1);
        assert.equal(res.itens[0].codigo, 'A004');
        assert.equal(res.itens[0].saldo, -2);
    });

    await t.test('4. Filtro Todos deve apresentar todos os produtos físicos independentemente do saldo', () => {
        const res = calcularInventario(mockProdutos, { filtroSaldo: 'todos' });
        assert.equal(res.itens.length, 4); // A001, A002, A003, A004 (excluindo serviço S001)
    });

    await t.test('5. Filtro por Categoria deve restringir corretamente produtos e totais', () => {
        const res = calcularInventario(mockProdutos, { filtroSaldo: 'positivo', filtroCategoria: 'PNEUS' });
        assert.equal(res.itens.length, 1);
        assert.equal(res.itens[0].codigo, 'A001');
        assert.equal(res.totais.totalQtd, 10);
        assert.equal(res.totais.totalCusto, 800);
        assert.equal(res.totais.totalVenda, 1500);
        assert.equal(res.totais.totalLucro, 700);
    });

    await t.test('6. Filtro por Descrição/Nome do Produto', () => {
        const res = calcularInventario(mockProdutos, { filtroSaldo: 'positivo', filtroProduto: 'óleo' });
        assert.equal(res.itens.length, 1);
        assert.equal(res.itens[0].codigo, 'A002');
    });

    await t.test('7. Filtro por Código ou Referência/Modelo/Marca', () => {
        const resCod = calcularInventario(mockProdutos, { filtroSaldo: 'positivo', filtroCodigoRef: 'A001' });
        assert.equal(resCod.itens.length, 1);
        assert.equal(resCod.itens[0].nome, 'Pneu Dianteiro Titan 150');

        const resRef = calcularInventario(mockProdutos, { filtroSaldo: 'positivo', filtroCodigoRef: 'Mobil' });
        assert.equal(resRef.itens.length, 1);
        assert.equal(resRef.itens[0].codigo, 'A002');
    });

    await t.test('8. Validação de cálculos unitários e lucro potencial por produto', () => {
        const res = calcularInventario(mockProdutos, { filtroSaldo: 'positivo' });
        const pneu = res.itens.find(i => i.codigo === 'A001');
        assert.equal(pneu.custoUnit, 80.00);
        assert.equal(pneu.totalCusto, 800.00); // 10 * 80
        assert.equal(pneu.vendaUnit, 150.00);
        assert.equal(pneu.totalVenda, 1500.00); // 10 * 150
        assert.equal(pneu.lucroPotencial, 700.00); // 1500 - 800
        assert.equal(pneu.referencia, 'Levorin (Matrix)');
    });

    await t.test('9. Suporte a estoque_total quando coluna estoque for 0 (caso real MarceloMotos)', () => {
        const prods = [
            {
                codigo: 'MOTO01',
                nome: 'Vela de Ignição',
                estoque: 0,
                estoque_total: 5,
                valor_compra: 10.00,
                valor_venda: 25.00,
                tipo: 'produto'
            }
        ];
        const res = calcularInventario(prods, { filtroSaldo: 'positivo' });
        assert.equal(res.itens.length, 1);
        assert.equal(res.itens[0].saldo, 5);
        assert.equal(res.totais.totalQtd, 5);
        assert.equal(res.totais.totalCusto, 50.00);
        assert.equal(res.totais.totalVenda, 125.00);
        assert.equal(res.totais.totalLucro, 75.00);
    });
});
