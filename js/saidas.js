
// js/saidas.js — PDV Sistema de Estoque (versão completa corrigida)

document.addEventListener('DOMContentLoaded', () => {

    // =====================================================
    // FUNÇÕES AUXILIARES
    // =====================================================

    function getDataLocalBrasil() {
        const hoje = new Date();
        const dataStr = hoje.toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const partes = dataStr.split('/');
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }

    function formatarData(data) {
        if (!data) return '-';
        const partes = data.substring(0, 10).split('-');
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    function formatarMoeda(valor) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency', currency: 'BRL'
        }).format(valor || 0);
    }

    function podeCancelarVenda(dataFinalizacao) {
        if (!dataFinalizacao) return false;
        const diff = (new Date() - new Date(dataFinalizacao)) / (1000 * 60 * 60);
        return diff <= 2;
    }

    function verificarPermissaoModulo(modulo, acao = 'ver') {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        if (!usuario) return false;
        if (usuario.perfil === 'admin') return true;
        const permissoes = usuario.permissoes || {};
        return permissoes[modulo]?.[acao] || false;
    }

    // =====================================================
    // CONTROLE DE LOTES E VALIDADE (AUXILIARES)
    // =====================================================

    function salvarLotesLocal(produtoId, lotes) {
        try {
            if (!produtoId || !Array.isArray(lotes)) return;
            localStorage.setItem(`aion_lotes_prod_${produtoId}`, JSON.stringify(lotes));
        } catch (e) {
            console.warn('Aviso: erro ao salvar lotes no localStorage:', e);
        }
    }

    function obterLotesLocal(produtoId) {
        try {
            if (!produtoId) return null;
            const item = localStorage.getItem(`aion_lotes_prod_${produtoId}`);
            if (!item) return null;
            const parsed = JSON.parse(item);
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function sincronizarLotesComEstoqueTotal(lotes, estoqueTotal) {
        if (!Array.isArray(lotes) || lotes.length === 0) return lotes;
        const totalLotes = lotes.reduce((sum, l) => sum + (parseInt(l.quantidade) || 0), 0);
        const diff = (parseInt(estoqueTotal) || 0) - totalLotes;
        if (diff !== 0) {
            const loteAjustar = lotes.find(l => (parseInt(l.quantidade) || 0) + diff >= 0) || lotes[0];
            if (loteAjustar) {
                loteAjustar.quantidade = Math.max(0, (parseInt(loteAjustar.quantidade) || 0) + diff);
            }
        }
        return lotes;
    }

    function obterLotesProdutoSaidas(produto) {
        if (!produto) return [];
        if (Array.isArray(produto.lotes) && produto.lotes.length > 0) {
            return produto.lotes.map(l => ({
                lote: String(l.lote || '').trim(),
                data_validade: l.data_validade || '',
                quantidade: (l.quantidade !== undefined && l.quantidade !== null) ? parseInt(l.quantidade) : 0,
                alerta_vencimento_dias: parseInt(l.alerta_vencimento_dias) || 30
            })).filter(l => l.lote || l.data_validade);
        }

        const local = obterLotesLocal(produto.id);
        if (Array.isArray(local) && local.length > 0) {
            const estoque = parseInt(produto.estoque_total || produto.estoque) || 0;
            const sincronizados = sincronizarLotesComEstoqueTotal(local, estoque);
            produto.lotes = sincronizados;
            return sincronizados.map(l => ({
                lote: String(l.lote || '').trim(),
                data_validade: l.data_validade || '',
                quantidade: (l.quantidade !== undefined && l.quantidade !== null) ? parseInt(l.quantidade) : 0,
                alerta_vencimento_dias: parseInt(l.alerta_vencimento_dias) || 30
            })).filter(l => l.lote || l.data_validade);
        }

        if (produto.lote || produto.data_validade) {
            return [{
                lote: String(produto.lote || 'LOTE-PADRAO').trim(),
                data_validade: produto.data_validade || '',
                quantidade: parseInt(produto.estoque_total || produto.estoque) || 0,
                alerta_vencimento_dias: parseInt(produto.alerta_vencimento_dias) || 30
            }];
        }
        return [];
    }

    function calcularStatusValidadeSaidas(dataValidade, alertaDias = 30) {
        if (!dataValidade) return { dataFormatada: '-', badge: '', diffDays: 999 };
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const [ano, mes, dia] = dataValidade.split('-').map(Number);
        const dataVal = new Date(ano, mes - 1, dia);
        const diffTime = dataVal - hoje;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const dataFormatada = dataValidade.split('-').reverse().join('/');

        if (diffDays < 0) {
            return {
                dataFormatada,
                diffDays,
                status: 'vencido',
                badge: `<span style="background:#fee2e2; color:#991b1b; font-size:10px; padding:1px 6px; border-radius:4px; font-weight:700; display:inline-block;">🔴 Vencido (${Math.abs(diffDays)}d)</span>`
            };
        } else if (diffDays <= alertaDias) {
            return {
                dataFormatada,
                diffDays,
                status: 'alerta',
                badge: `<span style="background:#fef3c7; color:#92400e; font-size:10px; padding:1px 6px; border-radius:4px; font-weight:700; display:inline-block;">⚠️ Vence em ${diffDays}d</span>`
            };
        } else {
            return {
                dataFormatada,
                diffDays,
                status: 'normal',
                badge: `<span style="background:#dcfce7; color:#166534; font-size:10px; padding:1px 6px; border-radius:4px; font-weight:700; display:inline-block;">🟢 ${diffDays}d</span>`
            };
        }
    }

    // =====================================================
    // AUTENTICAÇÃO
    // =====================================================

    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    if (!verificarPermissaoModulo('saidas', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align:center;padding:50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>`;
        return;
    }

    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = {
        admin: '👑 Administrador', gerente: '📊 Gerente',
        vendedor: '💰 Vendedor', tecnico: '🔧 Técnico', basico: '👤 Básico'
    };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil;

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });

    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('open');
    });

    // =====================================================
    // VARIÁVEIS GLOBAIS
    // =====================================================

    let produtos = [];
    let clientes = [];
    let colaboradores = [];
    let categorias = [];
    let configLoja = {};
    let carrinho = [];
    let formaPagamentoSelecionada = null;
    let produtoSerialPendente = null;
    let produtoLotePendente = null;
    let seriaisDisponiveis = [];
    let searchTimer = null;
    let promocoesVigentes = [];
    let produtosPromocaoVigentes = [];

    // =====================================================
    // CARREGAR DADOS
    // ✅ FIX: removido .eq('ativo', true) — substitído por
    //    .neq('ativo', false) para incluir produtos com ativo=null
    // =====================================================

    async function carregarDados(novoIdDestaque = null) {
        try {
            const [produtosRes, clientesRes, configRes, vendasRes, categoriasRes] = await Promise.all([
                supabaseClient
                    .from('produtos')
                    .select('*')
                    .neq('ativo', false)          // ✅ inclui null e true
                    .order('nome', { ascending: true }),
                supabaseClient
                    .from('clientes')
                    .select('*')
                    .order('nome'),
                supabaseClient
                    .from('config_loja')
                    .select('*')
                    .limit(1),
                supabaseClient
                    .from('saidas')
                    .select('*, clientes(nome)')
                    .order('id', { ascending: false })
                    .limit(100),
                supabaseClient
                    .from('categorias')
                    .select('*')
                    .order('nome')
                    .then(res => res, err => ({ data: [], error: err }))
            ]);

            produtos   = (produtosRes.data || []).map(p => {
                if (!Array.isArray(p.lotes) || p.lotes.length === 0) {
                    const local = obterLotesLocal(p.id);
                    if (Array.isArray(local) && local.length > 0) {
                        const estoque = parseInt(p.estoque_total || p.estoque) || 0;
                        p.lotes = sincronizarLotesComEstoqueTotal(local, estoque);
                    }
                } else {
                    salvarLotesLocal(p.id, p.lotes);
                }
                return p;
            });
            clientes   = clientesRes.data  || [];
            configLoja = configRes.data?.[0] || {};
            categorias = (categoriasRes && categoriasRes.data) || [];
            
            // Carregar colaboradores de forma tolerante a falhas (só ativos)
            try {
                const colaboradoresRes = await supabaseClient
                    .from('colaboradores')
                    .select('*')
                    .neq('ativo', false)
                    .order('nome', { ascending: true });
                
                if (colaboradoresRes.error) throw colaboradoresRes.error;
                colaboradores = colaboradoresRes.data || [];
            } catch (colabErr) {
                console.warn('Erro ao carregar colaboradores, prosseguindo sem eles:', colabErr);
                colaboradores = [];
            }

            // Preencher dropdown de colaboradores
            const colabSelect = document.getElementById('vendaColaborador');
            if (colabSelect) {
                colabSelect.innerHTML = '<option value="">-- Sem colaborador vinculado --</option>';
                colaboradores.forEach(c => {
                    const option = document.createElement('option');
                    option.value = c.id;
                    option.textContent = `${c.nome} ${c.sobrenome || ''} (${c.funcao || 'Colaborador'})`;
                    colabSelect.appendChild(option);
                });
            }

            // Contador de produtos no placeholder
            const inputProd = document.getElementById('searchProdutoVenda');
            if (inputProd) {
                inputProd.placeholder = `🔍 Informe o cód. de barras, código ou serial (${produtos.length} produtos disponíveis)...`;
            }
            // Carregar Ações Promocionais Vigentes e Produtos Participantes
            try {
                if (window.PromocoesAPI) {
                    promocoesVigentes = await window.PromocoesAPI.obterPromocoesVigentes();
                    const vinculosPromises = promocoesVigentes.map(p => window.PromocoesAPI.listarProdutosPromocao(p.id));
                    const vinculosArray = await Promise.all(vinculosPromises);
                    produtosPromocaoVigentes = vinculosArray.flat().filter(v => v.ativo !== false);
                }
            } catch (promoErr) {
                console.warn('Erro ao carregar promoções ativas para o PDV:', promoErr);
                promocoesVigentes = [];
                produtosPromocaoVigentes = [];
            }

            renderizarVendas(vendasRes.data || [], novoIdDestaque);

            // === VERIFICAR STATUS DO CAIXA DIÁRIO ===
            let caixaAtivo = null;

            // Injetar estilos do spinner se não existirem
            const styleIdSpinner = 'spinner-keyframes-styles';
            if (!document.getElementById(styleIdSpinner)) {
                const style = document.createElement('style');
                style.id = styleIdSpinner;
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }

            // Criar modal do Caixa no PDV se não existir
            if (!document.getElementById('modalCaixaPDV')) {
                const modalHtml = `
                <div id="modalCaixaPDV" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:999999; display:none; backdrop-filter: blur(4px); transition: all 0.3s ease;">
                    <div style="background:#fff; padding:24px; border-radius:12px; width:100%; max-width:450px; box-shadow:0 10px 30px rgba(0,0,0,0.3); position:relative; box-sizing:border-box; font-family:inherit;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid #eee; padding-bottom:10px;">
                            <h2 id="modalCaixaPDVTitle" style="font-size:18px; font-weight:700; color:#1f2937; margin:0;"></h2>
                            <span id="closeModalCaixaPDV" style="cursor:pointer; font-size:24px; font-weight:bold; color:var(--gray);">&times;</span>
                        </div>
                        <div id="modalCaixaPDVBody" style="max-height: 420px; overflow-y: auto; margin-bottom: 15px; padding-right: 5px;">
                            <!-- Dinâmico -->
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #eee; padding-top:12px;">
                            <button id="btnCancelCaixaPDV" style="padding:8px 16px; border-radius:8px; border:1px solid #d1d5db; cursor:pointer; font-weight:600; background:#f9fafb; color:#374151;">Cancelar</button>
                            <button id="btnConfirmCaixaPDV" style="padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-weight:600; background:var(--primary); color:#fff;"></button>
                        </div>
                    </div>
                </div>
                `;
                document.body.insertAdjacentHTML('beforeend', modalHtml);

                // Adicionar listener para fechar o modal
                document.getElementById('closeModalCaixaPDV').addEventListener('click', fecharModalCaixaPDV);
                document.getElementById('btnCancelCaixaPDV').addEventListener('click', fecharModalCaixaPDV);
            }

            function fecharModalCaixaPDV() {
                document.getElementById('modalCaixaPDV').style.display = 'none';
            }

            async function atualizarBotoesEStatusCaixa() {
                try {
                    caixaAtivo = await obterCaixaAtivo();
                } catch (e) {
                    console.warn('Erro ao consultar caixa ativo:', e);
                }

                const bannerCaixa = document.getElementById('bannerCaixaFechado');
                const inputCli = document.getElementById('searchCliente');
                const btnFinalizar = document.getElementById('btnFinalizarVenda');
                const btnCaixa = document.getElementById('btnCaixaPDV');

                const isPendente = isCaixaDiaAnterior(caixaAtivo);

                if (btnCaixa) {
                    btnCaixa.style.display = 'inline-flex';
                    if (!caixaAtivo) {
                        btnCaixa.innerHTML = '🔑 Abrir Caixa';
                        btnCaixa.style.backgroundColor = '#10b981';
                        btnCaixa.style.color = '#fff';
                    } else if (isPendente) {
                        btnCaixa.innerHTML = '🔒 Fechar Caixa Anterior';
                        btnCaixa.style.backgroundColor = '#d97706';
                        btnCaixa.style.color = '#fff';
                    } else {
                        btnCaixa.innerHTML = '🔒 Fechar Caixa';
                        btnCaixa.style.backgroundColor = '#ef4444';
                        btnCaixa.style.color = '#fff';
                    }
                }

                if (!caixaAtivo || isPendente) {
                    // Se caixa estiver fechado OU se houver caixa de dia anterior pendente de fechamento
                    const htmlBanner = isPendente
                        ? `⚠️ <strong>ATENÇÃO: CAIXA DO DIA ANTERIOR NÃO FOI FECHADO!</strong><br><span style="font-weight: 500; font-size: 13px;">O caixa aberto em <strong>${formatarDataHora(caixaAtivo.data_abertura)}</strong> precisa ser encerrado antes de iniciar as atividades de hoje. Por favor, clique em <strong>🔒 Fechar Caixa Anterior</strong> acima para concluir o fechamento e liberar a abertura do caixa de hoje.</span>`
                        : '⚠️ O CAIXA ESTÁ FECHADO! Para realizar vendas, é necessário realizar a abertura de caixa clicando em <strong>🔑 Abrir Caixa</strong> acima.';

                    const bgBanner = isPendente ? '#fff3cd' : '#f8d7da';
                    const colorBanner = isPendente ? '#856404' : '#721c24';
                    const borderBanner = isPendente ? '1px solid #ffeeba' : '1px solid #f5c6cb';

                    if (!bannerCaixa) {
                        const banner = document.createElement('div');
                        banner.id = 'bannerCaixaFechado';
                        banner.style.backgroundColor = bgBanner;
                        banner.style.color = colorBanner;
                        banner.style.border = borderBanner;
                        banner.style.padding = '12px 20px';
                        banner.style.borderRadius = '8px';
                        banner.style.marginBottom = '15px';
                        banner.style.fontWeight = '700';
                        banner.style.fontSize = '14px';
                        banner.innerHTML = htmlBanner;
                        
                        const containerPDV = document.querySelector('.pdv-busca-top');
                        if (containerPDV && containerPDV.parentNode) {
                            containerPDV.parentNode.insertBefore(banner, containerPDV);
                        }
                    } else {
                        bannerCaixa.style.display = 'block';
                        bannerCaixa.style.backgroundColor = bgBanner;
                        bannerCaixa.style.color = colorBanner;
                        bannerCaixa.style.border = borderBanner;
                        bannerCaixa.innerHTML = htmlBanner;
                    }

                    // Desabilitar controles
                    if (inputProd) inputProd.disabled = true;
                    if (inputCli) inputCli.disabled = true;
                    if (btnFinalizar) {
                        btnFinalizar.disabled = true;
                        btnFinalizar.style.backgroundColor = '#ccc';
                        btnFinalizar.style.cursor = 'not-allowed';
                        btnFinalizar.textContent = isPendente ? '🔒 Feche o Caixa Anterior' : '🔒 Caixa Fechado';
                    }
                } else {
                    // Caixa aberto hoje, esconder banner se existir
                    if (bannerCaixa) {
                        bannerCaixa.style.display = 'none';
                    }
                    if (inputProd) inputProd.disabled = false;
                    if (inputCli) inputCli.disabled = false;
                    if (btnFinalizar) {
                        btnFinalizar.disabled = false;
                        btnFinalizar.style.backgroundColor = '';
                        btnFinalizar.style.cursor = '';
                        btnFinalizar.textContent = '✅ Finalizar Venda';
                    }
                }
            }

            async function abrirModalCaixaPDVDinamico() {
                const modal = document.getElementById('modalCaixaPDV');
                const modalTitle = document.getElementById('modalCaixaPDVTitle');
                const modalBody = document.getElementById('modalCaixaPDVBody');
                const btnConfirm = document.getElementById('btnConfirmCaixaPDV');

                modal.style.display = 'flex';

                if (!caixaAtivo) {
                    // Modo Abertura
                    modalTitle.textContent = '🔑 Abertura de Caixa';
                    modalBody.innerHTML = `
                        <div style="padding: 5px 0;">
                            <p style="font-size: 13px; color: #4b5563; margin-bottom: 15px; line-height: 1.5;">Informe o valor inicial em dinheiro disponível na gaveta para troco no novo dia.</p>
                            <div style="margin-bottom: 12px;">
                                <label style="display:block; font-size: 13px; font-weight:600; margin-bottom:6px; color:#374151;">Saldo Inicial em Dinheiro (R$):</label>
                                <input type="number" id="pdvSaldoInicial" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:15px; font-weight:600; box-sizing:border-box;" value="0.00" step="0.01" min="0">
                            </div>
                        </div>
                    `;
                    btnConfirm.style.display = 'block';
                    btnConfirm.textContent = 'Confirmar Abertura';
                    btnConfirm.onclick = async () => {
                        const val = parseFloat(document.getElementById('pdvSaldoInicial').value || 0);
                        if (isNaN(val) || val < 0) {
                            mostrarNotificacao('Informe um valor inicial válido!', 'error');
                            return;
                        }

                        // Validar se há caixa de dia anterior que ainda precisa ser fechado
                        const statusAtual = await obterStatusCaixa();
                        if (statusAtual.tipo === 'pendente_fechamento_anterior') {
                            mostrarNotificacao('⚠️ Não é possível abrir novo caixa: existe um caixa de ' + formatarDataHora(statusAtual.caixa.data_abertura) + ' que precisa ser fechado primeiro!', 'error');
                            fecharModalCaixaPDV();
                            await atualizarBotoesEStatusCaixa();
                            return;
                        }

                        btnConfirm.disabled = true;
                        btnConfirm.textContent = 'Abrindo...';
                        try {
                            const { data, error } = await supabaseClient
                                .from('caixas')
                                .insert({
                                    loja_id: usuario.loja_id,
                                    saldo_inicial: val,
                                    usuario_abertura_id: usuario.id,
                                    status: 'aberto'
                                })
                                .select();
                            if (error) throw error;
                            mostrarNotificacao('🎉 Caixa aberto com sucesso!', 'success');
                            fecharModalCaixaPDV();
                            await atualizarBotoesEStatusCaixa();
                        } catch (e) {
                            console.error(e);
                            mostrarNotificacao('Erro ao abrir caixa: ' + e.message, 'error');
                        } finally {
                            btnConfirm.disabled = false;
                            btnConfirm.textContent = 'Confirmar Abertura';
                        }
                    };
                } else {
                    const isPendente = isCaixaDiaAnterior(caixaAtivo);

                    // Modo Fechamento - Carregar dados
                    modalTitle.textContent = isPendente 
                        ? `🔒 Fechamento de Caixa Anterior (${formatarDataHora(caixaAtivo.data_abertura)})`
                        : '🔒 Fechamento de Caixa';

                    modalBody.innerHTML = `
                        <div style="text-align: center; padding: 20px 0;">
                            <div style="border: 3px solid #f3f3f3; border-top: 3px solid var(--primary); border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
                            <p style="font-size: 13px; color: #6b7280;">Carregando resumo do caixa ${isPendente ? 'do dia anterior' : 'ativo'}...</p>
                        </div>
                    `;
                    btnConfirm.style.display = 'none';

                    let vendasCaixa = [];
                    let despesasCaixa = [];
                    try {
                        // 1. Buscar vendas da loja
                        const { data: vData, error: vErr } = await supabaseClient
                            .from('saidas')
                            .select('*');
                        
                        if (!vErr && vData) {
                            const dataAbertura = new Date(caixaAtivo.data_abertura);
                            const dataAberturaStr = caixaAtivo.data_abertura ? caixaAtivo.data_abertura.substring(0, 10) : '';

                            vendasCaixa = vData.filter(v => {
                                if (v.cancelado === true) return false;
                                if (v.caixa_id !== null && v.caixa_id !== undefined && String(v.caixa_id) === String(caixaAtivo.id)) {
                                    return true;
                                }
                                if (!v.caixa_id) {
                                    const dtVenda = v.data_finalizacao ? new Date(v.data_finalizacao) : (v.created_at ? new Date(v.created_at) : null);
                                    if (dtVenda && !isNaN(dtVenda.getTime()) && dtVenda >= dataAbertura) {
                                        return true;
                                    }
                                    if (v.data && dataAberturaStr && String(v.data).substring(0, 10) === dataAberturaStr) {
                                        return true;
                                    }
                                }
                                return false;
                            });
                        }

                        // 2. Buscar despesas pagas no período do caixa
                        const { data: dData, error: dErr } = await supabaseClient
                            .from('despesas')
                            .select('*');
                        
                        if (!dErr && dData) {
                            const dataAbertura = new Date(caixaAtivo.data_abertura);
                            const dataAberturaStr = caixaAtivo.data_abertura ? caixaAtivo.data_abertura.substring(0, 10) : '';
                            despesasCaixa = dData.filter(d => {
                                const dt = d.data_pagamento ? new Date(d.data_pagamento) : (d.created_at ? new Date(d.created_at) : (d.data ? new Date(d.data) : null));
                                if (dt && !isNaN(dt.getTime()) && dt >= dataAbertura) return true;
                                if (d.data && dataAberturaStr && String(d.data).substring(0, 10) === dataAberturaStr) return true;
                                return false;
                            });
                        }
                    } catch (e) {
                        console.warn('Erro ao obter dados consolidados do caixa:', e);
                    }

                    // Processar os valores
                    let totalVendas = 0;
                    let dinheiroVendas = 0;
                    let cartaoVendas = 0;
                    let pixVendas = 0;
                    let prazoVendas = 0;
                    
                    vendasCaixa.forEach(v => {
                        if (v.cancelado) return;
                        const t = parseFloat(v.total || 0);
                        totalVendas += t;
                        if (v.forma_pagamento) {
                            const fp = v.forma_pagamento.toLowerCase();
                            if (fp.includes('dinheiro')) dinheiroVendas += t;
                            else if (fp.includes('cartao') || fp.includes('cartão') || fp.includes('credito') || fp.includes('debito')) cartaoVendas += t;
                            else if (fp.includes('pix')) pixVendas += t;
                            else prazoVendas += t;
                        } else {
                            dinheiroVendas += t;
                        }
                    });

                    let totalDespesas = 0;
                    despesasCaixa.forEach(d => {
                        totalDespesas += parseFloat(d.valor || 0);
                    });

                    const saldoInicial = parseFloat(caixaAtivo.saldo_inicial || 0);
                    const saldoEsperadoGaveta = saldoInicial + dinheiroVendas - totalDespesas;

                    const avisoPendenteHtml = isPendente ? `
                        <div style="background:#fffbeb; border:1px solid #fcd34d; border-left:4px solid #f59e0b; padding:10px 14px; border-radius:6px; margin-bottom:12px; font-size:12.5px; color:#92400e; line-height:1.4;">
                            ⚠️ <strong>Atenção:</strong> Este caixa pertence ao dia <strong>${formatarDataHora(caixaAtivo.data_abertura)}</strong> e não foi encerrado no mesmo dia. Ao confirmar o fechamento, o caixa anterior será finalizado e o PDV ficará pronto para você abrir o caixa de hoje.
                        </div>
                    ` : '';

                    modalBody.innerHTML = `
                        <div style="font-size: 13px; color: #374151;">
                            ${avisoPendenteHtml}
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                                <div style="background:#f9fafb; padding:8px; border-radius:6px; border:1px solid #e5e7eb;">
                                    <div style="font-size:10px; color:#6b7280; font-weight:600; text-transform:uppercase;">Saldo Inicial</div>
                                    <div style="font-size:13px; font-weight:700;">R$ ${saldoInicial.toFixed(2)}</div>
                                </div>
                                <div style="background:#f9fafb; padding:8px; border-radius:6px; border:1px solid #e5e7eb;">
                                    <div style="font-size:10px; color:#6b7280; font-weight:600; text-transform:uppercase;">Vendas Totais</div>
                                    <div style="font-size:13px; font-weight:700; color:#10b981;">R$ ${totalVendas.toFixed(2)}</div>
                                </div>
                                <div style="background:#f9fafb; padding:8px; border-radius:6px; border:1px solid #e5e7eb;">
                                    <div style="font-size:10px; color:#6b7280; font-weight:600; text-transform:uppercase;">Vendas Dinheiro</div>
                                    <div style="font-size:13px; font-weight:700;">R$ ${dinheiroVendas.toFixed(2)}</div>
                                </div>
                                <div style="background:#f9fafb; padding:8px; border-radius:6px; border:1px solid #e5e7eb;">
                                    <div style="font-size:10px; color:#6b7280; font-weight:600; text-transform:uppercase;">Despesas Pagas</div>
                                    <div style="font-size:13px; font-weight:700; color:#ef4444;">R$ ${totalDespesas.toFixed(2)}</div>
                                </div>
                            </div>
                            
                            <div style="background:#eff6ff; padding:12px; border-radius:8px; border:1px solid #bfdbfe; margin-bottom:15px; text-align:center;">
                                <div style="font-size:11px; color:#1e40af; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Saldo Esperado em Gaveta</div>
                                <div style="font-size:18px; font-weight:800; color:#1d4ed8; margin-top:2px;">R$ ${saldoEsperadoGaveta.toFixed(2)}</div>
                                <small style="font-size:10px; color:#3b82f6;">(Saldo Inicial + Vendas em Dinheiro - Despesas)</small>
                            </div>

                            <div style="margin-bottom: 5px;">
                                <label style="display:block; font-size: 13px; font-weight:600; margin-bottom:6px; color:#374151;">Saldo Final em Dinheiro Real:</label>
                                <input type="number" id="pdvSaldoFinal" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:15px; font-weight:600; box-sizing:border-box;" value="${saldoEsperadoGaveta.toFixed(2)}" step="0.01" min="0">
                                <small style="font-size:11px; color:#6b7280; display:block; margin-top:4px;">Conte o dinheiro físico real do caixa e insira acima.</small>
                            </div>
                        </div>
                    `;

                    btnConfirm.style.display = 'block';
                    btnConfirm.textContent = isPendente ? 'Confirmar Fechamento do Caixa Anterior' : 'Confirmar Fechamento';
                    btnConfirm.onclick = async () => {
                        const valFinal = parseFloat(document.getElementById('pdvSaldoFinal').value || 0);
                        if (isNaN(valFinal) || valFinal < 0) {
                            mostrarNotificacao('Informe um valor final válido!', 'error');
                            return;
                        }

                        const msgConfirm = isPendente
                            ? 'Deseja confirmar o fechamento do caixa anterior? Após fechar, você poderá abrir o caixa de hoje para iniciar as vendas.'
                            : 'Deseja realmente fechar o caixa? Esta ação impedirá novas vendas hoje.';

                        if (!confirm(msgConfirm)) {
                            return;
                        }

                        btnConfirm.disabled = true;
                        btnConfirm.textContent = 'Fechando...';
                        try {
                            const dataFechamento = new Date().toISOString();
                            const { data, error } = await supabaseClient
                                .from('caixas')
                                .update({
                                    data_fechamento: dataFechamento,
                                    saldo_final: valFinal,
                                    usuario_fechamento_id: usuario.id,
                                    status: 'fechado'
                                })
                                .eq('id', caixaAtivo.id)
                                .select();
                            
                            if (error) throw error;
                            
                            const dataAberturaLocal = caixaAtivo.data_abertura;
                            
                            mostrarNotificacao(isPendente 
                                ? '🔒 Caixa anterior fechado com sucesso! Agora realize a abertura do caixa de hoje.' 
                                : '🔒 Caixa fechado com sucesso!', 'success');
                            fecharModalCaixaPDV();
                            await atualizarBotoesEStatusCaixa();

                            // Perguntar sobre impressão
                            if (confirm('Deseja imprimir o Relatório de Fechamento de Caixa?')) {
                                const nomeOperador = usuario.nome || 'Operador';
                                const dadosVendas = {
                                    totalVendas,
                                    dinheiroVendas,
                                    cartaoVendas,
                                    pixVendas,
                                    prazoVendas,
                                    totalDespesas
                                };
                                const caixaParaImpressao = {
                                    data_abertura: dataAberturaLocal,
                                    data_fechamento: dataFechamento,
                                    saldo_inicial: saldoInicial,
                                    saldo_final: valFinal
                                };
                                imprimirRelatorioFechamentoRapido(caixaParaImpressao, dadosVendas, nomeOperador);
                            }
                        } catch (e) {
                            console.error(e);
                            mostrarNotificacao('Erro ao fechar caixa: ' + e.message, 'error');
                        } finally {
                            btnConfirm.disabled = false;
                            btnConfirm.textContent = isPendente ? 'Confirmar Fechamento do Caixa Anterior' : 'Confirmar Fechamento';
                        }
                    };
                }
            }

            function imprimirRelatorioFechamentoRapido(caixa, dadosVendas, nomeOperador) {
                const win = window.open('', '_blank');
                if (!win) {
                    mostrarNotificacao('Pop-up bloqueado! Permita pop-ups para imprimir o cupom.', 'warning');
                    return;
                }

                const dataHoraAbertura = new Date(caixa.data_abertura).toLocaleString('pt-BR');
                const dataHoraFechamento = new Date(caixa.data_fechamento).toLocaleString('pt-BR');
                const saldoInicial = formatarMoeda(caixa.saldo_inicial);
                const saldoFinal = formatarMoeda(caixa.saldo_final);
                const totalVendas = formatarMoeda(dadosVendas.totalVendas);
                const dinheiroVendas = formatarMoeda(dadosVendas.dinheiroVendas);
                const cartaoVendas = formatarMoeda(dadosVendas.cartaoVendas);
                const pixVendas = formatarMoeda(dadosVendas.pixVendas);
                const prazoVendas = formatarMoeda(dadosVendas.prazoVendas);
                const totalDespesas = formatarMoeda(dadosVendas.totalDespesas);
                const totalGeral = formatarMoeda(caixa.saldo_inicial + dadosVendas.totalVendas - dadosVendas.totalDespesas);

                win.document.write(`
                    <html>
                    <head>
                        <title>Relatório de Fechamento de Caixa</title>
                        <style>
                            body { font-family: monospace; font-size: 12px; margin: 10px; color: #000; line-height: 1.4; }
                            .text-center { text-align: center; }
                            .bold { font-weight: bold; }
                            .hr { border-bottom: 1px dashed #000; margin: 8px 0; }
                            .flex-row { display: flex; justify-content: space-between; }
                            .kpi-row { display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; }
                            @media print {
                                .no-print { display: none; }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="no-print" style="margin-bottom: 15px; text-align: center;">
                            <button onclick="window.print()" style="padding: 6px 12px; font-weight: bold; cursor: pointer;">Imprimir Relatório</button>
                            <button onclick="window.close()" style="padding: 6px 12px; cursor: pointer; margin-left: 5px;">Fechar</button>
                        </div>
                        <div class="text-center bold" style="font-size: 14px;">FECHAMENTO DE CAIXA</div>
                        <div class="text-center">${usuario.loja_nome || 'Aion ERP'}</div>
                        <div class="hr"></div>
                        <div class="flex-row"><span>Operador:</span><span class="bold">${nomeOperador}</span></div>
                        <div class="flex-row"><span>Abertura:</span><span>${dataHoraAbertura}</span></div>
                        <div class="flex-row"><span>Fechamento:</span><span>${dataHoraFechamento}</span></div>
                        <div class="hr"></div>
                        <div class="bold">RESUMO FINANCEIRO DE VENDAS</div>
                        <div class="flex-row"><span>Dinheiro:</span><span>${dinheiroVendas}</span></div>
                        <div class="flex-row"><span>Cartão:</span><span>${cartaoVendas}</span></div>
                        <div class="flex-row"><span>PIX:</span><span>${pixVendas}</span></div>
                        <div class="flex-row"><span>Prazo/Convênio:</span><span>${prazoVendas}</span></div>
                        <div class="flex-row bold"><span>Total Vendas:</span><span>${totalVendas}</span></div>
                        <div class="hr"></div>
                        <div class="bold">SALDO DO CAIXA</div>
                        <div class="kpi-row"><span>Saldo Inicial (+)</span><span>${saldoInicial}</span></div>
                        <div class="kpi-row"><span>Total Vendas (+)</span><span>${totalVendas}</span></div>
                        <div class="kpi-row" style="color: red;"><span>Despesas (-)</span><span>${totalDespesas}</span></div>
                        <div class="hr"></div>
                        <div class="kpi-row bold" style="font-size: 14px;"><span>Saldo Final Geral:</span><span>${totalGeral}</span></div>
                        <div class="kpi-row bold" style="font-size: 14px; margin-top: 10px;"><span>Declarado Gaveta:</span><span>${saldoFinal}</span></div>
                        <div class="hr"></div>
                        <div class="text-center" style="margin-top: 20px;">Assinatura do Operador</div>
                        <div style="border-bottom: 1px solid #000; width: 80%; margin: 40px auto 0;"></div>
                        <script>
                            window.onload = function() {
                                window.print();
                            }
                        </script>
                    </body>
                    </html>
                `);
                win.document.close();
            }

            // Registrar listeners
            const btnCaixa = document.getElementById('btnCaixaPDV');
            if (btnCaixa) {
                btnCaixa.addEventListener('click', abrirModalCaixaPDVDinamico);
            }

            // Executar primeira checagem de caixa
            await atualizarBotoesEStatusCaixa();

            // === VERIFICAR CHECKOUT RESTAURANTE (MESA/COMANDA/SERVICO) ===
            const checkoutRestauranteStr = sessionStorage.getItem('checkout_restaurante');
            if (checkoutRestauranteStr) {
                try {
                    const checkout = JSON.parse(checkoutRestauranteStr);
                    const valorMesa = parseFloat(checkout.valor || 0);
                    mostrarNotificacao(`Carregando consumo da ${checkout.numero}: R$ ${valorMesa.toFixed(2)}`, 'info');
                    
                    const obsField = document.getElementById('observacao');
                    if (obsField) {
                        obsField.value = `Fechamento de ${checkout.numero}`;
                    }

                    // Se existirem itens detalhados na comanda, carrega cada um deles
                    if (checkout.itens && checkout.itens.length > 0) {
                        carrinho = checkout.itens.map(item => {
                            return {
                                id: item.id,
                                nome: item.nome,
                                codigo: item.codigo,
                                categoria: 'Restaurante',
                                valor_venda: item.valor_venda,
                                quantidade: item.quantidade,
                                subtotal: item.valor_venda * item.quantidade,
                                serial: null,
                                imei: null
                            };
                        });

                        // Verificar se há lançamentos manuais adicionais (valor acumulado > soma dos produtos)
                        const somaItens = checkout.itens.reduce((s, i) => s + ((i.valor_venda || 0) * (i.quantidade || 1)), 0);
                        const diferenca = checkout.valor - somaItens;
                        if (diferenca > 0.01) {
                            let dummyProduct = produtos.find(p => p.codigo === 'REST-MESA');
                            if (!dummyProduct) {
                                dummyProduct = { id: 999999, codigo: 'REST-MESA' };
                            }
                            carrinho.push({
                                id: dummyProduct.id,
                                nome: `Lançamentos Adicionais ${checkout.numero}`,
                                codigo: 'REST-MESA',
                                categoria: 'Restaurante',
                                valor_venda: diferenca,
                                quantidade: 1,
                                subtotal: diferenca,
                                serial: null,
                                imei: null
                            });
                        }
                    } else {
                        // Caso contrário (lançamento manual de valor adicional), procuramos ou criamos o produto dummy
                        let dummyProduct = produtos.find(p => p.codigo === 'REST-MESA');
                        if (!dummyProduct) {
                            const { data, error } = await supabaseClient.from('produtos').insert([{
                                nome: 'Consumo Comanda/Serviço',
                                codigo: 'REST-MESA',
                                categoria: 'Outros',
                                valor_venda: 0,
                                estoque_total: 99999,
                                ativo: true
                            }]).select();
                            if (!error && data && data.length > 0) {
                                dummyProduct = data[0];
                                produtos.push(dummyProduct);
                            }
                        }
                        
                        carrinho = [{
                            id: dummyProduct ? dummyProduct.id : 999999,
                            nome: `Consumo ${checkout.numero}`,
                            codigo: 'REST-MESA',
                            categoria: 'Restaurante',
                            valor_venda: checkout.valor,
                            quantidade: 1,
                            subtotal: checkout.valor,
                            serial: null,
                            imei: null
                        }];
                    }
                    renderizarCarrinho();
                    calcularTotais();
                } catch (e) {
                    console.error('Erro ao processar checkout_restaurante:', e);
                }
            }

            // === VERIFICAR CHECKOUT AGENDAMENTO ===
            const checkoutAgendamentoStr = sessionStorage.getItem('checkout_agendamento');
            if (checkoutAgendamentoStr) {
                try {
                    const checkout = JSON.parse(checkoutAgendamentoStr);
                    const valorAgend = parseFloat(checkout.valor || 0);
                    mostrarNotificacao(`Carregando agendamento: ${checkout.servico_nome} - R$ ${valorAgend.toFixed(2)}`, 'info');
                    
                    const obsField = document.getElementById('observacao');
                    if (obsField) {
                        obsField.value = `Fechamento do Agendamento #${checkout.agendamento_id}`;
                    }

                    // Preencher cliente se vier no agendamento
                    if (checkout.cliente_id) {
                        const cliente = clientes.find(c => c.id === checkout.cliente_id);
                        if (cliente) {
                            document.getElementById('clienteId').value = cliente.id;
                            document.getElementById('searchCliente').value = cliente.nome;
                            document.getElementById('clienteSelecionado').innerHTML = `
                                <div class="selected-customer-card" style="margin-top: 10px; padding: 12px; background: var(--light); border-radius: 8px; border-left: 4px solid var(--primary);">
                                    👤 <strong>${cliente.nome}</strong><br>
                                    📞 ${cliente.telefone || 'Sem telefone'}
                                </div>
                            `;
                        }
                    }

                    // Carrega o serviço no carrinho
                    carrinho = [{
                        id: checkout.servico_id,
                        nome: checkout.servico_nome,
                        codigo: checkout.codigo,
                        categoria: 'Serviço',
                        valor_venda: checkout.valor,
                        quantidade: 1,
                        subtotal: checkout.valor,
                        serial: null,
                        imei: null
                    }];
                    
                    renderizarCarrinho();
                    calcularTotais();
                } catch (e) {
                    console.error('Erro ao processar checkout_agendamento:', e);
                }
            }

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            mostrarNotificacao('Erro ao carregar dados: ' + error.message, 'error');
        }
    }

    // =====================================================
    // RENDERIZAR PRODUTOS
    // =====================================================

    function renderizarSugestoesProdutos(lista) {
        const container = document.getElementById('produtoSuggestions');
        if (!container) return;

        if (!lista || lista.length === 0) {
            container.innerHTML = '<div class="produto-suggestion-item" style="color:var(--gray);">Nenhum produto encontrado</div>';
            container.style.display = 'block';
            return;
        }

        container.innerHTML = lista.map(p => {
            const isServico = p.tipo === 'servico';
            const permitirVendaSemSaldo = configLoja.permitir_venda_sem_saldo === true;
            const estoque = p.estoque_total ?? p.estoque ?? 0;
            const semEstoque = estoque <= 0;
            const bloqueado = !isServico && !permitirVendaSemSaldo && semEstoque;
            
            let estoqueBadge = '';
            if (isServico) {
                estoqueBadge = '<span class="estoque-badge estoque-ok" style="font-size:9px;">Serviço</span>';
            } else if (semEstoque) {
                estoqueBadge = '<span class="estoque-badge estoque-zero" style="font-size:9px;">Sem estoque</span>';
            } else if (estoque <= 5) {
                estoqueBadge = `<span class="estoque-badge estoque-baixo" style="font-size:9px;">${estoque} un</span>`;
            } else {
                estoqueBadge = `<span class="estoque-badge estoque-ok" style="font-size:9px;">${estoque} un</span>`;
            }

            const serialBadge = p._serialMatch
                ? `<br><small style="color:#2563eb;font-weight:600;">🔢 Serial/IMEI: ${p._serialMatch}</small>`
                : '';

            const vinculo = produtosPromocaoVigentes.find(v => v.produto_id === p.id);
            const promo = vinculo ? promocoesVigentes.find(pr => pr.id === vinculo.promocao_id) : null;
            const promoBadge = promo ? `<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800;border:1px solid #FDE68A;margin-left:5px;">🏷️ ${promo.nome}</span>` : '';

            return `
                <div class="produto-suggestion-item ${bloqueado ? 'sem-estoque' : ''}"
                     ${bloqueado ? '' : `onclick="selecionarSugestaoProduto(${p.id})"`}>
                    <div>
                        <strong>${p.nome}</strong> ${promoBadge}<br>
                        <small>Cód: ${p.codigo || p.id} | ${p.categoria || 'Sem Categoria'} ${estoqueBadge}</small>
                        ${serialBadge}
                    </div>
                    <div style="font-weight: 700; color: var(--primary); font-size:13px;">${formatarMoeda(p.valor_venda)}</div>
                </div>`;
        }).join('');
        container.style.display = 'block';
    }

    window.selecionarSugestaoProduto = async (produtoId) => {
        document.getElementById('searchProdutoVenda').value = '';
        document.getElementById('produtoSuggestions').style.display = 'none';
        await selecionarProduto(produtoId);
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-produto-wrapper')) {
            const suggestions = document.getElementById('produtoSuggestions');
            if (suggestions) suggestions.style.display = 'none';
        }
    });

    document.getElementById('searchProdutoVenda')?.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const termo = e.target.value.trim();
            if (!termo) return;
            
            const termoLower = termo.toLowerCase();
            const exactMatch = produtos.find(p => 
                p.codigo?.toLowerCase() === termoLower || 
                p.id.toString() === termo ||
                (Array.isArray(p.codigos_barras) && p.codigos_barras.some(b => b.toLowerCase() === termoLower))
            );
            
            if (exactMatch) {
                await selecionarProduto(exactMatch.id);
                e.target.value = '';
                document.getElementById('produtoSuggestions').style.display = 'none';
                return;
            }
            
            try {
                const { data: serials } = await supabaseClient
                    .from('produtos_seriais')
                    .select('produto_id')
                    .or(`numero_serie.eq.${termo},imei.eq.${termo}`)
                    .eq('status', 'disponivel')
                    .limit(1);
                
                if (seriais && seriais.length > 0) {
                    await selecionarProduto(seriais[0].produto_id);
                    e.target.value = '';
                    document.getElementById('produtoSuggestions').style.display = 'none';
                } else {
                    mostrarNotificacao('Produto ou Serial não encontrado!', 'warning');
                }
            } catch (err) {
                console.error(err);
            }
        }
    });

    // =====================================================
    // BUSCA COM SUPORTE A IMEI / SERIAL
    // ✅ NOVO: pesquisa na tabela produtos_seriais em paralelo
    // =====================================================

    document.getElementById('searchProdutoVenda')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const termo = e.target.value.trim();
        searchTimer = setTimeout(() => filtrarProdutos(termo), 280);
    });

    document.getElementById('searchProdutoVenda')?.addEventListener('focus', (e) => {
        const termo = e.target.value.trim();
        filtrarProdutos(termo);
    });

    document.getElementById('searchProdutoVenda')?.addEventListener('click', (e) => {
        const termo = e.target.value.trim();
        filtrarProdutos(termo);
    });

    async function filtrarProdutos(termo) {
        if (!termo) {
            renderizarSugestoesProdutos(produtos);
            return;
        }

        const termoLower = termo.toLowerCase();

        // 1. Filtro local: nome, código e códigos de barras múltiplos
        const porNomeCodigo = produtos.filter(p =>
            p.nome?.toLowerCase().includes(termoLower) ||
            (p.codigo || '').toLowerCase().includes(termoLower) ||
            (Array.isArray(p.codigos_barras) && p.codigos_barras.some(b => b.toLowerCase().includes(termoLower)))
        );

        // 2. Busca assíncrona por IMEI / Serial no banco
        let porSerial = [];
        try {
            const { data: seriais } = await supabaseClient
                .from('produtos_seriais')
                .select('produto_id, numero_serie, imei')
                .or(`numero_serie.ilike.%${termo}%,imei.ilike.%${termo}%`)
                .eq('status', 'disponivel')
                .limit(20);

            if (seriais && seriais.length > 0) {
                const idsSerial = [...new Set(seriais.map(s => s.produto_id))];
                porSerial = produtos
                    .filter(p => idsSerial.includes(p.id))
                    .map(p => {
                        const match = seriais.find(s => s.produto_id === p.id);
                        return { ...p, _serialMatch: match?.numero_serie || match?.imei };
                    });
            }
        } catch (e) {
            // Tabela pode não existir — silencioso
        }

        // 3. Mesclar sem duplicatas
        const idsLocais = new Set(porNomeCodigo.map(p => p.id));
        const extras = porSerial.filter(p => !idsLocais.has(p.id));
        renderizarSugestoesProdutos([...porNomeCodigo, ...extras]);
    }

    // =====================================================
    // RENDERIZAR VENDAS
    // =====================================================

    function renderizarVendas(vendas, novoIdDestaque = null) {
        const tbody = document.getElementById('vendasTableBody');
        const badgeTotal = document.getElementById('badgeVendasRecentes');
        
        if (badgeTotal) {
            const count = (vendas && vendas.length) || 0;
            badgeTotal.textContent = `${count} ${count === 1 ? 'venda' : 'vendas'}`;
        }

        if (!tbody) return;

        if (!vendas || vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:25px;color:var(--gray);">Nenhuma venda recente registrada</td></tr>';
            return;
        }

        const podeCancelar = verificarPermissaoModulo('saidas', 'cancelar');

        tbody.innerHTML = vendas.map(v => {
            const cancelado = v.cancelado || false;
            const isDevolucao = Number(v.total) < 0;
            const jaDevolvido = v.observacao && v.observacao.includes('[Devolvido');
            const podeCanc  = podeCancelar && !cancelado && !isDevolucao && !jaDevolvido && podeCancelarVenda(v.data_finalizacao);

            let statusHtml = '<span class="status-estoque status-normal">✅ Ativa</span>';
            if (cancelado) {
                statusHtml = '<span class="status-estoque status-critico">❌ Cancelada</span>';
            } else if (isDevolucao) {
                statusHtml = '<span class="status-estoque" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">🔄 Devolução</span>';
            } else if (jaDevolvido) {
                statusHtml = '<span class="status-estoque status-normal">✅ Ativa</span> <span class="status-estoque" style="background:#fee2e2; color:#991b1b; font-size:10px; margin-left:2px;">🔄 Devolvida</span>';
            }

            let nomeCli = v.cliente_nome || v.clientes?.nome;
            if (!nomeCli && v.observacao && v.observacao.includes('Cliente:')) {
                const match = v.observacao.match(/Cliente:\s*([^|(\n]+)/);
                if (match) nomeCli = match[1].trim();
            }
            nomeCli = nomeCli || '<span style="color:#9ca3af">Consumidor Final</span>';

            const isRecente = novoIdDestaque && Number(v.id) === Number(novoIdDestaque);
            const rowClass = isRecente ? 'class="row-nova-venda"' : '';
            const idCol = isRecente
                ? `<strong>#${v.id}</strong> <span style="background:#10b981; color:#fff; font-size:10px; padding:2px 6px; border-radius:10px; margin-left:4px; font-weight:700;">🆕 Nova</span>`
                : `<strong>#${v.id}</strong>`;

            const totalFormatado = isDevolucao
                ? `<strong style="color:#dc2626;">- ${formatarMoeda(Math.abs(v.total))}</strong>`
                : `<strong style="color:var(--primary)">${formatarMoeda(v.total)}</strong>`;

            return `
                <tr ${rowClass}>
                    <td>${idCol}</td>
                    <td>${formatarData(v.data)}</td>
                    <td>${nomeCli}</td>
                    <td>${totalFormatado}</td>
                    <td>${v.forma_pagamento || '—'}</td>
                    <td>${statusHtml}</td>
                    <td class="table-actions" style="white-space:nowrap;">
                        <button class="btn-info" onclick="verComprovante(${v.id})" title="${isDevolucao ? 'Ver Comprovante de Devolução' : 'Ver Comprovante'}">📄</button>
                        ${podeCanc ? `<button class="btn-danger" onclick="cancelarVenda(${v.id})" style="margin-left:4px;" title="Cancelar Venda">❌ Cancelar</button>` : ''}
                        ${cancelado && v.cancelado_em ? `<small style="color:#999;font-size:10px;display:block;margin-top:3px;">Cancelado: ${new Date(v.cancelado_em).toLocaleString('pt-BR')}</small>` : ''}
                    </td>
                </tr>`;
        }).join('');
    }

    // =====================================================
    // IDENTIFICAÇÃO E BUSCA DE CLIENTES (OPCIONAL)
    // =====================================================

    const searchClienteEl = document.getElementById('searchCliente');
    const clienteCpfEl = document.getElementById('clienteVendaCpf');
    const btnLimparClienteEl = document.getElementById('btnLimparClienteRapido');
    const clienteSuggestionsEl = document.getElementById('clienteSuggestions');

    function atualizarVisibilidadeBotaoLimparCliente() {
        const temValor = (searchClienteEl?.value.trim().length > 0) || (clienteCpfEl?.value.trim().length > 0) || (document.getElementById('clienteId')?.value);
        if (btnLimparClienteEl) {
            btnLimparClienteEl.style.display = temValor ? 'flex' : 'none';
        }
    }

    searchClienteEl?.addEventListener('input', (e) => {
        atualizarVisibilidadeBotaoLimparCliente();
        const termo = e.target.value.toLowerCase();
        if (termo.length < 2) { clienteSuggestionsEl.style.display = 'none'; return; }

        const filtrados = clientes.filter(c =>
            c.nome?.toLowerCase().includes(termo) ||
            c.cpf_cnpj?.includes(termo) ||
            c.telefone?.includes(termo) ||
            (c.codigo && c.codigo.toString().includes(termo))
        );

        if (filtrados.length === 0) {
            clienteSuggestionsEl.innerHTML = '<div class="cliente-suggestion-item" style="color:#6b7280;font-size:12px;">Nenhum cliente cadastrado com esse nome (seguirá como venda rápida)</div>';
        } else {
            clienteSuggestionsEl.innerHTML = filtrados.slice(0, 8).map(c => `
                <div class="cliente-suggestion-item"
                     onclick="selecionarCliente(${c.id}, '${(c.nome||'').replace(/'/g,"\\'")}', '${c.cpf_cnpj||''}')">
                    <strong>${c.nome}</strong><br>
                    <small>${c.cpf_cnpj || 'Sem documento'} | ${c.telefone || 'Sem telefone'}</small>
                </div>`).join('');
        }
        clienteSuggestionsEl.style.display = 'block';
    });

    clienteCpfEl?.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length <= 11) {
            v = v.replace(/(\d{3})(\d)/, '$1.$2');
            v = v.replace(/(\d{3})(\d)/, '$1.$2');
            v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        } else {
            v = v.slice(0, 14);
            v = v.replace(/^(\d{2})(\d)/, '$1.$2');
            v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
            v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
            v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
        }
        e.target.value = v;
        atualizarVisibilidadeBotaoLimparCliente();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-cliente')) {
            clienteSuggestionsEl.style.display = 'none';
        }
    });

    window.selecionarCliente = (id, nome, documento) => {
        document.getElementById('clienteId').value = id || '';
        if (searchClienteEl) searchClienteEl.value = nome || '';
        if (clienteCpfEl && documento) clienteCpfEl.value = documento;
        atualizarVisibilidadeBotaoLimparCliente();
        document.getElementById('clienteSelecionado').innerHTML =
            `✅ Cliente Vinculado: <strong>${nome}</strong>${documento ? ` (${documento})` : ''} <a href="javascript:void(0)" onclick="limparClienteRapido()" style="color:#dc2626;margin-left:8px;text-decoration:none;font-weight:bold;">✕ Limpar</a>`;
        clienteSuggestionsEl.style.display = 'none';
    };

    window.limparClienteRapido = () => {
        const idEl = document.getElementById('clienteId');
        if (idEl) idEl.value = '';
        if (searchClienteEl) searchClienteEl.value = '';
        if (clienteCpfEl) clienteCpfEl.value = '';
        const selEl = document.getElementById('clienteSelecionado');
        if (selEl) selEl.innerHTML = '';
        if (btnLimparClienteEl) btnLimparClienteEl.style.display = 'none';
    };

    btnLimparClienteEl?.addEventListener('click', window.limparClienteRapido);

    // =====================================================
    // FORMAS DE PAGAMENTO
    // ✅ FIX: listener definido UMA VEZ fora do carregarDados
    // =====================================================

    document.querySelectorAll('.btn-pagamento').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-pagamento').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            formaPagamentoSelecionada = btn.getAttribute('data-pagamento');
        });
    });

    // =====================================================
    // SELEÇÃO DE PRODUTO / SERIAL
    // =====================================================

    window.selecionarProduto = async (produtoId) => {
        if (!verificarPermissaoModulo('saidas', 'criar')) {
            mostrarNotificacao('Você não tem permissão para adicionar produtos!', 'error');
            return;
        }

        const produto = produtos.find(p => p.id === produtoId);
        if (!produto) { mostrarNotificacao('Produto não encontrado!', 'error'); return; }

        const isServico = produto.tipo === 'servico';
        const permitirVendaSemSaldo = configLoja.permitir_venda_sem_saldo === true;
        const estoque = produto.estoque_total ?? produto.estoque ?? 0;
        if (!isServico && !permitirVendaSemSaldo && estoque <= 0) { mostrarNotificacao('Produto sem estoque disponível!', 'error'); return; }

        let exigeControleSerial = false;
        try {
            const { data: categoria } = await supabaseClient
                .from('categorias')
                .select('exige_imei, exige_serial')
                .eq('nome', produto.categoria)
                .maybeSingle();
            exigeControleSerial = categoria?.exige_imei === true || categoria?.exige_serial === true || produto.categoria === 'Celular';
        } catch {
            exigeControleSerial = produto.categoria === 'Celular';
        }

        if (exigeControleSerial) {
            const { data: seriais, error } = await supabaseClient
                .from('produtos_seriais')
                .select('*')
                .eq('produto_id', produtoId)
                .eq('status', 'disponivel');

            if (error) { mostrarNotificacao('Erro ao verificar Números de Série / IMEIs!', 'error'); return; }

            produtoSerialPendente = produto;
            seriaisDisponiveis    = seriais || [];

            document.getElementById('serialProdutoNome').value = produto.nome;
            document.getElementById('numeroSerie').value = '';

            const container = document.getElementById('seriaisDisponiveis');
            if (seriaisDisponiveis.length === 0) {
                container.innerHTML = '<p style="color:#dc2626;font-size:13px;">⚠️ Nenhum Número de Série / IMEI disponível em estoque!</p>';
            } else {
                container.innerHTML = `
                    <strong>📱 Seriais / IMEIs disponíveis (${seriaisDisponiveis.length} un.):</strong>
                    <ul style="margin-top:10px;max-height:160px;overflow-y:auto;padding:0;list-style:none;">
                        ${seriaisDisponiveis.map(s => {
                            const identificador = s.numero_serie || s.imei || `ID #${s.id}`;
                            const partes = [];
                            if (s.numero_serie) partes.push(`Serial: <strong>${s.numero_serie}</strong>`);
                            if (s.imei) partes.push(`IMEI: <strong>${s.imei}</strong>`);
                            const textoExibicao = partes.length > 0 ? partes.join(' | ') : `<code>${identificador}</code>`;

                            return `
                            <li onclick="selecionarSerialPorId(${s.id})"
                                style="padding:8px 10px;border-bottom:1px solid #eee;cursor:pointer;
                                       display:flex;justify-content:space-between;align-items:center;border-radius:6px;margin-bottom:4px;background:#f9fafb;"
                                onmouseover="this.style.background='#eff6ff'"
                                onmouseout="this.style.background='#f9fafb'">
                                <div style="font-size:13px;color:#1f2937;">
                                    ${textoExibicao}
                                </div>
                                <button type="button" style="background:#2563eb;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">
                                    Selecionar
                                </button>
                            </li>`;
                        }).join('')}
                    </ul>
                    <small style="color:var(--gray);margin-top:8px;display:block;">
                        📝 Digite ou clique no item acima para selecionar
                    </small>`;
            }

            document.getElementById('modalSerial').style.display = 'flex';
            document.getElementById('numeroSerie').focus();
        } else {
            processarAdicaoProduto(produto, null);
        }
    };

    function processarAdicaoProduto(produto, serial) {
        const lotes = obterLotesProdutoSaidas(produto);
        if (lotes.length > 0) {
            const permitirVendaSemSaldo = configLoja.permitir_venda_sem_saldo === true;
            const isServico = produto.tipo === 'servico';

            // Calcular saldo disponível de cada lote considerando o que já está no carrinho
            const lotesComSaldo = lotes.map(l => {
                const noCarrinho = carrinho
                    .filter(item => item.id === produto.id && item.lote === l.lote)
                    .reduce((sum, item) => sum + item.quantidade, 0);
                const saldoRestante = Math.max(0, (parseInt(l.quantidade) || 0) - noCarrinho);
                return { ...l, saldoDisponivel: saldoRestante };
            }).filter(l => l.saldoDisponivel > 0);

            if (lotesComSaldo.length > 1) {
                abrirModalSelecaoLote(produto, serial, lotesComSaldo);
                return;
            } else if (lotesComSaldo.length === 1) {
                adicionarAoCarrinho(produto, serial, lotesComSaldo[0]);
                return;
            } else {
                if (permitirVendaSemSaldo || isServico) {
                    adicionarAoCarrinho(produto, serial, lotes[0] || null);
                    return;
                } else {
                    mostrarNotificacao('Todos os lotes deste produto estão com saldo esgotado!', 'error');
                    return;
                }
            }
        } else {
            adicionarAoCarrinho(produto, serial, null);
        }
    }

    function abrirModalSelecaoLote(produto, serial, lotesComSaldo) {
        produtoLotePendente = { produto, serial, lotes: lotesComSaldo };
        const nomeEl = document.getElementById('loteProdutoNome');
        if (nomeEl) nomeEl.value = produto.nome;

        const lotesOrdenados = [...lotesComSaldo].sort((a, b) => {
            if (!a.data_validade) return 1;
            if (!b.data_validade) return -1;
            return new Date(a.data_validade) - new Date(b.data_validade);
        });

        const container = document.getElementById('listaLotesDisponiveisVenda');
        if (container) {
            container.innerHTML = lotesOrdenados.map((l, idx) => {
                const st = calcularStatusValidadeSaidas(l.data_validade, l.alerta_vencimento_dias);
                const isPrimeiroFEFO = idx === 0;
                const badgeFEFO = isPrimeiroFEFO 
                    ? `<span style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:800; margin-left:4px;">✨ 1º A VENCER (FEFO)</span>` 
                    : '';
                const loteEscaped = String(l.lote).replace(/'/g, "\\'").replace(/"/g, '&quot;');

                return `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div>
                            <div style="font-size:13px; font-weight:700; color:#1e293b; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                                <span>📦 Lote: <strong>${l.lote || '-'}</strong></span>
                                <span style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:1px 6px; border-radius:4px; font-size:11px; font-weight:700;">Saldo: ${l.saldoDisponivel} un</span>
                                ${badgeFEFO}
                            </div>
                            <div style="font-size:12px; color:#64748b; margin-top:4px;">
                                Validade: <strong>${st.dataFormatada}</strong> ${st.badge}
                            </div>
                        </div>
                        <button type="button" class="btn-primary" onclick="window.selecionarLotePorCodigo('${loteEscaped}')" style="padding:6px 14px; font-size:12px; border-radius:6px; cursor:pointer; font-weight:600; white-space:nowrap;">
                            Selecionar Lote
                        </button>
                    </div>
                `;
            }).join('');
        }

        const modalLote = document.getElementById('modalLote');
        if (modalLote) modalLote.style.display = 'flex';
    }

    window.selecionarLotePorCodigo = (loteCodigo) => {
        if (!produtoLotePendente) return;
        const { produto, serial, lotes } = produtoLotePendente;
        const loteEscolhido = lotes.find(l => String(l.lote) === String(loteCodigo));
        if (!loteEscolhido) {
            mostrarNotificacao('Lote selecionado não encontrado!', 'error');
            return;
        }
        const modalLote = document.getElementById('modalLote');
        if (modalLote) modalLote.style.display = 'none';
        const prod = produto;
        const s = serial;
        produtoLotePendente = null;
        adicionarAoCarrinho(prod, s, loteEscolhido);
    };

    document.getElementById('btnCancelarLote')?.addEventListener('click', () => {
        const modalLote = document.getElementById('modalLote');
        if (modalLote) modalLote.style.display = 'none';
        produtoLotePendente = null;
    });

    document.querySelectorAll('.close-lote').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalLote = document.getElementById('modalLote');
            if (modalLote) modalLote.style.display = 'none';
            produtoLotePendente = null;
        });
    });

    window.selecionarSerialPorId = (serialId) => {
        const s = seriaisDisponiveis.find(item => item.id === serialId);
        if (s) {
            const val = s.numero_serie || s.imei || String(s.id);
            document.getElementById('numeroSerie').value = val;
            if (produtoSerialPendente) {
                const prod = produtoSerialPendente;
                produtoSerialPendente = null;
                document.getElementById('modalSerial').style.display = 'none';
                processarAdicaoProduto(prod, s);
            }
        }
    };

    window.selecionarSerial = (serial) => {
        const s = seriaisDisponiveis.find(item => 
            item.numero_serie === serial || 
            item.imei === serial || 
            String(item.id) === String(serial)
        );
        if (s) {
            window.selecionarSerialPorId(s.id);
        } else {
            document.getElementById('numeroSerie').value = serial;
            document.getElementById('btnConfirmarSerial').click();
        }
    };

    document.getElementById('btnConfirmarSerial')?.addEventListener('click', async () => {
        const inputVal = document.getElementById('numeroSerie').value.trim();

        if (!inputVal && seriaisDisponiveis.length > 0) {
            mostrarNotificacao('Informe ou selecione o Número de Série / IMEI!', 'error');
            return;
        }

        let serialObj = seriaisDisponiveis.find(s =>
            (s.numero_serie && s.numero_serie.toLowerCase() === inputVal.toLowerCase()) ||
            (s.imei && s.imei.toLowerCase() === inputVal.toLowerCase()) ||
            String(s.id) === inputVal
        );

        if (!serialObj && inputVal) {
            serialObj = {
                id: null,
                numero_serie: inputVal,
                imei: inputVal
            };
        }

        if (produtoSerialPendente) {
            const prod = produtoSerialPendente;
            produtoSerialPendente = null;
            document.getElementById('modalSerial').style.display = 'none';
            processarAdicaoProduto(prod, serialObj || null);
        } else {
            document.getElementById('modalSerial').style.display = 'none';
        }
    });

    document.getElementById('btnCancelarSerial')?.addEventListener('click', () => {
        document.getElementById('modalSerial').style.display = 'none';
        produtoSerialPendente = null;
    });

    document.getElementById('numeroSerie')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnConfirmarSerial').click();
    });

    // =====================================================
    // CARRINHO
    // =====================================================

    function adicionarAoCarrinho(produto, serial, loteEscolhido = null) {
        const valorOriginal = parseFloat(produto.valor_venda) || 0;

        // REGRA DE NEGÓCIO: O preço de venda nunca pode ser zero (mínimo R$ 0,01)
        if (valorOriginal < 0.01) {
            mostrarNotificacao('O preço de venda do produto não pode ser zero. O preço mínimo permitido é R$ 0,01.', 'error');
            return;
        }

        const estoque = produto.estoque_total ?? produto.estoque ?? 0;
        const isServico = produto.tipo === 'servico';
        const permitirVendaSemSaldo = configLoja.permitir_venda_sem_saldo === true;

        // Calcular a quantidade total deste produto já adicionada ao carrinho
        const totalNoCarrinho = carrinho
            .filter(item => item.id === produto.id)
            .reduce((sum, item) => sum + item.quantidade, 0);

        if (!isServico && !permitirVendaSemSaldo && (totalNoCarrinho + 1 > estoque)) {
            mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoque} (Já no carrinho: ${totalNoCarrinho})`, 'error');
            return;
        }

        // Validação de saldo específico do lote selecionado
        if (loteEscolhido && !isServico && !permitirVendaSemSaldo) {
            const totalDesteLoteNoCarrinho = carrinho
                .filter(item => item.id === produto.id && item.lote === loteEscolhido.lote)
                .reduce((sum, item) => sum + item.quantidade, 0);
            const saldoLote = parseInt(loteEscolhido.quantidade) || 0;
            if (totalDesteLoteNoCarrinho + 1 > saldoLote) {
                mostrarNotificacao(`Saldo insuficiente para o lote "${loteEscolhido.lote}"! Disponível: ${saldoLote} (Já no carrinho: ${totalDesteLoteNoCarrinho})`, 'error');
                return;
            }
        }

        if (serial) {
            // Verificar se o serial selecionado já está no carrinho
            const serialNoCarrinho = carrinho.find(item => item.serial_id === serial.id);
            if (serialNoCarrinho) {
                mostrarNotificacao('Este número de série/IMEI já está no carrinho!', 'error');
                return;
            }
        }

        // Verificar se o produto faz parte de alguma Ação Promocional vigente
        let promocaoAplicada = null;
        let descontoUnitario = 0;
        let origemDesconto = null;
        let promocaoId = null;

        const vinculoPromo = produtosPromocaoVigentes.find(v => v.produto_id === produto.id);
        if (vinculoPromo) {
            const promo = promocoesVigentes.find(p => p.id === vinculoPromo.promocao_id);
            if (promo && promo.ativo !== false) {
                promocaoAplicada = promo;
                promocaoId = promo.id;
                origemDesconto = promo.nome; // Ex: "Ação Verão"
                if (window.PromocoesAPI) {
                    const calc = window.PromocoesAPI.calcularDescontoItem(valorOriginal, vinculoPromo.tipo_desconto, vinculoPromo.valor_desconto);
                    descontoUnitario = calc.descontoUnitario || 0;
                }
            }
        }

        const itemExistente = carrinho.find(item =>
            item.id === produto.id &&
            ((!item.lote && !loteEscolhido) || (item.lote && loteEscolhido && item.lote === loteEscolhido.lote)) &&
            (!serial || item.serial === serial?.numero_serie)
        );

        if (itemExistente) {
            if (serial) {
                mostrarNotificacao('Este número de série/IMEI já está no carrinho!', 'error');
                return;
            }
            if (loteEscolhido && !isServico && !permitirVendaSemSaldo) {
                const saldoLote = parseInt(loteEscolhido.quantidade) || 0;
                if (itemExistente.quantidade + 1 > saldoLote) {
                    mostrarNotificacao(`Saldo insuficiente para o lote "${loteEscolhido.lote}"! Limite: ${saldoLote}`, 'error');
                    return;
                }
            }
            itemExistente.quantidade++;

            // Recalcular desconto proporcional da promoção se presente
            if (itemExistente.desconto_unitario && itemExistente.desconto_unitario > 0) {
                itemExistente.desconto = Math.round(itemExistente.desconto_unitario * itemExistente.quantidade * 100) / 100;
            }

            // Trava de segurança: garantir preço mínimo de R$ 0,01 por unidade
            const maxDesconto = Math.max(0, (itemExistente.quantidade * itemExistente.valor_venda) - (itemExistente.quantidade * 0.01));
            if ((itemExistente.desconto || 0) > maxDesconto) {
                itemExistente.desconto = maxDesconto;
            }

            itemExistente.subtotal = (itemExistente.quantidade * itemExistente.valor_venda) - (itemExistente.desconto || 0) + (itemExistente.acrescimo || 0);
        } else {
            const qtdInicial = 1;
            const descInicial = Math.round(descontoUnitario * qtdInicial * 100) / 100;
            const subtotalInicial = (qtdInicial * valorOriginal) - descInicial;

            carrinho.push({
                id:          produto.id,
                nome:        produto.nome,
                codigo:      produto.codigo,
                categoria:   produto.categoria,
                tipo:        produto.tipo || 'produto',
                lote:        loteEscolhido?.lote || null,
                data_validade: loteEscolhido?.data_validade || null,
                comissao_habilitada: produto.comissao_habilitada || false,
                comissao_100_porcento: produto.comissao_100_porcento || false,
                comissao_valor: produto.comissao_valor || 0,
                valor_venda: valorOriginal,
                quantidade:  qtdInicial,
                desconto:    descInicial,
                desconto_unitario: descontoUnitario,
                origem_desconto: origemDesconto,
                promocao_id: promocaoId,
                acrescimo:   0,
                subtotal:    subtotalInicial,
                serial:      serial?.numero_serie || null,
                imei:        serial?.imei || null,
                serial_id:   serial?.id || null
            });
        }

        renderizarCarrinho();
        calcularTotais();

        const infoLoteMsg = loteEscolhido ? ` (Lote: ${loteEscolhido.lote})` : '';
        if (origemDesconto && descontoUnitario > 0) {
            mostrarNotificacao(`${produto.nome}${infoLoteMsg} adicionado com desconto da promoção "${origemDesconto}"!`, 'success');
        } else {
            mostrarNotificacao(`${produto.nome}${infoLoteMsg} adicionado ao carrinho!`, 'success');
        }
    }

    function renderizarCarrinho() {
        const container = document.getElementById('carrinhoItems');
        if (!container) return;

        if (carrinho.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:80px 20px;color:#9ca3af;font-size:14px;">
                    <span style="font-size: 40px; display: block; margin-bottom: 10px;">🛒</span>
                    Utilize a barra de busca superior para adicionar produtos
                </div>`;
            return;
        }

        container.innerHTML = carrinho.map((item, index) => `
            <div class="carrinho-item">
                <div class="carrinho-item-info">
                    <span style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 2px;">Produto</span>
                    <strong>${item.nome}</strong>
                    <small>Cód: ${item.codigo || item.id}
                        ${item.serial ? `<br><span style="color:#2563eb;font-weight:600;">🔢 Serial: <code>${item.serial}</code></span>` : ''}
                        ${item.imei   ? `<br><span style="color:#4b5563;">📱 IMEI: ${item.imei}</span>` : ''}
                    </small>
                    ${item.lote ? `
                        <div style="display:inline-flex; align-items:center; gap:4px; margin-top:3px; background:#eff6ff; color:#1d4ed8; padding:2px 7px; border-radius:4px; font-size:10px; font-weight:800; border: 1px solid #bfdbfe; width: fit-content;" title="Lote selecionado para baixa">
                            <span>📦</span> Lote: <strong>${item.lote}</strong> ${item.data_validade ? `(Val: ${formatarData(item.data_validade)})` : ''}
                        </div>` : ''}
                    ${item.origem_desconto && item.desconto > 0 ? `
                        <div style="display:inline-flex; align-items:center; gap:4px; margin-top:4px; background:#FEF3C7; color:#92400E; padding:2px 7px; border-radius:4px; font-size:10px; font-weight:800; border: 1px solid #FDE68A; width: fit-content;" title="Desconto Promocional: ${item.origem_desconto}">
                            <span>🏷️</span> ${item.origem_desconto}
                        </div>` : ''}
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Unit.</span>
                    <div class="carrinho-item-price">${formatarMoeda(item.valor_venda)}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Qtd.</span>
                    <div class="qtd-control">
                        <button type="button" class="qtd-btn" onclick="alterarQuantidadeItem(${index}, -1)" ${item.serial_id ? 'disabled' : ''}>-</button>
                        <input type="number" class="qtd-input" min="1" value="${item.quantidade}"
                               onchange="atualizarQuantidade(${index}, this.value)"
                               ${item.serial_id ? 'disabled' : ''}>
                        <button type="button" class="qtd-btn" onclick="alterarQuantidadeItem(${index}, 1)" ${item.serial_id ? 'disabled' : ''}>+</button>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Desconto</span>
                    <div class="discount-container">
                        <span class="discount-prefix">R$</span>
                        <input type="number" class="discount-input" min="0" step="0.01" value="${item.desconto || 0}"
                               onchange="atualizarDescontoItem(${index}, this.value)"
                               placeholder="0.00" title="Desconto no Produto (R$)">
                    </div>
                    ${item.origem_desconto && item.desconto > 0 ? `
                        <span style="font-size: 9px; color: #B45309; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95px;" title="Origem: ${item.origem_desconto}">
                            🏷️ ${item.origem_desconto}
                        </span>` : ''}
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Acréscimo</span>
                    <div class="discount-container">
                        <span class="discount-prefix">R$</span>
                        <input type="number" class="discount-input" min="0" step="0.01" value="${item.acrescimo || 0}"
                               onchange="atualizarAcrescimoItem(${index}, this.value)"
                               placeholder="0.00" title="Acréscimo no Produto (R$)">
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px; text-align: right;">
                    <span style="font-size: 9px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Subtotal</span>
                    <div class="carrinho-item-subtotal">${formatarMoeda(item.subtotal)}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
                    <span style="font-size: 9px; font-weight: 700; color: transparent; user-select: none;">Ação</span>
                    <button class="btn-remover-item" onclick="removerDoCarrinho(${index})" title="Remover item">✕</button>
                </div>
            </div>`).join('');
    }

    window.alterarQuantidadeItem = (index, delta) => {
        const item = carrinho[index];
        if (!item) return;
        const novaQtd = (item.quantidade || 1) + delta;
        atualizarQuantidade(index, novaQtd);
    };

    window.atualizarQuantidade = (index, quantidade) => {
        quantidade = parseInt(quantidade);
        if (isNaN(quantidade) || quantidade < 1) quantidade = 1;

        const cartItem = carrinho[index];
        if (cartItem.serial_id) {
            mostrarNotificacao('Produtos com número de série têm quantidade limitada a 1!', 'error');
            cartItem.quantidade = 1;
            cartItem.subtotal = cartItem.valor_venda - (cartItem.desconto || 0) + (cartItem.acrescimo || 0);
            renderizarCarrinho();
            calcularTotais();
            return;
        }

        const produto = produtos.find(p => p.id === cartItem.id);
        const isServico = cartItem.tipo === 'servico' || produto?.tipo === 'servico';
        const permitirVendaSemSaldo = configLoja.permitir_venda_sem_saldo === true;
        const estoque = produto ? (produto.estoque_total ?? produto.estoque ?? 0) : 999;

        if (!isServico && !permitirVendaSemSaldo && quantidade > estoque) {
            mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoque}`, 'error');
            quantidade = estoque;
        }

        if (cartItem.lote && !isServico && !permitirVendaSemSaldo) {
            const lotes = obterLotesProdutoSaidas(produto);
            const loteAtual = lotes.find(l => l.lote === cartItem.lote);
            const limiteLote = loteAtual ? (parseInt(loteAtual.quantidade) || 0) : estoque;
            if (quantidade > limiteLote) {
                mostrarNotificacao(`Estoque insuficiente para o lote "${cartItem.lote}"! Disponível: ${limiteLote}`, 'error');
                quantidade = limiteLote;
            }
        }

        cartItem.quantidade = quantidade;
        
        // Recalcular desconto promocional proporcional se o produto tem desconto da ação
        if (cartItem.desconto_unitario && cartItem.desconto_unitario > 0) {
            cartItem.desconto = Math.round(cartItem.desconto_unitario * quantidade * 100) / 100;
        }

        // REGRA DE NEGÓCIO: Preço mínimo de R$ 0,01 por unidade após desconto
        const precoMinimoTotal = quantidade * 0.01;
        const maxDesconto = Math.max(0, (quantidade * cartItem.valor_venda) - precoMinimoTotal);
        if ((cartItem.desconto || 0) > maxDesconto) {
            cartItem.desconto = maxDesconto;
            mostrarNotificacao(`Desconto do item ajustado para R$ ${maxDesconto.toFixed(2)} para manter preço mínimo de R$ 0,01 por unidade.`, 'warning');
        }
        
        cartItem.subtotal = (quantidade * cartItem.valor_venda) - (cartItem.desconto || 0) + (cartItem.acrescimo || 0);
        renderizarCarrinho();
        calcularTotais();
    };

    window.atualizarDescontoItem = (index, desconto) => {
        desconto = parseFloat(desconto);
        if (isNaN(desconto) || desconto < 0) desconto = 0;

        const cartItem = carrinho[index];

        // REGRA DE NEGÓCIO: Preço de venda do item nunca pode ser zero (mínimo R$ 0,01 por unidade)
        const precoMinimoTotal = cartItem.quantidade * 0.01;
        const maxDesconto = Math.max(0, (cartItem.quantidade * cartItem.valor_venda) - precoMinimoTotal);
        if (desconto > maxDesconto) {
            mostrarNotificacao(`O produto nunca pode ser vendido por R$ 0,00 (mínimo R$ 0,01 por unidade). Desconto máximo permitido: R$ ${maxDesconto.toFixed(2)}!`, 'error');
            desconto = maxDesconto;
        }

        // Rastrear origem do desconto (se foi editado manualmente ou restaurado)
        const descPromocionalOriginal = Math.round((cartItem.desconto_unitario || 0) * cartItem.quantidade * 100) / 100;
        if (desconto !== descPromocionalOriginal) {
            if (cartItem.promocao_id && cartItem.origem_desconto && !cartItem.origem_desconto.startsWith('Manual')) {
                cartItem.origem_desconto = `Manual (${cartItem.origem_desconto})`;
            } else if (!cartItem.origem_desconto && desconto > 0) {
                cartItem.origem_desconto = 'Manual';
            }
        } else if (cartItem.promocao_id) {
            const promo = promocoesVigentes.find(p => p.id === cartItem.promocao_id);
            if (promo) cartItem.origem_desconto = promo.nome;
        }

        if (desconto === 0) {
            cartItem.origem_desconto = null;
        }

        cartItem.desconto = desconto;
        cartItem.subtotal = (cartItem.quantidade * cartItem.valor_venda) - desconto + (cartItem.acrescimo || 0);
        renderizarCarrinho();
        calcularTotais();
    };

    window.atualizarAcrescimoItem = (index, acrescimo) => {
        acrescimo = parseFloat(acrescimo);
        if (isNaN(acrescimo) || acrescimo < 0) acrescimo = 0;

        const cartItem = carrinho[index];
        cartItem.acrescimo = acrescimo;
        cartItem.subtotal = (cartItem.quantidade * cartItem.valor_venda) - (cartItem.desconto || 0) + acrescimo;
        renderizarCarrinho();
        calcularTotais();
    };

    window.removerDoCarrinho = (index) => {
        carrinho.splice(index, 1);
        renderizarCarrinho();
        calcularTotais();
    };

    function calcularTotais() {
        const subtotalOriginal = carrinho.reduce((s, i) => s + (i.quantidade * i.valor_venda), 0);
        const descontoProdutos = carrinho.reduce((s, i) => s + (i.desconto || 0), 0);
        const acrescimoProdutos = carrinho.reduce((s, i) => s + (i.acrescimo || 0), 0);
        let descontoVenda    = parseFloat(document.getElementById('desconto')?.value)  || 0;
        const acrescimo        = parseFloat(document.getElementById('acrescimo')?.value) || 0;

        // REGRA DE NEGÓCIO: O total da venda e os itens nunca podem ser R$ 0,00
        const totalQtd = carrinho.reduce((sum, i) => sum + i.quantidade, 0);
        const precoMinimoGlobal = totalQtd * 0.01;
        const maxDescontoVendaPermitido = Math.max(0, (subtotalOriginal - descontoProdutos) - precoMinimoGlobal);

        if (descontoVenda > maxDescontoVendaPermitido && carrinho.length > 0) {
            mostrarNotificacao(`Desconto geral limitado a R$ ${maxDescontoVendaPermitido.toFixed(2)} para preservar o preço mínimo de R$ 0,01 por item.`, 'warning');
            descontoVenda = maxDescontoVendaPermitido;
            const inputDesc = document.getElementById('desconto');
            if (inputDesc) inputDesc.value = descontoVenda.toFixed(2);
        }

        const total = Math.max(carrinho.length > 0 ? precoMinimoGlobal : 0, subtotalOriginal - descontoProdutos - descontoVenda + acrescimo + acrescimoProdutos);

        if (document.getElementById('subtotal')) {
            document.getElementById('subtotal').textContent = formatarMoeda(subtotalOriginal);
        }
        
        const linhaDescProd = document.getElementById('linhaDescontoProdutos');
        const valorDescProd = document.getElementById('valorDescontoProdutos');
        if (linhaDescProd && valorDescProd) {
            if (descontoProdutos > 0) {
                linhaDescProd.style.display = 'flex';
                valorDescProd.textContent = `- ${formatarMoeda(descontoProdutos)}`;
            } else {
                linhaDescProd.style.display = 'none';
            }
        }

        const linhaAcresProd = document.getElementById('linhaAcrescimoProdutos');
        const valorAcresProd = document.getElementById('valorAcrescimoProdutos');
        if (linhaAcresProd && valorAcresProd) {
            if (acrescimoProdutos > 0) {
                linhaAcresProd.style.display = 'flex';
                valorAcresProd.textContent = `+ ${formatarMoeda(acrescimoProdutos)}`;
            } else {
                linhaAcresProd.style.display = 'none';
            }
        }
        
        if (document.getElementById('valorDesconto')) {
            document.getElementById('valorDesconto').textContent = formatarMoeda(descontoVenda);
        }
        if (document.getElementById('valorAcrescimo')) {
            document.getElementById('valorAcrescimo').textContent = formatarMoeda(acrescimo);
        }
        if (document.getElementById('total')) {
            document.getElementById('total').textContent = formatarMoeda(total);
        }
    }

    document.getElementById('desconto')?.addEventListener('input',  calcularTotais);
    document.getElementById('acrescimo')?.addEventListener('input', calcularTotais);

    // =====================================================
    // LIMPAR FORMULÁRIO
    // =====================================================

    function limparFormulario() {
        carrinho = [];
        renderizarCarrinho();
        calcularTotais();
        sessionStorage.removeItem('checkout_restaurante');
        sessionStorage.removeItem('checkout_agendamento');

        if (typeof window.limparClienteRapido === 'function') {
            window.limparClienteRapido();
        } else {
            document.getElementById('clienteId').value         = '';
            document.getElementById('searchCliente').value     = '';
            if (document.getElementById('clienteVendaCpf')) document.getElementById('clienteVendaCpf').value = '';
            document.getElementById('clienteSelecionado').innerHTML = '';
        }

        document.getElementById('desconto').value          = '0';
        document.getElementById('acrescimo').value         = '0';
        document.getElementById('observacao').value        = '';
        document.getElementById('searchProdutoVenda').value = '';
        const colabSelect = document.getElementById('vendaColaborador');
        if (colabSelect) colabSelect.value = '';

        document.querySelectorAll('.btn-pagamento').forEach(b => b.classList.remove('selected'));
        formaPagamentoSelecionada = null;

        const suggestions = document.getElementById('produtoSuggestions');
        if (suggestions) suggestions.style.display = 'none';
    }

    document.getElementById('btnLimparVenda')?.addEventListener('click', () => {
        if (carrinho.length > 0 && !confirm('Deseja limpar o carrinho?')) return;
        limparFormulario();
    });

    // =====================================================
    // FINALIZAR VENDA
    // =====================================================

    async function finalizarVenda() {
        if (!verificarPermissaoModulo('saidas', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar vendas!', 'error');
            return;
        }

        if (carrinho.length === 0) {
            mostrarNotificacao('Adicione pelo menos um produto ao carrinho!', 'error');
            return;
        }

        // REGRA DE NEGÓCIO: Preço de venda nunca pode ser zero (mínimo R$ 0,01 por unidade)
        for (const item of carrinho) {
            if (!item.valor_venda || item.valor_venda < 0.01) {
                mostrarNotificacao(`O produto "${item.nome}" não pode ser vendido por R$ 0,00. Preço mínimo: R$ 0,01.`, 'error');
                return;
            }
            const minCobrado = item.quantidade * 0.01;
            if (item.subtotal < minCobrado) {
                mostrarNotificacao(`O valor final do produto "${item.nome}" não pode ser menor que R$ 0,01 por unidade. Ajuste o desconto!`, 'error');
                return;
            }
        }

        if (!formaPagamentoSelecionada) {
            mostrarNotificacao('Selecione a forma de pagamento!', 'error');
            return;
        }

        const clienteIdRaw  = document.getElementById('clienteId')?.value;
        const clienteId     = clienteIdRaw ? parseInt(clienteIdRaw) : null;
        const clienteNome   = document.getElementById('searchCliente')?.value.trim() || null;
        const clienteCpf    = document.getElementById('clienteVendaCpf')?.value.trim() || null;
        const desconto      = parseFloat(document.getElementById('desconto').value)  || 0;
        const acrescimo     = parseFloat(document.getElementById('acrescimo').value) || 0;
        const observacao    = document.getElementById('observacao').value;
        const subtotal      = carrinho.reduce((s, i) => s + i.subtotal, 0);
        const total         = Math.max(0, subtotal - desconto + acrescimo);

        const btnFinalizar = document.getElementById('btnFinalizarVenda');
        if (btnFinalizar) { btnFinalizar.disabled = true; btnFinalizar.textContent = '⏳ Processando...'; }

        try {
            // Verificar caixa ativo novamente antes de criar venda
            const caixaAtivo = await obterCaixaAtivo();
            if (!caixaAtivo) {
                mostrarNotificacao('❌ Venda não permitida: O caixa está fechado!', 'error');
                if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.textContent = '✅ Finalizar Venda'; }
                return;
            }
            if (isCaixaDiaAnterior(caixaAtivo)) {
                mostrarNotificacao('❌ Venda não permitida: O caixa aberto pertence ao dia anterior (' + formatarDataHora(caixaAtivo.data_abertura) + ') e precisa ser fechado para iniciar o novo dia!', 'error');
                if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.textContent = '🔒 Feche o Caixa Anterior'; }
                return;
            }

            const dataVenda = getDataLocalBrasil();

            // Calcular comissão da venda
            let comissaoCalculada = 0;
            const colabIdVal = document.getElementById('vendaColaborador')?.value ? parseInt(document.getElementById('vendaColaborador').value) : null;
            if (colabIdVal) {
                const colabObj = colaboradores.find(c => c.id === colabIdVal);
                const pctColab = colabObj ? parseFloat(colabObj.comissao || 0) / 100 : 0;
                
                for (const item of carrinho) {
                    const subtotalItem = item.subtotal || item.valor_venda * item.quantidade || 0;
                    const isServico = item.tipo === 'servico';
                    
                    if (isServico) {
                        if (item.comissao_habilitada === true) {
                            if (item.comissao_100_porcento === true) {
                                comissaoCalculada += subtotalItem;
                            } else {
                                comissaoCalculada += subtotalItem * (parseFloat(item.comissao_valor || 0) / 100);
                            }
                        }
                    } else {
                        comissaoCalculada += subtotalItem * pctColab;
                    }
                }
            }

            let obsFinal = observacao ? observacao.trim() : '';
            if (acrescimo > 0) {
                obsFinal = obsFinal ? `${obsFinal} | Acréscimo: R$ ${acrescimo.toFixed(2)}` : `Acréscimo: R$ ${acrescimo.toFixed(2)}`;
            }
            if (!clienteId && clienteNome) {
                const idInfo = clienteCpf ? `${clienteNome} (CPF: ${clienteCpf})` : clienteNome;
                obsFinal = obsFinal ? `${obsFinal} | Cliente: ${idInfo}` : `Cliente: ${idInfo}`;
            }

            let insertData = {
                cliente_id:         clienteId || null,
                data:               dataVenda,
                total:              total,
                desconto:           desconto,
                forma_pagamento:    formaPagamentoSelecionada,
                observacao:         obsFinal || null,
                usuario_id:         usuario.id,
                data_finalizacao:   new Date().toISOString(),
                caixa_id:           caixaAtivo ? caixaAtivo.id : null,
                colaborador_id:     colabIdVal,
                comissao_calculada: comissaoCalculada,
                comissao_paga:      false
            };

            let { data: venda, error: vendaError } = await supabaseClient
                .from('saidas')
                .insert([insertData])
                .select()
                .single();

            if (vendaError) {
                console.warn('⚠️ Erro ao inserir venda direta na tabela public.saidas. Retentando fallback seguro...', vendaError);
                // NUNCA deletar caixa_id! Ele é essencial para o fechamento de caixa.
                delete insertData.colaborador_id;
                delete insertData.comissao_calculada;
                delete insertData.comissao_paga;

                const retryResult = await supabaseClient
                    .from('saidas')
                    .insert([insertData])
                    .select()
                    .single();
                venda = retryResult.data;
                vendaError = retryResult.error;
            }

            if (vendaError) throw vendaError;

            const itensGravadosParaRelatorio = [];

            for (const item of carrinho) {
                const itemPayload = {
                    saida_id:       venda.id,
                    produto_id:     item.id,
                    quantidade:     item.quantidade,
                    valor_unitario: item.valor_venda,
                    subtotal:       item.subtotal,
                    desconto:       item.desconto || 0,
                    origem_desconto: item.desconto > 0 ? (item.origem_desconto || 'Manual') : null,
                    promocao_id:    item.promocao_id || null,
                    ...(item.serial_id ? { serial_id: item.serial_id } : {})
                };

                itensGravadosParaRelatorio.push({
                    ...itemPayload,
                    produto_nome: item.nome,
                    produto_codigo: item.codigo
                });

                let { error: itemErr } = await supabaseClient.from('saida_itens').insert([itemPayload]);
                if (itemErr) {
                    console.warn('Fallback: colunas de desconto ainda não disponíveis em saida_itens, inserindo payload básico:', itemErr.message);
                    delete itemPayload.desconto;
                    delete itemPayload.origem_desconto;
                    delete itemPayload.promocao_id;
                    await supabaseClient.from('saida_itens').insert([itemPayload]);
                }

                const produto = produtos.find(p => p.id === item.id);
                const isServico = item.tipo === 'servico' || produto?.tipo === 'servico';

                if (!isServico) {
                    const estAtual = produto?.estoque_total ?? produto?.estoque ?? 0;
                    const permitirVendaSemSaldo = configLoja.permitir_venda_sem_saldo === true;
                    const novoEstRaw = estAtual - item.quantidade;
                    const novoEst = permitirVendaSemSaldo ? novoEstRaw : Math.max(0, novoEstRaw);

                    // ===============================================
                    // ATUALIZAÇÃO DE LOTES E BAIXA ESPECÍFICA DE SALDO
                    // ===============================================
                    let lotesProduto = obterLotesProdutoSaidas(produto);
                    let loteAtivoFEFO = null;

                    if (lotesProduto.length > 0) {
                        let loteAlvo = null;
                        if (item.lote) {
                            loteAlvo = lotesProduto.find(l => l.lote === item.lote);
                        }

                        if (loteAlvo) {
                            // Abate do lote específico selecionado
                            const saldoLoteAtual = parseInt(loteAlvo.quantidade) || 0;
                            loteAlvo.quantidade = Math.max(0, saldoLoteAtual - item.quantidade);
                        } else {
                            // Se não especificou lote mas produto tem lotes, abate em ordem FEFO
                            let restante = item.quantidade;
                            for (const l of lotesProduto) {
                                if (restante <= 0) break;
                                const qtdLote = parseInt(l.quantidade) || 0;
                                if (qtdLote > 0) {
                                    const deduzir = Math.min(qtdLote, restante);
                                    l.quantidade = qtdLote - deduzir;
                                    restante -= deduzir;
                                }
                            }
                        }

                        // Ordenar FEFO por data de validade
                        lotesProduto.sort((a, b) => {
                            if (!a.data_validade) return 1;
                            if (!b.data_validade) return -1;
                            return new Date(a.data_validade) - new Date(b.data_validade);
                        });

                        // Salvar no localStorage imediatamente
                        salvarLotesLocal(item.id, lotesProduto);

                        // Atualizar produto em memória
                        if (produto) {
                            produto.lotes = lotesProduto;
                        }

                        // Localizar lote com saldo > 0 para preencher os campos legados (ou o primeiro se todos 0)
                        loteAtivoFEFO = lotesProduto.find(l => (parseInt(l.quantidade) || 0) > 0) || lotesProduto[0];
                    }

                    if (produto) {
                        produto.estoque_total = novoEst;
                        produto.estoque = novoEst;
                    }

                    // Montar payload de atualização do produto no Supabase
                    const updateProdPayload = {
                        estoque_total: novoEst,
                        ultima_movimentacao: new Date().toISOString()
                    };

                    if (lotesProduto.length > 0) {
                        updateProdPayload.lotes = lotesProduto;
                        if (loteAtivoFEFO) {
                            updateProdPayload.lote = loteAtivoFEFO.lote;
                            updateProdPayload.data_validade = loteAtivoFEFO.data_validade;
                            if (loteAtivoFEFO.alerta_vencimento_dias) {
                                updateProdPayload.alerta_vencimento_dias = loteAtivoFEFO.alerta_vencimento_dias;
                            }
                        }
                    }

                    // Tentar update com lotes; se a coluna não existir no Supabase, fallback sem a coluna
                    let { error: updErr } = await supabaseClient.from('produtos')
                        .update(updateProdPayload)
                        .eq('id', item.id);

                    if (updErr) {
                        console.warn('Fallback: coluna lotes não existe em produtos, atualizando campos padrão:', updErr.message);
                        delete updateProdPayload.lotes;
                        await supabaseClient.from('produtos')
                            .update(updateProdPayload)
                            .eq('id', item.id);
                    }

                    if (item.serial_id) {
                        await supabaseClient.from('produtos_seriais')
                            .update({ status: 'vendido', data_saida: new Date().toISOString() })
                            .eq('id', item.serial_id);
                    }

                    const motivoMovimento = `Venda #${venda.id}${item.lote ? ` - Lote: ${item.lote}` : ''}`;

                    await supabaseClient.from('movimentos_estoque').insert([{
                        produto_id:          item.id,
                        tipo:                'saida',
                        quantidade:          item.quantidade,
                        quantidade_anterior: estAtual,
                        quantidade_nova:     novoEst,
                        motivo:              motivoMovimento,
                        data:                new Date().toISOString(),
                        usuario_id:          usuario.id
                    }]);
                }
            }

            // Se for checkout de restaurante, atualizar o status da mesa para livre no banco e limpar itens
            const checkoutRestauranteStr = sessionStorage.getItem('checkout_restaurante');
            if (checkoutRestauranteStr) {
                try {
                    const checkout = JSON.parse(checkoutRestauranteStr);
                    await supabaseClient
                        .from('mesas_comandas')
                        .update({ status: 'livre', valor_acumulado: 0.00, itens_carrinho: [] })
                        .eq('id', checkout.mesa_id);
                } catch (e) {
                    console.error('Erro ao limpar mesa/comanda:', e);
                }
            }

            // Se for checkout de agendamento, atualizar o status do agendamento para concluído no banco
            const checkoutAgendamentoStr = sessionStorage.getItem('checkout_agendamento');
            if (checkoutAgendamentoStr) {
                try {
                    const checkout = JSON.parse(checkoutAgendamentoStr);
                    await supabaseClient
                        .from('agendamentos')
                        .update({ status: 'concluido' })
                        .eq('id', checkout.agendamento_id);
                    sessionStorage.removeItem('checkout_agendamento');
                } catch (e) {
                    console.error('Erro ao concluir agendamento:', e);
                }
            }

            // Armazenar histórico detalhado com origens de descontos para relatórios
            try {
                const lojaId = usuario.loja_id || 1;
                const relKey = `erp_vendas_descontos_loja_${lojaId}`;
                let listaVendasDesc = JSON.parse(localStorage.getItem(relKey) || '[]');
                listaVendasDesc.unshift({
                    venda_id: venda.id,
                    data: venda.data,
                    created_at: venda.data_finalizacao || new Date().toISOString(),
                    cliente_nome: venda.cliente_nome || clienteNome,
                    total: venda.total,
                    desconto_total: venda.desconto || 0,
                    forma_pagamento: venda.forma_pagamento,
                    usuario_nome: usuario.nome,
                    itens: itensGravadosParaRelatorio
                });
                if (listaVendasDesc.length > 500) listaVendasDesc = listaVendasDesc.slice(0, 500);
                localStorage.setItem(relKey, JSON.stringify(listaVendasDesc));
            } catch (e) {
                console.warn('Erro ao armazenar cache local de descontos:', e);
            }

            mostrarNotificacao(`✅ Venda #${venda.id} finalizada com sucesso!`, 'success');

            // Feedback de status na página
            const status = document.getElementById('statusVenda');
            if (status) {
                status.innerHTML = `✅ Venda <strong>#${venda.id}</strong> finalizada às 
                    <span style="color:var(--gray)">${new Date().toLocaleTimeString('pt-BR')}</span>`;
            }

            // Gerar comprovante e limpar
            await gerarComprovante(venda.id);
            limparFormulario();
            await carregarDados(venda.id);

            // Garantir que a seção de Vendas Recentes esteja aberta e visível
            const toggleBody = document.getElementById('vendasRecentesBody');
            if (toggleBody && !toggleBody.classList.contains('open')) {
                toggleBody.classList.add('open');
            }
            const toggleIcon = document.getElementById('iconToggle');
            if (toggleIcon) {
                toggleIcon.classList.add('open');
                toggleIcon.textContent = '▲';
            }
            const toggleBtn = document.getElementById('toggleVendasRecentes');
            if (toggleBtn) toggleBtn.classList.add('open');

        } catch (error) {
            console.error('Erro ao finalizar venda:', error);
            mostrarNotificacao('Erro ao finalizar venda: ' + (error.message || 'Verifique os dados'), 'error');
        } finally {
            if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.textContent = '✅ Finalizar Venda'; }
        }
    }

    document.getElementById('btnFinalizarVenda')?.addEventListener('click', finalizarVenda);

    function obterMotivoCancelamento(vendaId, infoText) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modalCancelar');
            const info = document.getElementById('cancelarInfo');
            const input = document.getElementById('cancelarMotivoInput');
            const btnFechar = document.getElementById('btnCancelarFechar');
            const btnConfirmar = document.getElementById('btnCancelarConfirmar');

            if (!modal || !info || !input || !btnFechar || !btnConfirmar) {
                resolve(null);
                return;
            }

            info.textContent = infoText;
            input.value = '';
            modal.style.display = 'flex';

            const novoBtnFechar = btnFechar.cloneNode(true);
            const novoBtnConfirmar = btnConfirmar.cloneNode(true);
            btnFechar.parentNode.replaceChild(novoBtnFechar, btnFechar);
            btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);

            novoBtnFechar.addEventListener('click', () => {
                modal.style.display = 'none';
                resolve(null);
            });

            novoBtnConfirmar.addEventListener('click', () => {
                const motivo = input.value.trim();
                if (!motivo) {
                    mostrarNotificacao('Informe o motivo do cancelamento!', 'error');
                    return;
                }
                modal.style.display = 'none';
                resolve(motivo);
            });
        });
    }

    // =====================================================
    // CANCELAR VENDA
    // =====================================================

    window.cancelarVenda = async (vendaId) => {
        if (!verificarPermissaoModulo('saidas', 'cancelar')) {
            mostrarNotificacao('Você não tem permissão para cancelar vendas!', 'error');
            return;
        }

        try {
            const { data: venda } = await supabaseClient
                .from('saidas')
                .select('*, clientes(nome)')
                .eq('id', vendaId)
                .single();

            if (venda?.cancelado) {
                mostrarNotificacao('⚠️ Esta venda já foi cancelada!', 'error');
                return;
            }

            if (Number(venda?.total) < 0) {
                mostrarNotificacao('⚠️ Não é possível cancelar uma devolução pelo menu de vendas!', 'error');
                return;
            }

            if (venda?.observacao && venda.observacao.includes('[Devolvido')) {
                mostrarNotificacao('⛔ Esta venda já possui devolução registrada e não pode ser cancelada diretamente!', 'error');
                return;
            }

            if (!podeCancelarVenda(venda?.data_finalizacao)) {
                mostrarNotificacao('⛔ Prazo de cancelamento (2h) expirado!', 'error');
                return;
            }

            const infoText = `Cancelar Venda #${vendaId} - Cliente: ${venda?.clientes?.nome || '—'} - Total: ${formatarMoeda(venda?.total)}`;
            const motivo = await obterMotivoCancelamento(vendaId, infoText);
            if (motivo === null) return;

            const { data: itens } = await supabaseClient
                .from('saida_itens')
                .select('*, produtos(id, nome, estoque_total)')
                .eq('saida_id', vendaId);

            // Estornar estoque
            for (const item of (itens || [])) {
                const estAtual = item.produtos?.estoque_total || 0;
                const novoEst  = estAtual + item.quantidade;

                await supabaseClient.from('produtos')
                    .update({ estoque_total: novoEst, ultima_movimentacao: new Date().toISOString() })
                    .eq('id', item.produto_id);

                if (item.serial_id) {
                    await supabaseClient.from('produtos_seriais')
                        .update({ status: 'disponivel', data_saida: null })
                        .eq('id', item.serial_id);
                }

                await supabaseClient.from('movimentos_estoque').insert([{
                    produto_id:          item.produto_id,
                    tipo:                'entrada',
                    quantidade:          item.quantidade,
                    quantidade_anterior: estAtual,
                    quantidade_nova:     novoEst,
                    motivo:              `Cancelamento de venda #${vendaId} — ${motivo}`,
                    data:                new Date().toISOString(),
                    usuario_id:          usuario.id
                }]);
            }

            await supabaseClient.from('saidas').update({
                cancelado:           true,
                cancelado_em:        new Date().toISOString(),
                cancelado_por:       usuario.id,
                motivo_cancelamento: motivo
            }).eq('id', vendaId);

            mostrarNotificacao(`✅ Venda #${vendaId} cancelada! Estoque estornado.`, 'success');
            await carregarDados();

        } catch (error) {
            console.error('Erro ao cancelar venda:', error);
            mostrarNotificacao('Erro ao cancelar: ' + error.message, 'error');
        }
    };

    // =====================================================
    // COMPROVANTE
    // =====================================================

    window.verComprovante = async (vendaId) => { await gerarComprovante(vendaId); };

    async function gerarComprovante(vendaId) {
        try {
            let venda = null;
            // Tentar com relações aninhadas
            try {
                const res = await supabaseClient
                    .from('saidas')
                    .select('*, clientes(nome,telefone,email,endereco,numero,cidade,estado,cpf_cnpj), usuarios!usuario_id(nome)')
                    .eq('id', vendaId)
                    .single();
                venda = res?.data;
            } catch (e) {
                console.warn('Busca de venda com relações falhou, tentando fallback simples...', e);
            }

            // Fallback simples se a busca aninhada não retornar
            if (!venda) {
                const res = await supabaseClient
                    .from('saidas')
                    .select('*')
                    .eq('id', vendaId)
                    .single();
                venda = res?.data || {};
            }

            // Complementar dados do cliente se necessário
            if (venda && venda.cliente_id && (!venda.clientes || !venda.clientes.nome)) {
                try {
                    const { data: c } = await supabaseClient
                        .from('clientes')
                        .select('nome,telefone,email,endereco,numero,cidade,estado,cpf_cnpj')
                        .eq('id', venda.cliente_id)
                        .single();
                    if (c) venda.clientes = c;
                } catch (e) {}
            }

            // Complementar dados do vendedor se necessário
            if (venda && venda.usuario_id && (!venda.usuarios || !venda.usuarios.nome)) {
                try {
                    const { data: u } = await supabaseClient
                        .from('usuarios')
                        .select('nome')
                        .eq('id', venda.usuario_id)
                        .single();
                    if (u) venda.usuarios = u;
                } catch (e) {}
            }

            let itens = [];
            try {
                const resItens = await supabaseClient
                    .from('saida_itens')
                    .select('*, produtos(id,nome,codigo,categoria,marca,modelo)')
                    .eq('saida_id', vendaId);
                itens = resItens?.data || [];
            } catch (e) {}

            if (!itens || itens.length === 0) {
                try {
                    const resItensSimples = await supabaseClient
                        .from('saida_itens')
                        .select('*')
                        .eq('saida_id', vendaId);
                    itens = resItensSimples?.data || [];
                } catch (e) {}
            }

            for (const item of (itens || [])) {
                if (item.produto_id && (!item.produtos || !item.produtos.nome)) {
                    try {
                        const { data: prod } = await supabaseClient
                            .from('produtos')
                            .select('id,nome,codigo,categoria,marca,modelo')
                            .eq('id', item.produto_id)
                            .single();
                        if (prod) item.produtos = prod;
                    } catch (e) {}
                }
                if (item.serial_id) {
                    try {
                        const { data: s } = await supabaseClient
                            .from('produtos_seriais')
                            .select('numero_serie, imei')
                            .eq('id', item.serial_id)
                            .single();
                        if (s) { item.numero_serie = s.numero_serie; item.imei = s.imei; }
                    } catch (e) {}
                }
            }

            const cliente = venda?.clientes || {};
            const loja = (typeof configLoja !== 'undefined' && configLoja) ? configLoja : (usuario?.config_loja || {});
            const isDevolucao = Number(venda?.total) < 0;
            const originalSubtotal = (itens || []).reduce((s, i) => s + (Math.abs(i.quantidade) * (i.valor_unitario || 0)), 0);
            const descontoProdutos = (itens || []).reduce((s, i) => s + ((Math.abs(i.quantidade) * (i.valor_unitario || 0)) - Math.abs(i.subtotal || 0)), 0);
            const descontoVenda = venda?.desconto || 0;
            const total    = venda?.total    || 0;
            const cancelada = venda?.cancelado;
            const horaVenda = new Date().toLocaleTimeString('pt-BR');

            document.getElementById('comprovanteBody').innerHTML = `
                <div id="comprovante" style="padding:15px 5px;font-family:'Courier New',monospace;max-width:400px;margin:0 auto;font-size:16px;line-height:1.3;color:#000;box-sizing:border-box;font-weight:bold;">

                    <!-- CABEÇALHO -->
                    <div style="text-align:center;line-height:1.4;">
                        <h2 style="margin:0;font-size:19px;font-weight:bold;text-transform:uppercase;">${loja.nome_fantasia || loja.nome || usuario.loja_nome || 'Aion ERP'}</h2>
                        <div style="margin:4px 0;font-size:15px;font-weight:bold;letter-spacing:-1px;">====================================</div>
                        ${(loja.endereco) ? `<p style="margin:2px 0;font-size:15px;">${loja.endereco}${loja.numero ? ', ' + loja.numero : ''}</p>` : ''}
                        ${(loja.telefone) ? `<p style="margin:2px 0;font-size:15px;">Telefone: ${loja.telefone}</p>` : ''}
                        ${(loja.cnpj) ? `<p style="margin:2px 0;font-size:15px;">CNPJ: ${loja.cnpj}</p>` : ''}
                        <div style="margin:4px 0;font-size:15px;font-weight:bold;letter-spacing:-1px;">====================================</div>
                    </div>

                    <!-- DADOS DO PEDIDO -->
                    <div style="font-size:15px;line-height:1.4;margin-bottom:8px;">
                        <p style="margin:2px 0;">Data: ${formatarData(venda?.data || new Date())} - ${venda?.hora || horaVenda}</p>
                        <h3 style="margin:2px 0;font-size:17px;font-weight:bold;color:${isDevolucao ? '#b45309' : '#000'};">${isDevolucao ? `🔄 ESTORNO / DEVOLUÇÃO #${venda?.id || vendaId}` : `PEDIDO NÚMERO: ${venda?.id || vendaId}`}</h3>
                        <p style="margin:2px 0;">Operador: ${venda?.usuarios?.nome || usuario.nome || 'Aion ERP'}</p>
                        ${isDevolucao && venda.observacao ? `
                            <p style="color:#b45309;margin-top:4px;font-size:14px;">
                                ${venda.observacao}
                            </p>` : ''}
                        ${cancelada ? `
                            <p style="color:#dc2626;margin-top:6px;font-size:15px;font-weight:bold;">
                                ⚠️ VENDA CANCELADA<br>
                                Motivo: ${venda.motivo_cancelamento || 'Não informado'}
                            </p>` : ''}
                        <div style="margin:4px 0;font-size:15px;font-weight:bold;letter-spacing:-1px;">====================================</div>
                    </div>

                    <!-- DADOS DO CLIENTE -->
                    <div style="font-size:15px;line-height:1.4;margin-bottom:8px;">
                        <p style="margin:2px 0;">Cliente: ${venda.cliente_nome || cliente.nome || 'Consumidor Final (Sem identificação)'}</p>
                        ${(venda.cliente_cpf || cliente.cpf_cnpj) ? `<p style="margin:2px 0;">CPF/CNPJ: ${venda.cliente_cpf || cliente.cpf_cnpj}</p>` : ''}
                        <div style="margin:4px 0;font-size:15px;font-weight:bold;letter-spacing:-1px;">====================================</div>
                    </div>

                    <!-- ITENS -->
                    <div style="margin-bottom:12px;">
                        <div style="font-weight:bold;margin-bottom:6px;font-size:15px;">${isDevolucao ? 'ITENS DEVOLVIDOS:' : 'ITENS:'}</div>
                        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px;margin-bottom:2px;">
                            <span style="width:30%;text-align:left;">Cod.</span>
                            <span style="width:40%;text-align:center;">Qtd.</span>
                            <span style="width:30%;text-align:right;">Total</span>
                        </div>
                        <div style="margin:4px 0;font-size:15px;font-weight:bold;letter-spacing:-1px;">====================================</div>
                        
                        ${(itens || []).map(item => {
                            const descItem = (Math.abs(item.quantidade) * (item.valor_unitario || 0)) - Math.abs(item.subtotal || 0);
                            return `
                            <div style="margin-bottom:12px;font-size:15px;line-height:1.3;">
                                <div style="display:flex;justify-content:space-between;">
                                    <span style="width:30%;text-align:left;">${item.produtos?.codigo || item.produto_id}</span>
                                    <span style="width:40%;text-align:center;">${Math.abs(item.quantidade)} x ${formatarMoeda(item.valor_unitario)}</span>
                                    <span style="width:30%;text-align:right;">${isDevolucao ? '-' : ''}R$ ${parseFloat(Math.abs(item.subtotal || 0)).toFixed(2)}</span>
                                </div>
                                <div style="text-transform:uppercase;font-weight:bold;margin-top:2px;">
                                    ${item.produtos?.nome || 'Produto'}
                                </div>
                                ${descItem > 0 ? `
                                <div style="font-size:13px;color:#dc2626;margin-top:2px;">
                                    Desconto no produto: - ${formatarMoeda(descItem)}${item.origem_desconto ? ` (${item.origem_desconto})` : ''}
                                </div>` : ''}
                                ${(item.numero_serie || item.imei) ? `
                                <div style="font-size:13px;margin-top:2px;">
                                    IMEI / n° Série: ${item.numero_serie || item.imei}
                                </div>` : ''}
                            </div>`;
                        }).join('')}
                        <div style="margin:4px 0;font-size:15px;font-weight:bold;letter-spacing:-1px;">====================================</div>
                    </div>

                    <!-- PAGAMENTO / VALORES -->
                    <div style="font-size:15px;line-height:1.4;margin-bottom:12px;">
                        <div style="text-align:center;font-weight:bold;margin-bottom:6px;">${isDevolucao ? 'VALORES DO ESTORNO' : 'PAGAMENTO'}</div>
                        
                        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                            <span>Subtotal</span>
                            <span>${formatarMoeda(originalSubtotal)}</span>
                        </div>
                        ${descontoProdutos > 0 ? `
                        <div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#dc2626;">
                            <span>(-) Desc. Prod.</span>
                            <span>- ${formatarMoeda(descontoProdutos)}</span>
                        </div>
                        ` : ''}
                        ${descontoVenda > 0 ? `
                        <div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#dc2626;">
                            <span>(-) Desc. Venda</span>
                            <span>- ${formatarMoeda(descontoVenda)}</span>
                        </div>
                        ` : ''}
                        
                        <div style="border-top:1px solid #000;margin:6px 0;"></div>
                        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:17px;margin-bottom:6px;color:${isDevolucao ? '#dc2626' : '#000'};">
                            <span>${isDevolucao ? 'VALOR ESTORNADO:' : 'TOTAL:'}</span>
                            <span>${isDevolucao ? `- ${formatarMoeda(Math.abs(total))}` : formatarMoeda(total)}</span>
                        </div>
                        <div style="border-top:1px solid #000;margin:6px 0;"></div>
                        
                        <p style="margin:2px 0;">${isDevolucao ? 'Forma de estorno' : 'Forma de pagamento'}: ${venda.forma_pagamento || '-'}</p>
                        <p style="margin:2px 0;">Valor Líquido: ${isDevolucao ? `- ${formatarMoeda(Math.abs(total))}` : formatarMoeda(total)}</p>
                    </div>

                    <!-- TERMOS DE GARANTIA E TROCAS -->
                    <div style="border-top:1px solid #000;padding-top:10px;font-size:13px;line-height:1.4;text-align:left;">
                        <p style="margin:4px 0;font-weight:bold;text-align:center;">GARANTIA DOS PRODUTOS</p>
                        ${(usuario.config_loja && usuario.config_loja.termo_garantia) ? `
                            <div style="white-space: pre-wrap; margin-top: 4px;">${usuario.config_loja.termo_garantia}</div>
                        ` : `
                            <br>
                            <p style="margin:2px 0;font-weight:bold;">1 ANO PARA:</p>
                            <p style="margin:1px 0;">SANSUNG</p>
                            <p style="margin:1px 0;">APPLE</p>
                            <p style="margin:1px 0;">ACER</p>
                            <p style="margin:1px 0;">LENOVO</p>
                            <p style="margin:1px 0;">DELL</p>
                            <p style="margin:1px 0;">HP</p>
                            <br>
                            <p style="margin:2px 0;font-weight:bold;">3 MESES PARA:</p>
                            <p style="margin:1px 0;">XIONI</p>
                            <br>
                            <p style="margin:2px 0;font-weight:bold;">1 ANO PARA:</p>
                            <p style="margin:1px 0;">MOTOROLA</p>
                        `}
                        
                        <br>
                        <p style="margin:4px 0;font-weight:bold;text-align:center;">POLITICA DE TROCAS</p>
                        ${(usuario.config_loja && usuario.config_loja.termo_troca) ? `
                            <div style="white-space: pre-wrap; text-align: justify; margin-top: 4px;">${usuario.config_loja.termo_troca}</div>
                        ` : `
                            <br>
                            <p style="margin:2px 0;text-align:justify;">O prazo de troca dos produtos é de 7 dias úteis para qualquer defeito funcional, após esse prazo, procure um posto autorizado do fabricante, norma que se aplica aos produtos APPLE, SANSUNG, DELL, ACER, LENOVO, HP, LG, MOTOROLA</p>
                            <br>
                            <p style="margin:2px 0;font-weight:bold;text-align:center;">OBS: NÃO EFETUAMOS TROCA POR INSATISFAÇÃO</p>
                        `}
                    </div>

                </div>`;;

            document.getElementById('modalComprovante').style.display = 'flex';

        } catch (error) {
            console.error('Erro ao gerar comprovante:', error);
            mostrarNotificacao('Erro ao gerar comprovante: ' + error.message, 'error');
        }
    }

    // =====================================================
    // IMPRIMIR / PDF
    // =====================================================

    document.getElementById('btnImprimir')?.addEventListener('click', () => {
        const conteudo = document.getElementById('comprovante')?.innerHTML;
        if (!conteudo) return;
        const janela = window.open('', '_blank');
        janela.document.write(`
            <html><head><title>Comprovante de Venda</title>
            <style>
                @page { margin: 0; size: auto; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    margin: 0;
                    padding: 4mm;
                    width: 100%;
                    max-width: 72mm;
                    margin: 0 auto;
                    font-size: 16px;
                    line-height: 1.3;
                    box-sizing: border-box;
                    background: #fff;
                    color: #000;
                    font-weight: bold;
                }
                @media print {
                    html, body {
                        width: 72mm;
                        margin: 0;
                        padding: 2mm 2mm 5mm 2mm;
                    }
                    button { display: none; }
                }
            </style>
            </head><body>${conteudo}
            <script>window.print();setTimeout(()=>window.close(),500);<\/script>
            </body></html>`);
        janela.document.close();
    });

    document.getElementById('btnSalvarPDF')?.addEventListener('click', () => {
        const el = document.getElementById('comprovante');
        if (!el) return;
        const janela = window.open('', '_blank', 'width=900,height=700');
        janela.document.write(`
            <html><head><title>Comprovante de Venda</title>
            <style>
                @page { margin: 0; size: auto; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    margin: 0;
                    padding: 4mm;
                    width: 100%;
                    max-width: 72mm;
                    margin: 0 auto;
                    font-size: 16px;
                    line-height: 1.3;
                    box-sizing: border-box;
                    background: #fff;
                    color: #000;
                    font-weight: bold;
                }
                @media print {
                    html, body {
                        width: 72mm;
                        margin: 0;
                        padding: 2mm 2mm 5mm 2mm;
                    }
                    .no-print { display: none; }
                }
                .no-print {
                    text-align: right;
                    margin-bottom: 12px;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 8px;
                }
                .btn-print-pdf {
                    background: #eb5e28;
                    color: #fff;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: bold;
                }
                .btn-close-pdf {
                    background: #888;
                    color: #fff;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin-left: 6px;
                    font-weight: bold;
                }
            </style>
            </head><body>
            <div class="no-print">
                <button class="btn-print-pdf" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
                <button class="btn-close-pdf" onclick="window.close()">Fechar</button>
            </div>
            ${el.innerHTML}
            <script>window.onload=function(){setTimeout(()=>window.print(),300);};<\/script>
            </body></html>`);
        janela.document.close();
    });

    // =====================================================
    // FECHAR MODAIS
    // =====================================================

    document.querySelectorAll('.close-comprovante').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalComprovante').style.display = 'none';
        });
    });

    document.querySelectorAll('.close-serial').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalSerial').style.display = 'none';
            produtoSerialPendente = null;
        });
    });

    // =====================================================
    // CADASTRO RÁPIDO DE CLIENTE
    // =====================================================

    const modalNovoCliente = document.getElementById('modalNovoCliente');
    const btnAdicionarClienteRapido = document.getElementById('btnAdicionarClienteRapido');
    const btnCancelarNovoCliente = document.getElementById('btnCancelarNovoCliente');
    const btnSalvarNovoCliente = document.getElementById('btnSalvarNovoCliente');
    const closeNovoCliente = document.querySelector('.close-novo-cliente');

    btnAdicionarClienteRapido?.addEventListener('click', () => {
        // Limpar os campos do modal
        document.getElementById('novoClienteNome').value = '';
        document.getElementById('novoClienteTelefone').value = '';
        document.getElementById('novoClienteCpfCnpj').value = '';
        document.getElementById('novoClienteEmail').value = '';
        document.getElementById('novoClienteEndereco').value = '';
        
        modalNovoCliente.style.display = 'flex';
        document.getElementById('novoClienteNome').focus();
    });

    const fecharModalCliente = () => {
        modalNovoCliente.style.display = 'none';
    };

    btnCancelarNovoCliente?.addEventListener('click', fecharModalCliente);
    closeNovoCliente?.addEventListener('click', fecharModalCliente);

    btnSalvarNovoCliente?.addEventListener('click', async () => {
        const nome = document.getElementById('novoClienteNome').value.trim();
        const telefone = document.getElementById('novoClienteTelefone').value.trim();
        const cpf_cnpj = document.getElementById('novoClienteCpfCnpj').value.trim();
        const email = document.getElementById('novoClienteEmail').value.trim();
        const endereco = document.getElementById('novoClienteEndereco').value.trim();

        // Se nenhum dado foi informado, apenas fecha o modal
        if (!nome && !telefone && !cpf_cnpj && !email && !endereco) {
            fecharModalCliente();
            return;
        }

        const nomeFinal = nome || (cpf_cnpj ? `Cliente ${cpf_cnpj}` : (telefone ? `Cliente ${telefone}` : 'Cliente Avulso'));

        btnSalvarNovoCliente.disabled = true;
        btnSalvarNovoCliente.textContent = 'Salvando...';

        try {
            const dados = {
                nome: nomeFinal,
                telefone: telefone || null,
                cpf_cnpj: cpf_cnpj || null,
                email: email || null,
                endereco: endereco || null,
                tipo: 'cliente'
            };

            const { data, error } = await supabaseClient
                .from('clientes')
                .insert([dados])
                .select()
                .single();

            if (error) throw error;

            // Adicionar ao array local para busca
            clientes.push(data);

            // Selecionar no PDV
            selecionarCliente(data.id, data.nome, data.cpf_cnpj);

            mostrarNotificacao('Cliente cadastrado e selecionado com sucesso!', 'success');
            fecharModalCliente();
        } catch (error) {
            console.error('Erro ao cadastrar cliente:', error);
            mostrarNotificacao('Erro ao cadastrar cliente: ' + error.message, 'error');
        } finally {
            btnSalvarNovoCliente.disabled = false;
            btnSalvarNovoCliente.textContent = 'Salvar e Selecionar';
        }
    });

    // =====================================================
    // TOGGLE VENDAS RECENTES
    // =====================================================

    const toggleBtn  = document.getElementById('toggleVendasRecentes');
    const toggleBody = document.getElementById('vendasRecentesBody');
    const toggleIcon = document.getElementById('iconToggle');

    toggleBtn?.addEventListener('click', () => {
        const open = toggleBody.classList.toggle('open');
        if (toggleIcon) {
            toggleIcon.classList.toggle('open', open);
            toggleIcon.textContent = open ? '▲' : '▼';
        }
        toggleBtn.classList.toggle('open', open);
    });

    // =====================================================
    // INICIALIZAR
    // =====================================================

    // Cadastro Rápido de Produto no PDV
    document.getElementById('btnAdicionarProdutoRapido')?.addEventListener('click', () => {
        const modal = document.getElementById('modalNovoProduto');
        if (!modal) return;

        const select = document.getElementById('rapidoCategoria');
        if (select) {
            select.innerHTML = '<option value="">Selecione a Categoria</option>' +
                categorias.map(c => `<option value="${c.nome}" data-id="${c.id}">${c.nome}</option>`).join('');
        }

        document.getElementById('produtoRapidoForm').reset();
        modal.style.display = 'flex';
    });

    document.getElementById('btnCancelarNovoProduto')?.addEventListener('click', () => {
        document.getElementById('modalNovoProduto').style.display = 'none';
    });

    document.querySelector('.close-novo-produto')?.addEventListener('click', () => {
        document.getElementById('modalNovoProduto').style.display = 'none';
    });

    document.getElementById('btnSalvarNovoProduto')?.addEventListener('click', async () => {
        const codigo = document.getElementById('rapidoCodigo').value.trim();
        const nome = document.getElementById('rapidoNome').value.trim();
        const valorCompra = parseFloat(document.getElementById('rapidoValorCompra').value) || 0;
        const valorVenda = parseFloat(document.getElementById('rapidoValorVenda').value) || 0;
        
        const catSelect = document.getElementById('rapidoCategoria');
        const categoria = catSelect.value;
        const categoriaOption = catSelect.options[catSelect.selectedIndex];
        const categoriaId = categoriaOption ? parseInt(categoriaOption.getAttribute('data-id')) : null;

        if (!codigo || !nome) {
            mostrarNotificacao('Código e Nome são obrigatórios!', 'error');
            return;
        }

        if (isNaN(valorVenda) || valorVenda < 0.01) {
            mostrarNotificacao('O preço de venda do item nunca pode ser zero. O preço mínimo permitido é R$ 0,01.', 'error');
            return;
        }

        const btn = document.getElementById('btnSalvarNovoProduto');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const { data, error } = await supabaseClient
                .from('produtos')
                .insert([{
                    codigo,
                    nome,
                    valor_compra: valorCompra,
                    valor_venda: valorVenda,
                    categoria,
                    categoria_id: categoriaId,
                    estoque_total: 0,
                    ativo: true,
                    loja_id: usuario.loja_id
                }])
                .select()
                .single();

            if (error) throw error;

            mostrarNotificacao('Produto cadastrado com sucesso!', 'success');
            document.getElementById('modalNovoProduto').style.display = 'none';

            // Adicionar ao array de produtos local e selecionar/adicionar ao carrinho
            produtos.push(data);
            await selecionarProduto(data.id);
        } catch (error) {
            console.error('Erro ao cadastrar produto rápido:', error);
            mostrarNotificacao('Erro ao cadastrar produto', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar e Adicionar';
        }
    });

    window.selecionarProduto   = selecionarProduto;
    window.selecionarSugestaoProduto = selecionarSugestaoProduto;
    window.selecionarSerial    = selecionarSerial;
    window.atualizarQuantidade = atualizarQuantidade;
    window.alterarQuantidadeItem = alterarQuantidadeItem;
    window.atualizarDescontoItem = atualizarDescontoItem;
    window.atualizarAcrescimoItem = atualizarAcrescimoItem;
    window.removerDoCarrinho   = removerDoCarrinho;
    window.verComprovante      = verComprovante;
    window.cancelarVenda       = cancelarVenda;

    carregarDados();

    // Sincronização em tempo real (Supabase Realtime)
    try {
        supabaseClient
            .channel('schema-db-changes-saidas')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => {
                carregarDados();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
                carregarDados();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas' }, () => {
                carregarDados();
            })
            .subscribe();
    } catch (e) {
        console.error('Erro ao assinar canais Realtime de saídas:', e);
    }
});