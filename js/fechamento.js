// js/fechamento.js
// Lógica para controle de abertura e fechamento diário de caixa no Supabase

let caixaAtivo = null;
let dadosVendasAtivo = null; // Guardará os dados do caixa ativo para impressão
const usuario = JSON.parse(sessionStorage.getItem('usuario'));

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function formatarDataHora(dataISO) {
    if (!dataISO) return '-';
    const date = new Date(dataISO);
    return date.toLocaleString('pt-BR');
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    // Inicializar controles e listeners
    await inicializarPagina();
});

async function inicializarPagina() {
    // 1. Verificar se a tabela caixas existe e carregar dados
    try {
        caixaAtivo = await obterCaixaAtivo();
    } catch (e) {
        // Se der erro ao carregar (por exemplo, tabela inexistente)
        exibirMensagemConfiguracaoSQL();
        return;
    }

    // Como obterCaixaAtivo trata erro e retorna null em caso de erro da tabela,
    // precisamos testar se a chamada de teste na API falha de fato para exibir a instrução de SQL.
    // Vamos fazer uma consulta direta rápida para validar a tabela caixas.
    try {
        const { error } = await supabaseClient.from('caixas').select('id').limit(1);
        if (error && (error.status === 404 || error.code === 'PGRST116')) {
            exibirMensagemConfiguracaoSQL();
            return;
        }
    } catch (err) {
        exibirMensagemConfiguracaoSQL();
        return;
    }

    if (caixaAtivo) {
        // Caixa está aberto
        exibirCaixaAberto(caixaAtivo);
    } else {
        // Caixa está fechado
        exibirCaixaFechado();
    }

    // Carregar histórico de caixas fechados
    carregarHistoricoCaixas();
}

function exibirMensagemConfiguracaoSQL() {
    const statusBadge = document.getElementById('statusCaixaBadge');
    if (statusBadge) statusBadge.innerHTML = '<span class="status-badge fechado">⚠️ Tabela Não Configurada</span>';
    
    const layout = document.querySelector('.fechamento-layout');
    if (layout) {
        layout.innerHTML = `
            <div class="panel-secao" style="border-left: 5px solid var(--danger);">
                <h3 style="color: var(--danger);">⚠️ Banco de Dados Não Configurado</h3>
                <p style="font-size: 14px; margin-bottom: 20px;">
                    A tabela de controle de caixas (<code>caixas</code>) não foi encontrada no banco de dados Supabase. 
                    Para utilizar este recurso, você precisa executar o script de criação no seu Supabase.
                </p>
                <h4 style="font-size: 14px; margin-bottom: 10px; color: var(--dark);">Passos para configurar:</h4>
                <ol style="margin-left: 20px; margin-bottom: 20px; font-size: 14px; line-height: 1.8;">
                    <li>Acesse o <a href="https://supabase.com" target="_blank" style="color: var(--primary); font-weight: 700;">Painel do Supabase</a> e abra seu projeto.</li>
                    <li>No menu lateral esquerdo, clique no ícone do <strong>SQL Editor</strong> (ícone <code>SQL</code>).</li>
                    <li>Clique em <strong>New query</strong> (Nova consulta).</li>
                    <li>Copie o script SQL abaixo, cole no editor e clique no botão <strong>Run</strong> (Executar) no canto inferior direito.</li>
                </ol>
                 <textarea readonly style="width: 100%; height: 210px; padding: 12px; font-family: monospace; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: #faf9f6; resize: none; outline: none; margin-bottom: 20px;" onclick="this.select()">-- 1. Criar tabela de controle de caixas com suporte multi-tenant (loja_id)
CREATE TABLE public.caixas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    data_abertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_fechamento TIMESTAMP WITH TIME ZONE,
    saldo_inicial NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    saldo_final NUMERIC(10, 2),
    usuario_abertura_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_fechamento_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'aberto' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Adicionar coluna caixa_id na tabela de saidas
ALTER TABLE public.saidas ADD COLUMN IF NOT EXISTS caixa_id INTEGER REFERENCES public.caixas(id) ON DELETE SET NULL;

-- 3. Habilitar RLS (Row Level Security) na tabela caixas
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

-- 4. Criar política de isolamento multi-tenant (RLS) para tabela caixas
CREATE POLICY tenant_caixas_policy ON public.caixas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
</textarea>
                <button class="btn-acao-caixa btn-abrir" onclick="window.location.reload()">
                    🔄 Já executei o SQL, recarregar página
                </button>
            </div>
        `;
    }
}

async function exibirCaixaFechado() {
    const statusBadge = document.getElementById('statusCaixaBadge');
    if (statusBadge) statusBadge.innerHTML = '<span class="status-badge fechado">🔴 Caixa Fechado</span>';
    
    document.getElementById('aberturaSeccion').style.display = 'block';
    document.getElementById('fechamentoSeccion').style.display = 'none';
    
    // Configurar listener de abertura
    const btnAbrir = document.getElementById('btnAbrirCaixa');
    btnAbrir.onclick = abrirCaixa;
    
    // Carregar informações do último caixa fechado
    try {
        const ultimoCaixa = await obterUltimoCaixaFechado();
        if (ultimoCaixa) {
            document.getElementById('ultimoCaixaInfo').style.display = 'block';
            document.getElementById('uAberturaDate').textContent = formatarDataHora(ultimoCaixa.data_abertura);
            document.getElementById('uFechamentoDate').textContent = formatarDataHora(ultimoCaixa.data_fechamento);
            document.getElementById('uSaldoInicial').textContent = formatarMoeda(ultimoCaixa.saldo_inicial);
            document.getElementById('uSaldoFinal').textContent = formatarMoeda(ultimoCaixa.saldo_final);
            
            const btnImprimir = document.getElementById('btnImprimirUltimoRelatorio');
            if (btnImprimir) {
                btnImprimir.onclick = () => {
                    imprimirRelatorioPorCaixa(ultimoCaixa);
                };
            }
        }
    } catch (e) {
        console.error('Erro ao carregar último caixa:', e);
    }
}

async function abrirCaixa() {
    const saldoInicialInput = document.getElementById('saldoInicial');
    const saldoInicial = parseFloat(saldoInicialInput.value) || 0;
    
    if (saldoInicial < 0) {
        mostrarNotificacao('O saldo inicial não pode ser menor que zero!', 'error');
        return;
    }
    
    const btn = document.getElementById('btnAbrirCaixa');
    btn.disabled = true;
    btn.textContent = '⏳ Abrindo caixa...';
    
    try {
        const { error } = await supabaseClient
            .from('caixas')
            .insert([{
                saldo_inicial: saldoInicial,
                usuario_abertura_id: usuario.id,
                status: 'aberto',
                data_abertura: new Date().toISOString()
            }]);
            
        if (error) throw error;
        
        mostrarNotificacao('✅ Caixa aberto com sucesso!', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } catch (e) {
        console.error('Erro ao abrir caixa:', e);
        if (e.status === 404 || e.code === 'PGRST116') {
            exibirMensagemConfiguracaoSQL();
        } else {
            mostrarNotificacao('Erro ao abrir caixa: ' + e.message, 'error');
        }
        btn.disabled = false;
        btn.textContent = '🔓 Abrir Caixa do Dia';
    }
}

async function exibirCaixaAberto(caixa) {
    const statusBadge = document.getElementById('statusCaixaBadge');
    if (statusBadge) statusBadge.innerHTML = '<span class="status-badge aberto">🟢 Caixa Aberto</span>';
    
    document.getElementById('aberturaSeccion').style.display = 'none';
    document.getElementById('fechamentoSeccion').style.display = 'block';
    
    document.getElementById('btnFecharCaixa').onclick = fecharCaixa;
    
    // Dados básicos do caixa
    document.getElementById('cDataAbertura').textContent = formatarDataHora(caixa.data_abertura);
    document.getElementById('cSaldoInicial').textContent = formatarMoeda(caixa.saldo_inicial);
    
    // Buscar operador da abertura
    let nomeOperador = 'Desconhecido';
    try {
        const { data: userObj } = await supabaseClient
            .from('usuarios')
            .select('nome')
            .eq('id', caixa.usuario_abertura_id)
            .single();
        if (userObj) nomeOperador = userObj.nome;
    } catch (e) {
        console.error(e);
    }
    document.getElementById('cUsuarioAbertura').textContent = nomeOperador;
    
    // KPI fundo inicial
    document.getElementById('kpiFundoInicial').textContent = formatarMoeda(caixa.saldo_inicial);
    
    // Carregar vendas do caixa ativo
    await carregarVendasCaixa(caixa);
}

async function carregarVendasCaixa(caixa) {
    try {
        let queryVendas = supabaseClient.from('saidas').select('*').eq('cancelado', false);
        
        let vendas = [];
        let useDateFallback = false;
        
        try {
            const { data, error } = await queryVendas.eq('caixa_id', caixa.id);
            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('caixa_id')) {
                    useDateFallback = true;
                } else {
                    throw error;
                }
            } else {
                vendas = data || [];
            }
        } catch (err) {
            useDateFallback = true;
        }
        
        if (useDateFallback) {
            // Filtrar vendas onde data_finalizacao >= data_abertura
            const { data, error } = await supabaseClient
                .from('saidas')
                .select('*')
                .eq('cancelado', false)
                .gte('data_finalizacao', caixa.data_abertura);
            if (error) throw error;
            vendas = data || [];
        }

        // Carregar despesas do período do caixa
        let despesas = [];
        try {
            let queryDespesas = supabaseClient
                .from('despesas')
                .select('*')
                .gte('created_at', caixa.data_abertura);
            if (caixa.data_fechamento) {
                queryDespesas = queryDespesas.lte('created_at', caixa.data_fechamento);
            }
            const { data: despesasData, error: despesasError } = await queryDespesas;
            if (!despesasError) {
                despesas = despesasData || [];
            }
        } catch (e) {
            console.warn('Erro ao carregar despesas do caixa:', e);
        }
        const totalDespesas = despesas.reduce((s, d) => s + (d.valor || 0), 0);
        
        // Calcular totais
        let totalVendas = 0;
        let totalDescontos = 0;
        let totalItens = 0;
        let dinheiroVendas = 0;
        
        const formasPagamento = {};
        const vendaIds = [];
        
        vendas.forEach(v => {
            totalVendas += v.total || 0;
            totalDescontos += v.desconto || 0;
            vendaIds.push(v.id);
            
            // Agrupar por forma de pagamento
            const fp = v.forma_pagamento || 'Não Informado';
            formasPagamento[fp] = (formasPagamento[fp] || 0) + (v.total || 0);
            
            if (fp.toLowerCase().includes('dinheiro')) {
                dinheiroVendas += v.total || 0;
            }
        });
        
        // Exibir KPIs
        document.getElementById('kpiVendasDia').textContent = formatarMoeda(totalVendas);
        if (document.getElementById('kpiDespesasDia')) {
            document.getElementById('kpiDespesasDia').textContent = formatarMoeda(totalDespesas);
        }
        document.getElementById('kpiTotalCaixa').textContent = formatarMoeda(caixa.saldo_inicial + totalVendas - totalDespesas);
        document.getElementById('kpiDescontos').textContent = formatarMoeda(totalDescontos);
        
        // Sugerir saldo final na gaveta (Saldo Inicial + Vendas em Dinheiro - Despesas)
        const saldoFinalEsperado = caixa.saldo_inicial + dinheiroVendas - totalDespesas;
        document.getElementById('saldoFinal').value = Math.max(0, saldoFinalEsperado).toFixed(2);
        
        // Se houver vendas, carregar itens
        let itens = [];
        if (vendaIds.length > 0) {
            const { data: itensData, error: errorItens } = await supabaseClient
                .from('saida_itens')
                .select('*, produtos(*)')
                .in('saida_id', vendaIds);
                
            if (errorItens) throw errorItens;
            itens = itensData || [];
        }
        
        // Calcular total itens
        itens.forEach(item => {
            totalItens += item.quantidade || 0;
        });
        document.getElementById('kpiItensVendidos').textContent = totalItens;
        
        // Agrupar por categoria / plano
        const categorias = {};
        itens.forEach(item => {
            const cat = item.produtos?.categoria || 'Sem Categoria';
            if (!categorias[cat]) {
                categorias[cat] = { qtd: 0, total: 0 };
            }
            categorias[cat].qtd += item.quantidade || 0;
            categorias[cat].total += item.subtotal || 0;
        });

        // Guardar para impressão
        dadosVendasAtivo = {
            totalVendas,
            totalDescontos,
            totalItens,
            formasPagamento,
            categorias,
            totalDespesas,
            despesas
        };

        // Renderizar tabelas na tela
        renderizarFormasPagamento(formasPagamento);
        renderizarVendasPorPlano(categorias);
        renderizarDespesas(despesas);
        
    } catch (e) {
        console.error('Erro ao carregar vendas do caixa:', e);
        mostrarNotificacao('Erro ao carregar dados de vendas: ' + e.message, 'error');
    }
}

function renderizarFormasPagamento(formasPagamento) {
    const tbody = document.querySelector('#tabelaPagamentos tbody');
    if (!tbody) return;
    
    const keys = Object.keys(formasPagamento);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--gray);">Nenhuma venda registrada neste caixa</td></tr>`;
        return;
    }
    
    tbody.innerHTML = keys.map(key => `
        <tr>
            <td><strong>${key}</strong></td>
            <td style="text-align: right; font-weight: 700; color: var(--success);">${formatarMoeda(formasPagamento[key])}</td>
        </tr>
    `).join('');
}

function renderizarVendasPorPlano(categorias) {
    const tbody = document.querySelector('#tabelaPlanos tbody');
    if (!tbody) return;
    
    const keys = Object.keys(categorias);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--gray);">Nenhum item vendido neste caixa</td></tr>`;
        return;
    }
    
    // Ordenar categorias colocando "Plano" ou "Planos" primeiro, se existirem
    keys.sort((a, b) => {
        const isAPlano = a.toLowerCase().includes('plano');
        const isBPlano = b.toLowerCase().includes('plano');
        if (isAPlano && !isBPlano) return -1;
        if (!isAPlano && isBPlano) return 1;
        return a.localeCompare(b);
    });
    
    tbody.innerHTML = keys.map(cat => {
        const isPlano = cat.toLowerCase().includes('plano');
        const estiloLinha = isPlano ? 'style="background-color: #fcf8e3; font-weight: 600;"' : '';
        return `
            <tr ${estiloLinha}>
                <td>${isPlano ? '📱 ' : ''}<strong>${cat}</strong></td>
                <td style="text-align: center;">${categorias[cat].qtd}</td>
                <td style="text-align: right; font-weight: 700;">${formatarMoeda(categorias[cat].total)}</td>
            </tr>
        `;
    }).join('');
}

function renderizarDespesas(despesas) {
    const tbody = document.querySelector('#tabelaDespesas tbody');
    if (!tbody) return;
    
    if (!despesas || despesas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--gray); padding: 15px;">Nenhuma despesa registrada neste período</td></tr>';
        return;
    }
    
    tbody.innerHTML = despesas.map(d => `
        <tr>
            <td><strong>${d.descricao}</strong><br><small style="color:var(--gray);">${d.categoria || 'Sem categoria'}</small></td>
            <td>${new Date(d.created_at || d.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="status-badge ${d.status === 'pago' ? 'aberto' : 'fechado'}" style="padding: 2px 8px; font-size: 11px;">${d.status === 'pago' ? 'Pago' : 'Pendente'}</span></td>
            <td style="text-align: right; font-weight: 700; color: #dc2626;">- ${formatarMoeda(d.valor)}</td>
        </tr>
    `).join('');
}

async function fecharCaixa() {
    const saldoFinalInput = document.getElementById('saldoFinal');
    const saldoFinal = parseFloat(saldoFinalInput.value) || 0;
    
    if (saldoFinal < 0) {
        mostrarNotificacao('O saldo final não pode ser menor que zero!', 'error');
        return;
    }
    
    if (!confirm('Deseja realmente fechar o caixa? Esta ação impedirá novas vendas hoje.')) {
        return;
    }
    
    const btn = document.getElementById('btnFecharCaixa');
    btn.disabled = true;
    btn.textContent = '⏳ Fechando caixa...';
    
    try {
        const dataFechamento = new Date().toISOString();
        const { error } = await supabaseClient
            .from('caixas')
            .update({
                saldo_final: saldoFinal,
                usuario_fechamento_id: usuario.id,
                status: 'fechado',
                data_fechamento: dataFechamento
            })
            .eq('id', caixaAtivo.id);
            
        if (error) throw error;
        
        mostrarNotificacao('🔒 Caixa fechado com sucesso!', 'success');
        
        // Perguntar sobre a impressão
        const imprimir = confirm('Deseja imprimir o Relatório de Fechamento de Caixa?');
        if (imprimir) {
            const nomeOperador = document.getElementById('cUsuarioAbertura').textContent;
            // Atualizar o objeto local do caixa ativo com os dados de fechamento para a impressão
            caixaAtivo.data_fechamento = dataFechamento;
            caixaAtivo.saldo_final = saldoFinal;
            imprimirRelatorioFechamento(caixaAtivo, dadosVendasAtivo, nomeOperador);
        }
        
        setTimeout(() => {
            window.location.reload();
        }, 1200);
    } catch (e) {
        console.error('Erro ao fechar caixa:', e);
        mostrarNotificacao('Erro ao fechar caixa: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = '🔒 Fechar Caixa Diário';
    }
}

// =====================================================
// FUNÇÕES DE IMPRESSÃO DO RELATÓRIO DE FECHAMENTO
// =====================================================

function imprimirRelatorioFechamento(caixa, dadosVendas, nomeOperador) {
    const dataHoraAbertura = formatarDataHora(caixa.data_abertura);
    const dataHoraFechamento = formatarDataHora(caixa.data_fechamento || new Date().toISOString());
    const saldoInicial = formatarMoeda(caixa.saldo_inicial);
    const saldoFinal = formatarMoeda(caixa.saldo_final || 0);
    const totalVendas = formatarMoeda(dadosVendas.totalVendas);
    const totalDescontos = formatarMoeda(dadosVendas.totalDescontos);
    const totalItens = dadosVendas.totalItens;
    const totalDespesas = formatarMoeda(dadosVendas.totalDespesas || 0);
    const totalGeral = formatarMoeda(caixa.saldo_inicial + dadosVendas.totalVendas - (dadosVendas.totalDespesas || 0));
    
    // Formas de pagamento html
    let pagamentosHtml = '';
    const fpKeys = Object.keys(dadosVendas.formasPagamento);
    if (fpKeys.length > 0) {
        pagamentosHtml = fpKeys.map(k => `
            <tr>
                <td>${k}</td>
                <td class="text-right">${formatarMoeda(dadosVendas.formasPagamento[k])}</td>
            </tr>
        `).join('');
    } else {
        pagamentosHtml = '<tr><td colspan="2" class="text-center">Nenhuma venda registrada</td></tr>';
    }

    // Planos / Categorias html (Tipo / Quantidade apenas!)
    let planosHtml = '';
    const planoKeys = Object.keys(dadosVendas.categorias);
    if (planoKeys.length > 0) {
        planoKeys.sort((a, b) => {
            const isAPlano = a.toLowerCase().includes('plano');
            const isBPlano = b.toLowerCase().includes('plano');
            if (isAPlano && !isBPlano) return -1;
            if (!isAPlano && isBPlano) return 1;
            return a.localeCompare(b);
        });

        planosHtml = planoKeys.map(k => `
            <tr>
                <td>${k}</td>
                <td class="text-right bold">${dadosVendas.categorias[k].qtd}</td>
            </tr>
        `).join('');
    } else {
        planosHtml = '<tr><td colspan="2" class="text-center">Nenhum item vendido</td></tr>';
    }

    // Despesas html
    let despesasHtml = '';
    if (dadosVendas.despesas && dadosVendas.despesas.length > 0) {
        despesasHtml = dadosVendas.despesas.map(d => `
            <tr>
                <td>${d.descricao}</td>
                <td class="text-right">${formatarMoeda(d.valor)}</td>
            </tr>
        `).join('');
    } else {
        despesasHtml = '<tr><td colspan="2" class="text-center">Nenhuma despesa</td></tr>';
    }

    const janela = window.open('', '_blank');
    janela.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Relatório de Fechamento de Caixa</title>
            <style>
                @page { margin: 0; size: auto; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    margin: 0;
                    padding: 4mm;
                    width: 100%;
                    max-width: 72mm;
                    margin: 0 auto;
                    font-size: 13px;
                    line-height: 1.3;
                    box-sizing: border-box;
                    background: #fff;
                    color: #000;
                }
                .header {
                    text-align: center;
                    border-bottom: 1px dashed #000;
                    padding-bottom: 8px;
                    margin-bottom: 10px;
                }
                .header h1 {
                    margin: 0 0 3px 0;
                    font-size: 14px;
                    text-transform: uppercase;
                    font-weight: bold;
                }
                .header p {
                    margin: 0;
                    font-size: 11px;
                }
                .info-line {
                    font-size: 11px;
                    margin-bottom: 8px;
                    border-bottom: 1px dashed #000;
                    padding-bottom: 5px;
                }
                .kpi-section {
                    margin-bottom: 10px;
                    border-bottom: 1px dashed #000;
                    padding-bottom: 5px;
                }
                .kpi-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    margin-bottom: 3px;
                }
                .secao {
                    margin-bottom: 12px;
                }
                .secao h3 {
                    margin: 0 0 5px 0;
                    font-size: 12px;
                    text-transform: uppercase;
                    border-bottom: 1px dashed #000;
                    padding-bottom: 3px;
                    font-weight: bold;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    padding: 3px 0;
                    font-size: 12px;
                    text-align: left;
                }
                th {
                    border-bottom: 1px dashed #000;
                    font-weight: bold;
                }
                .text-right {
                    text-align: right;
                }
                .text-center {
                    text-align: center;
                }
                .bold {
                    font-weight: bold;
                }
                .no-print-btn {
                    text-align: right;
                    margin-bottom: 10px;
                }
                .btn {
                    background: #000;
                    color: #fff;
                    border: 1px solid #000;
                    padding: 5px 10px;
                    font-size: 11px;
                    font-family: monospace;
                    cursor: pointer;
                    font-weight: bold;
                }
                .btn-secondary {
                    background: #888;
                    border-color: #888;
                    margin-left: 5px;
                }
                @media print {
                    .no-print-btn {
                        display: none !important;
                    }
                    body {
                        width: 72mm;
                        margin: 0;
                        padding: 2mm;
                    }
                }
            </style>
        </head>
        <body>
            <div class="no-print-btn">
                <button class="btn" onclick="window.print()">Imprimir</button>
                <button class="btn btn-secondary" onclick="window.close()">Fechar</button>
            </div>
            
            <div class="header">
                <h1>FECHAMENTO DE CAIXA</h1>
                <p>${usuario.loja_nome || 'Aion ERP'}</p>
            </div>
            
            <div class="info-line">
                Abertura:   ${dataHoraAbertura}<br>
                Fechamento: ${dataHoraFechamento}<br>
                Operador:   ${nomeOperador}
            </div>
            
            <div class="kpi-section">
                <div class="kpi-row"><span>Saldo Inicial:</span><span class="bold">${saldoInicial}</span></div>
                <div class="kpi-row"><span>Vendas no Dia:</span><span class="bold">${totalVendas}</span></div>
                <div class="kpi-row"><span>Despesas no Dia:</span><span class="bold" style="color:#dc2626;">-${totalDespesas}</span></div>
                <div class="kpi-row"><span>Total Líquido:</span><span class="bold">${totalGeral}</span></div>
                <div class="kpi-row"><span>Declarado Caixa:</span><span class="bold">${saldoFinal}</span></div>
                <div class="kpi-row"><span>Descontos:</span><span class="bold">${totalDescontos}</span></div>
                <div class="kpi-row"><span>Itens Vendidos:</span><span class="bold">${totalItens}</span></div>
            </div>
            
            <div class="secao">
                <h3>💳 Pagamentos</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Forma</th>
                            <th class="text-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pagamentosHtml}
                        <tr style="border-top: 1px dashed #000; font-weight: bold;">
                            <td>TOTAL VENDAS</td>
                            <td class="text-right">${totalVendas}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="secao">
                <h3>💸 Despesas</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Descrição</th>
                            <th class="text-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${despesasHtml}
                        <tr style="border-top: 1px dashed #000; font-weight: bold;">
                            <td>TOTAL DESPESAS</td>
                            <td class="text-right">${totalDespesas}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div class="secao">
                <h3>📦 Tipo / Quantidade</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Tipo (Categoria)</th>
                            <th class="text-right">Qtd</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${planosHtml}
                    </tbody>
                </table>
            </div>

            <div style="margin-top: 40px; border-top: 1px dashed #000; padding-top: 15px; text-align: center; font-size: 11px;">
                Assinatura Operador: ${nomeOperador}
                <br><br><br>
                __________________________________
            </div>
            
            <div style="margin-top: 30px; text-align: center; font-size: 11px; margin-bottom: 20px;">
                Assinatura Gerente
                <br><br><br>
                __________________________________
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(() => { window.print(); }, 400);
                }
            </script>
        </body>
        </html>
    `);
    janela.document.close();
}

async function imprimirRelatorioPorCaixa(caixa) {
    if (!caixa) return;
    
    mostrarNotificacao('⏳ Preparando relatório para impressão...', 'info');
    
    try {
        // 1. Buscar operador
        let nomeOperador = 'Desconhecido';
        try {
            const { data: userObj } = await supabaseClient
                .from('usuarios')
                .select('nome')
                .eq('id', caixa.usuario_abertura_id)
                .single();
            if (userObj) nomeOperador = userObj.nome;
        } catch (e) {
            console.error(e);
        }

        // 2. Buscar vendas
        let queryVendas = supabaseClient.from('saidas').select('*').eq('cancelado', false);
        let vendas = [];
        let useDateFallback = false;
        
        try {
            const { data, error } = await queryVendas.eq('caixa_id', caixa.id);
            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('caixa_id')) {
                    useDateFallback = true;
                } else {
                    throw error;
                }
            } else {
                vendas = data || [];
            }
        } catch (err) {
            useDateFallback = true;
        }
        
        if (useDateFallback) {
            let q = supabaseClient
                .from('saidas')
                .select('*')
                .eq('cancelado', false)
                .gte('data_finalizacao', caixa.data_abertura);
            if (caixa.data_fechamento) {
                q = q.lte('data_finalizacao', caixa.data_fechamento);
            }
            const { data, error } = await q;
            if (error) throw error;
            vendas = data || [];
        }

        // Buscar despesas para impressão histórica
        let despesas = [];
        try {
            let qDesp = supabaseClient
                .from('despesas')
                .select('*')
                .gte('created_at', caixa.data_abertura);
            if (caixa.data_fechamento) {
                qDesp = qDesp.lte('created_at', caixa.data_fechamento);
            }
            const { data: despesasData, error: errorDespesas } = await qDesp;
            if (!errorDespesas) despesas = despesasData || [];
        } catch (e) {
            console.error('Erro ao buscar despesas para impressão:', e);
        }
        const totalDespesas = despesas.reduce((s, d) => s + (d.valor || 0), 0);

        // 3. Totais e agregação
        let totalVendas = 0;
        let totalDescontos = 0;
        let totalItens = 0;
        const formasPagamento = {};
        const vendaIds = [];
        
        vendas.forEach(v => {
            totalVendas += v.total || 0;
            totalDescontos += v.desconto || 0;
            vendaIds.push(v.id);
            
            const fp = v.forma_pagamento || 'Não Informado';
            formasPagamento[fp] = (formasPagamento[fp] || 0) + (v.total || 0);
        });

        // 4. Buscar itens
        let itens = [];
        if (vendaIds.length > 0) {
            const { data: itensData, error: errorItens } = await supabaseClient
                .from('saida_itens')
                .select('*, produtos(*)')
                .in('saida_id', vendaIds);
            if (errorItens) throw errorItens;
            itens = itensData || [];
        }

        const categorias = {};
        itens.forEach(item => {
            totalItens += item.quantidade || 0;
            const cat = item.produtos?.categoria || 'Sem Categoria';
            if (!categorias[cat]) {
                categorias[cat] = { qtd: 0, total: 0 };
            }
            categorias[cat].qtd += item.quantidade || 0;
            categorias[cat].total += item.subtotal || 0;
        });

        // 5. Aparelhos IMEI
        const itensComSerial = itens.filter(i => i.serial_id);
        let aparelhos = [];
        if (itensComSerial.length > 0) {
            const serialIds = itensComSerial.map(i => i.serial_id);
            let seriais = [];
            try {
                const { data: seriaisData, error: errorSeriais } = await supabaseClient
                    .from('produtos_seriais')
                    .select('*')
                    .in('id', serialIds);
                if (!errorSeriais) seriais = seriaisData || [];
            } catch (e) {
                console.error(e);
            }
            
            const seriaisMap = {};
            seriais.forEach(s => { seriaisMap[s.id] = s; });
            
            aparelhos = itensComSerial.map(item => {
                const serialObj = seriaisMap[item.serial_id];
                const serialText = serialObj 
                    ? (serialObj.imei ? `IMEI: ${serialObj.imei}` : `S/N: ${serialObj.numero_serie}`) 
                    : 'Não localizado';
                return {
                    nome: item.produtos?.nome || 'Produto Desconhecido',
                    marca: item.produtos?.marca || '-',
                    modelo: item.produtos?.modelo || '-',
                    serialText: serialText,
                    valor: item.valor_unitario
                };
            });
        }

        const dadosVendas = {
            totalVendas,
            totalDescontos,
            totalItens,
            formasPagamento,
            categorias,
            totalDespesas,
            despesas
        };

        // Chamar impressão
        imprimirRelatorioFechamento(caixa, dadosVendas, nomeOperador);

    } catch (e) {
        console.error('Erro ao gerar relatório de fechamento:', e);
        mostrarNotificacao('Erro ao carregar dados do relatório para impressão', 'error');
    }
}

async function carregarHistoricoCaixas() {
    const tbody = document.getElementById('historicoCaixasBody');
    if (!tbody) return;
    
    try {
        const { data: caixas, error } = await supabaseClient
            .from('caixas')
            .select('*')
            .eq('status', 'fechado')
            .order('id', { ascending: false });
            
        if (error) throw error;
        
        if (!caixas || caixas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray);">Nenhum caixa fechado registrado.</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        
        caixas.forEach(caixa => {
            const tr = document.createElement('tr');
            
            const tdId = document.createElement('td');
            tdId.textContent = `#${caixa.id}`;
            tdId.style.fontWeight = 'bold';
            
            const tdAbertura = document.createElement('td');
            tdAbertura.textContent = formatarDataHora(caixa.data_abertura);
            
            const tdFechamento = document.createElement('td');
            tdFechamento.textContent = formatarDataHora(caixa.data_fechamento);
            
            const tdInicial = document.createElement('td');
            tdInicial.textContent = formatarMoeda(caixa.saldo_inicial);
            
            const tdFinal = document.createElement('td');
            tdFinal.textContent = formatarMoeda(caixa.saldo_final || 0);
            
            const tdAcoes = document.createElement('td');
            tdAcoes.style.textAlign = 'center';
            
            const btnPrint = document.createElement('button');
            btnPrint.className = 'btn-acao-caixa btn-abrir';
            btnPrint.style.background = 'var(--primary)';
            btnPrint.style.padding = '6px 12px';
            btnPrint.style.fontSize = '12px';
            btnPrint.style.display = 'inline-flex';
            btnPrint.style.margin = '0 auto';
            btnPrint.style.width = 'auto';
            btnPrint.style.height = 'auto';
            btnPrint.style.lineHeight = 'normal';
            btnPrint.innerHTML = '🖨️ Relatório';
            btnPrint.onclick = () => {
                imprimirRelatorioPorCaixa(caixa);
            };
            
            tdAcoes.appendChild(btnPrint);
            
            tr.appendChild(tdId);
            tr.appendChild(tdAbertura);
            tr.appendChild(tdFechamento);
            tr.appendChild(tdInicial);
            tr.appendChild(tdFinal);
            tr.appendChild(tdAcoes);
            
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Erro ao carregar histórico de caixas:', e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Erro ao carregar histórico.</td></tr>';
    }
}
