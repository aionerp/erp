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

            // 6. Carregar Monitor de Serviços Recorrentes & Assinaturas
            await carregarMonitorRecorrenciasDashboard();

            // 7. Inicializar Gráficos
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

        // Ticket Médio = Faturamento Total / Quantidade de Vendas Válidas
        const vendasValidas = vendas.filter(v => Number(v.total) > 0);
        const ticketMedio = vendasValidas.length > 0 ? (somaFaturamentoTotal / vendasValidas.length) : 0;

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

            // Ordenar por quantidade vendida desc e pegar os top 20 (apenas com saldo positivo vendido)
            const rankingOrdenado = Object.values(rankingMap)
                .filter(p => p.qtdVendida > 0)
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

            // Excluir eventuais devoluções legadas inseridas em entradas
            entradasData = entradasData.filter(e => !e.observacao?.includes('Série: Dev') && !e.observacao?.includes('Devolu'));

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
    // MONITOR DE SERVIÇOS RECORRENTES & ASSINATURAS NO DASHBOARD
    // =====================================================
    let dashRecorrentes = [];
    let painelRecorrentesExpandido = false;

    function calcularExpiraEmDash(dataVencimentoStr) {
        if (!dataVencimentoStr) return { dias: 0, texto: '-', badgeClass: 'dash-cd-warn' };
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const [ano, mes, dia] = dataVencimentoStr.substring(0, 10).split('-').map(Number);
        const venc = new Date(ano, mes - 1, dia);
        venc.setHours(0, 0, 0, 0);

        const diffMs = venc - hoje;
        const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (diffDias > 5) {
            return { dias: diffDias, texto: `🟢 Em ${diffDias} dias`, badgeClass: 'dash-cd-ok' };
        } else if (diffDias > 1 && diffDias <= 5) {
            return { dias: diffDias, texto: `🟡 Em ${diffDias} dias`, badgeClass: 'dash-cd-warn' };
        } else if (diffDias === 1) {
            return { dias: 1, texto: `🟠 Vence amanhã!`, badgeClass: 'dash-cd-urg' };
        } else if (diffDias === 0) {
            return { dias: 0, texto: `🟠 Vence hoje!`, badgeClass: 'dash-cd-urg' };
        } else {
            return { dias: diffDias, texto: `🔴 Vencido há ${Math.abs(diffDias)} d`, badgeClass: 'dash-cd-dang' };
        }
    }

    async function carregarMonitorRecorrenciasDashboard() {
        const tbody = document.getElementById('dashRecorrentesTableBody');
        const clientesGrid = document.getElementById('dashClientesAtivosGrid');
        if (!tbody) return;

        try {
            const { data, error } = await supabaseClient
                .from('servicos_recorrentes')
                .select(`
                    *,
                    clientes (id, nome, cpf_cnpj, telefone, email),
                    produtos (id, nome, codigo)
                `)
                .order('data_vencimento', { ascending: true });

            if (error) throw error;
            dashRecorrentes = data || [];

            // Calcular Métricas
            let mrr = 0;
            const clientesAtivosMap = new Map();
            let aVencerQtd = 0;
            let vencidosQtd = 0;

            dashRecorrentes.forEach(ass => {
                if (ass.status === 'ativo') {
                    const v = parseFloat(ass.valor) || 0;
                    const freq = (ass.frequencia || 'mensal').toLowerCase();
                    if (freq === 'semanal') mrr += v * (52 / 12);
                    else if (freq === 'mensal') mrr += v;
                    else if (freq === 'trimestral') mrr += v / 3;
                    else if (freq === 'semestral') mrr += v / 6;
                    else if (freq === 'anual') mrr += v / 12;

                    const exp = calcularExpiraEmDash(ass.data_vencimento);
                    if (exp.dias < 0) vencidosQtd++;
                    else if (exp.dias >= 0 && exp.dias <= 7) aVencerQtd++;

                    if (ass.clientes) {
                        const cid = ass.clientes.id;
                        if (!clientesAtivosMap.has(cid)) {
                            clientesAtivosMap.set(cid, {
                                cliente: ass.clientes,
                                planos: [],
                                totalMensal: 0,
                                proximoVencimento: ass.data_vencimento
                            });
                        }
                        const cEntry = clientesAtivosMap.get(cid);
                        cEntry.planos.push(ass);
                        const vMensal = (freq === 'semanal' ? v * (52/12) : (freq === 'trimestral' ? v/3 : (freq === 'semestral' ? v/6 : (freq === 'anual' ? v/12 : v))));
                        cEntry.totalMensal += vMensal;
                        if (ass.data_vencimento < cEntry.proximoVencimento) {
                            cEntry.proximoVencimento = ass.data_vencimento;
                        }
                    }
                }
            });

            // Preencher chips
            const elMRR = document.getElementById('dashMRR');
            const elAVenc = document.getElementById('dashAVencerQtd');
            const elVenc = document.getElementById('dashVencidosQtd');
            const elTotalCli = document.getElementById('dashTotalClientesAtivos');
            if (elMRR) elMRR.textContent = fmt(mrr);
            if (elAVenc) elAVenc.textContent = aVencerQtd;
            if (elVenc) elVenc.textContent = vencidosQtd;
            if (elTotalCli) elTotalCli.textContent = clientesAtivosMap.size;

            // Renderizar Tabela de Vencimentos & Prazos
            if (dashRecorrentes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray); padding: 25px;">Nenhum serviço recorrente ou assinatura cadastrada.</td></tr>';
            } else {
                tbody.innerHTML = dashRecorrentes.map(r => {
                    const exp = calcularExpiraEmDash(r.data_vencimento);
                    return `
                        <tr>
                            <td><strong>${formatarData(r.data_vencimento)}</strong></td>
                            <td><span class="badge-countdown-dash ${exp.badgeClass}">${exp.texto}</span></td>
                            <td>
                                <strong>${r.plano_nome}</strong>
                                <small style="display:block; color:var(--gray); text-transform:capitalize;">${r.frequencia || 'mensal'}</small>
                            </td>
                            <td>
                                <strong>${r.clientes?.nome || 'Não Informado'}</strong>
                                ${r.clientes?.telefone ? `<small style="display:block; color:var(--gray);">${r.clientes.telefone}</small>` : ''}
                            </td>
                            <td style="font-weight: 700; color: #0F172A;">${fmt(r.valor)}</td>
                            <td style="text-align: right; white-space: nowrap;">
                                <button class="btn-primary" onclick="abrirModalPagamentoDash(${r.id})" style="background:#0284C7; color:white; border:none; padding:4px 9px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer; margin-right:4px;" title="Registrar Pagamento de Mensalidade">
                                    💳 Pagar
                                </button>
                                <button class="btn-success" onclick="renovarCicloDash(${r.id})" style="background:#10B981; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;" title="Renovar Ciclo Sem Venda">
                                    🔄 Renovar
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            // Renderizar Grid de Clientes Ativos
            if (clientesGrid) {
                if (clientesAtivosMap.size === 0) {
                    clientesGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--gray); padding: 20px;">Nenhum cliente ativo no momento.</div>';
                } else {
                    clientesGrid.innerHTML = Array.from(clientesAtivosMap.values()).map(c => {
                        const exp = calcularExpiraEmDash(c.proximoVencimento);
                        return `
                            <div style="background:#FFFFFF; border:1px solid var(--border); border-radius:10px; padding:14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                                    <strong style="color:var(--dark); font-size:14px;">${c.cliente.nome}</strong>
                                    <span class="badge-countdown-dash ${exp.badgeClass}">${exp.texto}</span>
                                </div>
                                <div style="font-size:12px; color:var(--gray); margin-bottom:6px;">
                                    ${c.cliente.telefone || c.cliente.cpf_cnpj || 'Sem telefone'}
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:6px 10px; border-radius:6px;">
                                    <span style="font-size:11.5px; color:var(--gray);">${c.planos.length} plano(s)</span>
                                    <strong style="color:#10B981; font-size:13px;">${fmt(c.totalMensal)}/mês</strong>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

        } catch (e) {
            console.warn('Aviso ao carregar monitor de recorrências no dashboard:', e);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray);">Painel de serviços recorrentes em atualização.</td></tr>';
        }
    }

    function calcularProximoVencimentoDash(baseDateStr, freq) {
        if (!baseDateStr) baseDateStr = new Date().toISOString().split('T')[0];
        const [ano, mes, dia] = baseDateStr.substring(0, 10).split('-').map(Number);
        const novaData = new Date(ano, mes - 1, dia);

        const f = (freq || 'mensal').toLowerCase();
        if (f === 'semanal') novaData.setDate(novaData.getDate() + 7);
        else if (f === 'mensal') novaData.setMonth(novaData.getMonth() + 1);
        else if (f === 'trimestral') novaData.setMonth(novaData.getMonth() + 3);
        else if (f === 'semestral') novaData.setMonth(novaData.getMonth() + 6);
        else if (f === 'anual') novaData.setFullYear(novaData.getFullYear() + 1);

        return novaData.toISOString().split('T')[0];
    }

    async function obterOuCriarProdutoServicoDash(usuario) {
        try {
            const { data: existente } = await supabaseClient
                .from('produtos')
                .select('id, nome')
                .eq('codigo', 'REC-MENSALIDADE')
                .maybeSingle();

            if (existente && existente.id) return existente.id;

            const { data: criado, error } = await supabaseClient
                .from('produtos')
                .insert([{
                    loja_id: usuario?.loja_id || 1,
                    codigo: 'REC-MENSALIDADE',
                    nome: 'Mensalidade de Serviço Recorrente',
                    tipo: 'servico',
                    valor_venda: 0.01,
                    valor_compra: 0.00,
                    estoque_total: 0,
                    ativo: true
                }])
                .select();

            if (!error && criado && criado[0]) return criado[0].id;

            const { data: fallback } = await supabaseClient
                .from('produtos')
                .select('id')
                .eq('tipo', 'servico')
                .limit(1);

            if (fallback && fallback.length > 0) return fallback[0].id;
        } catch (e) {}
        return null;
    }

    const modalPagDash = document.getElementById('modalPagamentoDash');

    window.abrirModalPagamentoDash = async function(id) {
        const item = dashRecorrentes.find(a => a.id === id);
        if (!item || !modalPagDash) return;

        document.getElementById('dashPag_assinaturaId').value = item.id;
        document.getElementById('dashPag_clienteNome').textContent = item.clientes?.nome || 'Cliente não identificado';
        document.getElementById('dashPag_planoNome').textContent = item.plano_nome;
        document.getElementById('dashPag_vencimentoAtual').textContent = formatarData(item.data_vencimento);
        document.getElementById('dashPag_frequenciaTexto').textContent = item.frequencia || 'mensal';
        document.getElementById('dashPag_valor').value = parseFloat(item.valor || 0).toFixed(2);
        document.getElementById('dashPag_dataPagamento').value = new Date().toISOString().split('T')[0];
        document.getElementById('dashPag_formaPagamento').value = 'pix';
        document.getElementById('dashPag_observacao').value = `Acerto de mensalidade - Plano: ${item.plano_nome}`;

        const novoVenc = calcularProximoVencimentoDash(item.data_vencimento, item.frequencia);
        const inputProximoVenc = document.getElementById('dashPag_proximoVencimento');
        if (inputProximoVenc) inputProximoVenc.value = novoVenc;

        const spanCiclo = document.getElementById('dashPag_spanCicloDias');
        if (spanCiclo) {
            const exp = calcularExpiraEmDash(novoVenc);
            spanCiclo.textContent = `(${exp.texto})`;
        }

        const elCaixa = document.getElementById('dashPag_caixaStatus');
        if (elCaixa) {
            try {
                const caixaAtivo = await (typeof obterCaixaAtivo === 'function' ? obterCaixaAtivo() : null);
                if (caixaAtivo) {
                    elCaixa.innerHTML = `<strong style="color: #16a34a;">🟢 Caixa Aberto #${caixaAtivo.id}</strong> (O valor entrará neste turno)`;
                } else {
                    elCaixa.innerHTML = `<span style="color: #64748b;">⚪ Sem caixa aberto (Lançamento direto no financeiro)</span>`;
                }
            } catch (e) {
                elCaixa.innerHTML = `<span style="color: #64748b;">⚪ Financeiro Geral</span>`;
            }
        }

        modalPagDash.style.display = 'block';
        document.getElementById('dashPag_valor')?.focus();
    };

    window.fecharModalPagamentoDash = function() {
        if (modalPagDash) modalPagDash.style.display = 'none';
    };

    document.getElementById('closeModalPagamentoDash')?.addEventListener('click', fecharModalPagamentoDash);
    document.getElementById('btnCancelarPagamentoDash')?.addEventListener('click', fecharModalPagamentoDash);

    document.getElementById('btnConfirmarPagamentoDash')?.addEventListener('click', async () => {
        const id = document.getElementById('dashPag_assinaturaId')?.value;
        const valorStr = document.getElementById('dashPag_valor')?.value;
        const dataPagamento = document.getElementById('dashPag_dataPagamento')?.value;
        const formaPagamento = document.getElementById('dashPag_formaPagamento')?.value || 'pix';
        const proximoVencimento = document.getElementById('dashPag_proximoVencimento')?.value;
        const observacao = document.getElementById('dashPag_observacao')?.value?.trim() || '';

        const valorPago = parseFloat(valorStr);
        if (isNaN(valorPago) || valorPago <= 0) {
            alert('Informe um valor de pagamento válido!');
            return;
        }
        if (!dataPagamento || !proximoVencimento) {
            alert('Preencha a data de pagamento e o próximo vencimento!');
            return;
        }

        const item = dashRecorrentes.find(a => String(a.id) === String(id));
        if (!item) return;

        const btnConfirmar = document.getElementById('btnConfirmarPagamentoDash');
        if (btnConfirmar) {
            btnConfirmar.disabled = true;
            btnConfirmar.innerHTML = '⏳ Processando...';
        }

        try {
            const usuarioStr = sessionStorage.getItem('usuario');
            const usuario = usuarioStr ? JSON.parse(usuarioStr) : { id: 1, loja_id: 1 };
            const caixaAtivo = await (typeof obterCaixaAtivo === 'function' ? obterCaixaAtivo() : null);

            let produtoId = item.produto_id;
            if (!produtoId) {
                produtoId = await obterOuCriarProdutoServicoDash(usuario);
            }

            let obsVenda = `[Mensalidade Recorrente] Plano: ${item.plano_nome} (${item.frequencia || 'mensal'}) | Vencimento quitado: ${formatarData(item.data_vencimento)}`;
            if (observacao) obsVenda += ` | ${observacao}`;

            const payloadSaida = {
                loja_id: usuario.loja_id || 1,
                cliente_id: item.cliente_id,
                cliente_nome: item.clientes?.nome || null,
                cliente_cpf: item.clientes?.cpf_cnpj || null,
                usuario_id: usuario.id,
                data: dataPagamento,
                total: valorPago,
                desconto: 0,
                forma_pagamento: formaPagamento,
                cancelado: false,
                data_finalizacao: new Date().toISOString(),
                caixa_id: caixaAtivo ? caixaAtivo.id : null,
                observacao: obsVenda
            };

            const { data: saidaCriada, error: erroSaida } = await supabaseClient
                .from('saidas')
                .insert([payloadSaida])
                .select();

            if (erroSaida) throw erroSaida;
            const vendaId = saidaCriada && saidaCriada[0] ? saidaCriada[0].id : null;

            if (vendaId && produtoId) {
                await supabaseClient
                    .from('saida_itens')
                    .insert([{
                        saida_id: vendaId,
                        produto_id: produtoId,
                        quantidade: 1,
                        valor_unitario: valorPago,
                        subtotal: valorPago,
                        desconto: 0
                    }]);
            }

            await supabaseClient
                .from('servicos_recorrentes')
                .update({
                    data_vencimento: proximoVencimento,
                    status: 'ativo',
                    data_ultimo_pagamento: dataPagamento,
                    ultima_saida_id: vendaId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id);

            if (item.produto_id) {
                await supabaseClient
                    .from('produtos')
                    .update({ plano_data_vencimento: proximoVencimento })
                    .eq('id', item.produto_id)
                    .eq('plano_cliente_id', item.cliente_id);
            }

            fecharModalPagamentoDash();
            if (typeof mostrarNotificacao === 'function') {
                mostrarNotificacao(`🎉 Pagamento registrado! Venda #${vendaId || ''} gerada com sucesso!`, 'success');
            } else {
                alert(`Pagamento registrado com sucesso! Venda #${vendaId || ''} gerada.`);
            }
            await carregarMonitorRecorrenciasDashboard();
            carregarDashboard();
        } catch (err) {
            console.error('Erro ao processar pagamento:', err);
            alert('Erro ao registrar pagamento: ' + (err.message || err));
        } finally {
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = '<span>✅</span> Confirmar Pagamento & Gerar Venda';
            }
        }
    });

    // Ação rápida de renovação a partir do dashboard
    window.renovarCicloDash = async (id) => {
        const item = dashRecorrentes.find(a => a.id === id);
        if (!item) return;

        const novaDataStr = calcularProximoVencimentoDash(item.data_vencimento, item.frequencia);

        try {
            await supabaseClient
                .from('servicos_recorrentes')
                .update({ data_vencimento: novaDataStr, status: 'ativo', updated_at: new Date().toISOString() })
                .eq('id', id);

            if (item.produto_id) {
                await supabaseClient
                    .from('produtos')
                    .update({ plano_data_vencimento: novaDataStr })
                    .eq('id', item.produto_id)
                    .eq('plano_cliente_id', item.cliente_id);
            }

            if (typeof mostrarNotificacao === 'function') {
                mostrarNotificacao(`Ciclo renovado! Próximo vencimento: ${formatarData(novaDataStr)}`, 'success');
            }
            await carregarMonitorRecorrenciasDashboard();
        } catch (err) {
            console.error('Erro ao renovar ciclo no dashboard:', err);
        }
    };

    // Alternar abas do painel no dashboard
    const tabVenc = document.getElementById('btnDashTabVencimentos');
    const tabCli = document.getElementById('btnDashTabClientes');
    const boxVenc = document.getElementById('dashContainerVencimentos');
    const boxCli = document.getElementById('dashContainerClientes');

    tabVenc?.addEventListener('click', () => {
        tabVenc.style.background = '#FFFFFF';
        tabVenc.style.color = 'var(--primary)';
        tabVenc.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        tabCli.style.background = 'transparent';
        tabCli.style.color = 'var(--gray)';
        tabCli.style.boxShadow = 'none';

        if (boxVenc) boxVenc.style.display = 'block';
        if (boxCli) boxCli.style.display = 'none';
    });

    tabCli?.addEventListener('click', () => {
        tabCli.style.background = '#FFFFFF';
        tabCli.style.color = 'var(--primary)';
        tabCli.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        tabVenc.style.background = 'transparent';
        tabVenc.style.color = 'var(--gray)';
        tabVenc.style.boxShadow = 'none';

        if (boxVenc) boxVenc.style.display = 'none';
        if (boxCli) boxCli.style.display = 'block';
    });

    // Expandir / modo foco do painel no dashboard
    const btnExpandir = document.getElementById('btnExpandirPainelRecorrentes');
    const painelEl = document.getElementById('painelRecorrentes');

    btnExpandir?.addEventListener('click', () => {
        painelRecorrentesExpandido = !painelRecorrentesExpandido;
        if (painelRecorrentesExpandido) {
            painelEl?.classList.add('expanded-mode');
            btnExpandir.innerHTML = '✕ Fechar Modo Expandido';
            btnExpandir.style.background = '#fee2e2';
            btnExpandir.style.color = '#b91c1c';
        } else {
            painelEl?.classList.remove('expanded-mode');
            btnExpandir.innerHTML = '⛶ Expandir Painel';
            btnExpandir.style.background = '#FFFFFF';
            btnExpandir.style.color = 'var(--dark)';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && painelRecorrentesExpandido) {
            btnExpandir?.click();
        }
    });

    // =====================================================
    // INICIALIZAÇÃO
    // =====================================================
    await carregarDashboard();
});
