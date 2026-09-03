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
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const nomePrimeiro = usuario.nome?.split(' ')[0] || 'Ailton';
    const textoSaudacao = `${saudacao}, ${nomePrimeiro}!`;
    const textoData = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    const saudacaoEl = document.getElementById('saudacaoDashboard');
    if (saudacaoEl) saudacaoEl.textContent = textoSaudacao;

    const dataEl = document.getElementById('dataAtual');
    if (dataEl) dataEl.textContent = textoData;

    const topGreetingEl = document.getElementById('topBarUserGreeting');
    if (topGreetingEl) topGreetingEl.textContent = textoSaudacao;

    const topDateEl = document.getElementById('topBarSubDate');
    if (topDateEl) topDateEl.textContent = textoData;

    // Avatar
    const avatarEl = document.getElementById('userAvatarCircle');
    if (avatarEl && usuario.nome) {
        const nomes = usuario.nome.trim().split(' ');
        const iniciais = (nomes.length > 1 ? nomes[0][0] + nomes[nomes.length - 1][0] : nomes[0].substring(0, 2)).toUpperCase();
        avatarEl.textContent = iniciais;
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
            // 1. Carregar contagem de clientes com tratamento seguro
            try {
                const { count: totalClientes, error: errorClientes } = await supabaseClient
                    .from('clientes')
                    .select('id', { count: 'exact', head: true });
                
                const kpiClientesEl = document.getElementById('kpiTotalClientes');
                if (kpiClientesEl) {
                    kpiClientesEl.textContent = (totalClientes !== null && totalClientes !== undefined) ? totalClientes : 0;
                }
            } catch (e) {
                console.warn('Aviso ao carregar contagem de clientes:', e);
            }

            // 2. Carregar todas as vendas não canceladas (respeitando a permissão de ver vendas de outros)
            try {
                const verOutros = typeof temPermissao === 'function' ? temPermissao('saidas', 'ver_vendas_outros') : true;
                let querySaidas = supabaseClient
                    .from('saidas')
                    .select('*');
                
                if (!verOutros && usuario?.id) {
                    querySaidas = querySaidas.eq('usuario_id', usuario.id);
                }
                
                const { data: saidasData, error: errorSaidas } = await querySaidas;

                if (!errorSaidas && saidasData) {
                    // Filtrar no cliente para garantir que vendas canceladas sejam ignoradas
                    vendas = saidasData.filter(v => v.cancelado !== true);
                } else {
                    console.warn('Aviso na busca de saídas:', errorSaidas);
                    vendas = [];
                }
            } catch (e) {
                console.warn('Erro ao carregar saídas:', e);
                vendas = [];
            }

            // 3. Processar métricas de faturamento e ticket médio
            processarMetricasFaturamento();

            // 4. Carregar e preencher as últimas compras (Entradas) de forma isolada
            await carregarEntradasRecentes();

            // 5. Carregar e preencher o Ranking Top 20 Produtos de forma isolada
            await carregarRankingProdutos();

            // 6. Inicializar Gráficos
            inicializarGraficoSaidas();
            inicializarGraficoMovimentoDiario();

        } catch (error) {
            console.error('Erro geral ao processar dados do dashboard:', error);
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
            const valor = Number(v.total) || 0;
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

        const elHoje = document.getElementById('kpiVendasHoje');
        const elSemana = document.getElementById('kpiVendasSemana');
        const elMes = document.getElementById('kpiVendasMes');
        const elAno = document.getElementById('kpiVendasAno');
        const elTicket = document.getElementById('kpiTicketMedio');

        if (elHoje) elHoje.textContent = fmt(totalHoje);
        if (elSemana) elSemana.textContent = fmt(totalSemana);
        if (elMes) elMes.textContent = fmt(totalMes);
        if (elAno) elAno.textContent = fmt(totalAno);
        if (elTicket) elTicket.textContent = fmt(ticketMedio);
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

        // Se não houver dados, exibir placeholder elegante
        if (labels.length === 0) {
            const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            labels.push(mesAtual);
            dataValues.push(0);
        }

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, '#EAB308');
        gradient.addColorStop(1, '#CA8A04');

        if (chartSaidasAcumuladas) chartSaidasAcumuladas.destroy();

        chartSaidasAcumuladas = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Faturamento Mensal',
                    data: dataValues,
                    backgroundColor: gradient,
                    borderRadius: 8,
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

        chartMovDiario = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Faturamento do Dia',
                    data: dataValues,
                    borderColor: '#CA8A04',
                    borderWidth: 2.5,
                    backgroundColor: 'rgba(234, 179, 8, 0.08)',
                    fill: false,
                    tension: 0.2,
                    pointBackgroundColor: '#EAB308',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
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
            if (!vendas || vendas.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--gray);">Nenhuma venda registrada até o momento.</div>';
                return;
            }

            const idsValidos = vendas.map(v => v.id).filter(Boolean);
            if (idsValidos.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--gray);">Nenhuma venda registrada até o momento.</div>';
                return;
            }

            // Buscar itens das vendas válidas
            let itensData = [];
            try {
                const res = await supabaseClient
                    .from('saida_itens')
                    .select('quantidade, subtotal, produto_id, produtos(id, nome, codigo)')
                    .in('saida_id', idsValidos.slice(0, 300));
                
                if (!res.error && res.data) {
                    itensData = res.data;
                } else {
                    // Fallback sem join
                    const fallbackRes = await supabaseClient
                        .from('saida_itens')
                        .select('quantidade, subtotal, produto_id')
                        .in('saida_id', idsValidos.slice(0, 300));
                    if (fallbackRes.data) itensData = fallbackRes.data;
                }
            } catch (errQ) {
                console.warn('Erro ao consultar saida_itens:', errQ);
            }

            if (!itensData || itensData.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--gray);">Nenhum produto vendido até o momento.</div>';
                return;
            }

            // Agrupar estatísticas por produto
            const rankingMap = {};
            itensData.forEach(item => {
                const prodId = item.produto_id || 'item';
                const nome = item.produtos?.nome || ('Produto #' + prodId);
                const codigo = item.produtos?.codigo || prodId;

                if (!rankingMap[prodId]) {
                    rankingMap[prodId] = {
                        nome: nome,
                        codigo: codigo,
                        qtdVendida: 0,
                        faturamentoGerado: 0
                    };
                }
                rankingMap[prodId].qtdVendida += (Number(item.quantidade) || 0);
                rankingMap[prodId].faturamentoGerado += (Number(item.subtotal) || 0);
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
            console.warn('Aviso ao montar ranking de produtos:', error);
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--gray);">Nenhum dado de ranking disponível.</div>';
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
            const card = tbody.closest('.dashboard-list-card') || tbody.closest('.dashboard-card');
            if (card) card.style.display = 'none';
            return;
        }

        try {
            let entradasData = [];
            try {
                const res = await supabaseClient
                    .from('entradas')
                    .select('*, clientes:fornecedor_id(nome)')
                    .order('id', { ascending: false })
                    .limit(10);

                if (!res.error && res.data) {
                    entradasData = res.data;
                } else {
                    const fallbackRes = await supabaseClient
                        .from('entradas')
                        .select('*')
                        .order('id', { ascending: false })
                        .limit(10);
                    if (fallbackRes.data) entradasData = fallbackRes.data;
                }
            } catch (errE) {
                console.warn('Erro na busca de entradas:', errE);
            }

            if (!entradasData || entradasData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--gray);">Nenhuma nota de entrada registrada.</td></tr>';
                return;
            }

            tbody.innerHTML = entradasData.map(e => {
                const obs = e.observacao || '';
                const numMatch = obs.match(/Nota:\s*([^\s|]+)/);
                const serieMatch = obs.match(/Série:\s*([^\s|]+)/);
                const numeroNota = numMatch ? numMatch[1] : (e.id ? '#' + e.id : '-');
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
            console.warn('Aviso ao carregar entradas do painel:', error);
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--gray);">Nenhuma entrada disponível.</td></tr>';
        }
    }

    // =====================================================
    // INICIALIZAÇÃO
    // =====================================================
    await carregarDashboard();
});
