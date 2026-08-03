// js/produtos.js
// Gerenciamento de produtos

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    if (!verificarPermissao('produtos', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }
    
    // Mostrar nome do usuário
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
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja sair?')) {
                sessionStorage.clear();
                window.location.href = 'index.html';
            }
        });
    }
    
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
        });
    }
    
    let produtos = [];
    let seriais = [];
    let currentPage = 1;
    let itemsPerPage = 10;
    let exigeIMEIActual = false;
    
    // =====================================================
    // CARREGAR DADOS
    // =====================================================
    
    async function carregarProdutos() {
        try {
            const { data, error } = await supabaseClient
                .from('produtos')
                .select('*')
                .order('nome');
            
            if (error) throw error;
            produtos = data || [];
            renderizarTabelaProdutos();
            carregarSelectProdutos();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao carregar produtos', 'error');
        }
    }
    
    async function carregarSeriais() {
        try {
            const { data, error } = await supabaseClient
                .from('produtos_seriais')
                .select(`
                    *,
                    produtos (id, nome, codigo, marca)
                `)
                .order('data_entrada', { ascending: false });
            
            if (error) throw error;
            seriais = data || [];
            renderizarTabelaSeriais();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao carregar seriais', 'error');
        }
    }
    
    async function carregarCategorias() {
        try {
            const { data, error } = await supabaseClient
                .from('categorias')
                .select('*')
                .eq('ativo', true)
                .order('nome');
            
            if (error) throw error;
            
            const selectFiltro = document.getElementById('filtroCategoria');
            const selectProduto = document.getElementById('categoria');
            
            const options = '<option value="">Todas Categorias</option>' +
                (data || []).map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
            
            if (selectFiltro) selectFiltro.innerHTML = options;
            if (selectProduto) {
                selectProduto.innerHTML = '<option value="">Selecione uma categoria</option>' +
                    (data || []).map(c => `<option value="${c.nome}" data-exige-imei="${c.exige_imei}" data-exige-serial="${c.exige_serial || c.exige_imei}">${c.nome}</option>`).join('');
                
                selectProduto.addEventListener('change', (e) => {
                    const selectedOption = e.target.options[e.target.selectedIndex];
                    if (!selectedOption || selectedOption.value === "") {
                        document.getElementById('seriaisContainer').style.display = 'none';
                        return;
                    }
                    const exigeIMEI = selectedOption.getAttribute('data-exige-imei') === 'true';
                    const exigeSerial = selectedOption.getAttribute('data-exige-serial') === 'true' || exigeIMEI;
                    exigeIMEIActual = exigeIMEI;
                    
                    const seriaisContainer = document.getElementById('seriaisContainer');
                    const avisoIMEI = document.getElementById('avisoIMEI');
                    
                    if (exigeSerial) {
                        if (seriaisContainer) seriaisContainer.style.display = 'block';
                        const quantidade = parseInt(document.getElementById('quantidade_estoque').value) || 1;
                        gerarCamposSerial(quantidade, exigeIMEIActual);
                        
                        if (exigeIMEIActual) {
                            if (!avisoIMEI) {
                                const msg = document.createElement('div');
                                msg.id = 'avisoIMEI';
                                msg.className = 'estoque-info-warning';
                                msg.style.marginTop = '10px';
                                msg.style.padding = '10px';
                                msg.style.borderRadius = '8px';
                                msg.innerHTML = '📱 <strong>ATENÇÃO:</strong> Esta categoria exige o preenchimento obrigatório do IMEI para cada unidade!';
                                document.getElementById('seriaisContainer').before(msg);
                            }
                        } else {
                            if (avisoIMEI) avisoIMEI.remove();
                        }
                    } else {
                        if (seriaisContainer) seriaisContainer.style.display = 'none';
                        if (avisoIMEI) avisoIMEI.remove();
                        const container = document.getElementById('seriaisList');
                        if (container) container.innerHTML = '';
                    }
                });
            }
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }
    
    async function carregarSelectProdutos() {
        const select = document.getElementById('filtroProdutoSerial');
        if (select) {
            select.innerHTML = '<option value="">Todos os Produtos</option>' +
                produtos.map(p => `<option value="${p.id}">${p.codigo} - ${p.nome}</option>`).join('');
        }
    }
    
    // =====================================================
    // FUNÇÕES DE SERIAL
    // =====================================================
    
    function gerarCamposSerial(quantidade, exigeIMEI = false) {
        const container = document.getElementById('seriaisList');
        if (!container) return;
        
        exigeIMEIActual = exigeIMEI;
        
        let html = '';
        for (let i = 0; i < quantidade; i++) {
            html += `
                <div class="serial-item" data-serial-index="${i}">
                    <input type="text" 
                           placeholder="Número de Série * (obrigatório)" 
                           class="serial-numero" 
                           data-index="${i}" 
                           required
                           style="border-left: 4px solid #dc3545;">
                    ${exigeIMEI ? `
                    <input type="text" 
                           placeholder="IMEI * (obrigatório para esta categoria)" 
                           class="serial-imei" 
                           data-index="${i}"
                           required
                           style="border-left: 4px solid #dc3545;">
                    ` : `
                    <input type="text" 
                           placeholder="IMEI (opcional)" 
                           class="serial-imei" 
                           data-index="${i}">
                    `}
                    <button type="button" 
                            class="btn-remove-serial" 
                            onclick="removerSerial(${i})" 
                            ${quantidade <= 1 ? 'disabled style="opacity:0.5"' : ''}>✕</button>
                </div>
            `;
        }
        container.innerHTML = html;
        
        document.querySelectorAll('.serial-numero').forEach(input => {
            input.addEventListener('input', function() {
                if (this.value.trim() !== '') {
                    this.style.border = '1px solid #28a745';
                    this.style.borderLeft = '4px solid #28a745';
                } else {
                    this.style.border = '1px solid #dc3545';
                    this.style.borderLeft = '4px solid #dc3545';
                }
            });
        });
        
        if (exigeIMEI) {
            document.querySelectorAll('.serial-imei').forEach(input => {
                input.addEventListener('input', function() {
                    if (this.value.trim() !== '') {
                        this.style.border = '1px solid #28a745';
                        this.style.borderLeft = '4px solid #28a745';
                    } else {
                        this.style.border = '1px solid #dc3545';
                        this.style.borderLeft = '4px solid #dc3545';
                    }
                });
            });
        }
    }
    
    window.removerSerial = (index) => {
        const quantidade = parseInt(document.getElementById('quantidade_estoque').value);
        if (quantidade <= 1) {
            mostrarNotificacao('O produto precisa ter pelo menos um número de série!', 'error');
            return;
        }
        document.getElementById('quantidade_estoque').value = quantidade - 1;
        gerarCamposSerial(quantidade - 1, exigeIMEIActual);
    };
    
    function validarSeriais() {
        const camposNumero = document.querySelectorAll('.serial-numero');
        let todosPreenchidos = true;
        let vazios = [];
        
        for (let i = 0; i < camposNumero.length; i++) {
            const valor = camposNumero[i].value.trim();
            if (valor === '') {
                todosPreenchidos = false;
                vazios.push(i + 1);
                camposNumero[i].style.border = '1px solid #dc3545';
                camposNumero[i].style.borderLeft = '4px solid #dc3545';
            } else {
                camposNumero[i].style.border = '1px solid #28a745';
                camposNumero[i].style.borderLeft = '4px solid #28a745';
            }
        }
        
        if (exigeIMEIActual) {
            const camposIMEI = document.querySelectorAll('.serial-imei');
            for (let i = 0; i < camposIMEI.length; i++) {
                const valor = camposIMEI[i].value.trim();
                if (valor === '') {
                    todosPreenchidos = false;
                    camposIMEI[i].style.border = '1px solid #dc3545';
                    camposIMEI[i].style.borderLeft = '4px solid #dc3545';
                } else {
                    camposIMEI[i].style.border = '1px solid #28a745';
                    camposIMEI[i].style.borderLeft = '4px solid #28a745';
                }
            }
        }
        
        if (!todosPreenchidos) {
            mostrarNotificacao(`Preencha todos os campos obrigatórios! Faltam ${vazios.length} campo(s).`, 'error');
            return false;
        }
        return true;
    }
    
    function coletarSeriais() {
        const seriaisList = [];
        const camposNumero = document.querySelectorAll('.serial-numero');
        
        for (let campo of camposNumero) {
            const numeroSerie = campo.value.trim();
            if (numeroSerie) {
                const index = campo.getAttribute('data-index');
                const imei = document.querySelector(`.serial-imei[data-index="${index}"]`)?.value || '';
                seriaisList.push({
                    numero_serie: numeroSerie,
                    imei: imei,
                    status: 'disponivel'
                });
            }
        }
        return seriaisList;
    }
    
    // =====================================================
    // RENDERIZAR PRODUTOS
    // =====================================================
    
    function renderizarTabelaProdutos() {
        const tbody = document.getElementById('produtosTableBody');
        if (!tbody) return;
        
        const search = document.getElementById('searchProduto')?.value.toLowerCase() || '';
        const categoria = document.getElementById('filtroCategoria')?.value || '';
        
        let filtrados = produtos.filter(p => {
            const matchSearch = p.nome?.toLowerCase().includes(search) || 
                               p.codigo?.toLowerCase().includes(search) ||
                               p.marca?.toLowerCase().includes(search);
            const matchCategoria = !categoria || p.categoria === categoria;
            return matchSearch && matchCategoria;
        });
        
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const produtosPagina = filtrados.slice(start, end);
        
        if (produtosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhum produto encontrado</td</td>';
            return;
        }
        
        const podeEditar = verificarPermissao('produtos', 'editar');
        const podeExcluir = verificarPermissao('produtos', 'excluir');
        
        tbody.innerHTML = produtosPagina.map(p => {
            const isServico = p.tipo === 'servico';
            const estoque = p.estoque_total || 0;
            const minimo = p.estoque_minimo || 5;
            const estoqueClass = estoque < minimo ? 'color: #dc3545; font-weight: bold;' : 'color: #28a745;';
            const estoqueText = isServico ? '<span style="color: var(--primary); font-weight: 600;">🛠️ Serviço</span>' : `${estoque} unid.`;
            const minEstoqueText = isServico ? '-' : (p.estoque_minimo || 5);
            
            return `
                <tr>
                    <td><strong>${p.codigo || '-'}</strong></td>
                    <td>
                        <strong>${p.nome}</strong><br>
                        <small class="serial-badge">${p.modelo || ''}</small>
                    </td>
                    <td>${p.categoria || '-'}</td>
                    <td>${p.marca || '-'}</td>
                    <td style="${isServico ? '' : estoqueClass}">${estoqueText}</td>
                    <td>${minEstoqueText}</td>
                    <td>R$ ${(p.valor_venda || 0).toFixed(2)}</td>
                    <td class="table-actions">
                        ${podeEditar ? `<button class="btn-warning" onclick="editarProduto(${p.id})" title="Editar">✏️</button>` : ''}
                        ${(usuario.config_loja?.habilitar_seriais !== false && !isServico) ? `<button class="btn-info" onclick="verSeriais(${p.id})" title="Ver Seriais">🔢</button>` : ''}
                        ${podeExcluir ? `<button class="btn-danger" onclick="excluirProduto(${p.id})" title="Excluir">🗑️</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
        
        renderizarPaginacao(filtrados.length);
    }
    
    function renderizarPaginacao(totalItems) {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;
        
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }
        
        let buttons = '';
        for (let i = 1; i <= totalPages; i++) {
            buttons += `<button class="${i === currentPage ? 'active' : ''}" onclick="irParaPagina(${i})">${i}</button>`;
        }
        pagination.innerHTML = buttons;
    }
    
    window.irParaPagina = (page) => {
        currentPage = page;
        renderizarTabelaProdutos();
    };
    
    // =====================================================
    // RENDERIZAR SERIAIS
    // =====================================================
    
    function renderizarTabelaSeriais() {
        const tbody = document.getElementById('seriaisTableBody');
        if (!tbody) return;
        
        const produtoId = document.getElementById('filtroProdutoSerial')?.value;
        const status = document.getElementById('filtroStatusSerial')?.value;
        const search = document.getElementById('searchSerial')?.value.toLowerCase() || '';
        
        let filtrados = seriais.filter(s => {
            const matchProduto = !produtoId || s.produto_id == produtoId;
            const matchStatus = !status || s.status === status;
            const matchSearch = s.numero_serie?.toLowerCase().includes(search) || 
                               (s.imei || '').toLowerCase().includes(search);
            return matchProduto && matchStatus && matchSearch;
        });
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhum serial encontrado</td</td>';
            return;
        }
        
        const podeEditar = verificarPermissao('produtos', 'editar');
        const podeExcluir = verificarPermissao('produtos', 'excluir');
        
        tbody.innerHTML = filtrados.map(s => {
            let statusClass = '';
            let statusText = '';
            
            switch(s.status) {
                case 'disponivel': statusClass = 'status-disponivel'; statusText = 'Disponível'; break;
                case 'vendido': statusClass = 'status-vendido'; statusText = 'Vendido'; break;
                case 'garantia': statusClass = 'status-garantia'; statusText = 'Em Garantia'; break;
                case 'defeito': statusClass = 'status-defeito'; statusText = 'Com Defeito'; break;
                default: statusClass = 'status-disponivel'; statusText = s.status;
            }
            
            return `
                <tr>
                    <td><strong>${s.produtos?.nome || '-'}</strong><br><small>${s.produtos?.codigo || ''}</small></td>
                    <td><code>${s.numero_serie}</code></td>
                    <td>${s.imei || '-'}</td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                    <td>R$ ${(s.valor_compra || 0).toFixed(2)}</td>
                    <td>R$ ${(s.valor_venda || 0).toFixed(2)}</td>
                    <td>${new Date(s.data_entrada).toLocaleDateString('pt-BR')}</td>
                    <td class="table-actions">
                        ${podeEditar ? `<button class="btn-warning" onclick="editarSerial(${s.id})" title="Editar Serial">✏️</button>` : ''}
                        ${podeExcluir ? `<button class="btn-danger" onclick="excluirSerial(${s.id})" title="Excluir Serial">🗑️</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // CRUD PRODUTOS
    // =====================================================
    
    window.editarProduto = async (id) => {
        if (!verificarPermissao('produtos', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar produtos!', 'error');
            return;
        }
        
        const produto = produtos.find(p => p.id === id);
        if (!produto) return;
        
        document.getElementById('modalProdutoTitle').textContent = 'Editar Produto';
        document.getElementById('produtoId').value = produto.id;
        document.getElementById('codigo').value = produto.codigo || '';
        document.getElementById('nome').value = produto.nome || '';
        document.getElementById('categoria').value = produto.categoria || '';
        document.getElementById('marca').value = produto.marca || '';
        document.getElementById('modelo').value = produto.modelo || '';
        document.getElementById('descricao').value = produto.descricao || '';
        document.getElementById('valor_compra').value = produto.valor_compra || '';
        document.getElementById('valor_venda').value = produto.valor_venda || '';
        document.getElementById('estoque_minimo').value = produto.estoque_minimo || 5;
        document.getElementById('garantia_dias').value = produto.garantia_dias || 0;
        document.getElementById('imagem').value = produto.imagem || '';
        
        const tipoSelect = document.getElementById('produtoTipo');
        if (tipoSelect) {
            tipoSelect.value = produto.tipo || 'produto';
            tipoSelect.dispatchEvent(new Event('change'));
        }
        
        document.getElementById('quantidade_estoque').value = 0;
        document.getElementById('quantidade_estoque').disabled = true;
        document.getElementById('seriaisList').innerHTML = `
            <div style="background: #e9ecef; padding: 15px; border-radius: 8px; text-align: center;">
                <strong>⚠️ Para gerenciar os números de série deste produto,</strong><br>
                utilize a guia <strong>"Controle de Série"</strong> após salvar.
            </div>
        `;
        
        document.getElementById('modalProduto').style.display = 'flex';
    };
    
    window.excluirProduto = async (id) => {
        if (!verificarPermissao('produtos', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir produtos!', 'error');
            return;
        }
        
        const produto = produtos.find(p => p.id === id);
        if (!confirm(`Tem certeza que deseja excluir o produto "${produto?.nome}"?`)) return;
        
        try {
            const { error } = await supabaseClient
                .from('produtos')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            mostrarNotificacao('Produto excluído!', 'success');
            carregarProdutos();
            carregarSeriais();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao excluir produto', 'error');
        }
    };
    
    window.verSeriais = (id) => {
        document.getElementById('filtroProdutoSerial').value = id;
        document.querySelector('.tab-btn[data-tab="seriais"]').click();
        document.getElementById('filtroStatusSerial').value = '';
        carregarSeriais();
    };
    
    // =====================================================
    // SALVAR PRODUTO
    // =====================================================
    
    async function salvarProduto() {
        const id = document.getElementById('produtoId').value;
        const quantidadeEstoque = parseInt(document.getElementById('quantidade_estoque').value);
        
        const dadosProduto = {
            codigo: document.getElementById('codigo').value,
            nome: document.getElementById('nome').value,
            tipo: document.getElementById('produtoTipo').value || 'produto',
            categoria: document.getElementById('categoria').value,
            marca: document.getElementById('marca').value,
            modelo: document.getElementById('modelo').value,
            descricao: document.getElementById('descricao').value,
            valor_compra: parseFloat(document.getElementById('valor_compra').value) || 0,
            valor_venda: parseFloat(document.getElementById('valor_venda').value) || 0,
            estoque_minimo: parseInt(document.getElementById('estoque_minimo').value) || 5,
            garantia_dias: parseInt(document.getElementById('garantia_dias').value) || 0,
            imagem: document.getElementById('imagem').value,
            updated_at: new Date().toISOString()
        };
        
        if (!dadosProduto.codigo || !dadosProduto.nome) {
            mostrarNotificacao('Preencha código e nome do produto!', 'error');
            return;
        }
        
        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('produtos')
                    .update(dadosProduto)
                    .eq('id', id);
                
                if (error) throw error;
                mostrarNotificacao('Produto atualizado!', 'success');
            } else {
                if (quantidadeEstoque === undefined || isNaN(quantidadeEstoque) || quantidadeEstoque < 0) {
                    mostrarNotificacao('Informe a quantidade em estoque!', 'error');
                    return;
                }
                
                const selectProduto = document.getElementById('categoria');
                const selectedOption = selectProduto?.options[selectProduto.selectedIndex];
                const exigeSerial = (usuario.config_loja?.habilitar_seriais !== false) && 
                                    (selectedOption?.getAttribute('data-exige-serial') === 'true' || 
                                     selectedOption?.getAttribute('data-exige-imei') === 'true');
                
                if (exigeSerial) {
                    const seriaisValidos = validarSeriais();
                    if (!seriaisValidos) return;
                    
                    const seriaisList = coletarSeriais();
                    
                    if (seriaisList.length !== quantidadeEstoque) {
                        mostrarNotificacao(`Preencha todos os ${quantidadeEstoque} números de série!`, 'error');
                        return;
                    }
                    
                    const { data, error } = await supabaseClient
                        .from('produtos')
                        .insert([dadosProduto])
                        .select();
                    
                    if (error) throw error;
                    
                    const produtoId = data[0].id;
                    
                    for (const serial of seriaisList) {
                        const { error: serialError } = await supabaseClient
                            .from('produtos_seriais')
                            .insert([{
                                produto_id: produtoId,
                                numero_serie: serial.numero_serie,
                                imei: serial.imei,
                                status: 'disponivel',
                                data_entrada: new Date().toISOString(),
                                valor_compra: dadosProduto.valor_compra,
                                valor_venda: dadosProduto.valor_venda
                            }]);
                        
                        if (serialError) throw serialError;
                    }
                    
                    await supabaseClient
                        .from('produtos')
                        .update({ estoque_total: seriaisList.length })
                        .eq('id', produtoId);
                    
                    mostrarNotificacao(`Produto cadastrado com ${seriaisList.length} número(s) de série!`, 'success');
                } else {
                    // Outros nichos: salva direto com a quantidade informada
                    dadosProduto.estoque_total = quantidadeEstoque;
                    const { error } = await supabaseClient
                        .from('produtos')
                        .insert([dadosProduto]);
                    
                    if (error) throw error;
                    mostrarNotificacao('Produto cadastrado com sucesso!', 'success');
                }
            }
            
            document.getElementById('modalProduto').style.display = 'none';
            document.getElementById('produtoForm').reset();
            document.getElementById('seriaisList').innerHTML = '';
            document.getElementById('quantidade_estoque').disabled = false;
            document.getElementById('quantidade_estoque').value = 1;
            
            carregarProdutos();
            carregarSeriais();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao salvar produto', 'error');
        }
    }
    
    // =====================================================
    // CRUD SERIAIS
    // =====================================================
    
    window.editarSerial = async (id) => {
        if (!verificarPermissao('produtos', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar seriais!', 'error');
            return;
        }
        
        const serial = seriais.find(s => s.id === id);
        if (!serial) return;
        
        document.getElementById('modalSerialTitle').textContent = 'Editar Número de Série';
        document.getElementById('serialId').value = serial.id;
        document.getElementById('serialProdutoId').value = serial.produto_id;
        document.getElementById('numero_serie').value = serial.numero_serie || '';
        document.getElementById('imei').value = serial.imei || '';
        document.getElementById('status_serial').value = serial.status || 'disponivel';
        document.getElementById('serial_valor_compra').value = serial.valor_compra || '';
        document.getElementById('serial_valor_venda').value = serial.valor_venda || '';
        document.getElementById('serial_observacao').value = serial.observacao || '';
        
        document.getElementById('modalSerial').style.display = 'flex';
    };
    
    window.excluirSerial = async (id) => {
        if (!verificarPermissao('produtos', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir seriais!', 'error');
            return;
        }
        
        if (!confirm('Tem certeza que deseja excluir este número de série?')) return;
        
        try {
            const { error } = await supabaseClient
                .from('produtos_seriais')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            mostrarNotificacao('Número de série excluído!', 'success');
            carregarSeriais();
            carregarProdutos();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao excluir serial', 'error');
        }
    };
    
    // =====================================================
    // EVENTOS
    // =====================================================
    
    document.getElementById('btnNovoProduto')?.addEventListener('click', () => {
        if (!verificarPermissao('produtos', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar produtos!', 'error');
            return;
        }
        
        document.getElementById('modalProdutoTitle').textContent = 'Novo Produto';
        document.getElementById('produtoForm').reset();
        document.getElementById('produtoId').value = '';
        document.getElementById('quantidade_estoque').value = 1;
        document.getElementById('quantidade_estoque').disabled = false;
        exigeIMEIActual = false;
        
        const tipoSelect = document.getElementById('produtoTipo');
        if (tipoSelect) {
            tipoSelect.value = 'produto';
            tipoSelect.dispatchEvent(new Event('change'));
        }
        
        const seriaisContainer = document.getElementById('seriaisContainer');
        if (seriaisContainer) seriaisContainer.style.display = 'none';
        
        const container = document.getElementById('seriaisList');
        if (container) container.innerHTML = '';
        
        const avisoIMEI = document.getElementById('avisoIMEI');
        if (avisoIMEI) avisoIMEI.remove();
        
        document.getElementById('modalProduto').style.display = 'flex';
    });
    
    document.getElementById('produtoTipo')?.addEventListener('change', (e) => {
        const tipo = e.target.value;
        const estoqueRow = document.getElementById('quantidade_estoque')?.closest('.form-group');
        const minEstoqueRow = document.getElementById('estoque_minimo')?.closest('.form-group');
        const seriaisContainer = document.getElementById('seriaisContainer');
        
        if (tipo === 'servico') {
            if (estoqueRow) estoqueRow.style.display = 'none';
            if (minEstoqueRow) minEstoqueRow.style.display = 'none';
            if (seriaisContainer) seriaisContainer.style.display = 'none';
            document.getElementById('quantidade_estoque').value = '1';
            document.getElementById('estoque_minimo').value = '0';
        } else {
            if (estoqueRow) estoqueRow.style.display = 'block';
            if (minEstoqueRow) minEstoqueRow.style.display = 'block';
            
            const selectProduto = document.getElementById('categoria');
            const selectedOption = selectProduto?.options[selectProduto.selectedIndex];
            const exigeSerial = selectedOption?.getAttribute('data-exige-serial') === 'true' || selectedOption?.getAttribute('data-exige-imei') === 'true';
            if (seriaisContainer) {
                seriaisContainer.style.display = exigeSerial ? 'block' : 'none';
            }
        }
    });
    
    document.getElementById('quantidade_estoque')?.addEventListener('input', (e) => {
        const selectProduto = document.getElementById('categoria');
        const selectedOption = selectProduto?.options[selectProduto.selectedIndex];
        const exigeSerial = selectedOption?.getAttribute('data-exige-serial') === 'true' || selectedOption?.getAttribute('data-exige-imei') === 'true';
        if (exigeSerial) {
            const quantidade = parseInt(e.target.value) || 0;
            if (quantidade > 0) {
                gerarCamposSerial(quantidade, exigeIMEIActual);
            }
        }
    });
    
    document.getElementById('btnSalvarProduto')?.addEventListener('click', salvarProduto);
    document.getElementById('btnCancelarProduto')?.addEventListener('click', () => {
        document.getElementById('modalProduto').style.display = 'none';
    });
    
    document.getElementById('btnSalvarSerial')?.addEventListener('click', salvarSerial);
    document.getElementById('btnCancelarSerial')?.addEventListener('click', () => {
        document.getElementById('modalSerial').style.display = 'none';
    });
    
    document.getElementById('btnPesquisar')?.addEventListener('click', () => {
        currentPage = 1;
        renderizarTabelaProdutos();
    });
    
    document.getElementById('searchProduto')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            renderizarTabelaProdutos();
        }
    });
    
    document.getElementById('filtroCategoria')?.addEventListener('change', () => {
        currentPage = 1;
        renderizarTabelaProdutos();
    });
    
    document.getElementById('btnPesquisarSerial')?.addEventListener('click', () => {
        carregarSeriais();
    });
    
    document.getElementById('filtroProdutoSerial')?.addEventListener('change', () => {
        carregarSeriais();
    });
    
    document.getElementById('filtroStatusSerial')?.addEventListener('change', () => {
        carregarSeriais();
    });
    
    document.getElementById('searchSerial')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            carregarSeriais();
        }
    });
    
    document.querySelectorAll('.close, .close-serial').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalProduto').style.display = 'none';
            document.getElementById('modalSerial').style.display = 'none';
        });
    });
    
    window.onclick = (event) => {
        if (event.target === document.getElementById('modalProduto')) {
            document.getElementById('modalProduto').style.display = 'none';
        }
        if (event.target === document.getElementById('modalSerial')) {
            document.getElementById('modalSerial').style.display = 'none';
        }
    };
    
    // Eventos de Exportação
    document.getElementById('btnExportExcel')?.addEventListener('click', () => {
        exportarTabelaParaExcel('produtosTable', 'relatorio_produtos');
    });
    
    document.getElementById('btnExportPDF')?.addEventListener('click', () => {
        exportarTabelaParaPDF('produtosTable', 'Relatório de Produtos', 'Lista de produtos cadastrados no sistema');
    });
    
    // Inicializar
    carregarCategorias();
    carregarProdutos();
    
    if (usuario.config_loja?.habilitar_seriais !== false) {
        carregarSeriais();
    } else {
        // Esconder os elementos relacionados a IMEI / Serial para outros nichos
        const seriaisContainer = document.getElementById('seriaisContainer');
        if (seriaisContainer) seriaisContainer.style.display = 'none';
        
        const estoqueInfo = document.querySelector('.estoque-info');
        if (estoqueInfo) {
            estoqueInfo.innerHTML = '<strong>ℹ️ INFORMAÇÕES:</strong> Informe a quantidade física disponível em estoque.';
        }
    }
});