// js/estoque.js
// Controle de estoque

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    if (!verificarPermissao('estoque', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }
    
    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = {
        admin: '👑 Administrador',
        gerente: '📊 Gerente',
        vendedor: '💰 Vendedor',
        tecnico: '🔧 Técnico',
        basico: '👤 Básico'
    };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && typeof window.fazerLogout === 'function') {
        logoutBtn.addEventListener('click', window.fazerLogout);
    }
    
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    let produtos = [];
    let seriaisDisponiveis = [];
    
    function podeAjustarEstoque() {
        if (!usuario) return true;
        if (usuario.perfil === 'admin' || usuario.perfil === 'gerente' || usuario.perfil === 'vendedor') return true;
        return verificarPermissao('estoque', 'ajustar') || (typeof temPermissao === 'function' && temPermissao('estoque', 'ajustar'));
    }

    // =====================================================
    // FUNÇÕES DE GERENCIAMENTO DE MÚLTIPLOS LOTES E VALIDADES
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

    function obterLotesProduto(produto) {
        if (!produto) return [];
        // 1. Se o produto já possui array lotes (vindo do Supabase ou em memória)
        if (Array.isArray(produto.lotes) && produto.lotes.length > 0) {
            return produto.lotes.map(l => ({
                lote: String(l.lote || '').trim(),
                data_validade: l.data_validade || '',
                quantidade: (l.quantidade !== undefined && l.quantidade !== null) ? parseInt(l.quantidade) : 0,
                alerta_vencimento_dias: parseInt(l.alerta_vencimento_dias) || 30,
                criado_em: l.criado_em || new Date().toISOString()
            })).filter(l => l.lote || l.data_validade);
        }

        // 2. Se temos salvo no cache local (persistência imediata mesmo se coluna do banco ainda não existir)
        const local = obterLotesLocal(produto.id);
        if (Array.isArray(local) && local.length > 0) {
            const estoque = parseInt(produto.estoque_total || produto.estoque) || 0;
            const sincronizados = sincronizarLotesComEstoqueTotal(local, estoque);
            produto.lotes = sincronizados;
            return sincronizados;
        }

        // 3. Suporte e fallback para dados legados (produto.lote e produto.data_validade)
        if (produto.lote || produto.data_validade) {
            return [{
                lote: String(produto.lote || 'LOTE-PADRAO').trim(),
                data_validade: produto.data_validade || '',
                quantidade: parseInt(produto.estoque_total || produto.estoque) || 0,
                alerta_vencimento_dias: parseInt(produto.alerta_vencimento_dias) || 30,
                criado_em: produto.created_at || new Date().toISOString()
            }];
        }
        return [];
    }

    function calcularStatusValidade(dataValidade, alertaDias = 30) {
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
                badge: `<span class="badge-vencido" style="background:#f8d7da; color:#721c24; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700; display:inline-block;">🔴 Vencido (${Math.abs(diffDays)}d)</span>`
            };
        } else if (diffDays <= alertaDias) {
            return {
                dataFormatada,
                diffDays,
                status: 'alerta',
                badge: `<span class="badge-alerta-venc" style="background:#fff3cd; color:#856404; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:700; display:inline-block;">⚠️ Vence em ${diffDays}d</span>`
            };
        } else {
            return {
                dataFormatada,
                diffDays,
                status: 'normal',
                badge: `<span class="badge-normal" style="background:#d4edda; color:#155724; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; display:inline-block;">🟢 ${diffDays}d</span>`
            };
        }
    }

    // =====================================================
    // CARREGAR CATEGORIAS
    // =====================================================
    async function carregarCategorias() {
        try {
            const { data, error } = await supabaseClient
                .from('categorias')
                .select('*')
                .eq('ativo', true)
                .order('nome');
            
            if (error) throw error;
            
            const selectFiltro = document.getElementById('filtroCategoria');
            if (selectFiltro) {
                selectFiltro.innerHTML = '<option value="">Todas as Categorias</option>' +
                    (data || []).map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
            }

            const selectModal = document.getElementById('modalCategoriaSelect');
            if (selectModal) {
                selectModal.innerHTML = '<option value="">Selecione uma categoria...</option>' +
                    (data || []).map(c => `
                        <option value="${c.nome}" 
                                data-exige-imei="${c.exige_imei === true}" 
                                data-exige-serial="${c.exige_serial === true}" 
                                data-controla-lote="${c.controla_lote_validade || false}" 
                                data-aviso-vencimento="${c.aviso_vencimento_dias || 30}">
                            ${c.nome}
                        </option>
                    `).join('');
            }
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    async function carregarClientesAssinatura() {
        try {
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('id, nome, cpf_cnpj, telefone')
                .eq('tipo', 'cliente')
                .eq('ativo', true)
                .order('nome');
            
            if (error) throw error;
            const selectCliente = document.getElementById('plano_cliente_id');
            if (selectCliente) {
                selectCliente.innerHTML = '<option value="">Selecione o cliente da assinatura...</option>' +
                    (data || []).map(c => `<option value="${c.id}">${c.nome} ${c.cpf_cnpj ? `(${c.cpf_cnpj})` : ''}</option>`).join('');
            }
        } catch (err) {
            console.error('Erro ao carregar clientes para assinatura:', err);
        }
    }

    // =====================================================
    // CARREGAR PRODUTOS
    // =====================================================
    
    async function carregarProdutos() {
        try {
            const { data, error } = await supabaseClient
                .from('produtos')
                .select('*')
                .order('nome');
            
            if (error) throw error;
            produtos = (data || []).map(p => {
                // Se o Supabase não retornou lotes (coluna ainda não criada), mescla do cache local
                if (!Array.isArray(p.lotes) || p.lotes.length === 0) {
                    const local = obterLotesLocal(p.id);
                    if (Array.isArray(local) && local.length > 0) {
                        const estoque = parseInt(p.estoque_total || p.estoque) || 0;
                        p.lotes = sincronizarLotesComEstoqueTotal(local, estoque);
                    }
                } else {
                    // Atualiza cache local com os dados oficiais do Supabase
                    salvarLotesLocal(p.id, p.lotes);
                }
                return p;
            });
            renderizarTabela();
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            mostrarNotificacao('Erro ao carregar produtos', 'error');
        }
    }
    
    // =====================================================
    // RENDERIZAR TABELA
    // =====================================================
    
    function renderizarTabela() {
        const searchInput = document.getElementById('searchInput');
        const search = searchInput ? searchInput.value.toLowerCase() : '';
        
        const filtroTipo = document.getElementById('filtroTipo')?.value || '';
        const filtroCategoria = document.getElementById('filtroCategoria')?.value || '';
        const filtroLote = document.getElementById('filtroLote')?.value || '';
        const filtroSaldo = document.getElementById('filtroSaldo')?.value || '';
        const filtroStatus = document.getElementById('filtroStatus')?.value || '';
        
        const filtrados = produtos.filter(p => {
            // 0. Filtro Tipo (Produtos ou Serviços)
            const matchTipo = !filtroTipo || (filtroTipo === 'servico' ? p.tipo === 'servico' : p.tipo !== 'servico');

            // 1. Pesquisa por texto
            const matchSearch = (p.nome || '').toLowerCase().includes(search) || 
                                (p.codigo || '').toLowerCase().includes(search) ||
                                (p.marca || '').toLowerCase().includes(search) ||
                                (p.modelo || '').toLowerCase().includes(search) ||
                                (Array.isArray(p.codigos_barras) && p.codigos_barras.some(b => String(b || '').toLowerCase().includes(search)));
                                
            // 2. Filtro Categoria
            const matchCategoria = !filtroCategoria || p.categoria === filtroCategoria;
            
            // 3. Filtro Lote
            const temLote = !!(p.lote || p.data_validade) || (Array.isArray(p.lotes) && p.lotes.length > 0);
            const matchLote = !filtroLote || 
                             (filtroLote === 'com_lote' && temLote) || 
                             (filtroLote === 'sem_lote' && !temLote);
                             
            // 4. Filtro Saldo
            const estoque = p.estoque_total || p.estoque || 0;
            const matchSaldo = !filtroSaldo ||
                              (filtroSaldo === 'com_saldo' && estoque > 0) ||
                              (filtroSaldo === 'sem_saldo' && estoque <= 0);
                              
            // 5. Filtro Status
            const minimo = p.estoque_minimo || 5;
            let status = '';
            if (estoque <= 0) { 
                status = 'ESGOTADO'; 
            } else if (estoque < minimo) { 
                status = 'CRITICO'; 
            } else if (estoque < minimo * 2) { 
                status = 'BAIXO'; 
            } else { 
                status = 'NORMAL'; 
            }
            const matchStatus = !filtroStatus || status === filtroStatus;
            
            return matchTipo && matchSearch && matchCategoria && matchLote && matchSaldo && matchStatus;
        });
        
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center;">Nenhum produto ou serviço encontrado</td></tr>';
            return;
        }
        
        const podeEditar = (typeof verificarPermissao === 'function' ? verificarPermissao('produtos', 'editar') : true) || podeAjustarEstoque();
        const podeExcluir = typeof verificarPermissao === 'function' ? verificarPermissao('produtos', 'excluir') : true;
        
        tbody.innerHTML = filtrados.map(p => {
            const estoque = p.estoque_total || p.estoque || 0;
            const minimo = p.estoque_minimo || 5;
            let statusText = '', statusClass = '';
            
            if (estoque <= 0) { 
                statusText = 'ESGOTADO'; 
                statusClass = 'status-critico'; 
            } else if (estoque < minimo) { 
                statusText = 'CRÍTICO'; 
                statusClass = 'status-critico'; 
            } else if (estoque < minimo * 2) { 
                statusText = 'BAIXO'; 
                statusClass = 'status-baixo'; 
            } else { 
                statusText = 'NORMAL'; 
                statusClass = 'status-normal'; 
            }
            
            const lotesDoProduto = obterLotesProduto(p);
            let loteValidadeText = '-';
            if (lotesDoProduto.length > 0) {
                loteValidadeText = lotesDoProduto.map(l => {
                    const st = calcularStatusValidade(l.data_validade, l.alerta_vencimento_dias);
                    const qtd = (l.quantidade !== undefined && l.quantidade !== null) ? parseInt(l.quantidade) : null;
                    let qtdBadge = '';
                    if (qtd !== null) {
                        if (qtd === 0) {
                            qtdBadge = `<span style="background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; margin-left: 3px;">0 un (Esgotado)</span>`;
                        } else {
                            qtdBadge = `<span style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-left: 3px;">${qtd} un</span>`;
                        }
                    }
                    return `
                        <div style="margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px dashed #cbd5e1; line-height: 1.3; ${qtd === 0 ? 'opacity: 0.75;' : ''}">
                            📦 <strong>${l.lote || '-'}</strong> ${qtdBadge}<br>
                            <small>Val: <strong>${st.dataFormatada || '-'}</strong></small> ${st.badge}
                        </div>
                    `;
                }).join('');
            } else if (p.lote || p.data_validade) {
                const st = calcularStatusValidade(p.data_validade, p.alerta_vencimento_dias);
                loteValidadeText = `📦 <strong>${p.lote || '-'}</strong><br><small>Val: <strong>${st.dataFormatada || '-'}</strong></small> ${st.badge}`;
            }
            
            const custoFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor_compra || 0);
            const vendaFormatada = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor_venda || 0);

            const isServico = p.tipo === 'servico';
            const estoqueText = isServico ? '<span style="color:#0A4D68; font-weight:600;">Serviço</span>' : `${estoque} unid.`;
            const estoqueStyle = isServico ? 'color:#0A4D68' : (estoque < minimo ? 'color:#dc3545' : 'color:#28a745');
            const minimoText = isServico ? '-' : minimo;
            const statusLabelText = isServico ? 'SERVIÇO' : statusText;
            const statusLabelClass = isServico ? 'status-normal' : statusClass;

            return `
                <tr>
                    <td>${p.codigo || p.id}</td>
                    <td>
                        <strong>${p.nome}</strong>
                        ${p.marca ? `<br><small class="serial-badge">${p.marca}</small>` : ''}
                    </td>
                    <td>${p.modelo ? `<span style="font-weight: 500; color: #1e293b;">${p.modelo}</span>` : '<span style="color: #94a3b8;">-</span>'}</td>
                    <td>${p.categoria || '-'}</td>
                    <td>${loteValidadeText}</td>
                    <td class="col-custo">${custoFormatado}</td>
                    <td>${vendaFormatada}</td>
                    <td style="font-weight:bold; ${estoqueStyle}">${estoqueText}</td>
                    <td>${minimoText}</td>
                    <td><span class="status-estoque ${statusLabelClass}">${statusLabelText}</span></td>
                    <td class="table-actions" style="white-space: nowrap;">
                        ${podeEditar ? `
                            <button class="btn-primary" onclick="editarProduto(${p.id})" title="Editar Cadastro Completo" style="padding: 6px 10px; font-size: 12px; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; border-radius: 4px; background: #2563eb; color: white; border: none;">
                                ✏️ Editar
                            </button>
                        ` : ''}
                        ${!isServico ? `
                            <button class="btn-info" onclick="ajustarEstoque(${p.id})" title="Ajuste de Saldo de Estoque" style="padding: 6px 10px; font-size: 12px; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; border-radius: 4px; background: #0284c7; color: white; border: none;">
                                ⚖️ Ajustar
                            </button>
                        ` : ''}
                        <button class="btn-secondary" onclick="verHistorico(${p.id})" title="Histórico de movimento" style="padding: 6px 10px; font-size: 12px; margin-right: 4px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; border-radius: 4px; background: #64748B; color: white; border: 1px solid #475569;">
                            📜 Histórico
                        </button>
                        ${podeExcluir ? `
                            <button class="btn-danger" onclick="excluirProduto(${p.id})" title="Excluir Item" style="padding: 6px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; border-radius: 4px; background: #dc2626; color: white; border: none;">
                                🗑️
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // VERIFICAR SE PRODUTO EXIGE SERIAL
    // =====================================================
    
    async function obterControleCategoria(produto) {
        try {
            const { data: categoria } = await supabaseClient
                .from('categorias')
                .select('exige_serial, exige_imei, controla_lote_validade, aviso_vencimento_dias')
                .eq('nome', produto.categoria)
                .maybeSingle();
            
            const exigeSerial = categoria?.exige_serial === true;
            const exigeIMEI = categoria?.exige_imei === true || produto.categoria === 'Celular';
            
            const { count } = await supabaseClient
                .from('produtos_seriais')
                .select('*', { count: 'exact', head: true })
                .eq('produto_id', produto.id);
            
            const temSeriais = (count || 0) > 0;
            const controlaLote = categoria?.controla_lote_validade === true || 
                                 !!(produto.lote || produto.data_validade) || 
                                 (Array.isArray(produto.lotes) && produto.lotes.length > 0) || 
                                 (obterLotesLocal(produto.id)?.length > 0);

            return {
                exigeSerial: exigeSerial,
                exigeIMEI: exigeIMEI,
                controlaSerial: exigeSerial || exigeIMEI || temSeriais,
                controlaLote: controlaLote,
                avisoVencimento: categoria?.aviso_vencimento_dias || 30
            };
        } catch (error) {
            const controlaLote = !!(produto.lote || produto.data_validade) || 
                                 (Array.isArray(produto.lotes) && produto.lotes.length > 0) || 
                                 (obterLotesLocal(produto.id)?.length > 0);
            return { exigeSerial: false, exigeIMEI: false, controlaSerial: false, controlaLote: controlaLote, avisoVencimento: 30 };
        }
    }
    
    // =====================================================
    // GERAR CAMPOS DE SERIAL DINÂMICOS
    // =====================================================
    
    function gerarCamposSerial(quantidade, exigeSerial = false, exigeIMEI = false) {
        const container = document.getElementById('seriaisDinamicos');
        if (!container) return;
        
        if (quantidade <= 0) {
            container.innerHTML = '';
            return;
        }
        
        let badgeTitulo = '🔢 Número de Série (OBRIGATÓRIO)';
        if (exigeSerial && exigeIMEI) {
            badgeTitulo = '🔢📱 Número de Série e IMEI (OBRIGATÓRIO)';
        } else if (exigeIMEI) {
            badgeTitulo = '📱 IMEI Obrigatório (Série Opcional)';
        }
        
        let html = `
            <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                <div style="font-weight: 600; margin-bottom: 10px; color: #dc3545;">
                    ${badgeTitulo} - ${quantidade} item(ns)
                </div>
        `;
        
        for (let i = 0; i < quantidade; i++) {
            html += `
                <div class="serial-item" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; padding: 8px; background: white; border-radius: 6px; border: 1px solid #e9ecef;">
                    <input type="text" 
                           placeholder="Nº Série #${i + 1} ${exigeSerial ? '*' : '(opcional)'}" 
                           class="serial-numero ${exigeSerial ? 'required' : ''}" 
                           data-index="${i}"
                           ${exigeSerial ? 'required style="padding: 8px; border: 1px solid #dc3545; border-radius: 4px; font-family: monospace;"' : 'style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;"'}>
                    <input type="text" 
                           placeholder="IMEI #${i + 1} ${exigeIMEI ? '*' : '(opcional)'}" 
                           class="serial-imei ${exigeIMEI ? 'required' : ''}" 
                           data-index="${i}"
                           ${exigeIMEI ? 'required style="padding: 8px; border: 1px solid #dc3545; border-radius: 4px; font-family: monospace;"' : 'style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;"'}>
                </div>
            `;
        }
        
        let helpText = 'O número de série é OBRIGATÓRIO para cada unidade';
        if (exigeSerial && exigeIMEI) {
            helpText = 'Número de série e IMEI são obrigatórios para cada unidade';
        } else if (exigeIMEI) {
            helpText = 'O IMEI é obrigatório para cada unidade (Número de série opcional)';
        }
        
        html += `
                <div style="margin-top: 8px; font-size: 12px; color: #dc3545;">
                    ⚠️ ${helpText}
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        document.querySelectorAll('.serial-numero').forEach(input => {
            input.addEventListener('input', function() {
                if (this.value.trim() !== '') {
                    this.style.border = '1px solid #28a745';
                } else if (exigeSerial) {
                    this.style.border = '1px solid #dc3545';
                } else {
                    this.style.border = '1px solid #ced4da';
                }
            });
        });
        
        document.querySelectorAll('.serial-imei').forEach(input => {
            input.addEventListener('input', function() {
                if (this.value.trim() !== '') {
                    this.style.border = '1px solid #28a745';
                } else if (exigeIMEI) {
                    this.style.border = '1px solid #dc3545';
                } else {
                    this.style.border = '1px solid #ced4da';
                }
            });
        });
    }
    
    function coletarSeriais() {
        const seriais = [];
        const camposNumero = document.querySelectorAll('.serial-numero');
        const camposIMEI = document.querySelectorAll('.serial-imei');
        
        for (let i = 0; i < camposNumero.length; i++) {
            const numero = camposNumero[i].value.trim();
            const imei = camposIMEI[i]?.value.trim() || '';
            if (numero || imei) {
                seriais.push({
                    numero_serie: numero || null,
                    imei: imei || null
                });
            }
        }
        return seriais;
    }
    
    function validarSeriais(quantidade, exigeSerial = false, exigeIMEI = false) {
        const camposNumero = document.querySelectorAll('.serial-numero');
        const camposIMEI = document.querySelectorAll('.serial-imei');
        let todosPreenchidos = true;
        let erros = [];
        
        if (exigeSerial) {
            for (let i = 0; i < camposNumero.length; i++) {
                const valor = camposNumero[i].value.trim();
                if (valor === '') {
                    todosPreenchidos = false;
                    erros.push(`Série #${i + 1}`);
                    camposNumero[i].style.border = '2px solid #dc3545';
                } else {
                    camposNumero[i].style.border = '1px solid #28a745';
                }
            }
        }
        
        if (exigeIMEI) {
            for (let i = 0; i < camposIMEI.length; i++) {
                const valor = camposIMEI[i].value.trim();
                if (valor === '') {
                    todosPreenchidos = false;
                    erros.push(`IMEI #${i + 1}`);
                    camposIMEI[i].style.border = '2px solid #dc3545';
                } else {
                    camposIMEI[i].style.border = '1px solid #28a745';
                }
            }
        }
        
        for (let i = 0; i < camposNumero.length; i++) {
            const valNum = camposNumero[i].value.trim();
            const valImei = camposIMEI[i]?.value.trim() || '';
            if (!valNum && !valImei) {
                camposNumero[i].style.border = '2px solid #dc3545';
                if (camposIMEI[i]) camposIMEI[i].style.border = '2px solid #dc3545';
                mostrarNotificacao(`Preencha ao menos o Número de Série ou o IMEI no item #${i + 1}!`, 'error');
                return false;
            }
        }
        
        if (!todosPreenchidos) {
            mostrarNotificacao(`Preencha todos os campos obrigatórios: ${erros.join(', ')}`, 'error');
            return false;
        }
        return true;
    }
    
    // =====================================================
    // AJUSTAR ESTOQUE
    // =====================================================
    
    async function ajustarEstoque(id) {
        if (!podeAjustarEstoque()) {
            mostrarNotificacao('Você não tem permissão para realizar o ajuste de saldo!', 'error');
            return;
        }
        
        const produto = produtos.find(p => p.id == id);
        if (!produto) {
            mostrarNotificacao('Produto não encontrado!', 'warning');
            return;
        }
        
        document.getElementById('produtoId').value = produto.id;
        document.getElementById('produtoNome').value = produto.nome + (produto.modelo ? ` - Modelo: ${produto.modelo}` : '');
        const estoqueAtual = produto.estoque_total || produto.estoque || 0;
        document.getElementById('estoqueAtual').value = estoqueAtual;
        document.getElementById('quantidade').value = '1';
        document.getElementById('tipo').value = 'entrada';
        
        const inputNovoSaldo = document.getElementById('novoSaldo');
        if (inputNovoSaldo) {
            inputNovoSaldo.value = estoqueAtual + 1;
        }
        document.getElementById('motivo').value = '';
        
        document.getElementById('seriaisDinamicos').innerHTML = '';
        document.getElementById('serialContainer').style.display = 'none';
        document.getElementById('serialContainer').innerHTML = '';
        
        // Configurar Lote e Validade
        const controle = await obterControleCategoria(produto);
        const containerLote = document.getElementById('containerLoteValidade');
        if (containerLote) {
            if (controle.controlaLote) {
                containerLote.style.display = 'block';
                configurarInterfaceLotes(produto, 'entrada');
            } else {
                containerLote.style.display = 'none';
            }
        }
        
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'flex';
        }
        await carregarInterfaceSerial();
    }
    window.ajustarEstoque = ajustarEstoque;

    // =====================================================
    // CONFIGURAR INTERFACE DE LOTES NO MODAL
    // =====================================================
    function configurarInterfaceLotes(produto, tipo) {
        const containerLote = document.getElementById('containerLoteValidade');
        if (!containerLote) return;
        
        const lotes = obterLotesProduto(produto);
        const badgeQtd = document.getElementById('badgeQtdLotes');
        if (badgeQtd) {
            badgeQtd.textContent = `${lotes.length} lote(s)`;
        }
        
        // 1. Renderizar lista de lotes atuais cadastrados
        const listaLotesDiv = document.getElementById('listaLotesAtuais');
        if (listaLotesDiv) {
            if (lotes.length === 0) {
                listaLotesDiv.innerHTML = `
                    <div style="font-size: 12px; color: #92400e; font-style: italic; background: #fff; padding: 8px 12px; border-radius: 6px; border: 1px dashed #fde68a;">
                        📦 Nenhum lote anterior cadastrado para este item. Preencha os dados do primeiro lote abaixo.
                    </div>
                `;
            } else {
                const totalEmLotes = lotes.reduce((acc, cur) => acc + (parseInt(cur.quantidade) || 0), 0);
                listaLotesDiv.innerHTML = `
                    <div style="background: white; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px;">
                        <div style="font-size: 11px; font-weight: 700; color: #78350f; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                            <span>📦 Lotes Ativos Atuais:</span>
                            <span style="background: #fef3c7; padding: 1px 6px; border-radius: 4px;">Total: ${totalEmLotes} un</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto;">
                            ${lotes.map(l => {
                                const st = calcularStatusValidade(l.data_validade, l.alerta_vencimento_dias);
                                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: #fffbeb; border-radius: 4px; font-size: 12px; border: 1px solid #fef3c7;">
                                        <div>
                                            <strong style="color: #1e293b;">${l.lote}</strong> 
                                            <span style="color: #64748b; font-size: 11px; font-weight: 600;">(${l.quantidade || 0} un)</span>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <span style="font-family: monospace; font-size: 11px;">Val: ${st.dataFormatada || '-'}</span>
                                            ${st.badge}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        }
        
        const secaoEntrada = document.getElementById('secaoLoteEntrada');
        const secaoSaida = document.getElementById('secaoLoteSaida');
        
        if (tipo === 'entrada') {
            if (secaoEntrada) secaoEntrada.style.display = 'block';
            if (secaoSaida) secaoSaida.style.display = 'none';
            
            const radioNovo = document.getElementById('radioNovoLote');
            const radioExistente = document.getElementById('radioLoteExistente');
            const containerNovo = document.getElementById('containerCamposNovoLote');
            const containerExistente = document.getElementById('containerCamposLoteExistente');
            const selectExistente = document.getElementById('selectLoteExistente');

            if (radioNovo && !radioNovo.dataset.listenerAttached) {
                radioNovo.dataset.listenerAttached = 'true';
                radioNovo.addEventListener('change', () => {
                    if (radioNovo.checked) {
                        if (containerNovo) containerNovo.style.display = 'block';
                        if (containerExistente) containerExistente.style.display = 'none';
                    }
                });
            }
            if (radioExistente && !radioExistente.dataset.listenerAttached) {
                radioExistente.dataset.listenerAttached = 'true';
                radioExistente.addEventListener('change', () => {
                    if (radioExistente.checked) {
                        if (containerNovo) containerNovo.style.display = 'none';
                        if (containerExistente) containerExistente.style.display = 'block';
                    }
                });
            }
            
            if (lotes.length === 0) {
                if (radioNovo) radioNovo.checked = true;
                if (radioExistente && radioExistente.parentElement) radioExistente.parentElement.style.display = 'none';
                if (containerNovo) containerNovo.style.display = 'block';
                if (containerExistente) containerExistente.style.display = 'none';
            } else {
                if (radioExistente && radioExistente.parentElement) radioExistente.parentElement.style.display = 'inline-flex';
                if (radioNovo) radioNovo.checked = true; // Padrão: adicionar novo lote mantendo os anteriores
                if (containerNovo) containerNovo.style.display = 'block';
                if (containerExistente) containerExistente.style.display = 'none';
                if (selectExistente) {
                    selectExistente.innerHTML = lotes.map(l => {
                        const st = calcularStatusValidade(l.data_validade, l.alerta_vencimento_dias);
                        return `<option value="${l.lote}">${l.lote} (Val: ${st.dataFormatada || '-'} | Saldo: ${l.quantidade || 0} un)</option>`;
                    }).join('');
                }
            }
            
            const inputLote = document.getElementById('ajusteLote');
            const inputValidade = document.getElementById('ajusteDataValidade');
            const inputAlerta = document.getElementById('ajusteAlertaDias');
            if (inputLote) inputLote.value = '';
            if (inputValidade) inputValidade.value = '';
            if (inputAlerta) inputAlerta.value = 30;
        } else {
            // Saída de estoque
            if (secaoEntrada) secaoEntrada.style.display = 'none';
            if (secaoSaida) secaoSaida.style.display = 'block';
            
            const selectSaida = document.getElementById('selectLoteSaida');
            if (selectSaida) {
                // Ordenar por FEFO (First Expired, First Out)
                const lotesOrdenados = [...lotes].sort((a, b) => {
                    if (!a.data_validade) return 1;
                    if (!b.data_validade) return -1;
                    return new Date(a.data_validade) - new Date(b.data_validade);
                });
                
                selectSaida.innerHTML = lotesOrdenados.map((l, idx) => {
                    const st = calcularStatusValidade(l.data_validade, l.alerta_vencimento_dias);
                    const tagSugerido = idx === 0 ? ' ⭐ [Sugerido - Vence Primeiro]' : '';
                    return `<option value="${l.lote}">${l.lote} (Val: ${st.dataFormatada || '-'} | Saldo: ${l.quantidade || 0} un)${tagSugerido}</option>`;
                }).join('');
            }
        }
    }
    
    // =====================================================
    // CARREGAR INTERFACE DE SERIAL
    // =====================================================
    
    async function carregarInterfaceSerial() {
        const tipo = document.getElementById('tipo').value;
        const produtoId = document.getElementById('produtoId').value;
        const produto = produtos.find(p => p.id == produtoId);
        const quantidade = parseInt(document.getElementById('quantidade').value) || 1;
        const controle = await obterControleCategoria(produto);
        
        const serialContainer = document.getElementById('serialContainer');
        const seriaisDinamicos = document.getElementById('seriaisDinamicos');
        
        if (!controle.controlaSerial) {
            serialContainer.style.display = 'none';
            seriaisDinamicos.innerHTML = '';
            return;
        }
        
        serialContainer.style.display = 'block';
        
        if (tipo === 'entrada') {
            gerarCamposSerial(quantidade, controle.exigeSerial, controle.exigeIMEI);
            seriaisDinamicos.style.display = 'block';
            
            document.getElementById('quantidade').addEventListener('change', function() {
                const novaQuantidade = parseInt(this.value) || 1;
                gerarCamposSerial(novaQuantidade, controle.exigeSerial, controle.exigeIMEI);
            });
        } else {
            seriaisDinamicos.style.display = 'none';
            seriaisDinamicos.innerHTML = '';
            
            const { data: seriais } = await supabaseClient
                .from('produtos_seriais')
                .select('*')
                .eq('produto_id', produtoId)
                .eq('status', 'disponivel');
            
            seriaisDisponiveis = seriais || [];
            
            if (seriaisDisponiveis.length === 0) {
                serialContainer.innerHTML = `
                    <div style="background: #f8d7da; border: 1px solid #dc3545; padding: 15px; border-radius: 8px; margin-top: 15px;">
                        <div style="color: #721c24; text-align: center;">
                            ⚠️ Nenhum número de série disponível para este produto!<br>
                            <small>Não é possível dar saída sem seriais disponíveis.</small>
                        </div>
                    </div>
                `;
                return;
            }
            
            serialContainer.innerHTML = `
                <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                    <label style="font-weight: bold; display: block; margin-bottom: 10px; color: #dc3545;">
                        🔢 Selecione os Números de Série para SAÍDA (OBRIGATÓRIO)
                    </label>
                    <div style="max-height: 200px; overflow-y: auto; background: white; border-radius: 6px; border: 1px solid #dee2e6;">
                        ${seriaisDisponiveis.map(s => `
                            <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; align-items: center; cursor: pointer;" 
                                 onclick="toggleCheckbox(this, ${s.id})">
                                <input type="checkbox" class="serial-checkbox" value="${s.id}" data-serial="${s.numero_serie}" data-imei="${s.imei || ''}" style="width: 18px; height: 18px; margin-right: 10px;">
                                <div>
                                    <div style="font-weight: 600; font-family: monospace;">📦 ${s.numero_serie}</div>
                                    ${s.imei ? `<div style="font-size: 12px; color: #666;">IMEI: ${s.imei}</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top: 10px; font-size: 12px; color: #dc3545;">
                        ⚠️ Selecione ${quantidade} serial(is) para dar saída (quantidade deve corresponder)
                    </div>
                </div>
            `;
        }
    }
    
    window.toggleCheckbox = (element, id) => {
        const checkbox = element.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
        }
    };
    
    const inputNovoSaldo = document.getElementById('novoSaldo');
    const inputQuantidade = document.getElementById('quantidade');
    const selectTipo = document.getElementById('tipo');
    const inputEstoqueAtual = document.getElementById('estoqueAtual');

    async function atualizarInterfaceLotesPorTipo() {
        const id = document.getElementById('produtoId')?.value;
        const produto = produtos.find(p => p.id == id);
        if (produto) {
            const controle = await obterControleCategoria(produto);
            if (controle.controlaLote) {
                configurarInterfaceLotes(produto, selectTipo.value);
            }
        }
    }

    // Ao digitar diretamente no campo Novo Saldo Desejado
    inputNovoSaldo?.addEventListener('input', () => {
        const estAtual = parseInt(inputEstoqueAtual.value) || 0;
        const valStr = inputNovoSaldo.value.trim();
        if (valStr === '') return;
        const novo = parseInt(valStr) || 0;
        const diff = novo - estAtual;

        const tipoAnterior = selectTipo.value;
        if (diff >= 0) {
            selectTipo.value = 'entrada';
            inputQuantidade.value = diff;
        } else {
            selectTipo.value = 'saida';
            inputQuantidade.value = Math.abs(diff);
        }
        carregarInterfaceSerial();
        if (selectTipo.value !== tipoAnterior) {
            atualizarInterfaceLotesPorTipo();
        }
    });

    // Ao alterar a Quantidade a Movimentar
    inputQuantidade?.addEventListener('input', () => {
        const estAtual = parseInt(inputEstoqueAtual.value) || 0;
        const tipo = selectTipo.value;
        const qtd = parseInt(inputQuantidade.value) || 0;
        const novo = tipo === 'entrada' ? (estAtual + qtd) : (estAtual - qtd);
        if (inputNovoSaldo) inputNovoSaldo.value = Math.max(0, novo);
        if (tipo === 'entrada') carregarInterfaceSerial();
    });

    inputQuantidade?.addEventListener('change', () => {
        const estAtual = parseInt(inputEstoqueAtual.value) || 0;
        const tipo = selectTipo.value;
        const qtd = parseInt(inputQuantidade.value) || 0;
        const novo = tipo === 'entrada' ? (estAtual + qtd) : (estAtual - qtd);
        if (inputNovoSaldo) inputNovoSaldo.value = Math.max(0, novo);
        carregarInterfaceSerial();
    });

    // Ao alterar o Tipo (Entrada ou Saída)
    selectTipo?.addEventListener('change', () => {
        const estAtual = parseInt(inputEstoqueAtual.value) || 0;
        const tipo = selectTipo.value;
        const qtd = parseInt(inputQuantidade.value) || 0;
        const novo = tipo === 'entrada' ? (estAtual + qtd) : (estAtual - qtd);
        if (inputNovoSaldo) inputNovoSaldo.value = Math.max(0, novo);
        carregarInterfaceSerial();
        atualizarInterfaceLotesPorTipo();
    });
    
    // =====================================================
    // HISTÓRICO
    // =====================================================
    
    async function verHistorico(id) {
        const produto = produtos.find(p => p.id === id);
        if (!produto) return;
        
        try {
            const { data, error } = await supabaseClient
                .from('movimentos_estoque')
                .select('*')
                .eq('produto_id', id)
                .order('data', { ascending: false })
                .limit(20);
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                mostrarNotificacao('Nenhum movimento encontrado para este produto', 'info');
                return;
            }
            
            let historicoHtml = '<div style="max-height: 400px; overflow-y: auto;">';
            historicoHtml += '<table style="width:100%; border-collapse:collapse;">';
            historicoHtml += '<thead><tr style="background:#f0f0f0;"><th>Data</th><th>Tipo</th><th>Quantidade</th><th>Serial</th><th>Estoque Ant.</th><th>Estoque Novo</th><th>Motivo</th></tr></thead><tbody>';
            
            for (const mov of data) {
                let serialInfo = '-';
                if (mov.motivo) {
                    const match = mov.motivo.match(/Serial:\s*([^\s|]+)/);
                    if (match) {
                        serialInfo = match[1];
                    }
                }
                
                const tipoIcon = mov.tipo === 'entrada' ? '📥' : mov.tipo === 'saida' ? '📤' : '✏️';
                const tipoText = mov.tipo === 'entrada' ? 'Entrada' : mov.tipo === 'saida' ? 'Saída' : 'Ajuste';
                const tipoColor = mov.tipo === 'entrada' ? 'green' : mov.tipo === 'saida' ? 'red' : 'orange';
                
                historicoHtml += `
                    <tr style="border-bottom:1px solid #ddd;">
                        <td style="padding:8px;">${new Date(mov.data).toLocaleString('pt-BR')}</td>
                        <td style="padding:8px; color:${tipoColor};">${tipoIcon} ${tipoText}</td>
                        <td style="padding:8px; font-weight:bold;">${mov.quantidade}</td>
                        <td style="padding:8px;"><code>${serialInfo}</code></td>
                        <td style="padding:8px;">${mov.quantidade_anterior || '-'}</td>
                        <td style="padding:8px;">${mov.quantidade_nova || '-'}</td>
                        <td style="padding:8px;">${mov.motivo || '-'}</td>
                    </tr>
                `;
            }
            
            historicoHtml += '</tbody></table></div>';
            
            const modalHistorico = document.createElement('div');
            modalHistorico.className = 'modal';
            modalHistorico.style.display = 'flex';
            modalHistorico.innerHTML = `
                <div class="modal-content" style="max-width: 900px;">
                    <div class="modal-header">
                        <h2>Histórico de Movimentações - ${produto.nome}${produto.modelo ? ` (${produto.modelo})` : ''}</h2>
                        <span class="close-historico" style="cursor:pointer;">&times;</span>
                    </div>
                    <div class="modal-body">
                        ${historicoHtml}
                    </div>
                    <div class="modal-footer">
                        <button class="btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">Fechar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalHistorico);
            
            modalHistorico.querySelector('.close-historico').addEventListener('click', () => {
                modalHistorico.remove();
            });
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
            mostrarNotificacao('Erro ao carregar histórico', 'error');
        }
    };
    
    // =====================================================
    // SALVAR AJUSTE
    // =====================================================
    
    async function salvarAjuste() {
        if (!podeAjustarEstoque()) {
            mostrarNotificacao('Você não tem permissão para realizar o ajuste de saldo!', 'error');
            return;
        }
        
        const id = document.getElementById('produtoId').value;
        const tipo = document.getElementById('tipo').value;
        const quantidade = parseInt(document.getElementById('quantidade').value);
        const motivo = document.getElementById('motivo').value;
        const produto = produtos.find(p => p.id == id);
        
        if (!produto) {
            mostrarNotificacao('Produto não encontrado!', 'error');
            return;
        }

        if (isNaN(quantidade) || quantidade <= 0) {
            mostrarNotificacao('A quantidade a movimentar deve ser maior que zero (informe um novo saldo diferente do atual)!', 'error');
            return;
        }
        
        const estoqueAtual = produto.estoque_total || produto.estoque || 0;
        const controle = await obterControleCategoria(produto);
        
        // 1. Validação de Lote e Validade
        let lote = '';
        let dataValidade = '';
        let alertaDias = 30;
        let lotesAtualizados = null;
        let loteAtivoFEFO = null;
        let loteMovimentado = '';

        if (controle.controlaLote) {
            let lotes = obterLotesProduto(produto);

            if (tipo === 'entrada') {
                const modoLote = document.querySelector('input[name="modoLote"]:checked')?.value || 'novo';
                if (modoLote === 'novo') {
                    lote = document.getElementById('ajusteLote')?.value.trim() || '';
                    dataValidade = document.getElementById('ajusteDataValidade')?.value || '';
                    alertaDias = parseInt(document.getElementById('ajusteAlertaDias')?.value) || (controle.avisoVencimento || 30);
                    loteMovimentado = lote;

                    if (!lote) {
                        mostrarNotificacao('⚠️ Para produtos com controle de lote, o campo Novo Lote é obrigatório!', 'error');
                        document.getElementById('ajusteLote')?.focus();
                        return;
                    }
                    if (!dataValidade) {
                        mostrarNotificacao('⚠️ Para produtos com controle de validade, a Nova Data de Validade é obrigatória!', 'error');
                        document.getElementById('ajusteDataValidade')?.focus();
                        return;
                    }

                    // Se já existir lote com o mesmo código, soma a quantidade e atualiza validade se fornecida
                    const idxExistente = lotes.findIndex(l => (l.lote || '').trim().toLowerCase() === lote.toLowerCase());
                    if (idxExistente >= 0) {
                        lotes[idxExistente].quantidade = (parseInt(lotes[idxExistente].quantidade) || 0) + quantidade;
                        lotes[idxExistente].data_validade = dataValidade;
                        lotes[idxExistente].alerta_vencimento_dias = alertaDias;
                    } else {
                        // Adiciona novo lote mantendo os anteriores (múltiplos lotes ativos)
                        lotes.push({
                            lote: lote,
                            data_validade: dataValidade,
                            quantidade: quantidade,
                            alerta_vencimento_dias: alertaDias,
                            criado_em: new Date().toISOString()
                        });
                    }
                } else {
                    // Modo lote existente
                    const loteExistente = document.getElementById('selectLoteExistente')?.value;
                    loteMovimentado = loteExistente;
                    if (!loteExistente) {
                        mostrarNotificacao('⚠️ Selecione um lote existente para somar a quantidade!', 'error');
                        return;
                    }
                    const idxExistente = lotes.findIndex(l => l.lote === loteExistente);
                    if (idxExistente >= 0) {
                        lotes[idxExistente].quantidade = (parseInt(lotes[idxExistente].quantidade) || 0) + quantidade;
                        lote = lotes[idxExistente].lote;
                        dataValidade = lotes[idxExistente].data_validade;
                        alertaDias = lotes[idxExistente].alerta_vencimento_dias || 30;
                    } else {
                        lote = loteExistente;
                        lotes.push({
                            lote: loteExistente,
                            data_validade: '',
                            quantidade: quantidade,
                            alerta_vencimento_dias: 30
                        });
                    }
                }
            } else if (tipo === 'saida') {
                if (lotes.length > 0) {
                    const loteSaida = document.getElementById('selectLoteSaida')?.value;
                    loteMovimentado = loteSaida;
                    if (!loteSaida) {
                        mostrarNotificacao('⚠️ Selecione de qual lote será realizada a saída!', 'error');
                        return;
                    }
                    const idxLote = lotes.findIndex(l => l.lote === loteSaida);
                    if (idxLote >= 0) {
                        const saldoDisponivelLote = parseInt(lotes[idxLote].quantidade) || 0;
                        if (saldoDisponivelLote < quantidade) {
                            mostrarNotificacao(`⚠️ O lote "${loteSaida}" possui apenas ${saldoDisponivelLote} un em estoque. Saldo insuficiente neste lote!`, 'error');
                            return;
                        }
                        lotes[idxLote].quantidade = saldoDisponivelLote - quantidade;
                        lote = lotes[idxLote].lote;
                        dataValidade = lotes[idxLote].data_validade;
                        alertaDias = lotes[idxLote].alerta_vencimento_dias || 30;
                    } else {
                        lote = loteSaida;
                    }
                }
            }

            // Ordenar lotes por FEFO (First Expired First Out)
            lotes.sort((a, b) => {
                if (!a.data_validade) return 1;
                if (!b.data_validade) return -1;
                return new Date(a.data_validade) - new Date(b.data_validade);
            });
            lotesAtualizados = lotes;

            // Salvar no cache local imediatamente
            salvarLotesLocal(id, lotesAtualizados);

            // Identificar o lote ativo FEFO (com saldo > 0) para sincronizar campos legados
            loteAtivoFEFO = lotes.find(l => (parseInt(l.quantidade) || 0) > 0) || lotes[0];
            if (loteAtivoFEFO) {
                lote = loteAtivoFEFO.lote;
                dataValidade = loteAtivoFEFO.data_validade;
                alertaDias = loteAtivoFEFO.alerta_vencimento_dias || alertaDias;
            }
        }

        // 2. Validação de Seriais para Entrada
        if (tipo === 'entrada' && controle.controlaSerial) {
            const seriais = coletarSeriais();
            
            if (seriais.length !== quantidade) {
                mostrarNotificacao(`Preencha os dados das ${quantidade} unidades!`, 'error');
                return;
            }
            
            if (!validarSeriais(quantidade, controle.exigeSerial, controle.exigeIMEI)) return;
            
            const numeros = seriais.map(s => s.numero_serie).filter(n => n);
            const duplicados = numeros.filter((item, index) => numeros.indexOf(item) !== index);
            if (duplicados.length > 0) {
                mostrarNotificacao(`Números de série duplicados: ${duplicados.join(', ')}`, 'error');
                return;
            }
            
            for (const serial of seriais) {
                if (serial.numero_serie) {
                    const { data: existente } = await supabaseClient
                        .from('produtos_seriais')
                        .select('id')
                        .eq('numero_serie', serial.numero_serie)
                        .maybeSingle();
                    
                    if (existente) {
                        mostrarNotificacao(`Número de série já cadastrado: ${serial.numero_serie}`, 'error');
                        return;
                    }
                }
            }
        }
        
        // 3. Validação de Seriais para Saída
        let seriaisSelecionados = [];
        if (tipo === 'saida' && controle.controlaSerial) {
            const checkboxes = document.querySelectorAll('.serial-checkbox:checked');
            seriaisSelecionados = Array.from(checkboxes).map(cb => ({
                id: parseInt(cb.value),
                serial: cb.getAttribute('data-serial'),
                imei: cb.getAttribute('data-imei')
            }));
            
            if (seriaisSelecionados.length === 0) {
                mostrarNotificacao('Selecione pelo menos um item (Serial/IMEI) para dar saída!', 'error');
                return;
            }
            
            if (seriaisSelecionados.length !== quantidade) {
                mostrarNotificacao(`A quantidade selecionada (${seriaisSelecionados.length}) não corresponde à quantidade informada (${quantidade})!`, 'error');
                return;
            }
        }
        
        // 4. Verificação de saldo para produtos sem serial
        if (tipo === 'saida' && !controle.controlaSerial && estoqueAtual < quantidade) {
            mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoqueAtual}`, 'error');
            return;
        }
        
        const novoEstoque = tipo === 'entrada' 
            ? estoqueAtual + quantidade 
            : estoqueAtual - quantidade;
        
        const btnSalvar = document.getElementById('btnSalvar');
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.textContent = 'Salvando...';
        }

        try {
            const updateData = {
                estoque_total: novoEstoque,
                updated_at: new Date().toISOString()
            };

            if (controle.controlaLote) {
                if (lotesAtualizados) {
                    updateData.lotes = lotesAtualizados;
                }
                if (loteAtivoFEFO) {
                    updateData.lote = loteAtivoFEFO.lote || null;
                    updateData.data_validade = loteAtivoFEFO.data_validade || null;
                    updateData.alerta_vencimento_dias = loteAtivoFEFO.alerta_vencimento_dias || alertaDias;
                } else {
                    if (lote) updateData.lote = lote;
                    if (dataValidade) updateData.data_validade = dataValidade;
                    updateData.alerta_vencimento_dias = alertaDias;
                }
            }
            
            try {
                updateData.ultima_movimentacao = new Date().toISOString();
            } catch(e) {}
            
            let updateResult = await supabaseClient
                .from('produtos')
                .update(updateData)
                .eq('id', id);
            
            // Fallback gracioso se a coluna 'lotes' ainda não existir no schema Supabase
            if (updateResult.error && (updateResult.error.code === '42703' || String(updateResult.error.message).includes('lotes'))) {
                console.warn('⚠️ Coluna "lotes" ainda não criada no banco Supabase. Aplicando fallback com campos legados lote/data_validade...');
                delete updateData.lotes;
                updateResult = await supabaseClient
                    .from('produtos')
                    .update(updateData)
                    .eq('id', id);
            }
            
            if (updateResult.error) throw updateResult.error;
            
            // Entrada com seriais
            if (tipo === 'entrada' && controle.controlaSerial) {
                const seriais = coletarSeriais();
                
                for (const serial of seriais) {
                    const { error: insertSerialError } = await supabaseClient
                        .from('produtos_seriais')
                        .insert([{
                            produto_id: id,
                            numero_serie: serial.numero_serie || null,
                            serial: serial.numero_serie || null,
                            imei: serial.imei || null,
                            status: 'disponivel',
                            disponivel: true,
                            data_entrada: new Date().toISOString(),
                            valor_compra: produto.valor_compra,
                            valor_venda: produto.valor_venda,
                            observacao: `Entrada manual - ${new Date().toLocaleDateString('pt-BR')}${lote ? ` (Lote: ${lote})` : ''}`
                        }]);
                    
                    if (insertSerialError) throw insertSerialError;
                }
                
                await supabaseClient
                    .from('movimentos_estoque')
                    .insert([{
                        produto_id: id,
                        tipo: tipo,
                        quantidade: quantidade,
                        quantidade_anterior: estoqueAtual,
                        quantidade_nova: novoEstoque,
                        motivo: motivo || `Entrada de ${quantidade} unidade(s) com serial(is)${lote ? ` - Lote: ${lote}` : ''}`,
                        data: new Date().toISOString(),
                        usuario_id: usuario?.id || null
                    }]);
            }
            
            // Saída com seriais
            if (tipo === 'saida' && controle.controlaSerial && seriaisSelecionados.length > 0) {
                for (const serial of seriaisSelecionados) {
                    await supabaseClient
                        .from('produtos_seriais')
                        .update({ 
                            status: 'vendido',
                            disponivel: false,
                            data_saida: new Date().toISOString()
                        })
                        .eq('id', serial.id);
                    
                    await supabaseClient
                        .from('movimentos_estoque')
                        .insert([{
                            produto_id: id,
                            tipo: tipo,
                            quantidade: 1,
                            quantidade_anterior: estoqueAtual,
                            quantidade_nova: novoEstoque,
                            motivo: motivo || `Saída - Serial: ${serial.serial || serial.imei}${lote ? ` - Lote: ${lote}` : ''}`,
                            data: new Date().toISOString(),
                            usuario_id: usuario?.id || null
                        }]);
                }
            }
            
            // Produtos sem controle de serial
            if (!controle.controlaSerial) {
                await supabaseClient
                    .from('movimentos_estoque')
                    .insert([{
                        produto_id: id,
                        tipo: tipo,
                        quantidade: quantidade,
                        quantidade_anterior: estoqueAtual,
                        quantidade_nova: novoEstoque,
                        motivo: motivo || `Ajuste manual - ${tipo === 'entrada' ? 'adição' : 'remoção'}${loteMovimentado ? ` (Lote: ${loteMovimentado})` : ''}`,
                        data: new Date().toISOString(),
                        usuario_id: usuario?.id || null
                    }]);
            }
            
            // Atualizar objeto local para atualizar visualmente a tabela na hora
            produto.estoque_total = novoEstoque;
            produto.estoque = novoEstoque;
            if (controle.controlaLote) {
                if (lotesAtualizados) {
                    produto.lotes = lotesAtualizados;
                    salvarLotesLocal(id, lotesAtualizados);
                }
                if (loteAtivoFEFO) {
                    produto.lote = loteAtivoFEFO.lote;
                    produto.data_validade = loteAtivoFEFO.data_validade;
                    produto.alerta_vencimento_dias = loteAtivoFEFO.alerta_vencimento_dias;
                } else {
                    if (lote) produto.lote = lote;
                    if (dataValidade) produto.data_validade = dataValidade;
                    produto.alerta_vencimento_dias = alertaDias;
                }
            }

            mostrarNotificacao(`✅ Saldo atualizado com sucesso! Novo saldo: ${novoEstoque}`, 'success');
            document.getElementById('modal').style.display = 'none';
            renderizarTabela();
            await carregarProdutos();
        } catch (error) {
            console.error('Erro ao ajustar saldo:', error);
            mostrarNotificacao('Erro ao ajustar saldo: ' + (error.message || error), 'error');
        } finally {
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.textContent = 'Confirmar';
            }
        }
    }
    
    // =====================================================
    // EVENTOS
    // =====================================================
    
    document.getElementById('searchInput')?.addEventListener('input', renderizarTabela);
    document.getElementById('filtroCategoria')?.addEventListener('change', renderizarTabela);
    document.getElementById('filtroLote')?.addEventListener('change', renderizarTabela);
    document.getElementById('filtroSaldo')?.addEventListener('change', renderizarTabela);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarTabela);
    
    // =====================================================
    // MODAL DE BUSCA AVANÇADA DE PRODUTOS PARA AJUSTE
    // (Nome, Código, Código de Barras, Número de Série ou IMEI)
    // =====================================================
    let searchAjusteTimer = null;
    let produtosAjusteFiltrados = [];

    function abrirModalBuscaProdutoAjuste() {
        if (!podeAjustarEstoque()) {
            mostrarNotificacao('Você não tem permissão para realizar o ajuste de saldo!', 'error');
            return;
        }

        const modalBusca = document.getElementById('modalBuscaProdutoAjuste');
        const inputBusca = document.getElementById('inputBuscaProdutoAjuste');
        if (!modalBusca) return;

        modalBusca.style.display = 'flex';
        if (inputBusca) {
            inputBusca.value = '';
            setTimeout(() => inputBusca.focus(), 100);
        }
        buscarProdutosParaAjuste('');
    }

    function fecharModalBuscaProdutoAjuste() {
        const modalBusca = document.getElementById('modalBuscaProdutoAjuste');
        if (modalBusca) modalBusca.style.display = 'none';
    }

    async function buscarProdutosParaAjuste(termo) {
        const statusDiv = document.getElementById('statusBuscaAjuste');
        const listaDiv = document.getElementById('listaResultadosBuscaAjuste');
        if (!listaDiv) return;

        termo = (termo || '').trim();
        const termoLower = termo.toLowerCase();

        // Filtrar apenas produtos físicos (não serviços)
        const produtosFisicos = produtos.filter(p => p.tipo !== 'servico');

        if (!termo) {
            if (statusDiv) statusDiv.style.display = 'none';
            produtosAjusteFiltrados = produtosFisicos.slice(0, 30);
            renderizarListaResultadosAjuste(produtosAjusteFiltrados);
            return;
        }

        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#e0f2fe';
            statusDiv.style.color = '#0369a1';
            statusDiv.innerHTML = `🔍 Pesquisando por "<strong>${termo}</strong>"...`;
        }

        // 1. Busca local por Nome, Código, Código de Barras (string ou array), Marca, Modelo
        const locais = produtosFisicos.filter(p => {
            const nomeMatch = (p.nome || '').toLowerCase().includes(termoLower);
            const codMatch = String(p.codigo || p.id || '').toLowerCase().includes(termoLower);
            const marcaMatch = (p.marca || '').toLowerCase().includes(termoLower);
            const modeloMatch = (p.modelo || '').toLowerCase().includes(termoLower);

            let barrasMatch = false;
            if (typeof p.codigo_barras === 'string') {
                barrasMatch = p.codigo_barras.toLowerCase().includes(termoLower);
            }
            if (!barrasMatch && Array.isArray(p.codigos_barras)) {
                barrasMatch = p.codigos_barras.some(b => String(b || '').toLowerCase().includes(termoLower));
            }

            return nomeMatch || codMatch || marcaMatch || modeloMatch || barrasMatch;
        });

        // 2. Busca assíncrona por Serial / IMEI no banco supabase
        let seriaisMatches = [];
        try {
            const { data: seriais, error } = await supabaseClient
                .from('produtos_seriais')
                .select('produto_id, numero_serie, imei, status')
                .or(`numero_serie.ilike.%${termo}%,imei.ilike.%${termo}%`)
                .limit(20);

            if (!error && seriais && seriais.length > 0) {
                seriaisMatches = seriais;
            }
        } catch (err) {
            console.warn('Busca de seriais/IMEI no banco:', err);
        }

        // Mapear produtos encontrados via serial/IMEI
        const produtosPorSerial = [];
        for (const s of seriaisMatches) {
            const prod = produtosFisicos.find(p => p.id === s.produto_id);
            if (prod) {
                const serialText = s.imei ? `IMEI: ${s.imei}` : `Serial: ${s.numero_serie}`;
                produtosPorSerial.push({
                    ...prod,
                    _matchedSerial: serialText,
                    _serialStatus: s.status
                });
            }
        }

        // 3. Mesclar resultados sem duplicatas de ID (priorizando quem tem match de serial se houver)
        const mapaFinal = new Map();
        produtosPorSerial.forEach(p => mapaFinal.set(p.id, p));
        locais.forEach(p => {
            if (!mapaFinal.has(p.id)) {
                mapaFinal.set(p.id, p);
            }
        });

        produtosAjusteFiltrados = Array.from(mapaFinal.values());

        if (statusDiv) {
            if (produtosAjusteFiltrados.length === 0) {
                statusDiv.style.background = '#fef2f2';
                statusDiv.style.color = '#991b1b';
                statusDiv.innerHTML = `⚠️ Nenhum produto encontrado para "<strong>${termo}</strong>".`;
            } else {
                statusDiv.style.background = '#f0fdf4';
                statusDiv.style.color = '#166534';
                statusDiv.innerHTML = `✅ <strong>${produtosAjusteFiltrados.length}</strong> produto(s) encontrado(s). Pressione <strong>Enter</strong> ou clique para selecionar.`;
            }
        }

        renderizarListaResultadosAjuste(produtosAjusteFiltrados);
    }

    function renderizarListaResultadosAjuste(lista) {
        const listaDiv = document.getElementById('listaResultadosBuscaAjuste');
        if (!listaDiv) return;

        if (!lista || lista.length === 0) {
            listaDiv.innerHTML = `
                <div style="text-align: center; padding: 30px 15px; color: #64748b;">
                    <p style="font-size: 15px; font-weight: 600; margin: 0 0 6px 0;">Nenhum produto correspondente</p>
                    <small style="color: #94a3b8;">Verifique se digitou o nome, código, serial ou IMEI corretamente.</small>
                </div>
            `;
            return;
        }

        listaDiv.innerHTML = lista.map(p => {
            const estoque = p.estoque_total || p.estoque || 0;
            const estoqueCor = estoque <= 0 ? '#dc2626' : (estoque < (p.estoque_minimo || 5) ? '#d97706' : '#16a34a');
            const serialBadge = p._matchedSerial ? `
                <span style="background: #e0e7ff; color: #3730a3; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid #c7d2fe; display: inline-block;">
                    📱 ${p._matchedSerial} (${p._serialStatus || 'serial'})
                </span>
            ` : '';

            let codBarras = '';
            if (Array.isArray(p.codigos_barras) && p.codigos_barras.length > 0) {
                codBarras = p.codigos_barras.slice(0, 2).join(', ');
                if (p.codigos_barras.length > 2) codBarras += '...';
            } else if (p.codigo_barras) {
                codBarras = p.codigo_barras;
            }

            return `
                <div class="item-resultado-ajuste" onclick="selecionarProdutoParaAjuste(${p.id})"
                     style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; margin-bottom: 6px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;"
                     onmouseover="this.style.borderColor='#0066FF'; this.style.backgroundColor='#f0f7ff';"
                     onmouseout="this.style.borderColor='#e2e8f0'; this.style.backgroundColor='white';">
                    <div style="flex: 1; min-width: 0; padding-right: 12px;">
                        <div style="font-size: 14px; font-weight: 700; color: #1e293b; display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <span>${p.nome}</span> ${serialBadge}
                        </div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                            <span>Cód: <strong>${p.codigo || p.id}</strong></span>
                            ${codBarras ? `<span>Barras: <strong>${codBarras}</strong></span>` : ''}
                            <span>Cat: <strong>${p.categoria || '-'}</strong></span>
                            ${p.marca ? `<span>Marca: <strong>${p.marca}</strong></span>` : ''}
                            ${p.modelo ? `<span>Modelo: <strong>${p.modelo}</strong></span>` : ''}
                        </div>
                    </div>
                    <div style="text-align: right; white-space: nowrap;">
                        <div style="font-size: 13px; font-weight: 800; color: ${estoqueCor};">
                            Saldo: ${estoque} unid.
                        </div>
                        <span style="font-size: 11px; font-weight: 700; color: #0066FF; display: inline-block; margin-top: 4px;">
                            Selecionar ➔
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function selecionarProdutoParaAjuste(produtoId) {
        fecharModalBuscaProdutoAjuste();
        ajustarEstoque(parseInt(produtoId));
    }

    // Eventos do Modal de Busca Avançada
    document.getElementById('btnAjustar')?.addEventListener('click', abrirModalBuscaProdutoAjuste);
    document.querySelector('.close-busca-ajuste')?.addEventListener('click', fecharModalBuscaProdutoAjuste);
    document.getElementById('btnFecharBuscaAjuste')?.addEventListener('click', fecharModalBuscaProdutoAjuste);

    // Fechar ao clicar fora do modal
    window.addEventListener('click', (e) => {
        const modalBusca = document.getElementById('modalBuscaProdutoAjuste');
        if (modalBusca && e.target === modalBusca) {
            fecharModalBuscaProdutoAjuste();
        }
    });

    // Input de busca em tempo real com debounce
    const inputBuscaAjuste = document.getElementById('inputBuscaProdutoAjuste');
    inputBuscaAjuste?.addEventListener('input', (e) => {
        clearTimeout(searchAjusteTimer);
        const termo = e.target.value.trim();
        searchAjusteTimer = setTimeout(() => buscarProdutosParaAjuste(termo), 250);
    });

    // Leitor de código de barras ou tecla Enter
    inputBuscaAjuste?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const termo = (inputBuscaAjuste.value || '').trim().toLowerCase();
            if (!termo) return;

            if (produtosAjusteFiltrados.length === 1) {
                selecionarProdutoParaAjuste(produtosAjusteFiltrados[0].id);
            } else if (produtosAjusteFiltrados.length > 1) {
                // Verificar match exato em código, código de barras ou serial/IMEI
                const matchExato = produtosAjusteFiltrados.find(p => {
                    const cod = String(p.codigo || '').toLowerCase();
                    const barrasStr = typeof p.codigo_barras === 'string' ? p.codigo_barras.toLowerCase() : '';
                    const serialStr = p._matchedSerial ? p._matchedSerial.toLowerCase() : '';
                    let arrayBarrasMatch = false;
                    if (Array.isArray(p.codigos_barras)) {
                        arrayBarrasMatch = p.codigos_barras.some(b => String(b || '').toLowerCase() === termo);
                    }
                    return cod === termo || barrasStr === termo || arrayBarrasMatch || serialStr.includes(termo);
                });

                if (matchExato) {
                    selecionarProdutoParaAjuste(matchExato.id);
                } else {
                    selecionarProdutoParaAjuste(produtosAjusteFiltrados[0].id);
                }
            }
        }
    });

    // Botão "Trocar Produto" dentro do modal de ajuste
    document.getElementById('btnTrocarProdutoAjuste')?.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
        abrirModalBuscaProdutoAjuste();
    });
    
    document.getElementById('btnSalvar')?.addEventListener('click', salvarAjuste);
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });
    
    // Eventos de Exportação
    document.getElementById('btnExportExcel')?.addEventListener('click', () => {
        exportarTabelaParaExcel('estoqueTable', 'relatorio_estoque');
    });
    
    document.getElementById('btnExportPDF')?.addEventListener('click', () => {
        exportarTabelaParaPDF('estoqueTable', 'Relatório de Estoque', 'Lista de níveis de estoque de produtos');
    });
    
    // Configurar parâmetro de venda sem saldo
    const chkPermitirVendaSemSaldo = document.getElementById('chkPermitirVendaSemSaldo');
    if (chkPermitirVendaSemSaldo) {
        chkPermitirVendaSemSaldo.checked = usuario.config_loja?.permitir_venda_sem_saldo === true;
        chkPermitirVendaSemSaldo.addEventListener('change', async (e) => {
            const checked = e.target.checked;
            try {
                const { error } = await supabaseClient
                    .from('config_loja')
                    .update({ permitir_venda_sem_saldo: checked })
                    .eq('loja_id', usuario.loja_id);
                
                if (error) throw error;
                
                // Atualizar o sessionStorage
                usuario.config_loja = {
                    ...(usuario.config_loja || {}),
                    permitir_venda_sem_saldo: checked
                };
                sessionStorage.setItem('usuario', JSON.stringify(usuario));
                mostrarNotificacao('Configuração de venda sem saldo atualizada!', 'success');
            } catch (err) {
                console.error('Erro ao atualizar configuração:', err);
                mostrarNotificacao('Erro ao atualizar configuração de estoque!', 'error');
                e.target.checked = !checked; // reverter
            }
        });
    }


    // =====================================================
    // GESTÃO DE CÓDIGOS DE BARRAS MÚLTIPLOS
    // =====================================================
    function renderBarcodes() {
        const list = document.getElementById('barcodes_list');
        if (!list) return;
        list.innerHTML = '';
        if (produtoBarcodes.length === 0) {
            list.innerHTML = '<span style="color: #64748B; font-size: 13px; font-style: italic;" id="no_barcodes_placeholder">Nenhum código de barras adicionado</span>';
            return;
        }
        list.innerHTML = produtoBarcodes.map((code, index) => `
            <span class="barcode-tag">
                <code>${code}</code>
                <span onclick="removerBarcode(${index})" style="cursor: pointer; font-weight: bold; background: rgba(255,255,255,0.2); width: 16px; height: 16px; display: inline-flex; justify-content: center; align-items: center; border-radius: 50%; font-size: 10px;">✕</span>
            </span>
        `).join('');
    }

    window.removerBarcode = (index) => {
        produtoBarcodes.splice(index, 1);
        renderBarcodes();
    };

    async function adicionarBarcode() {
        const input = document.getElementById('barcode_input');
        if (!input) return;
        const code = input.value.trim();
        if (!code) return;

        if (produtoBarcodes.includes(code)) {
            mostrarNotificacao('Este código de barras já foi adicionado para este produto!', 'error');
            return;
        }

        try {
            const currentProductId = document.getElementById('prodFormId').value;
            let query = supabaseClient
                .from('produtos')
                .select('id, nome')
                .contains('codigos_barras', JSON.stringify([code]));

            if (currentProductId) {
                query = query.neq('id', currentProductId);
            }

            const { data, error } = await query;
            if (error) throw error;

            if (data && data.length > 0) {
                mostrarNotificacao(`Este código de barras já está em uso pelo produto "${data[0].nome}"!`, 'error');
                return;
            }

            produtoBarcodes.push(code);
            renderBarcodes();
            input.value = '';
            input.focus();
        } catch (err) {
            console.error('Erro ao validar código de barras:', err);
            produtoBarcodes.push(code);
            renderBarcodes();
            input.value = '';
        }
    }

    function atualizarCicloAssinatura() {
        const freq = document.getElementById('plano_frequencia')?.value || 'mensal';
        const venc = document.getElementById('plano_data_vencimento')?.value;
        const spanInfo = document.getElementById('spanDiasRestantes');
        const cicloSpan = document.querySelector('#assinaturaCicloInfo span:first-child');
        
        const labels = {
            semanal: 'Semanal a cada 7 dias',
            mensal: 'Mensalidade a cada 30 dias',
            trimestral: 'Trimestral a cada 90 dias',
            semestral: 'Semestral a cada 180 dias',
            anual: 'Anual a cada 365 dias'
        };
        
        if (cicloSpan) {
            cicloSpan.innerHTML = `📅 <strong>Ciclo de Cobrança:</strong> ${labels[freq] || 'Recorrente'}.`;
        }
        
        if (venc && spanInfo) {
            const dataVenc = new Date(venc + 'T00:00:00');
            const hoje = new Date();
            hoje.setHours(0,0,0,0);
            const diffTime = dataVenc - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
                spanInfo.innerHTML = `⚠️ Vencido há ${Math.abs(diffDays)} dia(s)`;
                spanInfo.style.color = '#dc2626';
            } else if (diffDays === 0) {
                spanInfo.innerHTML = `🔔 Vence Hoje!`;
                spanInfo.style.color = '#d97706';
            } else {
                spanInfo.innerHTML = `⏳ 1º Vencimento em ${diffDays} dia(s)`;
                spanInfo.style.color = '#166534';
            }
        }
    }

    // =====================================================
    // EDITAR / EXCLUIR PRODUTO
    // =====================================================
    window.editarProduto = async (id) => {
        if (!verificarPermissao('produtos', 'editar') && !podeAjustarEstoque()) {
            mostrarNotificacao('Você não tem permissão para editar produtos!', 'error');
            return;
        }

        const produto = produtos.find(p => p.id === id);
        if (!produto) return;

        document.getElementById('modalProdutoTitle').textContent = 'Editar Produto / Serviço';
        document.getElementById('prodFormId').value = produto.id;
        document.getElementById('codigo').value = produto.codigo || '';
        document.getElementById('nome').value = produto.nome || '';
        document.getElementById('marca').value = produto.marca || '';
        document.getElementById('modelo').value = produto.modelo || '';
        document.getElementById('descricao').value = produto.descricao || '';
        document.getElementById('valor_compra').value = (produto.valor_compra !== undefined && produto.valor_compra !== null) ? produto.valor_compra : '';
        document.getElementById('valor_venda').value = (produto.valor_venda !== undefined && produto.valor_venda !== null) ? produto.valor_venda : '';
        document.getElementById('estoque_minimo').value = produto.estoque_minimo || 5;
        document.getElementById('garantia_dias').value = produto.garantia_dias || 0;
        document.getElementById('imagem').value = produto.imagem || '';

        produtoBarcodes = Array.isArray(produto.codigos_barras) ? [...produto.codigos_barras] : [];
        renderBarcodes();
        document.getElementById('barcode_input').value = '';

        const categoriaSelect = document.getElementById('modalCategoriaSelect');
        if (categoriaSelect) {
            categoriaSelect.value = produto.categoria || '';
            categoriaSelect.dispatchEvent(new Event('change'));
        }

        document.getElementById('lote').value = produto.lote || '';
        document.getElementById('data_validade').value = produto.data_validade || '';
        document.getElementById('alerta_vencimento_dias').value = produto.alerta_vencimento_dias || 30;

        const tipoSelect = document.getElementById('produtoTipo');
        if (tipoSelect) {
            tipoSelect.value = produto.tipo || 'produto';
            tipoSelect.dispatchEvent(new Event('change'));
        }

        const chkHabilitada = document.getElementById('comissao_habilitada');
        if (chkHabilitada) {
            chkHabilitada.checked = produto.comissao_habilitada || false;
            chkHabilitada.dispatchEvent(new Event('change'));
        }
        const chk100 = document.getElementById('comissao_100_porcento');
        if (chk100) {
            chk100.checked = produto.comissao_100_porcento !== false;
            chk100.dispatchEvent(new Event('change'));
        }
        const inputComissaoValor = document.getElementById('comissao_valor');
        if (inputComissaoValor) inputComissaoValor.value = produto.comissao_valor || '';

        const inputDuracaoMinutos = document.getElementById('duracao_minutos');
        if (inputDuracaoMinutos) inputDuracaoMinutos.value = produto.duracao_minutos || 45;

        // Assinatura recorrente
        const chkRecorrente = document.getElementById('is_recorrente');
        if (chkRecorrente) {
            chkRecorrente.checked = produto.is_recorrente === true;
            chkRecorrente.dispatchEvent(new Event('change'));
        }
        if (produto.is_recorrente) {
            const selCli = document.getElementById('plano_cliente_id');
            if (selCli) selCli.value = produto.plano_cliente_id || '';
            const inpNome = document.getElementById('plano_nome');
            if (inpNome) inpNome.value = produto.plano_nome || '';
            const selFreq = document.getElementById('plano_frequencia');
            if (selFreq) selFreq.value = produto.plano_frequencia || 'mensal';
            const inpVal = document.getElementById('plano_valor');
            if (inpVal) inpVal.value = produto.plano_valor || produto.valor_venda || '';
            const inpVenc = document.getElementById('plano_data_vencimento');
            if (inpVenc) inpVenc.value = produto.plano_data_vencimento || '';
            atualizarCicloAssinatura();
        }

        // Em edição: informar que ajuste de estoque é feito pelo botão Ajustar
        const saldoAtual = produto.estoque_total || produto.estoque || 0;
        document.getElementById('quantidade_estoque').value = saldoAtual;
        document.getElementById('quantidade_estoque').disabled = true;
        document.getElementById('infoEstoqueInicial').innerHTML = `
            <strong>ℹ️ Saldo Atual:</strong> ${produto.tipo === 'servico' ? 'Serviço (sem saldo físico)' : `${saldoAtual} unidade(s)`}.<br>
            <small>Para movimentar entradas/saídas de saldo, utilize o botão <strong>"⚖️ Ajustar"</strong> na tabela principal.</small>
        `;
        document.getElementById('seriaisContainer').style.display = 'none';

        document.getElementById('modalProduto').style.display = 'flex';
    };

    window.excluirProduto = async (id) => {
        if (!verificarPermissao('produtos', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir produtos!', 'error');
            return;
        }

        const produto = produtos.find(p => p.id === id);
        if (!confirm(`Tem certeza que deseja excluir "${produto?.nome}"?`)) return;

        try {
            const { error } = await supabaseClient
                .from('produtos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            mostrarNotificacao('Item excluído com sucesso!', 'success');
            await carregarProdutos();
        } catch (error) {
            console.error('Erro ao excluir:', error);
            mostrarNotificacao('Erro ao excluir item. Verifique se há movimentações vinculadas.', 'error');
        }
    };

    // =====================================================
    // SALVAR PRODUTO / SERVIÇO
    // =====================================================
    async function salvarProduto() {
        const id = document.getElementById('prodFormId').value;
        const quantidadeEstoque = parseInt(document.getElementById('quantidade_estoque').value);

        const selectCategoria = document.getElementById('modalCategoriaSelect');
        const selectedOption = selectCategoria?.options[selectCategoria.selectedIndex];
        const controlaLote = selectedOption?.getAttribute('data-controla-lote') === 'true';

        const dadosProduto = {
            codigo: document.getElementById('codigo').value.trim(),
            nome: document.getElementById('nome').value.trim(),
            tipo: document.getElementById('produtoTipo').value || 'produto',
            categoria: selectCategoria ? selectCategoria.value : '',
            marca: document.getElementById('marca').value.trim(),
            modelo: document.getElementById('modelo').value.trim(),
            descricao: document.getElementById('descricao').value.trim(),
            valor_compra: parseFloat(document.getElementById('valor_compra').value) || 0,
            valor_venda: parseFloat(document.getElementById('valor_venda').value) || 0,
            estoque_minimo: parseInt(document.getElementById('estoque_minimo').value) || 5,
            garantia_dias: parseInt(document.getElementById('garantia_dias').value) || 0,
            imagem: document.getElementById('imagem').value.trim(),
            codigos_barras: produtoBarcodes,
            updated_at: new Date().toISOString()
        };

        if (controlaLote) {
            dadosProduto.lote = document.getElementById('lote').value.trim() || null;
            dadosProduto.data_validade = document.getElementById('data_validade').value || null;
            dadosProduto.alerta_vencimento_dias = parseInt(document.getElementById('alerta_vencimento_dias').value) || 30;
        } else {
            dadosProduto.lote = null;
            dadosProduto.data_validade = null;
            dadosProduto.alerta_vencimento_dias = null;
        }

        if (dadosProduto.tipo === 'servico') {
            dadosProduto.estoque_total = 0;
            dadosProduto.duracao_minutos = parseInt(document.getElementById('duracao_minutos')?.value) || 45;
            const chkHabilitada = document.getElementById('comissao_habilitada');
            dadosProduto.comissao_habilitada = chkHabilitada ? chkHabilitada.checked : false;

            const chk100 = document.getElementById('comissao_100_porcento');
            dadosProduto.comissao_100_porcento = chk100 ? chk100.checked : false;
            dadosProduto.comissao_valor = parseFloat(document.getElementById('comissao_valor').value) || 0;

            const chkRecorrente = document.getElementById('is_recorrente');
            const isRecorrente = chkRecorrente ? chkRecorrente.checked : false;
            dadosProduto.is_recorrente = isRecorrente;

            if (isRecorrente) {
                const clienteId = document.getElementById('plano_cliente_id')?.value;
                const planoNome = document.getElementById('plano_nome')?.value.trim();
                const planoFrequencia = document.getElementById('plano_frequencia')?.value || 'mensal';
                const planoVenc = document.getElementById('plano_data_vencimento')?.value;
                const planoValor = parseFloat(document.getElementById('plano_valor')?.value) || 0;

                if (!clienteId) {
                    mostrarNotificacao('Para serviços de assinatura recorrente, selecione um cliente!', 'error');
                    document.getElementById('plano_cliente_id')?.focus();
                    return;
                }
                if (!planoNome) {
                    mostrarNotificacao('Informe o nome do plano de assinatura!', 'error');
                    document.getElementById('plano_nome')?.focus();
                    return;
                }
                if (!planoVenc) {
                    mostrarNotificacao('Informe a data de vencimento da assinatura!', 'error');
                    document.getElementById('plano_data_vencimento')?.focus();
                    return;
                }
                if (isNaN(planoValor) || planoValor < 0.01) {
                    mostrarNotificacao('Informe um valor válido para a assinatura (mínimo R$ 0,01)!', 'error');
                    document.getElementById('plano_valor')?.focus();
                    return;
                }

                dadosProduto.plano_cliente_id = parseInt(clienteId);
                dadosProduto.plano_nome = planoNome;
                dadosProduto.plano_frequencia = planoFrequencia;
                dadosProduto.plano_data_vencimento = planoVenc;
                dadosProduto.plano_valor = planoValor;
            } else {
                dadosProduto.plano_cliente_id = null;
                dadosProduto.plano_nome = null;
                dadosProduto.plano_frequencia = null;
                dadosProduto.plano_data_vencimento = null;
                dadosProduto.plano_valor = null;
            }
        } else {
            dadosProduto.comissao_habilitada = false;
            dadosProduto.comissao_100_porcento = false;
            dadosProduto.comissao_valor = 0;
            dadosProduto.is_recorrente = false;
            dadosProduto.plano_cliente_id = null;
            dadosProduto.plano_nome = null;
            dadosProduto.plano_frequencia = null;
            dadosProduto.plano_data_vencimento = null;
            dadosProduto.plano_valor = null;
        }

        if (!dadosProduto.codigo || !dadosProduto.nome) {
            mostrarNotificacao('Preencha o código e o nome do item!', 'error');
            return;
        }

        if (isNaN(dadosProduto.valor_venda) || dadosProduto.valor_venda < 0.01) {
            mostrarNotificacao('O preço de venda deve ser no mínimo R$ 0,01.', 'error');
            document.getElementById('valor_venda')?.focus();
            return;
        }

        try {
            let produtoIdSalvo = id ? parseInt(id) : null;

            if (id) {
                const { error } = await supabaseClient
                    .from('produtos')
                    .update(dadosProduto)
                    .eq('id', id);

                if (error) throw error;
                mostrarNotificacao('Produto/Serviço atualizado com sucesso!', 'success');
            } else {
                dadosProduto.created_at = new Date().toISOString();
                const qtd = dadosProduto.tipo === 'servico' ? 0 : (isNaN(quantidadeEstoque) ? 0 : quantidadeEstoque);
                dadosProduto.estoque_total = qtd;

                const { data: insData, error } = await supabaseClient
                    .from('produtos')
                    .insert([dadosProduto])
                    .select();

                if (error) throw error;
                if (insData && insData[0]) {
                    produtoIdSalvo = insData[0].id;
                }

                // Se houver saldo inicial em produto, registrar movimento de estoque
                if (qtd > 0 && produtoIdSalvo) {
                    try {
                        await supabaseClient
                            .from('movimentos_estoque')
                            .insert([{
                                loja_id: usuario.loja_id || 1,
                                produto_id: produtoIdSalvo,
                                tipo: 'entrada',
                                quantidade: qtd,
                                saldo_anterior: 0,
                                saldo_novo: qtd,
                                motivo: 'Cadastro inicial de produto',
                                usuario_id: usuario.id || null,
                                data: new Date().toISOString()
                            }]);
                    } catch (eMov) {
                        console.warn('Aviso: Movimento inicial não registrado:', eMov);
                    }
                }

                mostrarNotificacao('Item cadastrado com sucesso!', 'success');
            }

            // Sincronizar contrato na tabela servicos_recorrentes se for assinatura
            if (produtoIdSalvo && dadosProduto.is_recorrente && dadosProduto.plano_cliente_id) {
                try {
                    const { data: existente } = await supabaseClient
                        .from('servicos_recorrentes')
                        .select('id')
                        .eq('produto_id', produtoIdSalvo)
                        .eq('cliente_id', dadosProduto.plano_cliente_id)
                        .maybeSingle();

                    const dadosAssinatura = {
                        loja_id: usuario.loja_id || 1,
                        produto_id: produtoIdSalvo,
                        cliente_id: dadosProduto.plano_cliente_id,
                        plano_nome: dadosProduto.plano_nome,
                        frequencia: dadosProduto.plano_frequencia,
                        valor: dadosProduto.plano_valor,
                        data_vencimento: dadosProduto.plano_data_vencimento,
                        status: 'ativo',
                        updated_at: new Date().toISOString()
                    };

                    if (existente && existente.id) {
                        await supabaseClient
                            .from('servicos_recorrentes')
                            .update(dadosAssinatura)
                            .eq('id', existente.id);
                    } else {
                        await supabaseClient
                            .from('servicos_recorrentes')
                            .insert([dadosAssinatura]);
                    }
                } catch (eAssinatura) {
                    console.error('Erro ao sincronizar assinatura recorrente:', eAssinatura);
                }
            }

            document.getElementById('modalProduto').style.display = 'none';
            document.getElementById('produtoForm').reset();
            await carregarProdutos();
        } catch (error) {
            console.error('Erro ao salvar produto:', error);
            mostrarNotificacao('Erro ao salvar produto: ' + (error.message || 'Verifique os dados'), 'error');
        }
    }

    // =====================================================
    // NOVO PRODUTO / SERVIÇO (MODAL)
    // =====================================================
    async function abrirModalNovoProduto() {
        if (!verificarPermissao('produtos', 'criar') && !podeAjustarEstoque()) {
            mostrarNotificacao('Você não tem permissão para cadastrar produtos!', 'error');
            return;
        }

        document.getElementById('modalProdutoTitle').textContent = 'Novo Produto / Serviço';
        document.getElementById('produtoForm').reset();
        document.getElementById('prodFormId').value = '';

        produtoBarcodes = [];
        renderBarcodes();
        const barcodeInput = document.getElementById('barcode_input');
        if (barcodeInput) barcodeInput.value = '';

        if (typeof obterProximoCodigoProduto === 'function') {
            try {
                const proximoCodigo = await obterProximoCodigoProduto();
                if (proximoCodigo) {
                    document.getElementById('codigo').value = proximoCodigo;
                }
            } catch (eCod) {
                console.warn('Erro ao obter próximo código:', eCod);
            }
        }

        const qtdEstoqueInput = document.getElementById('quantidade_estoque');
        if (qtdEstoqueInput) {
            qtdEstoqueInput.value = 1;
            qtdEstoqueInput.disabled = false;
        }
        const infoEstoqueInicial = document.getElementById('infoEstoqueInicial');
        if (infoEstoqueInicial) {
            infoEstoqueInicial.innerHTML = '<strong>ℹ️ INFORMAÇÕES:</strong> Cadastre abaixo a quantidade inicial em estoque deste item.';
        }

        const groupLoteValidade = document.getElementById('groupLoteValidade');
        if (groupLoteValidade) groupLoteValidade.style.display = 'none';

        const checkComissao = document.getElementById('comissao_habilitada');
        if (checkComissao) {
            checkComissao.checked = false;
            checkComissao.dispatchEvent(new Event('change'));
        }
        const checkComissao100 = document.getElementById('comissao_100_porcento');
        if (checkComissao100) {
            checkComissao100.checked = true;
            checkComissao100.dispatchEvent(new Event('change'));
        }
        const valComissao = document.getElementById('comissao_valor');
        if (valComissao) valComissao.value = '';

        const checkRecorrente = document.getElementById('is_recorrente');
        if (checkRecorrente) {
            checkRecorrente.checked = false;
            checkRecorrente.dispatchEvent(new Event('change'));
        }
        const selCli = document.getElementById('plano_cliente_id');
        if (selCli) selCli.value = '';
        const inpPlanoNome = document.getElementById('plano_nome');
        if (inpPlanoNome) inpPlanoNome.value = '';
        const selFreq = document.getElementById('plano_frequencia');
        if (selFreq) selFreq.value = 'mensal';
        const inpPlanoVal = document.getElementById('plano_valor');
        if (inpPlanoVal) inpPlanoVal.value = '';
        const inpPlanoVenc = document.getElementById('plano_data_vencimento');
        if (inpPlanoVenc) inpPlanoVenc.value = '';

        const tipoSelect = document.getElementById('produtoTipo');
        if (tipoSelect) {
            tipoSelect.value = 'produto';
            tipoSelect.dispatchEvent(new Event('change'));
        }

        const modalCategoriaSelect = document.getElementById('modalCategoriaSelect');
        if (modalCategoriaSelect) {
            modalCategoriaSelect.value = '';
            modalCategoriaSelect.dispatchEvent(new Event('change'));
        }

        const modal = document.getElementById('modalProduto');
        if (modal) modal.style.display = 'flex';
    }

    // Eventos do Modal de Produto / Serviço
    document.getElementById('btnNovoProduto')?.addEventListener('click', abrirModalNovoProduto);
    document.getElementById('btnCancelarProduto')?.addEventListener('click', () => {
        const modal = document.getElementById('modalProduto');
        if (modal) modal.style.display = 'none';
    });
    document.querySelector('.close-modal-produto')?.addEventListener('click', () => {
        const modal = document.getElementById('modalProduto');
        if (modal) modal.style.display = 'none';
    });
    document.getElementById('btnSalvarProduto')?.addEventListener('click', salvarProduto);

    // Fechar modal ao clicar fora
    window.addEventListener('click', (e) => {
        const modalProd = document.getElementById('modalProduto');
        if (modalProd && e.target === modalProd) {
            modalProd.style.display = 'none';
        }
    });

    // Alteração de Tipo no Modal
    document.getElementById('produtoTipo')?.addEventListener('change', (e) => {
        const tipo = e.target.value;
        const sectionEstoqueInicial = document.getElementById('sectionEstoqueInicial');
        const groupComissaoServico = document.getElementById('groupComissaoServico');
        const groupAssinaturaServico = document.getElementById('groupAssinaturaServico');
        const groupLoteValidade = document.getElementById('groupLoteValidade');
        
        if (tipo === 'servico') {
            if (sectionEstoqueInicial) sectionEstoqueInicial.style.display = 'none';
            if (groupLoteValidade) groupLoteValidade.style.display = 'none';
            if (groupComissaoServico) groupComissaoServico.style.display = 'block';
            if (groupAssinaturaServico) groupAssinaturaServico.style.display = 'block';
        } else {
            if (sectionEstoqueInicial) sectionEstoqueInicial.style.display = 'block';
            if (groupComissaoServico) groupComissaoServico.style.display = 'none';
            if (groupAssinaturaServico) groupAssinaturaServico.style.display = 'none';
            
            // Re-checar lote da categoria selecionada
            const selCat = document.getElementById('modalCategoriaSelect');
            const selectedOption = selCat?.options[selCat.selectedIndex];
            const controlaLote = selectedOption?.getAttribute('data-controla-lote') === 'true';
            if (groupLoteValidade) groupLoteValidade.style.display = controlaLote ? 'grid' : 'none';
        }
    });

    // Alteração de Categoria no Modal
    document.getElementById('modalCategoriaSelect')?.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const groupLoteValidade = document.getElementById('groupLoteValidade');
        const tipo = document.getElementById('produtoTipo')?.value || 'produto';
        
        if (!selectedOption || !selectedOption.value || tipo === 'servico') {
            if (groupLoteValidade) groupLoteValidade.style.display = 'none';
            return;
        }
        
        const controlaLote = selectedOption.getAttribute('data-controla-lote') === 'true';
        const avisoVencimento = selectedOption.getAttribute('data-aviso-vencimento') || '30';
        
        if (groupLoteValidade) {
            groupLoteValidade.style.display = controlaLote ? 'grid' : 'none';
            if (controlaLote) {
                const inputAviso = document.getElementById('alerta_vencimento_dias');
                if (inputAviso) inputAviso.value = avisoVencimento;
            }
        }
    });

    // Comissão
    document.getElementById('comissao_habilitada')?.addEventListener('change', (e) => {
        const groupValores = document.getElementById('groupComissaoValores');
        if (groupValores) groupValores.style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('comissao_100_porcento')?.addEventListener('change', (e) => {
        const divCustom = document.getElementById('divComissaoValorCustom');
        if (divCustom) divCustom.style.display = e.target.checked ? 'none' : 'block';
    });

    // Assinatura
    document.getElementById('is_recorrente')?.addEventListener('change', (e) => {
        const groupCampos = document.getElementById('groupAssinaturaCampos');
        if (groupCampos) {
            groupCampos.style.display = e.target.checked ? 'flex' : 'none';
        }
        if (e.target.checked) {
            atualizarCicloAssinatura();
        }
    });

    document.getElementById('plano_frequencia')?.addEventListener('change', atualizarCicloAssinatura);
    document.getElementById('plano_data_vencimento')?.addEventListener('input', atualizarCicloAssinatura);

    // Códigos de barras
    document.getElementById('btn_add_barcode')?.addEventListener('click', adicionarBarcode);
    document.getElementById('barcode_input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            adicionarBarcode();
        }
    });

    // Filtros de tabela
    document.getElementById('filtroTipo')?.addEventListener('change', renderizarTabela);

    // Ocultar Custo
    function configurarFiltroOcultarCusto() {
        const chk = document.getElementById('chkOcultarCusto');
        const table = document.getElementById('estoqueTable');
        if (!chk || !table) return;

        const ocultarSalvo = localStorage.getItem('erp_ocultar_custo') === 'true';
        chk.checked = ocultarSalvo;
        if (ocultarSalvo) {
            table.classList.add('hide-custo');
        } else {
            table.classList.remove('hide-custo');
        }

        chk.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (checked) {
                table.classList.add('hide-custo');
            } else {
                table.classList.remove('hide-custo');
            }
            localStorage.setItem('erp_ocultar_custo', checked ? 'true' : 'false');
        });
    }

    // Configurar Ocultar Custo
    configurarFiltroOcultarCusto();

    // Inicializar
    await carregarCategorias();
    await carregarClientesAssinatura();
    await carregarProdutos();
    
    window.abrirModalNovoProduto = abrirModalNovoProduto;
    window.editarProduto = editarProduto;
    window.excluirProduto = excluirProduto;
    window.ajustarEstoque = ajustarEstoque;
    window.verHistorico = verHistorico;
    window.abrirModalBuscaProdutoAjuste = abrirModalBuscaProdutoAjuste;
    window.fecharModalBuscaProdutoAjuste = fecharModalBuscaProdutoAjuste;
    window.selecionarProdutoParaAjuste = selecionarProdutoParaAjuste;
    window.toggleCheckbox = toggleCheckbox;
    window.removerBarcode = removerBarcode;
});