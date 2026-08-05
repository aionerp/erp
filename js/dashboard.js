// js/dashboard.js
// Lógica Premium para o Dashboard Geral

document.addEventListener('DOMContentLoaded', async () => {
    // =====================================================
    // CONTROLE DE AUTENTICAÇÃO E PERMISSÕES
    // =====================================================
    const usuario = getUsuarioLogado();
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    if (typeof temPermissao === 'function' && !temPermissao('dashboard', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar o Dashboard.</p>
            </div>
        `;
        return;
    }

    // Configurações do Header
    const userNameEl = document.getElementById('userName');
    const userPerfilEl = document.getElementById('userPerfil');
    if (userNameEl) userNameEl.textContent = usuario.nome || 'Usuário';
    if (userPerfilEl) {
        const perfilLabels = {
            admin: '👑 Administrador',
            gerente: '📊 Gerente',
            vendedor: '💰 Vendedor',
            tecnico: '🔧 Técnico',
            basico: '👤 Básico'
        };
        userPerfilEl.textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';
    }

    // Saudação & Data Atual
    const saudacaoEl = document.getElementById('saudacaoDashboard');
    if (saudacaoEl) {
        const hora = new Date().getHours();
        const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
        saudacaoEl.textContent = `${saudacao}, ${usuario.nome?.split(' ')[0] || 'usuário'}! 👋`;
    }

    const dataEl = document.getElementById('dataAtual');
    if (dataEl) {
        dataEl.textContent = new Date().toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
    }

    // =====================================================
    // GLOBALS E ELEMENTOS DO DOM
    // =====================================================
    let vendas = [];
    let chartSaidasAcumuladas = null;
    let chartMovDiario = null;

    const inputDataInicio = document.getElementById('filtroDataInicio');
    const inputDataFim = document.getElementById('filtroDataFim');
    const btnFiltrarMov = document.getElementById('btnFiltrarMovimento');

    // Formatador de Moeda
    const fmt = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

    // Converte data "YYYY-MM-DD" para Date local
    function parseDateLocal(dataStr) {
        if (!dataStr) return new Date();
        const str = dataStr.substring(0, 10);
        const [ano, mes, dia] = str.split('-').map(Number);
        return new Date(ano, mes - 1, dia);
    }

    // Formatar data local de YYYY-MM-DD para DD/MM/AAAA
    function formatarData(dataStr) {
        if (!dataStr) return '-';
        try {
            const data = new Date(dataStr + 'T00:00:00');
            return data.toLocaleDateString('pt-BR');
        } catch (e) {
            return dataStr;
        }
    }

    // =====================================================
    // CARREGAR DADOS GERAIS DO SUPABASE
    // =====================================================
    async function carregarDashboard() {
        try {
            // 1. Carregar contagem de clientes ativos
            const { count: totalClientes, error: errorClientes } = await supabaseClient
                .from('clientes')
                .select('id', { count: 'exact', head: true })
                .eq('ativo', true);
            
            document.getElementById('kpiTotalClientes').textContent = totalClientes !== null ? totalClientes : 0;

            // 2. Carregar todas as vendas não canceladas (respeitando a permissão de ver vendas de outros)
            const verOutros = typeof temPermissao === 'function' ? temPermissao('saidas', 'ver_vendas_outros') : true;
            let querySaidas = supabaseClient
                .from('saidas')
                .select('*')
                .eq('cancelado', false);
            
            if (!verOutros && usuario?.id) {
                querySaidas = querySaidas.eq('usuario_id', usuario.id);
            }
            
            const { data: saidasData, error: errorSaidas } = await querySaidas;

            if (errorSaidas) throw errorSaidas;
            vendas = saidasData || [];

            // 3. Processar métricas de faturamento e ticket médio
            processarMetricasFaturamento();

            // 4. Carregar e preencher as últimas compras (Entradas)
            await carregarEntradasRecentes();

            // 5. Carregar e preencher o Ranking Top 20 Produtos
            await carregarRankingProdutos();

            // 6. Inicializar Gráficos
            inicializarGraficoSaidas();
            inicializarGraficoMovimentoDiario();

        } catch (error) {
            console.error('Erro ao processar dados do dashboard:', error);
            mostrarNotificacao('Erro ao carregar dados do Dashboard', 'error');
        }
    }

    // =====================================================
    // PROCESSAR KPIs (Faturamentos & Ticket Médio)
    // =====================================================
    function processarMetricasFaturamento() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // Início da semana (Domingo)
        const inicioSemana = new Date();
        inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
        inicioSemana.setHours(0, 0, 0, 0);

        // Início do mês
        const inicioMes = new Date();
        inicioMes.setDate(1);
        inicioMes.setHours(0, 0, 0, 0);

        // Início do ano
        const inicioAno = new Date();
        inicioAno.setMonth(0, 1);
        inicioAno.setHours(0, 0, 0, 0);

        let totalHoje = 0;
        let totalSemana = 0;
        let totalMes = 0;
        let totalAno = 0;
        let somaFaturamentoTotal = 0;

        vendas.forEach(v => {
            const valor = v.total || 0;
            const dataVenda = parseDateLocal(v.data);

            somaFaturamentoTotal += valor;

            if (dataVenda >= hoje) {
                totalHoje += valor;
            }
            if (dataVenda >= inicioSemana) {
                totalSemana += valor;
            }
            if (dataVenda >= inicioMes) {
                totalMes += valor;
            }
            if (dataVenda >= inicioAno) {
                totalAno += valor;
            }
        });

        // Ticket Médio = Faturamento Total / Quantidade de Vendas
        const ticketMedio = vendas.length > 0 ? (somaFaturamentoTotal / vendas.length) : 0;

        document.getElementById('kpiVendasHoje').textContent = fmt(totalHoje);
        document.getElementById('kpiVendasSemana').textContent = fmt(totalSemana);
        document.getElementById('kpiVendasMes').textContent = fmt(totalMes);
        document.getElementById('kpiVendasAno').textContent = fmt(totalAno);
        document.getElementById('kpiTicketMedio').textContent = fmt(ticketMedio);
    }

    // =====================================================
    // RENDERIZAR GRÁFICO 1: HISTÓRICO DE SAÍDAS (MENSAL)
    // =====================================================
    function inicializarGraficoSaidas() {
        const canvas = document.getElementById('chartTotalSaidas');
        if (!canvas) return;

        // Agrupar faturamento por mês
        const faturamentoMensal = {};
        
        // Ordenar as vendas por data para garantir ordenação cronológica
        const vendasOrdenadas = [...vendas].sort((a, b) => new Date(a.data) - new Date(b.data));

        vendasOrdenadas.forEach(v => {
            const dataObj = parseDateLocal(v.data);
            const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            faturamentoMensal[mesNome] = (faturamentoMensal[mesNome] || 0) + (v.total || 0);
        });

        const labels = Object.keys(faturamentoMensal);
        const dataValues = Object.values(faturamentoMensal);

        // Se não houver dados, exibir placeholder
        if (labels.length === 0) {
            labels.push('Sem Dados');
            dataValues.push(0);
        }

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(10, 77, 104, 0.35)');
        gradient.addColorStop(1, 'rgba(10, 77, 104, 0.00)');

        if (chartSaidasAcumuladas) chartSaidasAcumuladas.destroy();

        chartSaidasAcumuladas = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Faturamento Mensal',
                    data: dataValues,
                    borderColor: '#0A4D68',
                    borderWidth: 3.5,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.45,
                    pointBackgroundColor: '#1D789B',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => ' ' + fmt(context.parsed.y)
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { callback: value => fmt(value) }
                    }
                }
            }
        });
    }

    // =====================================================
    // RENDERIZAR GRÁFICO 2: MOVIMENTO DIÁRIO (FILTRÁVEL)
    // =====================================================
    function inicializarGraficoMovimentoDiario() {
        const canvas = document.getElementById('chartMovimentoDiario');
        if (!canvas) return;

        // Por padrão, define o filtro como os últimos 15 dias
        const hoje = new Date();
        const inicioPadrao = new Date();
        inicioPadrao.setDate(hoje.getDate() - 14);

        inputDataInicio.value = inicioPadrao.toISOString().split('T')[0];
        inputDataFim.value = hoje.toISOString().split('T')[0];

        atualizarGraficoMovimento();
    }

    function atualizarGraficoMovimento() {
        const dataInicio = new Date(inputDataInicio.value + 'T00:00:00');
        const dataFim = new Date(inputDataFim.value + 'T23:59:59');

        if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
            mostrarNotificacao('Por favor, informe datas válidas para o filtro!', 'error');
            return;
        }

        // Gerar array de datas entre Início e Fim para preencher os dias sem vendas (evitando furos no gráfico)
        const datasIntervalo = {};
        let dataAux = new Date(dataInicio);
        while (dataAux <= dataFim) {
            const dataStr = dataAux.toISOString().split('T')[0];
            datasIntervalo[dataStr] = 0;
            dataAux.setDate(dataAux.getDate() + 1);
        }

        // Somar vendas do período
        vendas.forEach(v => {
            const dataVendaStr = v.data.substring(0, 10);
            if (datasIntervalo[dataVendaStr] !== undefined) {
                datasIntervalo[dataVendaStr] += (v.total || 0);
            }
        });

        // Formatar labels amigáveis para exibição (ex: "29/Jun")
        const labels = Object.keys(datasIntervalo).map(dStr => {
            const [ano, mes, dia] = dStr.split('-');
            const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            return `${dia}/${meses[parseInt(mes) - 1]}`;
        });
        const dataValues = Object.values(datasIntervalo);

        const canvas = document.getElementById('chartMovimentoDiario');
        if (chartMovDiario) chartMovDiario.destroy();

        const ctx = canvas.getContext('2d');
        const gradientBar = ctx.createLinearGradient(0, 0, 0, 240);
        gradientBar.addColorStop(0, '#0A4D68');
        gradientBar.addColorStop(1, '#1D789B');

        chartMovDiario = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Faturamento do Dia',
                    data: dataValues,
                    backgroundColor: gradientBar,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => ' ' + fmt(context.parsed.y)
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { callback: value => fmt(value) }
                    }
                }
            }
        });
    }

    // Ouvinte do filtro de movimento diário
    if (btnFiltrarMov) {
        btnFiltrarMov.addEventListener('click', atualizarGraficoMovimento);
    }

    // =====================================================
    // CARREGAR RANKING DOS 20 PRODUTOS MAIS VENDIDOS
    // =====================================================
    async function carregarRankingProdutos() {
        const container = document.getElementById('produtosRankingContainer');
        if (!container) return;

        try {
            // Buscar itens vendidos e suas vendas correspondentes (respeitando permissões)
            const { data: itensData, error } = await supabaseClient
                .from('saida_itens')
                .select('quantidade, subtotal, produto_id, produtos(nome, codigo), saidas(cancelado, usuario_id)');

            if (error) throw error;

            // Filtrar apenas itens de vendas ativas (cancelado = false)
            const verOutrosRank = typeof temPermissao === 'function' ? temPermissao('saidas', 'ver_vendas_outros') : true;
            const itensVendasAtivas = (itensData || []).filter(item => {
                if (!item.saidas || item.saidas.cancelado === true) return false;
                if (!verOutrosRank && usuario?.id && item.saidas.usuario_id !== usuario.id) return false;
                return true;
            });

            // Agrupar estatísticas por produto
            const rankingMap = {};
            itensVendasAtivas.forEach(item => {
                const prodId = item.produto_id;
                const nome = item.produtos?.nome || 'Produto Não Cadastrado';
                const codigo = item.produtos?.codigo || prodId;

                if (!rankingMap[prodId]) {
                    rankingMap[prodId] = {
                        nome: nome,
                        codigo: codigo,
                        qtdVendida: 0,
                        faturamentoGerado: 0
                    };
                }
                rankingMap[prodId].qtdVendida += (item.quantidade || 0);
                rankingMap[prodId].faturamentoGerado += (item.subtotal || 0);
            });

            // Ordenar por quantidade vendida desc e pegar os top 20
            const rankingOrdenado = Object.values(rankingMap)
                .sort((a, b) => b.qtdVendida - a.qtdVendida)
                .slice(0, 20);

            if (rankingOrdenado.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--gray);">Nenhuma venda registrada até o momento.</div>';
                return;
            }

            // A quantidade vendida do produto número 1 serve como referência (100%) para a barra de progresso
            const maxQtdReferencia = rankingOrdenado[0].qtdVendida;

            container.innerHTML = rankingOrdenado.map((p, idx) => {
                const porcentagemBarra = maxQtdReferencia > 0 ? Math.round((p.qtdVendida / maxQtdReferencia) * 100) : 0;
                
                return `
                    <div class="ranking-product-row">
                        <div style="flex-grow: 1; padding-right: 15px; min-width: 0;">
                            <div>
                                <span style="font-weight: bold; color: var(--primary); margin-right: 6px;">#${idx + 1}</span>
                                <span class="product-rank-name" title="${p.nome}">${p.nome}</span>
                                <small style="color: var(--gray); font-size:10px; margin-left:5px;">(Cód: ${p.codigo})</small>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar-fill" style="width: ${porcentagemBarra}%;"></div>
                            </div>
                        </div>
                        <div class="product-rank-stats" style="flex-shrink: 0; white-space: nowrap;">
                            <strong>${p.qtdVendida} un.</strong><br>
                            <span style="font-size: 11px; color: var(--success); font-weight: 500;">${fmt(p.faturamentoGerado)}</span>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Erro ao montar ranking de produtos:', error);
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--danger);">Erro ao carregar o ranking de produtos</div>';
        }
    }

    // =====================================================
    // CARREGAR PAINEL DE ENTRADAS RECENTES
    // =====================================================
    async function carregarEntradasRecentes() {
        const tbody = document.getElementById('entradasRecentesBody');
        if (!tbody) return;

        // Ocultar card de entradas se o usuário não tiver permissão
        if (typeof temPermissao === 'function' && !temPermissao('entradas', 'ver')) {
            const card = tbody.closest('.dashboard-card');
            if (card) card.style.display = 'none';
            return;
        }

        try {
            const { data: entradasData, error } = await supabaseClient
                .from('entradas')
                .select('*, clientes:fornecedor_id(nome)')
                .order('id', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!entradasData || entradasData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--gray);">Nenhuma nota de entrada registrada.</td></tr>';
                return;
            }

            tbody.innerHTML = entradasData.map(e => {
                const obs = e.observacao || '';
                const numMatch = obs.match(/Nota:\s*([^\s|]+)/);
                const serieMatch = obs.match(/Série:\s*([^\s|]+)/);
                const numeroNota = numMatch ? numMatch[1] : '-';
                const serieNota = serieMatch ? serieMatch[1] : '-';

                return `
                    <tr>
                        <td><strong>Nº ${numeroNota}</strong> <small style="color:var(--gray);">Sér. ${serieNota}</small></td>
                        <td>${formatarData(e.data)}</td>
                        <td title="${e.clientes?.nome || 'Não Informado'}">
                            <span style="display:inline-block; max-width: 140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                ${e.clientes?.nome || '<span style="color:#9ca3af">Não Informado</span>'}
                            </span>
                        </td>
                        <td style="text-align: right; font-weight: 700; color: var(--success);">${fmt(e.total)}</td>
                    </tr>
                `;
            }).join('');

        } catch (error) {
            console.error('Erro ao carregar entradas do painel:', error);
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Erro ao carregar entradas</td></tr>';
        }
    }

    // =====================================================
    // INICIALIZAÇÃO
    // =====================================================
    await carregarDashboard();
});
