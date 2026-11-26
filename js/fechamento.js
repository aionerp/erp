// js/fechamento.js
// Controle de abertura e fechamento diário de caixa — integrado com FechamentoCore e RelatorioFechamentoCaixa

let caixaAtivo = null;
let dadosVendasAtivo = null;
let registrosAtivo = { vendas: [], despesas: [], pagamentosFiado: [], categorias: {}, totalItens: 0 };
let usuarioEditouSaldoFinalAtivo = false;
const usuario = JSON.parse(sessionStorage.getItem('usuario'));

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

function formatarDataHora(dataISO) {
    if (!dataISO) return '-';
    const date = new Date(dataISO);
    return isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function escapeSafe(str) {
    if (window.FechamentoCore) return window.FechamentoCore.escapeHtmlSafe(str);
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isRegistroCancelado(obj) {
    if (window.FechamentoCore) return window.FechamentoCore.isRegistroCancelado(obj);
    if (!obj) return false;
    if (obj.cancelado === true || obj.cancelado === 'true' || obj.cancelado === 't' || obj.cancelado === 1 || obj.cancelado === '1') return true;
    if (obj.status === 'cancelado' || obj.status === 'cancelada') return true;
    if (obj.cancelado_em) return true;
    return false;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    if (typeof verificarPermissao === 'function' && !verificarPermissao('fechamento', 'ver')) {
        const contentEl = document.querySelector('.content') || document.querySelector('.main-content');
        if (contentEl) {
            contentEl.innerHTML = `
                <div style="text-align: center; padding: 50px;">
                    <h2>🔒 Acesso Negado</h2>
                    <p>Você não tem permissão para acessar o Fechamento de Caixa.</p>
                    <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Início</button>
                </div>
            `;
        }
        return;
    }

    await inicializarPagina();
});

async function inicializarPagina() {
    try {
        caixaAtivo = await obterCaixaAtivo();
    } catch (e) {
        exibirMensagemConfiguracaoSQL();
        return;
    }

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
        await exibirCaixaAberto(caixaAtivo);
    } else {
        await exibirCaixaFechado();
    }

    if (window.RelatorioFechamentoCaixa) {
        await window.RelatorioFechamentoCaixa.mount('fechamentoRelatorioContainer', {
            onDataChanged: async () => {
                if (!caixaAtivo) {
                    await atualizarCardUltimoCaixaFechado();
                }
            }
        });
    }
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
                    A tabela de controle de caixas (<code>caixas</code>) não foi encontrada no banco de dados.
                </p>
                <textarea readonly style="width: 100%; height: 230px; padding: 12px; font-family: monospace; font-size: 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: #faf9f6; resize: none; outline: none; margin-bottom: 20px;" onclick="this.select()">CREATE TABLE public.caixas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    data_abertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_fechamento TIMESTAMP WITH TIME ZONE,
    saldo_inicial NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    saldo_final NUMERIC(10, 2),
    saldo_esperado NUMERIC(10, 2),
    diferenca_caixa NUMERIC(10, 2),
    ajustes_fechamento JSONB DEFAULT '{}'::jsonb,
    observacao_fechamento TEXT,
    cancelado BOOLEAN DEFAULT false,
    cancelado_em TIMESTAMP WITH TIME ZONE,
    cancelado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    motivo_cancelamento TEXT,
    historico_fechamentos JSONB DEFAULT '[]'::jsonb,
    usuario_abertura_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_fechamento_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'aberto' NOT NULL CHECK (status IN ('aberto', 'fechado', 'cancelado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);</textarea>
                <button class="btn-acao-caixa btn-abrir" onclick="window.location.reload()">
                    🔄 Já executei o SQL, recarregar página
                </button>
            </div>
        `;
    }
}

async function atualizarCardUltimoCaixaFechado() {
    const infoEl = document.getElementById('ultimoCaixaInfo');
    if (!infoEl) return;

    try {
        const ultimoCaixa = await obterUltimoCaixaFechado();
        if (!ultimoCaixa) {
            infoEl.style.display = 'none';
            return;
        }
        infoEl.style.display = 'block';
        document.getElementById('uAberturaDate').textContent = formatarDataHora(ultimoCaixa.data_abertura);
        document.getElementById('uFechamentoDate').textContent = formatarDataHora(ultimoCaixa.data_fechamento);
        document.getElementById('uSaldoInicial').textContent = formatarMoeda(ultimoCaixa.saldo_inicial);
        document.getElementById('uSaldoFinal').textContent = formatarMoeda(ultimoCaixa.saldo_final);

        const btnVisualizar = document.getElementById('btnVisualizarUltimoRelatorio');
        if (btnVisualizar) {
            btnVisualizar.onclick = () => {
                if (window.RelatorioFechamentoCaixa) {
                    window.RelatorioFechamentoCaixa.visualizarFechamento(ultimoCaixa.id);
                }
            };
        }

        const btnImprimir = document.getElementById('btnImprimirUltimoRelatorio');
        if (btnImprimir) {
            btnImprimir.onclick = () => {
                imprimirRelatorioPorCaixa(ultimoCaixa);
            };
        }

        const btnCancelar = document.getElementById('btnCancelarUltimoRelatorio');
        if (btnCancelar) {
            const podeCancelar = typeof verificarPermissao !== 'function' || verificarPermissao('fechamento', 'cancelar') || verificarPermissao('fechamento', 'fechar');
            btnCancelar.style.display = podeCancelar ? 'inline-flex' : 'none';
            btnCancelar.onclick = () => {
                if (window.RelatorioFechamentoCaixa) {
                    window.RelatorioFechamentoCaixa.abrirModalCancelarFechamento(ultimoCaixa.id);
                }
            };
        }
    } catch (e) {
        console.error('Erro ao carregar último caixa:', e);
    }
}

async function exibirCaixaFechado() {
    const bannerExistente = document.getElementById('bannerCaixaPendente');
    if (bannerExistente) bannerExistente.remove();

    const statusBadge = document.getElementById('statusCaixaBadge');
    if (statusBadge) statusBadge.innerHTML = '<span class="status-badge fechado">🔴 Caixa Fechado</span>';

    document.getElementById('aberturaSeccion').style.display = 'block';
    document.getElementById('fechamentoSeccion').style.display = 'none';

    const btnAbrir = document.getElementById('btnAbrirCaixa');
    if (btnAbrir) btnAbrir.onclick = abrirCaixa;

    await atualizarCardUltimoCaixaFechado();
}

async function abrirCaixa() {
    if (typeof verificarPermissao === 'function' && !verificarPermissao('fechamento', 'abrir')) {
        mostrarNotificacao('Acesso negado: Você não tem permissão para abrir o caixa.', 'error');
        return;
    }

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
        const statusAtual = await obterStatusCaixa();
        if (statusAtual.tipo === 'pendente_fechamento_anterior') {
            mostrarNotificacao('⚠️ Não é possível abrir um novo caixa: existe um caixa de ' + formatarDataHora(statusAtual.caixa.data_abertura) + ' que precisa ser fechado primeiro!', 'error');
            btn.disabled = false;
            btn.textContent = '🔓 Abrir Caixa do Dia';
            setTimeout(() => window.location.reload(), 1500);
            return;
        }
        if (statusAtual.tipo === 'aberto_hoje') {
            mostrarNotificacao('⚠️ O caixa de hoje já está aberto!', 'warning');
            btn.disabled = false;
            btn.textContent = '🔓 Abrir Caixa do Dia';
            setTimeout(() => window.location.reload(), 1500);
            return;
        }

        const payloadCaixa = {
            saldo_inicial: saldoInicial,
            usuario_abertura_id: usuario.id,
            status: 'aberto',
            data_abertura: new Date().toISOString()
        };
        if (usuario.loja_id) {
            payloadCaixa.loja_id = usuario.loja_id;
        }

        const { error } = await supabaseClient
            .from('caixas')
            .insert([payloadCaixa]);

        if (error) throw error;

        mostrarNotificacao('✅ Caixa aberto com sucesso!', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 900);
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
    const isPendente = isCaixaDiaAnterior(caixa);
    const statusBadge = document.getElementById('statusCaixaBadge');

    const bannerExistente = document.getElementById('bannerCaixaPendente');
    if (bannerExistente) bannerExistente.remove();

    if (isPendente) {
        if (statusBadge) statusBadge.innerHTML = '<span class="status-badge pendente">⚠️ Caixa Anterior Pendente</span>';

        const fechamentoSeccion = document.getElementById('fechamentoSeccion');
        const banner = document.createElement('div');
        banner.id = 'bannerCaixaPendente';
        banner.className = 'banner-aviso-pendente';
        banner.innerHTML = `
            <h4 style="margin: 0 0 8px 0; color: #b45309; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                ⚠️ Caixa do Dia Anterior Pendente de Fechamento
            </h4>
            <p style="margin: 0; font-size: 13.5px; color: #78350f; line-height: 1.5;">
                Este caixa foi aberto em <strong>${formatarDataHora(caixa.data_abertura)}</strong> e não foi encerrado no mesmo dia.<br>
                Pelas regras do sistema, <strong>você precisa concluir o fechamento deste caixa anterior</strong> para poder abrir o caixa de hoje e iniciar as operações do novo dia.
            </p>
        `;
        if (fechamentoSeccion && fechamentoSeccion.parentNode) {
            fechamentoSeccion.parentNode.insertBefore(banner, fechamentoSeccion);
        }
    } else {
        if (statusBadge) statusBadge.innerHTML = '<span class="status-badge aberto">🟢 Caixa Aberto (Hoje)</span>';
    }

    document.getElementById('aberturaSeccion').style.display = 'none';
    document.getElementById('fechamentoSeccion').style.display = 'block';

    const btnFechar = document.getElementById('btnFecharCaixa');
    if (btnFechar) {
        if (isPendente) {
            btnFechar.innerHTML = '🔒 Fechar Caixa Anterior e Liberar Novo Dia';
            btnFechar.className = 'btn-acao-caixa btn-aviso';
        } else {
            btnFechar.innerHTML = '🔒 Fechar Caixa Diário';
            btnFechar.className = 'btn-acao-caixa btn-fechar';
        }
        btnFechar.onclick = fecharCaixa;
    }

    document.getElementById('cDataAbertura').textContent = formatarDataHora(caixa.data_abertura) + (isPendente ? ' (Pendente do Dia Anterior)' : '');
    document.getElementById('cSaldoInicial').textContent = formatarMoeda(caixa.saldo_inicial);

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
    document.getElementById('kpiFundoInicial').textContent = formatarMoeda(caixa.saldo_inicial);

    vincularListenersAjustesAtivo();
    await carregarVendasCaixa(caixa);
}

function lerAjustesAtivo() {
    return {
        suprimento: Math.max(0, parseFloat(document.getElementById('ajAtivoSuprimento')?.value) || 0),
        sangria: Math.max(0, parseFloat(document.getElementById('ajAtivoSangria')?.value) || 0),
        ajuste_dinheiro: parseFloat(document.getElementById('ajAtivoDinheiro')?.value) || 0,
        ajuste_cartao: parseFloat(document.getElementById('ajAtivoCartao')?.value) || 0,
        ajuste_pix: parseFloat(document.getElementById('ajAtivoPix')?.value) || 0,
        ajuste_outros: 0,
        ajuste_despesas: parseFloat(document.getElementById('ajAtivoDespesas')?.value) || 0,
        observacao: (document.getElementById('ajAtivoObservacao')?.value || '').trim()
    };
}

function recalcularResumoAtivoEmTela() {
    if (!caixaAtivo || !window.FechamentoCore) return null;
    const aj = lerAjustesAtivo();
    const elSaldoFinal = document.getElementById('saldoFinal');
    const calcTemp = window.FechamentoCore.calcularResumoFechamentoCaixa({
        saldoInicial: caixaAtivo.saldo_inicial,
        vendas: registrosAtivo.vendas,
        pagamentosFiado: registrosAtivo.pagamentosFiado,
        despesas: registrosAtivo.despesas,
        ajustes: aj
    });

    if (!usuarioEditouSaldoFinalAtivo && elSaldoFinal) {
        elSaldoFinal.value = Math.max(0, calcTemp.saldoEsperadoGaveta).toFixed(2);
    }

    const declaradoVal = parseFloat(elSaldoFinal?.value);
    const resumo = window.FechamentoCore.calcularResumoFechamentoCaixa({
        saldoInicial: caixaAtivo.saldo_inicial,
        saldoFinalDeclarado: isNaN(declaradoVal) ? 0 : declaradoVal,
        vendas: registrosAtivo.vendas,
        pagamentosFiado: registrosAtivo.pagamentosFiado,
        despesas: registrosAtivo.despesas,
        ajustes: aj
    });

    const elVendasDia = document.getElementById('kpiVendasDia');
    const elDespesasDia = document.getElementById('kpiDespesasDia');
    const elTotalCaixa = document.getElementById('kpiTotalCaixa');
    const elDescontos = document.getElementById('kpiDescontos');
    const elEsp = document.getElementById('ativoEsperadoGaveta');
    const elDif = document.getElementById('ativoDiferencaCaixa');

    if (elVendasDia) elVendasDia.textContent = formatarMoeda(resumo.totalVendas);
    if (elDespesasDia) elDespesasDia.textContent = formatarMoeda(resumo.totalDespesas + resumo.sangria);
    if (elTotalCaixa) elTotalCaixa.textContent = formatarMoeda(resumo.totalLiquidoGeral);
    if (elDescontos) elDescontos.textContent = formatarMoeda(resumo.totalDescontos);
    if (elEsp) elEsp.textContent = formatarMoeda(resumo.saldoEsperadoGaveta);
    if (elDif) {
        if (Math.abs(resumo.diferencaCaixa) < 0.005) {
            elDif.textContent = 'R$ 0,00 (Caixa Batido)';
            elDif.style.color = '#059669';
        } else if (resumo.diferencaCaixa > 0) {
            elDif.textContent = `+${formatarMoeda(resumo.diferencaCaixa)} (Sobra)`;
            elDif.style.color = '#1d4ed8';
        } else {
            elDif.textContent = `${formatarMoeda(resumo.diferencaCaixa)} (Quebra)`;
            elDif.style.color = '#dc2626';
        }
    }

    dadosVendasAtivo = {
        ...resumo,
        totalItens: registrosAtivo.totalItens,
        categorias: registrosAtivo.categorias,
        despesas: registrosAtivo.despesas
    };

    renderizarFormasPagamento(resumo.formasPagamento);
    return resumo;
}

function vincularListenersAjustesAtivo() {
    ['ajAtivoSuprimento', 'ajAtivoSangria', 'ajAtivoDinheiro', 'ajAtivoCartao', 'ajAtivoPix', 'ajAtivoDespesas'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.boundAtivo) {
            el.dataset.boundAtivo = '1';
            el.addEventListener('input', recalcularResumoAtivoEmTela);
        }
    });
    const elFinal = document.getElementById('saldoFinal');
    if (elFinal && !elFinal.dataset.boundAtivo) {
        elFinal.dataset.boundAtivo = '1';
        elFinal.addEventListener('input', () => {
            usuarioEditouSaldoFinalAtivo = true;
            recalcularResumoAtivoEmTela();
        });
    }
}

async function carregarVendasCaixa(caixa) {
    try {
        const [saidasRes, despesasRes, fiadoRes] = await Promise.all([
            supabaseClient.from('saidas').select('*'),
            supabaseClient.from('despesas').select('*'),
            supabaseClient.from('contas_receber_pagamentos').select('*')
        ]);

        const todasSaidas = (!saidasRes.error && saidasRes.data) ? saidasRes.data : [];
        const todasDespesas = (!despesasRes.error && despesasRes.data) ? despesasRes.data : [];
        const todosFiados = (!fiadoRes.error && fiadoRes.data) ? fiadoRes.data : [];

        const filtrados = window.FechamentoCore.filtrarRegistrosDoCaixa(caixa, {
            saidas: todasSaidas,
            despesas: todasDespesas,
            pagamentosFiado: todosFiados
        });

        const resumoBase = window.FechamentoCore.calcularResumoFechamentoCaixa({
            saldoInicial: caixa.saldo_inicial,
            vendas: filtrados.vendasFiltradas,
            pagamentosFiado: filtrados.fiadosFiltrados,
            despesas: filtrados.despesasFiltradas
        });

        let itens = [];
        let totalItens = 0;
        const vendaIds = resumoBase.vendaIds;
        if (vendaIds.length > 0) {
            try {
                const { data: itensData, error: errorItens } = await supabaseClient
                    .from('saida_itens')
                    .select('quantidade, subtotal, produto_id, produtos(nome, categoria)')
                    .in('saida_id', vendaIds.slice(0, 300));
                if (!errorItens && itensData) {
                    itens = itensData;
                } else {
                    const fallbackRes = await supabaseClient
                        .from('saida_itens')
                        .select('quantidade, subtotal, produto_id')
                        .in('saida_id', vendaIds.slice(0, 300));
                    if (fallbackRes.data) itens = fallbackRes.data;
                }
            } catch (errI) {
                console.warn('Aviso ao buscar itens para fechamento:', errI);
            }
        }

        const categorias = {};
        itens.forEach(item => {
            const qtd = Number(item.quantidade) || 0;
            const sub = Number(item.subtotal) || 0;
            totalItens += qtd;
            const cat = item.produtos?.categoria || 'Serviços e Produtos';
            if (!categorias[cat]) categorias[cat] = { qtd: 0, total: 0 };
            categorias[cat].qtd += qtd;
            categorias[cat].total += sub;
        });

        const elItensVendidos = document.getElementById('kpiItensVendidos');
        if (elItensVendidos) elItensVendidos.textContent = totalItens;

        registrosAtivo = {
            vendas: filtrados.vendasFiltradas,
            despesas: filtrados.despesasFiltradas,
            pagamentosFiado: filtrados.fiadosFiltrados,
            categorias,
            totalItens
        };

        usuarioEditouSaldoFinalAtivo = false;
        recalcularResumoAtivoEmTela();
        renderizarVendasPorPlano(categorias);
        renderizarDespesas(filtrados.despesasFiltradas);
    } catch (e) {
        console.error('Erro ao carregar vendas do caixa:', e);
        mostrarNotificacao('Erro ao carregar dados de vendas: ' + e.message, 'error');
    }
}

function renderizarFormasPagamento(formasPagamento) {
    const tbody = document.querySelector('#tabelaPagamentos tbody');
    if (!tbody) return;

    const keys = Object.keys(formasPagamento || {});
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--gray);">Nenhuma venda registrada neste caixa</td></tr>`;
        return;
    }

    tbody.innerHTML = keys.map(key => `
        <tr>
            <td><strong>${escapeSafe(key)}</strong></td>
            <td style="text-align: right; font-weight: 700; color: var(--success);">${formatarMoeda(formasPagamento[key])}</td>
        </tr>
    `).join('');
}

function renderizarVendasPorPlano(categorias) {
    const tbody = document.querySelector('#tabelaPlanos tbody');
    if (!tbody) return;

    const keys = Object.keys(categorias).filter(cat => categorias[cat].qtd > 0 || categorias[cat].total > 0);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--gray);">Nenhum item vendido neste caixa</td></tr>`;
        return;
    }

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
                <td>${isPlano ? '📱 ' : ''}<strong>${escapeSafe(cat)}</strong></td>
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
            <td><strong>${escapeSafe(d.descricao)}</strong><br><small style="color:var(--gray);">${escapeSafe(d.categoria || 'Sem categoria')}</small></td>
            <td>${new Date(d.created_at || d.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="status-badge ${d.status === 'pago' ? 'aberto' : 'fechado'}" style="padding: 2px 8px; font-size: 11px;">${d.status === 'pago' ? 'Pago' : 'Pendente'}</span></td>
            <td style="text-align: right; font-weight: 700; color: #dc2626;">- ${formatarMoeda(d.valor)}</td>
        </tr>
    `).join('');
}

async function fecharCaixa() {
    if (typeof verificarPermissao === 'function' && !verificarPermissao('fechamento', 'fechar')) {
        mostrarNotificacao('Acesso negado: Você não tem permissão para fechar o caixa.', 'error');
        return;
    }

    const saldoFinalInput = document.getElementById('saldoFinal');
    const saldoFinal = parseFloat(saldoFinalInput.value) || 0;

    if (saldoFinal < 0) {
        mostrarNotificacao('O saldo final não pode ser menor que zero!', 'error');
        return;
    }

    const isPendente = isCaixaDiaAnterior(caixaAtivo);
    const msgConfirm = isPendente
        ? 'Deseja realmente fechar o caixa do dia anterior? Após o fechamento, você poderá abrir o caixa de hoje para iniciar as operações do novo dia.'
        : 'Deseja realmente fechar o caixa? Esta ação impedirá novas vendas hoje.';

    if (!confirm(msgConfirm)) {
        return;
    }

    const btn = document.getElementById('btnFecharCaixa');
    btn.disabled = true;
    btn.textContent = '⏳ Fechando caixa...';

    try {
        const resumoFinal = recalcularResumoAtivoEmTela();
        const aj = lerAjustesAtivo();
        const dataFechamento = new Date().toISOString();

        const { error } = await supabaseClient
            .from('caixas')
            .update({
                saldo_final: saldoFinal,
                saldo_esperado: resumoFinal ? resumoFinal.saldoEsperadoGaveta : saldoFinal,
                diferenca_caixa: resumoFinal ? resumoFinal.diferencaCaixa : 0,
                ajustes_fechamento: aj,
                observacao_fechamento: aj.observacao || null,
                usuario_fechamento_id: usuario.id,
                status: 'fechado',
                cancelado: false,
                data_fechamento: dataFechamento
            })
            .eq('id', caixaAtivo.id);

        if (error) throw error;

        if (isPendente) {
            try {
                await supabaseClient
                    .from('caixas')
                    .update({
                        saldo_final: 0,
                        usuario_fechamento_id: usuario.id,
                        status: 'fechado',
                        data_fechamento: dataFechamento
                    })
                    .eq('status', 'aberto');
            } catch (eGhosts) {
                console.warn('Aviso ao sincronizar caixas anteriores:', eGhosts);
            }
        }

        mostrarNotificacao(isPendente
            ? '🔒 Caixa anterior fechado com sucesso! Agora você pode abrir o caixa de hoje.'
            : '🔒 Caixa fechado com sucesso!', 'success');

        const imprimir = confirm('Deseja imprimir o Relatório de Fechamento de Caixa?');
        if (imprimir) {
            const nomeOperador = document.getElementById('cUsuarioAbertura').textContent;
            caixaAtivo.data_fechamento = dataFechamento;
            caixaAtivo.saldo_final = saldoFinal;
            caixaAtivo.saldo_esperado = resumoFinal ? resumoFinal.saldoEsperadoGaveta : saldoFinal;
            caixaAtivo.diferenca_caixa = resumoFinal ? resumoFinal.diferencaCaixa : 0;
            caixaAtivo.ajustes_fechamento = aj;
            caixaAtivo.observacao_fechamento = aj.observacao || null;
            imprimirRelatorioFechamento(caixaAtivo, dadosVendasAtivo, nomeOperador);
        }

        setTimeout(() => {
            window.location.reload();
        }, 1200);
    } catch (e) {
        console.error('Erro ao fechar caixa:', e);
        mostrarNotificacao('Erro ao fechar caixa: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = isPendente ? '🔒 Fechar Caixa Anterior e Liberar Novo Dia' : '🔒 Fechar Caixa Diário';
    }
}

function imprimirRelatorioFechamento(caixa, dadosVendas, nomeOperador) {
    if (window.RelatorioFechamentoCaixa) {
        window.RelatorioFechamentoCaixa.imprimirCupomTermico({
            caixa,
            resumo: dadosVendas,
            despesas: dadosVendas.despesas || [],
            categorias: dadosVendas.categorias || {},
            totalItens: dadosVendas.totalItens || 0,
            nomeAbertura: nomeOperador,
            historico: Array.isArray(caixa.historico_fechamentos) ? caixa.historico_fechamentos : []
        });
    }
}

async function imprimirRelatorioPorCaixa(caixa) {
    if (!caixa) return;
    if (window.RelatorioFechamentoCaixa) {
        await window.RelatorioFechamentoCaixa.reimprimirFechamento(caixa.id, 'termico');
    }
}
