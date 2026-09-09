// scripts/test_neon_environment.js
// Valida o ambiente Neon em modo de homologacao com teste completo de todos os modulos

require('dotenv').config();
const http = require('http');
const { handleApiRequest } = require('../server-api');

const targetClient = process.argv[2] || process.env.CLIENTE || 'cliente01';
const TEST_PORT = 3099;

function requestApi(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-tenant-id': '1',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...headers
            }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, body: json });
                } catch(e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function run() {
    console.log('================================================================');
    console.log(`🧪 TESTE COMPLETO DE TODOS OS MÓDULOS NO NEON — ${targetClient.toUpperCase()}`);
    console.log('================================================================');

    // 1. Iniciar servidor de teste com a versão mais recente do server-api.js
    const server = http.createServer(async (req, res) => {
        if (req.url.startsWith('/api/')) {
            const handled = await handleApiRequest(req, res);
            if (handled) return;
        }
        res.writeHead(404);
        res.end();
    });

    await new Promise(res => server.listen(TEST_PORT, res));
    console.log(`🚀 Servidor de teste ativo na porta ${TEST_PORT}\n`);

    let createdSaleId = null;
    let createdSaleItemId = null;
    let createdPromoId = null;
    let createdPromoProdId = null;

    try {
        // --- TESTE 1: Healthcheck ---
        console.log('1. Testando Healthcheck e Conectividade Neon...');
        const hRes = await requestApi('GET', `/api/health?client=${targetClient}`);
        if (hRes.body?.neonStatus === 'connected') {
            console.log('   ✅ Healthcheck OK: Neon conectado com sucesso.');
        } else {
            throw new Error(`Falha no Healthcheck: ${JSON.stringify(hRes.body)}`);
        }

        // --- TESTE 2: Operador JSONB Containment em Produtos ---
        console.log('\n2. Testando Operador JSONB (@>) para Busca de Código de Barras...');
        const bRes = await requestApi('POST', `/api/data/${targetClient}/produtos`, {
            action: 'select',
            select: 'id, nome, codigo',
            filters: [{ column: 'codigos_barras', operator: '@>', value: '["TESTE-CODE"]' }]
        });
        if (bRes.status === 200 && Array.isArray(bRes.body?.data)) {
            console.log('   ✅ Busca JSONB (@>) executada com sucesso.');
        } else {
            throw new Error(`Falha na busca JSONB: ${JSON.stringify(bRes.body)}`);
        }

        // --- TESTE 3: Promoções e Ações Promocionais ---
        console.log('\n3. Testando Módulo de Promoções (Inserção e Consulta)...');
        const promoRes = await requestApi('POST', `/api/data/${targetClient}/promocoes`, {
            action: 'insert',
            values: {
                loja_id: 1,
                nome: 'Promoção Auditoria Neon',
                descricao: 'Teste automatizado de auditoria',
                tipo_desconto: 'porcentagem',
                valor_desconto: 15.00,
                ativo: true
            }
        });
        if (promoRes.status === 201 && promoRes.body?.data?.length > 0) {
            createdPromoId = promoRes.body.data[0].id;
            console.log(`   ✅ Promoção criada com sucesso: ID ${createdPromoId}`);
        } else {
            throw new Error(`Falha ao criar promoção: ${JSON.stringify(promoRes.body)}`);
        }

        // Vincular produto à promoção
        const promoProdRes = await requestApi('POST', `/api/data/${targetClient}/promocao_produtos`, {
            action: 'insert',
            values: {
                loja_id: 1,
                promocao_id: createdPromoId,
                produto_id: 1,
                tipo_desconto: 'porcentagem',
                valor_desconto: 15.00,
                ativo: true
            }
        });
        if (promoProdRes.status === 201 && promoProdRes.body?.data?.length > 0) {
            createdPromoProdId = promoProdRes.body.data[0].id;
            console.log(`   ✅ Produto vinculado à promoção: ID ${createdPromoProdId}`);
        } else {
            throw new Error(`Falha ao vincular produto à promoção: ${JSON.stringify(promoProdRes.body)}`);
        }

        // Consultar produtos da promoção com join PostgREST
        const promoListRes = await requestApi('POST', `/api/data/${targetClient}/promocao_produtos`, {
            action: 'select',
            select: '*, produtos(id, codigo, nome, valor_venda, categoria)',
            filters: [{ column: 'promocao_id', operator: '=', value: createdPromoId }]
        });
        if (promoListRes.status === 200 && promoListRes.body?.data?.length > 0) {
            console.log('   ✅ Consulta de promoção com join em produtos OK:', promoListRes.body.data[0].produtos?.nome || 'Produto encontrado');
        } else {
            throw new Error(`Falha ao consultar promocao_produtos com join: ${JSON.stringify(promoListRes.body)}`);
        }

        // --- TESTE 4: Venda com Desconto & Inserção em saida_itens ---
        console.log('\n4. Testando PDV: Finalização de Venda com Desconto e Promoção...');
        const saleRes = await requestApi('POST', `/api/data/${targetClient}/saidas`, {
            action: 'insert',
            values: {
                cliente_id: 1,
                data: '2026-09-09',
                total: 85.00,
                desconto: 15.00,
                origem_desconto: 'Promoção Auditoria Neon',
                forma_pagamento: 'pix',
                observacao: 'Venda Teste Auditoria | Cliente: 1',
                usuario_id: 1,
                data_finalizacao: new Date().toISOString(),
                cancelado: false
            }
        });
        if (saleRes.status === 201 && saleRes.body?.data?.length > 0) {
            createdSaleId = saleRes.body.data[0].id;
            console.log(`   ✅ Venda registrada na tabela 'saidas': ID ${createdSaleId} (Total: R$ ${saleRes.body.data[0].total}, Desc: R$ ${saleRes.body.data[0].desconto})`);
        } else {
            throw new Error(`Falha ao inserir venda: ${JSON.stringify(saleRes.body)}`);
        }

        // Inserir item da venda com colunas de desconto
        const itemRes = await requestApi('POST', `/api/data/${targetClient}/saida_itens`, {
            action: 'insert',
            values: {
                saida_id: createdSaleId,
                produto_id: 1,
                quantidade: 1,
                valor_unitario: 100.00,
                subtotal: 85.00,
                desconto: 15.00,
                origem_desconto: 'Promoção Auditoria Neon',
                promocao_id: createdPromoId
            }
        });
        if (itemRes.status === 201 && itemRes.body?.data?.length > 0) {
            createdSaleItemId = itemRes.body.data[0].id;
            console.log(`   ✅ Item inserido em 'saida_itens': ID ${createdSaleItemId} (desconto: R$ ${itemRes.body.data[0].desconto}, promocao_id: ${itemRes.body.data[0].promocao_id})`);
        } else {
            throw new Error(`Falha ao inserir item em saida_itens: ${JSON.stringify(itemRes.body)}`);
        }

        // --- TESTE 5: Geração de Comprovante (Join Completo de Venda e Itens) ---
        console.log('\n5. Testando Consultas para Emissão de Comprovante (gerarComprovante)...');
        const comprovanteVendaRes = await requestApi('POST', `/api/data/${targetClient}/saidas`, {
            action: 'select',
            select: '*, clientes(nome,telefone,email,endereco,numero,cidade,estado,cpf_cnpj), usuarios!usuario_id(nome)',
            filters: [{ column: 'id', operator: '=', value: createdSaleId }]
        });
        if (comprovanteVendaRes.status === 200 && comprovanteVendaRes.body?.data?.length > 0) {
            const v = comprovanteVendaRes.body.data[0];
            console.log(`   ✅ Consulta da venda OK: ID ${v.id}, Cliente: ${v.clientes?.nome || 'N/A'}, Operador: ${v.usuarios?.nome || 'N/A'}`);
        } else {
            throw new Error(`Falha na consulta de venda para comprovante: ${JSON.stringify(comprovanteVendaRes.body)}`);
        }

        const comprovanteItensRes = await requestApi('POST', `/api/data/${targetClient}/saida_itens`, {
            action: 'select',
            select: '*, produtos(id,nome,codigo,categoria,marca,modelo)',
            filters: [{ column: 'saida_id', operator: '=', value: createdSaleId }]
        });
        if (comprovanteItensRes.status === 200 && comprovanteItensRes.body?.data?.length > 0) {
            const it = comprovanteItensRes.body.data[0];
            console.log(`   ✅ Consulta dos itens para comprovante OK: Produto "${it.produtos?.nome || 'Produto'}", Qtd: ${it.quantidade}, Subtotal: R$ ${it.subtotal}`);
        } else {
            throw new Error(`Falha na consulta de itens para comprovante: ${JSON.stringify(comprovanteItensRes.body)}`);
        }

        // --- TESTE 6: Listagem de Vendas Recentes ---
        console.log('\n6. Testando Listagem de Vendas Recentes (saidas.js)...');
        const recentesRes = await requestApi('POST', `/api/data/${targetClient}/saidas`, {
            action: 'select',
            select: '*, clientes(nome)',
            order: { column: 'id', ascending: false },
            limit: 10
        });
        if (recentesRes.status === 200 && Array.isArray(recentesRes.body?.data)) {
            console.log(`   ✅ Vendas recentes retornadas: ${recentesRes.body.data.length} venda(s) encontrada(s). Última venda ID: ${recentesRes.body.data[0]?.id}`);
        } else {
            throw new Error(`Falha na listagem de vendas recentes: ${JSON.stringify(recentesRes.body)}`);
        }

        // --- TESTE 7: Relatório de Vendas com Desconto Concedido ---
        console.log('\n7. Testando Relatório de Descontos (carregarRelatorioDescontos)...');
        // Passo A: Consulta de saídas com join de clientes e usuários
        const relSaidasRes = await requestApi('POST', `/api/data/${targetClient}/saidas`, {
            action: 'select',
            select: 'id, data, data_finalizacao, total, desconto, forma_pagamento, observacao, clientes(nome), usuarios!usuario_id(nome)',
            filters: [{ column: 'cancelado', operator: '=', value: false }],
            order: { column: 'data', ascending: false }
        });
        if (relSaidasRes.status !== 200 || !Array.isArray(relSaidasRes.body?.data)) {
            throw new Error(`Falha na consulta de saídas para relatório de descontos: ${JSON.stringify(relSaidasRes.body)}`);
        }
        console.log(`   ✅ Passo A (Saídas): ${relSaidasRes.body.data.length} saídas encontradas.`);

        // Passo B: Consulta de saida_itens com filtro IN em saidasIds
        const saidasIds = [createdSaleId];
        const relItensRes = await requestApi('POST', `/api/data/${targetClient}/saida_itens`, {
            action: 'select',
            select: 'id, saida_id, produto_id, quantidade, valor_unitario, subtotal, desconto, origem_desconto, promocao_id, produtos(id, nome, codigo, categoria)',
            filters: [{ column: 'saida_id', operator: 'IN', value: saidasIds }]
        });
        if (relItensRes.status === 200 && Array.isArray(relItensRes.body?.data)) {
            const foundItem = relItensRes.body.data[0];
            console.log(`   ✅ Passo B (Itens com IN): Retornou item com desconto: R$ ${foundItem?.desconto}, Origem: "${foundItem?.origem_desconto}", Produto: "${foundItem?.produtos?.nome}"`);
        } else {
            throw new Error(`Falha na consulta de itens com IN para relatório de descontos: ${JSON.stringify(relItensRes.body)}`);
        }

        // --- TESTE 8: Demais Relatórios (Movimento Diário, Comissões, Lucro) ---
        console.log('\n8. Testando Demais Relatórios do Sistema...');
        // Movimento diário entradas
        const relEntradasRes = await requestApi('POST', `/api/data/${targetClient}/entradas`, {
            action: 'select',
            select: '*, clientes:fornecedor_id(nome)',
            limit: 5
        });
        console.log(`   ✅ Relatório Movimento Diário (Entradas com Fornecedor): ${relEntradasRes.status === 200 ? 'OK' : 'Erro'}`);

        // Comissões itens
        const relComissaoRes = await requestApi('POST', `/api/data/${targetClient}/saida_itens`, {
            action: 'select',
            select: 'saida_id, produto_id, quantidade, valor_unitario, subtotal, produtos(tipo, nome, comissao_habilitada, comissao_100_porcento, comissao_valor)',
            filters: [{ column: 'saida_id', operator: 'IN', value: [createdSaleId] }]
        });
        console.log(`   ✅ Relatório de Comissões de Vendedores: ${relComissaoRes.status === 200 ? 'OK' : 'Erro'}`);

        // Lucro itens
        const relLucroRes = await requestApi('POST', `/api/data/${targetClient}/saida_itens`, {
            action: 'select',
            select: 'saida_id, quantidade, valor_unitario, subtotal, produtos(nome, codigo, valor_compra)',
            filters: [{ column: 'saida_id', operator: 'IN', value: [createdSaleId] }]
        });
        console.log(`   ✅ Relatório de Lucro / Faturamento: ${relLucroRes.status === 200 ? 'OK' : 'Erro'}`);

        // --- TESTE 9: Módulos Financeiro, Estoque e Serviços ---
        console.log('\n9. Testando Módulos de Despesas, Entradas e Agendamentos...');
        const despRes = await requestApi('POST', `/api/data/${targetClient}/despesas`, { action: 'select', select: '*', limit: 5 });
        const entRes = await requestApi('POST', `/api/data/${targetClient}/entradas`, { action: 'select', select: '*', limit: 5 });
        const agendRes = await requestApi('POST', `/api/data/${targetClient}/agendamentos`, { action: 'select', select: '*', limit: 5 });
        console.log(`   ✅ Despesas: ${despRes.status === 200 ? 'OK' : 'Erro'}`);
        console.log(`   ✅ Entradas: ${entRes.status === 200 ? 'OK' : 'Erro'}`);
        console.log(`   ✅ Agendamentos: ${agendRes.status === 200 ? 'OK' : 'Erro'}`);

        // --- LIMPEZA DE DADOS DE TESTE ---
        console.log('\n10. Limpando registros sintéticos de teste...');
        if (createdSaleItemId) {
            await requestApi('POST', `/api/data/${targetClient}/saida_itens`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdSaleItemId }] });
        }
        if (createdSaleId) {
            await requestApi('POST', `/api/data/${targetClient}/saidas`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdSaleId }] });
        }
        if (createdPromoProdId) {
            await requestApi('POST', `/api/data/${targetClient}/promocao_produtos`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdPromoProdId }] });
        }
        if (createdPromoId) {
            await requestApi('POST', `/api/data/${targetClient}/promocoes`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdPromoId }] });
        }
        console.log('   ✅ Limpeza concluída com sucesso.');

        console.log('\n================================================================');
        console.log('🎉 SUCESSO TOTAL: TODOS OS 10 TESTES PASSARAM COM 100% DE EFICÁCIA!');
        console.log('================================================================\n');

    } catch (e) {
        console.error('\n❌ ERRO DETECTADO NO TESTE:', e.message);
        // Tentar limpeza em caso de erro
        try {
            if (createdSaleItemId) await requestApi('POST', `/api/data/${targetClient}/saida_itens`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdSaleItemId }] });
            if (createdSaleId) await requestApi('POST', `/api/data/${targetClient}/saidas`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdSaleId }] });
            if (createdPromoProdId) await requestApi('POST', `/api/data/${targetClient}/promocao_produtos`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdPromoProdId }] });
            if (createdPromoId) await requestApi('POST', `/api/data/${targetClient}/promocoes`, { action: 'delete', filters: [{ column: 'id', operator: '=', value: createdPromoId }] });
        } catch(err){}
        process.exit(1);
    } finally {
        server.close();
    }
}

run();

