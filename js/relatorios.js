
// js/relatorios.js
// Sistema de Relatórios - VERSÃO CORRIGIDA

let chartVendasMes = null;
let chartTopProdutos = null;
let chartFaturamento = null;
let chartLucroObj = null;

// Flag para controle de carregamento
let dadosCarregados = {
    movimento: false,
    faturamento: false,
    vendas: false,
    lucro: false
};

// Variáveis para armazenar dados brutos para exportação
let dadosExportacao = {
    movimento: null,
    faturamento: null,
    vendas: null,
    lucro: null
};

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    if (!temPermissao('relatorios', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }
    
    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = {
        admin: '👑 Administrador',
        gerente: '📊 Gerente',
        vendedor: '💰 Vendedor',
        tecnico: '🔧 Técnico',
        basico: '👤 Básico'
    };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });
    
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    // Data padrão
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('movimentoData').value = hoje;

    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const trintaDiasAtrasStr = trintaDiasAtras.toISOString().split('T')[0];
    
    if (document.getElementById('colabDataInicio')) document.getElementById('colabDataInicio').value = trintaDiasAtrasStr;
    if (document.getElementById('colabDataFim')) document.getElementById('colabDataFim').value = hoje;
    if (document.getElementById('faturamentoDataInicio')) document.getElementById('faturamentoDataInicio').value = trintaDiasAtrasStr;
    if (document.getElementById('faturamentoDataFim')) document.getElementById('faturamentoDataFim').value = hoje;
    if (document.getElementById('lucroDataInicio')) document.getElementById('lucroDataInicio').value = trintaDiasAtrasStr;
    if (document.getElementById('lucroDataFim')) document.getElementById('lucroDataFim').value = hoje;
    
    // Inicializar
    inicializarFiltrosUsuario().then(() => {
        carregarDashboard();
        carregarMovimentoDiario();
        carregarFaturamento();
        carregarVendasProduto();
        carregarComissoesColaborador();
        carregarRelatorioLucro();
    });
});

// =====================================================
// INICIALIZAR FILTROS DE USUÁRIO
// =====================================================

async function inicializarFiltrosUsuario() {
    const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));
    const verOutros = temPermissao('saidas', 'ver_vendas_outros');

    const selMovimento = document.getElementById('filtroUsuarioMovimento');
    const selFaturamento = document.getElementById('filtroUsuarioFaturamento');
    const selVendas = document.getElementById('filtroUsuarioVendas');

    if (!verOutros) {
        if (selMovimento) selMovimento.style.display = 'none';
        if (selFaturamento) selFaturamento.style.display = 'none';
        if (selVendas) selVendas.style.display = 'none';
        return;
    }

    try {
        const { data: users, error } = await supabaseClient
            .from('usuarios')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome', { ascending: true });

        if (error) throw error;

        const preencherSelect = (selectEl) => {
            if (!selectEl) return;
            selectEl.innerHTML = '<option value="todos">Todos os Usuários</option>';
            users.forEach(u => {
                selectEl.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
            });
            selectEl.style.display = 'inline-block';
        };

        preencherSelect(selMovimento);
        preencherSelect(selFaturamento);
        preencherSelect(selVendas);

    } catch (err) {
        console.error('Erro ao carregar usuários para filtro:', err);
    }
}

// =====================================================
// FUNÇÕES DE ABAS
// =====================================================

function abrirAba(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
}

// =====================================================
// DASHBOARD
// =====================================================

async function carregarDashboard() {
    try {
        const podeExportar = temPermissao('relatorios', 'exportar');
        const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));
        const verOutros = temPermissao('saidas', 'ver_vendas_outros');

        let qVendas = supabaseClient.from('saidas').select('total').eq('cancelado', false);
        let qSaidasRes = supabaseClient.from('saidas').select('total, data').eq('cancelado', false);
        let qVendasMes = supabaseClient.from('saidas').select('data, total').eq('cancelado', false).order('data', { ascending: true });
        let qSaidaItens = supabaseClient.from('saida_itens').select('quantidade, produtos(nome)');

        if (!verOutros) {
            qVendas = qVendas.eq('usuario_id', usuarioLogado.id);
            qSaidasRes = qSaidasRes.eq('usuario_id', usuarioLogado.id);
            qVendasMes = qVendasMes.eq('usuario_id', usuarioLogado.id);

            // Obter os IDs de saídas do usuário logado
            const { data: saidasUsuario } = await supabaseClient
                .from('saidas')
                .select('id')
                .eq('usuario_id', usuarioLogado.id)
                .eq('cancelado', false);
            const ids = saidasUsuario ? saidasUsuario.map(s => s.id) : [];
            if (ids.length > 0) {
                qSaidaItens = qSaidaItens.in('saida_id', ids);
            } else {
                qSaidaItens = qSaidaItens.in('saida_id', [-1]);
            }
        }

        const [vendasRes, entradasRes, despesasRes, saidasRes, clientesRes, produtosRes] = await Promise.all([
            qVendas,
            supabaseClient.from('entradas').select('total'),
            supabaseClient.from('despesas').select('valor'),
            qSaidasRes,
            supabaseClient.from('clientes').select('id', { count: 'exact' }).eq('ativo', true),
            supabaseClient.from('produtos').select('id', { count: 'exact' }).eq('ativo', true)
        ]);
        
        const totalVendas = vendasRes.data?.reduce((sum, v) => sum + (v.total || 0), 0) || 0;
        const totalEntradas = entradasRes.data?.reduce((sum, e) => sum + (e.total || 0), 0) || 0;
        const totalDespesas = despesasRes.data?.reduce((sum, d) => sum + (d.valor || 0), 0) || 0;
        const totalSaidas = saidasRes.data?.length || 0;
        const totalClientes = clientesRes.count || 0;
        const totalProdutos = produtosRes.count || 0;
        
        const ticketMedio = totalSaidas > 0 ? totalVendas / totalSaidas : 0;
        const resultadoLiquido = totalVendas - totalEntradas - totalDespesas;
        
        document.getElementById('kpiTotalVendas').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalVendas);
        document.getElementById('kpiTotalEntradas').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas);
        document.getElementById('kpiTotalSaidas').textContent = totalSaidas;
        document.getElementById('kpiTotalClientes').textContent = totalClientes;
        document.getElementById('kpiTotalProdutos').textContent = totalProdutos;
        document.getElementById('kpiTicketMedio').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ticketMedio);
        document.getElementById('kpiTotalDespesas').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDespesas);
        
        const resLiqElement = document.getElementById('kpiResultadoLiquido');
        if (resLiqElement) {
            resLiqElement.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resultadoLiquido);
            const card = document.getElementById('kpiResultadoLiquidoCard');
            if (card) {
                if (resultadoLiquido >= 0) {
                    card.style.borderTopColor = '#28a745';
                    resLiqElement.style.color = '#28a745';
                } else {
                    card.style.borderTopColor = '#dc3545';
                    resLiqElement.style.color = '#dc3545';
                }
            }
        }
        
        // Gráfico de vendas por mês
        const { data: vendasMes } = await qVendasMes;
        
        if (vendasMes) {
            const vendasPorMes = {};
            vendasMes.forEach(v => {
                const mes = new Date(v.data).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                vendasPorMes[mes] = (vendasPorMes[mes] || 0) + (v.total || 0);
            });
            
            const labels = Object.keys(vendasPorMes);
            const valores = Object.values(vendasPorMes);
            
            const ctx = document.getElementById('chartVendasMes');
            if (ctx) {
                if (chartVendasMes) chartVendasMes.destroy();
                chartVendasMes = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Vendas (R$)',
                            data: valores,
                            backgroundColor: 'rgba(235, 94, 40, 0.1)',
                            borderColor: '#eb5e28',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { callback: v => 'R$ ' + v.toFixed(2) }
                            }
                        }
                    }
                });
            }
        }
        
        // Gráfico Top 5 Produtos
        const { data: topProdutos } = await qSaidaItens.limit(100);
        
        if (topProdutos) {
            const produtosMap = {};
            topProdutos.forEach(item => {
                const nome = item.produtos?.nome || 'Produto';
                produtosMap[nome] = (produtosMap[nome] || 0) + (item.quantidade || 0);
            });
            
            const top5 = Object.entries(produtosMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            const ctxTop = document.getElementById('chartTopProdutos');
            if (ctxTop && top5.length > 0) {
                if (chartTopProdutos) chartTopProdutos.destroy();
                chartTopProdutos = new Chart(ctxTop, {
                    type: 'bar',
                    data: {
                        labels: top5.map(item => item[0]),
                        datasets: [{
                            label: 'Quantidade Vendida',
                            data: top5.map(item => item[1]),
                            backgroundColor: ['#eb5e28', '#403d39', '#ccc5b9', '#252422', '#fffcf2'],
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, ticks: { stepSize: 1 } }
                        }
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        mostrarNotificacao('Erro ao carregar dashboard', 'error');
    }
}

// =====================================================
// MOVIMENTO DIÁRIO
// =====================================================

async function carregarMovimentoDiario() {
    const data = document.getElementById('movimentoData').value;
    if (!data) {
        mostrarNotificacao('Selecione uma data!', 'warning');
        return;
    }
    
    try {
        const container = document.getElementById('movimentoContainer');
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando...</div>';
        dadosCarregados.movimento = false;

        const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));
        const verOutros = temPermissao('saidas', 'ver_vendas_outros');

        let qSaidas = supabaseClient.from('saidas').select(`
            *,
            clientes(nome)
        `).eq('data', data);

        if (!verOutros) {
            qSaidas = qSaidas.eq('usuario_id', usuarioLogado.id);
        } else {
            const userFiltro = document.getElementById('filtroUsuarioMovimento')?.value;
            if (userFiltro && userFiltro !== 'todos') {
                qSaidas = qSaidas.eq('usuario_id', parseInt(userFiltro));
            }
        }
        
        const [entradasRes, saidasRes] = await Promise.all([
            supabaseClient.from('entradas').select(`
                *,
                clientes:fornecedor_id(nome)
            `).eq('data', data),
            qSaidas
        ]);
        
        const entradas = entradasRes.data || [];
        const saidas = saidasRes.data || [];
        
        // Armazenar para exportação
        dadosExportacao.movimento = { entradas, saidas, data };
        
        const totalEntradas = entradas.reduce((sum, e) => sum + (e.total || 0), 0);
        const totalSaidas = saidas.reduce((sum, s) => sum + (s.total || 0), 0);
        const saldo = totalSaidas - totalEntradas;
        
        let html = `
            <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px;">
                <div style="flex:1; min-width:150px; background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>Total Entradas</strong>
                    <div style="font-size: 20px; color: #155724;">R$ ${totalEntradas.toFixed(2)}</div>
                </div>
                <div style="flex:1; min-width:150px; background: #f8d7da; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>Total Saidas</strong>
                    <div style="font-size: 20px; color: #721c24;">R$ ${totalSaidas.toFixed(2)}</div>
                </div>
                <div style="flex:1; min-width:150px; background: ${saldo >= 0 ? '#cce5ff' : '#f8d7da'}; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>Saldo do Dia</strong>
                    <div style="font-size: 20px; color: ${saldo >= 0 ? '#004085' : '#721c24'};">R$ ${saldo.toFixed(2)}</div>
                </div>
            </div>
            
            <h4>Entradas do Dia</h4>
            <table class="table-relatorio">
                <thead>
                    <tr><th>N°</th><th>Fornecedor</th><th>Total</th><th>Observação</th></tr>
                </thead>
                <tbody>
                    ${entradas.length > 0 ? entradas.map(e => `
                        <tr>
                            <td>#${e.id}</td>
                            <td>${e.clientes?.nome || '-'}</td>
                            <td>R$ ${(e.total || 0).toFixed(2)}</td>
                            <td>${e.observacao || '-'}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="4">Nenhuma entrada no dia</td></tr>'}
                    <tr class="total-row">
                        <td colspan="2"><strong>Total</strong></td>
                        <td><strong>R$ ${totalEntradas.toFixed(2)}</strong></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
            
            <h4 style="margin-top: 20px;">Saidas do Dia</h4>
            <table class="table-relatorio">
                <thead>
                    <tr><th>N°</th><th>Cliente</th><th>Total</th><th>Forma Pagamento</th></tr>
                </thead>
                <tbody>
                    ${saidas.length > 0 ? saidas.map(s => `
                        <tr>
                            <td>#${s.id}</td>
                            <td>${s.clientes?.nome || '-'}</td>
                            <td>R$ ${(s.total || 0).toFixed(2)}</td>
                            <td>${s.forma_pagamento || '-'}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="4">Nenhuma saída no dia</td></tr>'}
                    <tr class="total-row">
                        <td colspan="2"><strong>Total</strong></td>
                        <td><strong>R$ ${totalSaidas.toFixed(2)}</strong></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        dadosCarregados.movimento = true;
        
        if (!temPermissao('relatorios', 'exportar')) {
            document.querySelectorAll('.btn-excel, .btn-pdf').forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar movimento diário:', error);
        document.getElementById('movimentoContainer').innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Erro ao carregar dados</div>';
        dadosCarregados.movimento = false;
    }
}

// =====================================================
// FATURAMENTO
// =====================================================

async function carregarFaturamento() {
    try {
        const plano = document.getElementById('faturamentoPlano').value;
        const dataInicio = document.getElementById('faturamentoDataInicio')?.value;
        const dataFim = document.getElementById('faturamentoDataFim')?.value;
        const container = document.getElementById('faturamentoContainer');
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando...</div>';
        dadosCarregados.faturamento = false;
        
        const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));
        const verOutros = temPermissao('saidas', 'ver_vendas_outros');

        let qVendas = supabaseClient
            .from('saidas')
            .select('data, total')
            .eq('cancelado', false)
            .order('data', { ascending: true });

        if (dataInicio) qVendas = qVendas.gte('data', dataInicio);
        if (dataFim) qVendas = qVendas.lte('data', dataFim);

        if (!verOutros) {
            qVendas = qVendas.eq('usuario_id', usuarioLogado.id);
        } else {
            const userFiltro = document.getElementById('filtroUsuarioFaturamento')?.value;
            if (userFiltro && userFiltro !== 'todos') {
                qVendas = qVendas.eq('usuario_id', parseInt(userFiltro));
            }
        }

        const { data: vendas } = await qVendas;
        
        if (!vendas || vendas.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhuma venda encontrada</div>';
            dadosCarregados.faturamento = false;
            return;
        }
        
        const grupos = {};
        vendas.forEach(v => {
            const data = new Date(v.data);
            let chave = '';
            
            switch(plano) {
                case 'diario':
                    chave = data.toISOString().split('T')[0];
                    break;
                case 'semanal':
                    const semana = data.getWeek();
                    chave = `Semana ${semana} - ${data.getFullYear()}`;
                    break;
                case 'mensal':
                    chave = data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                    break;
                case 'anual':
                    chave = data.getFullYear().toString();
                    break;
                default:
                    chave = data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            }
            
            grupos[chave] = (grupos[chave] || 0) + (v.total || 0);
        });
        
        const labels = Object.keys(grupos);
        const valores = Object.values(grupos);
        const total = valores.reduce((sum, v) => sum + v, 0);
        
        // Armazenar para exportação
        dadosExportacao.faturamento = { labels, valores, total, plano, dataInicio, dataFim };
        
        let html = `
            <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px;">
                <div style="flex:1; min-width:180px; background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>Total Faturamento</strong>
                    <div style="font-size: 22px; color: #155724;">R$ ${total.toFixed(2)}</div>
                </div>
                <div style="flex:1; min-width:180px; background: #cce5ff; padding: 15px; border-radius: 8px; text-align: center;">
                    <strong>Periodo</strong>
                    <div style="font-size: 16px; color: #004085;">${labels.length} periodos</div>
                </div>
            </div>
            
            <table class="table-relatorio">
                <thead>
                    <tr><th>Período</th><th style="text-align: right;">Valor (R$)</th><th style="text-align: right;">% do Total</th></tr>
                </thead>
                <tbody>
                    ${labels.map((label, i) => `
                        <tr>
                            <td>${label}</td>
                            <td style="text-align: right;">R$ ${valores[i].toFixed(2)}</td>
                            <td style="text-align: right;">${total > 0 ? ((valores[i] / total) * 100).toFixed(1) : 0}%</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td><strong>TOTAL</strong></td>
                        <td style="text-align: right;"><strong>R$ ${total.toFixed(2)}</strong></td>
                        <td style="text-align: right;"><strong>100%</strong></td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        dadosCarregados.faturamento = true;
        
        // Gráfico
        const ctx = document.getElementById('chartFaturamento');
        if (ctx) {
            if (chartFaturamento) chartFaturamento.destroy();
            chartFaturamento = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Faturamento (R$)',
                        data: valores,
                        backgroundColor: 'rgba(235, 94, 40, 0.6)',
                        borderColor: 'rgba(235, 94, 40, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: v => 'R$ ' + v.toFixed(2) }
                        }
                    }
                }
            });
        }
        
        if (!temPermissao('relatorios', 'exportar')) {
            document.querySelectorAll('.btn-excel, .btn-pdf').forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar faturamento:', error);
        document.getElementById('faturamentoContainer').innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Erro ao carregar dados</div>';
        dadosCarregados.faturamento = false;
    }
}

// =====================================================
// VENDAS POR PRODUTO
// =====================================================

async function carregarVendasProduto() {
    try {
        const dataInicio = document.getElementById('vendasDataInicio').value;
        const dataFim = document.getElementById('vendasDataFim').value;
        const container = document.getElementById('vendasProdutoContainer');
        
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando...</div>';
        dadosCarregados.vendas = false;
        
        const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));
        const verOutros = temPermissao('saidas', 'ver_vendas_outros');

        // Buscar IDs de saídas válidas de acordo com filtros de data e usuário
        let qSaidas = supabaseClient.from('saidas').select('id').eq('cancelado', false);
        
        if (dataInicio) qSaidas = qSaidas.gte('data', dataInicio);
        if (dataFim) qSaidas = qSaidas.lte('data', dataFim);
        
        if (!verOutros) {
            qSaidas = qSaidas.eq('usuario_id', usuarioLogado.id);
        } else {
            const userFiltro = document.getElementById('filtroUsuarioVendas')?.value;
            if (userFiltro && userFiltro !== 'todos') {
                qSaidas = qSaidas.eq('usuario_id', parseInt(userFiltro));
            }
        }
        
        const { data: saidasValidas } = await qSaidas;
        const idsValidos = saidasValidas ? saidasValidas.map(s => s.id) : [];

        if (idsValidos.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum produto vendido no período</div>';
            dadosCarregados.vendas = false;
            return;
        }

        let query = supabaseClient
            .from('saida_itens')
            .select(`
                quantidade,
                subtotal,
                produtos (id, nome, codigo, categoria)
            `)
            .in('saida_id', idsValidos);
        
        const { data: itens } = await query;
        
        if (!itens || itens.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum produto vendido no período</div>';
            dadosCarregados.vendas = false;
            return;
        }
        
        const produtosMap = {};
        itens.forEach(item => {
            const nome = item.produtos?.nome || 'Produto';
            const codigo = item.produtos?.codigo || '-';
            if (!produtosMap[nome]) {
                produtosMap[nome] = {
                    codigo: codigo,
                    categoria: item.produtos?.categoria || '-',
                    quantidade: 0,
                    total: 0
                };
            }
            produtosMap[nome].quantidade += item.quantidade || 0;
            produtosMap[nome].total += item.subtotal || 0;
        });
        
        const sorted = Object.entries(produtosMap)
            .sort((a, b) => b[1].total - a[1].total);
        
        const totalGeral = sorted.reduce((sum, item) => sum + item[1].total, 0);
        
        // Armazenar para exportação
        dadosExportacao.vendas = { sorted, totalGeral, dataInicio, dataFim };
        
        let html = `
            <div style="margin-bottom: 15px; background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;">
                <strong>Total Geral de Vendas</strong>
                <div style="font-size: 22px; color: #155724;">R$ ${totalGeral.toFixed(2)}</div>
            </div>
            
            <table class="table-relatorio">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th style="text-align: center;">Qtd Vendida</th>
                        <th style="text-align: right;">Total (R$)</th>
                        <th style="text-align: right;">%</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(([nome, dados]) => `
                        <tr>
                            <td>${dados.codigo}</td>
                            <td><strong>${nome}</strong></td>
                            <td>${dados.categoria}</td>
                            <td style="text-align: center;">${dados.quantidade}</td>
                            <td style="text-align: right;">R$ ${dados.total.toFixed(2)}</td>
                            <td style="text-align: right;">${totalGeral > 0 ? ((dados.total / totalGeral) * 100).toFixed(1) : 0}%</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td colspan="3"><strong>TOTAL</strong></td>
                        <td style="text-align: center;"><strong>${sorted.reduce((sum, item) => sum + item[1].quantidade, 0)}</strong></td>
                        <td style="text-align: right;"><strong>R$ ${totalGeral.toFixed(2)}</strong></td>
                        <td style="text-align: right;"><strong>100%</strong></td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        dadosCarregados.vendas = true;
        
        if (!temPermissao('relatorios', 'exportar')) {
            document.querySelectorAll('.btn-excel, .btn-pdf').forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar vendas por produto:', error);
        document.getElementById('vendasProdutoContainer').innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Erro ao carregar dados</div>';
        dadosCarregados.vendas = false;
    }
}

async function carregarComissoesColaborador() {
    const container = document.getElementById('colaboradorContainer');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px;">Calculando comissões...</div>';

    const dataInicio = document.getElementById('colabDataInicio')?.value;
    const dataFim = document.getElementById('colabDataFim')?.value;

    try {
        // 1. Obter colaboradores
        const { data: colabs, error: colabError } = await supabaseClient
            .from('colaboradores')
            .select('*');

        if (colabError) throw colabError;

        // 2. Obter vendas com seu respectivo colaborador_id
        let querySales = supabaseClient
            .from('saidas')
            .select('id, total, colaborador_id, cancelado, data, comissao_calculada')
            .eq('cancelado', false);

        if (dataInicio) {
            querySales = querySales.gte('data', dataInicio);
        }
        if (dataFim) {
            querySales = querySales.lte('data', dataFim);
        }

        const { data: salesList, error: salesErrorList } = await querySales;
        if (salesErrorList) throw salesErrorList;

        if (!salesList || salesList.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhuma venda encontrada no período selecionado</div>';
            // Zera dados de exportação
            dadosExportacao.colaborador = [];
            return;
        }

        // 3. Obter itens de saída para computar serviços e produtos
        const saleIds = salesList.map(s => s.id);
        const { data: saleItems, error: itemsError } = await supabaseClient
            .from('saida_itens')
            .select('saida_id, produto_id, quantidade, valor_unitario, subtotal, produtos(tipo, nome, comissao_habilitada, comissao_100_porcento, comissao_valor)')
            .in('saida_id', saleIds);

        if (itemsError) throw itemsError;

        // 4. Calcular comissão para cada colaborador
        const reportData = (colabs || []).map(colab => {
            const colabSales = salesList.filter(s => s.colaborador_id === colab.id);
            
            let faturamentoTotal = 0;
            let comissaoGerada = 0;
            let qtdVendas = colabSales.length;

            colabSales.forEach(sale => {
                faturamentoTotal += parseFloat(sale.total || 0);

                if (sale.comissao_calculada !== undefined && sale.comissao_calculada !== null && parseFloat(sale.comissao_calculada) > 0) {
                    comissaoGerada += parseFloat(sale.comissao_calculada);
                } else {
                    const items = (saleItems || []).filter(item => item.saida_id === sale.id);
                    items.forEach(item => {
                        const subtotalItem = parseFloat(item.subtotal || item.valor_unitario * item.quantidade || 0);
                        const isServico = item.produtos?.tipo === 'servico';

                        if (isServico) {
                            if (item.produtos?.comissao_habilitada === true) {
                                if (item.produtos?.comissao_100_porcento === true) {
                                    comissaoGerada += subtotalItem;
                                } else {
                                    comissaoGerada += (parseFloat(item.produtos?.comissao_valor || 0) * item.quantidade);
                                }
                            }
                        } else {
                            const pctComissao = parseFloat(colab.comissao || 0) / 100;
                            comissaoGerada += subtotalItem * pctComissao;
                        }
                    });
                }
            });

            return {
                id: colab.id,
                nome: `${colab.nome} ${colab.sobrenome || ''}`,
                funcao: colab.funcao || 'Colaborador',
                comissaoPct: parseFloat(colab.comissao || 0),
                qtdVendas,
                faturamentoTotal,
                comissaoGerada
            };
        });

        // Salvar dados globais para exportação
        dadosExportacao.colaborador = reportData;

        // Renderizar a tabela
        let html = `
            <div class="table-container" style="margin-top: 15px;">
                <table>
                    <thead>
                        <tr>
                            <th>Colaborador</th>
                            <th>Função</th>
                            <th style="text-align: center;">Vendas Realizadas</th>
                            <th style="text-align: right;">Comissão Base (%)</th>
                            <th style="text-align: right;">Total Faturado (R$)</th>
                            <th style="text-align: right; color: var(--primary); font-weight: bold;">Comissão Devida (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let totalFaturadoGeral = 0;
        let totalComissaoGeral = 0;
        let totalVendasRealizadas = 0;

        reportData.forEach(row => {
            totalFaturadoGeral += row.faturamentoTotal;
            totalComissaoGeral += row.comissaoGerada;
            totalVendasRealizadas += row.qtdVendas;

            html += `
                <tr>
                    <td><strong>${row.nome}</strong></td>
                    <td>${row.funcao}</td>
                    <td style="text-align: center;">${row.qtdVendas}</td>
                    <td style="text-align: right;"><span class="commission-badge">${row.comissaoPct.toFixed(2)}%</span></td>
                    <td style="text-align: right;">R$ ${row.faturamentoTotal.toFixed(2)}</td>
                    <td style="text-align: right; font-weight: bold; color: var(--primary);">R$ ${row.comissaoGerada.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `
                        <tr style="background-color: #f9fafb; font-weight: bold; border-top: 2px solid var(--border);">
                            <td colspan="2">TOTAL GERAL</td>
                            <td style="text-align: center;">${totalVendasRealizadas}</td>
                            <td style="text-align: right;">-</td>
                            <td style="text-align: right;">R$ ${totalFaturadoGeral.toFixed(2)}</td>
                            <td style="text-align: right; color: var(--primary); font-size: 15px;">R$ ${totalComissaoGeral.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    } catch (e) {
        console.error('Erro ao gerar relatório de comissões:', e);
        container.innerHTML = `<div style="text-align: center; color: red; padding: 20px;">Erro ao carregar dados: ${e.message || e}</div>`;
    }
}

window.carregarComissoesColaborador = carregarComissoesColaborador;

// =====================================================
// GANHO X CUSTO (LUCRO)
// =====================================================

async function carregarRelatorioLucro() {
    const dataInicio = document.getElementById('lucroDataInicio')?.value;
    const dataFim = document.getElementById('lucroDataFim')?.value;
    const container = document.getElementById('lucroContainer');
    
    if (!dataInicio || !dataFim) {
        mostrarNotificacao('Selecione o período de início e fim!', 'warning');
        return;
    }
    
    container.innerHTML = '<div style="text-align: center; padding: 20px;">Carregando dados...</div>';
    
    try {
        // 1. Obter todas as saídas não canceladas no período
        let querySaidas = supabaseClient
            .from('saidas')
            .select('id, data')
            .eq('cancelado', false)
            .gte('data', dataInicio)
            .lte('data', dataFim);
            
        const { data: saidas, error: errorSaidas } = await querySaidas;
        
        if (errorSaidas) throw errorSaidas;
        
        if (!saidas || saidas.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhuma venda encontrada para o período selecionado.</div>';
            
            // Reset KPIs
            document.getElementById('kpiLucroReceita').textContent = 'R$ 0,00';
            document.getElementById('kpiLucroCusto').textContent = 'R$ 0,00';
            document.getElementById('kpiLucroLiquido').textContent = 'R$ 0,00';
            document.getElementById('kpiLucroMargem').textContent = '0,00%';
            
            if (chartLucroObj) {
                chartLucroObj.destroy();
                chartLucroObj = null;
            }
            dadosCarregados.lucro = false;
            return;
        }
        
        const saidaIds = saidas.map(s => s.id);
        const dataMap = {};
        saidas.forEach(s => {
            dataMap[s.id] = s.data;
        });
        
        // 2. Buscar itens vendidos para essas saídas
        const { data: itens, error: errorItens } = await supabaseClient
            .from('saida_itens')
            .select('saida_id, quantidade, valor_unitario, subtotal, produtos(nome, codigo, valor_compra)')
            .in('saida_id', saidaIds);
            
        if (errorItens) throw errorItens;
        
        if (!itens || itens.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Nenhum produto vendido encontrado para o período selecionado.</div>';
            
            document.getElementById('kpiLucroReceita').textContent = 'R$ 0,00';
            document.getElementById('kpiLucroCusto').textContent = 'R$ 0,00';
            document.getElementById('kpiLucroLiquido').textContent = 'R$ 0,00';
            document.getElementById('kpiLucroMargem').textContent = '0,00%';
            
            if (chartLucroObj) {
                chartLucroObj.destroy();
                chartLucroObj = null;
            }
            dadosCarregados.lucro = false;
            return;
        }
        
        // 3. Agregar custos e lucros
        let receitaTotal = 0;
        let custoTotal = 0;
        const resumoProdutos = {};
        const resumoDatas = {};
        
        itens.forEach(item => {
            const qtd = item.quantidade || 0;
            const rev = item.subtotal || 0;
            const prod = item.produtos || {};
            const custoUnit = prod.valor_compra || 0;
            const custoItem = qtd * custoUnit;
            const lucroItem = rev - custoItem;
            
            receitaTotal += rev;
            custoTotal += custoItem;
            
            // Agrupar por produto
            const prodKey = prod.nome || 'Produto Desconhecido';
            if (!resumoProdutos[prodKey]) {
                resumoProdutos[prodKey] = {
                    codigo: prod.codigo || '-',
                    quantidade: 0,
                    receita: 0,
                    custo: 0,
                    lucro: 0
                };
            }
            resumoProdutos[prodKey].quantidade += qtd;
            resumoProdutos[prodKey].receita += rev;
            resumoProdutos[prodKey].custo += custoItem;
            resumoProdutos[prodKey].lucro += lucroItem;
            
            // Agrupar por data
            const dataVenda = dataMap[item.saida_id] ? dataMap[item.saida_id].split('T')[0] : 'Sem Data';
            if (!resumoDatas[dataVenda]) {
                resumoDatas[dataVenda] = { receita: 0, custo: 0, lucro: 0 };
            }
            resumoDatas[dataVenda].receita += rev;
            resumoDatas[dataVenda].custo += custoItem;
            resumoDatas[dataVenda].lucro += lucroItem;
        });
        
        const lucroTotal = receitaTotal - custoTotal;
        const margemTotal = receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : 0;
        
        // Atualizar KPIs
        const formatarMoedaLocal = (valor) => {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
        };
        
        document.getElementById('kpiLucroReceita').textContent = formatarMoedaLocal(receitaTotal);
        document.getElementById('kpiLucroCusto').textContent = formatarMoedaLocal(custoTotal);
        document.getElementById('kpiLucroLiquido').textContent = formatarMoedaLocal(lucroTotal);
        document.getElementById('kpiLucroMargem').textContent = `${margemTotal.toFixed(2)}%`;
        
        // Armazenar para exportação
        dadosExportacao.lucro = {
            receitaTotal,
            custoTotal,
            lucroTotal,
            margemTotal,
            dataInicio,
            dataFim,
            produtos: Object.entries(resumoProdutos).map(([nome, info]) => ({ nome, ...info }))
        };
        dadosCarregados.lucro = true;
        
        // Renderizar tabela detalhada
        let htmlTable = `
            <table class="dashboard-simple-table" id="lucroTable">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th style="text-align: center;">Qtd Vendida</th>
                        <th style="text-align: right;">Preço Venda Médio</th>
                        <th style="text-align: right;">Custo Médio Unit.</th>
                        <th style="text-align: right;">Receita (Ganho)</th>
                        <th style="text-align: right;">Custo Total</th>
                        <th style="text-align: right;">Lucro Líquido</th>
                        <th style="text-align: center;">Margem (%)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.entries(resumoProdutos).forEach(([nome, info]) => {
            const vendaMedia = info.quantidade > 0 ? (info.receita / info.quantidade) : 0;
            const custoUnit = info.quantidade > 0 ? (info.custo / info.quantidade) : 0;
            const margem = info.receita > 0 ? (info.lucro / info.receita) * 100 : 0;
            
            htmlTable += `
                <tr>
                    <td><strong>${info.codigo}</strong></td>
                    <td><strong>${nome}</strong></td>
                    <td style="text-align: center;">${info.quantidade}</td>
                    <td style="text-align: right;">${formatarMoedaLocal(vendaMedia)}</td>
                    <td style="text-align: right;">${formatarMoedaLocal(custoUnit)}</td>
                    <td style="text-align: right;">${formatarMoedaLocal(info.receita)}</td>
                    <td style="text-align: right; color: var(--danger);">${formatarMoedaLocal(info.custo)}</td>
                    <td style="text-align: right; color: ${info.lucro >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">
                        ${formatarMoedaLocal(info.lucro)}
                    </td>
                    <td style="text-align: center; font-weight: 600;">${margem.toFixed(1)}%</td>
                </tr>
            `;
        });
        
        const totalQtdVendida = itens.reduce((sum, item) => sum + (item.quantidade || 0), 0);
        htmlTable += `
                    <tr style="font-weight: bold; background: #faf9f6; border-top: 2px solid var(--border);">
                        <td colspan="2">TOTAL</td>
                        <td style="text-align: center;">${totalQtdVendida}</td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right;">${formatarMoedaLocal(receitaTotal)}</td>
                        <td style="text-align: right; color: var(--danger);">${formatarMoedaLocal(custoTotal)}</td>
                        <td style="text-align: right; color: ${lucroTotal >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatarMoedaLocal(lucroTotal)}</td>
                        <td style="text-align: center;">${margemTotal.toFixed(1)}%</td>
                    </tr>
                </tbody>
            </table>
        `;
        
        container.innerHTML = htmlTable;
        
        // Renderizar gráfico
        renderizarGraficoLucro(resumoDatas);
        
    } catch (e) {
        console.error('Erro ao gerar relatório de lucro:', e);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--danger);">Erro ao carregar dados do relatório.</div>';
        dadosCarregados.lucro = false;
    }
}

function renderizarGraficoLucro(resumoDatas) {
    const canvas = document.getElementById('chartLucro');
    if (!canvas) return;
    
    // Sort dates ascending
    const datasOrdenadas = Object.keys(resumoDatas).sort();
    const receitas = datasOrdenadas.map(d => resumoDatas[d].receita);
    const custos = datasOrdenadas.map(d => resumoDatas[d].custo);
    const lucros = datasOrdenadas.map(d => resumoDatas[d].lucro);
    
    // Formatar datas para exibir dd/mm
    const labelsFormatados = datasOrdenadas.map(d => {
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
    });
    
    if (chartLucroObj) {
        chartLucroObj.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    chartLucroObj = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labelsFormatados,
            datasets: [
                {
                    label: 'Receita (Ganho)',
                    data: receitas,
                    backgroundColor: '#0A4D68',
                    borderRadius: 4
                },
                {
                    label: 'Custo',
                    data: custos,
                    backgroundColor: '#6b7280',
                    borderRadius: 4
                },
                {
                    label: 'Lucro Líquido',
                    data: lucros,
                    backgroundColor: '#00A86B',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'R$ ' + value;
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

window.carregarRelatorioLucro = carregarRelatorioLucro;

// =====================================================
// EXPORTAÇÕES
// =====================================================

function formatarDataISO(dataStr) {
    if (!dataStr) return '';
    const partes = dataStr.split('-');
    if (partes.length !== 3) return dataStr;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function exportarExcel(tipo) {
    if (!temPermissao('relatorios', 'exportar')) {
        mostrarNotificacao('Você não tem permissão para exportar dados!', 'error');
        return;
    }
    
    let dados = [];
    let nomeArquivo = '';
    
    switch(tipo) {
        case 'movimento':
            if (!dadosCarregados.movimento || !dadosExportacao.movimento) {
                mostrarNotificacao('Carregue o relatório de movimento primeiro!', 'warning');
                return;
            }
            const mov = dadosExportacao.movimento;
            dados = [
                ['RELATÓRIO DE MOVIMENTO DIÁRIO'],
                [`Data: ${mov.data}`],
                [''],
                ['ENTRADAS DO DIA'],
                ['Nº', 'Fornecedor', 'Total', 'Observação']
            ];
            mov.entradas.forEach(e => {
                dados.push([`#${e.id}`, e.clientes?.nome || '-', `R$ ${(e.total || 0).toFixed(2)}`, e.observacao || '-']);
            });
            const totalEntradas = mov.entradas.reduce((sum, e) => sum + (e.total || 0), 0);
            dados.push(['Total', '', `R$ ${totalEntradas.toFixed(2)}`, '']);
            dados.push(['']);
            dados.push(['SAÍDAS DO DIA']);
            dados.push(['Nº', 'Cliente', 'Total', 'Forma Pagamento']);
            mov.saidas.forEach(s => {
                dados.push([`#${s.id}`, s.clientes?.nome || '-', `R$ ${(s.total || 0).toFixed(2)}`, s.forma_pagamento || '-']);
            });
            const totalSaidas = mov.saidas.reduce((sum, s) => sum + (s.total || 0), 0);
            dados.push(['Total', '', `R$ ${totalSaidas.toFixed(2)}`, '']);
            dados.push(['']);
            dados.push(['RESUMO']);
            dados.push(['Total Entradas', `R$ ${totalEntradas.toFixed(2)}`]);
            dados.push(['Total Saídas', `R$ ${totalSaidas.toFixed(2)}`]);
            dados.push(['Saldo', `R$ ${(totalEntradas - totalSaidas).toFixed(2)}`]);
            nomeArquivo = `movimento_diario_${mov.data}`;
            break;
            
        case 'faturamento':
            if (!dadosCarregados.faturamento || !dadosExportacao.faturamento) {
                mostrarNotificacao('Carregue o relatório de faturamento primeiro!', 'warning');
                return;
            }
            const fat = dadosExportacao.faturamento;
            dados = [
                ['RELATÓRIO DE FATURAMENTO'],
                [`Plano: ${fat.plano.toUpperCase()}`],
                [`Período: ${formatarDataISO(fat.dataInicio) || 'Início'} a ${formatarDataISO(fat.dataFim) || 'Fim'}`],
                [''],
                ['Período', 'Valor (R$)', '% do Total']
            ];
            fat.labels.forEach((label, i) => {
                const percentual = fat.total > 0 ? ((fat.valores[i] / fat.total) * 100).toFixed(1) : 0;
                dados.push([label, `R$ ${fat.valores[i].toFixed(2)}`, `${percentual}%`]);
            });
            dados.push(['TOTAL', `R$ ${fat.total.toFixed(2)}`, '100%']);
            nomeArquivo = `faturamento_${new Date().toISOString().split('T')[0]}`;
            break;
            
        case 'vendas':
            if (!dadosCarregados.vendas || !dadosExportacao.vendas) {
                mostrarNotificacao('Carregue o relatório de vendas por produto primeiro!', 'warning');
                return;
            }
            const vend = dadosExportacao.vendas;
            dados = [
                ['RELATÓRIO DE VENDAS POR PRODUTO'],
                [`Período: ${vend.dataInicio || 'Início'} a ${vend.dataFim || 'Fim'}`],
                [''],
                ['Código', 'Produto', 'Categoria', 'Qtd Vendida', 'Total (R$)', '% do Total']
            ];
            vend.sorted.forEach(([nome, info]) => {
                const percentual = vend.totalGeral > 0 ? ((info.total / vend.totalGeral) * 100).toFixed(1) : 0;
                dados.push([info.codigo, nome, info.categoria, info.quantidade, `R$ ${info.total.toFixed(2)}`, `${percentual}%`]);
            });
            const totalQtd = vend.sorted.reduce((sum, item) => sum + item[1].quantidade, 0);
            dados.push(['TOTAL', '', '', totalQtd, `R$ ${vend.totalGeral.toFixed(2)}`, '100%']);
            nomeArquivo = `vendas_por_produto_${new Date().toISOString().split('T')[0]}`;
            break;
            
        case 'colaborador':
            if (!dadosExportacao.colaborador || dadosExportacao.colaborador.length === 0) {
                mostrarNotificacao('Carregue o relatório de comissões primeiro!', 'warning');
                return;
            }
            dados = [
                ['RELATÓRIO DE COMISSÕES POR COLABORADOR'],
                [`Período: ${document.getElementById('colabDataInicio').value || 'Início'} a ${document.getElementById('colabDataFim').value || 'Fim'}`],
                [''],
                ['Colaborador', 'Função', 'Vendas Realizadas', 'Comissão Base (%)', 'Total Faturado (R$)', 'Comissão Devida (R$)']
            ];
            dadosExportacao.colaborador.forEach(c => {
                dados.push([c.nome, c.funcao, c.qtdVendas, `${c.comissaoPct.toFixed(2)}%`, `R$ ${c.faturamentoTotal.toFixed(2)}`, `R$ ${c.comissaoGerada.toFixed(2)}`]);
            });
            nomeArquivo = `relatorio_comissoes_colaborador_${new Date().toISOString().split('T')[0]}`;
            break;

        case 'lucro':
            if (!dadosCarregados.lucro || !dadosExportacao.lucro) {
                mostrarNotificacao('Carregue o relatório de lucro primeiro!', 'warning');
                return;
            }
            const luc = dadosExportacao.lucro;
            dados = [
                ['RELATÓRIO DE GANHO X CUSTO (LUCRO REAL)'],
                [`Período: ${formatarDataISO(luc.dataInicio)} a ${formatarDataISO(luc.dataFim)}`],
                [''],
                ['Receita Total (Ganho)', `R$ ${luc.receitaTotal.toFixed(2)}`],
                ['Custo Total (Médio)', `R$ ${luc.custoTotal.toFixed(2)}`],
                ['Lucro Líquido', `R$ ${luc.lucroTotal.toFixed(2)}`],
                ['Margem Média', `${luc.margemTotal.toFixed(2)}%`],
                [''],
                ['Código', 'Produto', 'Qtd Vendida', 'Preço Venda Médio', 'Custo Médio Unit', 'Receita (Ganho)', 'Custo Total', 'Lucro Líquido', 'Margem (%)']
            ];
            luc.produtos.forEach(p => {
                const vMedio = p.quantidade > 0 ? (p.receita / p.quantidade) : 0;
                const cMedio = p.quantidade > 0 ? (p.custo / p.quantidade) : 0;
                const marg = p.receita > 0 ? (p.lucro / p.receita) * 100 : 0;
                dados.push([p.codigo, p.nome, p.quantidade, `R$ ${vMedio.toFixed(2)}`, `R$ ${cMedio.toFixed(2)}`, `R$ ${p.receita.toFixed(2)}`, `R$ ${p.custo.toFixed(2)}`, `R$ ${p.lucro.toFixed(2)}`, `${marg.toFixed(1)}%`]);
            });
            nomeArquivo = `relatorio_ganho_custo_lucro_${new Date().toISOString().split('T')[0]}`;
            break;
            
        default:
            mostrarNotificacao('Tipo de exportação inválido', 'error');
            return;
    }
    
    if (dados.length === 0) {
        mostrarNotificacao('Nenhum dado para exportar', 'warning');
        return;
    }
    
    try {
        const csv = dados.map(row => row.join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `${nomeArquivo}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        mostrarNotificacao('Exportação concluída!', 'success');
    } catch (error) {
        console.error('Erro ao exportar Excel:', error);
        mostrarNotificacao('Erro ao exportar dados', 'error');
    }
}

// =====================================================
// EXPORTAR PDF — usa janela de impressão nativa
// ✅ Substitui html2canvas que gerava PDF em branco
//    por causa de: elemento fora da viewport, <style>
//    interno ignorado e incompatibilidade com display:grid
// =====================================================

function exportarPDF(tipo) {
    if (!temPermissao('relatorios', 'exportar')) {
        mostrarNotificacao('Você não tem permissão para exportar dados!', 'error');
        return;
    }

    let container = null;
    let titulo = '';
    let subtitulo = '';

    switch (tipo) {
        case 'movimento':
            if (!dadosCarregados.movimento) {
                mostrarNotificacao('Carregue o relatório de movimento primeiro!', 'warning');
                return;
            }
            container = document.getElementById('movimentoContainer');
            titulo = 'Relatório de Movimento Diário';
            subtitulo = `Data: ${dadosExportacao.movimento?.data || ''}`;
            break;

        case 'faturamento':
            if (!dadosCarregados.faturamento) {
                mostrarNotificacao('Carregue o relatório de faturamento primeiro!', 'warning');
                return;
            }
            container = document.getElementById('faturamentoContainer');
            titulo = 'Relatório de Faturamento';
            const fatData = dadosExportacao.faturamento;
            subtitulo = `Plano: ${fatData?.plano || ''} | Período: ${formatarDataISO(fatData?.dataInicio) || 'Início'} a ${formatarDataISO(fatData?.dataFim) || 'Fim'}`;
            break;

        case 'vendas':
            if (!dadosCarregados.vendas) {
                mostrarNotificacao('Carregue o relatório de vendas por produto primeiro!', 'warning');
                return;
            }
            container = document.getElementById('vendasProdutoContainer');
            titulo = 'Relatório de Vendas por Produto';
            const v = dadosExportacao.vendas;
            subtitulo = `Período: ${v?.dataInicio || 'início'} a ${v?.dataFim || 'fim'}`;
            break;
            
        case 'colaborador':
            if (!dadosExportacao.colaborador || dadosExportacao.colaborador.length === 0) {
                mostrarNotificacao('Carregue o relatório de comissões primeiro!', 'warning');
                return;
            }
            container = document.getElementById('colaboradorContainer');
            titulo = 'Relatório de Comissões por Colaborador';
            subtitulo = `Período: ${document.getElementById('colabDataInicio').value || 'Início'} a ${document.getElementById('colabDataFim').value || 'Fim'}`;
            break;

        case 'lucro':
            if (!dadosCarregados.lucro) {
                mostrarNotificacao('Carregue o relatório de lucro primeiro!', 'warning');
                return;
            }
            container = document.getElementById('lucroContainer');
            titulo = 'Relatório de Ganho X Custo (Lucro Real)';
            const lData = dadosExportacao.lucro;
            subtitulo = `Período: ${formatarDataISO(lData?.dataInicio) || 'Início'} a ${formatarDataISO(lData?.dataFim) || 'Fim'}`;
            break;

        default:
            mostrarNotificacao('Tipo de exportação inválido', 'error');
            return;
    }

    if (!container) {
        mostrarNotificacao('Container não encontrado', 'error');
        return;
    }

    const conteudoHtml = container.innerHTML;
    if (!conteudoHtml ||
        conteudoHtml.includes('Carregando') ||
        conteudoHtml.includes('Nenhum') ||
        conteudoHtml.includes('Erro') ||
        conteudoHtml.trim() === '') {
        mostrarNotificacao('Nenhum dado válido para exportar!', 'warning');
        return;
    }

    const dataHora = new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    // Abre nova janela com o conteúdo formatado e aciona impressão nativa
    // O usuário escolhe "Salvar como PDF" no diálogo de impressão do navegador
    const janela = window.open('', '_blank', 'width=900,height=700');

    if (!janela) {
        mostrarNotificacao('Permita popups neste site para exportar PDF!', 'warning');
        return;
    }

    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${titulo}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            color: #333;
            padding: 25px 30px;
            background: #fff;
        }

        /* ── Cabeçalho ── */
        .pdf-header {
            text-align: center;
            border-bottom: 3px solid #eb5e28;
            padding-bottom: 14px;
            margin-bottom: 20px;
        }
        .pdf-header h1 {
            color: #eb5e28;
            font-size: 20px;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .pdf-header p { color: #666; font-size: 11px; margin-top: 3px; }

        /* ── Tabelas ── */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0 18px 0;
            font-size: 11px;
        }
        th {
            background-color: #eb5e28;
            color: #fff;
            padding: 8px 10px;
            text-align: left;
            font-weight: bold;
        }
        td {
            padding: 6px 10px;
            border-bottom: 1px solid #e0e0e0;
            vertical-align: middle;
        }
        tr:nth-child(even) td { background-color: #f9f9f9; }
        .total-row td {
            font-weight: bold;
            background-color: #f0f0f0 !important;
            border-top: 2px solid #555;
        }

        /* ── Títulos intermediários ── */
        h4 {
            color: #333;
            font-size: 13px;
            margin: 18px 0 8px 0;
            padding-bottom: 4px;
            border-bottom: 1px solid #ddd;
        }

        /* ── Cards de resumo (flex em vez de grid) ── */
        .card-row {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 18px;
        }
        .card-row > div {
            flex: 1;
            min-width: 130px;
            padding: 12px;
            border-radius: 6px;
            text-align: center;
        }
        .card-row strong { display: block; font-size: 11px; margin-bottom: 4px; }
        .card-row .valor { font-size: 18px; font-weight: bold; }

        /* ── Rodapé ── */
        .pdf-footer {
            text-align: center;
            margin-top: 28px;
            border-top: 1px solid #ddd;
            padding-top: 10px;
            color: #aaa;
            font-size: 10px;
        }

        /* ── Impressão ── */
        @media print {
            body { padding: 10px 15px; }
            .no-print { display: none !important; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
        }
    </style>
</head>
<body>

    <!-- Botão imprimir (some na impressão) -->
    <div class="no-print" style="text-align:right; margin-bottom:16px;">
        <button onclick="window.print()"
            style="background:#eb5e28; color:#fff; border:none; padding:8px 20px;
                   border-radius:6px; font-size:13px; cursor:pointer;">
            Imprimir / Salvar PDF
        </button>
        <button onclick="window.close()"
            style="background:#888; color:#fff; border:none; padding:8px 14px;
                   border-radius:6px; font-size:13px; cursor:pointer; margin-left:8px;">
            Fechar
        </button>
    </div>

    <div class="pdf-header">
        <h1>${titulo}</h1>
        <p>${subtitulo}</p>
        <p>Gerado em: ${dataHora} &nbsp;|&nbsp; Sistema de Estoque</p>
    </div>

    <div id="conteudo">
        ${conteudoHtml}
    </div>

    <div class="pdf-footer">
        Documento gerado automaticamente pelo Sistema de Estoque
    </div>

    <script>
        // Substitui divs com display:grid por flex para garantir renderização na impressão
        document.querySelectorAll('#conteudo [style*="display: grid"]').forEach(el => {
            el.style.display = 'flex';
            el.style.flexWrap = 'wrap';
            el.style.gap = '12px';
        });

        // Aguarda render completo antes de abrir o diálogo de impressão
        window.onload = function () {
            setTimeout(function () { window.print(); }, 400);
        };
    </script>

</body>
</html>`);

    janela.document.close();
}

// =====================================================
// UTILITÁRIOS
// =====================================================

Date.prototype.getWeek = function() {
    const date = new Date(this);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

function mostrarNotificacao(mensagem, tipo = 'info') {
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 350px;
        `;
        document.body.appendChild(container);
    }
    
    const cores = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    const notificacao = document.createElement('div');
    notificacao.style.cssText = `
        background: white;
        border-left: 4px solid ${cores[tipo] || cores.info};
        padding: 12px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        color: #333;
        animation: slideIn 0.3s ease;
        font-family: Arial, sans-serif;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    
    const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    
    notificacao.innerHTML = `
        <span style="font-size: 18px;">${icones[tipo] || 'ℹ️'}</span>
        <span>${mensagem}</span>
        <button onclick="this.parentElement.remove()" style="
            background: none; border: none; font-size: 18px;
            cursor: pointer; color: #999; margin-left: auto; padding: 0 5px;">×</button>
    `;
    
    container.appendChild(notificacao);
    
    setTimeout(() => {
        if (notificacao.parentNode) {
            notificacao.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => { if (notificacao.parentNode) notificacao.remove(); }, 300);
        }
    }, 5000);
}

const styleAnimations = document.createElement('style');
styleAnimations.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to   { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(styleAnimations);

// Exportar funções para uso global
window.abrirAba = abrirAba;
window.carregarMovimentoDiario = carregarMovimentoDiario;
window.carregarFaturamento = carregarFaturamento;
window.carregarVendasProduto = carregarVendasProduto;
window.carregarRelatorioLucro = carregarRelatorioLucro;
window.exportarExcel = exportarExcel;
window.exportarPDF = exportarPDF;
