// js/promocoes.js
// Gestão de Ações Promocionais e Descontos - Aion ERP

let promocoes = [];
let produtosCadastrados = [];
let promocaoSelecionadaId = null;
let produtosVinculados = [];

// =====================================================
// CAMADA DE DADOS E API COMPARTILHADA (SUPABASE + FALLBACK)
// =====================================================

window.PromocoesAPI = {
    // Obter todas as ações promocionais da loja
    async listarPromocoes() {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;

        try {
            const { data, error } = await supabaseClient
                .from('promocoes')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.warn('Supabase promocoes indisponível, utilizando persistência local:', err.message);
            const storageKey = `erp_promocoes_loja_${lojaId}`;
            const localData = localStorage.getItem(storageKey);
            return localData ? JSON.parse(localData) : [];
        }
    },

    // Salvar ou atualizar ação promocional
    async salvarPromocao(dados) {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;
        dados.loja_id = lojaId;
        dados.updated_at = new Date().toISOString();

        try {
            if (dados.id) {
                const { data, error } = await supabaseClient
                    .from('promocoes')
                    .update(dados)
                    .eq('id', dados.id)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            } else {
                const { data, error } = await supabaseClient
                    .from('promocoes')
                    .insert([dados])
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }
        } catch (err) {
            console.warn('Fallback local para salvar promoção:', err.message);
            const storageKey = `erp_promocoes_loja_${lojaId}`;
            let list = JSON.parse(localStorage.getItem(storageKey) || '[]');

            if (dados.id) {
                const index = list.findIndex(p => p.id === parseInt(dados.id));
                if (index !== -1) {
                    list[index] = { ...list[index], ...dados, id: parseInt(dados.id) };
                    localStorage.setItem(storageKey, JSON.stringify(list));
                    return list[index];
                }
            }

            const novoId = Date.now();
            const novaPromo = { ...dados, id: novoId, created_at: new Date().toISOString() };
            list.unshift(novaPromo);
            localStorage.setItem(storageKey, JSON.stringify(list));
            return novaPromo;
        }
    },

    // Verificar se uma promoção já foi utilizada em vendas registradas
    async verificarPromocaoEmUso(id) {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;
        const promoIdNum = parseInt(id);

        let promoNome = '';
        try {
            if (typeof promocoes !== 'undefined' && Array.isArray(promocoes)) {
                const p = promocoes.find(pr => pr.id === promoIdNum);
                if (p) promoNome = p.nome;
            }
        } catch (e) {}

        // 1. Consultar banco Supabase na tabela saida_itens
        try {
            // A. Pela coluna promocao_id
            const { data: itensPorId, error: errId } = await supabaseClient
                .from('saida_itens')
                .select('id')
                .eq('promocao_id', promoIdNum)
                .limit(1);

            if (!errId && itensPorId && itensPorId.length > 0) {
                return true;
            }

            // B. Pela coluna origem_desconto (se houver nome da promoção)
            if (promoNome) {
                const { data: itensPorNome, error: errNome } = await supabaseClient
                    .from('saida_itens')
                    .select('id')
                    .ilike('origem_desconto', `%${promoNome}%`)
                    .limit(1);

                if (!errNome && itensPorNome && itensPorNome.length > 0) {
                    return true;
                }
            }
        } catch (errDb) {
            console.warn('Aviso ao checar vendas da promoção no banco:', errDb);
        }

        // 2. Consultar cache local de histórico de descontos
        try {
            const relKey = `erp_vendas_descontos_loja_${lojaId}`;
            const listaVendasDesc = JSON.parse(localStorage.getItem(relKey) || '[]');
            for (const v of listaVendasDesc) {
                if (Array.isArray(v.itens)) {
                    for (const item of v.itens) {
                        if (item.promocao_id === promoIdNum) return true;
                        if (promoNome && item.origem_desconto && String(item.origem_desconto).toLowerCase().includes(promoNome.toLowerCase())) {
                            return true;
                        }
                    }
                }
            }
        } catch (errCache) {
            console.warn('Aviso ao checar cache local de descontos:', errCache);
        }

        // 3. Consultar cache local de vendas geral (se houver)
        try {
            const vendasKey = `erp_vendas_loja_${lojaId}`;
            const vendasLocais = JSON.parse(localStorage.getItem(vendasKey) || '[]');
            for (const v of vendasLocais) {
                if (Array.isArray(v.itens)) {
                    for (const item of v.itens) {
                        if (item.promocao_id === promoIdNum) return true;
                        if (promoNome && item.origem_desconto && String(item.origem_desconto).toLowerCase().includes(promoNome.toLowerCase())) {
                            return true;
                        }
                    }
                }
            }
        } catch (errVendas) {}

        return false;
    },

    // Excluir ação promocional (apenas se nunca foi utilizada em vendas)
    async excluirPromocao(id) {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;

        // Regra de negócio: promoção já utilizada em vendas NÃO pode ser excluída, apenas desativada
        const emUso = await this.verificarPromocaoEmUso(id);
        if (emUso) {
            throw new Error('Esta ação promocional já foi utilizada em vendas e não pode ser excluída, apenas desativada.');
        }

        try {
            const { error } = await supabaseClient
                .from('promocoes')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (err) {
            if (err.message && err.message.includes('utilizada em vendas')) {
                throw err;
            }
            console.warn('Fallback local para excluir promoção:', err.message);
            const storageKey = `erp_promocoes_loja_${lojaId}`;
            let list = JSON.parse(localStorage.getItem(storageKey) || '[]');
            list = list.filter(p => p.id !== parseInt(id));
            localStorage.setItem(storageKey, JSON.stringify(list));

            // Remover também produtos vinculados a esta promoção
            const prodKey = `erp_promocao_produtos_loja_${lojaId}`;
            let prodList = JSON.parse(localStorage.getItem(prodKey) || '[]');
            prodList = prodList.filter(item => item.promocao_id !== parseInt(id));
            localStorage.setItem(prodKey, JSON.stringify(prodList));

            return true;
        }
    },

    // Listar produtos vinculados a uma promoção
    async listarProdutosPromocao(promocaoId) {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;

        try {
            const { data, error } = await supabaseClient
                .from('promocao_produtos')
                .select('*, produtos(id, codigo, nome, valor_venda, categoria)')
                .eq('promocao_id', promocaoId);

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.warn('Fallback local para listar produtos da promoção:', err.message);
            const prodKey = `erp_promocao_produtos_loja_${lojaId}`;
            const prodList = JSON.parse(localStorage.getItem(prodKey) || '[]');
            return prodList.filter(p => p.promocao_id === parseInt(promocaoId));
        }
    },

    // Vincular ou atualizar produto na promoção
    async vincularProduto(promocaoId, produto, tipoDesconto, valorDesconto) {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;

        const payload = {
            promocao_id: parseInt(promocaoId),
            produto_id: parseInt(produto.id),
            loja_id: lojaId,
            tipo_desconto: tipoDesconto,
            valor_desconto: parseFloat(valorDesconto),
            ativo: true,
            created_at: new Date().toISOString()
        };

        try {
            // Verificar se já existe vínculo
            const { data: existente } = await supabaseClient
                .from('promocao_produtos')
                .select('id')
                .eq('promocao_id', promocaoId)
                .eq('produto_id', produto.id)
                .maybeSingle();

            if (existente) {
                const { data, error } = await supabaseClient
                    .from('promocao_produtos')
                    .update(payload)
                    .eq('id', existente.id)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            } else {
                const { data, error } = await supabaseClient
                    .from('promocao_produtos')
                    .insert([payload])
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }
        } catch (err) {
            console.warn('Fallback local para vincular produto à promoção:', err.message);
            const prodKey = `erp_promocao_produtos_loja_${lojaId}`;
            let prodList = JSON.parse(localStorage.getItem(prodKey) || '[]');

            const index = prodList.findIndex(p => p.promocao_id === parseInt(promocaoId) && p.produto_id === parseInt(produto.id));
            const itemComProduto = {
                ...payload,
                id: existenteId(prodList, promocaoId, produto.id),
                produtos: {
                    id: produto.id,
                    codigo: produto.codigo,
                    nome: produto.nome,
                    valor_venda: produto.valor_venda,
                    categoria: produto.categoria
                }
            };

            if (index !== -1) {
                prodList[index] = itemComProduto;
            } else {
                prodList.push(itemComProduto);
            }

            localStorage.setItem(prodKey, JSON.stringify(prodList));
            return itemComProduto;
        }
    },

    // Desvincular produto da promoção
    async desvincularProduto(promocaoId, produtoId) {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;

        try {
            const { error } = await supabaseClient
                .from('promocao_produtos')
                .delete()
                .eq('promocao_id', promocaoId)
                .eq('produto_id', produtoId);
            if (error) throw error;
            return true;
        } catch (err) {
            console.warn('Fallback local para desvincular produto:', err.message);
            const prodKey = `erp_promocao_produtos_loja_${lojaId}`;
            let prodList = JSON.parse(localStorage.getItem(prodKey) || '[]');
            prodList = prodList.filter(p => !(p.promocao_id === parseInt(promocaoId) && p.produto_id === parseInt(produtoId)));
            localStorage.setItem(prodKey, JSON.stringify(prodList));
            return true;
        }
    },

    // Obter todas as promoções ativas vigentes da loja (para uso no PDV)
    async obterPromocoesVigentes() {
        const todas = await this.listarPromocoes();
        const hojeStr = new Date().toISOString().split('T')[0];

        return todas.filter(p => {
            if (!p.ativo) return false;
            if (p.data_inicio && p.data_inicio > hojeStr) return false;
            if (p.data_fim && p.data_fim < hojeStr) return false;
            return true;
        });
    },

    // Buscar se um determinado produto está em uma promoção ativa
    async buscarPromocaoDoProduto(produtoId) {
        const promocoesVigentes = await this.obterPromocoesVigentes();
        if (!promocoesVigentes || promocoesVigentes.length === 0) return null;

        const idsVigentes = promocoesVigentes.map(p => p.id);
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        const lojaId = usuario?.loja_id || 1;

        let itensVinculados = [];
        try {
            const { data, error } = await supabaseClient
                .from('promocao_produtos')
                .select('*')
                .eq('produto_id', produtoId)
                .eq('ativo', true)
                .in('promocao_id', idsVigentes);

            if (!error && data) itensVinculados = data;
        } catch (e) {
            const prodKey = `erp_promocao_produtos_loja_${lojaId}`;
            const prodList = JSON.parse(localStorage.getItem(prodKey) || '[]');
            itensVinculados = prodList.filter(p => p.produto_id === parseInt(produtoId) && p.ativo !== false && idsVigentes.includes(p.promocao_id));
        }

        if (itensVinculados.length === 0) return null;

        // Se houver mais de uma, seleciona a primeira ou a que der o maior benefício
        const vinculo = itensVinculados[0];
        const promocao = promocoesVigentes.find(p => p.id === vinculo.promocao_id);

        if (!promocao) return null;

        return {
            promocao,
            vinculo
        };
    },

    // Calcular o desconto em Reais respeitando a regra inegociável do preço mínimo de R$ 0,01
    calcularDescontoItem(valorVendaOriginal, tipoDesconto, valorDescontoParam) {
        const valorOriginal = parseFloat(valorVendaOriginal) || 0;
        if (valorOriginal <= 0.01) {
            // Se o produto já custa 0,01, não há como descontar sem violar o mínimo
            return {
                descontoUnitario: 0,
                precoFinalUnitario: valorOriginal,
                permitido: true
            };
        }

        let descUnit = 0;
        const valDesc = parseFloat(valorDescontoParam) || 0;

        if (tipoDesconto === 'porcentagem') {
            descUnit = (valorOriginal * valDesc) / 100;
        } else if (tipoDesconto === 'valor_fixo') {
            descUnit = valDesc;
        } else if (tipoDesconto === 'preco_fixo') {
            descUnit = Math.max(0, valorOriginal - valDesc);
        }

        // Teto de desconto: nunca permitir que o preço final seja menor que 0,01
        const maxDescontoPossivel = Math.max(0, valorOriginal - 0.01);

        if (descUnit > maxDescontoPossivel) {
            descUnit = maxDescontoPossivel;
        }

        descUnit = Math.round(descUnit * 100) / 100;
        const precoFinal = Math.max(0.01, Math.round((valorOriginal - descUnit) * 100) / 100);

        return {
            descontoUnitario: descUnit,
            precoFinalUnitario: precoFinal,
            permitido: precoFinal >= 0.01
        };
    },

    // Calcular o preço promocional final com base na promoção ou parâmetros de desconto
    calcularPrecoPromocional(valorVendaOriginal, promoOuItem) {
        if (!promoOuItem) return parseFloat(valorVendaOriginal) || 0;
        const tipo = promoOuItem.tipo_desconto || 'porcentagem';
        const valor = promoOuItem.valor_desconto !== undefined ? promoOuItem.valor_desconto : 0;
        const res = this.calcularDescontoItem(valorVendaOriginal, tipo, valor);
        return res.precoFinalUnitario;
    }
};

function existenteId(prodList, promocaoId, produtoId) {
    const item = prodList.find(p => p.promocao_id === parseInt(promocaoId) && p.produto_id === parseInt(produtoId));
    return item ? item.id : Date.now() + Math.floor(Math.random() * 1000);
}

// =====================================================
// INICIALIZAÇÃO DA INTERFACE DA PÁGINA promocoes.html
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar se estamos na tela de promoções
    if (!document.getElementById('tabelaPromocoes')) return;

    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    if (!verificarPermissao('saidas', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar Ações Promocionais.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }

    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = { admin: '👑 Administrador', gerente: '📊 Gerente', vendedor: '💰 Vendedor', basico: '👤 Básico' };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil || '';

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Deseja sair do sistema?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });

    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('open');
    });

    // Configurar data padrão inicial
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('promoDataInicio').value = hoje;

    // Carregar dados iniciais
    await carregarProdutosParaSelecao();
    await carregarPromocoes();

    // Eventos
    configurarEventosUI();
});

// Carregar lista de produtos para o dropdown de vinculação
async function carregarProdutosParaSelecao() {
    try {
        const { data, error } = await supabaseClient
            .from('produtos')
            .select('id, codigo, nome, valor_venda, categoria, tipo')
            .eq('ativo', true)
            .order('nome');

        if (!error && data) {
            produtosCadastrados = data;
        }
    } catch (e) {
        console.warn('Erro ao carregar produtos para promoção:', e);
    }
}

// Carregar e renderizar tabela de promoções
async function carregarPromocoes() {
    try {
        promocoes = await window.PromocoesAPI.listarPromocoes();
        atualizarKPIs();
        renderizarTabelaPromocoes();
    } catch (e) {
        console.error('Erro ao carregar promoções:', e);
        mostrarNotificacao('Erro ao carregar ações promocionais', 'error');
    }
}

// Atualizar cards de métricas (KPIs)
async function atualizarKPIs() {
    const hojeStr = new Date().toISOString().split('T')[0];
    const totalAcoes = promocoes.length;

    const vigentes = promocoes.filter(p => {
        if (!p.ativo) return false;
        if (p.data_inicio && p.data_inicio > hojeStr) return false;
        if (p.data_fim && p.data_fim < hojeStr) return false;
        return true;
    });

    document.getElementById('kpiTotalAcoes').textContent = totalAcoes;
    document.getElementById('kpiAcoesVigentes').textContent = vigentes.length;

    // Calcular quantidade de produtos vinculados e desconto médio
    let totalProds = 0;
    let somaDescontosPct = 0;
    let qtdPct = 0;

    for (const promo of promocoes) {
        const prods = await window.PromocoesAPI.listarProdutosPromocao(promo.id);
        totalProds += prods.length;
        if (promo.tipo_desconto === 'porcentagem') {
            somaDescontosPct += parseFloat(promo.valor_desconto || 0);
            qtdPct++;
        }
    }

    document.getElementById('kpiProdutosPromo').textContent = totalProds;
    const mediaPct = qtdPct > 0 ? (somaDescontosPct / qtdPct).toFixed(0) : '0';
    document.getElementById('kpiDescontoMedio').textContent = `${mediaPct}%`;
}

// Obter estado de vigência da promoção
function obterEstadoVigencia(promo) {
    if (!promo.ativo) return { label: 'Inativa', classe: 'badge-inativa' };

    const hojeStr = new Date().toISOString().split('T')[0];
    if (promo.data_inicio && promo.data_inicio > hojeStr) {
        return { label: 'Agendada', classe: 'badge-agendada' };
    }
    if (promo.data_fim && promo.data_fim < hojeStr) {
        return { label: 'Expirada', classe: 'badge-expirada' };
    }
    return { label: 'Vigente', classe: 'badge-vigente' };
}

// Renderizar listagem de ações
async function renderizarTabelaPromocoes() {
    const tbody = document.getElementById('listaPromocoesCorpo');
    if (!tbody) return;

    const filtroTexto = (document.getElementById('filtroTexto')?.value || '').toLowerCase().trim();
    const filtroStatus = document.getElementById('filtroStatus')?.value || 'todos';

    const hojeStr = new Date().toISOString().split('T')[0];

    const filtradas = promocoes.filter(p => {
        // Filtro texto
        if (filtroTexto && !p.nome.toLowerCase().includes(filtroTexto) && !(p.descricao || '').toLowerCase().includes(filtroTexto)) {
            return false;
        }

        // Filtro status
        const estado = obterEstadoVigencia(p);
        if (filtroStatus === 'vigentes' && estado.label !== 'Vigente') return false;
        if (filtroStatus === 'agendadas' && estado.label !== 'Agendada') return false;
        if (filtroStatus === 'expiradas' && estado.label !== 'Expirada') return false;
        if (filtroStatus === 'inativas' && estado.label !== 'Inativa') return false;

        return true;
    });

    if (filtradas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">
                    Nenhuma ação promocional encontrada para os filtros aplicados.
                </td>
            </tr>
        `;
        return;
    }

    // Carregar contagem de produtos vinculados e status de uso em vendas
    const htmlRows = [];
    for (const p of filtradas) {
        const estado = obterEstadoVigencia(p);
        const prods = await window.PromocoesAPI.listarProdutosPromocao(p.id);
        const qtdProds = prods.length;
        const emUso = await window.PromocoesAPI.verificarPromocaoEmUso(p.id);

        const descFormatado = p.tipo_desconto === 'porcentagem' 
            ? `${parseFloat(p.valor_desconto || 0)}% OFF` 
            : `R$ ${parseFloat(p.valor_desconto || 0).toFixed(2)} OFF`;

        const periodoTexto = `${formatarDataBrasil(p.data_inicio)} ${p.data_fim ? 'até ' + formatarDataBrasil(p.data_fim) : '(Indeterminada)'}`;

        const badgeEmUso = emUso 
            ? `<span style="background: #e2e8f0; color: #334155; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1; margin-left: 6px;" title="Esta ação já concedeu descontos em vendas registradas">🔒 Usada em vendas</span>`
            : '';

        htmlRows.push(`
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px 14px;">
                    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                        <strong style="color: #0F172A; font-size: 14px;">${p.nome}</strong>
                        ${badgeEmUso}
                    </div>
                    ${p.descricao ? `<div style="color: #64748B; font-size: 11px; margin-top: 2px;">${p.descricao}</div>` : ''}
                </td>
                <td style="padding: 12px 14px; font-size: 12px; color: #475569;">
                    <div>${periodoTexto}</div>
                    <span class="badge-status ${estado.classe}" style="margin-top: 4px;">${estado.label}</span>
                </td>
                <td style="padding: 12px 14px;">
                    <span class="badge-tag-desconto">🏷️ ${descFormatado}</span>
                </td>
                <td style="padding: 12px 14px; text-align: center;">
                    <span class="badge-prod-count">📦 ${qtdProds} produto(s)</span>
                </td>
                <td style="padding: 12px 14px; text-align: center;">
                    <button class="btn-toggle-status" onclick="alternarStatusPromocao(${p.id}, ${p.ativo ? 'false' : 'true'})" 
                            style="background: none; border: 1px solid ${p.ativo ? '#10B981' : '#EF4444'}; color: ${p.ativo ? '#10B981' : '#EF4444'}; padding: 4px 10px; border-radius: 14px; font-size: 11px; font-weight: 700; cursor: pointer;">
                        ${p.ativo ? '✓ Ativa' : '✕ Desativada'}
                    </button>
                </td>
                <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                    <button class="btn-produtos" onclick="abrirModalProdutos(${p.id})" title="Vincular Produtos da Promoção">
                        🏷️ Produtos
                    </button>
                    <button class="btn-warning" onclick="editarPromocao(${p.id})" title="Editar Ação" style="padding: 6px 10px; margin-left: 4px;">
                        ✏️
                    </button>
                    <button class="btn-danger" onclick="excluirPromocao(${p.id})" title="${emUso ? 'Ação utilizada em vendas (não pode ser excluída, apenas desativada)' : 'Excluir Ação'}" style="padding: 6px 10px; margin-left: 4px; ${emUso ? 'opacity: 0.8;' : ''}">
                        🗑️
                    </button>
                </td>
            </tr>
        `);
    }

    tbody.innerHTML = htmlRows.join('');
}

function formatarDataBrasil(dataIso) {
    if (!dataIso) return '-';
    const partes = dataIso.split('-');
    if (partes.length !== 3) return dataIso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Configuração de Eventos UI
function configurarEventosUI() {
    // Abrir modal de criação
    document.getElementById('btnNovaPromocao')?.addEventListener('click', () => {
        document.getElementById('modalPromocaoTitulo').textContent = 'Nova Ação Promocional';
        document.getElementById('formPromocao').reset();
        document.getElementById('promocaoId').value = '';
        document.getElementById('promoDataInicio').value = new Date().toISOString().split('T')[0];
        document.getElementById('promoAtivo').checked = true;
        document.getElementById('modalPromocao').style.display = 'flex';
    });

    // Fechar modal ação
    document.getElementById('fecharModalPromocao')?.addEventListener('click', () => {
        document.getElementById('modalPromocao').style.display = 'none';
    });
    document.getElementById('btnCancelarPromocao')?.addEventListener('click', () => {
        document.getElementById('modalPromocao').style.display = 'none';
    });

    // Salvar formulário da ação promocional
    document.getElementById('formPromocao')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('promocaoId').value;
        const nome = document.getElementById('promoNome').value.trim();
        const descricao = document.getElementById('promoDescricao').value.trim();
        const tipoDesconto = document.getElementById('promoTipoDesconto').value;
        const valorDesconto = parseFloat(document.getElementById('promoValorDesconto').value);
        const dataInicio = document.getElementById('promoDataInicio').value;
        const dataFim = document.getElementById('promoDataFim').value || null;
        const ativo = document.getElementById('promoAtivo').checked;

        if (!nome) {
            mostrarNotificacao('Informe o nome da ação promocional!', 'error');
            return;
        }

        if (isNaN(valorDesconto) || valorDesconto <= 0) {
            mostrarNotificacao('Informe um valor de desconto válido!', 'error');
            return;
        }

        if (tipoDesconto === 'porcentagem' && valorDesconto >= 100) {
            mostrarNotificacao('O desconto não pode ser 100% ou maior. O preço de venda deve ser no mínimo R$ 0,01.', 'error');
            return;
        }

        if (dataFim && dataFim < dataInicio) {
            mostrarNotificacao('A data final não pode ser anterior à data de início!', 'error');
            return;
        }

        const dados = {
            id: id ? parseInt(id) : null,
            nome,
            descricao,
            tipo_desconto: tipoDesconto,
            valor_desconto: valorDesconto,
            data_inicio: dataInicio,
            data_fim: dataFim,
            ativo
        };

        const btn = document.getElementById('btnSalvarPromocao');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            await window.PromocoesAPI.salvarPromocao(dados);
            mostrarNotificacao(`Ação promocional "${nome}" salva com sucesso!`, 'success');
            document.getElementById('modalPromocao').style.display = 'none';
            await carregarPromocoes();
        } catch (err) {
            console.error(err);
            mostrarNotificacao('Erro ao salvar ação promocional', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar Ação';
        }
    });

    // Filtros
    document.getElementById('btnFiltrar')?.addEventListener('click', renderizarTabelaPromocoes);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarTabelaPromocoes);
    document.getElementById('filtroTexto')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') renderizarTabelaPromocoes();
    });
    document.getElementById('btnLimparFiltros')?.addEventListener('click', () => {
        document.getElementById('filtroTexto').value = '';
        document.getElementById('filtroStatus').value = 'todos';
        renderizarTabelaPromocoes();
    });

    // Modal Produtos da Promoção
    document.getElementById('fecharModalProdutos')?.addEventListener('click', () => {
        document.getElementById('modalProdutosPromocao').style.display = 'none';
    });
    document.getElementById('btnFecharProdutosPromo')?.addEventListener('click', () => {
        document.getElementById('modalProdutosPromocao').style.display = 'none';
        carregarPromocoes(); // Recalcula KPIs
    });

    // Prévia de cálculo dinâmico ao selecionar produto ou alterar desconto
    const selectProd = document.getElementById('selectProdutoPromo');
    const inputTipo = document.getElementById('prodPromoTipo');
    const inputValor = document.getElementById('prodPromoValor');

    function atualizarPreviaPreco() {
        const prodId = parseInt(selectProd.value);
        const produto = produtosCadastrados.find(p => p.id === prodId);
        const boxPreview = document.getElementById('promoPrecoPreview');
        const avisoMinimo = document.getElementById('avisoPrecoMinimo');
        const btnVincular = document.getElementById('btnAdicionarProdutoPromo');

        if (!produto || isNaN(parseFloat(inputValor.value))) {
            boxPreview.style.display = 'none';
            avisoMinimo.style.display = 'none';
            btnVincular.disabled = false;
            return;
        }

        const valorOriginal = parseFloat(produto.valor_venda) || 0;
        const calc = window.PromocoesAPI.calcularDescontoItem(valorOriginal, inputTipo.value, inputValor.value);

        boxPreview.style.display = 'flex';
        document.getElementById('previewPrecoOriginal').textContent = `R$ ${valorOriginal.toFixed(2)}`;
        document.getElementById('previewValorDesconto').textContent = `- R$ ${calc.descontoUnitario.toFixed(2)}`;
        document.getElementById('previewPrecoFinal').textContent = `R$ ${calc.precoFinalUnitario.toFixed(2)}`;

        // Trava inegociável de preço mínimo R$ 0,01
        if (calc.precoFinalUnitario < 0.01 || (inputTipo.value === 'porcentagem' && parseFloat(inputValor.value) >= 100)) {
            avisoMinimo.style.display = 'block';
            avisoMinimo.textContent = `⚠️ REGRA DE NEGÓCIO: O preço mínimo é R$ 0,01. O produto nunca pode ser vendido por R$ 0,00!`;
            btnVincular.disabled = true;
        } else {
            avisoMinimo.style.display = 'none';
            btnVincular.disabled = false;
        }
    }

    selectProd?.addEventListener('change', atualizarPreviaPreco);
    inputTipo?.addEventListener('change', atualizarPreviaPreco);
    inputValor?.addEventListener('input', atualizarPreviaPreco);

    // Form adicionar produto à promoção
    document.getElementById('formAdicionarProdutoPromo')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!promocaoSelecionadaId) return;

        const prodId = parseInt(selectProd.value);
        const produto = produtosCadastrados.find(p => p.id === prodId);
        if (!produto) {
            mostrarNotificacao('Selecione um produto válido!', 'error');
            return;
        }

        const tipoDesc = inputTipo.value;
        const valDesc = parseFloat(inputValor.value);

        // Validação da regra de preço mínimo
        const calc = window.PromocoesAPI.calcularDescontoItem(produto.valor_venda, tipoDesc, valDesc);
        if (calc.precoFinalUnitario < 0.01) {
            mostrarNotificacao('O preço final não pode ser menor que R$ 0,01. O produto nunca pode ser vendido por R$ 0,00!', 'error');
            return;
        }

        const btn = document.getElementById('btnAdicionarProdutoPromo');
        btn.disabled = true;
        btn.textContent = 'Vinculando...';

        try {
            await window.PromocoesAPI.vincularProduto(promocaoSelecionadaId, produto, tipoDesc, valDesc);
            mostrarNotificacao(`Produto "${produto.nome}" adicionado à promoção!`, 'success');
            selectProd.value = '';
            inputValor.value = '';
            document.getElementById('promoPrecoPreview').style.display = 'none';
            await carregarProdutosVinculadosModal(promocaoSelecionadaId);
        } catch (err) {
            console.error(err);
            mostrarNotificacao('Erro ao vincular produto à ação', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Vincular';
        }
    });
}

// Alternar status ativo/inativo
window.alternarStatusPromocao = async (id, novoStatus) => {
    const promo = promocoes.find(p => p.id === id);
    if (!promo) return;

    try {
        await window.PromocoesAPI.salvarPromocao({ id, ativo: novoStatus });
        mostrarNotificacao(`Ação "${promo.nome}" ${novoStatus ? 'ativada' : 'desativada'}!`, 'info');
        await carregarPromocoes();
    } catch (e) {
        mostrarNotificacao('Erro ao alterar status da ação', 'error');
    }
};

// Editar ação promocional
window.editarPromocao = (id) => {
    const promo = promocoes.find(p => p.id === id);
    if (!promo) return;

    document.getElementById('modalPromocaoTitulo').textContent = 'Editar Ação Promocional';
    document.getElementById('promocaoId').value = promo.id;
    document.getElementById('promoNome').value = promo.nome;
    document.getElementById('promoDescricao').value = promo.descricao || '';
    document.getElementById('promoTipoDesconto').value = promo.tipo_desconto || 'porcentagem';
    document.getElementById('promoValorDesconto').value = promo.valor_desconto || 0;
    document.getElementById('promoDataInicio').value = promo.data_inicio || '';
    document.getElementById('promoDataFim').value = promo.data_fim || '';
    document.getElementById('promoAtivo').checked = promo.ativo !== false;

    document.getElementById('modalPromocao').style.display = 'flex';
};

// Excluir ação promocional
window.excluirPromocao = async (id) => {
    const promo = promocoes.find(p => p.id === id);
    if (!promo) return;

    // Verificar se a promoção já foi usada em vendas
    const emUso = await window.PromocoesAPI.verificarPromocaoEmUso(id);
    if (emUso) {
        if (promo.ativo) {
            const desejaDesativar = confirm(
                `⚠️ ATENÇÃO: A ação promocional "${promo.nome}" já foi utilizada em vendas registradas no sistema.\n\n` +
                `Pelas regras fiscais e de auditoria, uma ação promocional já utilizada NÃO pode ser excluída, apenas desativada.\n\n` +
                `Deseja DESATIVAR esta ação promocional agora para que não seja mais aplicada em novas vendas?`
            );
            if (desejaDesativar) {
                try {
                    await window.PromocoesAPI.alternarStatus(id, false);
                    mostrarNotificacao(`Ação "${promo.nome}" desativada com sucesso!`, 'success');
                    await carregarPromocoes();
                } catch (err) {
                    mostrarNotificacao('Erro ao desativar ação promocional', 'error');
                }
            }
        } else {
            alert(
                `⚠️ A ação promocional "${promo.nome}" já foi utilizada em vendas registradas no sistema.\n\n` +
                `Ela não pode ser excluída para preservar o histórico fiscal e de relatórios de descontos.\n` +
                `Esta ação já se encontra desativada.`
            );
        }
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir a ação promocional "${promo.nome}"?\nOs descontos associados a ela deixarão de ser aplicados.`)) {
        return;
    }

    try {
        await window.PromocoesAPI.excluirPromocao(id);
        mostrarNotificacao(`Ação "${promo.nome}" excluída com sucesso!`, 'success');
        await carregarPromocoes();
    } catch (e) {
        mostrarNotificacao(e.message || 'Erro ao excluir ação promocional', 'error');
    }
};

// Abrir modal de produtos da promoção
window.abrirModalProdutos = async (id) => {
    const promo = promocoes.find(p => p.id === id);
    if (!promo) return;

    promocaoSelecionadaId = id;
    document.getElementById('modalProdutosTitulo').textContent = `🏷️ ${promo.nome}`;
    document.getElementById('modalProdutosSubtitulo').textContent = `Desconto Padrão: ${promo.tipo_desconto === 'porcentagem' ? promo.valor_desconto + '%' : 'R$ ' + parseFloat(promo.valor_desconto).toFixed(2)} | Vigência: ${formatarDataBrasil(promo.data_inicio)} a ${formatarDataBrasil(promo.data_fim)}`;

    // Pré-preencher o desconto padrão no form
    document.getElementById('prodPromoTipo').value = promo.tipo_desconto || 'porcentagem';
    document.getElementById('prodPromoValor').value = promo.valor_desconto || 0;
    document.getElementById('promoPrecoPreview').style.display = 'none';
    document.getElementById('avisoPrecoMinimo').style.display = 'none';

    // Preencher select de produtos
    const select = document.getElementById('selectProdutoPromo');
    select.innerHTML = '<option value="">-- Selecione um Produto --</option>' +
        produtosCadastrados.map(p => `<option value="${p.id}">${p.codigo ? '[' + p.codigo + '] ' : ''}${p.nome} - R$ ${parseFloat(p.valor_venda || 0).toFixed(2)}</option>`).join('');

    await carregarProdutosVinculadosModal(id);
    document.getElementById('modalProdutosPromocao').style.display = 'flex';
};

// Carregar e renderizar tabela de produtos vinculados no modal
async function carregarProdutosVinculadosModal(promocaoId) {
    const tbody = document.getElementById('listaProdutosVinculadosCorpo');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Carregando produtos vinculados...</td></tr>';

    produtosVinculados = await window.PromocoesAPI.listarProdutosPromocao(promocaoId);
    document.getElementById('contadorProdutosPromo').textContent = produtosVinculados.length;

    if (produtosVinculados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 25px; color: var(--gray);">
                    Nenhum produto vinculado a esta ação ainda. Selecione um produto acima e clique em "Vincular".
                </td>
            </tr>
        `;
        return;
    }

    const htmlRows = produtosVinculados.map(item => {
        // Objeto produto pode vir de relacionamento Supabase ou busca local
        const prod = item.produtos || produtosCadastrados.find(p => p.id === item.produto_id) || {};
        const precoOriginal = parseFloat(prod.valor_venda || 0);

        const calc = window.PromocoesAPI.calcularDescontoItem(precoOriginal, item.tipo_desconto, item.valor_desconto);

        const regraTexto = item.tipo_desconto === 'porcentagem'
            ? `${item.valor_desconto}% OFF`
            : item.tipo_desconto === 'valor_fixo'
                ? `R$ ${parseFloat(item.valor_desconto).toFixed(2)} OFF`
                : `Preço Fixo R$ ${parseFloat(item.valor_desconto).toFixed(2)}`;

        return `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 8px 10px; font-weight: 600; color: #64748B;">${prod.codigo || '-'}</td>
                <td style="padding: 8px 10px; font-weight: 700; color: #1E293B;">${prod.nome || 'Produto #' + item.produto_id}</td>
                <td style="padding: 8px 10px; text-align: right; text-decoration: line-through; color: #64748B;">
                    R$ ${precoOriginal.toFixed(2)}
                </td>
                <td style="padding: 8px 10px; text-align: center;">
                    <span class="badge-tag-desconto" style="font-size: 11px;">${regraTexto}</span>
                </td>
                <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #15803D; font-size: 14px;">
                    R$ ${calc.precoFinalUnitario.toFixed(2)}
                </td>
                <td style="padding: 8px 10px; text-align: center;">
                    <span style="font-size: 11px; font-weight: 700; color: ${item.ativo !== false ? '#10B981' : '#EF4444'};">
                        ${item.ativo !== false ? '● Ativo' : '○ Inativo'}
                    </span>
                </td>
                <td style="padding: 8px 10px; text-align: center;">
                    <button class="btn-danger" onclick="desvincularProdutoPromocao(${promocaoId}, ${item.produto_id})" 
                            title="Remover produto da promoção" style="padding: 3px 8px; font-size: 11px;">
                        ✕ Remover
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = htmlRows.join('');
}

// Remover produto da promoção
window.desvincularProdutoPromocao = async (promocaoId, produtoId) => {
    try {
        await window.PromocoesAPI.desvincularProduto(promocaoId, produtoId);
        mostrarNotificacao('Produto removido da promoção!', 'info');
        await carregarProdutosVinculadosModal(promocaoId);
    } catch (e) {
        mostrarNotificacao('Erro ao remover produto da promoção', 'error');
    }
};
