// js/fiado.js
// Módulo de Fiado e Contas a Receber — Aion ERP

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obter usuário logado e dados de sessão
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    const userNameEl = document.getElementById('userName');
    const userPerfilEl = document.getElementById('userPerfil');
    if (userNameEl) userNameEl.textContent = usuario.nome || 'Usuário';
    if (userPerfilEl) userPerfilEl.textContent = (usuario.perfil || 'Operador').toUpperCase();

    // 2. Estado em memória do módulo
    let contas = [];
    let pagamentos = [];
    let clientes = [];
    let caixaAtivo = null;
    let contaSelecionadaParaAcao = null;
    let configLoja = null;

    // Configurar datas de filtro padrão: Mês atual
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    const fmtIsoDate = (d) => d.toISOString().split('T')[0];

    const inputDataInicio = document.getElementById('filtroDataInicio');
    const inputDataFim = document.getElementById('filtroDataFim');
    if (inputDataInicio) inputDataInicio.value = fmtIsoDate(primeiroDiaMes);
    if (inputDataFim) inputDataFim.value = fmtIsoDate(hoje);

    // Helpers de Formatação
    function formatarMoeda(val) {
        const num = parseFloat(val) || 0;
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatarData(dataStr) {
        if (!dataStr) return '-';
        const d = new Date(dataStr);
        if (isNaN(d.getTime())) return String(dataStr);
        return d.toLocaleDateString('pt-BR');
    }

    function formatarDataHora(dataStr) {
        if (!dataStr) return '-';
        const d = new Date(dataStr);
        if (isNaN(d.getTime())) return String(dataStr);
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function mostrarNotificacao(msg, tipo = 'info') {
        if (typeof window.mostrarNotificacao === 'function') {
            window.mostrarNotificacao(msg, tipo);
        } else {
            alert(msg);
        }
    }

    // 3. Carregar Caixa Ativo
    async function obterCaixaAtivo() {
        try {
            const { data, error } = await supabaseClient
                .from('caixas')
                .select('*')
                .eq('status', 'aberto')
                .order('data_abertura', { ascending: false })
                .limit(1);

            if (!error && data && data.length > 0) {
                caixaAtivo = data[0];
            } else {
                caixaAtivo = null;
            }
        } catch (e) {
            console.warn('Aviso ao consultar caixa ativo:', e);
            caixaAtivo = null;
        }
        return caixaAtivo;
    }

    // 4. Carregar Todos os Dados Principais
    async function carregarDados() {
        try {
            await obterCaixaAtivo();

            // Config loja
            try {
                const { data: cfg } = await supabaseClient.from('config_loja').select('*').limit(1).single();
                if (cfg) configLoja = cfg;
            } catch (e) {}

            // Clientes
            const { data: cData } = await supabaseClient
                .from('clientes')
                .select('*')
                .order('nome', { ascending: true });
            clientes = cData || [];

            // Contas a Receber com Fallback Seguro
            let crData = [];
            try {
                const resCR = await supabaseClient
                    .from('contas_receber')
                    .select('*, clientes(id, nome, cpf_cnpj, telefone, endereco)')
                    .order('data_venda', { ascending: false });
                if (!resCR.error && resCR.data) {
                    crData = resCR.data;
                } else {
                    console.warn('Aviso: usando fallback direto para contas_receber:', resCR?.error?.message);
                    const fallbackCR = await supabaseClient
                        .from('contas_receber')
                        .select('*')
                        .order('data_venda', { ascending: false });
                    crData = fallbackCR.data || [];
                }
            } catch (eCR) {
                console.warn('Aviso: fallback para contas_receber simples:', eCR.message);
                const fallbackCR = await supabaseClient
                    .from('contas_receber')
                    .select('*')
                    .order('data_venda', { ascending: false });
                crData = fallbackCR.data || [];
            }
            contas = crData || [];

            // Enriquecer dados dos clientes nas contas em memória
            contas.forEach(c => {
                if (!c.clientes && c.cliente_id) {
                    const cli = clientes.find(item => item.id === c.cliente_id);
                    if (cli) c.clientes = cli;
                }
            });

            // Histórico de Pagamentos com Fallback Seguro e Enriquecimento em Memória
            let pgData = [];
            try {
                const resPg = await supabaseClient
                    .from('contas_receber_pagamentos')
                    .select('*, contas_receber(numero_documento, saida_id, cliente_nome), usuarios(nome)')
                    .order('data_pagamento', { ascending: false });
                if (!resPg.error && resPg.data) {
                    pgData = resPg.data;
                } else {
                    console.warn('Aviso: usando fallback direto para contas_receber_pagamentos:', resPg?.error?.message);
                    const fallbackPg = await supabaseClient
                        .from('contas_receber_pagamentos')
                        .select('*')
                        .order('data_pagamento', { ascending: false });
                    pgData = fallbackPg.data || [];
                }
            } catch (errPg) {
                console.warn('Aviso: fallback para contas_receber_pagamentos simples:', errPg.message);
                const fallbackPg = await supabaseClient
                    .from('contas_receber_pagamentos')
                    .select('*')
                    .order('data_pagamento', { ascending: false });
                pgData = fallbackPg.data || [];
            }
            pagamentos = pgData || [];

            // Enriquecer dados do histórico em memória a partir de contas e usuários
            pagamentos.forEach(p => {
                if (!p.contas_receber && (p.conta_receber_id || p.contas_receber_id)) {
                    const idConta = p.conta_receber_id || p.contas_receber_id;
                    const c = contas.find(conta => conta.id === idConta);
                    if (c) {
                        p.contas_receber = {
                            numero_documento: c.numero_documento,
                            saida_id: c.saida_id,
                            cliente_nome: c.cliente_nome
                        };
                    }
                }
            });

            // Atualizar Indicadores Financeiros (KPIs)
            atualizarIndicadoresKPIs();

            // Preencher Select de Clientes para Extrato
            preencherSelectClientes();

            // Renderizar Visualizações
            renderizarPainelGeral();
            renderizarContasAberto();
            renderizarContasAver();
            renderizarHistoricoPagamentos();
            renderizarContasQuitadas();
            renderizarRelatorios();

            // Se houver cliente selecionado na URL ou no extrato, atualizar
            const urlParams = new URLSearchParams(window.location.search);
            const cliUrl = urlParams.get('cliente_id');
            if (cliUrl) {
                const sel = document.getElementById('selectClienteExtrato');
                if (sel) {
                    sel.value = cliUrl;
                    ativarAba('tabExtratoCliente');
                    carregarExtratoCliente(cliUrl);
                }
            } else {
                const sel = document.getElementById('selectClienteExtrato');
                if (sel && sel.value) {
                    carregarExtratoCliente(sel.value);
                }
            }

        } catch (error) {
            console.error('Erro ao carregar dados de contas a receber:', error);
            mostrarNotificacao('Erro ao carregar dados: ' + (error.message || 'Verifique a conexão'), 'error');
        }
    }

    // 5. Cálculo e Atualização dos KPIs do Topo
    function atualizarIndicadoresKPIs() {
        const hojeStr = fmtIsoDate(new Date());

        let saldoDevedorTotal = 0;
        let qtdAberto = 0;
        let qtdAver = 0;
        let qtdQuitadas = 0;
        let qtdVencidas = 0;
        let valorVencidas = 0;

        contas.forEach(c => {
            if (c.status === 'cancelado') return;

            const saldo = parseFloat(c.saldo_devedor) || 0;
            saldoDevedorTotal += saldo;

            if (c.status === 'aberto') {
                qtdAberto++;
            } else if (c.status === 'aver_na_conta') {
                qtdAver++;
            } else if (c.status === 'pago') {
                qtdQuitadas++;
            }

            // Verificar se está vencida
            if (saldo > 0 && c.data_vencimento && c.data_vencimento < hojeStr) {
                qtdVencidas++;
                valorVencidas += saldo;
            }
        });

        // Total Recebido no Período (baseado nas datas do filtro principal)
        const dtInicio = inputDataInicio?.value || '2000-01-01';
        const dtFim = inputDataFim?.value || '2099-12-31';

        let totalRecebidoPeriodo = 0;
        pagamentos.forEach(p => {
            if (p.cancelado === true || p.tipo_operacao === 'venda_realizada') return;
            const dtPg = p.data_pagamento ? p.data_pagamento.substring(0, 10) : '';
            if (dtPg >= dtInicio && dtPg <= dtFim) {
                totalRecebidoPeriodo += parseFloat(p.valor_pago) || 0;
            }
        });

        // Atualizar elementos na tela
        const elDevedor = document.getElementById('kpiSaldoDevedorTotal');
        const elAberto = document.getElementById('kpiContasAberto');
        const elAver = document.getElementById('kpiContasAver');
        const elRecebido = document.getElementById('kpiTotalRecebidoPeriodo');
        const elQuitadas = document.getElementById('kpiContasQuitadas');
        const elVencidas = document.getElementById('kpiContasVencidas');
        const elValorVencidas = document.getElementById('kpiValorVencidas');

        if (elDevedor) elDevedor.textContent = formatarMoeda(saldoDevedorTotal);
        if (elAberto) elAberto.textContent = qtdAberto;
        if (elAver) elAver.textContent = qtdAver;
        if (elRecebido) elRecebido.textContent = formatarMoeda(totalRecebidoPeriodo);
        if (elQuitadas) elQuitadas.textContent = qtdQuitadas;
        if (elVencidas) elVencidas.textContent = qtdVencidas;
        if (elValorVencidas) elValorVencidas.textContent = `${formatarMoeda(valorVencidas)} em atraso`;

        // Badges nas abas
        const bGeral = document.getElementById('badgeTotalGeral');
        const bAberto = document.getElementById('badgeTotalAberto');
        const bAver = document.getElementById('badgeTotalAver');
        const bQuitadas = document.getElementById('badgeTotalQuitadas');

        if (bGeral) bGeral.textContent = contas.filter(c => c.status !== 'cancelado').length;
        if (bAberto) bAberto.textContent = qtdAberto;
        if (bAver) bAver.textContent = qtdAver;
        if (bQuitadas) bQuitadas.textContent = qtdQuitadas;
    }

    // 6. Preencher Select de Clientes para o Extrato
    function preencherSelectClientes() {
        const select = document.getElementById('selectClienteExtrato');
        if (!select) return;

        const valAtual = select.value;
        select.innerHTML = '<option value="">-- Escolha um cliente para visualizar extrato --</option>';

        // Clientes que possuem contas a receber em destaque primeiro
        const idsComConta = new Set(contas.map(c => c.cliente_id).filter(Boolean));

        clientes.forEach(cli => {
            const hasConta = idsComConta.has(cli.id);
            const opt = document.createElement('option');
            opt.value = cli.id;
            opt.textContent = `${cli.nome} ${cli.cpf_cnpj ? `(${cli.cpf_cnpj})` : ''} ${hasConta ? '⭐ (Possui crediário)' : ''}`;
            select.appendChild(opt);
        });

        if (valAtual) select.value = valAtual;
    }

    // Helper para gerar o badge visual de status
    function renderizarBadgeStatus(status, dataVencimento, saldoDevedor) {
        const hojeStr = fmtIsoDate(new Date());
        let html = '';

        if (status === 'aberto') {
            html = '<span class="badge-status badge-aberto">⏳ Em Aberto</span>';
        } else if (status === 'aver_na_conta') {
            html = '<span class="badge-status badge-aver">⚖️ Aver na Conta</span>';
        } else if (status === 'pago') {
            return '<span class="badge-status badge-pago">✅ Quitado</span>';
        } else if (status === 'cancelado') {
            return '<span class="badge-status badge-cancelado">🚫 Cancelado</span>';
        } else {
            html = `<span class="badge-status">${status}</span>`;
        }

        // Se tiver saldo devedor e estiver com data de vencimento ultrapassada
        const saldo = parseFloat(saldoDevedor) || 0;
        if (saldo > 0 && dataVencimento && dataVencimento < hojeStr) {
            html += '<span class="badge-vencido">VENCIDA</span>';
        }

        return html;
    }

    // 7. Renderização da Aba 1: Painel Geral
    function renderizarPainelGeral() {
        const tbody = document.getElementById('tbodyContasPrincipal');
        if (!tbody) return;

        const texto = (document.getElementById('filtroTexto')?.value || '').toLowerCase().trim();
        const dtInicio = document.getElementById('filtroDataInicio')?.value || '';
        const dtFim = document.getElementById('filtroDataFim')?.value || '';
        const statusFiltro = document.getElementById('filtroStatus')?.value || 'todos';
        const hojeStr = fmtIsoDate(new Date());

        const contasFiltradas = contas.filter(c => {
            // Filtro por texto (cliente, cpf, venda ou documento)
            if (texto) {
                const matchCli = (c.cliente_nome || '').toLowerCase().includes(texto);
                const matchCpf = (c.cliente_cpf || '').toLowerCase().includes(texto);
                const matchDoc = (c.numero_documento || '').toLowerCase().includes(texto);
                const matchVenda = String(c.saida_id || '').includes(texto);
                if (!matchCli && !matchCpf && !matchDoc && !matchVenda) return false;
            }

            // Filtro por período de venda
            if (dtInicio && c.data_venda < dtInicio) return false;
            if (dtFim && c.data_venda > dtFim) return false;

            // Filtro por status
            if (statusFiltro === 'vencidas') {
                const saldo = parseFloat(c.saldo_devedor) || 0;
                return saldo > 0 && c.data_vencimento && c.data_vencimento < hojeStr && c.status !== 'cancelado';
            } else if (statusFiltro !== 'todos') {
                if (c.status !== statusFiltro) return false;
            }

            return true;
        });

        if (contasFiltradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:35px; color:var(--gray);">Nenhuma conta localizada com os filtros selecionados.</td></tr>';
            return;
        }

        tbody.innerHTML = contasFiltradas.map(c => {
            const saldo = parseFloat(c.saldo_devedor) || 0;
            const original = parseFloat(c.valor_original) || 0;
            const pago = parseFloat(c.valor_pago) || 0;
            const podePagar = c.status !== 'pago' && c.status !== 'cancelado' && saldo > 0;
            const podeCancelar = c.status !== 'cancelado' && c.status !== 'pago' && pago === 0;

            return `
                <tr>
                    <td style="font-weight:700; color:var(--primary); font-family:monospace; font-size:13px;">${c.numero_documento || `DAV-${c.id}`}</td>
                    <td>
                        <a href="saidas.html" style="font-weight:600; color:#2563EB;" title="Ver venda no PDV">#${c.saida_id || '-'}</a>
                    </td>
                    <td>
                        <strong>${c.cliente_nome || 'Cliente não identificado'}</strong>
                        ${c.cliente_cpf ? `<br><small style="color:var(--gray); font-size:11px;">CPF: ${c.cliente_cpf}</small>` : ''}
                        ${c.cliente_telefone ? `<br><small style="color:var(--gray); font-size:11px;">Tel: ${c.cliente_telefone}</small>` : ''}
                    </td>
                    <td>${formatarData(c.data_venda)}</td>
                    <td>${formatarData(c.data_vencimento)}</td>
                    <td style="text-align: right; font-weight: 600;">${formatarMoeda(original)}</td>
                    <td style="text-align: right; color: #10B981; font-weight: 600;">${formatarMoeda(pago)}</td>
                    <td style="text-align: right; font-weight: 800; color: ${saldo > 0 ? '#DC2626' : '#10B981'}; font-size: 14px;">
                        ${formatarMoeda(saldo)}
                    </td>
                    <td>${formatarDataHora(c.data_ultimo_pagamento) || '-'}</td>
                    <td style="text-align: center;">${renderizarBadgeStatus(c.status, c.data_vencimento, c.saldo_devedor)}</td>
                    <td style="text-align: center; white-space: nowrap;">
                        ${podePagar ? `
                            <button type="button" class="btn-acao-tabela btn-acao-pagar" onclick="window.abrirModalPagamento(${c.id})" title="Registrar Pagamento / Parcela">
                                💳 Pagar
                            </button>
                        ` : ''}
                        <button type="button" class="btn-acao-tabela btn-acao-detalhes" onclick="window.abrirModalDetalhes(${c.id})" title="Visualizar Detalhes e Itens">
                            👁️
                        </button>
                        <button type="button" class="btn-acao-tabela btn-acao-dav" onclick="window.imprimirDAV(${c.id})" title="Imprimir DAV / Ficha de Fiado">
                            🖨️
                        </button>
                        ${podeCancelar ? `
                            <button type="button" class="btn-acao-tabela btn-acao-estornar" onclick="window.abrirModalEstorno(${c.id}, 'conta')" title="Estornar / Cancelar Conta">
                                🚫
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 8. Renderização da Aba 2: Contas em Aberto
    function renderizarContasAberto() {
        const tbody = document.getElementById('tbodyContasAberto');
        const resumoEl = document.getElementById('resumoContasAberto');
        if (!tbody) return;

        const contasAberto = contas.filter(c => c.status === 'aberto');
        const total = contasAberto.reduce((acc, c) => acc + (parseFloat(c.saldo_devedor) || 0), 0);

        if (resumoEl) {
            resumoEl.textContent = `${contasAberto.length} contas em aberto | Total a Receber: ${formatarMoeda(total)}`;
        }

        if (contasAberto.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:35px; color:var(--gray);">Nenhuma conta em aberto encontrada no momento.</td></tr>';
            return;
        }

        tbody.innerHTML = contasAberto.map(c => `
            <tr>
                <td style="font-weight:700; color:var(--primary); font-family:monospace;">${c.numero_documento || `DAV-${c.id}`}</td>
                <td>#${c.saida_id || '-'}</td>
                <td><strong>${c.cliente_nome}</strong>${c.cliente_cpf ? `<br><small style="color:var(--gray);">CPF: ${c.cliente_cpf}</small>` : ''}</td>
                <td>${formatarData(c.data_venda)}</td>
                <td>${formatarData(c.data_vencimento)}</td>
                <td style="text-align: right; font-weight: 800; color: #DC2626; font-size: 14px;">${formatarMoeda(c.saldo_devedor)}</td>
                <td style="text-align: center;">${renderizarBadgeStatus(c.status, c.data_vencimento, c.saldo_devedor)}</td>
                <td style="text-align: center;">
                    <button type="button" class="btn-acao-tabela btn-acao-pagar" onclick="window.abrirModalPagamento(${c.id})">
                        💳 Registrar Pgto
                    </button>
                    <button type="button" class="btn-acao-tabela btn-acao-detalhes" onclick="window.abrirModalDetalhes(${c.id})">
                        👁️
                    </button>
                    <button type="button" class="btn-acao-tabela btn-acao-dav" onclick="window.imprimirDAV(${c.id})">
                        🖨️
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 9. Renderização da Aba 3: Aver na Conta
    function renderizarContasAver() {
        const tbody = document.getElementById('tbodyContasAver');
        const resumoEl = document.getElementById('resumoContasAver');
        if (!tbody) return;

        const contasAver = contas.filter(c => c.status === 'aver_na_conta');
        const totalSaldo = contasAver.reduce((acc, c) => acc + (parseFloat(c.saldo_devedor) || 0), 0);
        const totalPago = contasAver.reduce((acc, c) => acc + (parseFloat(c.valor_pago) || 0), 0);

        if (resumoEl) {
            resumoEl.textContent = `${contasAver.length} contas | Amortizado: ${formatarMoeda(totalPago)} | Saldo Restante: ${formatarMoeda(totalSaldo)}`;
        }

        if (contasAver.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:35px; color:var(--gray);">Nenhuma conta com pagamento parcial registrada.</td></tr>';
            return;
        }

        tbody.innerHTML = contasAver.map(c => {
            const original = parseFloat(c.valor_original) || 0;
            const pago = parseFloat(c.valor_pago) || 0;
            const saldo = parseFloat(c.saldo_devedor) || 0;
            const pct = original > 0 ? Math.min(100, Math.round((pago / original) * 100)) : 0;

            return `
                <tr>
                    <td style="font-weight:700; color:var(--primary); font-family:monospace;">${c.numero_documento || `DAV-${c.id}`}</td>
                    <td>#${c.saida_id || '-'}</td>
                    <td><strong>${c.cliente_nome}</strong></td>
                    <td>${formatarData(c.data_venda)}</td>
                    <td style="text-align: right; font-weight:600;">${formatarMoeda(original)}</td>
                    <td style="text-align: right; color:#10B981; font-weight:700;">${formatarMoeda(pago)}</td>
                    <td style="text-align: right; color:#DC2626; font-weight:800; font-size:14px;">${formatarMoeda(saldo)}</td>
                    <td>
                        <div style="font-size:11px; font-weight:700; color:#3B82F6; display:flex; justify-content:space-between;">
                            <span>${pct}% pago</span>
                            <span>${100 - pct}% rest.</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${pct}%;"></div>
                        </div>
                    </td>
                    <td>${formatarDataHora(c.data_ultimo_pagamento) || '-'}</td>
                    <td style="text-align: center;">
                        <button type="button" class="btn-acao-tabela btn-acao-pagar" onclick="window.abrirModalPagamento(${c.id})">
                            💳 Pagar Restante
                        </button>
                        <button type="button" class="btn-acao-tabela btn-acao-detalhes" onclick="window.abrirModalDetalhes(${c.id})">
                            👁️
                        </button>
                        <button type="button" class="btn-acao-tabela btn-acao-dav" onclick="window.imprimirDAV(${c.id})">
                            🖨️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 10. Renderização da Aba 4: Histórico de Pagamentos
    function renderizarHistoricoPagamentos() {
        const tbody = document.getElementById('tbodyHistoricoPagamentos');
        if (!tbody) return;

        const texto = (document.getElementById('filtroHistoricoTexto')?.value || '').toLowerCase().trim();
        const opFiltro = document.getElementById('filtroHistoricoOperacao')?.value || 'todos';
        const formaFiltro = document.getElementById('filtroHistoricoForma')?.value || 'todos';

        const pagamentosFiltrados = pagamentos.filter(p => {
            if (texto) {
                const matchCli = (p.contas_receber?.cliente_nome || '').toLowerCase().includes(texto);
                const matchDoc = (p.numero_documento || '').toLowerCase().includes(texto);
                const matchVenda = String(p.saida_id || '').includes(texto);
                if (!matchCli && !matchDoc && !matchVenda) return false;
            }

            if (opFiltro !== 'todos' && p.tipo_operacao !== opFiltro) return false;
            if (formaFiltro !== 'todos' && p.forma_pagamento !== formaFiltro) return false;

            return true;
        });

        if (pagamentosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:35px; color:var(--gray);">Nenhuma movimentação de pagamento localizada.</td></tr>';
            return;
        }

        const LABEL_OPERACOES = {
            'venda_realizada': '📋 Venda Realizada',
            'pagamento_inicial': '💰 Pagamento Inicial',
            'pagamento_parcial': '💵 Pagamento Parcial',
            'pagamento_final': '🎉 Quitação Final',
            'estorno': '🔄 Estorno / Reversão'
        };

        tbody.innerHTML = pagamentosFiltrados.map(p => {
            const valor = parseFloat(p.valor_pago) || 0;
            const saldoAnt = parseFloat(p.saldo_anterior) || 0;
            const saldoApos = parseFloat(p.saldo_apos) || 0;
            const isEstorno = p.tipo_operacao === 'estorno' || p.cancelado === true;

            return `
                <tr style="${isEstorno ? 'background-color: #FEF2F2; text-decoration: line-through;' : ''}">
                    <td>${formatarDataHora(p.data_pagamento)}</td>
                    <td style="font-weight:700; font-family:monospace;">${p.numero_documento || `REC-${p.id}`}</td>
                    <td>#${p.saida_id || '-'}</td>
                    <td><strong>${p.contas_receber?.cliente_nome || 'Cliente'}</strong></td>
                    <td><span style="font-weight:600;">${LABEL_OPERACOES[p.tipo_operacao] || p.tipo_operacao}</span></td>
                    <td style="text-align: right; font-weight: 800; color: ${p.tipo_operacao === 'venda_realizada' ? '#64748b' : '#10B981'};">
                        ${formatarMoeda(valor)}
                    </td>
                    <td>${p.forma_pagamento || '-'}</td>
                    <td style="text-align: right;">${formatarMoeda(saldoAnt)}</td>
                    <td style="text-align: right; font-weight: 700; color: ${saldoApos > 0 ? '#DC2626' : '#10B981'};">
                        ${formatarMoeda(saldoApos)}
                    </td>
                    <td>${p.usuarios?.nome || 'Operador'}</td>
                    <td>${p.caixa_id ? `Caixa #${p.caixa_id}` : '-'}</td>
                    <td style="text-align: center; white-space: nowrap;">
                        ${p.tipo_operacao !== 'venda_realizada' ? `
                            <button type="button" class="btn-acao-tabela btn-acao-dav" onclick="window.imprimirReciboPagamento(${p.id})" title="Imprimir Recibo">
                                🖨️ Recibo
                            </button>
                            ${!p.cancelado ? `
                                <button type="button" class="btn-acao-tabela btn-acao-estornar" onclick="window.abrirModalEstorno(${p.id}, 'pagamento')" title="Estornar este Pagamento">
                                    🚫
                                </button>
                            ` : '<span style="color:#DC2626; font-size:11px; font-weight:700;">ESTORNADO</span>'}
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 11. Renderização da Aba 5: Contas Quitadas
    function renderizarContasQuitadas() {
        const tbody = document.getElementById('tbodyContasQuitadas');
        const resumoEl = document.getElementById('resumoContasQuitadas');
        if (!tbody) return;

        const contasQuitadas = contas.filter(c => c.status === 'pago');
        const total = contasQuitadas.reduce((acc, c) => acc + (parseFloat(c.valor_pago) || 0), 0);

        if (resumoEl) {
            resumoEl.textContent = `${contasQuitadas.length} contas quitadas | Total Liquidado: ${formatarMoeda(total)}`;
        }

        if (contasQuitadas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:35px; color:var(--gray);">Nenhuma conta quitada registrada até o momento.</td></tr>';
            return;
        }

        tbody.innerHTML = contasQuitadas.map(c => `
            <tr>
                <td style="font-weight:700; color:var(--primary); font-family:monospace;">${c.numero_documento || `DAV-${c.id}`}</td>
                <td>#${c.saida_id || '-'}</td>
                <td><strong>${c.cliente_nome}</strong></td>
                <td>${formatarData(c.data_venda)}</td>
                <td>${formatarDataHora(c.data_quitacao || c.data_ultimo_pagamento)}</td>
                <td style="text-align: right; font-weight: 800; color: #10B981; font-size: 14px;">${formatarMoeda(c.valor_pago)}</td>
                <td style="text-align: center;"><span class="badge-status badge-pago">✅ Quitado</span></td>
                <td style="text-align: center;">
                    <button type="button" class="btn-acao-tabela btn-acao-detalhes" onclick="window.abrirModalDetalhes(${c.id})" title="Ver Histórico">
                        👁️ Histórico
                    </button>
                    <button type="button" class="btn-acao-tabela btn-acao-dav" onclick="window.imprimirDAV(${c.id})" title="Imprimir Comprovante de Quitação">
                        🖨️ DAV Quitado
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // 12. Renderização da Aba 6: Extrato por Cliente
    async function carregarExtratoCliente(clienteId) {
        const boxConteudo = document.getElementById('conteudoExtratoCliente');
        const avisoSelecione = document.getElementById('avisoSelecioneCliente');
        const btnImprimir = document.getElementById('btnImprimirExtratoCliente');

        if (!clienteId) {
            if (boxConteudo) boxConteudo.style.display = 'none';
            if (avisoSelecione) avisoSelecione.style.display = 'block';
            if (btnImprimir) btnImprimir.disabled = true;
            return;
        }

        const cli = clientes.find(c => String(c.id) === String(clienteId));
        if (!cli) return;

        if (boxConteudo) boxConteudo.style.display = 'block';
        if (avisoSelecione) avisoSelecione.style.display = 'none';
        if (btnImprimir) btnImprimir.disabled = false;

        // Cabeçalho do Cliente
        document.getElementById('extratoClienteNome').textContent = cli.nome;
        document.getElementById('extratoClienteDocs').textContent = 
            `CPF/CNPJ: ${cli.cpf_cnpj || 'Não informado'} | Telefone: ${cli.telefone || 'Não informado'} | Endereço: ${cli.endereco || 'Não informado'}`;

        // Contas do Cliente
        const contasCli = contas.filter(c => String(c.cliente_id) === String(clienteId) && c.status !== 'cancelado');
        const pagamentosCli = pagamentos.filter(p => String(p.cliente_id) === String(clienteId) && p.tipo_operacao !== 'venda_realizada' && !p.cancelado);

        const totalDevedor = contasCli.reduce((acc, c) => acc + (parseFloat(c.saldo_devedor) || 0), 0);
        const totalPago = contasCli.reduce((acc, c) => acc + (parseFloat(c.valor_pago) || 0), 0);

        document.getElementById('extratoTotalDevedor').textContent = formatarMoeda(totalDevedor);
        document.getElementById('extratoTotalPago').textContent = formatarMoeda(totalPago);
        document.getElementById('extratoQtdVendas').textContent = contasCli.length;

        // Último recebimento
        const ultPg = pagamentosCli.length > 0 ? pagamentosCli[0] : null;
        document.getElementById('extratoUltimoRecebimento').textContent = ultPg 
            ? `${formatarData(ultPg.data_pagamento)} (${formatarMoeda(ultPg.valor_pago)})` 
            : 'Nenhum pagamento registrado';

        const badgeSit = document.getElementById('extratoBadgeSituacao');
        if (totalDevedor <= 0 && contasCli.length > 0) {
            badgeSit.className = 'badge-status badge-pago';
            badgeSit.textContent = 'Em Dia (Sem Débitos)';
        } else if (totalDevedor > 0) {
            badgeSit.className = 'badge-status badge-aberto';
            badgeSit.textContent = `Em Aberto (${formatarMoeda(totalDevedor)})`;
        } else {
            badgeSit.className = 'badge-status';
            badgeSit.textContent = 'Sem Registro de Fiado';
        }

        // Tabela de Compras a Prazo Individuais
        const tbodyVendas = document.getElementById('tbodyExtratoVendas');
        if (tbodyVendas) {
            if (contasCli.length === 0) {
                tbodyVendas.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--gray);">Nenhuma venda fiada encontrada para este cliente.</td></tr>';
            } else {
                tbodyVendas.innerHTML = contasCli.map(c => `
                    <tr>
                        <td style="font-weight:700; font-family:monospace;">${c.numero_documento || `DAV-${c.id}`}</td>
                        <td>#${c.saida_id || '-'}</td>
                        <td>${formatarData(c.data_venda)}</td>
                        <td>${formatarData(c.data_vencimento)}</td>
                        <td style="text-align: right;">${formatarMoeda(c.valor_original)}</td>
                        <td style="text-align: right; color:#10B981; font-weight:600;">${formatarMoeda(c.valor_pago)}</td>
                        <td style="text-align: right; font-weight:800; color:${parseFloat(c.saldo_devedor) > 0 ? '#DC2626' : '#10B981'};">
                            ${formatarMoeda(c.saldo_devedor)}
                        </td>
                        <td style="text-align: center;">${renderizarBadgeStatus(c.status, c.data_vencimento, c.saldo_devedor)}</td>
                        <td style="text-align: center;">
                            ${parseFloat(c.saldo_devedor) > 0 ? `
                                <button type="button" class="btn-acao-tabela btn-acao-pagar" onclick="window.abrirModalPagamento(${c.id})">💳 Pagar</button>
                            ` : ''}
                            <button type="button" class="btn-acao-tabela btn-acao-detalhes" onclick="window.abrirModalDetalhes(${c.id})">👁️</button>
                            <button type="button" class="btn-acao-tabela btn-acao-dav" onclick="window.imprimirDAV(${c.id})">🖨️</button>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // Tabela de Pagamentos Efetuados
        const tbodyPgs = document.getElementById('tbodyExtratoPagamentos');
        if (tbodyPgs) {
            if (pagamentosCli.length === 0) {
                tbodyPgs.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:var(--gray);">Nenhum pagamento efetuado por este cliente até o momento.</td></tr>';
            } else {
                tbodyPgs.innerHTML = pagamentosCli.map(p => `
                    <tr>
                        <td>${formatarDataHora(p.data_pagamento)}</td>
                        <td style="font-weight:700; font-family:monospace;">${p.numero_documento || `REC-${p.id}`}</td>
                        <td>#${p.saida_id || '-'}</td>
                        <td>${p.tipo_operacao === 'pagamento_final' ? '🎉 Quitação Final' : '💵 Pagamento Parcial'}</td>
                        <td style="text-align: right; font-weight:800; color:#10B981;">${formatarMoeda(p.valor_pago)}</td>
                        <td>${p.forma_pagamento || '-'}</td>
                        <td style="text-align: right; font-weight:700;">${formatarMoeda(p.saldo_apos)}</td>
                        <td>${p.usuarios?.nome || 'Operador'}</td>
                        <td style="text-align: center;">
                            <button type="button" class="btn-acao-tabela btn-acao-dav" onclick="window.imprimirReciboPagamento(${p.id})">🖨️ Recibo</button>
                        </td>
                    </tr>
                `).join('');
            }
        }
    }

    // 13. Renderização da Aba 7: Relatórios Financeiros Analíticos
    function renderizarRelatorios() {
        // 13.1 Top Devedores
        const mapDevedores = {};
        contas.forEach(c => {
            if (c.status === 'cancelado') return;
            const saldo = parseFloat(c.saldo_devedor) || 0;
            if (saldo <= 0) return;

            const nome = c.cliente_nome || 'Cliente não identificado';
            if (!mapDevedores[nome]) {
                mapDevedores[nome] = { nome, total: 0, qtd: 0, cliente_id: c.cliente_id };
            }
            mapDevedores[nome].total += saldo;
            mapDevedores[nome].qtd++;
        });

        const listaTop = Object.values(mapDevedores).sort((a, b) => b.total - a.total).slice(0, 8);
        const tbodyTop = document.getElementById('tbodyTopDevedores');
        if (tbodyTop) {
            if (listaTop.length === 0) {
                tbodyTop.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--gray);">Nenhum cliente com saldo devedor pendente.</td></tr>';
            } else {
                tbodyTop.innerHTML = listaTop.map((d, idx) => `
                    <tr>
                        <td><strong>${idx + 1}. ${d.nome}</strong></td>
                        <td style="text-align: center;">${d.qtd} venda(s)</td>
                        <td style="text-align: right; font-weight: 800; color: #DC2626;">${formatarMoeda(d.total)}</td>
                    </tr>
                `).join('');
            }
        }

        // 13.2 Arrecadação de Fiado por Forma de Pagamento
        const mapFormas = {};
        pagamentos.forEach(p => {
            if (p.cancelado || p.tipo_operacao === 'venda_realizada') return;
            const fp = p.forma_pagamento || 'Dinheiro';
            const val = parseFloat(p.valor_pago) || 0;
            if (!mapFormas[fp]) mapFormas[fp] = { forma: fp, total: 0, qtd: 0 };
            mapFormas[fp].total += val;
            mapFormas[fp].qtd++;
        });

        const listaFormas = Object.values(mapFormas).sort((a, b) => b.total - a.total);
        const tbodyFormas = document.getElementById('tbodyFormasRecebimento');
        if (tbodyFormas) {
            if (listaFormas.length === 0) {
                tbodyFormas.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--gray);">Nenhum recebimento registrado no histórico.</td></tr>';
            } else {
                tbodyFormas.innerHTML = listaFormas.map(f => `
                    <tr>
                        <td><strong>${f.forma}</strong></td>
                        <td style="text-align: center;">${f.qtd}</td>
                        <td style="text-align: right; font-weight: 800; color: #10B981;">${formatarMoeda(f.total)}</td>
                    </tr>
                `).join('');
            }
        }

        // 13.3 Previsão por Faixas de Vencimento
        const hojeStr = fmtIsoDate(new Date());
        const d7 = new Date(); d7.setDate(d7.getDate() + 7);
        const d7Str = fmtIsoDate(d7);
        const d30 = new Date(); d30.setDate(d30.getDate() + 30);
        const d30Str = fmtIsoDate(d30);

        let faixas = {
            vencidas: { label: '⚠️ Vencidas (Em atraso)', qtd: 0, total: 0, cor: '#DC2626' },
            hoje:     { label: '🔔 Vencendo Hoje', qtd: 0, total: 0, cor: '#F59E0B' },
            d7:       { label: '📅 Vencendo em até 7 dias', qtd: 0, total: 0, cor: '#3B82F6' },
            d30:      { label: '📆 Vencendo em até 30 dias', qtd: 0, total: 0, cor: '#6366F1' },
            acima:    { label: '⏳ Vencendo após 30 dias / Sem prazo', qtd: 0, total: 0, cor: '#64748B' }
        };

        contas.forEach(c => {
            if (c.status === 'pago' || c.status === 'cancelado') return;
            const saldo = parseFloat(c.saldo_devedor) || 0;
            if (saldo <= 0) return;

            const dtVenc = c.data_vencimento;
            if (!dtVenc) {
                faixas.acima.qtd++;
                faixas.acima.total += saldo;
            } else if (dtVenc < hojeStr) {
                faixas.vencidas.qtd++;
                faixas.vencidas.total += saldo;
            } else if (dtVenc === hojeStr) {
                faixas.hoje.qtd++;
                faixas.hoje.total += saldo;
            } else if (dtVenc <= d7Str) {
                faixas.d7.qtd++;
                faixas.d7.total += saldo;
            } else if (dtVenc <= d30Str) {
                faixas.d30.qtd++;
                faixas.d30.total += saldo;
            } else {
                faixas.acima.qtd++;
                faixas.acima.total += saldo;
            }
        });

        const tbodyFaixas = document.getElementById('tbodyFaixasVencimento');
        if (tbodyFaixas) {
            tbodyFaixas.innerHTML = Object.values(faixas).map(f => `
                <tr>
                    <td style="color:${f.cor}; font-weight:700;">${f.label}</td>
                    <td style="text-align: center;">${f.qtd}</td>
                    <td style="text-align: right; font-weight:800; color:${f.cor};">${formatarMoeda(f.total)}</td>
                </tr>
            `).join('');
        }
    }

    // 14. Gerenciamento de Abas
    function ativarAba(tabId) {
        document.querySelectorAll('.tab-fiado-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
        document.querySelectorAll('.tab-fiado-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });
    }

    document.querySelectorAll('.tab-fiado-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            ativarAba(tabId);
        });
    });

    // 15. Filtros e Atalhos de Período
    document.querySelectorAll('.btn-periodo-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            document.querySelectorAll('.btn-periodo-tag').forEach(t => t.classList.remove('active'));
            tag.classList.add('active');

            const p = tag.getAttribute('data-periodo');
            const now = new Date();
            if (p === 'hoje') {
                inputDataInicio.value = fmtIsoDate(now);
                inputDataFim.value = fmtIsoDate(now);
            } else if (p === '7dias') {
                const sete = new Date(); sete.setDate(sete.getDate() - 7);
                inputDataInicio.value = fmtIsoDate(sete);
                inputDataFim.value = fmtIsoDate(now);
            } else if (p === 'mes') {
                const prim = new Date(now.getFullYear(), now.getMonth(), 1);
                inputDataInicio.value = fmtIsoDate(prim);
                inputDataFim.value = fmtIsoDate(now);
            } else if (p === 'todos') {
                inputDataInicio.value = '2000-01-01';
                inputDataFim.value = '2099-12-31';
            }

            atualizarIndicadoresKPIs();
            renderizarPainelGeral();
        });
    });

    document.getElementById('btnFiltrar')?.addEventListener('click', () => {
        atualizarIndicadoresKPIs();
        renderizarPainelGeral();
    });

    document.getElementById('filtroTexto')?.addEventListener('input', () => {
        renderizarPainelGeral();
    });

    document.getElementById('filtroStatus')?.addEventListener('change', () => {
        renderizarPainelGeral();
    });

    document.getElementById('btnLimparFiltros')?.addEventListener('click', () => {
        document.getElementById('filtroTexto').value = '';
        document.getElementById('filtroStatus').value = 'todos';
        const now = new Date();
        inputDataInicio.value = fmtIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
        inputDataFim.value = fmtIsoDate(now);
        atualizarIndicadoresKPIs();
        renderizarPainelGeral();
    });

    document.getElementById('btnFiltrarHistorico')?.addEventListener('click', renderizarHistoricoPagamentos);
    document.getElementById('filtroHistoricoTexto')?.addEventListener('input', renderizarHistoricoPagamentos);
    document.getElementById('filtroHistoricoOperacao')?.addEventListener('change', renderizarHistoricoPagamentos);
    document.getElementById('filtroHistoricoForma')?.addEventListener('change', renderizarHistoricoPagamentos);

    document.getElementById('selectClienteExtrato')?.addEventListener('change', (e) => {
        carregarExtratoCliente(e.target.value);
    });

    document.getElementById('btnRecarregarDados')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnRecarregarDados');
        btn.textContent = '⏳ Atualizando...';
        btn.disabled = true;
        await carregarDados();
        btn.textContent = '🔄 Atualizar';
        btn.disabled = false;
        mostrarNotificacao('Dados financeiros atualizados com sucesso!', 'success');
    });

    // ══════════════════════════════════════════════════════════════════
    // 16. AÇÕES GLOBAIS: MODAL DE REGISTRAR PAGAMENTO DE PARCELA
    // ══════════════════════════════════════════════════════════════════
    window.abrirModalPagamento = async function(contaId) {
        const conta = contas.find(c => c.id === contaId);
        if (!conta) {
            mostrarNotificacao('Conta a receber não encontrada!', 'error');
            return;
        }

        const saldo = parseFloat(conta.saldo_devedor) || 0;
        if (saldo <= 0) {
            mostrarNotificacao('Esta conta já está totalmente quitada!', 'info');
            return;
        }

        contaSelecionadaParaAcao = conta;

        // Preencher dados do modal
        document.getElementById('pagamentoContaId').value = conta.id;
        document.getElementById('pagamentoSaidaId').value = conta.saida_id || '';
        document.getElementById('pagamentoClienteId').value = conta.cliente_id || '';

        document.getElementById('pagamentoDocVenda').textContent = `${conta.numero_documento || `DAV-${conta.id}`} | Venda #${conta.saida_id || '-'}`;
        document.getElementById('pagamentoClienteNome').textContent = `Cliente: ${conta.cliente_nome || 'Consumidor'}`;
        
        const badgeEl = document.getElementById('pagamentoStatusBadge');
        badgeEl.className = 'badge-status ' + (conta.status === 'aberto' ? 'badge-aberto' : 'badge-aver');
        badgeEl.textContent = conta.status === 'aberto' ? 'Em Aberto' : 'Aver na Conta';

        document.getElementById('pagamentoValorOriginal').textContent = formatarMoeda(conta.valor_original);
        document.getElementById('pagamentoTotalPago').textContent = formatarMoeda(conta.valor_pago);
        document.getElementById('pagamentoSaldoDevedor').textContent = formatarMoeda(saldo);

        // Valor padrão sugerido: Quitação total do saldo
        const inputValor = document.getElementById('pagamentoValor');
        inputValor.value = saldo.toFixed(2);
        inputValor.max = saldo.toFixed(2);

        document.getElementById('pagamentoNovoSaldoResultante').textContent = formatarMoeda(0);

        // Data e hora atual para o campo
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('pagamentoDataHora').value = now.toISOString().slice(0, 16);

        document.getElementById('pagamentoObservacao').value = '';

        document.getElementById('modalRegistrarPagamento').style.display = 'flex';
        inputValor.focus();
        inputValor.select();
    };

    // Atualização em tempo real do novo saldo no modal de pagamento
    const inputPgtoValor = document.getElementById('pagamentoValor');
    function atualizarCalculoNovoSaldo() {
        if (!contaSelecionadaParaAcao) return;
        const saldoAtual = parseFloat(contaSelecionadaParaAcao.saldo_devedor) || 0;
        let valPago = parseFloat(inputPgtoValor.value) || 0;

        if (valPago < 0) {
            valPago = 0;
            inputPgtoValor.value = '0.00';
        }

        if (valPago > saldoAtual) {
            mostrarNotificacao('O valor do pagamento não pode ser maior que o saldo devedor!', 'warning');
            valPago = saldoAtual;
            inputPgtoValor.value = saldoAtual.toFixed(2);
        }

        const novoSaldo = Math.max(0, saldoAtual - valPago);
        document.getElementById('pagamentoNovoSaldoResultante').textContent = formatarMoeda(novoSaldo);
    }

    inputPgtoValor?.addEventListener('input', atualizarCalculoNovoSaldo);

    // Atalhos de valor
    document.getElementById('btnAtalhoQuitarTotal')?.addEventListener('click', () => {
        if (!contaSelecionadaParaAcao) return;
        inputPgtoValor.value = parseFloat(contaSelecionadaParaAcao.saldo_devedor || 0).toFixed(2);
        atualizarCalculoNovoSaldo();
    });

    document.getElementById('btnAtalho50Pct')?.addEventListener('click', () => {
        if (!contaSelecionadaParaAcao) return;
        const saldo = parseFloat(contaSelecionadaParaAcao.saldo_devedor || 0);
        inputPgtoValor.value = (saldo / 2).toFixed(2);
        atualizarCalculoNovoSaldo();
    });

    document.getElementById('btnAtalho50Reais')?.addEventListener('click', () => {
        if (!contaSelecionadaParaAcao) return;
        const saldo = parseFloat(contaSelecionadaParaAcao.saldo_devedor || 0);
        inputPgtoValor.value = Math.min(saldo, 50).toFixed(2);
        atualizarCalculoNovoSaldo();
    });

    document.getElementById('btnAtalho100Reais')?.addEventListener('click', () => {
        if (!contaSelecionadaParaAcao) return;
        const saldo = parseFloat(contaSelecionadaParaAcao.saldo_devedor || 0);
        inputPgtoValor.value = Math.min(saldo, 100).toFixed(2);
        atualizarCalculoNovoSaldo();
    });

    // Fechar Modal Pagamento
    const fecharModalPagamento = () => {
        document.getElementById('modalRegistrarPagamento').style.display = 'none';
        contaSelecionadaParaAcao = null;
    };

    document.getElementById('closePagamentoModal')?.addEventListener('click', fecharModalPagamento);
    document.getElementById('btnCancelarPagamento')?.addEventListener('click', fecharModalPagamento);

    // 17. Confirmar Recebimento de Pagamento
    document.getElementById('btnConfirmarPagamento')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnConfirmarPagamento');
        if (!contaSelecionadaParaAcao) return;

        const conta = contaSelecionadaParaAcao;
        const saldoAtual = parseFloat(conta.saldo_devedor) || 0;
        const valPago = parseFloat(document.getElementById('pagamentoValor')?.value) || 0;
        const forma = document.getElementById('pagamentoForma')?.value || 'Dinheiro';
        const dtHora = document.getElementById('pagamentoDataHora')?.value ? new Date(document.getElementById('pagamentoDataHora').value).toISOString() : new Date().toISOString();
        const obs = document.getElementById('pagamentoObservacao')?.value?.trim() || null;

        // Validações
        if (valPago <= 0) {
            mostrarNotificacao('Informe um valor de pagamento válido maior que zero!', 'error');
            return;
        }

        if (valPago > saldoAtual) {
            mostrarNotificacao('O valor informado excede o saldo devedor atual!', 'error');
            return;
        }

        // Impedir duplo clique / reprocessamento
        btn.disabled = true;
        btn.textContent = '⏳ Gravando Pagamento...';

        try {
            await obterCaixaAtivo();

            const novoTotalPago = (parseFloat(conta.valor_pago) || 0) + valPago;
            const novoSaldoDevedor = Math.max(0, saldoAtual - valPago);
            const quitado = novoSaldoDevedor === 0;
            const novoStatus = quitado ? 'pago' : 'aver_na_conta';
            const tipoOperacao = quitado ? 'pagamento_final' : 'pagamento_parcial';
            
            // Gerar número de recibo sequencial para esta venda
            const pgsVenda = pagamentos.filter(p => p.conta_receber_id === conta.id && p.tipo_operacao !== 'venda_realizada');
            const seq = String(pgsVenda.length + 1).padStart(2, '0');
            const numRecibo = `REC-${String(conta.saida_id || conta.id).padStart(6, '0')}-${seq}`;

            // 1. Atualizar a conta a receber
            const updatePayload = {
                valor_pago: novoTotalPago,
                saldo_devedor: novoSaldoDevedor,
                status: novoStatus,
                data_ultimo_pagamento: dtHora,
                updated_at: new Date().toISOString()
            };

            if (quitado) {
                updatePayload.data_quitacao = dtHora;
            }

            const { error: errUpd } = await supabaseClient
                .from('contas_receber')
                .update(updatePayload)
                .eq('id', conta.id);

            if (errUpd) throw errUpd;

            // 2. Inserir registro no histórico financeiro permanente
            const insertPgPayload = {
                loja_id: usuario.loja_id || 1,
                conta_receber_id: conta.id,
                saida_id: conta.saida_id,
                cliente_id: conta.cliente_id,
                caixa_id: caixaAtivo ? caixaAtivo.id : null,
                usuario_id: usuario.id,
                tipo_operacao: tipoOperacao,
                valor_pago: valPago,
                forma_pagamento: forma,
                saldo_anterior: saldoAtual,
                saldo_apos: novoSaldoDevedor,
                numero_documento: numRecibo,
                data_pagamento: dtHora,
                observacao: obs || (quitado ? 'Quitação total da dívida' : 'Pagamento de parcela parcial')
            };

            const { data: pgCriado, error: errPg } = await supabaseClient
                .from('contas_receber_pagamentos')
                .insert([insertPgPayload])
                .select()
                .single();

            if (errPg) throw errPg;

            fecharModalPagamento();
            await carregarDados();

            mostrarNotificacao(`✅ Recebimento de ${formatarMoeda(valPago)} confirmado com sucesso!`, 'success');

            // Abrir recibo impresso imediatamente para entrega ao cliente
            if (pgCriado) {
                window.imprimirReciboPagamento(pgCriado.id);
            }

        } catch (err) {
            console.error('Erro ao processar pagamento:', err);
            mostrarNotificacao('Erro ao registrar pagamento: ' + (err.message || 'Falha no banco de dados'), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '✅ Confirmar Recebimento';
        }
    });

    // ══════════════════════════════════════════════════════════════════
    // 18. MODAL DE DETALHES COMPLETOS DA CONTA
    // ══════════════════════════════════════════════════════════════════
    window.abrirModalDetalhes = async function(contaId) {
        const conta = contas.find(c => c.id === contaId);
        if (!conta) return;

        contaSelecionadaParaAcao = conta;

        document.getElementById('detalheTitulo').textContent = `Conta a Receber: ${conta.numero_documento || `DAV-${conta.id}`}`;
        document.getElementById('detalheSubtitulo').textContent = `Venda Original #${conta.saida_id || '-'} — ${formatarData(conta.data_venda)}`;

        const saldo = parseFloat(conta.saldo_devedor) || 0;
        const btnPagar = document.getElementById('btnPagarPeloDetalhes');
        if (btnPagar) {
            btnPagar.style.display = saldo > 0 && conta.status !== 'cancelado' ? 'inline-block' : 'none';
        }

        // Box de Resumo
        const boxResumo = document.getElementById('detalheBoxResumo');
        boxResumo.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div>
                    <h3 style="margin:0; font-size:16px; color:#0f172a;">${conta.cliente_nome || 'Cliente não identificado'}</h3>
                    <span style="font-size:12px; color:var(--gray);">${conta.cliente_cpf ? `CPF: ${conta.cliente_cpf}` : ''} ${conta.cliente_telefone ? `| Tel: ${conta.cliente_telefone}` : ''}</span>
                </div>
                <div>${renderizarBadgeStatus(conta.status, conta.data_vencimento, conta.saldo_devedor)}</div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-top:10px; text-align:center;">
                <div style="background:#fff; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
                    <span style="font-size:11px; color:var(--gray); display:block;">Valor Original</span>
                    <strong style="font-size:14px;">${formatarMoeda(conta.valor_original)}</strong>
                </div>
                <div style="background:#fff; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
                    <span style="font-size:11px; color:var(--gray); display:block;">Total Pago</span>
                    <strong style="font-size:14px; color:#10B981;">${formatarMoeda(conta.valor_pago)}</strong>
                </div>
                <div style="background:#fff; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
                    <span style="font-size:11px; color:#dc2626; display:block; font-weight:700;">Saldo Devedor</span>
                    <strong style="font-size:15px; color:#dc2626;">${formatarMoeda(conta.saldo_devedor)}</strong>
                </div>
                <div style="background:#fff; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
                    <span style="font-size:11px; color:var(--gray); display:block;">Vencimento</span>
                    <strong style="font-size:13px;">${formatarData(conta.data_vencimento)}</strong>
                </div>
            </div>
            ${conta.observacao ? `<p style="margin:8px 0 0 0; font-size:12px; color:#475569;"><strong>Obs:</strong> ${conta.observacao}</p>` : ''}
        `;

        // Carregar Itens da Venda Original
        const tbodyItens = document.getElementById('tbodyDetalhesItens');
        tbodyItens.innerHTML = '<tr><td colspan="5" style="text-align:center;">Consultando itens da venda...</td></tr>';
        
        try {
            if (conta.saida_id) {
                const { data: itens } = await supabaseClient
                    .from('saida_itens')
                    .select('*, produtos(nome, codigo)')
                    .eq('saida_id', conta.saida_id);

                if (itens && itens.length > 0) {
                    tbodyItens.innerHTML = itens.map(item => `
                        <tr>
                            <td>${item.produtos?.codigo || item.produto_id}</td>
                            <td>${item.produtos?.nome || 'Item da Venda'}</td>
                            <td style="text-align:center;">${Math.abs(item.quantidade)}</td>
                            <td style="text-align:right;">${formatarMoeda(item.valor_unitario)}</td>
                            <td style="text-align:right; font-weight:700;">${formatarMoeda(item.subtotal)}</td>
                        </tr>
                    `).join('');
                } else {
                    tbodyItens.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray);">Nenhum detalhe de item encontrado para a venda.</td></tr>';
                }
            } else {
                tbodyItens.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray);">Venda sem número associado.</td></tr>';
            }
        } catch (e) {
            tbodyItens.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--gray);">Falha ao carregar itens da venda.</td></tr>';
        }

        // Histórico de Pagamentos desta Conta
        const pgsConta = pagamentos.filter(p => p.conta_receber_id === conta.id);
        const tbodyHist = document.getElementById('tbodyDetalhesHistorico');
        if (pgsConta.length === 0) {
            tbodyHist.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:15px; color:var(--gray);">Nenhuma movimentação registrada para esta conta.</td></tr>';
        } else {
            tbodyHist.innerHTML = pgsConta.map(p => `
                <tr style="${p.cancelado ? 'background:#fef2f2; text-decoration:line-through;' : ''}">
                    <td>${formatarDataHora(p.data_pagamento)}</td>
                    <td><span style="font-weight:600;">${p.tipo_operacao}</span></td>
                    <td style="text-align:right; font-weight:700; color:${p.tipo_operacao === 'venda_realizada' ? '#64748b' : '#10B981'};">${formatarMoeda(p.valor_pago)}</td>
                    <td>${p.forma_pagamento || '-'}</td>
                    <td style="text-align:right; font-weight:700; color:${parseFloat(p.saldo_apos) > 0 ? '#DC2626' : '#10B981'};">${formatarMoeda(p.saldo_apos)}</td>
                    <td style="font-family:monospace;">${p.numero_documento || '-'}</td>
                    <td>${p.usuarios?.nome || 'Operador'}</td>
                </tr>
            `).join('');
        }

        document.getElementById('modalDetalhesConta').style.display = 'flex';
    };

    const fecharModalDetalhes = () => {
        document.getElementById('modalDetalhesConta').style.display = 'none';
    };

    document.getElementById('closeDetalhesModal')?.addEventListener('click', fecharModalDetalhes);
    document.getElementById('btnFecharDetalhes')?.addEventListener('click', fecharModalDetalhes);
    document.getElementById('btnPagarPeloDetalhes')?.addEventListener('click', () => {
        if (!contaSelecionadaParaAcao) return;
        const cId = contaSelecionadaParaAcao.id;
        fecharModalDetalhes();
        window.abrirModalPagamento(cId);
    });
    document.getElementById('btnImprimirDavDetalhes')?.addEventListener('click', () => {
        if (!contaSelecionadaParaAcao) return;
        window.imprimirDAV(contaSelecionadaParaAcao.id);
    });

    // ══════════════════════════════════════════════════════════════════
    // 19. IMPRESSÃO DE DAV (DOCUMENTO AUXILIAR DE VENDA A PRAZO / NOTA DE FIADO)
    // ══════════════════════════════════════════════════════════════════
    window.imprimirDAV = async function(contaId) {
        const conta = contas.find(c => c.id === contaId);
        if (!conta) return;

        let itensVenda = [];
        if (conta.saida_id) {
            try {
                const { data } = await supabaseClient
                    .from('saida_itens')
                    .select('*, produtos(nome, codigo)')
                    .eq('saida_id', conta.saida_id);
                itensVenda = data || [];
            } catch (e) {}
        }

        const loja = configLoja || usuario.config_loja || {};
        const pgsConta = pagamentos.filter(p => p.conta_receber_id === conta.id && !p.cancelado);

        const htmlRecibo = `
            <div style="font-family:'Courier New',monospace; font-size:13px; line-height:1.3; color:#000; padding:10px 5px; max-width:380px; margin:0 auto;">
                <div style="text-align:center;">
                    <h3 style="margin:0; font-size:16px; font-weight:bold; text-transform:uppercase;">${loja.nome_fantasia || loja.nome || usuario.loja_nome || 'AION ERP'}</h3>
                    ${loja.cnpj ? `<p style="margin:2px 0;">CNPJ: ${loja.cnpj}</p>` : ''}
                    ${loja.telefone ? `<p style="margin:2px 0;">Telefone: ${loja.telefone}</p>` : ''}
                    ${loja.endereco ? `<p style="margin:2px 0;">${loja.endereco}${loja.numero ? ', ' + loja.numero : ''}</p>` : ''}
                    <div style="margin:5px 0;">====================================</div>
                    <h4 style="margin:4px 0; font-size:15px; font-weight:bold;">DOCUMENTO AUXILIAR DE VENDA (DAV)</h4>
                    <p style="margin:2px 0; font-weight:bold;">NOTA DE FIADO / CREDIÁRIO</p>
                    <p style="margin:2px 0; font-size:14px; font-weight:bold;">${conta.numero_documento || `DAV-${conta.id}`}</p>
                    <div style="margin:5px 0;">====================================</div>
                </div>

                <div style="margin-bottom:8px;">
                    <p style="margin:2px 0;"><strong>Venda Origem:</strong> #${conta.saida_id || '-'}</p>
                    <p style="margin:2px 0;"><strong>Data da Venda:</strong> ${formatarData(conta.data_venda)}</p>
                    <p style="margin:2px 0;"><strong>Vencimento:</strong> ${formatarData(conta.data_vencimento)}</p>
                    <p style="margin:2px 0;"><strong>Cliente:</strong> ${conta.cliente_nome}</p>
                    ${conta.cliente_cpf ? `<p style="margin:2px 0;"><strong>CPF/CNPJ:</strong> ${conta.cliente_cpf}</p>` : ''}
                    ${conta.cliente_telefone ? `<p style="margin:2px 0;"><strong>Telefone:</strong> ${conta.cliente_telefone}</p>` : ''}
                    <div style="margin:5px 0;">------------------------------------</div>
                </div>

                <!-- ITENS COMPRADOS -->
                <div style="margin-bottom:8px;">
                    <div style="font-weight:bold; margin-bottom:4px;">ITENS DA VENDA:</div>
                    ${itensVenda.map(i => `
                        <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                            <span style="max-width:220px;">${Math.abs(i.quantidade)}x ${i.produtos?.nome || 'Produto'}</span>
                            <span>${formatarMoeda(i.subtotal)}</span>
                        </div>
                    `).join('')}
                    <div style="margin:5px 0;">------------------------------------</div>
                </div>

                <!-- VALORES DO FIADO -->
                <div style="margin-bottom:8px; font-size:14px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span>VALOR TOTAL DA VENDA:</span>
                        <strong>${formatarMoeda(conta.valor_original)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px; color:#10B981;">
                        <span>TOTAL JÁ PAGO:</span>
                        <strong>${formatarMoeda(conta.valor_pago)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px; font-size:16px; font-weight:bold; color:${parseFloat(conta.saldo_devedor) > 0 ? '#000' : '#10B981'};">
                        <span>SALDO RESTANTE:</span>
                        <span>${formatarMoeda(conta.saldo_devedor)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:4px;">
                        <span>SITUAÇÃO:</span>
                        <strong>${conta.status.toUpperCase()}</strong>
                    </div>
                    <div style="margin:5px 0;">====================================</div>
                </div>

                <!-- HISTÓRICO DE PAGAMENTOS -->
                ${pgsConta.length > 0 ? `
                    <div style="margin-bottom:10px; font-size:12px;">
                        <div style="font-weight:bold; margin-bottom:4px;">PAGAMENTOS REGISTRADOS:</div>
                        ${pgsConta.map(p => `
                            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                                <span>${formatarData(p.data_pagamento)} - ${p.forma_pagamento}</span>
                                <strong>${formatarMoeda(p.valor_pago)}</strong>
                            </div>
                        `).join('')}
                        <div style="margin:5px 0;">------------------------------------</div>
                    </div>
                ` : ''}

                <!-- TERMO DE RECONHECIMENTO DE DÍVIDA -->
                <div style="margin-top:10px; font-size:11px; text-align:justify; line-height:1.3; border:1px dashed #000; padding:6px;">
                    Declaro que recebi os produtos constantes deste documento em perfeitas condições e assumo o compromisso irrevogável de efetuar o pagamento do saldo devedor até a data de vencimento indicada.
                </div>

                <div style="margin-top:35px; text-align:center;">
                    __________________________________________<br>
                    <strong>${conta.cliente_nome}</strong><br>
                    <span style="font-size:11px;">Assinatura do Cliente / Responsável</span>
                </div>

                <div style="text-align:center; font-size:11px; margin-top:20px; color:#555;">
                    Emitido em: ${new Date().toLocaleString('pt-BR')}<br>
                    Operador: ${usuario.nome || 'Sistema'}
                </div>
            </div>
        `;

        document.getElementById('areaImpressaoRecibo').innerHTML = htmlRecibo;
        document.getElementById('modalRecibo').style.display = 'flex';
    };

    // ══════════════════════════════════════════════════════════════════
    // 20. IMPRESSÃO DE RECIBO DE PAGAMENTO / QUITAÇÃO
    // ══════════════════════════════════════════════════════════════════
    window.imprimirReciboPagamento = function(pagamentoId) {
        const p = pagamentos.find(x => x.id === pagamentoId);
        if (!p) return;

        const loja = configLoja || usuario.config_loja || {};
        const conta = contas.find(c => c.id === p.conta_receber_id) || p.contas_receber || {};

        const htmlRecibo = `
            <div style="font-family:'Courier New',monospace; font-size:13px; line-height:1.3; color:#000; padding:10px 5px; max-width:380px; margin:0 auto;">
                <div style="text-align:center;">
                    <h3 style="margin:0; font-size:16px; font-weight:bold; text-transform:uppercase;">${loja.nome_fantasia || loja.nome || usuario.loja_nome || 'AION ERP'}</h3>
                    ${loja.cnpj ? `<p style="margin:2px 0;">CNPJ: ${loja.cnpj}</p>` : ''}
                    ${loja.telefone ? `<p style="margin:2px 0;">Telefone: ${loja.telefone}</p>` : ''}
                    <div style="margin:5px 0;">====================================</div>
                    <h4 style="margin:4px 0; font-size:15px; font-weight:bold;">RECIBO DE PAGAMENTO DE FIADO</h4>
                    <p style="margin:2px 0; font-size:14px; font-weight:bold;">${p.numero_documento || `REC-${p.id}`}</p>
                    <div style="margin:5px 0;">====================================</div>
                </div>

                <div style="margin-bottom:8px;">
                    <p style="margin:2px 0;"><strong>Data / Hora:</strong> ${formatarDataHora(p.data_pagamento)}</p>
                    <p style="margin:2px 0;"><strong>Cliente:</strong> ${conta.cliente_nome || 'Cliente'}</p>
                    <p style="margin:2px 0;"><strong>Ref. Venda:</strong> #${p.saida_id || '-'}</p>
                    <p style="margin:2px 0;"><strong>Doc. Fiado:</strong> ${conta.numero_documento || `DAV-${p.conta_receber_id}`}</p>
                    <div style="margin:5px 0;">------------------------------------</div>
                </div>

                <div style="margin-bottom:10px; font-size:14px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span>Saldo Anterior:</span>
                        <span>${formatarMoeda(p.saldo_anterior)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px; font-size:16px; font-weight:bold;">
                        <span>VALOR RECEBIDO:</span>
                        <span>${formatarMoeda(p.valor_pago)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span>Forma de Pagto:</span>
                        <strong>${p.forma_pagamento}</strong>
                    </div>
                    <div style="margin:5px 0;">------------------------------------</div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px; font-size:15px; font-weight:bold; color:${parseFloat(p.saldo_apos) > 0 ? '#000' : '#10B981'};">
                        <span>SALDO RESTANTE:</span>
                        <span>${formatarMoeda(p.saldo_apos)}</span>
                    </div>
                </div>

                ${p.observacao ? `
                    <div style="margin-bottom:8px; font-size:12px;">
                        <p style="margin:2px 0;"><strong>Observação:</strong> ${p.observacao}</p>
                    </div>
                ` : ''}

                <div style="margin-top:20px; font-size:12px; text-align:center; border:1px solid #000; padding:6px;">
                    ${parseFloat(p.saldo_apos) <= 0 
                        ? '✅ DÍVIDA TOTALMENTE QUITADA. OBRIGADO PELA PREFERÊNCIA!' 
                        : `Ainda resta o saldo de ${formatarMoeda(p.saldo_apos)} a pagar.`}
                </div>

                <div style="margin-top:30px; text-align:center;">
                    __________________________________________<br>
                    <span style="font-size:11px;">Assinatura do Operador / Caixa</span>
                </div>

                <div style="text-align:center; font-size:11px; margin-top:15px; color:#555;">
                    Operador: ${usuario.nome || 'Caixa'}<br>
                    ${p.caixa_id ? `Caixa Diário #${p.caixa_id}` : ''}
                </div>
            </div>
        `;

        document.getElementById('areaImpressaoRecibo').innerHTML = htmlRecibo;
        document.getElementById('modalRecibo').style.display = 'flex';
    };

    // ══════════════════════════════════════════════════════════════════
    // 21. IMPRESSÃO DE EXTRATO CONSOLIDADO DO CLIENTE
    // ══════════════════════════════════════════════════════════════════
    document.getElementById('btnImprimirExtratoCliente')?.addEventListener('click', () => {
        const clienteId = document.getElementById('selectClienteExtrato')?.value;
        if (!clienteId) return;

        const cli = clientes.find(c => String(c.id) === String(clienteId));
        if (!cli) return;

        const contasCli = contas.filter(c => String(c.cliente_id) === String(clienteId) && c.status !== 'cancelado');
        const pgsCli = pagamentos.filter(p => String(p.cliente_id) === String(clienteId) && p.tipo_operacao !== 'venda_realizada' && !p.cancelado);

        const totalDevedor = contasCli.reduce((acc, c) => acc + (parseFloat(c.saldo_devedor) || 0), 0);
        const totalPago = contasCli.reduce((acc, c) => acc + (parseFloat(c.valor_pago) || 0), 0);
        const loja = configLoja || usuario.config_loja || {};

        const htmlExtrato = `
            <div style="font-family:'Courier New',monospace; font-size:13px; line-height:1.3; color:#000; padding:10px 5px; max-width:420px; margin:0 auto;">
                <div style="text-align:center;">
                    <h3 style="margin:0; font-size:16px; font-weight:bold; text-transform:uppercase;">${loja.nome_fantasia || loja.nome || usuario.loja_nome || 'AION ERP'}</h3>
                    <h4 style="margin:4px 0; font-size:15px; font-weight:bold;">EXTRATO FINANCEIRO DO CLIENTE</h4>
                    <div style="margin:5px 0;">====================================</div>
                </div>

                <div style="margin-bottom:8px;">
                    <p style="margin:2px 0;"><strong>Cliente:</strong> ${cli.nome}</p>
                    <p style="margin:2px 0;"><strong>CPF/CNPJ:</strong> ${cli.cpf_cnpj || 'Não informado'}</p>
                    <p style="margin:2px 0;"><strong>Telefone:</strong> ${cli.telefone || 'Não informado'}</p>
                    <p style="margin:2px 0;"><strong>Data de Emissão:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                    <div style="margin:5px 0;">------------------------------------</div>
                </div>

                <div style="margin-bottom:10px; font-size:14px; background:#f4f4f4; padding:8px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                        <span>Total de Compras Fiadas:</span>
                        <strong>${contasCli.length}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:3px; color:#10B981;">
                        <span>Total Amortizado:</span>
                        <strong>${formatarMoeda(totalPago)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:16px; font-weight:bold; color:${totalDevedor > 0 ? '#DC2626' : '#10B981'};">
                        <span>SALDO TOTAL DEVEDOR:</span>
                        <span>${formatarMoeda(totalDevedor)}</span>
                    </div>
                </div>

                <div style="margin-bottom:10px;">
                    <div style="font-weight:bold; margin-bottom:4px;">VENDAS A PRAZO REGISTRADAS:</div>
                    ${contasCli.map(c => `
                        <div style="border-bottom:1px dashed #ccc; padding-bottom:4px; margin-bottom:4px;">
                            <div style="display:flex; justify-content:space-between;">
                                <span>${c.numero_documento || `DAV-${c.id}`} (${formatarData(c.data_venda)})</span>
                                <strong>${formatarMoeda(c.valor_original)}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:12px;">
                                <span>Pago: ${formatarMoeda(c.valor_pago)}</span>
                                <span style="font-weight:bold; color:${parseFloat(c.saldo_devedor) > 0 ? '#DC2626' : '#10B981'};">
                                    Saldo: ${formatarMoeda(c.saldo_devedor)}
                                </span>
                            </div>
                        </div>
                    `).join('')}
                    <div style="margin:5px 0;">------------------------------------</div>
                </div>

                <div style="margin-bottom:10px;">
                    <div style="font-weight:bold; margin-bottom:4px;">HISTÓRICO DE PAGAMENTOS:</div>
                    ${pgsCli.map(p => `
                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">
                            <span>${formatarData(p.data_pagamento)} - ${p.forma_pagamento}</span>
                            <strong>${formatarMoeda(p.valor_pago)}</strong>
                        </div>
                    `).join('')}
                </div>

                <div style="margin-top:25px; text-align:center;">
                    __________________________________________<br>
                    <strong>${cli.nome}</strong><br>
                    <span style="font-size:11px;">Ciente do Extrato e Saldo Devedor</span>
                </div>
            </div>
        `;

        document.getElementById('areaImpressaoRecibo').innerHTML = htmlExtrato;
        document.getElementById('modalRecibo').style.display = 'flex';
    });

    // Fechar Modal Recibo
    const fecharModalRecibo = () => {
        document.getElementById('modalRecibo').style.display = 'none';
    };
    document.getElementById('closeReciboModal')?.addEventListener('click', fecharModalRecibo);
    document.getElementById('btnFecharRecibo')?.addEventListener('click', fecharModalRecibo);
    document.getElementById('btnImprimirRecibo')?.addEventListener('click', () => {
        window.print();
    });

    // ══════════════════════════════════════════════════════════════════
    // 22. MODAL DE CONFIRMAÇÃO DE ESTORNO / AUDITORIA
    // ══════════════════════════════════════════════════════════════════
    let estornoInfo = null;

    window.abrirModalEstorno = function(id, tipo) {
        estornoInfo = { id, tipo };
        const msgEl = document.getElementById('estornoMensagemAviso');
        document.getElementById('estornoMotivo').value = '';

        if (tipo === 'conta') {
            const conta = contas.find(c => c.id === id);
            if (!conta) return;

            const valorOriginal = parseFloat(conta.valor_original) || 0;
            const valorPago = parseFloat(conta.valor_pago) || 0;
            const saldoDevedor = parseFloat(conta.saldo_devedor) || 0;

            // REGRA C: Se a conta já foi quitada / totalmente paga
            if (conta.status === 'pago' || (valorPago > 0 && saldoDevedor <= 0) || (valorPago >= valorOriginal && valorOriginal > 0)) {
                mostrarNotificacao('⛔ Esta conta já foi totalmente quitada e não pode mais ser cancelada!', 'error');
                return;
            }

            // REGRA B: Se houver pagamentos parciais registrados
            if (valorPago > 0 && saldoDevedor > 0) {
                mostrarNotificacao(`⛔ Bloqueio: Esta conta possui ${formatarMoeda(valorPago)} em pagamentos já recebidos. Para cancelar a conta, estorne primeiro os pagamentos individuais na aba "Histórico de Pagamentos"!`, 'error');
                return;
            }

            msgEl.textContent = `Atenção: Você está prestes a cancelar a Conta a Receber #${id} (DAV em aberto no valor de ${formatarMoeda(saldoDevedor)}). O status passará para cancelado, a venda vinculada #${conta.saida_id || '-'} será cancelada e o estoque será estornado.`;
        } else if (tipo === 'pagamento') {
            msgEl.textContent = `Atenção: Você está prestes a estornar o Pagamento #${id}. O valor pago será revertido ao saldo devedor da conta e uma movimentação de estorno será gravada.`;
        }

        document.getElementById('modalEstorno').style.display = 'flex';
    };

    const fecharModalEstorno = () => {
        document.getElementById('modalEstorno').style.display = 'none';
        estornoInfo = null;
    };
    document.getElementById('closeEstornoModal')?.addEventListener('click', fecharModalEstorno);
    document.getElementById('btnCancelarEstorno')?.addEventListener('click', fecharModalEstorno);

    document.getElementById('btnConfirmarEstorno')?.addEventListener('click', async () => {
        if (!estornoInfo) return;
        const motivo = document.getElementById('estornoMotivo')?.value?.trim();
        if (!motivo) {
            mostrarNotificacao('Informe o motivo do estorno para fins de auditoria!', 'error');
            document.getElementById('estornoMotivo')?.focus();
            return;
        }

        const btn = document.getElementById('btnConfirmarEstorno');
        btn.disabled = true;
        btn.textContent = 'Processando estorno...';

        try {
            if (estornoInfo.tipo === 'conta') {
                const contaCancelando = contas.find(c => c.id === estornoInfo.id);
                if (!contaCancelando) throw new Error('Conta não localizada.');

                const valorOriginal = parseFloat(contaCancelando.valor_original) || 0;
                const valorPago = parseFloat(contaCancelando.valor_pago) || 0;
                const saldoDevedor = parseFloat(contaCancelando.saldo_devedor) || 0;

                // REGRA C: Se quitada, não cancelar
                if (contaCancelando.status === 'pago' || (valorPago > 0 && saldoDevedor <= 0) || (valorPago >= valorOriginal && valorOriginal > 0)) {
                    mostrarNotificacao('⛔ Esta conta já foi totalmente quitada e não pode mais ser cancelada!', 'error');
                    fecharModalEstorno();
                    return;
                }

                // REGRA B: Se houver pagamentos parciais, bloquear
                if (valorPago > 0 && saldoDevedor > 0) {
                    mostrarNotificacao('⛔ Bloqueio: Estorne primeiro os pagamentos parciais na aba "Histórico de Pagamentos"!', 'error');
                    fecharModalEstorno();
                    return;
                }

                // Cancelar a conta a receber inteira
                const { error: errUpd } = await supabaseClient
                    .from('contas_receber')
                    .update({
                        status: 'cancelado',
                        saldo_devedor: 0,
                        observacao: `Cancelada em ${new Date().toLocaleString('pt-BR')} por ${usuario.nome}. Motivo: ${motivo}`,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', estornoInfo.id);

                if (errUpd) throw errUpd;

                // 1. Cancelar todos os pagamentos e baixas vinculados a essa conta
                await supabaseClient
                    .from('contas_receber_pagamentos')
                    .update({
                        cancelado: true,
                        cancelado_em: new Date().toISOString(),
                        cancelado_por: usuario.id,
                        motivo_cancelamento: `Cancelamento de conta fiada: ${motivo}`
                    })
                    .eq('conta_receber_id', estornoInfo.id);

                // 2. Se a conta for originada de uma venda em saidas, sincronizar o cancelamento e estornar estoque
                if (contaCancelando && contaCancelando.saida_id) {
                    try {
                        const vendaId = contaCancelando.saida_id;
                        await supabaseClient.from('saidas').update({
                            cancelado: true,
                            cancelado_em: new Date().toISOString(),
                            cancelado_por: usuario.id,
                            motivo_cancelamento: `Cancelada pelo Módulo Fiado: ${motivo}`
                        }).eq('id', vendaId);

                        // Estornar estoque da venda vinculada
                        const { data: itensSaida } = await supabaseClient
                            .from('saida_itens')
                            .select('*, produtos(id, nome, estoque_total)')
                            .eq('saida_id', vendaId);

                        for (const item of (itensSaida || [])) {
                            const estAtual = item.produtos?.estoque_total || 0;
                            const novoEst = estAtual + item.quantidade;
                            await supabaseClient.from('produtos')
                                .update({ estoque_total: novoEst, ultima_movimentacao: new Date().toISOString() })
                                .eq('id', item.produto_id);

                            if (item.serial_id) {
                                await supabaseClient.from('produtos_seriais')
                                    .update({ status: 'disponivel', data_saida: null })
                                    .eq('id', item.serial_id);
                            }

                            await supabaseClient.from('movimentos_estoque').insert([{
                                produto_id: item.produto_id,
                                tipo: 'entrada',
                                quantidade: item.quantidade,
                                quantidade_anterior: estAtual,
                                quantidade_nova: novoEst,
                                motivo: `Cancelamento de conta fiada #${contaCancelando.id} (Venda #${vendaId}) — ${motivo}`,
                                data: new Date().toISOString(),
                                usuario_id: usuario.id
                            }]);
                        }
                    } catch (eSaida) {
                        console.warn('Aviso ao sincronizar cancelamento na tabela de saídas:', eSaida);
                    }
                }

                // 3. Registrar operação de estorno para histórico e auditoria
                await supabaseClient
                    .from('contas_receber_pagamentos')
                    .insert([{
                        loja_id: usuario.loja_id || 1,
                        conta_receber_id: estornoInfo.id,
                        saida_id: contaCancelando?.saida_id || null,
                        cliente_id: contaCancelando?.cliente_id || null,
                        caixa_id: caixaAtivo ? caixaAtivo.id : null,
                        usuario_id: usuario.id,
                        tipo_operacao: 'estorno',
                        valor_pago: 0.00,
                        forma_pagamento: 'Cancelamento Fiado',
                        saldo_anterior: contaCancelando?.saldo_devedor || 0,
                        saldo_apos: 0.00,
                        numero_documento: `CANC-DAV-${estornoInfo.id}`,
                        observacao: `Cancelamento de conta fiada: ${motivo}`,
                        data_pagamento: new Date().toISOString()
                    }]);

                mostrarNotificacao('Conta fiada cancelada e auditada com sucesso! Venda vinculada e estoque estornados.', 'success');

            } else if (estornoInfo.tipo === 'pagamento') {
                // Estornar um pagamento específico
                const pg = pagamentos.find(p => p.id === estornoInfo.id);
                if (!pg) throw new Error('Pagamento não localizado');

                const conta = contas.find(c => c.id === pg.conta_receber_id);
                if (!conta) throw new Error('Conta associada não localizada');

                const valEstorno = parseFloat(pg.valor_pago) || 0;
                const novoSaldo = (parseFloat(conta.saldo_devedor) || 0) + valEstorno;
                const novoTotalPago = Math.max(0, (parseFloat(conta.valor_pago) || 0) - valEstorno);
                const novoStatus = novoTotalPago > 0 ? 'aver_na_conta' : 'aberto';

                // 1. Marcar o pagamento original como cancelado
                await supabaseClient
                    .from('contas_receber_pagamentos')
                    .update({
                        cancelado: true,
                        cancelado_em: new Date().toISOString(),
                        cancelado_por: usuario.id,
                        motivo_cancelamento: motivo
                    })
                    .eq('id', pg.id);

                // 2. Gravar o lançamento de estorno no histórico
                await supabaseClient
                    .from('contas_receber_pagamentos')
                    .insert([{
                        loja_id: usuario.loja_id || 1,
                        conta_receber_id: conta.id,
                        saida_id: conta.saida_id,
                        cliente_id: conta.cliente_id,
                        caixa_id: caixaAtivo ? caixaAtivo.id : null,
                        usuario_id: usuario.id,
                        tipo_operacao: 'estorno',
                        valor_pago: -valEstorno,
                        forma_pagamento: pg.forma_pagamento,
                        saldo_anterior: conta.saldo_devedor,
                        saldo_apos: novoSaldo,
                        numero_documento: `EST-${pg.id}`,
                        observacao: `Estorno do pagamento ${pg.numero_documento || `#${pg.id}`}: ${motivo}`,
                        data_pagamento: new Date().toISOString()
                    }]);

                // 3. Atualizar a conta a receber
                await supabaseClient
                    .from('contas_receber')
                    .update({
                        valor_pago: novoTotalPago,
                        saldo_devedor: novoSaldo,
                        status: novoStatus,
                        data_quitacao: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', conta.id);

                mostrarNotificacao(`Pagamento estornado com sucesso! Saldo de ${formatarMoeda(valEstorno)} retornado à conta.`, 'success');
            }

            fecharModalEstorno();
            await carregarDados();

        } catch (e) {
            console.error('Erro ao efetuar estorno:', e);
            mostrarNotificacao('Erro ao processar estorno: ' + (e.message || 'Falha no banco'), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirmar Estorno';
        }
    });

    // 23. Exportação para Excel e PDF
    document.getElementById('btnExportarExcel')?.addEventListener('click', () => {
        if (typeof window.ExportHelper !== 'undefined') {
            const dadosExport = contas.map(c => ({
                'Documento': c.numero_documento || `DAV-${c.id}`,
                'Venda': c.saida_id || '-',
                'Cliente': c.cliente_nome || '-',
                'CPF': c.cliente_cpf || '-',
                'Data Venda': formatarData(c.data_venda),
                'Vencimento': formatarData(c.data_vencimento),
                'Valor Original (R$)': parseFloat(c.valor_original) || 0,
                'Total Pago (R$)': parseFloat(c.valor_pago) || 0,
                'Saldo Devedor (R$)': parseFloat(c.saldo_devedor) || 0,
                'Status': c.status
            }));
            window.ExportHelper.exportToExcel(dadosExport, 'Fiado_e_Contas_a_Receber');
        } else {
            mostrarNotificacao('Exportador Excel indisponível.', 'warning');
        }
    });

    document.getElementById('btnExportarPDF')?.addEventListener('click', () => {
        window.print();
    });

    // 24. Carregar Dados Inicialmente
    await carregarDados();

    // 25. Tratar parâmetros de URL (ex: fiado.html?cliente_id=X ou ?tab=tabExtratoCliente)
    const urlParams = new URLSearchParams(window.location.search);
    const paramClienteId = urlParams.get('cliente_id');
    const paramTab = urlParams.get('tab');

    if (paramClienteId) {
        ativarAba('tabExtratoCliente');
        const selCliExtrato = document.getElementById('selectClienteExtrato');
        if (selCliExtrato) {
            selCliExtrato.value = paramClienteId;
            await carregarExtratoCliente(paramClienteId);
        }
    } else if (paramTab) {
        ativarAba(paramTab);
    }
});
