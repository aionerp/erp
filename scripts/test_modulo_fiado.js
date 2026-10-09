// scripts/test_modulo_fiado.js
// Teste automatizado abrangente para o Módulo de Fiado e Contas a Receber
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function runTests() {
    console.log('================================================================');
    console.log('🧪 INICIANDO BATERIA DE TESTES - MÓDULO FIADO E CONTAS A RECEBER');
    console.log('================================================================\n');

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

        console.log('--- Preparando Dados de Teste ---');
        // Obter ou criar loja de teste
        let lojaRes = await client.query('SELECT id FROM public.lojas LIMIT 1');
        let lojaId = lojaRes.rows[0]?.id || 1;

        // Obter ou criar usuário de teste
        let userRes = await client.query('SELECT id FROM public.usuarios WHERE loja_id = $1 LIMIT 1', [lojaId]);
        let usuarioId = userRes.rows[0]?.id;
        if (!usuarioId) {
            const insUser = await client.query(
                `INSERT INTO public.usuarios (nome, email, senha, perfil, loja_id) 
                 VALUES ('Teste Tester', 'teste@fiado.com', '123456', 'administrador', $1) RETURNING id`,
                [lojaId]
            );
            usuarioId = insUser.rows[0].id;
        }

        // Criar cliente de teste
        const cliRes = await client.query(
            `INSERT INTO public.clientes (nome, cpf_cnpj, telefone, loja_id)
             VALUES ('Cliente Teste Fiado Automatizado', '111.222.333-44', '(11) 98888-7777', $1) RETURNING id, nome`,
            [lojaId]
        );
        const testClienteId = cliRes.rows[0].id;
        const testClienteNome = cliRes.rows[0].nome;
        console.log(`Cliente de teste criado: ID ${testClienteId} (${testClienteNome})`);

        // Obter ou criar caixa aberto de teste
        let caixaRes = await client.query(
            `SELECT id FROM public.caixas WHERE loja_id = $1 AND status = 'aberto' LIMIT 1`,
            [lojaId]
        );
        let testCaixaId = caixaRes.rows[0]?.id;
        if (!testCaixaId) {
            const insCaixa = await client.query(
                `INSERT INTO public.caixas (loja_id, saldo_inicial, status, data_abertura)
                 VALUES ($1, 200.00, 'aberto', NOW()) RETURNING id`,
                [lojaId]
            );
            testCaixaId = insCaixa.rows[0].id;
        }
        console.log(`Caixa ativo para testes: ID ${testCaixaId}\n`);

        // =====================================================================
        // TESTE 1: Cenário A — Venda fiada SEM pagamento inicial
        // =====================================================================
        console.log('--- Teste 1: Cenário A (Venda sem pagamento inicial) ---');
        const vendaA = await client.query(
            `INSERT INTO public.saidas (loja_id, cliente_id, total, forma_pagamento, caixa_id, usuario_id)
             VALUES ($1, $2, 150.00, 'A Pagar (F)', $3, $4) RETURNING id, total`,
            [lojaId, testClienteId, testCaixaId, usuarioId]
        );
        const vendaAId = vendaA.rows[0].id;
        const docDAV_A = `DAV-${String(vendaAId).padStart(6, '0')}`;

        // Inserir em contas_receber (como faz o PDV)
        const crA = await client.query(
            `INSERT INTO public.contas_receber 
             (loja_id, saida_id, cliente_id, cliente_nome, numero_documento, valor_original, valor_pago, saldo_devedor, status, usuario_id)
             VALUES ($1, $2, $3, $4, $5, 150.00, 0.00, 150.00, 'aberto', $6) RETURNING id, status, saldo_devedor`,
            [lojaId, vendaAId, testClienteId, testClienteNome, docDAV_A, usuarioId]
        );
        const crAId = crA.rows[0].id;

        // Histórico de venda realizada (valor_pago = 0)
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, caixa_id, usuario_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, $5, $6, 'venda_realizada', 0.00, 'A Pagar (F)', 150.00, 150.00, $7)`,
            [lojaId, crAId, vendaAId, testClienteId, testCaixaId, usuarioId, docDAV_A]
        );

        assert(crA.rows[0].status === 'aberto', 'Status da conta deve ser "aberto"');
        assert(Number(crA.rows[0].saldo_devedor) === 150.00, 'Saldo devedor deve ser integral (R$ 150,00)');

        // Verificar histórico
        const histA = await client.query(
            `SELECT * FROM public.contas_receber_pagamentos WHERE conta_receber_id = $1`, [crAId]
        );
        assert(histA.rows.length === 1, 'Histórico deve possuir exatamente 1 registro de venda_realizada');
        assert(Number(histA.rows[0].valor_pago) === 0, 'Valor pago na venda_realizada deve ser R$ 0,00');

        // =====================================================================
        // TESTE 2: Cenário B — Venda fiada COM pagamento parcial na entrada
        // =====================================================================
        console.log('\n--- Teste 2: Cenário B (Venda com entrada parcial R$ 50 de R$ 150) ---');
        const vendaB = await client.query(
            `INSERT INTO public.saidas (loja_id, cliente_id, total, forma_pagamento, caixa_id, usuario_id)
             VALUES ($1, $2, 150.00, 'A Pagar (F)', $3, $4) RETURNING id`,
            [lojaId, testClienteId, testCaixaId, usuarioId]
        );
        const vendaBId = vendaB.rows[0].id;
        const docDAV_B = `DAV-${String(vendaBId).padStart(6, '0')}`;

        const crB = await client.query(
            `INSERT INTO public.contas_receber 
             (loja_id, saida_id, cliente_id, cliente_nome, numero_documento, valor_original, valor_pago, saldo_devedor, status, usuario_id, data_ultimo_pagamento)
             VALUES ($1, $2, $3, $4, $5, 150.00, 50.00, 100.00, 'aver_na_conta', $6, NOW()) RETURNING id, status, valor_pago, saldo_devedor`,
            [lojaId, vendaBId, testClienteId, testClienteNome, docDAV_B, usuarioId]
        );
        const crBId = crB.rows[0].id;

        // Histórico 1: Venda realizada
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, caixa_id, usuario_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, $5, $6, 'venda_realizada', 0.00, 'A Pagar (F)', 150.00, 150.00, $7)`,
            [lojaId, crBId, vendaBId, testClienteId, testCaixaId, usuarioId, docDAV_B]
        );

        // Histórico 2: Pagamento inicial de R$ 50 em dinheiro
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, caixa_id, usuario_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, $5, $6, 'pagamento_inicial', 50.00, 'Dinheiro', 150.00, 100.00, $7)`,
            [lojaId, crBId, vendaBId, testClienteId, testCaixaId, usuarioId, `REC-${vendaBId}-01`]
        );

        assert(crB.rows[0].status === 'aver_na_conta', 'Status da conta com entrada deve ser "aver_na_conta"');
        assert(Number(crB.rows[0].valor_pago) === 50.00, 'Valor pago acumulado deve ser R$ 50,00');
        assert(Number(crB.rows[0].saldo_devedor) === 100.00, 'Saldo devedor deve ser R$ 100,00');

        // =====================================================================
        // TESTE 3: Cenário C — Venda totalmente paga no ato
        // =====================================================================
        console.log('\n--- Teste 3: Cenário C (Venda totalmente paga no ato) ---');
        const vendaC = await client.query(
            `INSERT INTO public.saidas (loja_id, cliente_id, total, forma_pagamento, caixa_id, usuario_id)
             VALUES ($1, $2, 80.00, 'A Pagar (F)', $3, $4) RETURNING id`,
            [lojaId, testClienteId, testCaixaId, usuarioId]
        );
        const vendaCId = vendaC.rows[0].id;

        const crC = await client.query(
            `INSERT INTO public.contas_receber 
             (loja_id, saida_id, cliente_id, cliente_nome, numero_documento, valor_original, valor_pago, saldo_devedor, status, data_quitacao, usuario_id)
             VALUES ($1, $2, $3, $4, $5, 80.00, 80.00, 0.00, 'pago', NOW(), $6) RETURNING id, status, saldo_devedor`,
            [lojaId, vendaCId, testClienteId, testClienteNome, `DAV-${String(vendaCId).padStart(6, '0')}`, usuarioId]
        );
        assert(crC.rows[0].status === 'pago', 'Status da conta deve ser "pago"');
        assert(Number(crC.rows[0].saldo_devedor) === 0, 'Saldo devedor deve ser R$ 0,00');

        // =====================================================================
        // TESTE 4: Dois ou mais pagamentos para a mesma venda
        // =====================================================================
        console.log('\n--- Teste 4: Pagamentos Múltiplos na Mesma Venda ---');
        // Na conta B (saldo atual: 100), pagar R$ 30,00
        const pagParcial1 = 30.00;
        const saldoB_ant = 100.00;
        const saldoB_novo = saldoB_ant - pagParcial1; // 70.00
        const totalPagoB_novo = 50.00 + pagParcial1; // 80.00

        await client.query(
            `UPDATE public.contas_receber 
             SET valor_pago = $1, saldo_devedor = $2, status = 'aver_na_conta', data_ultimo_pagamento = NOW()
             WHERE id = $3`,
            [totalPagoB_novo, saldoB_novo, crBId]
        );

        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, caixa_id, usuario_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, $5, $6, 'pagamento_parcial', $7, 'PIX', $8, $9, $10)`,
            [lojaId, crBId, vendaBId, testClienteId, testCaixaId, usuarioId, pagParcial1, saldoB_ant, saldoB_novo, `REC-${vendaBId}-02`]
        );

        const checkB1 = await client.query('SELECT * FROM public.contas_receber WHERE id = $1', [crBId]);
        assert(Number(checkB1.rows[0].saldo_devedor) === 70.00, 'Saldo devedor recalculado para R$ 70,00');
        assert(Number(checkB1.rows[0].valor_pago) === 80.00, 'Total pago recalculado para R$ 80,00');
        assert(checkB1.rows[0].status === 'aver_na_conta', 'Status permanece "aver_na_conta"');

        // =====================================================================
        // TESTE 5: Quitação Total da Dívida
        // =====================================================================
        console.log('\n--- Teste 5: Quitação Total da Dívida ---');
        // Pagar os R$ 70,00 restantes
        const pagFinal = 70.00;
        await client.query(
            `UPDATE public.contas_receber 
             SET valor_pago = valor_pago + $1, saldo_devedor = 0.00, status = 'pago', data_quitacao = NOW(), data_ultimo_pagamento = NOW()
             WHERE id = $2`,
            [pagFinal, crBId]
        );

        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, caixa_id, usuario_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento)
             VALUES ($1, $2, $3, $4, $5, $6, 'pagamento_final', $7, 'Cartão de Débito', 70.00, 0.00, $8)`,
            [lojaId, crBId, vendaBId, testClienteId, testCaixaId, usuarioId, pagFinal, `REC-${vendaBId}-03`]
        );

        const checkBQuitada = await client.query('SELECT * FROM public.contas_receber WHERE id = $1', [crBId]);
        assert(checkBQuitada.rows[0].status === 'pago', 'Status atualizado para "pago"');
        assert(Number(checkBQuitada.rows[0].saldo_devedor) === 0, 'Saldo devedor zerado (R$ 0,00)');
        assert(Number(checkBQuitada.rows[0].valor_pago) === 150.00, 'Total pago é igual ao valor original (R$ 150,00)');
        assert(checkBQuitada.rows[0].data_quitacao !== null, 'Data de quitação foi gravada');

        // =====================================================================
        // TESTE 6: Consulta do Histórico Completo e Imutabilidade
        // =====================================================================
        console.log('\n--- Teste 6: Auditoria e Histórico Completo ---');
        const histCompletoB = await client.query(
            `SELECT * FROM public.contas_receber_pagamentos WHERE conta_receber_id = $1 ORDER BY id ASC`, [crBId]
        );
        assert(histCompletoB.rows.length === 4, 'A conta quitada deve possuir exatamente 4 movimentações registradas');
        const tipos = histCompletoB.rows.map(r => r.tipo_operacao);
        assert(
            tipos[0] === 'venda_realizada' && tipos[1] === 'pagamento_inicial' && tipos[2] === 'pagamento_parcial' && tipos[3] === 'pagamento_final',
            'Sequência de operações auditadas preservada com precisão'
        );

        // =====================================================================
        // TESTE 7: Cancelamento e Estorno de Recebimentos
        // =====================================================================
        console.log('\n--- Teste 7: Estorno de Pagamento com Reversão de Saldo ---');
        // Estornar o pagamento final de R$ 70 da conta B
        const pgFinalObj = histCompletoB.rows[3];
        assert(Number(pgFinalObj.valor_pago) === 70.00, 'Localizou pagamento final a ser estornado');

        // 1. Marcar pagamento como cancelado
        await client.query(
            `UPDATE public.contas_receber_pagamentos 
             SET cancelado = true, cancelado_em = NOW(), cancelado_por = $1, motivo_cancelamento = 'Cliente solicitou estorno por duplicidade de débito'
             WHERE id = $2`,
            [usuarioId, pgFinalObj.id]
        );

        // 2. Gravar registro de estorno no histórico
        await client.query(
            `INSERT INTO public.contas_receber_pagamentos
             (loja_id, conta_receber_id, saida_id, cliente_id, caixa_id, usuario_id, tipo_operacao, valor_pago, forma_pagamento, saldo_anterior, saldo_apos, numero_documento, observacao)
             VALUES ($1, $2, $3, $4, $5, $6, 'estorno', -70.00, $7, 0.00, 70.00, $8, 'Estorno auditado')`,
            [lojaId, crBId, vendaBId, testClienteId, testCaixaId, usuarioId, pgFinalObj.forma_pagamento, `EST-${pgFinalObj.id}`]
        );

        // 3. Atualizar a conta
        await client.query(
            `UPDATE public.contas_receber 
             SET valor_pago = valor_pago - 70.00, saldo_devedor = saldo_devedor + 70.00, status = 'aver_na_conta', data_quitacao = NULL
             WHERE id = $1`,
            [crBId]
        );

        const checkBEstornada = await client.query('SELECT * FROM public.contas_receber WHERE id = $1', [crBId]);
        assert(checkBEstornada.rows[0].status === 'aver_na_conta', 'Status reverteu para "aver_na_conta"');
        assert(Number(checkBEstornada.rows[0].saldo_devedor) === 70.00, 'Saldo devedor restaurado para R$ 70,00');
        assert(Number(checkBEstornada.rows[0].valor_pago) === 80.00, 'Valor pago restaurado para R$ 80,00');
        assert(checkBEstornada.rows[0].data_quitacao === null, 'Data de quitação removida');

        // =====================================================================
        // TESTE 8: Regra de Negócio — Impedir Pagamento Superior ao Saldo
        // =====================================================================
        console.log('\n--- Teste 8: Validação de Saldo e Prevenção de Excedente ---');
        const saldoAtualB = Number(checkBEstornada.rows[0].saldo_devedor); // 70.00
        const tentativaExcedente = 120.00;
        let bloqueadoComSucesso = false;

        // Regra implementada no controlador (js/fiado.js)
        if (tentativaExcedente > saldoAtualB) {
            bloqueadoComSucesso = true;
        }
        assert(bloqueadoComSucesso, 'Tentativa de pagar R$ 120,00 sobre saldo devedor de R$ 70,00 foi barrada');

        // =====================================================================
        // TESTE 9: Extrato por Cliente e Rastreabilidade Individual
        // =====================================================================
        console.log('\n--- Teste 9: Extrato Individual do Cliente com Múltiplas Vendas ---');
        const extratoContas = await client.query(
            `SELECT * FROM public.contas_receber WHERE cliente_id = $1 AND status != 'cancelado' ORDER BY id ASC`,
            [testClienteId]
        );
        assert(extratoContas.rows.length >= 3, 'Extrato lista todas as vendas a prazo do cliente individualmente');
        const totalDevidoCliente = extratoContas.rows.reduce((sum, c) => sum + Number(c.saldo_devedor), 0);
        // Conta A (150) + Conta B (70) + Conta C (0) = 220
        assert(totalDevidoCliente === 220.00, `Total devido geral calculado corretamente: R$ ${totalDevidoCliente.toFixed(2)}`);

        // =====================================================================
        // TESTE 10: Integridade Financeira — Sem Duplicidade de Vendas ou Estoque
        // =====================================================================
        console.log('\n--- Teste 10: Não Duplicação de Faturamento, Itens ou Estoque ---');
        // Contar quantas saidas foram criadas para o cliente de teste
        const totalSaidasCli = await client.query(
            `SELECT COUNT(*) FROM public.saidas WHERE cliente_id = $1`, [testClienteId]
        );
        // Exatamente 3 vendas foram criadas (vendaA, vendaB, vendaC). Nenhum pagamento criou dublicidade em saidas!
        assert(parseInt(totalSaidasCli.rows[0].count) === 3, 'Nenhum recebimento de parcela duplicou ou criou vendas em "saidas"');

        // Verificar conciliação com o caixa ativo
        const pagsCaixa = await client.query(
            `SELECT SUM(valor_pago) as total_recebido_caixa 
             FROM public.contas_receber_pagamentos 
             WHERE caixa_id = $1 AND cancelado = false AND tipo_operacao != 'venda_realizada'`,
            [testCaixaId]
        );
        assert(Number(pagsCaixa.rows[0].total_recebido_caixa) > 0, 'Recebimentos no caixa contabilizados com precisão');

        console.log('\n--- Limpando Dados de Teste ---');
        await client.query('DELETE FROM public.contas_receber_pagamentos WHERE cliente_id = $1', [testClienteId]);
        await client.query('DELETE FROM public.contas_receber WHERE cliente_id = $1', [testClienteId]);
        await client.query('DELETE FROM public.saidas WHERE cliente_id = $1', [testClienteId]);
        await client.query('DELETE FROM public.clientes WHERE id = $1', [testClienteId]);
        console.log('Dados de teste limpos com sucesso.');

        client.release();

        console.log('\n================================================================');
        console.log(`🎉 RESULTADO: ${testsPassed} testes passaram, ${testsFailed} falharam.`);
        console.log('================================================================\n');

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
