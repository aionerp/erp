// js/agendamentos.js
// Gestão Profissional de Agendamentos de Serviços (Aion ERP)

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    // =====================================================
    // ESTADO GLOBAL DO MÓDULO
    // =====================================================
    let agendamentos = [];
    let clientes = [];
    let servicosCatalogo = [];
    let produtosCatalogo = [];
    let profissionais = [];

    let currentView = 'dia'; // 'dia', 'semana', 'mes', 'lista'
    let currentDate = new Date();
    let currentAppointmentId = null;

    // Estado do formulário de novo/editar agendamento
    let formServicos = [];
    let formProdutos = [];

    // Formatação de Moeda
    const formatarMoeda = (val) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val) || 0);
    };

    // Formatação de Data / Hora Local (evita bugs de fuso UTC)
    const obterDataIsoStr = (d) => {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    };

    const obterHoraMinutoStr = (d) => {
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    };

    // Inicializar data no input
    const inputFiltroDataPrincipal = document.getElementById('filtroDataPrincipal');
    if (inputFiltroDataPrincipal) {
        inputFiltroDataPrincipal.value = obterDataIsoStr(currentDate);
    }

    // =====================================================
    // 1. CARREGAR DADOS INICIAIS (Clientes, Serviços, Profissionais)
    // =====================================================
    async function carregarDadosIniciais() {
        try {
            const [cliRes, prodRes, colabRes, userRes] = await Promise.all([
                supabaseClient.from('clientes').select('id, nome, cpf_cnpj, telefone, email').eq('ativo', true).order('nome'),
                supabaseClient.from('produtos').select('*').order('nome'),
                supabaseClient.from('colaboradores').select('id, nome, sobrenome, telefone, funcao, comissao, ativo').order('nome'),
                supabaseClient.from('usuarios').select('id, nome, perfil').eq('ativo', true).order('nome')
            ]);

            clientes = cliRes.data || [];
            
            const todosProdutos = prodRes.data || [];
            const isServico = (p) => {
                const tipo = (p.tipo || '').toLowerCase().trim();
                const cat = (p.categoria || '').toLowerCase().trim();
                return tipo === 'servico' || tipo === 'serviço' || cat.includes('serviço') || cat.includes('servico');
            };
            servicosCatalogo = todosProdutos.filter(p => isServico(p));
            produtosCatalogo = todosProdutos.filter(p => !isServico(p));
            console.log(`[Agendamentos] Carregados ${servicosCatalogo.length} serviços e ${produtosCatalogo.length} produtos do catálogo.`);

            // Profissionais: Colaboradores da loja ou usuários ativos
            const colabs = (colabRes.data || []).filter(c => c.ativo !== false);
            if (colabs.length > 0) {
                profissionais = colabs.map(c => ({
                    id: c.id,
                    nome: `${c.nome} ${c.sobrenome || ''}`.trim(),
                    telefone: c.telefone,
                    funcao: c.funcao || 'Profissional',
                    comissao: c.comissao || 0
                }));
            } else {
                // Fallback para usuários do sistema se ainda não houver colaboradores
                profissionais = (userRes.data || []).map(u => ({
                    id: u.id,
                    nome: u.nome,
                    telefone: '',
                    funcao: u.perfil || 'Atendente',
                    comissao: 0
                }));
            }

            popularSelectsFiltrosEForm();
            await carregarAgendamentos();

        } catch (error) {
            console.error('Erro ao carregar dados iniciais de agendamento:', error);
            mostrarNotificacao('Erro ao carregar informações da agenda', 'error');
        }
    }

    function popularSelectsFiltrosEForm() {
        // Select de Clientes no Modal
        const selectCli = document.getElementById('modalClienteId');
        if (selectCli) {
            selectCli.innerHTML = '<option value="">Selecione ou pesquise o cliente...</option>' +
                clientes.map(c => `<option value="${c.id}">${c.nome} ${c.telefone ? `(${c.telefone})` : ''}</option>`).join('');
        }

        // Select de Profissionais no Modal e Filtro
        const selectProf = document.getElementById('modalProfissionalId');
        const filtroProf = document.getElementById('filtroProfissional');
        const profOptions = profissionais.map(p => `<option value="${p.id}">${p.nome} (${p.funcao})</option>`).join('');

        if (selectProf) {
            selectProf.innerHTML = '<option value="">Selecione o profissional...</option>' + profOptions;
        }
        if (filtroProf) {
            filtroProf.innerHTML = '<option value="">Todos Profissionais</option>' + profOptions;
        }

        // Select de Serviços do Catálogo
        const selectServ = document.getElementById('selectAdicionarServico');
        if (selectServ) {
            selectServ.innerHTML = '<option value="">Escolha um serviço para adicionar...</option>' +
                servicosCatalogo.map(s => {
                    const dur = s.duracao_minutos || 40;
                    const val = Number(s.valor_venda) || 0;
                    return `<option value="${s.id}" data-nome="${s.nome}" data-valor="${val}" data-duracao="${dur}">
                        ${s.nome} — ${formatarMoeda(val)} (${dur} min)
                    </option>`;
                }).join('');
        }

        // Select de Produtos do Estoque
        const selectProd = document.getElementById('selectAdicionarProduto');
        if (selectProd) {
            selectProd.innerHTML = '<option value="">Selecione um produto do estoque...</option>' +
                produtosCatalogo.map(p => {
                    return `<option value="${p.id}" data-nome="${p.nome}" data-valor="${p.valor_venda}" data-estoque="${p.estoque_total || 0}">
                        ${p.nome} — ${formatarMoeda(p.valor_venda)} (Estoque: ${p.estoque_total || 0})
                    </option>`;
                }).join('');
        }
    }

    // =====================================================
    // 2. CARREGAR AGENDAMENTOS DO BANCO
    // =====================================================
    async function carregarAgendamentos() {
        try {
            const { data, error } = await supabaseClient
                .from('agendamentos')
                .select('*')
                .order('data_hora', { ascending: true });

            if (error) throw error;
            agendamentos = data || [];

            atualizarDashboardKPIs();
            renderizarVisualizacaoAtual();

        } catch (error) {
            console.error('Erro ao buscar agendamentos:', error);
            mostrarNotificacao('Erro ao carregar lista de agendamentos', 'error');
        }
    }

    // =====================================================
    // 3. DASHBOARD KPI CARDS
    // =====================================================
    function atualizarDashboardKPIs() {
        const hojeStr = obterDataIsoStr(new Date());

        let totalHoje = 0;
        let totalAguardando = 0;
        let totalConfirmados = 0;
        let totalEmAtendimento = 0;
        let totalConcluidos = 0;
        let totalCancelados = 0;
        let previstoHoje = 0;
        let recebidoHoje = 0;

        agendamentos.forEach(a => {
            const dataHora = a.data_hora ? new Date(a.data_hora) : null;
            if (!dataHora) return;
            const itemDataStr = obterDataIsoStr(dataHora);
            const isHoje = itemDataStr === hojeStr;
            const valorTotal = Number(a.total || a.valor || 0);
            const valorPago = Number(a.valor_pago || (a.status_pagamento === 'pago' ? valorTotal : 0));

            if (isHoje) {
                totalHoje++;
                if (a.status !== 'cancelado') {
                    previstoHoje += valorTotal;
                    recebidoHoje += valorPago;
                }
            }

            if (a.status === 'agendado') totalAguardando++;
            else if (a.status === 'confirmado') totalConfirmados++;
            else if (a.status === 'em_atendimento') totalEmAtendimento++;
            else if (a.status === 'concluido') totalConcluidos++;
            else if (a.status === 'cancelado' || a.status === 'nao_compareceu') totalCancelados++;
        });

        const elHoje = document.getElementById('kpiHojeVal');
        const elAguardando = document.getElementById('kpiAguardandoVal');
        const elConfirmados = document.getElementById('kpiConfirmadosVal');
        const elEmAtendimento = document.getElementById('kpiEmAtendimentoVal');
        const elConcluidos = document.getElementById('kpiConcluidosVal');
        const elCancelados = document.getElementById('kpiCanceladosVal');
        const elPrevisto = document.getElementById('kpiPrevistoVal');
        const elRecebido = document.getElementById('kpiRecebidoVal');

        if (elHoje) elHoje.textContent = totalHoje;
        if (elAguardando) elAguardando.textContent = totalAguardando;
        if (elConfirmados) elConfirmados.textContent = totalConfirmados;
        if (elEmAtendimento) elEmAtendimento.textContent = totalEmAtendimento;
        if (elConcluidos) elConcluidos.textContent = totalConcluidos;
        if (elCancelados) elCancelados.textContent = totalCancelados;
        if (elPrevisto) elPrevisto.textContent = formatarMoeda(previstoHoje);
        if (elRecebido) elRecebido.textContent = formatarMoeda(recebidoHoje);
    }

    // =====================================================
    // 4. CONTROLES DE VISUALIZAÇÃO E NAVEGAÇÃO
    // =====================================================
    function atualizarLabelDataPrincipal() {
        const label = document.getElementById('labelDataAtual');
        if (!label) return;

        const opcoes = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
        let texto = currentDate.toLocaleDateString('pt-BR', opcoes);
        texto = texto.charAt(0).toUpperCase() + texto.slice(1);

        if (currentView === 'semana') {
            const seg = obterPrimeiroDiaSemana(currentDate);
            const dom = new Date(seg);
            dom.setDate(seg.getDate() + 6);
            texto = `Semana: ${seg.toLocaleDateString('pt-BR')} a ${dom.toLocaleDateString('pt-BR')}`;
        } else if (currentView === 'mes') {
            const mesNome = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            texto = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);
        }

        label.textContent = texto;
        if (inputFiltroDataPrincipal) {
            inputFiltroDataPrincipal.value = obterDataIsoStr(currentDate);
        }
    }

    function alternarVisualizacao(novaView) {
        currentView = novaView;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === novaView);
        });

        document.querySelectorAll('.calendar-view-pane').forEach(pane => pane.style.display = 'none');
        
        const paneMap = {
            dia: 'viewDia',
            semana: 'viewSemana',
            mes: 'viewMes',
            lista: 'viewLista'
        };

        const targetPane = document.getElementById(paneMap[novaView]);
        if (targetPane) targetPane.style.display = 'block';

        atualizarLabelDataPrincipal();
        renderizarVisualizacaoAtual();
    }

    function navegarData(direcao) {
        if (currentView === 'dia' || currentView === 'lista') {
            currentDate.setDate(currentDate.getDate() + direcao);
        } else if (currentView === 'semana') {
            currentDate.setDate(currentDate.getDate() + (direcao * 7));
        } else if (currentView === 'mes') {
            currentDate.setMonth(currentDate.getMonth() + direcao);
        }
        atualizarLabelDataPrincipal();
        renderizarVisualizacaoAtual();
    }

    function irParaHoje() {
        currentDate = new Date();
        atualizarLabelDataPrincipal();
        renderizarVisualizacaoAtual();
    }

    // =====================================================
    // 5. FILTRAGEM LOCAL DE AGENDAMENTOS
    // =====================================================
    function obterAgendamentosFiltrados() {
        const busca = (document.getElementById('filtroBuscaGeral')?.value || '').toLowerCase().trim();
        const profId = document.getElementById('filtroProfissional')?.value || '';
        const statusFiltro = document.getElementById('filtroStatus')?.value || '';

        return agendamentos.filter(a => {
            const cliente = clientes.find(c => c.id === a.cliente_id);
            const prof = profissionais.find(p => p.id === a.profissional_id);

            // Filtro de Profissional
            if (profId && String(a.profissional_id) !== profId) return false;

            // Filtro de Status
            if (statusFiltro && a.status !== statusFiltro) return false;

            // Filtro de Busca
            if (busca) {
                const cliNome = (cliente?.nome || '').toLowerCase();
                const cliTel = (cliente?.telefone || '').replace(/\D/g, '');
                const servicos = (a.servicos || []).map(s => (s.nome || '').toLowerCase()).join(' ');
                const matchBusca = cliNome.includes(busca) || cliTel.includes(busca.replace(/\D/g, '')) || servicos.includes(busca);
                if (!matchBusca) return false;
            }

            return true;
        });
    }

    function renderizarVisualizacaoAtual() {
        if (currentView === 'dia') renderizarViewDia();
        else if (currentView === 'semana') renderizarViewSemana();
        else if (currentView === 'mes') renderizarViewMes();
        else if (currentView === 'lista') renderizarViewLista();
    }

    // Helper: Labels e Badges de Status
    const statusMeta = {
        agendado: { label: 'Agendado', class: 'status-agendado', border: 'border-agendado' },
        confirmado: { label: 'Confirmado', class: 'status-confirmado', border: 'border-confirmado' },
        em_atendimento: { label: 'Em Atendimento', class: 'status-em_atendimento', border: 'border-em_atendimento' },
        concluido: { label: 'Concluído', class: 'status-concluido', border: 'border-concluido' },
        cancelado: { label: 'Cancelado', class: 'status-cancelado', border: 'border-cancelado' },
        nao_compareceu: { label: 'Não Compareceu', class: 'status-nao_compareceu', border: 'border-nao_compareceu' }
    };

    function criarCardAgendamentoHtml(a) {
        const cliente = clientes.find(c => c.id === a.cliente_id);
        const prof = profissionais.find(p => p.id === a.profissional_id);
        const meta = statusMeta[a.status] || { label: a.status, class: 'status-agendado', border: 'border-agendado' };

        const d = new Date(a.data_hora);
        const horaInicio = obterHoraMinutoStr(d);
        const horaFim = a.data_hora_fim ? obterHoraMinutoStr(new Date(a.data_hora_fim)) : '';
        const horarioStr = horaFim ? `${horaInicio} - ${horaFim}` : horaInicio;

        // Serviços em string
        let servicosStr = 'Serviço Geral';
        if (Array.isArray(a.servicos) && a.servicos.length > 0) {
            servicosStr = a.servicos.map(s => s.nome).join(', ');
        } else if (a.servico_id) {
            const sItem = servicosCatalogo.find(s => s.id === a.servico_id);
            if (sItem) servicosStr = sItem.nome;
        }

        const totalValor = Number(a.total || a.valor || 0);

        return `
            <div class="appt-card ${meta.border}" onclick="window.abrirDetalhesAgendamento(${a.id})">
                <div class="appt-card-top">
                    <span style="font-size:12px; font-weight:800; color:var(--carbon-black);">⏰ ${horarioStr}</span>
                    <span class="status-badge ${meta.class}">${meta.label}</span>
                </div>
                <div class="appt-client-name">👤 ${cliente?.nome || 'Cliente não identificado'}</div>
                <div class="appt-service-info">✂️ ${servicosStr}</div>
                <div class="appt-prof-info">👤 Profissional: <strong>${prof?.nome || 'Não definido'}</strong></div>
                <div class="appt-footer-row">
                    <span class="appt-price">${formatarMoeda(totalValor)}</span>
                    <div class="appt-actions-quick" onclick="event.stopPropagation();">
                        ${cliente?.telefone ? `
                            <button class="btn-quick-act" title="WhatsApp" onclick="window.abrirWhatsappConfirmacao(${a.id})">💬</button>
                        ` : ''}
                        <button class="btn-quick-act" title="Ver Detalhes" onclick="window.abrirDetalhesAgendamento(${a.id})">👁️</button>
                    </div>
                </div>
            </div>
        `;
    }

    // =====================================================
    // 6. RENDERIZAÇÃO: VIEW DIA (Timeline)
    // =====================================================
    function renderizarViewDia() {
        const container = document.getElementById('daySlotsContainer');
        const headerTitle = document.getElementById('dayViewHeaderTitle');
        const countBadge = document.getElementById('dayViewCountBadge');
        if (!container) return;

        const dataAlvoStr = obterDataIsoStr(currentDate);
        if (headerTitle) {
            const dataExt = currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            headerTitle.textContent = dataExt.charAt(0).toUpperCase() + dataExt.slice(1);
        }

        const filtrados = obterAgendamentosFiltrados().filter(a => {
            if (!a.data_hora) return false;
            return obterDataIsoStr(new Date(a.data_hora)) === dataAlvoStr;
        });

        if (countBadge) {
            countBadge.textContent = `${filtrados.length} agendamento(s) para este dia`;
        }

        // Grade de horários: 07:00 às 20:00
        const horas = [];
        for (let h = 7; h <= 20; h++) {
            horas.push(`${String(h).padStart(2, '0')}:00`);
        }

        let html = '';
        horas.forEach(hora => {
            const horaNum = parseInt(hora.split(':')[0]);
            
            // Agendamentos que começam nesta hora
            const itensDestaHora = filtrados.filter(a => {
                const horaAg = new Date(a.data_hora).getHours();
                return horaAg === horaNum;
            });

            html += `
                <div class="timeline-slot-row">
                    <div class="timeline-time-col">${hora}</div>
                    <div class="timeline-content-col">
                        ${itensDestaHora.map(a => criarCardAgendamentoHtml(a)).join('')}
                        <button type="button" class="slot-add-btn" onclick="window.abrirModalNovoAgendamento('${dataAlvoStr}', '${hora}')">
                            + Agendar às ${hora}
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // =====================================================
    // 7. RENDERIZAÇÃO: VIEW SEMANA (7 Colunas)
    // =====================================================
    function obterPrimeiroDiaSemana(d) {
        const copia = new Date(d);
        const diaSemana = copia.getDay();
        const diff = copia.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1); // Segunda-feira
        return new Date(copia.setDate(diff));
    }

    function renderizarViewSemana() {
        const container = document.getElementById('weekGridContainer');
        if (!container) return;

        const filtrados = obterAgendamentosFiltrados();
        const seg = obterPrimeiroDiaSemana(currentDate);
        const hojeStr = obterDataIsoStr(new Date());

        let html = '';
        for (let i = 0; i < 7; i++) {
            const diaIter = new Date(seg);
            diaIter.setDate(seg.getDate() + i);
            const diaStr = obterDataIsoStr(diaIter);
            const isToday = diaStr === hojeStr;

            const itensDia = filtrados.filter(a => {
                if (!a.data_hora) return false;
                return obterDataIsoStr(new Date(a.data_hora)) === diaStr;
            });

            const nomeDia = diaIter.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
            const numDia = diaIter.getDate();
            const totalDia = itensDia.reduce((acc, curr) => acc + Number(curr.total || curr.valor || 0), 0);

            html += `
                <div class="week-day-col ${isToday ? 'today' : ''}">
                    <div class="week-day-header" onclick="window.irParaDiaEspecifico('${diaStr}')" style="cursor:pointer;" title="Ver detalhes deste dia">
                        <div class="week-day-name">${nomeDia}</div>
                        <div class="week-day-num">${numDia}</div>
                        <div style="font-size:11px; color:var(--gray); margin-top:2px;">
                            ${itensDia.length} agend. • ${formatarMoeda(totalDia)}
                        </div>
                    </div>
                    <div class="week-day-body">
                        ${itensDia.length === 0 ? `
                            <div style="text-align:center; padding:20px 8px; color:var(--dust-grey); font-size:12px;">
                                Sem agendamentos
                            </div>
                        ` : itensDia.map(a => criarCardAgendamentoHtml(a)).join('')}
                        <button type="button" class="btn-secondary" style="font-size:11px; padding:6px; border-radius:6px; margin-top:auto;" onclick="window.abrirModalNovoAgendamento('${diaStr}', '09:00')">
                            + Agendar
                        </button>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    window.irParaDiaEspecifico = (dataStr) => {
        const [ano, mes, dia] = dataStr.split('-').map(Number);
        currentDate = new Date(ano, mes - 1, dia);
        alternarVisualizacao('dia');
    };

    // =====================================================
    // 8. RENDERIZAÇÃO: VIEW MÊS (Month Grid)
    // =====================================================
    function renderizarViewMes() {
        const container = document.getElementById('monthGridContainer');
        if (!container) return;

        const filtrados = obterAgendamentosFiltrados();
        const ano = currentDate.getFullYear();
        const mes = currentDate.getMonth();

        const primeiroDiaMes = new Date(ano, mes, 1);
        const ultimoDiaMes = new Date(ano, mes + 1, 0);

        const diaSemanaInicio = primeiroDiaMes.getDay(); // 0 = Dom, 1 = Seg...
        const totalDiasMes = ultimoDiaMes.getDate();
        const hojeStr = obterDataIsoStr(new Date());

        let html = '';

        // Dias do mês anterior para completar primeira semana
        const ultimoDiaMesAnterior = new Date(ano, mes, 0).getDate();
        for (let i = diaSemanaInicio - 1; i >= 0; i--) {
            const num = ultimoDiaMesAnterior - i;
            html += `<div class="month-day-cell other-month"><div class="month-day-num">${num}</div></div>`;
        }

        // Dias do mês atual
        for (let dia = 1; dia <= totalDiasMes; dia++) {
            const diaData = new Date(ano, mes, dia);
            const diaStr = obterDataIsoStr(diaData);
            const isToday = diaStr === hojeStr;

            const itensDia = filtrados.filter(a => {
                if (!a.data_hora) return false;
                return obterDataIsoStr(new Date(a.data_hora)) === diaStr;
            });

            html += `
                <div class="month-day-cell ${isToday ? 'today' : ''}" onclick="window.irParaDiaEspecifico('${diaStr}')">
                    <div class="month-day-num">
                        <span>${dia}</span>
                        ${itensDia.length > 0 ? `<span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:1px 5px; border-radius:10px;">${itensDia.length}</span>` : ''}
                    </div>
                    ${itensDia.slice(0, 3).map(a => {
                        const cliente = clientes.find(c => c.id === a.cliente_id);
                        const meta = statusMeta[a.status] || { class: 'status-agendado' };
                        const hora = obterHoraMinutoStr(new Date(a.data_hora));
                        return `
                            <div class="month-chip ${meta.class}" title="${hora} - ${cliente?.nome || 'Cliente'}">
                                ${hora} ${cliente?.nome ? cliente.nome.split(' ')[0] : 'Agendado'}
                            </div>
                        `;
                    }).join('')}
                    ${itensDia.length > 3 ? `<div style="font-size:10px; color:var(--gray); text-align:center;">+${itensDia.length - 3} mais</div>` : ''}
                </div>
            `;
        }

        // Dias do próximo mês para fechar a grade (múltiplo de 7)
        const totalCelulas = diaSemanaInicio + totalDiasMes;
        const restante = 7 - (totalCelulas % 7);
        if (restante < 7) {
            for (let dia = 1; dia <= restante; dia++) {
                html += `<div class="month-day-cell other-month"><div class="month-day-num">${dia}</div></div>`;
            }
        }

        container.innerHTML = html;
    }

    // =====================================================
    // 9. RENDERIZAÇÃO: VIEW LISTA GERAL
    // =====================================================
    function renderizarViewLista() {
        const tbody = document.getElementById('tabelaAgendamentosBody');
        if (!tbody) return;

        const filtrados = obterAgendamentosFiltrados();

        if (filtrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:40px; color:var(--gray);">
                        Nenhum agendamento encontrado com os filtros selecionados.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtrados.map(a => {
            const cliente = clientes.find(c => c.id === a.cliente_id);
            const prof = profissionais.find(p => p.id === a.profissional_id);
            const meta = statusMeta[a.status] || { label: a.status, class: 'status-agendado' };

            const d = new Date(a.data_hora);
            const dataStr = d.toLocaleDateString('pt-BR');
            const horaStr = obterHoraMinutoStr(d);

            let servicosStr = 'Serviço';
            if (Array.isArray(a.servicos) && a.servicos.length > 0) {
                servicosStr = a.servicos.map(s => s.nome).join(', ');
            } else if (a.servico_id) {
                const sItem = servicosCatalogo.find(s => s.id === a.servico_id);
                if (sItem) servicosStr = sItem.nome;
            }

            const total = Number(a.total || a.valor || 0);
            const statusPag = a.status_pagamento || 'pendente';
            const pagLabels = { pendente: '⏳ Pendente', pago_parcial: '🌓 Parcial', pago: '✅ Pago' };

            return `
                <tr>
                    <td>
                        <strong style="color:var(--carbon-black);">${dataStr}</strong><br>
                        <span style="font-size:12px; color:var(--gray);">⏰ ${horaStr}</span>
                    </td>
                    <td>
                        <strong>${cliente?.nome || 'Não identificado'}</strong>
                        ${cliente?.telefone ? `<div style="font-size:12px; color:var(--dust-grey);">${cliente.telefone}</div>` : ''}
                    </td>
                    <td>${servicosStr}</td>
                    <td>👤 ${prof?.nome || 'Não definido'}</td>
                    <td><span class="status-badge ${meta.class}">${meta.label}</span></td>
                    <td><strong>${formatarMoeda(total)}</strong></td>
                    <td><span style="font-size:12px; font-weight:600;">${pagLabels[statusPag] || statusPag}</span></td>
                    <td style="text-align:right;">
                        <button class="btn-quick-act" title="Ver Detalhes / Alterar Status" onclick="window.abrirDetalhesAgendamento(${a.id})">👁️ Detalhes</button>
                        ${cliente?.telefone ? `
                            <button class="btn-quick-act" title="WhatsApp" onclick="window.abrirWhatsappConfirmacao(${a.id})">💬</button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // =====================================================
    // 10. NOVO / EDITAR AGENDAMENTO (Modal & Validações)
    // =====================================================
    window.abrirModalNovoAgendamento = (dataSugerida = null, horaSugerida = null) => {
        currentAppointmentId = null;
        formServicos = [];
        formProdutos = [];

        document.getElementById('modalAgendamentoTitle').textContent = 'Novo Agendamento';
        document.getElementById('formAgendamento').reset();
        document.getElementById('agendamentoId').value = '';

        const dataInput = document.getElementById('modalData');
        const horaInput = document.getElementById('modalHoraInicio');
        const horaFimInput = document.getElementById('modalHoraFim');
        const clientePreview = document.getElementById('clientePreviewBox');
        if (clientePreview) clientePreview.style.display = 'none';

        const dataPadrao = dataSugerida || obterDataIsoStr(currentDate);
        const horaPadrao = horaSugerida || '09:00';

        dataInput.value = dataPadrao;
        horaInput.value = horaPadrao;
        horaFimInput.value = '';

        document.getElementById('boxConflitoHorario').style.display = 'none';
        renderizarTabelaFormServicos();
        renderizarTabelaFormProdutos();
        recalcularTotaisFormulario();

        document.getElementById('modalAgendamento').style.display = 'flex';
    };

    window.editarAgendamentoCompleto = (id) => {
        const a = agendamentos.find(item => item.id === id);
        if (!a) return;

        currentAppointmentId = a.id;
        document.getElementById('modalAgendamentoTitle').textContent = `Editar Agendamento #${a.id}`;
        document.getElementById('agendamentoId').value = a.id;

        document.getElementById('modalClienteId').value = a.cliente_id || '';
        atualizarPreviewCliente(a.cliente_id);

        const d = new Date(a.data_hora);
        document.getElementById('modalData').value = obterDataIsoStr(d);
        document.getElementById('modalHoraInicio').value = obterHoraMinutoStr(d);
        
        if (a.data_hora_fim) {
            document.getElementById('modalHoraFim').value = obterHoraMinutoStr(new Date(a.data_hora_fim));
        }

        document.getElementById('modalProfissionalId').value = a.profissional_id || '';
        document.getElementById('modalStatus').value = a.status || 'agendado';
        document.getElementById('modalObservacoes').value = a.observacoes || '';

        // Restaurar serviços
        if (Array.isArray(a.servicos) && a.servicos.length > 0) {
            formServicos = [...a.servicos];
        } else if (a.servico_id) {
            const serv = servicosCatalogo.find(s => s.id === a.servico_id);
            formServicos = [{
                id: a.servico_id,
                nome: serv?.nome || 'Serviço',
                duracao_minutos: a.duracao_minutos || serv?.duracao_minutos || 40,
                valor: Number(a.valor || serv?.valor_venda || 0)
            }];
        } else {
            formServicos = [];
        }

        // Restaurar produtos
        if (Array.isArray(a.produtos) && a.produtos.length > 0) {
            formProdutos = [...a.produtos];
        } else {
            formProdutos = [];
        }

        // Desconto e pagamento
        document.getElementById('modalTipoDesconto').value = a.desconto_tipo || 'fixo';
        document.getElementById('modalValorDesconto').value = a.desconto || 0;
        document.getElementById('modalFormaPagamento').value = a.forma_pagamento || 'pendente';
        document.getElementById('modalStatusPagamento').value = a.status_pagamento || 'pendente';

        renderizarTabelaFormServicos();
        renderizarTabelaFormProdutos();
        recalcularTotaisFormulario();

        // Fechar modal de detalhes se estiver aberto
        document.getElementById('modalDetalhesAgendamento').style.display = 'none';
        document.getElementById('modalAgendamento').style.display = 'flex';
    };

    // Pré-visualização do Cliente Selecionado
    function atualizarPreviewCliente(clienteId) {
        const box = document.getElementById('clientePreviewBox');
        if (!box) return;

        if (!clienteId) {
            box.style.display = 'none';
            return;
        }

        const cli = clientes.find(c => c.id === parseInt(clienteId));
        if (!cli) {
            box.style.display = 'none';
            return;
        }

        document.getElementById('prevClienteTelefone').textContent = cli.telefone || 'Sem telefone';
        document.getElementById('prevClienteDoc').textContent = cli.cpf_cnpj || 'Não informado';

        // Histórico de atendimentos do cliente
        const atendimentosCli = agendamentos.filter(a => a.cliente_id === cli.id && a.status !== 'cancelado');
        document.getElementById('prevClienteTotalAtend').textContent = `${atendimentosCli.length} atendimento(s)`;

        if (atendimentosCli.length > 0) {
            const ultimo = atendimentosCli.sort((a,b) => new Date(b.data_hora) - new Date(a.data_hora))[0];
            const dataUltimo = new Date(ultimo.data_hora).toLocaleDateString('pt-BR');
            document.getElementById('prevClienteUltimo').textContent = dataUltimo;
        } else {
            document.getElementById('prevClienteUltimo').textContent = 'Primeira visita';
        }

        box.style.display = 'grid';
    }

    document.getElementById('modalClienteId')?.addEventListener('change', (e) => {
        atualizarPreviewCliente(e.target.value);
    });

    // =====================================================
    // 11. GESTÃO DINÂMICA DE SERVIÇOS NO FORMULÁRIO
    // =====================================================
    document.getElementById('btnAdicionarServicoLista')?.addEventListener('click', () => {
        const select = document.getElementById('selectAdicionarServico');
        const servicoId = select.value;
        if (!servicoId) {
            mostrarNotificacao('Selecione um serviço para adicionar', 'warning');
            return;
        }

        const opt = select.options[select.selectedIndex];
        const nome = opt.getAttribute('data-nome');
        const valor = parseFloat(opt.getAttribute('data-valor')) || 0;
        const duracao = parseInt(opt.getAttribute('data-duracao')) || 40;

        formServicos.push({
            id: parseInt(servicoId),
            nome: nome,
            duracao_minutos: duracao,
            valor: valor
        });

        select.value = '';
        renderizarTabelaFormServicos();
        recalcularTotaisFormulario();
        ajustarHoraTerminoEstimada();
        validarConflitoHorario();
    });

    function renderizarTabelaFormServicos() {
        const tbody = document.getElementById('listaServicosAgendamento');
        if (!tbody) return;

        if (formServicos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--dust-grey); padding:14px;">Nenhum serviço selecionado</td></tr>`;
            return;
        }

        tbody.innerHTML = formServicos.map((s, idx) => `
            <tr>
                <td><strong>${s.nome}</strong></td>
                <td>${s.duracao_minutos} min</td>
                <td>${formatarMoeda(s.valor)}</td>
                <td style="text-align:center;">
                    <button type="button" onclick="window.removerServicoForm(${idx})" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:bold; font-size:14px;">✕</button>
                </td>
            </tr>
        `).join('');
    }

    window.removerServicoForm = (idx) => {
        formServicos.splice(idx, 1);
        renderizarTabelaFormServicos();
        recalcularTotaisFormulario();
        ajustarHoraTerminoEstimada();
        validarConflitoHorario();
    };

    // =====================================================
    // 12. GESTÃO DINÂMICA DE PRODUTOS NO FORMULÁRIO
    // =====================================================
    document.getElementById('btnAdicionarProdutoLista')?.addEventListener('click', () => {
        const select = document.getElementById('selectAdicionarProduto');
        const qtdInput = document.getElementById('inputQtdProduto');
        const prodId = select.value;
        const qtd = parseInt(qtdInput.value) || 1;

        if (!prodId) {
            mostrarNotificacao('Selecione um produto para adicionar', 'warning');
            return;
        }

        const opt = select.options[select.selectedIndex];
        const nome = opt.getAttribute('data-nome');
        const valor = parseFloat(opt.getAttribute('data-valor')) || 0;

        formProdutos.push({
            id: parseInt(prodId),
            nome: nome,
            quantidade: qtd,
            valor_unitario: valor,
            total: valor * qtd
        });

        select.value = '';
        qtdInput.value = '1';
        renderizarTabelaFormProdutos();
        recalcularTotaisFormulario();
    });

    function renderizarTabelaFormProdutos() {
        const tbody = document.getElementById('listaProdutosAgendamento');
        if (!tbody) return;

        if (formProdutos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--dust-grey); padding:14px;">Nenhum produto adicionado</td></tr>`;
            return;
        }

        tbody.innerHTML = formProdutos.map((p, idx) => `
            <tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.quantidade}</td>
                <td>${formatarMoeda(p.valor_unitario)}</td>
                <td>${formatarMoeda(p.total)}</td>
                <td style="text-align:center;">
                    <button type="button" onclick="window.removerProdutoForm(${idx})" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:bold; font-size:14px;">✕</button>
                </td>
            </tr>
        `).join('');
    }

    window.removerProdutoForm = (idx) => {
        formProdutos.splice(idx, 1);
        renderizarTabelaFormProdutos();
        recalcularTotaisFormulario();
    };

    // =====================================================
    // 13. CÁLCULO DE TOTAIS E HORÁRIO ESTIMADO
    // =====================================================
    function recalcularTotaisFormulario() {
        const subtotalServicos = formServicos.reduce((acc, s) => acc + Number(s.valor || 0), 0);
        const subtotalProdutos = formProdutos.reduce((acc, p) => acc + Number(p.total || 0), 0);
        const subtotalGeral = subtotalServicos + subtotalProdutos;

        const tipoDesc = document.getElementById('modalTipoDesconto')?.value || 'fixo';
        const valorDescInput = parseFloat(document.getElementById('modalValorDesconto')?.value) || 0;

        let valorDescontoReal = 0;
        if (tipoDesc === 'porcentagem') {
            valorDescontoReal = (subtotalGeral * valorDescInput) / 100;
        } else {
            valorDescontoReal = valorDescInput;
        }

        if (valorDescontoReal > subtotalGeral) valorDescontoReal = subtotalGeral;

        const totalFinal = subtotalGeral - valorDescontoReal;
        const duracaoTotalMinutos = formServicos.reduce((acc, s) => acc + Number(s.duracao_minutos || 0), 0);

        document.getElementById('resumoSubtotalServicos').textContent = formatarMoeda(subtotalServicos);
        document.getElementById('resumoSubtotalProdutos').textContent = formatarMoeda(subtotalProdutos);
        document.getElementById('resumoDesconto').textContent = `- ${formatarMoeda(valorDescontoReal)}`;
        document.getElementById('resumoTotalGeral').textContent = formatarMoeda(totalFinal);
        document.getElementById('resumoDuracaoTotal').textContent = `${duracaoTotalMinutos} minutos`;
    }

    function ajustarHoraTerminoEstimada() {
        const horaInicioStr = document.getElementById('modalHoraInicio')?.value;
        if (!horaInicioStr) return;

        const duracaoTotal = formServicos.reduce((acc, s) => acc + Number(s.duracao_minutos || 0), 0);
        if (duracaoTotal === 0) return;

        const [h, m] = horaInicioStr.split(':').map(Number);
        const dataTemp = new Date();
        dataTemp.setHours(h, m + duracaoTotal, 0, 0);

        document.getElementById('modalHoraFim').value = obterHoraMinutoStr(dataTemp);
    }

    document.getElementById('modalHoraInicio')?.addEventListener('change', () => {
        ajustarHoraTerminoEstimada();
        validarConflitoHorario();
    });
    document.getElementById('modalData')?.addEventListener('change', validarConflitoHorario);
    document.getElementById('modalProfissionalId')?.addEventListener('change', validarConflitoHorario);
    document.getElementById('modalTipoDesconto')?.addEventListener('change', recalcularTotaisFormulario);
    document.getElementById('modalValorDesconto')?.addEventListener('input', recalcularTotaisFormulario);

    // =====================================================
    // 14. VALIDAÇÃO DE CONFLITO DE HORÁRIOS
    // =====================================================
    function validarConflitoHorario() {
        const boxConflito = document.getElementById('boxConflitoHorario');
        const msgConflito = document.getElementById('msgConflitoHorario');
        if (!boxConflito) return;

        const dataStr = document.getElementById('modalData')?.value;
        const horaInicioStr = document.getElementById('modalHoraInicio')?.value;
        const profId = parseInt(document.getElementById('modalProfissionalId')?.value);

        if (!dataStr || !horaInicioStr || !profId) {
            boxConflito.style.display = 'none';
            return;
        }

        const duracaoMinutos = formServicos.reduce((acc, s) => acc + Number(s.duracao_minutos || 0), 0) || 40;

        // Início e Fim do Agendamento que está sendo criado
        const [h, m] = horaInicioStr.split(':').map(Number);
        const [ano, mes, dia] = dataStr.split('-').map(Number);

        const inicioProposto = new Date(ano, mes - 1, dia, h, m, 0).getTime();
        const fimProposto = inicioProposto + (duracaoMinutos * 60 * 1000);

        // Procurar colisão com outros agendamentos do mesmo profissional
        const conflito = agendamentos.find(a => {
            if (currentAppointmentId && a.id === currentAppointmentId) return false;
            if (a.status === 'cancelado' || a.status === 'nao_compareceu') return false;
            if (a.profissional_id !== profId) return false;

            const aInicio = new Date(a.data_hora).getTime();
            const aDuracao = a.duracao_minutos || 40;
            const aFim = a.data_hora_fim ? new Date(a.data_hora_fim).getTime() : aInicio + (aDuracao * 60 * 1000);

            // Sobreposição de intervalos: (StartA < EndB) and (EndA > StartB)
            return (inicioProposto < aFim) && (fimProposto > aInicio);
        });

        if (conflito) {
            const cli = clientes.find(c => c.id === conflito.cliente_id);
            const dInicio = new Date(conflito.data_hora);
            const horaConflito = obterHoraMinutoStr(dInicio);

            msgConflito.innerHTML = `<strong>Atenção:</strong> Este profissional já possui um agendamento neste horário com <strong>${cli?.nome || 'outro cliente'}</strong> às <strong>${horaConflito}</strong>!`;
            boxConflito.style.display = 'flex';
        } else {
            boxConflito.style.display = 'none';
        }
    }

    // =====================================================
    // 15. SALVAR AGENDAMENTO (CREATE / UPDATE)
    // =====================================================
    async function salvarAgendamentoMaster() {
        const clienteId = parseInt(document.getElementById('modalClienteId').value);
        const dataStr = document.getElementById('modalData').value;
        const horaInicioStr = document.getElementById('modalHoraInicio').value;
        const horaFimStr = document.getElementById('modalHoraFim').value;
        const profissionalId = parseInt(document.getElementById('modalProfissionalId').value);
        const status = document.getElementById('modalStatus').value || 'agendado';
        const observacoes = document.getElementById('modalObservacoes').value.trim();

        if (!clienteId || !dataStr || !horaInicioStr || !profissionalId) {
            mostrarNotificacao('Preencha os campos obrigatórios (Cliente, Data, Hora e Profissional)!', 'error');
            return;
        }

        if (formServicos.length === 0) {
            mostrarNotificacao('Adicione pelo menos 1 serviço ao agendamento!', 'warning');
            return;
        }

        const [ano, mes, dia] = dataStr.split('-').map(Number);
        const [h, m] = horaInicioStr.split(':').map(Number);
        const dataHoraInicio = new Date(ano, mes - 1, dia, h, m, 0);

        let dataHoraFim = null;
        if (horaFimStr) {
            const [hf, mf] = horaFimStr.split(':').map(Number);
            dataHoraFim = new Date(ano, mes - 1, dia, hf, mf, 0);
        } else {
            const dur = formServicos.reduce((acc, s) => acc + Number(s.duracao_minutos || 0), 0);
            dataHoraFim = new Date(dataHoraInicio.getTime() + (dur * 60 * 1000));
        }

        const subtotalServicos = formServicos.reduce((acc, s) => acc + Number(s.valor || 0), 0);
        const subtotalProdutos = formProdutos.reduce((acc, p) => acc + Number(p.total || 0), 0);
        const subtotal = subtotalServicos + subtotalProdutos;

        const tipoDesc = document.getElementById('modalTipoDesconto').value;
        const descInput = parseFloat(document.getElementById('modalValorDesconto').value) || 0;
        let valorDesconto = tipoDesc === 'porcentagem' ? (subtotal * descInput) / 100 : descInput;
        if (valorDesconto > subtotal) valorDesconto = subtotal;

        const totalFinal = subtotal - valorDesconto;
        const duracaoTotal = formServicos.reduce((acc, s) => acc + Number(s.duracao_minutos || 0), 0);

        const formaPagamento = document.getElementById('modalFormaPagamento').value;
        const statusPagamento = document.getElementById('modalStatusPagamento').value;
        const valorPago = statusPagamento === 'pago' ? totalFinal : 0;
        const valorPendente = totalFinal - valorPago;

        const timestampAgora = new Date().toISOString();
        const registroHistorico = {
            data: timestampAgora,
            usuario: usuario.nome || 'Administrador',
            acao: currentAppointmentId ? 'Alteração de agendamento' : 'Criação do agendamento',
            status: status,
            observacao: observacoes || 'Agendamento registrado no sistema'
        };

        const dadosAgendamento = {
            loja_id: usuario.loja_id || 1,
            cliente_id: clienteId,
            servico_id: formServicos[0].id, // compatibilidade com schema legado
            profissional_id: profissionalId,
            usuario_id: usuario.id,
            data_hora: dataHoraInicio.toISOString(),
            data_hora_fim: dataHoraFim.toISOString(),
            duracao_minutos: duracaoTotal,
            servicos: formServicos,
            produtos: formProdutos,
            subtotal: subtotal,
            desconto: valorDesconto,
            desconto_tipo: tipoDesc,
            total: totalFinal,
            valor: totalFinal, // compatibilidade com schema legado
            status: status,
            forma_pagamento: formaPagamento,
            status_pagamento: statusPagamento,
            valor_pago: valorPago,
            valor_pendente: valorPendente,
            observacoes: observacoes,
            updated_at: timestampAgora
        };

        const btnSalvar = document.getElementById('btnSalvarAgendamentoMaster');
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'Salvando...';

        try {
            if (currentAppointmentId) {
                // Recuperar histórico existente para dar append
                const agExistente = agendamentos.find(a => a.id === currentAppointmentId);
                const historicoExistente = Array.isArray(agExistente?.historico) ? agExistente.historico : [];
                historicoExistente.push(registroHistorico);
                dadosAgendamento.historico = historicoExistente;

                const { error } = await supabaseClient
                    .from('agendamentos')
                    .update(dadosAgendamento)
                    .eq('id', currentAppointmentId);

                if (error) throw error;
                mostrarNotificacao('Agendamento atualizado com sucesso!', 'success');
            } else {
                dadosAgendamento.historico = [registroHistorico];
                dadosAgendamento.created_at = timestampAgora;

                const { error } = await supabaseClient
                    .from('agendamentos')
                    .insert([dadosAgendamento]);

                if (error) throw error;
                mostrarNotificacao('Agendamento cadastrado com sucesso!', 'success');
            }

            document.getElementById('modalAgendamento').style.display = 'none';
            await carregarAgendamentos();

        } catch (error) {
            console.error('Erro ao salvar agendamento:', error);
            mostrarNotificacao('Erro ao salvar agendamento', 'error');
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = 'Salvar Agendamento';
        }
    }

    document.getElementById('btnSalvarAgendamentoMaster')?.addEventListener('click', salvarAgendamentoMaster);

    // =====================================================
    // 16. MODAL DETALHES, AUDITORIA & HISTÓRICO
    // =====================================================
    window.abrirDetalhesAgendamento = (id) => {
        const a = agendamentos.find(item => item.id === id);
        if (!a) return;

        currentAppointmentId = a.id;
        const cliente = clientes.find(c => c.id === a.cliente_id);
        const prof = profissionais.find(p => p.id === a.profissional_id);
        const meta = statusMeta[a.status] || { label: a.status, class: 'status-agendado' };

        document.getElementById('detalhesHeaderTitle').textContent = `Atendimento #${a.id}`;
        const badge = document.getElementById('detalhesStatusBadge');
        badge.className = `status-badge ${meta.class}`;
        badge.textContent = meta.label;

        // Cliente
        document.getElementById('detClienteNome').textContent = cliente?.nome || 'Não informado';
        document.getElementById('detClienteTelefone').textContent = `Telefone: ${cliente?.telefone || 'Sem telefone cadastrado'}`;

        // Horário e Profissional
        const d = new Date(a.data_hora);
        const dataExt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        const hInicio = obterHoraMinutoStr(d);
        const hFim = a.data_hora_fim ? obterHoraMinutoStr(new Date(a.data_hora_fim)) : '';
        document.getElementById('detDataHoraStr').textContent = `📅 ${dataExt} • ${hInicio}${hFim ? ` às ${hFim}` : ''}`;
        document.getElementById('detProfissionalNome').textContent = `Profissional: ${prof?.nome || 'Não definido'}`;
        document.getElementById('detDuracaoEstimada').textContent = `Duração: ${a.duracao_minutos || 40} minutos`;

        // Renderizar Itens (Serviços e Produtos)
        let itensHtml = '<table class="items-table"><thead><tr><th>Item</th><th>Tipo</th><th>Qtd</th><th>Valor Total</th></tr></thead><tbody>';
        
        const servs = Array.isArray(a.servicos) ? a.servicos : [];
        servs.forEach(s => {
            itensHtml += `<tr><td><strong>✂️ ${s.nome}</strong></td><td>Serviço</td><td>1</td><td>${formatarMoeda(s.valor)}</td></tr>`;
        });

        const prods = Array.isArray(a.produtos) ? a.produtos : [];
        prods.forEach(p => {
            itensHtml += `<tr><td><strong>🧴 ${p.nome}</strong></td><td>Produto</td><td>${p.quantidade || 1}</td><td>${formatarMoeda(p.total || p.valor_unitario)}</td></tr>`;
        });

        const totalGeral = Number(a.total || a.valor || 0);
        itensHtml += `</tbody><tfoot>
            <tr style="background:#f8fafc; font-weight:bold;">
                <td colspan="3">Total do Atendimento</td>
                <td>${formatarMoeda(totalGeral)}</td>
            </tr>
        </tfoot></table>`;
        document.getElementById('detItensTabelaWrapper').innerHTML = itensHtml;

        // Observações Técnicas
        document.getElementById('detObservacoesTecnicas').value = a.observacoes_atendimento || '';

        // Botões de Transição Rápida de Status
        const containerBtns = document.getElementById('botoesFluxoStatus');
        const botoesPossiveis = [
            { status: 'agendado', label: '⏳ Agendado', class: 'btn-secondary' },
            { status: 'confirmado', label: '👍 Confirmar', class: 'btn-primary' },
            { status: 'em_atendimento', label: '✂️ Em Atendimento', class: 'btn-secondary' },
            { status: 'concluido', label: '✅ Concluir Atendimento', class: 'btn-success' },
            { status: 'cancelado', label: '❌ Cancelar', class: 'btn-danger' },
            { status: 'nao_compareceu', label: '👤 Não Compareceu', class: 'btn-secondary' }
        ];

        containerBtns.innerHTML = botoesPossiveis.map(b => {
            const isAtual = a.status === b.status;
            return `
                <button type="button" class="${b.class}" ${isAtual ? 'disabled style="opacity:0.5;"' : ''} onclick="window.transicionarStatusAgendamento(${a.id}, '${b.status}')" style="padding:6px 12px; font-size:12px; border-radius:6px; font-weight:700;">
                    ${b.label} ${isAtual ? '(Atual)' : ''}
                </button>
            `;
        }).join('');

        // Linha do Tempo de Auditoria (Tab 2)
        const timelineContainer = document.getElementById('auditTimelineContainer');
        const historico = Array.isArray(a.historico) ? a.historico : [];
        if (historico.length === 0) {
            timelineContainer.innerHTML = '<div style="color:var(--gray); padding:10px 0;">Nenhum registro de auditoria.</div>';
        } else {
            timelineContainer.innerHTML = historico.map(h => {
                const dataHist = new Date(h.data).toLocaleString('pt-BR');
                return `
                    <div class="audit-item">
                        <div class="audit-date">📅 ${dataHist} • Por: <strong>${h.usuario || 'Sistema'}</strong></div>
                        <div class="audit-text"><strong>${h.acao}:</strong> ${h.observacao || ''}</div>
                    </div>
                `;
            }).join('');
        }

        // Ficha do Cliente (Tab 3)
        carregarFichaClienteDetalhes(a.cliente_id);

        // Exibir Modal
        document.getElementById('modalDetalhesAgendamento').style.display = 'flex';
    };

    function carregarFichaClienteDetalhes(clienteId) {
        if (!clienteId) return;
        const atendimentosCli = agendamentos.filter(a => a.cliente_id === clienteId);
        const concluidos = atendimentosCli.filter(a => a.status === 'concluido');

        const totalGasto = concluidos.reduce((acc, curr) => acc + Number(curr.total || curr.valor || 0), 0);
        document.getElementById('cliFichaTotalAtend').textContent = atendimentosCli.length;
        document.getElementById('cliFichaTotalGasto').textContent = formatarMoeda(totalGasto);

        // Descobrir serviço favorito
        const servicosContagem = {};
        atendimentosCli.forEach(a => {
            if (Array.isArray(a.servicos)) {
                a.servicos.forEach(s => {
                    servicosContagem[s.nome] = (servicosContagem[s.nome] || 0) + 1;
                });
            }
        });

        let servicoFav = 'Nenhum';
        let maxVezes = 0;
        for (const [nome, qtd] of Object.entries(servicosContagem)) {
            if (qtd > maxVezes) {
                maxVezes = qtd;
                servicoFav = nome;
            }
        }
        document.getElementById('cliFichaServicoFavorito').textContent = servicoFav;

        // Tabela de Histórico
        const wrapper = document.getElementById('cliHistoricoTabelaWrapper');
        if (atendimentosCli.length === 0) {
            wrapper.innerHTML = '<div style="color:var(--gray);">Nenhum atendimento anterior.</div>';
            return;
        }

        wrapper.innerHTML = `
            <table class="items-table">
                <thead>
                    <tr><th>Data</th><th>Profissional</th><th>Serviços</th><th>Status</th><th>Valor</th></tr>
                </thead>
                <tbody>
                    ${atendimentosCli.map(a => {
                        const dStr = new Date(a.data_hora).toLocaleDateString('pt-BR');
                        const p = profissionais.find(x => x.id === a.profissional_id);
                        const sNomes = (a.servicos || []).map(s => s.nome).join(', ') || 'Serviço';
                        const meta = statusMeta[a.status] || { label: a.status, class: 'status-agendado' };
                        return `
                            <tr>
                                <td>${dStr}</td>
                                <td>${p?.nome || '-'}</td>
                                <td>${sNomes}</td>
                                <td><span class="status-badge ${meta.class}">${meta.label}</span></td>
                                <td><strong>${formatarMoeda(a.total || a.valor)}</strong></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    // =====================================================
    // 17. TRANSIÇÃO DE STATUS COM AUDITORIA E BAIXA DE ESTOQUE
    // =====================================================
    window.transicionarStatusAgendamento = async (id, novoStatus) => {
        const a = agendamentos.find(item => item.id === id);
        if (!a) return;

        const statusAnterior = a.status;
        const timestampAgora = new Date().toISOString();

        const novoRegistroHistorico = {
            data: timestampAgora,
            usuario: usuario.nome || 'Administrador',
            acao: 'Alteração de Status',
            de_status: statusAnterior,
            para_status: novoStatus,
            observacao: `Status alterado de "${statusAnterior}" para "${novoStatus}"`
        };

        let historicoAtual = [];
        if (Array.isArray(a.historico)) {
            historicoAtual = [...a.historico];
        } else if (typeof a.historico === 'string') {
            try {
                historicoAtual = JSON.parse(a.historico) || [];
            } catch (_) {
                historicoAtual = [];
            }
        }
        historicoAtual.push(novoRegistroHistorico);

        try {
            const updatePayload = {
                status: novoStatus,
                historico: historicoAtual,
                updated_at: timestampAgora
            };

            // Se for concluído, marcar como pago integral caso ainda esteja pendente
            if (novoStatus === 'concluido' && a.status_pagamento !== 'pago') {
                updatePayload.status_pagamento = 'pago';
                updatePayload.valor_pago = Number(a.total || a.valor || 0);
                updatePayload.valor_pendente = 0;
            }

            const { error } = await supabaseClient
                .from('agendamentos')
                .update(updatePayload)
                .eq('id', id);

            if (error) throw error;

            // Se for concluído e possuir produtos, baixar estoque
            if (novoStatus === 'concluido' && Array.isArray(a.produtos) && a.produtos.length > 0) {
                await baixarEstoqueProdutosAgendamento(a.produtos, a.id);
            }

            mostrarNotificacao(`Status atualizado para "${statusMeta[novoStatus]?.label || novoStatus}"!`, 'success');
            await carregarAgendamentos();

            // Atualizar modal de detalhes se estiver aberto
            window.abrirDetalhesAgendamento(id);

        } catch (error) {
            console.error('Erro ao transicionar status:', error);
            mostrarNotificacao(`Erro ao alterar status do atendimento: ${error.message || error.detail || ''}`, 'error');
        }
    };

    async function baixarEstoqueProdutosAgendamento(produtos, agendamentoId) {
        try {
            for (const item of produtos) {
                if (!item.id || !item.quantidade) continue;

                // Buscar produto atual
                const { data: pData } = await supabaseClient
                    .from('produtos')
                    .select('id, estoque_total')
                    .eq('id', item.id)
                    .single();

                if (pData) {
                    const estoqueAnt = Number(pData.estoque_total) || 0;
                    const qtdBaixa = Number(item.quantidade) || 0;
                    const novoEstoque = Math.max(0, estoqueAnt - qtdBaixa);
                    await supabaseClient
                        .from('produtos')
                        .update({ estoque_total: novoEstoque })
                        .eq('id', item.id);

                    // Registrar movimento de estoque
                    await supabaseClient
                        .from('movimentos_estoque')
                        .insert([{
                            loja_id: usuario.loja_id || 1,
                            produto_id: item.id,
                            tipo: 'saida',
                            quantidade: qtdBaixa,
                            quantidade_anterior: estoqueAnt,
                            quantidade_nova: novoEstoque,
                            motivo: `Agendamento #${agendamentoId}`,
                            data: new Date().toISOString(),
                            usuario_id: usuario.id || null
                        }]);
                }
            }
        } catch (err) {
            console.warn('Aviso: Falha ao baixar estoque de produtos utilizados no agendamento:', err);
        }
    }

    // Salvar Notas Técnicas
    document.getElementById('btnSalvarNotasTecnicas')?.addEventListener('click', async () => {
        if (!currentAppointmentId) return;
        const nota = document.getElementById('detObservacoesTecnicas').value.trim();

        try {
            const { error } = await supabaseClient
                .from('agendamentos')
                .update({ observacoes_atendimento: nota, updated_at: new Date().toISOString() })
                .eq('id', currentAppointmentId);

            if (error) throw error;
            mostrarNotificacao('Notas técnicas salvas com sucesso!', 'success');
            await carregarAgendamentos();
        } catch (e) {
            console.error('Erro ao salvar nota técnica:', e);
            mostrarNotificacao('Erro ao salvar nota técnica', 'error');
        }
    });

    // =====================================================
    // 18. INTEGRAÇÃO WHATSAPP (CONFIRMAÇÃO / LEMBRETE)
    // =====================================================
    window.abrirWhatsappConfirmacao = (id) => {
        const a = agendamentos.find(item => item.id === id);
        if (!a) return;

        const cliente = clientes.find(c => c.id === a.cliente_id);
        if (!cliente || !cliente.telefone) {
            mostrarNotificacao('Cliente não possui telefone cadastrado para WhatsApp!', 'warning');
            return;
        }

        const prof = profissionais.find(p => p.id === a.profissional_id);
        const d = new Date(a.data_hora);
        const dataFormatada = d.toLocaleDateString('pt-BR');
        const horaFormatada = obterHoraMinutoStr(d);

        let servicosNomes = 'Atendimento';
        if (Array.isArray(a.servicos) && a.servicos.length > 0) {
            servicosNomes = a.servicos.map(s => s.nome).join(', ');
        }

        const nomeEmpresa = window.getCompanyName ? window.getCompanyName() : 'Aion ERP';
        const valorFormatado = formatarMoeda(a.total || a.valor);

        const mensagem = `Olá, *${cliente.nome}*! 👋\n\n` +
            `Passando para confirmar seu atendimento na *${nomeEmpresa}*:\n` +
            `📅 *Data:* ${dataFormatada} às *${horaFormatada}*\n` +
            `💇 *Serviço(s):* ${servicosNomes}\n` +
            `👤 *Profissional:* ${prof?.nome || 'Equipe'}\n` +
            `💰 *Valor previsto:* ${valorFormatado}\n\n` +
            `Aguardamos você com muito carinho! Qualquer imprevisto, é só nos avisar por aqui. ✨`;

        const foneLimpo = cliente.telefone.replace(/\D/g, '');
        const foneFinal = foneLimpo.startsWith('55') ? foneLimpo : `55${foneLimpo}`;
        const urlWa = `https://wa.me/${foneFinal}?text=${encodeURIComponent(mensagem)}`;

        window.open(urlWa, '_blank');
    };

    document.getElementById('btnWhatsappConfirmar')?.addEventListener('click', () => {
        if (currentAppointmentId) window.abrirWhatsappConfirmacao(currentAppointmentId);
    });

    // =====================================================
    // 19. CHECKOUT NO CAIXA / PDV (saidas.html)
    // =====================================================
    document.getElementById('btnEnviarAoPDV')?.addEventListener('click', () => {
        const a = agendamentos.find(item => item.id === currentAppointmentId);
        if (!a) return;

        const cliente = clientes.find(c => c.id === a.cliente_id);

        let servicosList = Array.isArray(a.servicos) ? a.servicos : [];
        if (servicosList.length === 0 && a.servico_id) {
            const servProd = servicos.find(s => s.id === a.servico_id) || produtos.find(p => p.id === a.servico_id);
            servicosList = [{
                id: a.servico_id,
                nome: servProd?.nome || 'Serviço Agendado',
                codigo: servProd?.codigo || `SRV-${a.servico_id}`,
                valor: Number(a.valor || 0),
                duracao_minutos: a.duracao_minutos || 60
            }];
        }

        const produtosList = Array.isArray(a.produtos) ? a.produtos : [];
        const primeiroServico = servicosList[0] || {};

        sessionStorage.setItem('checkout_agendamento', JSON.stringify({
            agendamento_id: a.id,
            cliente_id: a.cliente_id,
            cliente_nome: cliente?.nome || 'Cliente Agendamento',
            servicos: servicosList,
            produtos: produtosList,
            servico_id: primeiroServico.id || a.servico_id || null,
            servico_nome: primeiroServico.nome || 'Serviço do Agendamento',
            codigo: primeiroServico.codigo || (primeiroServico.id ? `SRV-${primeiroServico.id}` : 'SRV-01'),
            valor: Number(a.total || a.valor || 0),
            desconto: Number(a.desconto || 0),
            total: Number(a.total || a.valor || 0),
            profissional_id: a.profissional_id
        }));

        window.location.href = 'saidas.html';
    });

    // =====================================================
    // 20. MODAL RELATÓRIOS DA AGENDA
    // =====================================================
    document.getElementById('btnAbrirRelatorios')?.addEventListener('click', () => {
        gerarRelatorioAgenda();
        document.getElementById('modalRelatoriosAgenda').style.display = 'flex';
    });

    document.getElementById('relFiltroPeriodo')?.addEventListener('change', gerarRelatorioAgenda);

    function gerarRelatorioAgenda() {
        const periodo = document.getElementById('relFiltroPeriodo')?.value || 'este_mes';
        const agora = new Date();
        const anoAtual = agora.getFullYear();
        const mesAtual = agora.getMonth();

        const filtradosRel = agendamentos.filter(a => {
            if (!a.data_hora) return false;
            const d = new Date(a.data_hora);
            if (periodo === 'hoje') {
                return obterDataIsoStr(d) === obterDataIsoStr(agora);
            } else if (periodo === 'esta_semana') {
                const seg = obterPrimeiroDiaSemana(agora);
                const dom = new Date(seg);
                dom.setDate(seg.getDate() + 6);
                return d >= seg && d <= dom;
            } else if (periodo === 'este_mes') {
                return d.getFullYear() === anoAtual && d.getMonth() === mesAtual;
            }
            return true; // 'tudo'
        });

        const totalAtendimentos = filtradosRel.length;
        const concluidos = filtradosRel.filter(a => a.status === 'concluido');
        const cancelados = filtradosRel.filter(a => a.status === 'cancelado' || a.status === 'nao_compareceu');
        const taxaComparecimento = totalAtendimentos > 0 ? ((concluidos.length / totalAtendimentos) * 100).toFixed(0) : 0;
        const faturamentoTotal = concluidos.reduce((acc, curr) => acc + Number(curr.total || curr.valor || 0), 0);

        // Métricas
        document.getElementById('relMetricasGrid').innerHTML = `
            <div class="kpi-card">
                <div class="kpi-card-title">Total de Atendimentos</div>
                <div class="kpi-card-value">${totalAtendimentos}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-card-title">Concluídos com Sucesso</div>
                <div class="kpi-card-value" style="color:var(--color-concluido);">${concluidos.length}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-card-title">Taxa de Presença</div>
                <div class="kpi-card-value" style="color:var(--color-confirmado);">${taxaComparecimento}%</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-card-title">Faturamento Concluído</div>
                <div class="kpi-card-value" style="color:var(--carbon-black);">${formatarMoeda(faturamentoTotal)}</div>
            </div>
        `;

        // Faturamento por Serviço
        const servicosMap = {};
        filtradosRel.forEach(a => {
            if (Array.isArray(a.servicos)) {
                a.servicos.forEach(s => {
                    if (!servicosMap[s.nome]) servicosMap[s.nome] = { qtd: 0, total: 0 };
                    servicosMap[s.nome].qtd++;
                    servicosMap[s.nome].total += Number(s.valor || 0);
                });
            }
        });

        const servicosArr = Object.entries(servicosMap).sort((a,b) => b[1].total - a[1].total);
        document.getElementById('relTabelaServicosWrapper').innerHTML = servicosArr.length === 0 ? '<div style="color:var(--gray);">Nenhum serviço no período.</div>' : `
            <table class="items-table">
                <thead><tr><th>Serviço</th><th>Qtd Realizada</th><th>Faturamento Gerado</th></tr></thead>
                <tbody>
                    ${servicosArr.map(([nome, dados]) => `
                        <tr><td><strong>${nome}</strong></td><td>${dados.qtd}</td><td>${formatarMoeda(dados.total)}</td></tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Faturamento por Profissional
        const profMap = {};
        filtradosRel.forEach(a => {
            const p = profissionais.find(x => x.id === a.profissional_id);
            const pNome = p?.nome || 'Outro Profissional';
            if (!profMap[pNome]) profMap[pNome] = { atendimentos: 0, total: 0, comissao: p?.comissao || 0 };
            profMap[pNome].atendimentos++;
            profMap[pNome].total += Number(a.total || a.valor || 0);
        });

        const profArr = Object.entries(profMap).sort((a,b) => b[1].total - a[1].total);
        document.getElementById('relTabelaProfissionaisWrapper').innerHTML = profArr.length === 0 ? '<div style="color:var(--gray);">Nenhum profissional no período.</div>' : `
            <table class="items-table">
                <thead><tr><th>Profissional</th><th>Atendimentos</th><th>Faturamento</th><th>Comissão Estimada</th></tr></thead>
                <tbody>
                    ${profArr.map(([nome, dados]) => {
                        const comissaoVal = (dados.total * dados.comissao) / 100;
                        return `
                            <tr>
                                <td><strong>${nome}</strong></td>
                                <td>${dados.atendimentos}</td>
                                <td>${formatarMoeda(dados.total)}</td>
                                <td style="color:var(--color-concluido); font-weight:700;">${formatarMoeda(comissaoVal)} (${dados.comissao}%)</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        // Produtos Utilizados
        const prodMap = {};
        filtradosRel.forEach(a => {
            if (Array.isArray(a.produtos)) {
                a.produtos.forEach(p => {
                    if (!prodMap[p.nome]) prodMap[p.nome] = { qtd: 0, total: 0 };
                    prodMap[p.nome].qtd += Number(p.quantidade || 1);
                    prodMap[p.nome].total += Number(p.total || p.valor_unitario || 0);
                });
            }
        });

        const prodArr = Object.entries(prodMap).sort((a,b) => b[1].qtd - a[1].qtd);
        document.getElementById('relTabelaProdutosWrapper').innerHTML = prodArr.length === 0 ? '<div style="color:var(--gray);">Nenhum produto utilizado no período.</div>' : `
            <table class="items-table">
                <thead><tr><th>Produto</th><th>Quantidade</th><th>Total Vendido / Consumido</th></tr></thead>
                <tbody>
                    ${prodArr.map(([nome, dados]) => `
                        <tr><td><strong>${nome}</strong></td><td>${dados.qtd} un</td><td>${formatarMoeda(dados.total)}</td></tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    document.getElementById('btnImprimirRelatorio')?.addEventListener('click', () => {
        window.print();
    });

    // =====================================================
    // 21. CADASTROS RÁPIDOS (CLIENTE, SERVIÇO, PROFISSIONAL)
    // =====================================================
    // Modal Novo Cliente
    document.getElementById('btnQuickNovoCliente')?.addEventListener('click', () => {
        document.getElementById('formQuickCliente').reset();
        document.getElementById('modalQuickCliente').style.display = 'flex';
    });
    document.getElementById('closeQuickCliente')?.addEventListener('click', () => document.getElementById('modalQuickCliente').style.display = 'none');
    document.getElementById('btnCancelarQuickCliente')?.addEventListener('click', () => document.getElementById('modalQuickCliente').style.display = 'none');

    document.getElementById('btnSalvarQuickCliente')?.addEventListener('click', async () => {
        const nome = document.getElementById('qcNome').value.trim();
        const telefone = document.getElementById('qcTelefone').value.trim();
        const cpf = document.getElementById('qcCpf').value.trim();
        const email = document.getElementById('qcEmail').value.trim();

        if (!nome || !telefone) {
            mostrarNotificacao('Nome e Telefone são obrigatórios!', 'error');
            return;
        }

        try {
            const { data, error } = await supabaseClient
                .from('clientes')
                .insert([{
                    loja_id: usuario.loja_id || 1,
                    nome: nome,
                    telefone: telefone,
                    cpf_cnpj: cpf,
                    email: email,
                    tipo: 'cliente',
                    ativo: true
                }])
                .select();

            if (error) throw error;
            const novoCli = (data && data[0]) ? data[0] : { id: Date.now(), nome: nome, telefone: telefone, cpf_cnpj: cpf };
            clientes.push(novoCli);

            // Adicionar ao select e selecionar
            const selectCli = document.getElementById('modalClienteId');
            if (selectCli) {
                const opt = new Option(`${novoCli.nome} (${novoCli.telefone})`, novoCli.id, true, true);
                selectCli.add(opt);
                atualizarPreviewCliente(novoCli.id);
            }

            mostrarNotificacao('Cliente cadastrado com sucesso!', 'success');
            document.getElementById('modalQuickCliente').style.display = 'none';

        } catch (e) {
            console.error('Erro ao cadastrar cliente rápido:', e);
            mostrarNotificacao('Erro ao cadastrar cliente', 'error');
        }
    });

    // Modal Novo Serviço
    document.getElementById('btnQuickNovoServico')?.addEventListener('click', () => {
        document.getElementById('formQuickServico').reset();
        document.getElementById('modalQuickServico').style.display = 'flex';
    });
    document.getElementById('closeQuickServico')?.addEventListener('click', () => document.getElementById('modalQuickServico').style.display = 'none');
    document.getElementById('btnCancelarQuickServico')?.addEventListener('click', () => document.getElementById('modalQuickServico').style.display = 'none');

    document.getElementById('btnSalvarQuickServico')?.addEventListener('click', async () => {
        const nome = document.getElementById('qsNome').value.trim();
        const valor = parseFloat(document.getElementById('qsValor').value) || 0;
        const duracao = parseInt(document.getElementById('qsDuracao').value) || 45;
        const categoria = document.getElementById('qsCategoria').value.trim() || 'Serviços';

        if (!nome || valor <= 0) {
            mostrarNotificacao('Informe o nome e um valor válido para o serviço!', 'error');
            return;
        }

        const btn = document.getElementById('btnSalvarQuickServico');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const codigoGerado = 'SRV-' + Date.now().toString().slice(-6);
            const payloadServico = {
                loja_id: usuario.loja_id || 1,
                codigo: codigoGerado,
                nome: nome,
                tipo: 'servico',
                categoria: categoria,
                valor_compra: 0,
                valor_venda: valor,
                duracao_minutos: duracao,
                estoque: 0,
                estoque_total: 0,
                ativo: true
            };

            const { data, error } = await supabaseClient
                .from('produtos')
                .insert([payloadServico])
                .select();

            if (error) throw error;
            const novoServ = (data && data[0]) ? data[0] : { id: Date.now(), ...payloadServico };
            servicosCatalogo.push(novoServ);

            // Atualizar select do catálogo e selecionar o novo serviço
            popularSelectsFiltrosEForm();
            const selectServ = document.getElementById('selectAdicionarServico');
            if (selectServ) {
                selectServ.value = novoServ.id;
            }

            mostrarNotificacao('Serviço cadastrado com sucesso!', 'success');
            document.getElementById('modalQuickServico').style.display = 'none';

        } catch (e) {
            console.error('Erro ao cadastrar serviço rápido:', e);
            mostrarNotificacao(`Erro ao cadastrar serviço: ${e.message || 'Verifique os dados'}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar Serviço';
        }
    });

    // Modal Novo Profissional
    document.getElementById('btnQuickNovoProf')?.addEventListener('click', () => {
        document.getElementById('formQuickProf').reset();
        document.getElementById('modalQuickProfissional').style.display = 'flex';
    });
    document.getElementById('closeQuickProf')?.addEventListener('click', () => document.getElementById('modalQuickProfissional').style.display = 'none');
    document.getElementById('btnCancelarQuickProf')?.addEventListener('click', () => document.getElementById('modalQuickProfissional').style.display = 'none');

    document.getElementById('btnSalvarQuickProf')?.addEventListener('click', async () => {
        const nome = document.getElementById('qpNome').value.trim();
        const sobrenome = document.getElementById('qpSobrenome').value.trim();
        const telefone = document.getElementById('qpTelefone').value.trim();
        const comissao = parseFloat(document.getElementById('qpComissao').value) || 0;
        const funcao = document.getElementById('qpFuncao').value.trim() || 'Profissional';

        if (!nome) {
            mostrarNotificacao('O nome do profissional é obrigatório!', 'error');
            return;
        }

        try {
            const { data, error } = await supabaseClient
                .from('colaboradores')
                .insert([{
                    loja_id: usuario.loja_id || 1,
                    nome: nome,
                    sobrenome: sobrenome,
                    telefone: telefone,
                    comissao: comissao,
                    funcao: funcao,
                    ativo: true
                }])
                .select();

            if (error) throw error;
            const novoProf = (data && data[0]) ? data[0] : { id: Date.now(), nome: nome, sobrenome: sobrenome, funcao: funcao, comissao: comissao };
            profissionais.push({
                id: novoProf.id,
                nome: `${novoProf.nome} ${novoProf.sobrenome || ''}`.trim(),
                funcao: novoProf.funcao,
                comissao: novoProf.comissao
            });

            // Atualizar selects de profissional
            popularSelectsFiltrosEForm();
            document.getElementById('modalProfissionalId').value = novoProf.id;

            mostrarNotificacao('Profissional cadastrado com sucesso!', 'success');
            document.getElementById('modalQuickProfissional').style.display = 'none';

        } catch (e) {
            console.error('Erro ao cadastrar profissional rápido:', e);
            mostrarNotificacao('Erro ao cadastrar profissional', 'error');
        }
    });

    // Botão de Cadastros Rápidos no Header
    document.getElementById('btnConfigurarCatalogo')?.addEventListener('click', () => {
        document.getElementById('formQuickServico').reset();
        document.getElementById('modalQuickServico').style.display = 'flex';
    });

    // =====================================================
    // 22. EVENTOS DE FECHAMENTO DE MODAL E TABS
    // =====================================================
    document.getElementById('btnNovoAgendamento')?.addEventListener('click', () => {
        window.abrirModalNovoAgendamento();
    });

    document.getElementById('closeModalAgendamento')?.addEventListener('click', () => {
        document.getElementById('modalAgendamento').style.display = 'none';
    });
    document.getElementById('btnCancelarModalAgendamento')?.addEventListener('click', () => {
        document.getElementById('modalAgendamento').style.display = 'none';
    });

    document.getElementById('closeModalDetalhes')?.addEventListener('click', () => {
        document.getElementById('modalDetalhesAgendamento').style.display = 'none';
    });
    document.getElementById('btnFecharModalDetalhes')?.addEventListener('click', () => {
        document.getElementById('modalDetalhesAgendamento').style.display = 'none';
    });

    document.getElementById('closeModalRelatorios')?.addEventListener('click', () => {
        document.getElementById('modalRelatoriosAgenda').style.display = 'none';
    });
    document.getElementById('btnFecharRelatorios')?.addEventListener('click', () => {
        document.getElementById('modalRelatoriosAgenda').style.display = 'none';
    });

    document.getElementById('btnEditarAgendamentoModal')?.addEventListener('click', () => {
        if (currentAppointmentId) window.editarAgendamentoCompleto(currentAppointmentId);
    });

    document.getElementById('btnExcluirOuCancelarAtendimento')?.addEventListener('click', () => {
        if (!currentAppointmentId) return;
        if (confirm('Tem certeza de que deseja cancelar este agendamento?')) {
            window.transicionarStatusAgendamento(currentAppointmentId, 'cancelado');
        }
    });

    // Tabs do Modal de Detalhes
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.detalhes-tab-pane').forEach(p => p.style.display = 'none');

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const pane = document.getElementById(targetId);
            if (pane) pane.style.display = 'block';
        });
    });

    // Botões de Switcher de Visualização
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.getAttribute('data-view');
            alternarVisualizacao(v);
        });
    });

    // Navegação de Datas
    document.getElementById('btnPrevDate')?.addEventListener('click', () => navegarData(-1));
    document.getElementById('btnNextDate')?.addEventListener('click', () => navegarData(1));
    document.getElementById('btnTodayDate')?.addEventListener('click', irParaHoje);
    
    document.getElementById('filtroDataPrincipal')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
            const [ano, mes, dia] = val.split('-').map(Number);
            currentDate = new Date(ano, mes - 1, dia);
            atualizarLabelDataPrincipal();
            renderizarVisualizacaoAtual();
        }
    });

    // Filtros
    document.getElementById('filtroBuscaGeral')?.addEventListener('input', renderizarVisualizacaoAtual);
    document.getElementById('filtroProfissional')?.addEventListener('change', renderizarVisualizacaoAtual);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarVisualizacaoAtual);
    document.getElementById('btnLimparFiltros')?.addEventListener('click', () => {
        document.getElementById('filtroBuscaGeral').value = '';
        document.getElementById('filtroProfissional').value = '';
        document.getElementById('filtroStatus').value = '';
        renderizarVisualizacaoAtual();
    });

    // Clique nos Cards de KPI para filtrar status rapidamente
    document.querySelectorAll('.kpi-card[data-filter]').forEach(card => {
        card.addEventListener('click', () => {
            const filtro = card.getAttribute('data-filter');
            if (filtro === 'hoje') {
                irParaHoje();
                alternarVisualizacao('dia');
            } else {
                document.getElementById('filtroStatus').value = filtro;
                renderizarVisualizacaoAtual();
            }
        });
    });

    // INICIALIZAÇÃO
    atualizarLabelDataPrincipal();
    carregarDadosIniciais();
});
