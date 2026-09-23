// js/assinaturas.js
// Monitor de Vendas de Serviços Recorrentes & Assinaturas - Aion ERP

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    if (!verificarPermissao('saidas', 'ver') && !verificarPermissao('produtos', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar o monitor de serviços recorrentes.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }

    // Top Bar Info
    const userNameElement = document.getElementById('userName');
    const userPerfilElement = document.getElementById('userPerfil');
    if (userNameElement) userNameElement.textContent = usuario.nome || 'Usuário';
    if (userPerfilElement) {
        const perfilLabels = {
            admin: '👑 Administrador',
            gerente: '📊 Gerente',
            vendedor: '💰 Vendedor',
            tecnico: '🔧 Técnico',
            basico: '👤 Básico'
        };
        userPerfilElement.textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';
    }

    // Logout & Menu Toggle
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });

    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('open');
    });

    // Estado local
    let assinaturas = [];
    let clientes = [];
    let produtosServicos = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    let isFullscreen = false;

    const fmtMoeda = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    // =====================================================
    // HELPER: CÁLCULO DE DIAS E EXPIRAÇÃO
    // =====================================================
    function calcularExpiraEm(dataVencimentoStr) {
        if (!dataVencimentoStr) {
            return { dias: 0, texto: '-', badgeClass: 'countdown-warning', statusVencimento: 'indefinido' };
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const [ano, mes, dia] = dataVencimentoStr.substring(0, 10).split('-').map(Number);
        const venc = new Date(ano, mes - 1, dia);
        venc.setHours(0, 0, 0, 0);

        const diffMs = venc - hoje;
        const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (diffDias > 5) {
            return {
                dias: diffDias,
                texto: `🟢 Em ${diffDias} dias`,
                badgeClass: 'countdown-ok',
                statusVencimento: 'em_dia'
            };
        } else if (diffDias > 1 && diffDias <= 5) {
            return {
                dias: diffDias,
                texto: `🟡 Em ${diffDias} dias`,
                badgeClass: 'countdown-warning',
                statusVencimento: 'a_vencer'
            };
        } else if (diffDias === 1) {
            return {
                dias: 1,
                texto: `🟠 Vence amanhã!`,
                badgeClass: 'countdown-urgent',
                statusVencimento: 'a_vencer'
            };
        } else if (diffDias === 0) {
            return {
                dias: 0,
                texto: `🟠 Vence hoje!`,
                badgeClass: 'countdown-urgent',
                statusVencimento: 'a_vencer'
            };
        } else {
            return {
                dias: diffDias,
                texto: `🔴 Vencido há ${Math.abs(diffDias)} dia(s)`,
                badgeClass: 'countdown-danger',
                statusVencimento: 'vencido'
            };
        }
    }

    function formatarDataBR(dataStr) {
        if (!dataStr) return '-';
        try {
            const [ano, mes, dia] = dataStr.substring(0, 10).split('-');
            return `${dia}/${mes}/${ano}`;
        } catch (e) {
            return dataStr;
        }
    }

    // =====================================================
    // CARREGAMENTO DE DADOS
    // =====================================================
    async function carregarDadosIniciais() {
        try {
            // Carregar clientes ativos
            const { data: dataClientes, error: errCli } = await supabaseClient
                .from('clientes')
                .select('id, nome, cpf_cnpj, telefone, email')
                .eq('tipo', 'cliente')
                .eq('ativo', true)
                .order('nome');

            if (!errCli) clientes = dataClientes || [];

            // Carregar serviços cadastrados
            const { data: dataServ, error: errServ } = await supabaseClient
                .from('produtos')
                .select('id, nome, codigo, valor_venda')
                .eq('tipo', 'servico')
                .order('nome');

            if (!errServ) produtosServicos = dataServ || [];

            preencherSelectsModais();
            await carregarAssinaturas();
        } catch (error) {
            console.error('Erro ao inicializar monitor de assinaturas:', error);
            mostrarNotificacao('Erro ao carregar dados do sistema.', 'error');
        }
    }

    function preencherSelectsModais() {
        const selCli = document.getElementById('modal_cliente_id');
        if (selCli) {
            selCli.innerHTML = '<option value="">Selecione um cliente...</option>' +
                clientes.map(c => `<option value="${c.id}">${c.nome} ${c.cpf_cnpj ? `(${c.cpf_cnpj})` : ''}</option>`).join('');
        }

        const selProd = document.getElementById('modal_produto_id');
        if (selProd) {
            selProd.innerHTML = '<option value="">Selecione um serviço cadastrado (opcional)...</option>' +
                produtosServicos.map(s => `<option value="${s.id}" data-valor="${s.valor_venda || 0}">${s.nome} (${fmtMoeda(s.valor_venda)})</option>`).join('');
        }
    }

    async function carregarAssinaturas() {
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
            assinaturas = data || [];

            atualizarKPIs();
            renderizarTabela();
            renderizarPainelClientesAtivos();
        } catch (error) {
            console.error('Erro ao buscar assinaturas:', error);
            mostrarNotificacao('Erro ao carregar assinaturas recorrentes.', 'error');
        }
    }

    // =====================================================
    // ATUALIZAÇÃO DOS KPIS
    // =====================================================
    function atualizarKPIs() {
        let mrrTotal = 0;
        const clientesAtivosSet = new Set();
        let aVencerQtd = 0;
        let vencidosQtd = 0;

        assinaturas.forEach(ass => {
            if (ass.status === 'ativo') {
                const valor = parseFloat(ass.valor) || 0;
                const freq = (ass.frequencia || 'mensal').toLowerCase();

                // Normalização da receita para MRR mensal
                if (freq === 'semanal') mrrTotal += valor * (52 / 12);
                else if (freq === 'mensal') mrrTotal += valor;
                else if (freq === 'trimestral') mrrTotal += valor / 3;
                else if (freq === 'semestral') mrrTotal += valor / 6;
                else if (freq === 'anual') mrrTotal += valor / 12;

                if (ass.cliente_id) clientesAtivosSet.add(ass.cliente_id);

                const exp = calcularExpiraEm(ass.data_vencimento);
                if (exp.dias < 0) {
                    vencidosQtd++;
                } else if (exp.dias >= 0 && exp.dias <= 7) {
                    aVencerQtd++;
                }
            }
        });

        const kpiMRREl = document.getElementById('kpiMRR');
        const kpiCliEl = document.getElementById('kpiClientesAtivos');
        const kpiAVencerEl = document.getElementById('kpiAVencer');
        const kpiVencidosEl = document.getElementById('kpiVencidos');
        const totalCliTab = document.getElementById('totalClientesTab');

        if (kpiMRREl) kpiMRREl.textContent = fmtMoeda(mrrTotal);
        if (kpiCliEl) kpiCliEl.textContent = clientesAtivosSet.size;
        if (kpiAVencerEl) kpiAVencerEl.textContent = aVencerQtd;
        if (kpiVencidosEl) kpiVencidosEl.textContent = vencidosQtd;
        if (totalCliTab) totalCliTab.textContent = clientesAtivosSet.size;
    }

    // =====================================================
    // FILTROS & BUSCA
    // =====================================================
    function obterAssinaturasFiltradas() {
        const termo = (document.getElementById('searchAssinatura')?.value || '').toLowerCase().trim();
        const filtroFreq = document.getElementById('filtroFrequencia')?.value || '';
        const filtroStat = document.getElementById('filtroStatus')?.value || '';

        return assinaturas.filter(ass => {
            const exp = calcularExpiraEm(ass.data_vencimento);

            // Filtro de texto
            const nomeCli = (ass.clientes?.nome || '').toLowerCase();
            const docCli = (ass.clientes?.cpf_cnpj || '').toLowerCase();
            const planoNome = (ass.plano_nome || '').toLowerCase();
            const servNome = (ass.produtos?.nome || '').toLowerCase();

            const matchTexto = !termo || nomeCli.includes(termo) || docCli.includes(termo) || planoNome.includes(termo) || servNome.includes(termo);

            // Filtro frequência
            const matchFreq = !filtroFreq || ass.frequencia === filtroFreq;

            // Filtro status
            let matchStat = true;
            if (filtroStat === 'ativo') matchStat = ass.status === 'ativo';
            else if (filtroStat === 'cancelado') matchStat = ass.status === 'cancelado' || ass.status === 'suspenso';
            else if (filtroStat === 'a_vencer') matchStat = ass.status === 'ativo' && exp.dias >= 0 && exp.dias <= 7;
            else if (filtroStat === 'vencido') matchStat = ass.status === 'ativo' && exp.dias < 0;

            return matchTexto && matchFreq && matchStat;
        });
    }

    // =====================================================
    // RENDERIZAÇÃO: TABELA PRINCIPAL
    // =====================================================
    function renderizarTabela() {
        const tbody = document.getElementById('assinaturasTableBody');
        if (!tbody) return;

        const filtradas = obterAssinaturasFiltradas();
        const totalRegistrosTexto = document.getElementById('totalRegistrosTexto');
        if (totalRegistrosTexto) {
            totalRegistrosTexto.textContent = `${filtradas.length} assinatura(s) encontrada(s)`;
        }

        if (filtradas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--gray);">
                        Nenhum registro encontrado para os filtros selecionados.
                    </td>
                </tr>
            `;
            renderizarPaginacao(0);
            return;
        }

        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const itensPagina = filtradas.slice(start, end);

        const freqLabels = {
            semanal: 'Semanal',
            mensal: 'Mensal',
            trimestral: 'Trimestral',
            semestral: 'Semestral',
            anual: 'Anual'
        };

        tbody.innerHTML = itensPagina.map(item => {
            const exp = calcularExpiraEm(item.data_vencimento);
            const statusClass = `badge-${item.status || 'ativo'}`;
            const statusLabel = (item.status || 'ativo').toUpperCase();

            return `
                <tr>
                    <td>
                        <strong style="color: var(--dark); font-size: 14px;">${item.clientes?.nome || 'Cliente não identificado'}</strong>
                        ${item.clientes?.cpf_cnpj ? `<br><small style="color: var(--gray);">${item.clientes.cpf_cnpj}</small>` : ''}
                        ${item.clientes?.telefone ? `<small style="color: var(--gray);"> • ${item.clientes.telefone}</small>` : ''}
                    </td>
                    <td>
                        <strong style="color: #0A1628;">${item.plano_nome}</strong>
                        ${item.produtos?.nome ? `<br><small style="color: var(--gray);">🛠️ ${item.produtos.nome}</small>` : ''}
                    </td>
                    <td>
                        <span style="background: #f1f5f9; color: #334155; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                            ${freqLabels[item.frequencia] || item.frequencia}
                        </span>
                    </td>
                    <td>
                        <strong style="color: #0F172A; font-size: 14.5px;">${fmtMoeda(item.valor)}</strong>
                    </td>
                    <td>
                        <span style="font-weight: 600; color: #1E293B;">${formatarDataBR(item.data_vencimento)}</span>
                    </td>
                    <td>
                        <span class="badge-countdown ${exp.badgeClass}">${exp.texto}</span>
                    </td>
                    <td>
                        ${item.data_ultimo_pagamento ? `
                            <span style="font-weight: 600; color: #15803d; font-size: 13px;">✅ ${formatarDataBR(item.data_ultimo_pagamento)}</span>
                            ${item.ultima_saida_id ? `<br><small style="color: #64748b; font-size: 11px;">Venda #${item.ultima_saida_id}</small>` : ''}
                        ` : `
                            <span style="color: #94a3b8; font-size: 12px;">Pendente</span>
                        `}
                    </td>
                    <td>
                        <span class="badge-status ${statusClass}">
                            ● ${statusLabel}
                        </span>
                    </td>
                    <td class="table-actions" style="text-align: right; white-space: nowrap;">
                        <button class="btn-primary" onclick="abrirModalPagamento(${item.id})" title="Registrar Pagamento de Mensalidade" style="background: #0284C7; color: white; border: none; padding: 6px 11px; border-radius: 6px; font-weight: 700; cursor: pointer; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px;">
                            💳 Pagar
                        </button>
                        <button class="btn-success" onclick="renovarCicloAssinatura(${item.id})" title="Renovar Ciclo de Cobrança Sem Venda" style="background: #10B981; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-right: 4px;">
                            🔄 Renovar
                        </button>
                        <button class="btn-warning" onclick="editarAssinatura(${item.id})" title="Editar Assinatura" style="padding: 6px 9px; margin-right: 4px;">
                            ✏️
                        </button>
                        <button class="btn-danger" onclick="excluirAssinatura(${item.id})" title="Excluir" style="padding: 6px 9px;">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        renderizarPaginacao(filtradas.length);
    }

    function renderizarPaginacao(totalItems) {
        const container = document.getElementById('paginationAssinaturas');
        if (!container) return;

        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';
        for (let i = 1; i <= totalPages; i++) {
            html += `
                <button class="${i === currentPage ? 'active' : ''}" onclick="mudarPaginaAssinaturas(${i})" style="margin: 0 3px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: ${i === currentPage ? 'var(--primary)' : '#FFF'}; color: ${i === currentPage ? '#FFF' : 'var(--dark)'}; cursor: pointer;">
                    ${i}
                </button>
            `;
        }
        container.innerHTML = html;
    }

    window.mudarPaginaAssinaturas = (page) => {
        currentPage = page;
        renderizarTabela();
    };

    // =====================================================
    // RENDERIZAÇÃO: PAINEL DE CLIENTES ATIVOS
    // =====================================================
    function renderizarPainelClientesAtivos() {
        const grid = document.getElementById('clientesGrid');
        if (!grid) return;

        // Agrupar assinaturas ativas por cliente
        const mapaClientes = new Map();

        assinaturas.forEach(ass => {
            if (ass.status === 'ativo' && ass.clientes) {
                const cid = ass.clientes.id;
                if (!mapaClientes.has(cid)) {
                    mapaClientes.set(cid, {
                        cliente: ass.clientes,
                        planos: [],
                        totalMensal: 0,
                        proximoVencimento: null
                    });
                }

                const entry = mapaClientes.get(cid);
                entry.planos.push(ass);

                // Calcular valor mensal proporcional
                const v = parseFloat(ass.valor) || 0;
                const freq = (ass.frequencia || 'mensal').toLowerCase();
                let vMensal = v;
                if (freq === 'semanal') vMensal = v * (52 / 12);
                else if (freq === 'trimestral') vMensal = v / 3;
                else if (freq === 'semestral') vMensal = v / 6;
                else if (freq === 'anual') vMensal = v / 12;

                entry.totalMensal += vMensal;

                // Encontrar o menor vencimento futuro
                if (!entry.proximoVencimento || ass.data_vencimento < entry.proximoVencimento) {
                    entry.proximoVencimento = ass.data_vencimento;
                }
            }
        });

        if (mapaClientes.size === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--gray);">
                    Nenhum cliente com plano ou assinatura ativa no momento.
                </div>
            `;
            return;
        }

        const listaClientes = Array.from(mapaClientes.values()).sort((a, b) => {
            return (a.proximoVencimento || '') > (b.proximoVencimento || '') ? 1 : -1;
        });

        grid.innerHTML = listaClientes.map(c => {
            const iniciais = (c.cliente.nome || 'CL')
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

            const exp = calcularExpiraEm(c.proximoVencimento);

            return `
                <div class="client-card">
                    <div>
                        <div class="client-card-header">
                            <div class="client-avatar">${iniciais}</div>
                            <div style="overflow: hidden;">
                                <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--dark); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">
                                    ${c.cliente.nome}
                                </h3>
                                <small style="color: var(--gray);">${c.cliente.cpf_cnpj || c.cliente.telefone || c.cliente.email || 'Sem documento'}</small>
                            </div>
                        </div>

                        <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span style="font-size: 12px; color: var(--gray);">Gasto Mensal:</span>
                                <strong style="font-size: 15px; color: #10B981;">${fmtMoeda(c.totalMensal)}/mês</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 12px; color: var(--gray);">Próx. Vencimento:</span>
                                <span class="badge-countdown ${exp.badgeClass}" style="font-size: 11px; padding: 2px 8px;">${exp.texto}</span>
                            </div>
                        </div>

                        <div style="margin-bottom: 10px;">
                            <span style="font-size: 12px; font-weight: 600; color: var(--gray); display: block; margin-bottom: 5px;">
                                Planos Ativos (${c.planos.length}):
                            </span>
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                ${c.planos.map(p => `
                                    <div style="font-size: 12.5px; display: flex; justify-content: space-between; background: #FFFFFF; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);">
                                        <span style="color: var(--dark); font-weight: 500;">${p.plano_nome}</span>
                                        <strong style="color: #0A1628;">${fmtMoeda(p.valor)}</strong>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="border-top: 1px solid var(--border); padding-top: 10px; display: flex; justify-content: flex-end; gap: 8px;">
                        <button class="btn-primary" onclick="filtrarPorCliente('${c.cliente.nome}')" style="font-size: 12px; padding: 6px 12px; border-radius: 6px;">
                            Ver Contratos
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.filtrarPorCliente = (nome) => {
        const input = document.getElementById('searchAssinatura');
        if (input) input.value = nome;
        document.querySelector('.tab-btn[data-tab="tab-tabela"]')?.click();
        currentPage = 1;
        renderizarTabela();
    };

    // =====================================================
    // HELPER: CÁLCULO DE PRÓXIMO VENCIMENTO DO CICLO
    // =====================================================
    function calcularProximoVencimento(baseDateStr, freq) {
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

    // =====================================================
    // HELPER: LOCALIZAR OU CRIAR PRODUTO SERVIÇO RECORRENTE
    // =====================================================
    async function obterOuCriarProdutoServicoRecorrente(usuario) {
        try {
            // 1. Verificar se já existe o serviço padrão REC-MENSALIDADE
            const { data: existente } = await supabaseClient
                .from('produtos')
                .select('id, nome')
                .eq('codigo', 'REC-MENSALIDADE')
                .maybeSingle();

            if (existente && existente.id) {
                return existente.id;
            }

            // 2. Se não existir, criar serviço padrão no catálogo
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

            if (!error && criado && criado[0]) {
                return criado[0].id;
            }

            // 3. Fallback: buscar o primeiro serviço disponível
            const { data: fallback } = await supabaseClient
                .from('produtos')
                .select('id')
                .eq('tipo', 'servico')
                .limit(1);

            if (fallback && fallback.length > 0) {
                return fallback[0].id;
            }
        } catch (e) {
            console.warn('Erro ao garantir produto de serviço para saida_itens:', e);
        }
        return null;
    }

    // =====================================================
    // MODAL DE PAGAMENTO & BAIXA DE MENSALIDADE
    // =====================================================
    const modalPagamento = document.getElementById('modalPagamentoAssinatura');

    window.abrirModalPagamento = async function(id) {
        const item = assinaturas.find(a => a.id === id);
        if (!item) {
            mostrarNotificacao('Assinatura não localizada!', 'error');
            return;
        }

        if (!modalPagamento) return;

        document.getElementById('pag_assinaturaId').value = item.id;
        document.getElementById('pag_clienteNome').textContent = item.clientes?.nome || 'Cliente não identificado';
        document.getElementById('pag_planoNome').textContent = `${item.plano_nome}${item.produtos?.nome ? ' (' + item.produtos.nome + ')' : ''}`;
        document.getElementById('pag_vencimentoAtual').textContent = formatarDataBR(item.data_vencimento);
        document.getElementById('pag_frequenciaTexto').textContent = item.frequencia || 'mensal';
        document.getElementById('pag_valor').value = parseFloat(item.valor || 0).toFixed(2);
        document.getElementById('pag_dataPagamento').value = new Date().toISOString().split('T')[0];
        document.getElementById('pag_formaPagamento').value = 'pix';
        document.getElementById('pag_observacao').value = `Acerto de mensalidade - Plano: ${item.plano_nome}`;

        const novoVenc = calcularProximoVencimento(item.data_vencimento, item.frequencia);
        const inputProximoVenc = document.getElementById('pag_proximoVencimento');
        if (inputProximoVenc) {
            inputProximoVenc.value = novoVenc;
        }
        const spanCiclo = document.getElementById('pag_spanCicloDias');
        if (spanCiclo) {
            const exp = calcularExpiraEm(novoVenc);
            spanCiclo.textContent = `(${exp.texto})`;
        }

        const elCaixa = document.getElementById('pag_caixaStatus');
        if (elCaixa) {
            elCaixa.innerHTML = 'Verificando caixa...';
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

        modalPagamento.style.display = 'block';
        document.getElementById('pag_valor')?.focus();
    };

    window.fecharModalPagamento = function() {
        if (modalPagamento) {
            modalPagamento.style.display = 'none';
        }
    };

    document.getElementById('closeModalPagamento')?.addEventListener('click', fecharModalPagamento);
    document.getElementById('btnCancelarPagamento')?.addEventListener('click', fecharModalPagamento);

    document.getElementById('pag_proximoVencimento')?.addEventListener('change', (e) => {
        const spanCiclo = document.getElementById('pag_spanCicloDias');
        if (spanCiclo && e.target.value) {
            const exp = calcularExpiraEm(e.target.value);
            spanCiclo.textContent = `(${exp.texto})`;
        }
    });

    async function confirmarPagamentoAssinatura() {
        const id = document.getElementById('pag_assinaturaId')?.value;
        const valorStr = document.getElementById('pag_valor')?.value;
        const dataPagamento = document.getElementById('pag_dataPagamento')?.value;
        const formaPagamento = document.getElementById('pag_formaPagamento')?.value || 'pix';
        const proximoVencimento = document.getElementById('pag_proximoVencimento')?.value;
        const observacao = document.getElementById('pag_observacao')?.value?.trim() || '';

        const valorPago = parseFloat(valorStr);
        if (isNaN(valorPago) || valorPago <= 0) {
            mostrarNotificacao('Informe um valor de pagamento válido (maior que zero)!', 'error');
            document.getElementById('pag_valor')?.focus();
            return;
        }

        if (!dataPagamento) {
            mostrarNotificacao('Informe a data do pagamento!', 'error');
            document.getElementById('pag_dataPagamento')?.focus();
            return;
        }

        if (!proximoVencimento) {
            mostrarNotificacao('Informe a próxima data de vencimento da assinatura!', 'error');
            document.getElementById('pag_proximoVencimento')?.focus();
            return;
        }

        const item = assinaturas.find(a => String(a.id) === String(id));
        if (!item) {
            mostrarNotificacao('Assinatura não localizada!', 'error');
            return;
        }

        const btnConfirmar = document.getElementById('btnConfirmarPagamento');
        if (btnConfirmar) {
            btnConfirmar.disabled = true;
            btnConfirmar.innerHTML = '⏳ Processando...';
        }

        try {
            const usuarioStr = sessionStorage.getItem('usuario');
            const usuario = usuarioStr ? JSON.parse(usuarioStr) : { id: 1, loja_id: 1 };
            const caixaAtivo = await (typeof obterCaixaAtivo === 'function' ? obterCaixaAtivo() : null);

            // 1. Identificar ou obter produto_id para o item da venda
            let produtoId = item.produto_id;
            if (!produtoId) {
                produtoId = await obterOuCriarProdutoServicoRecorrente(usuario);
            }

            // 2. Montar observação da venda
            let obsVenda = `[Mensalidade Recorrente] Plano: ${item.plano_nome} (${item.frequencia || 'mensal'}) | Vencimento quitado: ${formatarDataBR(item.data_vencimento)}`;
            if (observacao) {
                obsVenda += ` | ${observacao}`;
            }

            // 3. Inserir venda em public.saidas
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

            // 4. Inserir item em public.saida_itens se tiver vendaId e produtoId
            if (vendaId && produtoId) {
                const payloadItem = {
                    saida_id: vendaId,
                    produto_id: produtoId,
                    quantidade: 1,
                    valor_unitario: valorPago,
                    subtotal: valorPago,
                    desconto: 0
                };
                const { error: erroItem } = await supabaseClient
                    .from('saida_itens')
                    .insert([payloadItem]);

                if (erroItem) {
                    console.warn('Aviso ao inserir item em saida_itens:', erroItem);
                }
            }

            // 5. Atualizar servicos_recorrentes com o novo ciclo e vínculo da venda
            const updateContrato = {
                data_vencimento: proximoVencimento,
                status: 'ativo',
                data_ultimo_pagamento: dataPagamento,
                ultima_saida_id: vendaId,
                updated_at: new Date().toISOString()
            };

            const { error: erroContrato } = await supabaseClient
                .from('servicos_recorrentes')
                .update(updateContrato)
                .eq('id', item.id);

            if (erroContrato) throw erroContrato;

            // 6. Atualizar produtos se o serviço estiver vinculado
            if (item.produto_id) {
                await supabaseClient
                    .from('produtos')
                    .update({ plano_data_vencimento: proximoVencimento })
                    .eq('id', item.produto_id)
                    .eq('plano_cliente_id', item.cliente_id);
            }

            mostrarNotificacao(`🎉 Pagamento registrado! Venda #${vendaId || ''} gerada com sucesso e ciclo renovado para ${formatarDataBR(proximoVencimento)}!`, 'success');
            fecharModalPagamento();
            await carregarAssinaturas();
        } catch (err) {
            console.error('Erro ao processar pagamento de mensalidade:', err);
            mostrarNotificacao(err.message || 'Erro ao registrar pagamento da mensalidade.', 'error');
        } finally {
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = '<span>✅</span> Confirmar Pagamento & Gerar Venda';
            }
        }
    }

    document.getElementById('btnConfirmarPagamento')?.addEventListener('click', confirmarPagamentoAssinatura);

    // =====================================================
    // AÇÕES: RENOVAÇÃO DE CICLO MANUAL (SEM GERAR VENDA)
    // =====================================================
    window.renovarCicloAssinatura = async (id) => {
        const item = assinaturas.find(a => a.id === id);
        if (!item) return;

        const novaDataStr = calcularProximoVencimento(item.data_vencimento, item.frequencia);
        const novaDataFormatada = formatarDataBR(novaDataStr);

        if (!confirm(`Deseja renovar o ciclo do plano "${item.plano_nome}" para o cliente ${item.clientes?.nome}?\n\nNovo Vencimento: ${novaDataFormatada}`)) {
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('servicos_recorrentes')
                .update({
                    data_vencimento: novaDataStr,
                    status: 'ativo',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            // Se o produto vinculado tiver este mesmo cliente, atualizar também na tabela produtos
            if (item.produto_id) {
                await supabaseClient
                    .from('produtos')
                    .update({ plano_data_vencimento: novaDataStr })
                    .eq('id', item.produto_id)
                    .eq('plano_cliente_id', item.cliente_id);
            }

            mostrarNotificacao(`Ciclo renovado com sucesso! Próximo vencimento: ${novaDataFormatada}`, 'success');
            await carregarAssinaturas();
        } catch (err) {
            console.error('Erro ao renovar ciclo:', err);
            mostrarNotificacao('Erro ao renovar o ciclo da assinatura.', 'error');
        }
    };

    // =====================================================
    // MODAL DE CADASTRO / EDIÇÃO
    // =====================================================
    const modal = document.getElementById('modalAssinatura');

    function atualizarModalCicloInfo() {
        const freq = document.getElementById('modal_frequencia')?.value || 'mensal';
        const inputVenc = document.getElementById('modal_data_vencimento');
        const container = document.getElementById('modalCicloInfo');

        const freqNomes = {
            semanal: 'Semanal (7 dias)',
            mensal: 'Mensal (30 dias)',
            trimestral: 'Trimestral (90 dias)',
            semestral: 'Semestral (180 dias)',
            anual: 'Anual (365 dias)'
        };

        if (inputVenc && !inputVenc.value) {
            const d = new Date();
            if (freq === 'semanal') d.setDate(d.getDate() + 7);
            else if (freq === 'mensal') d.setMonth(d.getMonth() + 1);
            else if (freq === 'trimestral') d.setMonth(d.getMonth() + 3);
            else if (freq === 'semestral') d.setMonth(d.getMonth() + 6);
            else if (freq === 'anual') d.setFullYear(d.getFullYear() + 1);
            inputVenc.value = d.toISOString().split('T')[0];
        }

        let textoDias = '';
        if (inputVenc && inputVenc.value) {
            const exp = calcularExpiraEm(inputVenc.value);
            textoDias = `<span class="badge-countdown ${exp.badgeClass}" style="margin-left: 8px;">${exp.texto}</span>`;
        }

        if (container) {
            container.innerHTML = `
                <span>📅 <strong>Ciclo de Cobrança:</strong> Cobrança ${freqNomes[freq] || freq}.</span>
                <span>${textoDias}</span>
            `;
        }
    }

    document.getElementById('modal_frequencia')?.addEventListener('change', () => {
        const freq = document.getElementById('modal_frequencia')?.value;
        const inputVenc = document.getElementById('modal_data_vencimento');
        const d = new Date();
        if (freq === 'semanal') d.setDate(d.getDate() + 7);
        else if (freq === 'mensal') d.setMonth(d.getMonth() + 1);
        else if (freq === 'trimestral') d.setMonth(d.getMonth() + 3);
        else if (freq === 'semestral') d.setMonth(d.getMonth() + 6);
        else if (freq === 'anual') d.setFullYear(d.getFullYear() + 1);
        if (inputVenc) inputVenc.value = d.toISOString().split('T')[0];
        atualizarModalCicloInfo();
    });

    document.getElementById('modal_data_vencimento')?.addEventListener('change', atualizarModalCicloInfo);
    document.getElementById('modal_data_vencimento')?.addEventListener('input', atualizarModalCicloInfo);

    // Auto-preencher valor e nome caso um serviço existente seja selecionado
    document.getElementById('modal_produto_id')?.addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        if (opt && opt.value) {
            const valor = opt.getAttribute('data-valor');
            const inpVal = document.getElementById('modal_valor');
            if (inpVal && (!inpVal.value || parseFloat(inpVal.value) === 0) && valor) {
                inpVal.value = valor;
            }
            const inpNome = document.getElementById('modal_plano_nome');
            if (inpNome && !inpNome.value) {
                inpNome.value = `Plano ${opt.text.split('(')[0].trim()}`;
            }
        }
    });

    document.getElementById('btnNovaAssinatura')?.addEventListener('click', () => {
        document.getElementById('modalAssinaturaTitle').textContent = 'Nova Assinatura Recorrente';
        document.getElementById('assinaturaForm').reset();
        document.getElementById('assinaturaId').value = '';
        document.getElementById('modal_frequencia').value = 'mensal';
        document.getElementById('modal_status').value = 'ativo';

        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        document.getElementById('modal_data_vencimento').value = d.toISOString().split('T')[0];
        atualizarModalCicloInfo();

        modal.style.display = 'flex';
    });

    window.editarAssinatura = (id) => {
        const item = assinaturas.find(a => a.id === id);
        if (!item) return;

        document.getElementById('modalAssinaturaTitle').textContent = 'Editar Assinatura Recorrente';
        document.getElementById('assinaturaId').value = item.id;
        document.getElementById('modal_cliente_id').value = item.cliente_id || '';
        document.getElementById('modal_produto_id').value = item.produto_id || '';
        document.getElementById('modal_plano_nome').value = item.plano_nome || '';
        document.getElementById('modal_frequencia').value = item.frequencia || 'mensal';
        document.getElementById('modal_valor').value = item.valor || '';
        document.getElementById('modal_data_vencimento').value = item.data_vencimento ? item.data_vencimento.substring(0, 10) : '';
        document.getElementById('modal_status').value = item.status || 'ativo';
        document.getElementById('modal_observacao').value = item.observacao || '';

        atualizarModalCicloInfo();
        modal.style.display = 'flex';
    };

    window.excluirAssinatura = async (id) => {
        if (!confirm('Tem certeza que deseja excluir esta assinatura recorrente?')) return;

        try {
            const { error } = await supabaseClient
                .from('servicos_recorrentes')
                .delete()
                .eq('id', id);

            if (error) throw error;

            mostrarNotificacao('Assinatura excluída com sucesso!', 'success');
            await carregarAssinaturas();
        } catch (err) {
            console.error('Erro ao excluir assinatura:', err);
            mostrarNotificacao('Erro ao excluir assinatura.', 'error');
        }
    };

    document.getElementById('closeModalAssinatura')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    document.getElementById('btnCancelarAssinatura')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Salvar Assinatura
    document.getElementById('btnSalvarAssinatura')?.addEventListener('click', async (e) => {
        e.preventDefault();

        const id = document.getElementById('assinaturaId').value;
        const clienteId = document.getElementById('modal_cliente_id').value;
        const produtoId = document.getElementById('modal_produto_id').value || null;
        const planoNome = document.getElementById('modal_plano_nome').value.trim();
        const frequencia = document.getElementById('modal_frequencia').value;
        const valor = parseFloat(document.getElementById('modal_valor').value) || 0;
        const dataVencimento = document.getElementById('modal_data_vencimento').value;
        const status = document.getElementById('modal_status').value;
        const observacao = document.getElementById('modal_observacao').value.trim();

        if (!clienteId) {
            mostrarNotificacao('É obrigatório selecionar um cliente!', 'error');
            document.getElementById('modal_cliente_id')?.focus();
            return;
        }

        if (!planoNome) {
            mostrarNotificacao('Informe o nome do plano de assinatura!', 'error');
            document.getElementById('modal_plano_nome')?.focus();
            return;
        }

        if (isNaN(valor) || valor < 0.01) {
            mostrarNotificacao('Informe um valor válido maior que zero!', 'error');
            document.getElementById('modal_valor')?.focus();
            return;
        }

        if (!dataVencimento) {
            mostrarNotificacao('Informe a data de vencimento da assinatura!', 'error');
            document.getElementById('modal_data_vencimento')?.focus();
            return;
        }

        const dados = {
            loja_id: usuario.loja_id || 1,
            cliente_id: parseInt(clienteId),
            produto_id: produtoId ? parseInt(produtoId) : null,
            plano_nome: planoNome,
            frequencia,
            valor,
            data_vencimento: dataVencimento,
            status,
            observacao: observacao || null,
            updated_at: new Date().toISOString()
        };

        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('servicos_recorrentes')
                    .update(dados)
                    .eq('id', id);

                if (error) throw error;
                mostrarNotificacao('Assinatura atualizada com sucesso!', 'success');
            } else {
                dados.data_inicio = new Date().toISOString().split('T')[0];
                const { error } = await supabaseClient
                    .from('servicos_recorrentes')
                    .insert([dados]);

                if (error) throw error;
                mostrarNotificacao('Assinatura cadastrada com sucesso!', 'success');
            }

            modal.style.display = 'none';
            await carregarAssinaturas();
        } catch (err) {
            console.error('Erro ao salvar assinatura:', err);
            const msg = err.message || 'Erro ao salvar assinatura recorrente.';
            mostrarNotificacao(msg, 'error');
        }
    });

    // =====================================================
    // ALTERNAÇÃO DE ABAS
    // =====================================================
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.style.display = 'block';
        });
    });

    // =====================================================
    // MODO EXPANDIDO / FOCO EM TELA CHEIA
    // =====================================================
    const btnExpandir = document.getElementById('btnExpandirMonitor');
    const container = document.getElementById('monitorContainer');

    btnExpandir?.addEventListener('click', () => {
        isFullscreen = !isFullscreen;
        if (isFullscreen) {
            container.classList.add('fullscreen-focus');
            btnExpandir.innerHTML = '✕ Sair da Tela Cheia';
            btnExpandir.style.background = '#fee2e2';
            btnExpandir.style.color = '#b91c1c';
        } else {
            container.classList.remove('fullscreen-focus');
            btnExpandir.innerHTML = '⛶ Expandir Tela';
            btnExpandir.style.background = '#FFFFFF';
            btnExpandir.style.color = 'var(--dark)';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isFullscreen) {
            btnExpandir?.click();
        }
    });

    // =====================================================
    // FILTROS & EXPORTAÇÃO
    // =====================================================
    document.getElementById('btnFiltrar')?.addEventListener('click', () => {
        currentPage = 1;
        renderizarTabela();
    });

    document.getElementById('searchAssinatura')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            renderizarTabela();
        }
    });

    document.getElementById('filtroFrequencia')?.addEventListener('change', () => {
        currentPage = 1;
        renderizarTabela();
    });

    document.getElementById('filtroStatus')?.addEventListener('change', () => {
        currentPage = 1;
        renderizarTabela();
    });

    document.getElementById('btnExportExcel')?.addEventListener('click', () => {
        exportarTabelaParaExcel('assinaturasTable', 'monitor_servicos_recorrentes');
    });

    document.getElementById('btnExportPDF')?.addEventListener('click', () => {
        exportarTabelaParaPDF('assinaturasTable', 'Monitor de Serviços Recorrentes', 'Relatório de assinaturas e mensalidades vigentes');
    });

    // Inicialização
    carregarDadosIniciais();
});
