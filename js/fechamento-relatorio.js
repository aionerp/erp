// js/fechamento-relatorio.js
// Módulo unificado de Relatório de Fechamento de Caixa, Visualização, Reimpressão,
// Cancelamento e Novo Fechamento Imediato com Ajuste de Valores (Aion ERP)

(function(root) {
    'use strict';

    // =========================================================================
    // 1. NÚCLEO PURO DE CÁLCULOS E REGRAS DE NEGÓCIO (Testável em Node e Browser)
    // =========================================================================

    function toCents(val) {
        const num = Number(val);
        if (!Number.isFinite(num)) return 0;
        return Math.round(num * 100);
    }

    function fromCents(cents) {
        return Math.round(Number(cents) || 0) / 100;
    }

    function escapeHtmlSafe(str) {
        if (str === null || str === undefined) return '';
        if (typeof window !== 'undefined' && window.Security && typeof window.Security.sanitizeHtml === 'function') {
            return window.Security.sanitizeHtml(str);
        }
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatarMoeda(valor) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
    }

    function formatarDataHora(dataISO) {
        if (!dataISO) return '-';
        const d = new Date(dataISO);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('pt-BR');
    }

    function isRegistroCancelado(obj) {
        if (!obj) return false;
        if (obj.cancelado === true || obj.cancelado === 'true' || obj.cancelado === 't' || obj.cancelado === 1 || obj.cancelado === '1') return true;
        if (obj.status === 'cancelado' || obj.status === 'cancelada') return true;
        if (obj.cancelado_em) return true;
        return false;
    }

    function isVendaFiado(formaPagamento) {
        if (!formaPagamento) return false;
        const fp = String(formaPagamento).toLowerCase();
        return fp.includes('a pagar') || fp.includes('(f)');
    }

    function classificarFormaPagamento(formaPagamento) {
        const fp = String(formaPagamento || '').toLowerCase();
        if (fp.includes('dinheiro')) return 'dinheiro';
        if (fp.includes('pix')) return 'pix';
        if (fp.includes('cart') || fp.includes('credito') || fp.includes('crédito') || fp.includes('debito') || fp.includes('débito')) return 'cartao';
        return 'outros';
    }

    function normalizarAjustesFechamento(raw) {
        let obj = raw;
        if (typeof raw === 'string') {
            try { obj = JSON.parse(raw); } catch (e) { obj = {}; }
        }
        if (!obj || typeof obj !== 'object') obj = {};

        return {
            suprimento: Math.max(0, Number(obj.suprimento) || 0),
            sangria: Math.max(0, Number(obj.sangria) || 0),
            ajuste_dinheiro: Number(obj.ajuste_dinheiro) || 0,
            ajuste_cartao: Number(obj.ajuste_cartao) || 0,
            ajuste_pix: Number(obj.ajuste_pix) || 0,
            ajuste_outros: Number(obj.ajuste_outros) || 0,
            ajuste_despesas: Number(obj.ajuste_despesas) || 0,
            observacao: obj.observacao ? String(obj.observacao) : ''
        };
    }

    function temAjustesAplicados(rawAjustes) {
        const a = normalizarAjustesFechamento(rawAjustes);
        return (
            a.suprimento !== 0 ||
            a.sangria !== 0 ||
            a.ajuste_dinheiro !== 0 ||
            a.ajuste_cartao !== 0 ||
            a.ajuste_pix !== 0 ||
            a.ajuste_outros !== 0 ||
            a.ajuste_despesas !== 0
        );
    }

    function filtrarRegistrosDoCaixa(caixa, { saidas = [], despesas = [], pagamentosFiado = [] } = {}) {
        const dataAbertura = new Date(caixa.data_abertura);
        const dataFechamento = caixa.data_fechamento ? new Date(caixa.data_fechamento) : null;
        const dataAberturaStr = caixa.data_abertura ? String(caixa.data_abertura).substring(0, 10) : '';

        const vendasFiltradas = (saidas || []).filter(v => {
            if (isRegistroCancelado(v)) return false;
            if (v.caixa_id !== null && v.caixa_id !== undefined && String(v.caixa_id) === String(caixa.id)) {
                return true;
            }
            if (!v.caixa_id) {
                const dtVenda = v.data_finalizacao ? new Date(v.data_finalizacao) : (v.created_at ? new Date(v.created_at) : null);
                if (dtVenda && !isNaN(dtVenda.getTime())) {
                    if (dtVenda >= dataAbertura && (!dataFechamento || dtVenda <= dataFechamento)) {
                        return true;
                    }
                }
                if (v.data && dataAberturaStr && String(v.data).substring(0, 10) === dataAberturaStr) {
                    return true;
                }
            }
            return false;
        });

        const despesasFiltradas = (despesas || []).filter(d => {
            if (isRegistroCancelado(d)) return false;
            if (d.caixa_id !== null && d.caixa_id !== undefined && String(d.caixa_id) === String(caixa.id)) {
                return true;
            }
            const dt = d.data_pagamento ? new Date(d.data_pagamento) : (d.created_at ? new Date(d.created_at) : (d.data ? new Date(d.data) : null));
            if (dt && !isNaN(dt.getTime())) {
                if (dt >= dataAbertura && (!dataFechamento || dt <= dataFechamento)) {
                    return true;
                }
            }
            if (d.data && dataAberturaStr && String(d.data).substring(0, 10) === dataAberturaStr) {
                return true;
            }
            return false;
        });

        const fiadosFiltrados = (pagamentosFiado || []).filter(p => {
            if (isRegistroCancelado(p) || p.tipo_operacao === 'venda_realizada' || p.tipo_operacao === 'estorno') return false;
            if (p.caixa_id !== null && p.caixa_id !== undefined && String(p.caixa_id) === String(caixa.id)) return true;
            if (!p.caixa_id) {
                const dt = p.data_pagamento ? new Date(p.data_pagamento) : null;
                if (dt && !isNaN(dt.getTime())) {
                    if (dt >= dataAbertura && (!dataFechamento || dt <= dataFechamento)) return true;
                }
            }
            return false;
        });

        return { vendasFiltradas, despesasFiltradas, fiadosFiltrados };
    }

    function calcularResumoFechamentoCaixa({
        saldoInicial = 0,
        saldoFinalDeclarado = null,
        vendas = [],
        pagamentosFiado = [],
        despesas = [],
        ajustes = {}
    } = {}) {
        const aj = normalizarAjustesFechamento(ajustes);
        const saldoInicialCents = toCents(saldoInicial);

        let totalVendasSistemaCents = 0;
        let totalDescontosCents = 0;
        let dinheiroSistemaCents = 0;
        let cartaoSistemaCents = 0;
        let pixSistemaCents = 0;
        let outrosSistemaCents = 0;
        const formasPagamentoCents = {};
        const vendaIds = [];

        (vendas || []).forEach(v => {
            if (isRegistroCancelado(v)) return;
            const valTotalCents = toCents(v.total);
            const valDescCents = toCents(v.desconto);
            const fp = v.forma_pagamento || 'Outro / Não Informado';
            const fiado = isVendaFiado(fp);

            totalDescontosCents += valDescCents;
            vendaIds.push(v.id);

            formasPagamentoCents[fp] = (formasPagamentoCents[fp] || 0) + valTotalCents;

            if (!fiado) {
                totalVendasSistemaCents += valTotalCents;
                const bucket = classificarFormaPagamento(fp);
                if (bucket === 'dinheiro') dinheiroSistemaCents += valTotalCents;
                else if (bucket === 'cartao') cartaoSistemaCents += valTotalCents;
                else if (bucket === 'pix') pixSistemaCents += valTotalCents;
                else outrosSistemaCents += valTotalCents;
            }
        });

        (pagamentosFiado || []).forEach(p => {
            if (isRegistroCancelado(p) || p.tipo_operacao === 'venda_realizada' || p.tipo_operacao === 'estorno') return;
            const valPagoCents = toCents(p.valor_pago);
            const fpBase = p.forma_pagamento || 'Dinheiro';
            const fpKey = `${fpBase} (Receb. Fiado)`;

            totalVendasSistemaCents += valPagoCents;
            formasPagamentoCents[fpKey] = (formasPagamentoCents[fpKey] || 0) + valPagoCents;

            const bucket = classificarFormaPagamento(fpBase);
            if (bucket === 'dinheiro') dinheiroSistemaCents += valPagoCents;
            else if (bucket === 'cartao') cartaoSistemaCents += valPagoCents;
            else if (bucket === 'pix') pixSistemaCents += valPagoCents;
            else outrosSistemaCents += valPagoCents;
        });

        let totalDespesasSistemaCents = 0;
        (despesas || []).forEach(d => {
            if (isRegistroCancelado(d)) return;
            totalDespesasSistemaCents += toCents(d.valor);
        });

        const suprimentoCents = toCents(aj.suprimento);
        const sangriaCents = toCents(aj.sangria);
        const ajDinheiroCents = toCents(aj.ajuste_dinheiro);
        const ajCartaoCents = toCents(aj.ajuste_cartao);
        const ajPixCents = toCents(aj.ajuste_pix);
        const ajOutrosCents = toCents(aj.ajuste_outros);
        const ajDespesasCents = toCents(aj.ajuste_despesas);

        const totalAjustesVendasCents = ajDinheiroCents + ajCartaoCents + ajPixCents + ajOutrosCents;
        const totalVendasAjustadoCents = Math.max(0, totalVendasSistemaCents + totalAjustesVendasCents);
        const totalDespesasAjustadoCents = Math.max(0, totalDespesasSistemaCents + ajDespesasCents);

        const dinheiroAjustadoCents = dinheiroSistemaCents + ajDinheiroCents;
        const cartaoAjustadoCents = cartaoSistemaCents + ajCartaoCents;
        const pixAjustadoCents = pixSistemaCents + ajPixCents;
        const outrosAjustadoCents = outrosSistemaCents + ajOutrosCents;

        // Saldo esperado na gaveta física: Saldo Inicial + Dinheiro + Suprimento - Despesas - Sangria
        const saldoEsperadoGavetaCents =
            saldoInicialCents +
            dinheiroAjustadoCents +
            suprimentoCents -
            totalDespesasAjustadoCents -
            sangriaCents;

        // Total líquido geral (inclui todas as formas de pagamento + suprimento - despesas - sangria)
        const totalLiquidoGeralCents =
            saldoInicialCents +
            totalVendasAjustadoCents +
            suprimentoCents -
            totalDespesasAjustadoCents -
            sangriaCents;

        const formasPagamento = {};
        Object.keys(formasPagamentoCents).forEach(k => {
            formasPagamento[k] = fromCents(formasPagamentoCents[k]);
        });
        if (ajDinheiroCents !== 0) formasPagamento['Ajuste Manual (Dinheiro)'] = fromCents(ajDinheiroCents);
        if (ajCartaoCents !== 0) formasPagamento['Ajuste Manual (Cartão)'] = fromCents(ajCartaoCents);
        if (ajPixCents !== 0) formasPagamento['Ajuste Manual (PIX)'] = fromCents(ajPixCents);
        if (ajOutrosCents !== 0) formasPagamento['Ajuste Manual (Outros)'] = fromCents(ajOutrosCents);

        const saldoEsperadoGaveta = fromCents(saldoEsperadoGavetaCents);
        const temDeclarado = saldoFinalDeclarado !== null && saldoFinalDeclarado !== undefined && saldoFinalDeclarado !== '';
        const saldoFinalCents = temDeclarado ? toCents(saldoFinalDeclarado) : saldoEsperadoGavetaCents;
        const diferencaCents = temDeclarado ? (saldoFinalCents - saldoEsperadoGavetaCents) : 0;

        return {
            saldoInicial: fromCents(saldoInicialCents),
            totalVendasSistema: fromCents(totalVendasSistemaCents),
            totalVendas: fromCents(totalVendasAjustadoCents),
            totalDescontos: fromCents(totalDescontosCents),
            totalDespesasSistema: fromCents(totalDespesasSistemaCents),
            totalDespesas: fromCents(totalDespesasAjustadoCents),
            dinheiroSistema: fromCents(dinheiroSistemaCents),
            cartaoSistema: fromCents(cartaoSistemaCents),
            pixSistema: fromCents(pixSistemaCents),
            outrosSistema: fromCents(outrosSistemaCents),
            dinheiroAjustado: fromCents(dinheiroAjustadoCents),
            cartaoAjustado: fromCents(cartaoAjustadoCents),
            pixAjustado: fromCents(pixAjustadoCents),
            outrosAjustado: fromCents(outrosAjustadoCents),
            suprimento: fromCents(suprimentoCents),
            sangria: fromCents(sangriaCents),
            totalAjustesVendas: fromCents(totalAjustesVendasCents),
            saldoEsperadoGaveta,
            totalLiquidoGeral: fromCents(totalLiquidoGeralCents),
            saldoFinalDeclarado: temDeclarado ? fromCents(saldoFinalCents) : null,
            diferencaCaixa: fromCents(diferencaCents),
            formasPagamento,
            ajustes: aj,
            vendaIds
        };
    }

    function criarSnapshotCancelamento(caixa, resumo, usuarioCancelamento, motivo, dataCancelamentoISO) {
        let historicoAtual = [];
        if (Array.isArray(caixa.historico_fechamentos)) {
            historicoAtual = caixa.historico_fechamentos.slice();
        } else if (typeof caixa.historico_fechamentos === 'string') {
            try {
                const parsed = JSON.parse(caixa.historico_fechamentos);
                if (Array.isArray(parsed)) historicoAtual = parsed;
            } catch (e) {}
        }

        const esperado = caixa.saldo_esperado !== null && caixa.saldo_esperado !== undefined
            ? Number(caixa.saldo_esperado)
            : (resumo ? resumo.saldoEsperadoGaveta : 0);
        const declarado = caixa.saldo_final !== null && caixa.saldo_final !== undefined
            ? Number(caixa.saldo_final)
            : 0;
        const diferenca = caixa.diferenca_caixa !== null && caixa.diferenca_caixa !== undefined
            ? Number(caixa.diferenca_caixa)
            : fromCents(toCents(declarado) - toCents(esperado));

        const snapshot = {
            tentativa: historicoAtual.length + 1,
            data_fechamento: caixa.data_fechamento || null,
            usuario_fechamento_id: caixa.usuario_fechamento_id || null,
            usuario_fechamento_nome: caixa._usuario_fechamento_nome || null,
            saldo_inicial: Number(caixa.saldo_inicial) || 0,
            saldo_final: declarado,
            saldo_esperado: esperado,
            diferenca_caixa: diferenca,
            total_vendas: resumo ? resumo.totalVendas : 0,
            total_despesas: resumo ? resumo.totalDespesas : 0,
            ajustes_fechamento: normalizarAjustesFechamento(caixa.ajustes_fechamento),
            observacao_fechamento: caixa.observacao_fechamento || null,
            cancelado_em: dataCancelamentoISO || new Date().toISOString(),
            cancelado_por: usuarioCancelamento?.id || null,
            cancelado_por_nome: usuarioCancelamento?.nome || 'Operador',
            motivo_cancelamento: String(motivo || '').trim()
        };

        return [...historicoAtual, snapshot];
    }

    const FechamentoCore = {
        toCents,
        fromCents,
        escapeHtmlSafe,
        formatarMoeda,
        formatarDataHora,
        isRegistroCancelado,
        isVendaFiado,
        classificarFormaPagamento,
        normalizarAjustesFechamento,
        temAjustesAplicados,
        filtrarRegistrosDoCaixa,
        calcularResumoFechamentoCaixa,
        criarSnapshotCancelamento
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FechamentoCore;
    }

    if (typeof window === 'undefined') {
        return;
    }

    window.FechamentoCore = FechamentoCore;

    // =========================================================================
    // 2. INTERFACE E ORQUESTRAÇÃO DO RELATÓRIO DE FECHAMENTO DE CAIXA
    // =========================================================================

    const state = {
        mountId: null,
        onDataChanged: null,
        caixas: [],
        caixasProcessados: [],
        saidas: [],
        despesas: [],
        pagamentosFiado: [],
        usuariosMap: {},
        usuariosLista: [],
        filtros: {
            dataInicio: '',
            dataFim: '',
            status: 'todos',
            operadorId: 'todos',
            busca: ''
        },
        carregado: false
    };

    function getUsuarioLogado() {
        try {
            return JSON.parse(sessionStorage.getItem('usuario'));
        } catch (e) {
            return null;
        }
    }

    function getDataLocalHoje() {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function getDataLocalTrintaDiasAtras() {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function toDateTimeLocalValue(isoStr) {
        const d = isoStr ? new Date(isoStr) : new Date();
        if (isNaN(d.getTime())) return '';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function podeCancelarFechamento() {
        if (typeof verificarPermissao !== 'function') return true;
        return verificarPermissao('fechamento', 'cancelar') || verificarPermissao('fechamento', 'fechar');
    }

    function podeFecharCaixa() {
        if (typeof verificarPermissao !== 'function') return true;
        return verificarPermissao('fechamento', 'fechar');
    }

    function notificar(msg, tipo = 'info') {
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao(msg, tipo);
        } else {
            alert(msg);
        }
    }

    function parseHistorico(caixa) {
        if (!caixa) return [];
        if (Array.isArray(caixa.historico_fechamentos)) return caixa.historico_fechamentos;
        if (typeof caixa.historico_fechamentos === 'string') {
            try {
                const parsed = JSON.parse(caixa.historico_fechamentos);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    function getNomeUsuario(userId) {
        if (!userId) return 'Não informado';
        return state.usuariosMap[String(userId)] || `Usuário #${userId}`;
    }

    // Injeta estilos específicos do relatório e modais apenas 1 vez
    function ensureStyles() {
        if (document.getElementById('fechamento-relatorio-styles')) return;
        const style = document.createElement('style');
        style.id = 'fechamento-relatorio-styles';
        style.textContent = `
            .fr-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                flex-wrap: wrap;
                gap: 14px;
                margin-bottom: 18px;
            }
            .fr-filtros {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
                background: #f8fafc;
                padding: 12px 14px;
                border-radius: 10px;
                border: 1px solid var(--border);
                margin-bottom: 18px;
            }
            .fr-filtros label {
                font-size: 11px;
                font-weight: 700;
                color: var(--gray);
                text-transform: uppercase;
                display: block;
                margin-bottom: 3px;
            }
            .fr-filtros input,
            .fr-filtros select {
                padding: 7px 10px;
                border: 1px solid var(--border);
                border-radius: 6px;
                font-size: 13px;
                background: #fff;
                color: var(--dark);
            }
            .fr-kpis {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
                gap: 12px;
                margin-bottom: 18px;
            }
            .fr-kpi-card {
                background: #fff;
                border: 1px solid var(--border);
                border-top: 4px solid var(--primary);
                border-radius: 10px;
                padding: 14px 16px;
                box-shadow: var(--shadow-xs);
            }
            .fr-kpi-label {
                font-size: 11px;
                font-weight: 700;
                color: var(--gray);
                text-transform: uppercase;
                margin-bottom: 4px;
            }
            .fr-kpi-val {
                font-size: 20px;
                font-weight: 800;
                color: var(--dark);
            }
            .fr-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 3px 9px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
            }
            .fr-badge-fechado { background: #dcfce7; color: #166534; }
            .fr-badge-refechado { background: #dbeafe; color: #1e40af; }
            .fr-badge-cancelado { background: #fee2e2; color: #991b1b; }
            .fr-badge-aberto { background: #fef3c7; color: #92400e; }
            .fr-badge-diff-ok { background: #dcfce7; color: #166534; }
            .fr-badge-diff-sobra { background: #dbeafe; color: #1e40af; }
            .fr-badge-diff-quebra { background: #fee2e2; color: #991b1b; }
            .fr-acoes {
                display: flex;
                gap: 6px;
                justify-content: center;
                flex-wrap: wrap;
            }
            .fr-btn-sm {
                padding: 5px 10px;
                border-radius: 6px;
                border: 1px solid transparent;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: opacity 0.15s ease, transform 0.1s ease;
                white-space: nowrap;
            }
            .fr-btn-sm:hover { opacity: 0.9; transform: translateY(-1px); }
            .fr-btn-ver { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
            .fr-btn-print { background: #0d1728; color: #fff; }
            .fr-btn-cancel { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
            .fr-btn-refechar { background: #10b981; color: #fff; }
            .fr-modal-lg .modal-content { max-width: 920px; width: 95%; }
            .fr-modal-md .modal-content { max-width: 640px; width: 95%; }
            .fr-grid-2 {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 12px;
            }
            .fr-grid-3 {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
                gap: 10px;
            }
            .fr-box {
                background: #f8fafc;
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 12px;
            }
            .fr-field label {
                display: block;
                font-size: 12px;
                font-weight: 600;
                color: var(--dark-light);
                margin-bottom: 4px;
            }
            .fr-field input,
            .fr-field textarea {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid var(--border);
                border-radius: 6px;
                font-size: 13.5px;
                font-family: inherit;
                box-sizing: border-box;
            }
            .fr-field input:focus,
            .fr-field textarea:focus {
                outline: none;
                border-color: var(--accent);
            }
            .fr-resumo-live {
                background: #eff6ff;
                border: 1px solid #bfdbfe;
                border-radius: 10px;
                padding: 14px;
                margin: 14px 0;
            }
            .fr-history-card {
                background: #fff7ed;
                border: 1px solid #fed7aa;
                border-left: 4px solid #ea580c;
                border-radius: 8px;
                padding: 10px 12px;
                margin-bottom: 8px;
                font-size: 12.5px;
            }
            [data-theme="dark"] .fr-filtros,
            [data-theme="dark"] .fr-box,
            body.dark-theme .fr-filtros,
            body.dark-theme .fr-box {
                background: #1e293b;
                border-color: #334155;
            }
            [data-theme="dark"] .fr-kpi-card,
            body.dark-theme .fr-kpi-card {
                background: #1e293b;
                border-color: #334155;
            }
            [data-theme="dark"] .fr-filtros input,
            [data-theme="dark"] .fr-filtros select,
            [data-theme="dark"] .fr-field input,
            [data-theme="dark"] .fr-field textarea,
            body.dark-theme .fr-filtros input,
            body.dark-theme .fr-filtros select,
            body.dark-theme .fr-field input,
            body.dark-theme .fr-field textarea {
                background: #0f172a;
                color: #f1f5f9;
                border-color: #334155;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureModals() {
        ensureStyles();
        if (document.getElementById('modalVisualizarFechamento')) return;

        const container = document.createElement('div');
        container.id = 'frModalsRoot';
        container.innerHTML = `
            <!-- Modal 1: Visualizar Fechamento -->
            <div id="modalVisualizarFechamento" class="modal fr-modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="frVisTitle">📊 Relatório de Fechamento</h2>
                        <button type="button" class="close" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalVisualizarFechamento')">&times;</button>
                    </div>
                    <div class="modal-body" id="frVisBody"></div>
                    <div class="modal-footer" id="frVisFooter"></div>
                </div>
            </div>

            <!-- Modal 2: Confirmar Cancelamento de Fechamento -->
            <div id="modalCancelarFechamento" class="modal fr-modal-md">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="frCancelTitle">❌ Cancelar Fechamento de Caixa</h2>
                        <button type="button" class="close" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalCancelarFechamento')">&times;</button>
                    </div>
                    <div class="modal-body" id="frCancelBody"></div>
                    <div class="modal-footer" id="frCancelFooter"></div>
                </div>
            </div>

            <!-- Modal 3: Novo Fechamento Imediato com Ajuste de Valores -->
            <div id="modalNovoFechamento" class="modal fr-modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="frNovoTitle">🔄 Novo Fechamento com Ajuste de Valores</h2>
                        <button type="button" class="close" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalNovoFechamento')">&times;</button>
                    </div>
                    <div class="modal-body" id="frNovoBody"></div>
                    <div class="modal-footer" id="frNovoFooter"></div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }

    function abrirModal(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    }

    function fecharModal(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }

    // Carrega detalhes completos (itens + seriais) de um caixa específico para visualização/impressão
    async function carregarDetalhesCompletosCaixa(caixa) {
        const { vendasFiltradas, despesasFiltradas, fiadosFiltrados } = filtrarRegistrosDoCaixa(caixa, {
            saidas: state.saidas,
            despesas: state.despesas,
            pagamentosFiado: state.pagamentosFiado
        });

        const resumo = calcularResumoFechamentoCaixa({
            saldoInicial: caixa.saldo_inicial,
            saldoFinalDeclarado: caixa.saldo_final,
            vendas: vendasFiltradas,
            pagamentosFiado: fiadosFiltrados,
            despesas: despesasFiltradas,
            ajustes: caixa.ajustes_fechamento
        });

        let itens = [];
        const vendaIds = resumo.vendaIds;
        if (vendaIds.length > 0) {
            try {
                const { data: itensData, error: errItens } = await supabaseClient
                    .from('saida_itens')
                    .select('quantidade, subtotal, valor_unitario, produto_id, serial_id, produtos(nome, categoria, marca, modelo)')
                    .in('saida_id', vendaIds.slice(0, 300));
                if (!errItens && itensData) {
                    itens = itensData;
                } else {
                    const fallback = await supabaseClient
                        .from('saida_itens')
                        .select('quantidade, subtotal, valor_unitario, produto_id, serial_id')
                        .in('saida_id', vendaIds.slice(0, 300));
                    if (fallback.data) itens = fallback.data;
                }
            } catch (e) {
                console.warn('Aviso ao carregar itens do caixa:', e);
            }
        }

        let totalItens = 0;
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

        const nomeAbertura = getNomeUsuario(caixa.usuario_abertura_id || caixa.usuario_id);
        const nomeFechamento = caixa.usuario_fechamento_id ? getNomeUsuario(caixa.usuario_fechamento_id) : '-';

        return {
            caixa,
            resumo,
            vendas: vendasFiltradas,
            despesas: despesasFiltradas,
            pagamentosFiado: fiadosFiltrados,
            itens,
            totalItens,
            categorias,
            nomeAbertura,
            nomeFechamento,
            historico: parseHistorico(caixa)
        };
    }

    // =========================================================================
    // 3. MONTAGEM DO RELATÓRIO E FILTROS
    // =========================================================================

    async function mount(containerId, options = {}) {
        state.mountId = containerId;
        state.onDataChanged = typeof options.onDataChanged === 'function' ? options.onDataChanged : null;
        ensureModals();

        const rootEl = document.getElementById(containerId);
        if (!rootEl) return;

        if (!state.filtros.dataInicio) state.filtros.dataInicio = getDataLocalTrintaDiasAtras();
        if (!state.filtros.dataFim) state.filtros.dataFim = getDataLocalHoje();

        rootEl.innerHTML = `
            <div class="fr-header">
                <div>
                    <h3 style="margin: 0; font-size: 18px; color: var(--dark); display: flex; align-items: center; gap: 8px;">
                        📋 Relatórios de Fechamento de Caixa
                    </h3>
                    <p style="margin: 4px 0 0; font-size: 13px; color: var(--gray);">
                        Consulte, visualize, reimprima ou cancele fechamentos para realizar um novo fechamento com ajuste de valores.
                    </p>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn-primary" onclick="window.RelatorioFechamentoCaixa.carregarDados()">🔄 Atualizar</button>
                    <button type="button" class="btn-excel" onclick="window.RelatorioFechamentoCaixa.exportarExcel()">📊 Excel</button>
                    <button type="button" class="btn-pdf" onclick="window.RelatorioFechamentoCaixa.exportarPDF()">📄 PDF</button>
                </div>
            </div>

            <div class="fr-filtros">
                <div>
                    <label for="frDataInicio">Data Início</label>
                    <input type="date" id="frDataInicio" value="${state.filtros.dataInicio}">
                </div>
                <div>
                    <label for="frDataFim">Data Fim</label>
                    <input type="date" id="frDataFim" value="${state.filtros.dataFim}">
                </div>
                <div>
                    <label for="frStatusFiltro">Status</label>
                    <select id="frStatusFiltro">
                        <option value="todos">Todos (Fechados e Cancelados)</option>
                        <option value="fechado">🟢 Apenas Fechados</option>
                        <option value="refechado">🔄 Refechados (Com Cancelamento)</option>
                        <option value="cancelado">🔴 Cancelados / Aguardando Novo</option>
                    </select>
                </div>
                <div>
                    <label for="frOperadorFiltro">Operador</label>
                    <select id="frOperadorFiltro">
                        <option value="todos">Todos os Operadores</option>
                    </select>
                </div>
                <div style="flex: 1; min-width: 150px;">
                    <label for="frBuscaFiltro">Buscar (#ID / Motivo / Obs.)</label>
                    <input type="text" id="frBuscaFiltro" placeholder="Ex: 27 ou diferença..." style="width: 100%;">
                </div>
                <div style="align-self: flex-end; display: flex; gap: 6px;">
                    <button type="button" class="btn-primary" onclick="window.RelatorioFechamentoCaixa.aplicarFiltros()">Filtrar</button>
                    <button type="button" class="btn-secondary" onclick="window.RelatorioFechamentoCaixa.limparFiltros()">Limpar</button>
                </div>
            </div>

            <div id="frAlertaCancelados"></div>

            <div class="fr-kpis" id="frKpisContainer">
                <div class="fr-kpi-card" style="border-top-color: #0d1728;">
                    <div class="fr-kpi-label">Fechamentos Listados</div>
                    <div class="fr-kpi-val" id="frKpiQtd">0</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color: #10b981;">
                    <div class="fr-kpi-label">Total Vendas Apuradas</div>
                    <div class="fr-kpi-val" id="frKpiVendas" style="color: #059669;">R$ 0,00</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color: #ef4444;">
                    <div class="fr-kpi-label">Despesas & Sangrias</div>
                    <div class="fr-kpi-val" id="frKpiDespesas" style="color: #dc2626;">R$ 0,00</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color: #2563eb;">
                    <div class="fr-kpi-label">Total Declarado (Final)</div>
                    <div class="fr-kpi-val" id="frKpiDeclarado" style="color: #1d4ed8;">R$ 0,00</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color: #f59e0b;">
                    <div class="fr-kpi-label">Diferença Acumulada</div>
                    <div class="fr-kpi-val" id="frKpiDiferenca">R$ 0,00</div>
                </div>
            </div>

            <div style="overflow-x: auto;">
                <table class="tabela-caixa" id="tabelaRelatorioFechamentos">
                    <thead>
                        <tr>
                            <th>Caixa</th>
                            <th>Abertura</th>
                            <th>Fechamento</th>
                            <th style="text-align: right;">Fundo Inicial</th>
                            <th style="text-align: right;">Vendas (Líq.)</th>
                            <th style="text-align: right;">Esperado Gaveta</th>
                            <th style="text-align: right;">Declarado Final</th>
                            <th style="text-align: center;">Diferença</th>
                            <th style="text-align: center;">Status</th>
                            <th style="text-align: center;" class="acoes">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="frTabelaBody">
                        <tr><td colspan="10" style="text-align: center; color: var(--gray); padding: 25px;">Carregando relatórios de fechamento...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        // Listeners de filtro rápido
        ['frDataInicio', 'frDataFim', 'frStatusFiltro', 'frOperadorFiltro'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', aplicarFiltros);
        });
        const buscaEl = document.getElementById('frBuscaFiltro');
        if (buscaEl) {
            buscaEl.addEventListener('input', renderizarTabela);
        }

        await carregarDados();
    }

    async function carregarDados() {
        const tbody = document.getElementById('frTabelaBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--gray); padding: 25px;">⏳ Carregando dados dos fechamentos...</td></tr>';
        }

        try {
            const [caixasRes, saidasRes, despesasRes, fiadoRes, usersRes] = await Promise.all([
                supabaseClient.from('caixas').select('*').order('id', { ascending: false }),
                supabaseClient.from('saidas').select('*'),
                supabaseClient.from('despesas').select('*'),
                supabaseClient.from('contas_receber_pagamentos').select('*'),
                supabaseClient.from('usuarios').select('id, nome')
            ]);

            if (caixasRes.error) throw caixasRes.error;

            state.caixas = caixasRes.data || [];
            state.saidas = saidasRes.data || [];
            state.despesas = despesasRes.data || [];
            state.pagamentosFiado = fiadoRes.data || [];
            state.usuariosLista = usersRes.data || [];
            state.usuariosMap = {};
            state.usuariosLista.forEach(u => {
                state.usuariosMap[String(u.id)] = u.nome;
            });

            // Preencher select de operadores preservando seleção
            const selOp = document.getElementById('frOperadorFiltro');
            if (selOp) {
                const atual = selOp.value || 'todos';
                selOp.innerHTML = '<option value="todos">Todos os Operadores</option>' +
                    state.usuariosLista.map(u => `<option value="${u.id}">${escapeHtmlSafe(u.nome)}</option>`).join('');
                selOp.value = atual;
            }

            // Pré-computar resumo de todos os caixas não-abertos (ou com histórico de cancelamento)
            state.caixasProcessados = state.caixas
                .filter(c => c.status === 'fechado' || c.status === 'cancelado' || parseHistorico(c).length > 0)
                .map(c => {
                    const { vendasFiltradas, despesasFiltradas, fiadosFiltrados } = filtrarRegistrosDoCaixa(c, {
                        saidas: state.saidas,
                        despesas: state.despesas,
                        pagamentosFiado: state.pagamentosFiado
                    });
                    const resumo = calcularResumoFechamentoCaixa({
                        saldoInicial: c.saldo_inicial,
                        saldoFinalDeclarado: c.saldo_final,
                        vendas: vendasFiltradas,
                        pagamentosFiado: fiadosFiltrados,
                        despesas: despesasFiltradas,
                        ajustes: c.ajustes_fechamento
                    });
                    const historico = parseHistorico(c);
                    return {
                        ...c,
                        _resumo: resumo,
                        _historico: historico,
                        _nomeAbertura: getNomeUsuario(c.usuario_abertura_id || c.usuario_id),
                        _nomeFechamento: c.usuario_fechamento_id ? getNomeUsuario(c.usuario_fechamento_id) : '-'
                    };
                });

            state.carregado = true;
            renderizarAlertaCancelados();
            renderizarTabela();
        } catch (err) {
            console.error('Erro ao carregar relatório de fechamento:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger); padding: 20px;">Erro ao carregar relatórios: ${escapeHtmlSafe(err.message)}</td></tr>`;
            }
        }
    }

    function renderizarAlertaCancelados() {
        const alertaEl = document.getElementById('frAlertaCancelados');
        if (!alertaEl) return;

        const pendentes = state.caixasProcessados.filter(c => c.status === 'cancelado');
        if (pendentes.length === 0) {
            alertaEl.innerHTML = '';
            return;
        }

        const primeiro = pendentes[0];
        alertaEl.innerHTML = `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 5px solid #dc2626; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="font-size: 13px; color: #7f1d1d;">
                    <strong>⚠️ ${pendentes.length} fechamento(s) cancelado(s) aguardando novo fechamento!</strong>
                    O Caixa #${primeiro.id} (aberto em ${formatarDataHora(primeiro.data_abertura)}) está aguardando a conclusão do novo fechamento com os valores ajustados.
                </div>
                <button type="button" class="fr-btn-sm fr-btn-refechar" onclick="window.RelatorioFechamentoCaixa.abrirModalNovoFechamento(${primeiro.id})">
                    ✅ Fazer Novo Fechamento (#${primeiro.id})
                </button>
            </div>
        `;
    }

    function aplicarFiltros() {
        state.filtros.dataInicio = document.getElementById('frDataInicio')?.value || '';
        state.filtros.dataFim = document.getElementById('frDataFim')?.value || '';
        state.filtros.status = document.getElementById('frStatusFiltro')?.value || 'todos';
        state.filtros.operadorId = document.getElementById('frOperadorFiltro')?.value || 'todos';
        state.filtros.busca = document.getElementById('frBuscaFiltro')?.value || '';
        renderizarTabela();
    }

    function limparFiltros() {
        state.filtros.dataInicio = '';
        state.filtros.dataFim = '';
        state.filtros.status = 'todos';
        state.filtros.operadorId = 'todos';
        state.filtros.busca = '';
        if (document.getElementById('frDataInicio')) document.getElementById('frDataInicio').value = '';
        if (document.getElementById('frDataFim')) document.getElementById('frDataFim').value = '';
        if (document.getElementById('frStatusFiltro')) document.getElementById('frStatusFiltro').value = 'todos';
        if (document.getElementById('frOperadorFiltro')) document.getElementById('frOperadorFiltro').value = 'todos';
        if (document.getElementById('frBuscaFiltro')) document.getElementById('frBuscaFiltro').value = '';
        renderizarTabela();
    }

    function getCaixasFiltrados() {
        const ini = document.getElementById('frDataInicio')?.value || '';
        const fim = document.getElementById('frDataFim')?.value || '';
        const st = document.getElementById('frStatusFiltro')?.value || 'todos';
        const op = document.getElementById('frOperadorFiltro')?.value || 'todos';
        const busca = (document.getElementById('frBuscaFiltro')?.value || '').trim().toLowerCase();

        return state.caixasProcessados.filter(c => {
            // Data de referência: fechamento ou abertura
            const refISO = c.data_fechamento || c.data_abertura || '';
            const refDate = refISO ? new Date(refISO).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
            if (ini && refDate && refDate < ini) return false;
            if (fim && refDate && refDate > fim) return false;

            if (st === 'fechado' && c.status !== 'fechado') return false;
            if (st === 'cancelado' && c.status !== 'cancelado' && c._historico.length === 0) return false;
            if (st === 'refechado' && (c.status !== 'fechado' || c._historico.length === 0)) return false;

            if (op !== 'todos') {
                const matchAbert = String(c.usuario_abertura_id || c.usuario_id) === String(op);
                const matchFech = String(c.usuario_fechamento_id || '') === String(op);
                if (!matchAbert && !matchFech) return false;
            }

            if (busca) {
                const texto = `#${c.id} ${c._nomeAbertura} ${c._nomeFechamento} ${c.motivo_cancelamento || ''} ${c.observacao_fechamento || ''}`.toLowerCase();
                if (!texto.includes(busca)) return false;
            }

            return true;
        });
    }

    function renderizarTabela() {
        const tbody = document.getElementById('frTabelaBody');
        if (!tbody) return;

        const filtrados = getCaixasFiltrados();

        // Atualizar KPIs
        let somaVendasCents = 0;
        let somaDespesasCents = 0;
        let somaDeclaradoCents = 0;
        let somaDiferencaCents = 0;

        filtrados.forEach(c => {
            if (c.status === 'cancelado') return;
            somaVendasCents += toCents(c._resumo.totalVendas);
            somaDespesasCents += toCents(c._resumo.totalDespesas) + toCents(c._resumo.sangria);
            somaDeclaradoCents += toCents(c.saldo_final || 0);
            const esperado = c.saldo_esperado !== null && c.saldo_esperado !== undefined
                ? Number(c.saldo_esperado)
                : c._resumo.saldoEsperadoGaveta;
            const diff = c.diferenca_caixa !== null && c.diferenca_caixa !== undefined
                ? Number(c.diferenca_caixa)
                : fromCents(toCents(c.saldo_final || 0) - toCents(esperado));
            somaDiferencaCents += toCents(diff);
        });

        const setEl = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.textContent = txt;
        };
        setEl('frKpiQtd', String(filtrados.length));
        setEl('frKpiVendas', formatarMoeda(fromCents(somaVendasCents)));
        setEl('frKpiDespesas', formatarMoeda(fromCents(somaDespesasCents)));
        setEl('frKpiDeclarado', formatarMoeda(fromCents(somaDeclaradoCents)));

        const diffEl = document.getElementById('frKpiDiferenca');
        if (diffEl) {
            const valDiff = fromCents(somaDiferencaCents);
            diffEl.textContent = (valDiff > 0 ? '+' : '') + formatarMoeda(valDiff);
            diffEl.style.color = valDiff === 0 ? '#059669' : (valDiff > 0 ? '#1d4ed8' : '#dc2626');
        }

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--gray); padding: 25px;">Nenhum fechamento de caixa encontrado para os filtros selecionados.</td></tr>';
            return;
        }

        const allowCancel = podeCancelarFechamento();

        tbody.innerHTML = filtrados.map(c => {
            const r = c._resumo;
            const esperado = c.saldo_esperado !== null && c.saldo_esperado !== undefined
                ? Number(c.saldo_esperado)
                : r.saldoEsperadoGaveta;
            const declarado = c.saldo_final !== null && c.saldo_final !== undefined
                ? Number(c.saldo_final)
                : 0;
            const diff = c.diferenca_caixa !== null && c.diferenca_caixa !== undefined
                ? Number(c.diferenca_caixa)
                : fromCents(toCents(declarado) - toCents(esperado));

            let diffBadge = `<span class="fr-badge fr-badge-diff-ok">Exato</span>`;
            if (c.status === 'cancelado') {
                diffBadge = `<span style="color: var(--gray); font-size: 12px;">-</span>`;
            } else if (diff > 0.009) {
                diffBadge = `<span class="fr-badge fr-badge-diff-sobra">+${formatarMoeda(diff)}</span>`;
            } else if (diff < -0.009) {
                diffBadge = `<span class="fr-badge fr-badge-diff-quebra">${formatarMoeda(diff)}</span>`;
            }

            let statusBadge = '';
            if (c.status === 'cancelado') {
                statusBadge = `<span class="fr-badge fr-badge-cancelado">🔴 Cancelado</span>`;
            } else if (c._historico.length > 0) {
                statusBadge = `<span class="fr-badge fr-badge-refechado" title="${c._historico.length} fechamento(s) cancelado(s) anteriormente">🔄 Refechado (${c._historico.length})</span>`;
            } else {
                statusBadge = `<span class="fr-badge fr-badge-fechado">🟢 Fechado</span>`;
            }

            const ajusteTag = temAjustesAplicados(c.ajustes_fechamento)
                ? `<div style="font-size: 10.5px; color: #2563eb; font-weight: 600;">⚙️ Com ajustes</div>`
                : '';

            let acoesHtml = `
                <button type="button" class="fr-btn-sm fr-btn-ver" onclick="window.RelatorioFechamentoCaixa.visualizarFechamento(${c.id})" title="Visualizar detalhes completos">
                    👁️ Visualizar
                </button>
            `;

            if (c.status === 'fechado') {
                acoesHtml += `
                    <button type="button" class="fr-btn-sm fr-btn-print" onclick="window.RelatorioFechamentoCaixa.reimprimirFechamento(${c.id}, 'termico')" title="Reimprimir cupom de fechamento">
                        🖨️ Reimprimir
                    </button>
                `;
                if (allowCancel) {
                    acoesHtml += `
                        <button type="button" class="fr-btn-sm fr-btn-cancel" onclick="window.RelatorioFechamentoCaixa.abrirModalCancelarFechamento(${c.id})" title="Cancelar este fechamento e abrir novo fechamento com ajustes">
                            ❌ Cancelar
                        </button>
                    `;
                }
            } else if (c.status === 'cancelado' && allowCancel) {
                acoesHtml += `
                    <button type="button" class="fr-btn-sm fr-btn-refechar" onclick="window.RelatorioFechamentoCaixa.abrirModalNovoFechamento(${c.id})" title="Realizar novo fechamento com ajuste de valores">
                        ✅ Novo Fechamento
                    </button>
                `;
            }

            return `
                <tr>
                    <td>
                        <strong>#${c.id}</strong>
                        ${ajusteTag}
                    </td>
                    <td>
                        <div style="font-size: 12.5px; font-weight: 600;">${formatarDataHora(c.data_abertura)}</div>
                        <div style="font-size: 11px; color: var(--gray);">${escapeHtmlSafe(c._nomeAbertura)}</div>
                    </td>
                    <td>
                        <div style="font-size: 12.5px; font-weight: 600;">${c.data_fechamento ? formatarDataHora(c.data_fechamento) : '-'}</div>
                        <div style="font-size: 11px; color: var(--gray);">${escapeHtmlSafe(c._nomeFechamento)}</div>
                    </td>
                    <td style="text-align: right;">${formatarMoeda(c.saldo_inicial)}</td>
                    <td style="text-align: right; font-weight: 600; color: #059669;">${formatarMoeda(r.totalVendas)}</td>
                    <td style="text-align: right;">${formatarMoeda(esperado)}</td>
                    <td style="text-align: right; font-weight: 700;">${c.status === 'cancelado' ? '-' : formatarMoeda(declarado)}</td>
                    <td style="text-align: center;">${diffBadge}</td>
                    <td style="text-align: center;">${statusBadge}</td>
                    <td class="acoes"><div class="fr-acoes">${acoesHtml}</div></td>
                </tr>
            `;
        }).join('');
    }

    // =========================================================================
    // 4. MODAL VISUALIZAR RELATÓRIO DE FECHAMENTO
    // =========================================================================

    async function visualizarFechamento(caixaId) {
        ensureModals();
        const caixa = state.caixas.find(c => String(c.id) === String(caixaId));
        if (!caixa) {
            notificar('Fechamento de caixa não encontrado.', 'error');
            return;
        }

        const titleEl = document.getElementById('frVisTitle');
        const bodyEl = document.getElementById('frVisBody');
        const footerEl = document.getElementById('frVisFooter');

        titleEl.textContent = `📊 Relatório de Fechamento — Caixa #${caixa.id}`;
        bodyEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--gray);">⏳ Carregando detalhamento completo...</div>';
        footerEl.innerHTML = `<button type="button" class="btn-secondary" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalVisualizarFechamento')">Fechar</button>`;
        abrirModal('modalVisualizarFechamento');

        const det = await carregarDetalhesCompletosCaixa(caixa);
        const r = det.resumo;
        const aj = r.ajustes;
        const esperado = caixa.saldo_esperado !== null && caixa.saldo_esperado !== undefined ? Number(caixa.saldo_esperado) : r.saldoEsperadoGaveta;
        const declarado = caixa.saldo_final !== null && caixa.saldo_final !== undefined ? Number(caixa.saldo_final) : 0;
        const diff = caixa.diferenca_caixa !== null && caixa.diferenca_caixa !== undefined ? Number(caixa.diferenca_caixa) : fromCents(toCents(declarado) - toCents(esperado));

        const fpEntries = Object.entries(r.formasPagamento);
        const pagamentosRows = fpEntries.length > 0
            ? fpEntries.map(([k, v]) => `<tr><td><strong>${escapeHtmlSafe(k)}</strong></td><td style="text-align:right; font-weight:700;">${formatarMoeda(v)}</td></tr>`).join('')
            : '<tr><td colspan="2" style="text-align:center; color:var(--gray);">Nenhuma movimentação</td></tr>';

        const catEntries = Object.entries(det.categorias);
        const catRows = catEntries.length > 0
            ? catEntries.map(([cat, info]) => `<tr><td><strong>${escapeHtmlSafe(cat)}</strong></td><td style="text-align:center;">${info.qtd}</td><td style="text-align:right; font-weight:700;">${formatarMoeda(info.total)}</td></tr>`).join('')
            : '<tr><td colspan="3" style="text-align:center; color:var(--gray);">Nenhum item vendido</td></tr>';

        const despRows = det.despesas.length > 0
            ? det.despesas.map(d => `<tr><td><strong>${escapeHtmlSafe(d.descricao)}</strong><br><small style="color:var(--gray);">${escapeHtmlSafe(d.categoria || 'Geral')}</small></td><td style="text-align:right; color:#dc2626; font-weight:700;">- ${formatarMoeda(d.valor)}</td></tr>`).join('')
            : '<tr><td colspan="2" style="text-align:center; color:var(--gray);">Nenhuma despesa registrada</td></tr>';

        const bannerCancelado = caixa.status === 'cancelado' ? `
            <div style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #dc2626; padding:12px; border-radius:8px; margin-bottom:14px; font-size:13px; color:#7f1d1d;">
                <strong>🔴 Fechamento Cancelado</strong> em ${formatarDataHora(caixa.cancelado_em)} por <strong>${escapeHtmlSafe(getNomeUsuario(caixa.cancelado_por))}</strong>.<br>
                <strong>Motivo:</strong> ${escapeHtmlSafe(caixa.motivo_cancelamento || 'Não informado')}
            </div>
        ` : '';

        const ajustesHtml = temAjustesAplicados(aj) || caixa.observacao_fechamento ? `
            <div class="fr-box" style="margin-top: 14px; border-left: 4px solid #2563eb;">
                <h4 style="margin:0 0 8px; font-size:13.5px; color:#1e40af;">⚙️ Ajustes Aplicados e Observações</h4>
                <div class="fr-grid-3" style="font-size:12.5px;">
                    <div>Suprimento (+): <strong>${formatarMoeda(aj.suprimento)}</strong></div>
                    <div>Sangria (-): <strong>${formatarMoeda(aj.sangria)}</strong></div>
                    <div>Ajuste Dinheiro: <strong>${formatarMoeda(aj.ajuste_dinheiro)}</strong></div>
                    <div>Ajuste Cartão: <strong>${formatarMoeda(aj.ajuste_cartao)}</strong></div>
                    <div>Ajuste PIX: <strong>${formatarMoeda(aj.ajuste_pix)}</strong></div>
                    <div>Ajuste Despesas: <strong>${formatarMoeda(aj.ajuste_despesas)}</strong></div>
                </div>
                ${caixa.observacao_fechamento ? `<div style="margin-top:8px; font-size:12.5px;"><strong>Observação:</strong> ${escapeHtmlSafe(caixa.observacao_fechamento)}</div>` : ''}
            </div>
        ` : '';

        const historicoHtml = det.historico.length > 0 ? `
            <div style="margin-top: 16px;">
                <h4 style="margin:0 0 8px; font-size:13.5px; color:#9a3412;">📜 Histórico de Fechamentos Cancelados (${det.historico.length})</h4>
                ${det.historico.map(h => `
                    <div class="fr-history-card">
                        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                            <strong>Tentativa #${h.tentativa || '-'} — Fechado em ${formatarDataHora(h.data_fechamento)}</strong>
                            <span>Cancelado em ${formatarDataHora(h.cancelado_em)} por <strong>${escapeHtmlSafe(h.cancelado_por_nome || getNomeUsuario(h.cancelado_por))}</strong></span>
                        </div>
                        <div style="margin-top:4px;">
                            Inicial: <strong>${formatarMoeda(h.saldo_inicial)}</strong> |
                            Esperado: <strong>${formatarMoeda(h.saldo_esperado)}</strong> |
                            Declarado: <strong>${formatarMoeda(h.saldo_final)}</strong> |
                            Diferença: <strong>${formatarMoeda(h.diferenca_caixa)}</strong>
                        </div>
                        <div style="margin-top:3px; color:#7c2d12;">
                            <strong>Motivo do cancelamento:</strong> ${escapeHtmlSafe(h.motivo_cancelamento || '-')}
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : '';

        bodyEl.innerHTML = `
            ${bannerCancelado}
            <div class="fr-box" style="margin-bottom: 14px;">
                <div class="fr-grid-3" style="font-size: 13px;">
                    <div><span style="color:var(--gray); font-size:11px; display:block;">Abertura</span><strong>${formatarDataHora(caixa.data_abertura)}</strong><br><small>Por: ${escapeHtmlSafe(det.nomeAbertura)}</small></div>
                    <div><span style="color:var(--gray); font-size:11px; display:block;">Fechamento</span><strong>${caixa.data_fechamento ? formatarDataHora(caixa.data_fechamento) : 'Aguardando'}</strong><br><small>Por: ${escapeHtmlSafe(det.nomeFechamento)}</small></div>
                    <div><span style="color:var(--gray); font-size:11px; display:block;">Itens / Descontos</span><strong>${det.totalItens} un. vendidos</strong><br><small>Descontos: ${formatarMoeda(r.totalDescontos)}</small></div>
                </div>
            </div>

            <div class="fr-kpis" style="margin-bottom: 14px;">
                <div class="fr-kpi-card" style="border-top-color:#0284c7;">
                    <div class="fr-kpi-label">Fundo Inicial</div>
                    <div class="fr-kpi-val">${formatarMoeda(r.saldoInicial)}</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color:#10b981;">
                    <div class="fr-kpi-label">Vendas (c/ Ajustes)</div>
                    <div class="fr-kpi-val" style="color:#059669;">${formatarMoeda(r.totalVendas)}</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color:#ef4444;">
                    <div class="fr-kpi-label">Despesas + Sangria</div>
                    <div class="fr-kpi-val" style="color:#dc2626;">${formatarMoeda(fromCents(toCents(r.totalDespesas) + toCents(r.sangria)))}</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color:#6366f1;">
                    <div class="fr-kpi-label">Esperado Gaveta</div>
                    <div class="fr-kpi-val">${formatarMoeda(esperado)}</div>
                </div>
                <div class="fr-kpi-card" style="border-top-color:#0d1728;">
                    <div class="fr-kpi-label">Declarado Final</div>
                    <div class="fr-kpi-val">${caixa.status === 'cancelado' ? '-' : formatarMoeda(declarado)}</div>
                    <div style="font-size:11.5px; margin-top:2px; font-weight:700; color:${diff === 0 ? '#059669' : (diff > 0 ? '#1d4ed8' : '#dc2626')};">
                        ${caixa.status === 'cancelado' ? '' : `Diferença: ${diff > 0 ? '+' : ''}${formatarMoeda(diff)}`}
                    </div>
                </div>
            </div>

            <div class="fr-grid-2">
                <div class="fr-box">
                    <h4 style="margin:0 0 8px; font-size:13.5px;">💳 Formas de Pagamento</h4>
                    <table class="tabela-caixa" style="margin-top:0;">
                        <tbody>${pagamentosRows}</tbody>
                    </table>
                </div>
                <div class="fr-box">
                    <h4 style="margin:0 0 8px; font-size:13.5px;">📦 Vendidos por Categoria</h4>
                    <table class="tabela-caixa" style="margin-top:0;">
                        <tbody>${catRows}</tbody>
                    </table>
                </div>
            </div>

            <div class="fr-box" style="margin-top: 14px;">
                <h4 style="margin:0 0 8px; font-size:13.5px;">💸 Despesas do Período</h4>
                <table class="tabela-caixa" style="margin-top:0;">
                    <tbody>${despRows}</tbody>
                </table>
            </div>

            ${ajustesHtml}
            ${historicoHtml}
        `;

        const allowCancel = podeCancelarFechamento();
        let footerBtns = `<button type="button" class="btn-secondary" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalVisualizarFechamento')">Fechar</button>`;

        if (caixa.status === 'fechado') {
            footerBtns += `
                <button type="button" class="btn-info" onclick="window.RelatorioFechamentoCaixa.reimprimirFechamento(${caixa.id}, 'a4')">📄 Imprimir A4</button>
                <button type="button" class="btn-primary" onclick="window.RelatorioFechamentoCaixa.reimprimirFechamento(${caixa.id}, 'termico')">🖨️ Reimprimir Cupom</button>
            `;
            if (allowCancel) {
                footerBtns += `
                    <button type="button" class="btn-danger" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalVisualizarFechamento'); window.RelatorioFechamentoCaixa.abrirModalCancelarFechamento(${caixa.id});">
                        ❌ Cancelar Fechamento
                    </button>
                `;
            }
        } else if (caixa.status === 'cancelado' && allowCancel) {
            footerBtns += `
                <button type="button" class="btn-success" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalVisualizarFechamento'); window.RelatorioFechamentoCaixa.abrirModalNovoFechamento(${caixa.id});">
                    ✅ Fazer Novo Fechamento
                </button>
            `;
        }
        footerEl.innerHTML = footerBtns;
    }

    // =========================================================================
    // 5. CANCELAMENTO E NOVO FECHAMENTO IMEDIATO COM AJUSTE DE VALORES
    // =========================================================================

    function abrirModalCancelarFechamento(caixaId) {
        if (!podeCancelarFechamento()) {
            notificar('Acesso negado: Você não tem permissão para cancelar fechamentos de caixa.', 'error');
            return;
        }
        ensureModals();
        const proc = state.caixasProcessados.find(c => String(c.id) === String(caixaId)) || state.caixas.find(c => String(c.id) === String(caixaId));
        if (!proc) {
            notificar('Fechamento de caixa não encontrado.', 'error');
            return;
        }

        document.getElementById('frCancelTitle').textContent = `❌ Cancelar Fechamento — Caixa #${proc.id}`;
        document.getElementById('frCancelBody').innerHTML = `
            <div style="background:#fffbeb; border:1px solid #fcd34d; border-left:4px solid #f59e0b; padding:12px 14px; border-radius:8px; margin-bottom:14px; font-size:13px; color:#78350f; line-height:1.5;">
                <strong>⚠️ Atenção ao fluxo de cancelamento:</strong><br>
                Ao confirmar o cancelamento deste fechamento, ele ficará registrado no histórico de auditoria e <strong>o novo fechamento será aberto imediatamente com as opções de ajuste dos valores</strong>.
            </div>
            <div class="fr-box" style="margin-bottom:14px; font-size:13px;">
                <div class="fr-grid-2">
                    <div>Abertura: <strong>${formatarDataHora(proc.data_abertura)}</strong></div>
                    <div>Fechamento: <strong>${formatarDataHora(proc.data_fechamento)}</strong></div>
                    <div>Fundo Inicial: <strong>${formatarMoeda(proc.saldo_inicial)}</strong></div>
                    <div>Declarado Atual: <strong>${formatarMoeda(proc.saldo_final || 0)}</strong></div>
                </div>
            </div>
            <div class="fr-field">
                <label for="frMotivoCancelamento">Motivo do Cancelamento <span style="color:#dc2626;">*</span></label>
                <textarea id="frMotivoCancelamento" rows="3" placeholder="Ex: Divergência na contagem de dinheiro, saldo inicial errado, necessidade de lançar suprimento/sangria..."></textarea>
            </div>
        `;

        document.getElementById('frCancelFooter').innerHTML = `
            <button type="button" class="btn-secondary" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalCancelarFechamento')">Voltar</button>
            <button type="button" id="frBtnConfirmarCancelamento" class="btn-danger">
                ❌ Confirmar Cancelamento e Ajustar Valores
            </button>
        `;

        const btnConfirm = document.getElementById('frBtnConfirmarCancelamento');
        btnConfirm.onclick = async () => {
            const motivo = (document.getElementById('frMotivoCancelamento')?.value || '').trim();
            if (!motivo) {
                notificar('Informe o motivo do cancelamento antes de continuar.', 'warning');
                document.getElementById('frMotivoCancelamento')?.focus();
                return;
            }
            btnConfirm.disabled = true;
            btnConfirm.textContent = '⏳ Cancelando...';

            try {
                await executarCancelamento(proc, motivo);
                fecharModal('modalCancelarFechamento');
                // Imediatamente abre o novo fechamento com opções de ajuste de valores!
                await abrirModalNovoFechamento(proc.id, {
                    posCancelamento: true,
                    motivoCancelamento: motivo
                });
            } catch (e) {
                console.error('Erro ao cancelar fechamento:', e);
                notificar('Erro ao cancelar fechamento: ' + (e.message || e), 'error');
                btnConfirm.disabled = false;
                btnConfirm.textContent = '❌ Confirmar Cancelamento e Ajustar Valores';
            }
        };

        abrirModal('modalCancelarFechamento');
        setTimeout(() => document.getElementById('frMotivoCancelamento')?.focus(), 80);
    }

    async function executarCancelamento(caixa, motivo) {
        const usuario = getUsuarioLogado();
        const agoraISO = new Date().toISOString();

        const resumo = caixa._resumo || calcularResumoFechamentoCaixa({
            saldoInicial: caixa.saldo_inicial,
            saldoFinalDeclarado: caixa.saldo_final,
            ...(() => {
                const f = filtrarRegistrosDoCaixa(caixa, {
                    saidas: state.saidas,
                    despesas: state.despesas,
                    pagamentosFiado: state.pagamentosFiado
                });
                return { vendas: f.vendasFiltradas, despesas: f.despesasFiltradas, pagamentosFiado: f.fiadosFiltrados };
            })(),
            ajustes: caixa.ajustes_fechamento
        });

        const caixaComNome = {
            ...caixa,
            _usuario_fechamento_nome: getNomeUsuario(caixa.usuario_fechamento_id)
        };
        const novoHistorico = criarSnapshotCancelamento(caixaComNome, resumo, usuario, motivo, agoraISO);

        const payload = {
            status: 'cancelado',
            cancelado: true,
            cancelado_em: agoraISO,
            cancelado_por: usuario?.id || null,
            motivo_cancelamento: motivo,
            historico_fechamentos: novoHistorico
        };

        const { data, error } = await supabaseClient
            .from('caixas')
            .update(payload)
            .eq('id', caixa.id)
            .select();

        if (error) throw error;

        // Atualizar cache local imediatamente
        const atualizado = (data && data[0]) ? data[0] : { ...caixa, ...payload };
        const idx = state.caixas.findIndex(c => String(c.id) === String(caixa.id));
        if (idx >= 0) state.caixas[idx] = atualizado;

        notificar(`Fechamento #${caixa.id} cancelado. Realize o novo fechamento com os ajustes abaixo.`, 'info');
        await carregarDados();
        if (state.onDataChanged) await state.onDataChanged();
    }

    async function abrirModalNovoFechamento(caixaId, opts = {}) {
        ensureModals();
        let caixa = state.caixas.find(c => String(c.id) === String(caixaId));
        if (!caixa) {
            const { data } = await supabaseClient.from('caixas').select('*').eq('id', caixaId).single();
            caixa = data;
        }
        if (!caixa) {
            notificar('Caixa não encontrado para novo fechamento.', 'error');
            return;
        }

        const { vendasFiltradas, despesasFiltradas, fiadosFiltrados } = filtrarRegistrosDoCaixa(caixa, {
            saidas: state.saidas,
            despesas: state.despesas,
            pagamentosFiado: state.pagamentosFiado
        });
        const baseResumo = calcularResumoFechamentoCaixa({
            saldoInicial: caixa.saldo_inicial,
            saldoFinalDeclarado: caixa.saldo_final,
            vendas: vendasFiltradas,
            pagamentosFiado: fiadosFiltrados,
            despesas: despesasFiltradas,
            ajustes: caixa.ajustes_fechamento
        });
        const aj = baseResumo.ajustes;
        const hist = parseHistorico(caixa);
        const ultimoCancelado = hist.length > 0 ? hist[hist.length - 1] : null;
        const dataOriginalFechamento = ultimoCancelado?.data_fechamento || caixa.data_fechamento || null;

        document.getElementById('frNovoTitle').textContent = `🔄 Novo Fechamento — Caixa #${caixa.id}`;
        document.getElementById('frNovoBody').innerHTML = `
            ${opts.posCancelamento || caixa.motivo_cancelamento ? `
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-left:4px solid #2563eb; padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:12.5px; color:#1e3a8a;">
                    <strong>🔄 Refechamento Imediato Iniciado</strong>
                    ${opts.motivoCancelamento || caixa.motivo_cancelamento ? ` — Motivo do cancelamento: <em>"${escapeHtmlSafe(opts.motivoCancelamento || caixa.motivo_cancelamento)}"</em>` : ''}
                    <br>Ajuste os valores necessários abaixo e confirme o novo fechamento.
                </div>
            ` : ''}

            <div class="fr-box" style="margin-bottom: 14px;">
                <h4 style="margin:0 0 8px; font-size:13px; color:var(--dark);">📊 Valores Base Apurados pelo Sistema</h4>
                <div class="fr-grid-3" style="font-size:12.5px;">
                    <div>Dinheiro: <strong>${formatarMoeda(baseResumo.dinheiroSistema)}</strong></div>
                    <div>Cartão: <strong>${formatarMoeda(baseResumo.cartaoSistema)}</strong></div>
                    <div>PIX: <strong>${formatarMoeda(baseResumo.pixSistema)}</strong></div>
                    <div>Outros / Fiado: <strong>${formatarMoeda(baseResumo.outrosSistema)}</strong></div>
                    <div>Despesas Reg.: <strong style="color:#dc2626;">${formatarMoeda(baseResumo.totalDespesasSistema)}</strong></div>
                    <div>Total Vendas Sist.: <strong style="color:#059669;">${formatarMoeda(baseResumo.totalVendasSistema)}</strong></div>
                </div>
            </div>

            <div class="fr-box" style="margin-bottom: 14px;">
                <h4 style="margin:0 0 10px; font-size:13px; color:var(--dark);">⚙️ Opções de Ajuste dos Valores</h4>
                <div class="fr-grid-3">
                    <div class="fr-field">
                        <label for="nfSaldoInicial">Fundo / Saldo Inicial (R$)</label>
                        <input type="number" id="nfSaldoInicial" step="0.01" min="0" value="${(Number(caixa.saldo_inicial) || 0).toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfSuprimento">Suprimento / Reforço (+ R$)</label>
                        <input type="number" id="nfSuprimento" step="0.01" min="0" value="${aj.suprimento.toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfSangria">Sangria / Retirada (- R$)</label>
                        <input type="number" id="nfSangria" step="0.01" min="0" value="${aj.sangria.toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfAjDinheiro">Ajuste Dinheiro (+/- R$)</label>
                        <input type="number" id="nfAjDinheiro" step="0.01" value="${aj.ajuste_dinheiro.toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfAjCartao">Ajuste Cartão (+/- R$)</label>
                        <input type="number" id="nfAjCartao" step="0.01" value="${aj.ajuste_cartao.toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfAjPix">Ajuste PIX (+/- R$)</label>
                        <input type="number" id="nfAjPix" step="0.01" value="${aj.ajuste_pix.toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfAjOutros">Ajuste Outros (+/- R$)</label>
                        <input type="number" id="nfAjOutros" step="0.01" value="${aj.ajuste_outros.toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfAjDespesas">Ajuste Despesas (+/- R$)</label>
                        <input type="number" id="nfAjDespesas" step="0.01" value="${aj.ajuste_despesas.toFixed(2)}">
                    </div>
                    <div class="fr-field">
                        <label for="nfDataFechamento">Data/Hora do Fechamento</label>
                        <input type="datetime-local" id="nfDataFechamento" value="${toDateTimeLocalValue(new Date().toISOString())}">
                        ${dataOriginalFechamento ? `<button type="button" id="nfBtnDataOriginal" style="margin-top:4px; font-size:11px; border:none; background:none; color:#2563eb; cursor:pointer; padding:0; text-decoration:underline;">Usar data anterior (${formatarDataHora(dataOriginalFechamento)})</button>` : ''}
                    </div>
                </div>
            </div>

            <div class="fr-resumo-live">
                <div class="fr-grid-3" style="margin-bottom: 10px;">
                    <div>
                        <span style="font-size:11px; color:#1e40af; font-weight:700; display:block;">VENDAS AJUSTADAS</span>
                        <strong id="nfLiveVendas" style="font-size:16px; color:#059669;">R$ 0,00</strong>
                    </div>
                    <div>
                        <span style="font-size:11px; color:#1e40af; font-weight:700; display:block;">SALDO ESPERADO GAVETA</span>
                        <strong id="nfLiveEsperado" style="font-size:18px; color:#1d4ed8;">R$ 0,00</strong>
                    </div>
                    <div>
                        <span style="font-size:11px; color:#1e40af; font-weight:700; display:block;">TOTAL LÍQUIDO GERAL</span>
                        <strong id="nfLiveTotalLiquido" style="font-size:16px; color:#0f172a;">R$ 0,00</strong>
                    </div>
                </div>

                <div class="fr-grid-2" style="align-items: end; border-top: 1px dashed #93c5fd; padding-top: 10px;">
                    <div class="fr-field">
                        <label for="nfSaldoFinal" style="color:#1e3a8a;">Saldo Final Declarado na Gaveta (R$) *</label>
                        <div style="display:flex; gap:6px;">
                            <input type="number" id="nfSaldoFinal" step="0.01" min="0" value="${baseResumo.saldoEsperadoGaveta.toFixed(2)}" style="font-weight:700; font-size:15px;">
                            <button type="button" id="nfBtnIgualarEsperado" class="fr-btn-sm fr-btn-ver" title="Preencher com o saldo esperado na gaveta">Igualar</button>
                        </div>
                    </div>
                    <div>
                        <span style="font-size:11px; color:#1e40af; font-weight:700; display:block; margin-bottom:4px;">DIFERENÇA (QUEBRA / SOBRA)</span>
                        <div id="nfLiveDiferenca" style="font-size:15px; font-weight:800; padding:8px 10px; background:#fff; border-radius:6px; border:1px solid #bfdbfe;">
                            R$ 0,00 (Caixa Batido)
                        </div>
                    </div>
                </div>
            </div>

            <div class="fr-field">
                <label for="nfObservacao">Observação do Novo Fechamento / Justificativa dos Ajustes</label>
                <textarea id="nfObservacao" rows="2" placeholder="Descreva os ajustes realizados neste novo fechamento...">${escapeHtmlSafe(caixa.observacao_fechamento || (opts.motivoCancelamento ? 'Refechamento: ' + opts.motivoCancelamento : ''))}</textarea>
            </div>
        `;

        document.getElementById('frNovoFooter').innerHTML = `
            <button type="button" class="btn-secondary" onclick="window.RelatorioFechamentoCaixa.fecharModal('modalNovoFechamento')">Fechar (Pendente)</button>
            <button type="button" id="nfBtnConfirmarNovoFechamento" class="btn-success">
                ✅ Confirmar Novo Fechamento
            </button>
        `;

        const readAjustesForm = () => ({
            suprimento: Math.max(0, parseFloat(document.getElementById('nfSuprimento')?.value) || 0),
            sangria: Math.max(0, parseFloat(document.getElementById('nfSangria')?.value) || 0),
            ajuste_dinheiro: parseFloat(document.getElementById('nfAjDinheiro')?.value) || 0,
            ajuste_cartao: parseFloat(document.getElementById('nfAjCartao')?.value) || 0,
            ajuste_pix: parseFloat(document.getElementById('nfAjPix')?.value) || 0,
            ajuste_outros: parseFloat(document.getElementById('nfAjOutros')?.value) || 0,
            ajuste_despesas: parseFloat(document.getElementById('nfAjDespesas')?.value) || 0,
            observacao: (document.getElementById('nfObservacao')?.value || '').trim()
        });

        let ultimoEsperadoCalculado = baseResumo.saldoEsperadoGaveta;
        let usuarioEditouDeclarado = false;

        const atualizarCalculoLive = () => {
            const sInicial = Math.max(0, parseFloat(document.getElementById('nfSaldoInicial')?.value) || 0);
            const ajForm = readAjustesForm();
            const elFinal = document.getElementById('nfSaldoFinal');

            const calcTemp = calcularResumoFechamentoCaixa({
                saldoInicial: sInicial,
                vendas: vendasFiltradas,
                pagamentosFiado: fiadosFiltrados,
                despesas: despesasFiltradas,
                ajustes: ajForm
            });

            ultimoEsperadoCalculado = calcTemp.saldoEsperadoGaveta;
            if (!usuarioEditouDeclarado && elFinal) {
                elFinal.value = Math.max(0, ultimoEsperadoCalculado).toFixed(2);
            }

            const declaradoVal = parseFloat(elFinal?.value);
            const calc = calcularResumoFechamentoCaixa({
                saldoInicial: sInicial,
                saldoFinalDeclarado: isNaN(declaradoVal) ? 0 : declaradoVal,
                vendas: vendasFiltradas,
                pagamentosFiado: fiadosFiltrados,
                despesas: despesasFiltradas,
                ajustes: ajForm
            });

            document.getElementById('nfLiveVendas').textContent = formatarMoeda(calc.totalVendas);
            document.getElementById('nfLiveEsperado').textContent = formatarMoeda(calc.saldoEsperadoGaveta);
            document.getElementById('nfLiveTotalLiquido').textContent = formatarMoeda(calc.totalLiquidoGeral);

            const diffEl = document.getElementById('nfLiveDiferenca');
            if (Math.abs(calc.diferencaCaixa) < 0.005) {
                diffEl.textContent = 'R$ 0,00 (Caixa Batido)';
                diffEl.style.color = '#059669';
            } else if (calc.diferencaCaixa > 0) {
                diffEl.textContent = `+${formatarMoeda(calc.diferencaCaixa)} (Sobra de Caixa)`;
                diffEl.style.color = '#1d4ed8';
            } else {
                diffEl.textContent = `${formatarMoeda(calc.diferencaCaixa)} (Quebra de Caixa)`;
                diffEl.style.color = '#dc2626';
            }

            return calc;
        };

        ['nfSaldoInicial', 'nfSuprimento', 'nfSangria', 'nfAjDinheiro', 'nfAjCartao', 'nfAjPix', 'nfAjOutros', 'nfAjDespesas'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', atualizarCalculoLive);
        });
        document.getElementById('nfSaldoFinal')?.addEventListener('input', () => {
            usuarioEditouDeclarado = true;
            atualizarCalculoLive();
        });
        document.getElementById('nfBtnIgualarEsperado')?.addEventListener('click', () => {
            usuarioEditouDeclarado = false;
            const elFinal = document.getElementById('nfSaldoFinal');
            if (elFinal) elFinal.value = Math.max(0, ultimoEsperadoCalculado).toFixed(2);
            atualizarCalculoLive();
        });
        document.getElementById('nfBtnDataOriginal')?.addEventListener('click', () => {
            const dtEl = document.getElementById('nfDataFechamento');
            if (dtEl && dataOriginalFechamento) {
                dtEl.value = toDateTimeLocalValue(dataOriginalFechamento);
            }
        });

        atualizarCalculoLive();

        const btnConfirm = document.getElementById('nfBtnConfirmarNovoFechamento');
        btnConfirm.onclick = async () => {
            const sInicial = parseFloat(document.getElementById('nfSaldoInicial')?.value);
            const sFinal = parseFloat(document.getElementById('nfSaldoFinal')?.value);
            if (isNaN(sInicial) || sInicial < 0) {
                notificar('Informe um Saldo Inicial válido.', 'error');
                return;
            }
            if (isNaN(sFinal) || sFinal < 0) {
                notificar('Informe um Saldo Final Declarado válido.', 'error');
                return;
            }

            const dtRaw = document.getElementById('nfDataFechamento')?.value;
            const dataFechamentoISO = dtRaw ? new Date(dtRaw).toISOString() : new Date().toISOString();
            const ajFinal = readAjustesForm();
            const resumoFinal = atualizarCalculoLive();
            const usuario = getUsuarioLogado();

            btnConfirm.disabled = true;
            btnConfirm.textContent = '⏳ Salvando novo fechamento...';

            try {
                const payload = {
                    status: 'fechado',
                    cancelado: false,
                    saldo_inicial: sInicial,
                    saldo_final: sFinal,
                    saldo_esperado: resumoFinal.saldoEsperadoGaveta,
                    diferenca_caixa: resumoFinal.diferencaCaixa,
                    ajustes_fechamento: ajFinal,
                    observacao_fechamento: ajFinal.observacao || null,
                    data_fechamento: dataFechamentoISO,
                    usuario_fechamento_id: usuario?.id || null
                };

                const { error } = await supabaseClient
                    .from('caixas')
                    .update(payload)
                    .eq('id', caixa.id);

                if (error) throw error;

                notificar(`✅ Novo fechamento do Caixa #${caixa.id} concluído com sucesso!`, 'success');
                fecharModal('modalNovoFechamento');

                await carregarDados();
                if (state.onDataChanged) await state.onDataChanged();

                // Abrir modal de visualização/reimpressão do novo fechamento ou perguntar impressão
                if (confirm('Novo fechamento salvo! Deseja reimprimir o relatório atualizado agora?')) {
                    await reimprimirFechamento(caixa.id, 'termico');
                }
            } catch (err) {
                console.error('Erro ao salvar novo fechamento:', err);
                notificar('Erro ao salvar novo fechamento: ' + (err.message || err), 'error');
                btnConfirm.disabled = false;
                btnConfirm.textContent = '✅ Confirmar Novo Fechamento';
            }
        };

        abrirModal('modalNovoFechamento');
    }

    // =========================================================================
    // 6. REIMPRESSÃO (CUPOM TÉRMICO 72MM E RELATÓRIO A4)
    // =========================================================================

    async function reimprimirFechamento(caixaId, modo = 'termico') {
        let caixa = state.caixas.find(c => String(c.id) === String(caixaId));
        if (!caixa) {
            const { data } = await supabaseClient.from('caixas').select('*').eq('id', caixaId).single();
            caixa = data;
        }
        if (!caixa) {
            notificar('Caixa não encontrado para impressão.', 'error');
            return;
        }

        if (state.saidas.length === 0 && !state.carregado) {
            await carregarDados();
        }

        const det = await carregarDetalhesCompletosCaixa(caixa);
        if (modo === 'a4') {
            imprimirRelatorioA4(det);
        } else {
            imprimirCupomTermico(det);
        }
    }

    function imprimirCupomTermico(det) {
        const { caixa, resumo, despesas, categorias, totalItens, nomeAbertura, historico } = det;
        const aj = resumo.ajustes;
        const usuario = getUsuarioLogado() || {};
        const empresaNome = window.getCompanyName ? window.getCompanyName() : (usuario.loja_nome || 'Aion ERP');
        const esperado = caixa.saldo_esperado !== null && caixa.saldo_esperado !== undefined ? Number(caixa.saldo_esperado) : resumo.saldoEsperadoGaveta;
        const declarado = caixa.saldo_final !== null && caixa.saldo_final !== undefined ? Number(caixa.saldo_final) : 0;
        const diff = caixa.diferenca_caixa !== null && caixa.diferenca_caixa !== undefined ? Number(caixa.diferenca_caixa) : fromCents(toCents(declarado) - toCents(esperado));

        const fpKeys = Object.keys(resumo.formasPagamento);
        const pagamentosHtml = fpKeys.length > 0
            ? fpKeys.map(k => `<tr><td>${escapeHtmlSafe(k)}</td><td class="text-right">${formatarMoeda(resumo.formasPagamento[k])}</td></tr>`).join('')
            : '<tr><td colspan="2" class="text-center">Nenhuma venda registrada</td></tr>';

        const planoKeys = Object.keys(categorias);
        planoKeys.sort((a, b) => {
            const isA = a.toLowerCase().includes('plano');
            const isB = b.toLowerCase().includes('plano');
            if (isA && !isB) return -1;
            if (!isA && isB) return 1;
            return a.localeCompare(b);
        });
        const planosHtml = planoKeys.length > 0
            ? planoKeys.map(k => `<tr><td>${escapeHtmlSafe(k)}</td><td class="text-right bold">${categorias[k].qtd}</td></tr>`).join('')
            : '<tr><td colspan="2" class="text-center">Nenhum item vendido</td></tr>';

        const despesasHtml = despesas.length > 0
            ? despesas.map(d => `<tr><td>${escapeHtmlSafe(d.descricao)}</td><td class="text-right">${formatarMoeda(d.valor)}</td></tr>`).join('')
            : '<tr><td colspan="2" class="text-center">Nenhuma despesa</td></tr>';

        const ajustesBloco = temAjustesAplicados(aj) ? `
            <div class="secao">
                <h3>⚙️ Ajustes de Fechamento</h3>
                ${aj.suprimento ? `<div class="kpi-row"><span>Suprimento (+):</span><span>${formatarMoeda(aj.suprimento)}</span></div>` : ''}
                ${aj.sangria ? `<div class="kpi-row"><span>Sangria (-):</span><span>-${formatarMoeda(aj.sangria)}</span></div>` : ''}
                ${aj.ajuste_despesas ? `<div class="kpi-row"><span>Ajuste Despesas:</span><span>${formatarMoeda(aj.ajuste_despesas)}</span></div>` : ''}
                ${caixa.observacao_fechamento ? `<div style="font-size:11px; margin-top:4px;">Obs: ${escapeHtmlSafe(caixa.observacao_fechamento)}</div>` : ''}
            </div>
        ` : (caixa.observacao_fechamento ? `<div class="secao" style="font-size:11px;">Obs: ${escapeHtmlSafe(caixa.observacao_fechamento)}</div>` : '');

        const janela = window.open('', '_blank');
        if (!janela) {
            notificar('Pop-up bloqueado! Permita pop-ups para imprimir o relatório.', 'warning');
            return;
        }

        janela.document.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Fechamento de Caixa #${caixa.id}</title>
                <style>
                    @page { margin: 0; size: auto; }
                    body { font-family: 'Courier New', Courier, monospace; padding: 4mm; width: 100%; max-width: 72mm; margin: 0 auto; font-size: 12.5px; line-height: 1.3; box-sizing: border-box; background: #fff; color: #000; }
                    .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 10px; }
                    .header h1 { margin: 0 0 3px 0; font-size: 14px; text-transform: uppercase; font-weight: bold; }
                    .header p { margin: 0; font-size: 11px; }
                    .tag-refech { display: inline-block; border: 1px solid #000; padding: 2px 6px; font-size: 10px; font-weight: bold; margin-top: 4px; }
                    .info-line { font-size: 11px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                    .kpi-section { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                    .kpi-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
                    .secao { margin-bottom: 12px; }
                    .secao h3 { margin: 0 0 5px 0; font-size: 12px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 3px; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 3px 0; font-size: 12px; text-align: left; }
                    th { border-bottom: 1px dashed #000; font-weight: bold; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .bold { font-weight: bold; }
                    .no-print-btn { text-align: right; margin-bottom: 10px; }
                    .btn { background: #000; color: #fff; border: 1px solid #000; padding: 5px 10px; font-size: 11px; font-family: monospace; cursor: pointer; font-weight: bold; }
                    .btn-secondary { background: #888; border-color: #888; margin-left: 5px; }
                    @media print { .no-print-btn { display: none !important; } body { width: 72mm; margin: 0; padding: 2mm; } }
                </style>
            </head>
            <body>
                <div class="no-print-btn">
                    <button class="btn" onclick="window.print()">Imprimir</button>
                    <button class="btn btn-secondary" onclick="window.close()">Fechar</button>
                </div>
                <div class="header">
                    <h1>FECHAMENTO DE CAIXA #${caixa.id}</h1>
                    <p>${escapeHtmlSafe(empresaNome)}</p>
                    ${historico.length > 0 ? `<div class="tag-refech">REFECHAMENTO (${historico.length} cancel. anterior)</div>` : ''}
                </div>
                <div class="info-line">
                    Abertura:   ${formatarDataHora(caixa.data_abertura)}<br>
                    Fechamento: ${formatarDataHora(caixa.data_fechamento || new Date().toISOString())}<br>
                    Operador:   ${escapeHtmlSafe(nomeAbertura)}
                </div>
                <div class="kpi-section">
                    <div class="kpi-row"><span>Saldo Inicial:</span><span class="bold">${formatarMoeda(resumo.saldoInicial)}</span></div>
                    <div class="kpi-row"><span>Vendas no Dia:</span><span class="bold">${formatarMoeda(resumo.totalVendas)}</span></div>
                    ${resumo.suprimento ? `<div class="kpi-row"><span>Suprimentos (+):</span><span class="bold">${formatarMoeda(resumo.suprimento)}</span></div>` : ''}
                    <div class="kpi-row"><span>Despesas no Dia:</span><span class="bold">-${formatarMoeda(resumo.totalDespesas)}</span></div>
                    ${resumo.sangria ? `<div class="kpi-row"><span>Sangrias (-):</span><span class="bold">-${formatarMoeda(resumo.sangria)}</span></div>` : ''}
                    <div class="kpi-row"><span>Total Líquido:</span><span class="bold">${formatarMoeda(resumo.totalLiquidoGeral)}</span></div>
                    <div class="kpi-row"><span>Esperado Gaveta:</span><span class="bold">${formatarMoeda(esperado)}</span></div>
                    <div class="kpi-row"><span>Declarado Caixa:</span><span class="bold">${formatarMoeda(declarado)}</span></div>
                    <div class="kpi-row"><span>Diferença:</span><span class="bold">${diff > 0 ? '+' : ''}${formatarMoeda(diff)}</span></div>
                    <div class="kpi-row"><span>Descontos:</span><span class="bold">${formatarMoeda(resumo.totalDescontos)}</span></div>
                    <div class="kpi-row"><span>Itens Vendidos:</span><span class="bold">${totalItens}</span></div>
                </div>
                ${ajustesBloco}
                <div class="secao">
                    <h3>💳 Pagamentos</h3>
                    <table><thead><tr><th>Forma</th><th class="text-right">Valor</th></tr></thead><tbody>${pagamentosHtml}<tr style="border-top:1px dashed #000; font-weight:bold;"><td>TOTAL VENDAS</td><td class="text-right">${formatarMoeda(resumo.totalVendas)}</td></tr></tbody></table>
                </div>
                <div class="secao">
                    <h3>💸 Despesas</h3>
                    <table><thead><tr><th>Descrição</th><th class="text-right">Valor</th></tr></thead><tbody>${despesasHtml}<tr style="border-top:1px dashed #000; font-weight:bold;"><td>TOTAL DESPESAS</td><td class="text-right">${formatarMoeda(resumo.totalDespesas)}</td></tr></tbody></table>
                </div>
                <div class="secao">
                    <h3>📦 Tipo / Quantidade</h3>
                    <table><thead><tr><th>Tipo (Categoria)</th><th class="text-right">Qtd</th></tr></thead><tbody>${planosHtml}</tbody></table>
                </div>
                <div style="margin-top: 30px; border-top: 1px dashed #000; padding-top: 15px; text-align: center; font-size: 11px;">
                    Assinatura Operador: ${escapeHtmlSafe(nomeAbertura)}<br><br><br>__________________________________
                </div>
                <div style="margin-top: 25px; text-align: center; font-size: 11px; margin-bottom: 15px;">
                    Assinatura Gerente<br><br><br>__________________________________
                </div>
                <script>window.onload = function() { setTimeout(() => { window.print(); }, 350); };</script>
            </body>
            </html>
        `);
        janela.document.close();
    }

    function imprimirRelatorioA4(det) {
        const { caixa, resumo, despesas, categorias, totalItens, nomeAbertura, nomeFechamento, historico } = det;
        const usuario = getUsuarioLogado() || {};
        const empresaNome = window.getCompanyName ? window.getCompanyName() : (usuario.loja_nome || 'Aion ERP');
        const esperado = caixa.saldo_esperado !== null && caixa.saldo_esperado !== undefined ? Number(caixa.saldo_esperado) : resumo.saldoEsperadoGaveta;
        const declarado = caixa.saldo_final !== null && caixa.saldo_final !== undefined ? Number(caixa.saldo_final) : 0;
        const diff = caixa.diferenca_caixa !== null && caixa.diferenca_caixa !== undefined ? Number(caixa.diferenca_caixa) : fromCents(toCents(declarado) - toCents(esperado));

        const win = window.open('', '_blank', 'width=900,height=720');
        if (!win) {
            notificar('Pop-up bloqueado! Permita pop-ups para visualizar/imprimir em A4.', 'warning');
            return;
        }

        const pagRows = Object.entries(resumo.formasPagamento).map(([k, v]) =>
            `<tr><td>${escapeHtmlSafe(k)}</td><td style="text-align:right; font-weight:700;">${formatarMoeda(v)}</td></tr>`
        ).join('') || '<tr><td colspan="2">Nenhuma venda</td></tr>';

        const catRows = Object.entries(categorias).map(([cat, info]) =>
            `<tr><td>${escapeHtmlSafe(cat)}</td><td style="text-align:center;">${info.qtd}</td><td style="text-align:right; font-weight:700;">${formatarMoeda(info.total)}</td></tr>`
        ).join('') || '<tr><td colspan="3">Nenhum item</td></tr>';

        const despRows = despesas.map(d =>
            `<tr><td>${escapeHtmlSafe(d.descricao)}</td><td>${escapeHtmlSafe(d.categoria || '-')}</td><td style="text-align:right; color:#dc2626;">-${formatarMoeda(d.valor)}</td></tr>`
        ).join('') || '<tr><td colspan="3">Nenhuma despesa</td></tr>';

        win.document.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Fechamento de Caixa #${caixa.id}</title>
                <style>
                    body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; padding: 24px 30px; font-size: 13px; }
                    .head { display: flex; justify-content: space-between; border-bottom: 3px solid #0d1728; padding-bottom: 12px; margin-bottom: 18px; }
                    .head h1 { margin: 0; font-size: 20px; color: #0d1728; }
                    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 18px; }
                    .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc; }
                    .kpi span { display: block; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; }
                    .kpi strong { font-size: 15px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
                    th, td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; }
                    th { background: #f1f5f9; font-size: 12px; }
                    h3 { font-size: 14px; margin: 14px 0 8px; color: #0d1728; border-left: 4px solid #eb5e28; padding-left: 8px; }
                    .no-print { margin-bottom: 14px; text-align: right; }
                    .btn { padding: 7px 14px; border: none; border-radius: 5px; cursor: pointer; font-weight: 700; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <button class="btn" style="background:#0d1728; color:#fff;" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
                    <button class="btn" style="background:#e2e8f0; margin-left:6px;" onclick="window.close()">Fechar</button>
                </div>
                <div class="head">
                    <div>
                        <h1>Relatório de Fechamento de Caixa #${caixa.id}</h1>
                        <div>${escapeHtmlSafe(empresaNome)} ${historico.length > 0 ? '— REFECHAMENTO' : ''}</div>
                    </div>
                    <div style="text-align:right; font-size:12px;">
                        <div>Abertura: <strong>${formatarDataHora(caixa.data_abertura)}</strong> (${escapeHtmlSafe(nomeAbertura)})</div>
                        <div>Fechamento: <strong>${formatarDataHora(caixa.data_fechamento)}</strong> (${escapeHtmlSafe(nomeFechamento)})</div>
                        <div>Itens Vendidos: <strong>${totalItens}</strong> | Descontos: <strong>${formatarMoeda(resumo.totalDescontos)}</strong></div>
                    </div>
                </div>
                <div class="kpis">
                    <div class="kpi"><span>Fundo Inicial</span><strong>${formatarMoeda(resumo.saldoInicial)}</strong></div>
                    <div class="kpi"><span>Vendas (c/ Ajustes)</span><strong style="color:#059669;">${formatarMoeda(resumo.totalVendas)}</strong></div>
                    <div class="kpi"><span>Despesas + Sangria</span><strong style="color:#dc2626;">${formatarMoeda(fromCents(toCents(resumo.totalDespesas) + toCents(resumo.sangria)))}</strong></div>
                    <div class="kpi"><span>Esperado Gaveta</span><strong>${formatarMoeda(esperado)}</strong></div>
                    <div class="kpi"><span>Declarado (Dif.)</span><strong>${formatarMoeda(declarado)} (${diff > 0 ? '+' : ''}${formatarMoeda(diff)})</strong></div>
                </div>
                ${caixa.observacao_fechamento ? `<p><strong>Observações:</strong> ${escapeHtmlSafe(caixa.observacao_fechamento)}</p>` : ''}
                <h3>Formas de Pagamento</h3>
                <table><thead><tr><th>Forma</th><th style="text-align:right;">Total</th></tr></thead><tbody>${pagRows}</tbody></table>
                <h3>Produtos Vendidos por Categoria</h3>
                <table><thead><tr><th>Categoria</th><th style="text-align:center;">Qtd</th><th style="text-align:right;">Total</th></tr></thead><tbody>${catRows}</tbody></table>
                <h3>Despesas do Período</h3>
                <table><thead><tr><th>Descrição</th><th>Categoria</th><th style="text-align:right;">Valor</th></tr></thead><tbody>${despRows}</tbody></table>
            </body>
            </html>
        `);
        win.document.close();
    }

    // =========================================================================
    // 7. EXPORTAÇÃO EXCEL E PDF DA LISTAGEM
    // =========================================================================

    function exportarExcel() {
        if (typeof exportarTabelaParaExcel === 'function') {
            exportarTabelaParaExcel('tabelaRelatorioFechamentos', 'Relatorio_Fechamento_Caixa');
        } else {
            notificar('Recurso de exportação Excel não carregado.', 'warning');
        }
    }

    function exportarPDF() {
        if (typeof exportarTabelaParaPDF === 'function') {
            const ini = document.getElementById('frDataInicio')?.value || '';
            const fim = document.getElementById('frDataFim')?.value || '';
            const sub = (ini || fim) ? `Período: ${ini || '...'} até ${fim || '...'}` : 'Todos os registros';
            exportarTabelaParaPDF('tabelaRelatorioFechamentos', 'Relatório de Fechamento de Caixa', sub);
        } else {
            notificar('Recurso de exportação PDF não carregado.', 'warning');
        }
    }

    window.RelatorioFechamentoCaixa = {
        mount,
        carregarDados,
        aplicarFiltros,
        limparFiltros,
        visualizarFechamento,
        reimprimirFechamento,
        abrirModalCancelarFechamento,
        abrirModalNovoFechamento,
        fecharModal,
        exportarExcel,
        exportarPDF,
        carregarDetalhesCompletosCaixa,
        getCaixasFiltrados,
        imprimirCupomTermico,
        imprimirRelatorioA4
    };
})(typeof window !== 'undefined' ? window : globalThis);
