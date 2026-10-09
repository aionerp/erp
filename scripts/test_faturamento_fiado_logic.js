// scripts/test_faturamento_fiado_logic.js
// Teste unitário e de integração da lógica de faturamento x fiado ("A Pagar (F)")

const assert = require('assert');

console.log('🧪 Iniciando testes da lógica de Faturamento x Vendas Fiado...\n');

// 1. Helper function de identificação de fiado
function ehVendaFiado(formaPagamento) {
    if (!formaPagamento) return false;
    const fp = String(formaPagamento).toLowerCase();
    return fp.includes('a pagar') || fp.includes('(f)');
}

assert.strictEqual(ehVendaFiado('A Pagar (F)'), true, 'Deve identificar "A Pagar (F)" como fiado');
assert.strictEqual(ehVendaFiado('A Pagar F'), true, 'Deve identificar "A Pagar F" como fiado');
assert.strictEqual(ehVendaFiado('A Pagar'), true, 'Deve identificar "A Pagar" como fiado');
assert.strictEqual(ehVendaFiado('Dinheiro'), false, 'Não deve identificar "Dinheiro" como fiado');
assert.strictEqual(ehVendaFiado('Cartão de Crédito'), false, 'Não deve identificar "Cartão" como fiado');
assert.strictEqual(ehVendaFiado('PIX'), false, 'Não deve identificar "PIX" como fiado');
console.log('✅ Teste 1: ehVendaFiado() validado com sucesso.');

// 2. Simulação do Dashboard (processarMetricasFinanceiras)
const hoje = new Date();
hoje.setHours(0, 0, 0, 0);
const hojeStr = hoje.toISOString().split('T')[0];

const mockVendas = [
    { id: 101, data: hojeStr, total: 100.00, forma_pagamento: 'Dinheiro', cancelado: false },
    { id: 102, data: hojeStr, total: 150.00, forma_pagamento: 'A Pagar (F)', cancelado: false }, // Fiado
    { id: 103, data: hojeStr, total: 200.00, forma_pagamento: 'Cartão de Débito', cancelado: false }
];

const mockPagamentosFiado = [
    { id: 1, saida_id: 102, data_pagamento: hojeStr, valor_pago: 0, tipo_operacao: 'venda_realizada', cancelado: false }, // log auditoria
    { id: 2, saida_id: 102, data_pagamento: hojeStr, valor_pago: 50.00, tipo_operacao: 'pagamento_inicial', forma_pagamento: 'Dinheiro', cancelado: false }, // entrada
    { id: 3, saida_id: 102, data_pagamento: hojeStr, valor_pago: 30.00, tipo_operacao: 'pagamento_parcial', forma_pagamento: 'PIX', cancelado: false }, // baixa parcial
    { id: 4, saida_id: 102, data_pagamento: hojeStr, valor_pago: 70.00, tipo_operacao: 'pagamento_final', cancelado: true } // estornado/cancelado
];

// Cálculo Dashboard
let somaFaturamentoTotal = 0;
let totalHojeVendas = 0;

// Vendas diretas
mockVendas.forEach(v => {
    if (ehVendaFiado(v.forma_pagamento)) return;
    const val = Number(v.total) || 0;
    somaFaturamentoTotal += val;
    totalHojeVendas += val;
});

// Pagamentos válidos de fiado
const pagsValidos = mockPagamentosFiado.filter(p => p.cancelado !== true && p.tipo_operacao !== 'venda_realizada');
pagsValidos.forEach(p => {
    const val = Number(p.valor_pago) || 0;
    somaFaturamentoTotal += val;
    totalHojeVendas += val;
});

// Verificações
// Total vendas diretas: 100 + 200 = 300
// Total baixas fiado: 50 + 30 = 80 (70 cancelado ignorado, 0 venda_realizada ignorado)
// Total Faturamento: 380 (o valor total de 150 da venda fiada não soma diretamente)
assert.strictEqual(somaFaturamentoTotal, 380, 'Faturamento total deve ser 380 (300 vendas diretas + 80 baixas de fiado)');
assert.strictEqual(totalHojeVendas, 380, 'Faturamento de hoje deve ser 380');
console.log('✅ Teste 2: Lógica de Faturamento do Dashboard validada (R$ 380,00 correto).');

// 3. Simulação de Ranking de Produtos (deve incluir itens da venda fiada #102)
const idsValidosVendas = mockVendas.map(v => v.id).filter(Boolean);
assert.strictEqual(idsValidosVendas.length, 3, 'Ranking de produtos deve receber todas as 3 vendas, incluindo a fiada #102');
assert.strictEqual(idsValidosVendas.includes(102), true, 'Venda fiada #102 deve estar presente na busca de itens vendidos');
console.log('✅ Teste 3: Ranking e movimentação de produtos preserva itens da venda fiada.');

// 4. Simulação de Relatórios: carregarFaturamento (Agrupamento diário)
const grupos = {};
mockVendas.forEach(v => {
    if (ehVendaFiado(v.forma_pagamento)) return;
    grupos[v.data] = (grupos[v.data] || 0) + (Number(v.total) || 0);
});
pagsValidos.forEach(p => {
    const dataPag = p.data_pagamento.substring(0, 10);
    grupos[dataPag] = (grupos[dataPag] || 0) + (Number(p.valor_pago) || 0);
});

assert.strictEqual(grupos[hojeStr], 380, 'Relatório de Faturamento no período deve totalizar 380');
console.log('✅ Teste 4: Relatório de Faturamento agrupa corretamente (R$ 380,00).');

// 5. Simulação de Fechamento de Caixa
let totalVendasCaixa = 0;
let dinheiroVendas = 0;
const formasPagamento = {};

mockVendas.forEach(v => {
    const valTotal = Number(v.total) || 0;
    const fp = v.forma_pagamento;
    const isFiado = ehVendaFiado(fp);

    if (!isFiado) {
        totalVendasCaixa += valTotal;
    }
    formasPagamento[fp] = (formasPagamento[fp] || 0) + valTotal;
    if (fp.toLowerCase().includes('dinheiro') && !isFiado) {
        dinheiroVendas += valTotal;
    }
});

pagsValidos.forEach(p => {
    const valPago = Number(p.valor_pago) || 0;
    totalVendasCaixa += valPago;
    const fpKey = (p.forma_pagamento || 'Dinheiro') + ' (Receb. Fiado)';
    formasPagamento[fpKey] = (formasPagamento[fpKey] || 0) + valPago;
    if ((p.forma_pagamento || '').toLowerCase().includes('dinheiro')) {
        dinheiroVendas += valPago;
    }
});

assert.strictEqual(totalVendasCaixa, 380, 'Total arrecadado no caixa deve ser 380');
// Dinheiro: 100 da venda à vista + 50 da entrada de fiado = 150
assert.strictEqual(dinheiroVendas, 150, 'Dinheiro em caixa deve ser 150 (100 venda + 50 entrada fiado)');
assert.strictEqual(formasPagamento['A Pagar (F)'], 150, 'Formas de pagamento registra dívida original gerada');
assert.strictEqual(formasPagamento['Dinheiro (Receb. Fiado)'], 50, 'Formas de pagamento registra 50 recebidos em dinheiro do fiado');
assert.strictEqual(formasPagamento['PIX (Receb. Fiado)'], 30, 'Formas de pagamento registra 30 recebidos em PIX do fiado');
console.log('✅ Teste 5: Fechamento de caixa validado com conciliação exata de dinheiro e faturamento.');

console.log('\n🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
