const test = require('node:test');
const assert = require('node:assert/strict');
const FechamentoCore = require('../js/fechamento-relatorio.js');

test('Fechamento de Caixa - Cálculo base sem ajustes (ignora venda fiado direta e canceladas, inclui baixa fiado)', () => {
    const vendas = [
        { id: 1, total: 100.10, desconto: 5.00, forma_pagamento: 'Dinheiro', cancelado: false },
        { id: 2, total: 200.20, desconto: 0, forma_pagamento: 'PIX', cancelado: false },
        { id: 3, total: 150.00, desconto: 0, forma_pagamento: 'Cartão de Crédito', cancelado: false },
        { id: 4, total: 80.00, desconto: 0, forma_pagamento: 'Fiado (F)', cancelado: false },
        { id: 5, total: 999.00, desconto: 0, forma_pagamento: 'Dinheiro', cancelado: true }
    ];
    const pagamentosFiado = [
        { id: 10, valor_pago: 50.00, forma_pagamento: 'Dinheiro', tipo_operacao: 'pagamento', cancelado: false },
        { id: 11, valor_pago: 80.00, forma_pagamento: 'Dinheiro', tipo_operacao: 'venda_realizada', cancelado: false }
    ];
    const despesas = [
        { id: 20, valor: 30.00, status: 'pago', cancelado: false }
    ];

    const resumo = FechamentoCore.calcularResumoFechamentoCaixa({
        saldoInicial: 100.00,
        saldoFinalDeclarado: 220.10,
        vendas,
        pagamentosFiado,
        despesas
    });

    // Vendas = 100.10 + 200.20 + 150.00 + 50.00 (baixa fiado) = 500.30
    assert.equal(resumo.totalVendas, 500.30);
    assert.equal(resumo.totalDescontos, 5.00);
    assert.equal(resumo.dinheiroSistema, 150.10);
    assert.equal(resumo.pixSistema, 200.20);
    assert.equal(resumo.cartaoSistema, 150.00);
    assert.equal(resumo.totalDespesas, 30.00);

    // Esperado gaveta = 100.00 + 150.10 - 30.00 = 220.10
    assert.equal(resumo.saldoEsperadoGaveta, 220.10);
    assert.equal(resumo.diferencaCaixa, 0);
    // Total líquido geral = 100.00 + 500.30 - 30.00 = 570.30
    assert.equal(resumo.totalLiquidoGeral, 570.30);
});

test('Fechamento de Caixa - Novo fechamento após cancelamento com ajustes (suprimento, sangria e ajustes por forma)', () => {
    const vendas = [
        { id: 1, total: 200.00, desconto: 0, forma_pagamento: 'Dinheiro', cancelado: false },
        { id: 2, total: 100.00, desconto: 0, forma_pagamento: 'PIX', cancelado: false }
    ];
    const despesas = [
        { id: 1, valor: 40.00, cancelado: false }
    ];

    const resumo = FechamentoCore.calcularResumoFechamentoCaixa({
        saldoInicial: 150.00, // Fundo inicial corrigido
        saldoFinalDeclarado: 365.00,
        vendas,
        despesas,
        ajustes: {
            suprimento: 50.00,
            sangria: 20.00,
            ajuste_dinheiro: 25.00,
            ajuste_pix: -10.00,
            ajuste_despesas: 5.00,
            observacao: 'Refechamento com inclusão de suprimento e correção PIX/Dinheiro'
        }
    });

    // Vendas ajustadas = (200 + 100) + 25 - 10 = 315.00
    assert.equal(resumo.totalVendas, 315.00);
    // Despesas ajustadas = 40 + 5 = 45.00
    assert.equal(resumo.totalDespesas, 45.00);
    // Esperado gaveta = 150 + (200 + 25) + 50 - 45 - 20 = 360.00
    assert.equal(resumo.saldoEsperadoGaveta, 360.00);
    // Declarado = 365.00 -> Sobra de +5.00
    assert.equal(resumo.diferencaCaixa, 5.00);
    // Total líquido geral = 150 + 315 + 50 - 45 - 20 = 450.00
    assert.equal(resumo.totalLiquidoGeral, 450.00);
});

test('Fechamento de Caixa - Quebra de caixa negativa e precisão de centavos', () => {
    const resumo = FechamentoCore.calcularResumoFechamentoCaixa({
        saldoInicial: 0.10,
        saldoFinalDeclarado: 0.25,
        vendas: [{ id: 1, total: 0.20, forma_pagamento: 'Dinheiro', cancelado: false }]
    });

    assert.equal(resumo.saldoEsperadoGaveta, 0.30);
    assert.equal(resumo.diferencaCaixa, -0.05);
});

test('Fechamento de Caixa - Snapshot de auditoria ao cancelar fechamento acumula tentativas', () => {
    const caixa = {
        id: 27,
        data_abertura: '2026-11-25T10:00:00.000Z',
        data_fechamento: '2026-11-25T20:00:00.000Z',
        saldo_inicial: 300,
        saldo_final: 400,
        saldo_esperado: 449,
        diferenca_caixa: -49,
        usuario_fechamento_id: 2,
        _usuario_fechamento_nome: 'Maria',
        historico_fechamentos: []
    };

    const hist1 = FechamentoCore.criarSnapshotCancelamento(
        caixa,
        { totalVendas: 149, totalDespesas: 0, saldoEsperadoGaveta: 449 },
        { id: 1, nome: 'Admin' },
        'Contagem inicial errada',
        '2026-11-26T09:00:00.000Z'
    );

    assert.equal(hist1.length, 1);
    assert.equal(hist1[0].tentativa, 1);
    assert.equal(hist1[0].saldo_final, 400);
    assert.equal(hist1[0].motivo_cancelamento, 'Contagem inicial errada');
    assert.equal(hist1[0].cancelado_por_nome, 'Admin');

    const hist2 = FechamentoCore.criarSnapshotCancelamento(
        { ...caixa, historico_fechamentos: hist1, saldo_final: 450 },
        { totalVendas: 149, totalDespesas: 0, saldoEsperadoGaveta: 449 },
        { id: 1, nome: 'Admin' },
        'Ajuste complementar',
        '2026-11-26T09:15:00.000Z'
    );

    assert.equal(hist2.length, 2);
    assert.equal(hist2[1].tentativa, 2);
    assert.equal(hist2[1].saldo_final, 450);
});

test('Fechamento de Caixa - Filtro de registros por caixa_id e sanitização XSS', () => {
    const caixa = {
        id: 15,
        data_abertura: '2026-11-20T08:00:00.000Z',
        data_fechamento: '2026-11-20T18:00:00.000Z'
    };
    const filtrados = FechamentoCore.filtrarRegistrosDoCaixa(caixa, {
        saidas: [
            { id: 1, caixa_id: 15, cancelado: false },
            { id: 2, caixa_id: 16, cancelado: false },
            { id: 3, caixa_id: null, data_finalizacao: '2026-11-20T12:00:00.000Z', cancelado: false },
            { id: 4, caixa_id: 15, cancelado: true }
        ],
        despesas: [
            { id: 10, caixa_id: 15, valor: 25 },
            { id: 11, data: '2026-11-20', created_at: '2026-11-20T15:00:00.000Z', valor: 10 },
            { id: 12, data: '2026-11-21', created_at: '2026-11-21T15:00:00.000Z', valor: 99 }
        ]
    });

    assert.deepEqual(filtrados.vendasFiltradas.map(v => v.id), [1, 3]);
    assert.deepEqual(filtrados.despesasFiltradas.map(d => d.id), [10, 11]);
    assert.equal(
        FechamentoCore.escapeHtmlSafe('<script>alert(1)</script>'),
        '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
});
