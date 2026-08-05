// js/entradas.js
// Gerenciamento de entradas (compras/notas fiscais)

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    if (!temPermissao('entradas', 'ver')) {
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
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });
    
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    // Variáveis
    let produtos = [];
    let fornecedores = [];
    let categorias = [];
    let carrinho = [];
    
    // =====================================================
    // CARREGAR DADOS
    // =====================================================
    
    async function carregarDados() {
        try {
            const [produtosRes, fornecedoresRes, categoriasRes, entradasRes] = await Promise.all([
                supabaseClient.from('produtos').select('*').eq('ativo', true).order('nome'),
                supabaseClient.from('clientes').select('*').eq('tipo', 'fornecedor').order('nome'),
                supabaseClient.from('categorias').select('*'),
                supabaseClient.from('entradas').select('*, clientes:fornecedor_id(nome)').order('id', { ascending: false })
            ]);
            
            if (produtosRes.error) throw produtosRes.error;
            if (fornecedoresRes.error) throw fornecedoresRes.error;
            if (categoriasRes.error) throw categoriasRes.error;
            if (entradasRes.error) throw entradasRes.error;
            
            produtos = produtosRes.data || [];
            fornecedores = fornecedoresRes.data || [];
            categorias = categoriasRes.data || [];
            
            await populaFornecedores();
            renderizarProdutos();
            renderizarEntradas(entradasRes.data || []);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            mostrarNotificacao('Erro ao carregar dados do sistema', 'error');
        }
    }
    
    async function populaFornecedores() {
        const select = document.getElementById('selectFornecedor');
        if (!select) return;
        
        try {
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('id, nome, documento, cpf_cnpj')
                .eq('tipo', 'fornecedor')
                .eq('ativo', true)
                .order('nome');
            
            if (error) throw error;
            
            if (!data || data.length === 0) {
                select.innerHTML = '<option value="">Nenhum fornecedor cadastrado</option>';
                return;
            }
            
            select.innerHTML = '<option value="">Selecione o Fornecedor *</option>' +
                data.map(f => {
                    const doc = f.documento || f.cpf_cnpj || '';
                    return `<option value="${f.id}">${f.nome} ${doc ? `(${doc})` : ''}</option>`;
                }).join('');
        } catch (error) {
            console.error('Erro ao carregar fornecedores:', error);
            select.innerHTML = '<option value="">Erro ao carregar fornecedores</option>';
        }
    }
    
    // =====================================================
    // RENDERIZAR PRODUTOS
    // =====================================================
    
    function renderizarProdutos() {
        const container = document.getElementById('produtosList');
        if (!container) return;
        
        const searchInput = document.getElementById('searchProdutoEntrada');
        const search = searchInput ? searchInput.value.toLowerCase() : '';
        
        const filtrados = produtos.filter(p => 
            p.nome?.toLowerCase().includes(search) || 
            (p.codigo || '').toLowerCase().includes(search) ||
            (Array.isArray(p.codigos_barras) && p.codigos_barras.some(b => b.toLowerCase().includes(search)))
        );
        
        if (filtrados.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--gray);">Nenhum produto encontrado</div>';
            return;
        }
        
        container.innerHTML = filtrados.map(p => {
            return `
                <div class="produto-item" data-id="${p.id}">
                    <div class="produto-info">
                        <h4>${p.nome}</h4>
                        <small>Cód: ${p.codigo || p.id} | Cat: ${p.categoria || '-'} | Marca: ${p.marca || '-'}</small>
                    </div>
                    <div class="produto-preco">
                        R$ ${(p.valor_compra || 0).toFixed(2)}
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.produto-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.getAttribute('data-id'));
                const prod = produtos.find(p => p.id === id);
                if (prod) adicionarAoCarrinho(prod);
            });
        });
    }
    
    document.getElementById('searchProdutoEntrada')?.addEventListener('input', renderizarProdutos);
    
    // =====================================================
    // CARRINHO
    // =====================================================
    
    async function produtoExigeSerial(produto) {
        const cat = categorias.find(c => c.nome === produto.categoria);
        if (cat?.exige_serial === true || cat?.exige_imei === true) return true;
        if (produto.categoria === 'Celular') return true;
        return false;
    }
    
    async function produtoExigeIMEI(produto) {
        const cat = categorias.find(c => c.nome === produto.categoria);
        if (cat?.exige_imei === true) return true;
        if (produto.categoria === 'Celular') return true;
        return false;
    }
    
    async function produtoControlaLote(produto) {
        const cat = categorias.find(c => c.nome === produto.categoria);
        if (cat?.controla_lote_validade === true) return true;
        return false;
    }
    
    function obterAlertaVencimentoPadrao(produto) {
        const cat = categorias.find(c => c.nome === produto.categoria);
        return cat?.aviso_vencimento_dias || 30;
    }
    
    async function adicionarAoCarrinho(produto) {
        const existente = carrinho.find(item => item.id === produto.id);
        
        const exigeSerial = await produtoExigeSerial(produto);
        const exigeIMEI = await produtoExigeIMEI(produto);
        const controlaLote = await produtoControlaLote(produto);
        const alertaPadrao = obterAlertaVencimentoPadrao(produto);
        
        if (existente) {
            existente.quantidade += 1;
            if (exigeSerial) {
                existente.seriais.push({ serial: '', imei: '' });
            }
        } else {
            carrinho.push({
                id: produto.id,
                nome: produto.nome,
                codigo: produto.codigo,
                categoria: produto.categoria,
                valor_compra: produto.valor_compra || 0,
                valor_venda: produto.valor_venda || (produto.valor_compra ? produto.valor_compra * 1.3 : 0),
                quantidade: 1,
                exige_serial: exigeSerial,
                exige_imei: exigeIMEI,
                controla_lote: controlaLote,
                lote: produto.lote || '',
                data_validade: produto.data_validade || '',
                alerta_vencimento_dias: produto.alerta_vencimento_dias || alertaPadrao,
                seriais: exigeSerial ? [{ serial: '', imei: '' }] : []
            });
        }
        
        renderizarCarrinho();
        mostrarNotificacao(`Produto "${produto.nome}" adicionado!`, 'success');
    }
    
    function removerDoCarrinho(id) {
        carrinho = carrinho.filter(item => item.id !== id);
        renderizarCarrinho();
    }
    
    function renderizarCarrinho() {
        const container = document.getElementById('carrinhoItems');
        if (!container) return;
        
        if (carrinho.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--gray);">
                    Clique nos produtos da lista para adicionar à nota
                </div>
            `;
            atualizarTotais();
            return;
        }
        
        container.innerHTML = carrinho.map(item => {
            const subtotal = item.quantidade * item.valor_compra;
            
            let serialHtml = '';
            if (item.exige_serial) {
                serialHtml = `
                    <div class="serial-inputs-container">
                        <strong style="font-size:11px; color:var(--danger); display:block; margin-bottom:5px;">
                            🔢 Números de Série / IMEI Obrigatórios (Qtd: ${item.quantidade})
                        </strong>
                        ${Array.from({ length: item.quantidade }).map((_, idx) => {
                            const valSerial = item.seriais[idx]?.serial || '';
                            const valImei = item.seriais[idx]?.imei || '';
                            
                            return `
                                <div class="serial-input-row" data-id="${item.id}" data-index="${idx}">
                                    <input type="text" 
                                           placeholder="Nº Série #${idx + 1} *" 
                                           class="serial-input-field required" 
                                           value="${valSerial}"
                                           oninput="atualizarSerial(${item.id}, ${idx}, 'serial', this.value)">
                                    ${item.exige_imei ? `
                                        <input type="text" 
                                               placeholder="IMEI #${idx + 1} *" 
                                               class="imei-input-field required" 
                                               value="${valImei}"
                                               oninput="atualizarSerial(${item.id}, ${idx}, 'imei', this.value)">
                                    ` : `
                                        <input type="text" 
                                               placeholder="IMEI (opcional)" 
                                               class="imei-input-field" 
                                               value="${valImei}"
                                               oninput="atualizarSerial(${item.id}, ${idx}, 'imei', this.value)">
                                    `}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
            
            let loteHtml = '';
            if (item.controla_lote) {
                loteHtml = `
                    <div class="lote-inputs-container" style="margin-top: 10px; padding: 10px; border: 1px solid #ffeeba; background: #fff3cd; border-radius: 6px;">
                        <strong style="font-size:11px; color:#856404; display:block; margin-bottom:5px;">
                            📅 Controle de Lote e Validade
                        </strong>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                            <div>
                                <label style="font-size:10px; font-weight:600; display:block; color:#856404;">Lote *</label>
                                <input type="text" 
                                       placeholder="Ex: LOTE123" 
                                       value="${item.lote || ''}" 
                                       style="width: 100%; padding: 5px 8px; border-radius: 4px; border: 1px solid #ced4da; font-size:12px;"
                                       oninput="atualizarLoteField(${item.id}, 'lote', this.value)">
                            </div>
                            <div>
                                <label style="font-size:10px; font-weight:600; display:block; color:#856404;">Validade *</label>
                                <input type="date" 
                                       value="${item.data_validade || ''}" 
                                       style="width: 100%; padding: 5px 8px; border-radius: 4px; border: 1px solid #ced4da; font-size:12px;"
                                       oninput="atualizarLoteField(${item.id}, 'data_validade', this.value)">
                            </div>
                            <div>
                                <label style="font-size:10px; font-weight:600; display:block; color:#856404;">Aviso (dias) *</label>
                                <input type="number" 
                                       min="1"
                                       value="${item.alerta_vencimento_dias || 30}" 
                                       style="width: 100%; padding: 5px 8px; border-radius: 4px; border: 1px solid #ced4da; font-size:12px;"
                                       oninput="atualizarLoteField(${item.id}, 'alerta_vencimento_dias', this.value)">
                            </div>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="carrinho-item" data-id="${item.id}">
                    <div class="carrinho-item-header">
                        <div>
                            <strong>${item.nome}</strong><br>
                            <small class="serial-badge" style="background:#e9ecef;">Cód: ${item.codigo || item.id}</small>
                        </div>
                        <button class="btn-remover" onclick="removerDoCarrinho(${item.id})">✕</button>
                    </div>
                    
                    <div class="carrinho-item-controls">
                        <div>
                            <label>Qtd:</label>
                            <input type="number" 
                                   min="1" 
                                   value="${item.quantidade}" 
                                   onchange="atualizarQtd(${item.id}, this.value)">
                        </div>
                        <div>
                            <label>R$ Compra Unit.:</label>
                            <input type="number" 
                                   step="0.01" 
                                   value="${item.valor_compra.toFixed(2)}" 
                                   onchange="atualizarPreco(${item.id}, this.value)"
                                   style="width: 100px;">
                        </div>
                        <div style="flex-grow:1; text-align:right; font-weight:bold;">
                            Subtotal: R$ ${subtotal.toFixed(2)}
                        </div>
                    </div>
                    
                    ${serialHtml}
                    ${loteHtml}
                </div>
            `;
        }).join('');
        
        atualizarTotais();
    }
    
    window.removerDoCarrinho = removerDoCarrinho;
    window.atualizarQtd = (id, novaQtd) => {
        const item = carrinho.find(i => i.id === id);
        if (!item) return;
        
        novaQtd = parseInt(novaQtd);
        if (isNaN(novaQtd) || novaQtd < 1) novaQtd = 1;
        
        item.quantidade = novaQtd;
        
        if (item.exige_serial) {
            while (item.seriais.length < novaQtd) {
                item.seriais.push({ serial: '', imei: '' });
            }
            while (item.seriais.length > novaQtd) {
                item.seriais.pop();
            }
        }
        
        renderizarCarrinho();
    };
    
    window.atualizarPreco = (id, novoPreco) => {
        const item = carrinho.find(i => i.id === id);
        if (!item) return;
        
        novoPreco = parseFloat(novoPreco);
        if (isNaN(novoPreco) || novoPreco < 0) novoPreco = 0;
        
        item.valor_compra = novoPreco;
        atualizarTotais();
    };
    
    window.atualizarSerial = (id, index, campo, valor) => {
        const item = carrinho.find(i => i.id === id);
        if (!item || !item.seriais[index]) return;
        
        item.seriais[index][campo] = valor.trim();
    };
    
    window.atualizarLoteField = (id, campo, valor) => {
        const item = carrinho.find(i => i.id === id);
        if (item) {
            if (campo === 'alerta_vencimento_dias') {
                item[campo] = parseInt(valor) || 30;
            } else {
                item[campo] = valor;
            }
        }
    };
    
    function atualizarTotais() {
        const total = carrinho.reduce((sum, item) => sum + (item.quantidade * item.valor_compra), 0);
        const totalElement = document.getElementById('totalNota');
        if (totalElement) {
            totalElement.textContent = `R$ ${total.toFixed(2)}`;
        }
    }
    
    // =====================================================
    // LISTAR ENTRADAS
    // =====================================================
    
    function renderizarEntradas(entradas) {
        const tbody = document.getElementById('entradasTableBody');
        if (!tbody) return;
        
        if (entradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhuma entrada registrada</td></tr>';
            return;
        }
        
        const podeExcluir = temPermissao('entradas', 'excluir');
        
        tbody.innerHTML = entradas.map(e => {
            const obs = e.observacao || '';
            const numMatch = obs.match(/Nota:\s*([^\s|]+)/);
            const serieMatch = obs.match(/Série:\s*([^\s|]+)/);
            const numeroNota = numMatch ? numMatch[1] : '-';
            const serieNota = serieMatch ? serieMatch[1] : '-';
            const obsPart = obs.split('Obs:')[1];
            const observacaoLimpa = obsPart ? obsPart.trim() : obs;
            
            return `
                <tr>
                    <td><strong>#${e.id}</strong></td>
                    <td>Nº ${numeroNota} / Série ${serieNota}</td>
                    <td>${new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>${e.clientes?.nome || 'Não Informado'}</td>
                    <td><span style="background:#e8f0fe; color:#1a73e8; font-weight:600; padding:2px 8px; border-radius:12px; font-size:11px;">${e.forma_pagamento || 'Dinheiro'}</span></td>
                    <td style="font-weight:bold; color:var(--success);">R$ ${(e.total || 0).toFixed(2)}</td>
                    <td><small>${observacaoLimpa}</small></td>
                    <td>
                        <button class="btn-info" onclick="verDetalhes(${e.id})" title="Ver Detalhes">👁️ Detalhes</button>
                        ${podeExcluir ? `<button class="btn-danger" onclick="excluirEntrada(${e.id})" title="Excluir Lançamento" style="margin-left:5px;">🗑️ Excluir</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // DETALHES
    // =====================================================
    
    window.verDetalhes = async (id) => {
        try {
            const { data: entrada, error: errorEntrada } = await supabaseClient
                .from('entradas')
                .select(`
                    *,
                    clientes:fornecedor_id(id, nome, documento, telefone, email, endereco)
                `)
                .eq('id', id)
                .single();
            
            if (errorEntrada) throw errorEntrada;
            
            const { data: itens, error: errorItens } = await supabaseClient
                .from('entrada_itens')
                .select(`
                    *,
                    produtos(id, nome, codigo, categoria, marca, modelo)
                `)
                .eq('entrada_id', id);
            
            if (errorItens) throw errorItens;
            
            const obs = entrada.observacao || '';
            const numMatch = obs.match(/Nota:\s*([^\s|]+)/);
            const serieMatch = obs.match(/Série:\s*([^\s|]+)/);
            const lanctoMatch = obs.match(/Data Lançamento:\s*([^\s|]+)/);
            
            const numeroNota = numMatch ? numMatch[1] : '-';
            const serieNota = serieMatch ? serieMatch[1] : '-';
            const dataLancamento = lanctoMatch ? lanctoMatch[1] : '-';
            const obsOriginal = obs.split('Obs:')[1] ? obs.split('Obs:')[1].trim() : obs;
            
            let fornecedorNome = 'Não Informado';
            let fornecedorTelefone = '-';
            let fornecedorEmail = '-';
            
            if (entrada.clientes) {
                fornecedorNome = entrada.clientes.nome || 'Não Informado';
                fornecedorTelefone = entrada.clientes.telefone || '-';
                fornecedorEmail = entrada.clientes.email || '-';
            }
            
            let html = `
                <div style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 15px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div>
                            <p><strong>Nº Registro:</strong> #${entrada.id}</p>
                            <p><strong>Número da Nota:</strong> ${numeroNota} (Série: ${serieNota})</p>
                            <p><strong>Fornecedor:</strong> ${fornecedorNome}</p>
                            <p><strong>Telefone / Email:</strong> ${fornecedorTelefone} / ${fornecedorEmail}</p>
                        </div>
                        <div>
                            <p><strong>Data Compra:</strong> ${new Date(entrada.data + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                            <p><strong>Data Lançamento:</strong> ${dataLancamento !== '-' ? new Date(dataLancamento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</p>
                            <p><strong>Total da Nota:</strong> <span style="font-weight:bold; color:var(--success);">R$ ${(entrada.total || 0).toFixed(2)}</span></p>
                            <p><strong>Forma de Pagamento:</strong> <span style="background:#e8f0fe; color:#1a73e8; font-weight:600; padding:2px 8px; border-radius:12px; font-size:11px;">${entrada.forma_pagamento || 'Dinheiro'}</span></p>
                            <p><strong>Observações:</strong> ${obsOriginal || '-'}</p>
                        </div>
                    </div>
                </div>
                
                <h3>📦 Produtos Lançados</h3>
                <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                    <thead>
                        <tr style="background:#f8f9fa; border-bottom: 2px solid var(--border);">
                            <th style="padding:10px; text-align:left;">Código</th>
                            <th style="padding:10px; text-align:left;">Produto</th>
                            <th style="padding:10px; text-align:center;">Qtd</th>
                            <th style="padding:10px; text-align:right;">Preço Unit.</th>
                            <th style="padding:10px; text-align:right;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            for (const item of itens) {
                const { data: seriais } = await supabaseClient
                    .from('produtos_seriais')
                    .select('numero_serie, imei')
                    .eq('produto_id', item.produto_id)
                    .like('observacao', `%Entrada: #${entrada.id}%`);
                
                let seriaisListHtml = '';
                if (seriais && seriais.length > 0) {
                    seriaisListHtml = `
                        <div style="font-size:11px; color:#555; background:#f1f3f5; padding:5px; border-radius:4px; margin-top:5px;">
                            <strong>Números de Série:</strong> ${seriais.map(s => `<code>${s.numero_serie}${s.imei ? ` (IMEI: ${s.imei})` : ''}</code>`).join(', ')}
                        </div>
                    `;
                }
                
                html += `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding:10px; vertical-align:top;">${item.produtos?.codigo || item.produto_id}</td>
                        <td style="padding:10px; vertical-align:top;">
                            <strong>${item.produtos?.nome || 'Produto Não Localizado'}</strong>
                            ${seriaisListHtml}
                        </td>
                        <td style="padding:10px; text-align:center; vertical-align:top;">${item.quantidade}</td>
                        <td style="padding:10px; text-align:right; vertical-align:top;">R$ ${(item.valor_unitario || 0).toFixed(2)}</td>
                        <td style="padding:10px; text-align:right; vertical-align:top;">R$ ${(item.subtotal || 0).toFixed(2)}</td>
                    </tr>
                `;
            }
            
            html += `
                    </tbody>
                </table>
            `;
            
            document.getElementById('detalhesBody').innerHTML = html;
            document.getElementById('modalDetalhes').style.display = 'flex';
        } catch (error) {
            console.error('Erro ao abrir detalhes:', error);
            mostrarNotificacao('Erro ao carregar detalhes da nota', 'error');
        }
    };
    
    // =====================================================
    // EXCLUIR ENTRADA
    // =====================================================
    
    window.excluirEntrada = async (id) => {
        if (!temPermissao('entradas', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir entradas!', 'error');
            return;
        }
        
        if (!confirm(`Tem certeza que deseja excluir a entrada #${id}? Esta ação não pode ser desfeita!`)) return;
        
        try {
            const { data: itens, error: errorItens } = await supabaseClient
                .from('entrada_itens')
                .select('*, produtos(id, nome, estoque_total)')
                .eq('entrada_id', id);
            
            if (errorItens) throw errorItens;
            
            for (const item of itens) {
                await supabaseClient
                    .from('produtos_seriais')
                    .delete()
                    .like('observacao', `%Entrada: #${id}%`)
                    .eq('produto_id', item.produto_id);
                
                const novoEstoque = (item.produtos.estoque_total || 0) - item.quantidade;
                await supabaseClient
                    .from('produtos')
                    .update({
                        estoque_total: novoEstoque,
                        ultima_movimentacao: new Date().toISOString()
                    })
                    .eq('id', item.produto_id);
            }
            
            await supabaseClient.from('entrada_itens').delete().eq('entrada_id', id);
            await supabaseClient.from('entradas').delete().eq('id', id);
            
            mostrarNotificacao('Entrada excluída com sucesso!', 'success');
            await carregarDados();
        } catch (error) {
            console.error('Erro ao excluir entrada:', error);
            mostrarNotificacao('Erro ao excluir entrada', 'error');
        }
    };
    
    // =====================================================
    // FINALIZAR ENTRADA
    // =====================================================
    
    async function finalizarEntrada() {
        if (!temPermissao('entradas', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar entradas!', 'error');
            return;
        }
        
        const fornecedorId = document.getElementById('selectFornecedor').value;
        const numeroNota = document.getElementById('numeroNota').value.trim();
        const serieNota = document.getElementById('serieNota').value.trim() || '1';
        const dataCompra = document.getElementById('dataCompra').value;
        const dataLancamento = document.getElementById('dataLancamento').value;
        const observacaoOriginal = document.getElementById('observacao').value.trim();
        const formaPagamento = document.getElementById('formaPagamento').value;
        const dataVencimentoBoleto = document.getElementById('dataVencimentoBoleto').value;
        
        if (!numeroNota) {
            mostrarNotificacao('Informe o número da nota!', 'error');
            return;
        }
        if (!fornecedorId) {
            mostrarNotificacao('Selecione o fornecedor!', 'error');
            return;
        }
        if (!dataCompra || !dataLancamento) {
            mostrarNotificacao('Informe as datas!', 'error');
            return;
        }
        if (formaPagamento === 'Boleto' && !dataVencimentoBoleto) {
            mostrarNotificacao('Informe a data de vencimento do boleto!', 'error');
            return;
        }
        if (carrinho.length === 0) {
            mostrarNotificacao('Adicione produtos ao lançamento!', 'error');
            return;
        }
        
        const todosSeriais = [];
        for (const item of carrinho) {
            if (item.exige_serial) {
                for (let i = 0; i < item.seriais.length; i++) {
                    const s = item.seriais[i];
                    if (!s.serial) {
                        mostrarNotificacao(`Preencha o Nº Série #${i+1} do produto "${item.nome}"!`, 'error');
                        return;
                    }
                    if (item.exige_imei && !s.imei) {
                        mostrarNotificacao(`Preencha o IMEI #${i+1} do produto "${item.nome}"!`, 'error');
                        return;
                    }
                    if (todosSeriais.includes(s.serial)) {
                        mostrarNotificacao(`Nº série duplicado: ${s.serial}`, 'error');
                        return;
                    }
                    todosSeriais.push(s.serial);
                }
            }
            if (item.controla_lote) {
                if (!item.lote || item.lote.trim() === '') {
                    mostrarNotificacao(`Preencha o Lote do produto "${item.nome}"!`, 'error');
                    return;
                }
                if (!item.data_validade) {
                    mostrarNotificacao(`Preencha a Data de Validade do produto "${item.nome}"!`, 'error');
                    return;
                }
            }
        }
        
        if (todosSeriais.length > 0) {
            const { data: seriaisExistentes } = await supabaseClient
                .from('produtos_seriais')
                .select('numero_serie')
                .in('numero_serie', todosSeriais);
            
            if (seriaisExistentes && seriaisExistentes.length > 0) {
                const nums = seriaisExistentes.map(s => s.numero_serie).join(', ');
                mostrarNotificacao(`Seriais já cadastrados: ${nums}`, 'error');
                return;
            }
        }
        
        const btnFinalizar = document.getElementById('btnFinalizarEntrada');
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = 'Gravando...';
        
        const totalNotaVal = carrinho.reduce((sum, item) => sum + (item.quantidade * item.valor_compra), 0);
        
        try {
            const observacaoFormatada = `Nota: ${numeroNota} | Série: ${serieNota} | Data Lançamento: ${dataLancamento} | Obs: ${observacaoOriginal}`;
            
            const { data: entrada, error: errorEntrada } = await supabaseClient
                .from('entradas')
                .insert([{
                    loja_id: usuario.loja_id,
                    fornecedor_id: parseInt(fornecedorId),
                    data: dataCompra,
                    observacao: observacaoFormatada,
                    total: totalNotaVal,
                    usuario_id: usuario.id,
                    forma_pagamento: formaPagamento
                }])
                .select()
                .single();
            
            if (errorEntrada) throw errorEntrada;

            // Se a forma de pagamento for Boleto, lançar o boleto a pagar
            if (formaPagamento === 'Boleto') {
                const { error: errorBoleto } = await supabaseClient
                    .from('boletos_pagar')
                    .insert([{
                        loja_id: usuario.loja_id,
                        fornecedor_id: parseInt(fornecedorId),
                        entrada_id: entrada.id,
                        data_vencimento: dataVencimentoBoleto,
                        valor: totalNotaVal,
                        confirmado: false
                    }]);
                
                if (errorBoleto) throw errorBoleto;
            }
            
            for (const item of carrinho) {
                const subtotal = item.quantidade * item.valor_compra;
                
                await supabaseClient
                    .from('entrada_itens')
                    .insert([{
                        entrada_id: entrada.id,
                        produto_id: item.id,
                        quantidade: item.quantidade,
                        valor_unitario: item.valor_compra,
                        subtotal: subtotal
                    }]);
                
                const { data: produtoObj } = await supabaseClient
                    .from('produtos')
                    .select('estoque_total')
                    .eq('id', item.id)
                    .single();
                
                const estoqueAtual = produtoObj?.estoque_total || 0;
                const novoEstoque = estoqueAtual + item.quantidade;
                
                const updatePayload = {
                    estoque_total: novoEstoque,
                    ultima_movimentacao: new Date().toISOString()
                };
                
                if (item.controla_lote) {
                    updatePayload.lote = item.lote;
                    updatePayload.data_validade = item.data_validade;
                    updatePayload.alerta_vencimento_dias = item.alerta_vencimento_dias;
                }
                
                await supabaseClient
                    .from('produtos')
                    .update(updatePayload)
                    .eq('id', item.id);
                
                if (item.exige_serial) {
                    for (const s of item.seriais) {
                        await supabaseClient
                            .from('produtos_seriais')
                            .insert([{
                                produto_id: item.id,
                                numero_serie: s.serial,
                                imei: s.imei || null,
                                status: 'disponivel',
                                data_entrada: new Date().toISOString(),
                                valor_compra: item.valor_compra,
                                valor_venda: item.valor_venda,
                                observacao: `Compra - Nota: ${numeroNota} | Entrada: #${entrada.id}`
                            }]);
                    }
                }
                
                await supabaseClient
                    .from('movimentos_estoque')
                    .insert([{
                        produto_id: item.id,
                        tipo: 'entrada',
                        quantidade: item.quantidade,
                        quantidade_anterior: estoqueAtual,
                        quantidade_nova: novoEstoque,
                        motivo: `Compra - Nota: ${numeroNota} | Fornecedor: ${fornecedores.find(f => f.id == fornecedorId)?.nome || ''}`,
                        data: new Date().toISOString(),
                        usuario_id: usuario.id
                    }]);
            }
            
            mostrarNotificacao(`Lançamento realizado! Nota Nº ${numeroNota}`, 'success');
            document.getElementById('modalEntrada').style.display = 'none';
            
            carrinho = [];
            document.getElementById('numeroNota').value = '';
            document.getElementById('selectFornecedor').value = '';
            document.getElementById('dataCompra').value = '';
            document.getElementById('dataLancamento').value = '';
            document.getElementById('observacao').value = '';
            
            await carregarDados();
        } catch (error) {
            console.error('Erro ao salvar entrada:', error);
            mostrarNotificacao('Erro ao lançar nota: ' + error.message, 'error');
        } finally {
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = 'Confirmar Entrada';
        }
    }
    
    // =====================================================
    // EVENTOS
    // =====================================================
    
    document.getElementById('btnNovaEntrada')?.addEventListener('click', () => {
        if (!temPermissao('entradas', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar entradas!', 'error');
            return;
        }
        
        carrinho = [];
        renderizarCarrinho();
        
        const hoje = new Date().toISOString().split('T')[0];
        document.getElementById('dataCompra').value = hoje;
        document.getElementById('dataLancamento').value = hoje;
        document.getElementById('serieNota').value = '1';
        
        document.getElementById('modalEntrada').style.display = 'flex';
    });
    
    document.getElementById('btnCancelarEntrada')?.addEventListener('click', () => {
        document.getElementById('modalEntrada').style.display = 'none';
    });
    
    document.getElementById('btnFinalizarEntrada')?.addEventListener('click', finalizarEntrada);
    
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalEntrada').style.display = 'none';
        });
    });
    
    document.querySelector('.close-detalhes')?.addEventListener('click', () => {
        document.getElementById('modalDetalhes').style.display = 'none';
    });
    
    // Forma de Pagamento e Boleto vencimento toggle
    document.getElementById('formaPagamento')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const group = document.getElementById('groupVencimentoBoleto');
        if (group) {
            if (val === 'Boleto') {
                group.style.display = 'block';
                document.getElementById('dataVencimentoBoleto').setAttribute('required', 'true');
                const data30Dias = new Date();
                data30Dias.setDate(data30Dias.getDate() + 30);
                document.getElementById('dataVencimentoBoleto').value = data30Dias.toISOString().split('T')[0];
            } else {
                group.style.display = 'none';
                document.getElementById('dataVencimentoBoleto').removeAttribute('required');
                document.getElementById('dataVencimentoBoleto').value = '';
            }
        }
    });

    // Sub-abas de Notas e Boletos
    document.getElementById('tabNotasFiscaisBtn')?.addEventListener('click', () => {
        document.getElementById('tabNotasFiscaisBtn').classList.add('active');
        document.getElementById('tabBoletosBtn').classList.remove('active');
        document.getElementById('secaoNotasFiscais').style.display = 'block';
        document.getElementById('secaoBoletos').style.display = 'none';
        document.getElementById('btnNovaEntrada').style.display = 'inline-block';
    });

    document.getElementById('tabBoletosBtn')?.addEventListener('click', () => {
        document.getElementById('tabNotasFiscaisBtn').classList.remove('active');
        document.getElementById('tabBoletosBtn').classList.add('active');
        document.getElementById('secaoNotasFiscais').style.display = 'none';
        document.getElementById('secaoBoletos').style.display = 'block';
        document.getElementById('btnNovaEntrada').style.display = 'none';
        carregarBoletos();
    });

    document.getElementById('btnFiltrarBoletos')?.addEventListener('click', carregarBoletos);

    // Cadastro Rápido de Produto
    document.getElementById('btnCriarProdutoRapido')?.addEventListener('click', () => {
        const modal = document.getElementById('modalProdutoRapido');
        if (!modal) return;
        const select = document.getElementById('rapidoCategoria');
        if (select) {
            select.innerHTML = '<option value="">Selecione a Categoria</option>' +
                categorias.map(c => `<option value="${c.nome}" data-id="${c.id}">${c.nome}</option>`).join('');
        }
        document.getElementById('produtoRapidoForm').reset();
        
        // Obter e preencher o próximo código de forma automática
        obterProximoCodigoProduto().then(proximoCodigo => {
            document.getElementById('rapidoCodigo').value = proximoCodigo;
        });
        
        modal.style.display = 'flex';
    });

    document.getElementById('btnCancelarRapido')?.addEventListener('click', () => {
        document.getElementById('modalProdutoRapido').style.display = 'none';
    });
    
    document.querySelector('.close-rapido')?.addEventListener('click', () => {
        document.getElementById('modalProdutoRapido').style.display = 'none';
    });

    document.getElementById('btnSalvarRapido')?.addEventListener('click', async () => {
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

        const btn = document.getElementById('btnSalvarRapido');
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
            document.getElementById('modalProdutoRapido').style.display = 'none';

            produtos.push(data);
            renderizarProdutos();
            adicionarAoCarrinho(data);
        } catch (error) {
            console.error('Erro ao cadastrar produto rápido:', error);
            mostrarNotificacao('Erro ao cadastrar produto', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar Produto';
        }
    });

    // Boletos logic
    let boletosList = [];

    async function carregarBoletos() {
        const tbody = document.getElementById('boletosTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--gray); padding: 40px 20px;">Carregando boletos...</td></tr>';
        }

        const status = document.getElementById('filtroStatusBoleto').value;
        const vencInicio = document.getElementById('filtroBoletoVencInicio').value;
        const vencFim = document.getElementById('filtroBoletoVencFim').value;

        try {
            let query = supabaseClient
                .from('boletos_pagar')
                .select('*, clientes:fornecedor_id(nome), entradas(observacao)');

            if (status !== 'todos') {
                query = query.eq('confirmado', status === 'pago');
            }
            if (vencInicio) query = query.gte('data_vencimento', vencInicio);
            if (vencFim) query = query.lte('data_vencimento', vencFim);

            const { data, error } = await query.order('data_vencimento', { ascending: true });
            if (error) throw error;

            boletosList = data || [];
            renderizarBoletos();
        } catch (error) {
            console.error('Erro ao carregar boletos:', error);
            mostrarNotificacao('Erro ao carregar boletos a pagar', 'error');
        }
    }

    function renderizarBoletos() {
        const tbody = document.getElementById('boletosTableBody');
        if (!tbody) return;

        if (boletosList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--gray); padding: 40px 20px;">Nenhum boleto encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = boletosList.map(b => {
            const dataVenc = b.data_vencimento ? b.data_vencimento.split('-').reverse().join('/') : '-';
            const dataPgto = b.data_pagamento ? b.data_pagamento.split('-').reverse().join('/') : '-';
            const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.valor || 0);
            
            const isPago = b.confirmado === true;
            const statusClass = isPago ? 'status-pago' : 'status-pendente';
            const statusText = isPago ? 'Confirmado' : 'Pendente';

            let numNota = '-';
            if (b.entradas?.observacao) {
                const match = b.entradas.observacao.match(/Nota:\s*([^\s|]+)/);
                if (match) numNota = match[1];
            }

            const btnConfirmarHtml = !isPago
                ? `<button class="btn-success" onclick="confirmarPagamentoBoleto(${b.id})" style="font-size:11px; padding:4px 8px; font-weight:600;">✅ Pagar</button>`
                : '-';

            return `
                <tr>
                    <td><strong>${b.clientes?.nome || 'Fornecedor Excluído'}</strong></td>
                    <td>Nota #${numNota}</td>
                    <td>${dataVenc}</td>
                    <td style="text-align: right; font-weight: 600;">${valorFmt}</td>
                    <td style="text-align: center;"><span class="badge-status ${statusClass}">${statusText}</span></td>
                    <td>${dataPgto}</td>
                    <td style="text-align: center;">${btnConfirmarHtml}</td>
                </tr>
            `;
        }).join('');
    }

    window.confirmarPagamentoBoleto = async (id) => {
        const boleto = boletosList.find(b => b.id === id);
        if (!boleto) return;

        if (!confirm(`Confirmar o pagamento deste boleto de R$ ${boleto.valor.toFixed(2)}?\nIsso gerará automaticamente um lançamento pago nas despesas.`)) return;

        try {
            const hojeLocal = new Date().toISOString().split('T')[0];

            const { error: errorBoleto } = await supabaseClient
                .from('boletos_pagar')
                .update({
                    confirmado: true,
                    data_pagamento: hojeLocal
                })
                .eq('id', id);

            if (errorBoleto) throw errorBoleto;

            let numNota = '-';
            if (boleto.entradas?.observacao) {
                const match = boleto.entradas.observacao.match(/Nota:\s*([^\s|]+)/);
                if (match) numNota = match[1];
            }

            const { error: errorDespesa } = await supabaseClient
                .from('despesas')
                .insert([{
                    descricao: `Pagamento do Boleto - Fornecedor: ${boleto.clientes?.nome || 'Fornecedor'} | Nota: #${numNota}`,
                    valor: boleto.valor,
                    data: hojeLocal,
                    categoria: 'Boleto Fornecedor',
                    status: 'pago',
                    loja_id: usuario.loja_id
                }]);

            if (errorDespesa) {
                console.error('Erro ao gerar despesa:', errorDespesa);
                mostrarNotificacao('Atenção: Boleto marcado como pago, mas houve um erro ao gerar o lançamento nas despesas.', 'warning');
            } else {
                mostrarNotificacao('Boleto pago e despesa gerada com sucesso!', 'success');
            }

            carregarBoletos();
        } catch (error) {
            console.error('Erro ao pagar boleto:', error);
            mostrarNotificacao('Erro ao processar pagamento do boleto', 'error');
        }
    };

    window.onclick = (event) => {
        if (event.target === document.getElementById('modalEntrada')) {
            document.getElementById('modalEntrada').style.display = 'none';
        }
        if (event.target === document.getElementById('modalDetalhes')) {
            document.getElementById('modalDetalhes').style.display = 'none';
        }
        if (event.target === document.getElementById('modalProdutoRapido')) {
            document.getElementById('modalProdutoRapido').style.display = 'none';
        }
    };
    
    await carregarDados();
    
    window.removerDoCarrinho = removerDoCarrinho;
    window.atualizarQtd = atualizarQtd;
    window.atualizarPreco = atualizarPreco;
    window.atualizarSerial = atualizarSerial;
    window.atualizarLoteField = atualizarLoteField;
    window.verDetalhes = verDetalhes;
    window.excluirEntrada = excluirEntrada;
});
