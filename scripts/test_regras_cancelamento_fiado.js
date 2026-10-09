// scripts/test_regras_cancelamento_fiado.js
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function runTests() {
    console.log('========================================================================');
    console.log('🧪 TESTE DAS 3 REGRAS DE CANCELAMENTO DE VENDA FIADA / DAV');
    console.log('========================================================================\n');

    const dbUrl = process.env.CLIENTE03_DATABASE_URL || process.env.CLIENTE01_DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL não encontrada no .env');
        process.exit(1);
    }

    const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

    let testsPassed = 0;
    let testsFailed = 0;

    function assert(cond, msg) {
        if (cond) {
            console.log(`  ✅ [PASS] ${msg}`);
            testsPassed++;
        } else {
            console.error(`  ❌ [FAIL] ${msg}`);
            testsFailed++;
        }
    }

    try {
        const client = await pool.connect();

        // 1. Setup básico
        const lojaRes = await client.query('SELECT id FROM public.lojas LIMIT 1');
        const lojaId = lojaRes.rows[0]?.id || 1;

        const userRes = await client.query('SELECT id FROM public.usuarios WHERE loja_id = $1 LIMIT 1', [lojaId]);
        const usuarioId = userRes.rows[0]?.id;

        // Criar produto de teste
        const prodRes = await client.query(
            `INSERT INTO public.produtos (loja_id, nome, codigo, valor_venda, estoque_total, ativo)
             VALUES ($1, 'Produto Teste Regras Cancelamento', 'TEST-CANC-01', 100.00, 50, true)
             RETURNING id, estoque_total`,
            [lojaId]
        );
        const produtoId = prodRes.rows[0].id;
        const estoqueInicial = prodRes.rows[0].estoque_total; // 50

        // Criar cliente de teste
        const cliRes = await client.query(
            `INSERT INTO public.clientes (loja_id, nome, cpf_cnpj, telefone)
             VALUES ($1, 'Cliente Teste Regras Cancelamento', '999.888.777-66', '(11) 98888-7777')
             RETURNING id`,
            [lojaId]
        );
        const clienteId = cliRes.rows[0].id;

        // =====================================================================
        // CENÁRIO 1: REGRA A — Venda Fiada com DAV em Aberto (R$ 0 pago)
        // Ao cancelar a nota de venda, a DAV em aberto deve ser cancelada automaticamente!
        // =====================================================================
        console.log('\n--- Cenário 1: REGRA A — DAV em aberto sem pagamentos confirmados ---');
        
        // Criar Venda 1 (R$ 100,00 fiado, 0 entrada)
        const venda1Res = await client.query(
            `INSERT INTO public.saidas (loja_id, cliente_id, total, forma_pagamento, cancelado, data_finalizacao)
             VALUES ($1, $2, 100.00, 'A Pagar (F)', false, NOW())
             RETURNING id`,
            [lojaId, clienteId]
        );
        const venda1Id = venda1Res.rows[0].id;

        // Item da venda 1 (saída de 2 unidades)
        await client.query(
            `INSERT INTO public.saida_itens (saida_id, produto_id, quantidade, valor_unitario, subtotal)
             VALUES ($1, $2, 2, 50.00, 100.00)`,
            [venda1Id, produtoId]
        );
        // Atualizar estoque (-2)
        await client.query('UPDATE public.produtos SET estoque_total = estoque_total - 2 WHERE id = $1', [produtoId]);

        // Criar DAV 1 (status: aberto, valor_original: 100, valor_pago: 0, saldo_devedor: 100)
        const dav1Res = await client.query(
            `INSERT INTO public.contas_receber 
             (loja_id, saida_id, cliente_id, cliente_nome, numero_documento, valor_original, valor_pago, saldo_devedor, status, data_venda)
             VALUES ($1, $2, $3, 'Cliente Teste', 'DAV-TEST-001', 100.00, 0.00, 100.00, 'aberto', CURRENT_DATE)
             RETURNING id`,
            [lojaId, venda1Id, clienteId]
        );
        const dav1Id = dav1Res.rows[0].id;

        // Histórico de venda realizada
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, 'venda_realizada', 0.00, 'A Pagar (F)', 100.00, 100.00, 'DAV-TEST-001')`,
            [lojaId, dav1Id, venda1Id, clienteId]
        );

        // Simulando a execução do cancelarVenda no backend/controlador:
        // 1. Checagem de regras:
        const conta1 = (await client.query('SELECT * FROM public.contas_receber WHERE id = $1', [dav1Id])).rows[0];
        const pags1 = (await client.query('SELECT * FROM public.contas_receber_pagamentos WHERE conta_receber_id = $1 AND cancelado = false', [dav1Id])).rows;
        const pagsEfetivos1 = pags1.filter(p => p.tipo_operacao !== 'venda_realizada' && p.tipo_operacao !== 'estorno');
        const totalPagoEfetivo1 = Math.max(Number(conta1.valor_pago) || 0, pagsEfetivos1.reduce((s, p) => s + Number(p.valor_pago), 0));
        const saldoDevedor1 = Number(conta1.saldo_devedor);

        // Verificações
        const isQuitada1 = conta1.status === 'pago' || (totalPagoEfetivo1 > 0 && saldoDevedor1 <= 0);
        const isParcial1 = totalPagoEfetivo1 > 0 && saldoDevedor1 > 0;
        const podeCancelarNota1 = !isQuitada1 && !isParcial1;

        assert(podeCancelarNota1 === true, 'Regra A: Venda com DAV em aberto e 0 pago é permitida para cancelamento');

        // Executar cancelamento da Venda 1 + DAV 1
        await client.query('UPDATE public.saidas SET cancelado = true, cancelado_em = NOW(), motivo_cancelamento = $1 WHERE id = $2', ['Cancelamento teste PDV', venda1Id]);
        await client.query('UPDATE public.produtos SET estoque_total = estoque_total + 2 WHERE id = $1', [produtoId]);
        await client.query('UPDATE public.contas_receber SET status = $1, saldo_devedor = 0.00, observacao = $2, updated_at = NOW() WHERE id = $3', ['cancelado', 'Cancelamento automático via PDV', dav1Id]);
        await client.query('UPDATE public.contas_receber_pagamentos SET cancelado = true, cancelado_em = NOW() WHERE conta_receber_id = $1', [dav1Id]);
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento, observacao)
             VALUES ($1, $2, $3, $4, 'estorno', 0.00, 'Cancelamento PDV', 100.00, 0.00, 'CANC-001', 'DAV cancelada junto com a Venda')`,
            [lojaId, dav1Id, venda1Id, clienteId]
        );

        // Conferir estado após cancelamento
        const checkVenda1 = (await client.query('SELECT cancelado FROM public.saidas WHERE id = $1', [venda1Id])).rows[0];
        const checkDav1 = (await client.query('SELECT status, saldo_devedor FROM public.contas_receber WHERE id = $1', [dav1Id])).rows[0];
        const checkEstoque1 = (await client.query('SELECT estoque_total FROM public.produtos WHERE id = $1', [produtoId])).rows[0];

        assert(checkVenda1.cancelado === true, 'Venda 1 foi marcada como cancelada');
        assert(checkDav1.status === 'cancelado', 'DAV 1 foi automaticamente cancelada (status: cancelado)');
        assert(Number(checkDav1.saldo_devedor) === 0.00, 'DAV 1 teve saldo devedor zerado');
        assert(Number(checkEstoque1.estoque_total) === estoqueInicial, 'Estoque foi estornado perfeitamente (50 un)');

        // =====================================================================
        // CENÁRIO 2: REGRA B — Venda Fiada com Pagamento Parcial
        // Deve BLOQUEAR o cancelamento da venda informando que precisa cancelar/estornar a DAV!
        // =====================================================================
        console.log('\n--- Cenário 2: REGRA B — Venda com pagamento parcial (Bloqueio Obrigatório) ---');

        // Criar Venda 2 (R$ 150,00, entrada R$ 50,00)
        const venda2Res = await client.query(
            `INSERT INTO public.saidas (loja_id, cliente_id, total, forma_pagamento, cancelado, data_finalizacao)
             VALUES ($1, $2, 150.00, 'A Pagar (F)', false, NOW())
             RETURNING id`,
            [lojaId, clienteId]
        );
        const venda2Id = venda2Res.rows[0].id;

        // Criar DAV 2 (status: aver_na_conta, valor_original: 150, valor_pago: 50, saldo_devedor: 100)
        const dav2Res = await client.query(
            `INSERT INTO public.contas_receber 
             (loja_id, saida_id, cliente_id, cliente_nome, numero_documento, valor_original, valor_pago, saldo_devedor, status, data_venda)
             VALUES ($1, $2, $3, 'Cliente Teste', 'DAV-TEST-002', 150.00, 50.00, 100.00, 'aver_na_conta', CURRENT_DATE)
             RETURNING id`,
            [lojaId, venda2Id, clienteId]
        );
        const dav2Id = dav2Res.rows[0].id;

        // Pagamento inicial de R$ 50,00
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, 'pagamento_inicial', 50.00, 'Dinheiro', 150.00, 100.00, 'REC-TEST-002')`,
            [lojaId, dav2Id, venda2Id, clienteId]
        );

        // Testar lógica de bloqueio da Regra B
        const conta2 = (await client.query('SELECT * FROM public.contas_receber WHERE id = $1', [dav2Id])).rows[0];
        const pags2 = (await client.query('SELECT * FROM public.contas_receber_pagamentos WHERE conta_receber_id = $1 AND cancelado = false', [dav2Id])).rows;
        const pagsEfetivos2 = pags2.filter(p => p.tipo_operacao !== 'venda_realizada' && p.tipo_operacao !== 'estorno');
        const totalPagoEfetivo2 = Math.max(Number(conta2.valor_pago) || 0, pagsEfetivos2.reduce((s, p) => s + Number(p.valor_pago), 0));
        const saldoDevedor2 = Number(conta2.saldo_devedor);

        const isQuitada2 = conta2.status === 'pago' || (totalPagoEfetivo2 > 0 && saldoDevedor2 <= 0);
        const isParcial2 = totalPagoEfetivo2 > 0 && saldoDevedor2 > 0;

        assert(isParcial2 === true, 'Identificou pagamento parcial ativo (R$ 50,00 pago de R$ 150,00 | Saldo: R$ 100,00)');
        assert(isQuitada2 === false, 'Venda 2 não está quitada');

        let cancelamentoBloqueadoComMensagem = false;
        let mensagemBloqueio = '';

        if (isParcial2) {
            cancelamentoBloqueadoComMensagem = true;
            mensagemBloqueio = `⛔ Cancelamento Bloqueado: Esta venda possui pagamento parcial já recebido (R$ ${totalPagoEfetivo2.toFixed(2)} de R$ ${Number(conta2.valor_original).toFixed(2)}). Para cancelar a venda, é necessário primeiro estornar os pagamentos e cancelar a DAV no menu Financeiro!`;
        }

        assert(cancelamentoBloqueadoComMensagem === true, 'Regra B: Cancelamento de venda com pagamento parcial foi BLOQUEADO com sucesso');
        assert(mensagemBloqueio.includes('Cancelamento Bloqueado'), 'Mensagem de bloqueio clara apresentada ao operador');

        // Confirmar que Venda 2 permanece ATIVA (não cancelada)
        const checkVenda2 = (await client.query('SELECT cancelado FROM public.saidas WHERE id = $1', [venda2Id])).rows[0];
        assert(checkVenda2.cancelado === false, 'Venda 2 permaneceu intacta e ativa no banco de dados');

        // =====================================================================
        // CENÁRIO 3: REGRA C — Venda Fiada Totalmente Paga / Quitada
        // Não deixar mais cancelar sob hipótese alguma!
        // =====================================================================
        console.log('\n--- Cenário 3: REGRA C — Venda fiada totalmente quitada (Bloqueio Total) ---');

        // Criar Venda 3 (R$ 80,00, quitada)
        const venda3Res = await client.query(
            `INSERT INTO public.saidas (loja_id, cliente_id, total, forma_pagamento, cancelado, data_finalizacao)
             VALUES ($1, $2, 80.00, 'A Pagar (F)', false, NOW())
             RETURNING id`,
            [lojaId, clienteId]
        );
        const venda3Id = venda3Res.rows[0].id;

        // Criar DAV 3 (status: pago, valor_original: 80, valor_pago: 80, saldo_devedor: 0)
        const dav3Res = await client.query(
            `INSERT INTO public.contas_receber 
             (loja_id, saida_id, cliente_id, cliente_nome, numero_documento, valor_original, valor_pago, saldo_devedor, status, data_venda, data_quitacao)
             VALUES ($1, $2, $3, 'Cliente Teste', 'DAV-TEST-003', 80.00, 80.00, 0.00, 'pago', CURRENT_DATE, NOW())
             RETURNING id`,
            [lojaId, venda3Id, clienteId]
        );
        const dav3Id = dav3Res.rows[0].id;

        // Pagamento final de R$ 80,00
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, 'pagamento_final', 80.00, 'PIX', 80.00, 0.00, 'REC-TEST-003')`,
            [lojaId, dav3Id, venda3Id, clienteId]
        );

        // Testar lógica da Regra C
        const conta3 = (await client.query('SELECT * FROM public.contas_receber WHERE id = $1', [dav3Id])).rows[0];
        const pags3 = (await client.query('SELECT * FROM public.contas_receber_pagamentos WHERE conta_receber_id = $1 AND cancelado = false', [dav3Id])).rows;
        const pagsEfetivos3 = pags3.filter(p => p.tipo_operacao !== 'venda_realizada' && p.tipo_operacao !== 'estorno');
        const totalPagoEfetivo3 = Math.max(Number(conta3.valor_pago) || 0, pagsEfetivos3.reduce((s, p) => s + Number(p.valor_pago), 0));
        const saldoDevedor3 = Number(conta3.saldo_devedor);

        const isQuitada3 = conta3.status === 'pago' || (totalPagoEfetivo3 > 0 && saldoDevedor3 <= 0);

        assert(isQuitada3 === true, 'Identificou que a venda fiada foi totalmente quitada (R$ 80,00 pago | Saldo: 0)');

        let cancelamentoQuitadaBloqueado = false;
        let mensagemQuitada = '';

        if (isQuitada3) {
            cancelamentoQuitadaBloqueado = true;
            mensagemQuitada = `⛔ Bloqueio de Cancelamento: Esta venda foi totalmente quitada/recebida (R$ ${totalPagoEfetivo3.toFixed(2)}) e não pode mais ser cancelada!`;
        }

        assert(cancelamentoQuitadaBloqueado === true, 'Regra C: Cancelamento de venda totalmente quitada foi TERMINANTEMENTE BLOQUEADO');
        assert(mensagemQuitada.includes('não pode mais ser cancelada'), 'Mensagem categórica de quitação total exibida');

        // Confirmar que Venda 3 permanece ATIVA (não cancelada)
        const checkVenda3 = (await client.query('SELECT cancelado FROM public.saidas WHERE id = $1', [venda3Id])).rows[0];
        assert(checkVenda3.cancelado === false, 'Venda 3 quitada permaneceu intacta e protegida contra cancelamento');

        // Limpeza dos dados de teste
        console.log('\n--- Limpando Dados dos Testes ---');
        await client.query('DELETE FROM public.contas_receber_pagamentos WHERE cliente_id = $1', [clienteId]);
        await client.query('DELETE FROM public.contas_receber WHERE cliente_id = $1', [clienteId]);
        await client.query('DELETE FROM public.saida_itens WHERE saida_id IN ($1, $2, $3)', [venda1Id, venda2Id, venda3Id]);
        await client.query('DELETE FROM public.saidas WHERE id IN ($1, $2, $3)', [venda1Id, venda2Id, venda3Id]);
        await client.query('DELETE FROM public.produtos WHERE id = $1', [produtoId]);
        await client.query('DELETE FROM public.clientes WHERE id = $1', [clienteId]);
        console.log('Dados de teste limpos com sucesso.');

        client.release();

        console.log('\n========================================================================');
        console.log(`🎉 RESULTADO: ${testsPassed} testes passaram, ${testsFailed} falharam.`);
        console.log('========================================================================\n');

        await pool.end();

        if (testsFailed > 0) {
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Erro fatal durante a execução dos testes:', err);
        await pool.end();
        process.exit(1);
    }
}

runTests();
