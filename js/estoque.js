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
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });
    
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    let produtos = [];
    let seriaisDisponiveis = [];
    
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
            produtos = data || [];
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
        
        const filtrados = produtos.filter(p => 
            p.nome?.toLowerCase().includes(search) || 
            (p.codigo || '').toLowerCase().includes(search) ||
            (p.marca || '').toLowerCase().includes(search)
        );
        
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum produto encontrado</td></tr>';
            return;
        }
        
        const podeAjustar = verificarPermissao('estoque', 'ajustar');
        
        tbody.innerHTML = filtrados.map(p => {
            const estoque = p.estoque_total || p.estoque || 0;
            const minimo = p.estoque_minimo || 5;
            let status = '', statusClass = '';
            
            if (estoque <= 0) { 
                status = 'ESGOTADO'; 
                statusClass = 'status-critico'; 
            } else if (estoque < minimo) { 
                status = 'CRÍTICO'; 
                statusClass = 'status-critico'; 
            } else if (estoque < minimo * 2) { 
                status = 'BAIXO'; 
                statusClass = 'status-baixo'; 
            } else { 
                status = 'NORMAL'; 
                statusClass = 'status-normal'; 
            }
            
            return `
                <tr>
                    <td>${p.codigo || p.id}</td>
                    <td>
                        <strong>${p.nome}</strong><br>
                        <small class="serial-badge">${p.marca || ''} ${p.modelo || ''}</small>
                    </td>
                    <td>${p.categoria || '-'}</td>
                    <td style="font-weight:bold; ${estoque < minimo ? 'color:#dc3545' : 'color:#28a745'}">${estoque} unid.</td>
                    <td>${minimo}</td>
                    <td><span class="status-estoque ${statusClass}">${status}</span></td>
                    <td>
                        ${podeAjustar ? `<button class="btn-warning" onclick="ajustarEstoque(${p.id})" title="Ajustar Estoque">✏️ Ajustar</button>` : ''}
                        <button class="btn-info" onclick="verHistorico(${p.id})" title="Ver Histórico" style="margin-left:5px;">📜 Histórico</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // VERIFICAR SE PRODUTO EXIGE SERIAL
    // =====================================================
    
    async function produtoExigeSerial(produto) {
        try {
            const { data: categoria } = await supabaseClient
                .from('categorias')
                .select('exige_serial')
                .eq('nome', produto.categoria)
                .maybeSingle();
            
            if (categoria?.exige_serial === true) return true;
            if (produto.categoria === 'Celular') return true;
            
            const { count } = await supabaseClient
                .from('produtos_seriais')
                .select('*', { count: 'exact', head: true })
                .eq('produto_id', produto.id);
            
            return count > 0;
        } catch (error) {
            return false;
        }
    }
    
    // =====================================================
    // GERAR CAMPOS DE SERIAL DINÂMICOS
    // =====================================================
    
    function gerarCamposSerial(quantidade, exigeIMEI = false) {
        const container = document.getElementById('seriaisDinamicos');
        if (!container) return;
        
        if (quantidade <= 0) {
            container.innerHTML = '';
            return;
        }
        
        let html = `
            <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
                <div style="font-weight: 600; margin-bottom: 10px; color: #dc3545;">
                    🔢 Números de Série (OBRIGATÓRIO) - ${quantidade} item(ns)
                </div>
        `;
        
        for (let i = 0; i < quantidade; i++) {
            html += `
                <div class="serial-item" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; padding: 8px; background: white; border-radius: 6px; border: 1px solid #e9ecef;">
                    <input type="text" 
                           placeholder="Nº Série #${i + 1} *" 
                           class="serial-numero" 
                           data-index="${i}"
                           required
                           style="padding: 8px; border: 1px solid #dc3545; border-radius: 4px; font-family: monospace;">
                    ${exigeIMEI ? `
                        <input type="text" 
                               placeholder="IMEI #${i + 1} *" 
                               class="serial-imei" 
                               data-index="${i}"
                               required
                               style="padding: 8px; border: 1px solid #dc3545; border-radius: 4px; font-family: monospace;">
                    ` : `
                        <input type="text" 
                               placeholder="IMEI (opcional)" 
                               class="serial-imei" 
                               data-index="${i}"
                               style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;">
                    `}
                </div>
            `;
        }
        
        html += `
                <div style="margin-top: 8px; font-size: 12px; color: #dc3545;">
                    ⚠️ O número de série é OBRIGATÓRIO para cada unidade
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        document.querySelectorAll('.serial-numero').forEach(input => {
            input.addEventListener('input', function() {
                if (this.value.trim() !== '') {
                    this.style.border = '1px solid #28a745';
                } else {
                    this.style.border = '1px solid #dc3545';
                }
            });
        });
        
        if (exigeIMEI) {
            document.querySelectorAll('.serial-imei').forEach(input => {
                input.addEventListener('input', function() {
                    if (this.value.trim() !== '') {
                        this.style.border = '1px solid #28a745';
                    } else {
                        this.style.border = '1px solid #dc3545';
                    }
                });
            });
        }
    }
    
    function coletarSeriais() {
        const seriais = [];
        const camposNumero = document.querySelectorAll('.serial-numero');
        const camposIMEI = document.querySelectorAll('.serial-imei');
        
        for (let i = 0; i < camposNumero.length; i++) {
            const numero = camposNumero[i].value.trim();
            if (numero) {
                const imei = camposIMEI[i]?.value.trim() || '';
                seriais.push({
                    numero_serie: numero,
                    imei: imei
                });
            }
        }
        return seriais;
    }
    
    function validarSeriais(quantidade, exigeIMEI = false) {
        const camposNumero = document.querySelectorAll('.serial-numero');
        let todosPreenchidos = true;
        let erros = [];
        
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
        
        if (exigeIMEI) {
            const camposIMEI = document.querySelectorAll('.serial-imei');
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
        
        if (!todosPreenchidos) {
            mostrarNotificacao(`Preencha todos os campos obrigatórios: ${erros.join(', ')}`, 'error');
            return false;
        }
        return true;
    }
    
    // =====================================================
    // AJUSTAR ESTOQUE
    // =====================================================
    
    window.ajustarEstoque = async (id) => {
        if (!verificarPermissao('estoque', 'ajustar')) {
            mostrarNotificacao('Você não tem permissão para ajustar estoque!', 'error');
            return;
        }
        
        const produto = produtos.find(p => p.id === id);
        if (!produto) return;
        
        const exigeSerial = await produtoExigeSerial(produto);
        const exigeIMEI = produto.categoria === 'Celular';
        
        document.getElementById('produtoId').value = produto.id;
        document.getElementById('produtoNome').value = produto.nome;
        const estoqueAtual = produto.estoque_total || produto.estoque || 0;
        document.getElementById('estoqueAtual').value = estoqueAtual;
        document.getElementById('quantidade').value = '1';
        document.getElementById('motivo').value = '';
        document.getElementById('tipo').value = 'entrada';
        
        document.getElementById('seriaisDinamicos').innerHTML = '';
        document.getElementById('serialContainer').style.display = 'none';
        document.getElementById('serialContainer').innerHTML = '';
        
        document.getElementById('modal').style.display = 'flex';
        await carregarInterfaceSerial();
    };
    
    // =====================================================
    // CARREGAR INTERFACE DE SERIAL
    // =====================================================
    
    async function carregarInterfaceSerial() {
        const tipo = document.getElementById('tipo').value;
        const produtoId = document.getElementById('produtoId').value;
        const produto = produtos.find(p => p.id == produtoId);
        const quantidade = parseInt(document.getElementById('quantidade').value) || 1;
        const exigeSerial = await produtoExigeSerial(produto);
        const exigeIMEI = produto?.categoria === 'Celular';
        
        const serialContainer = document.getElementById('serialContainer');
        const seriaisDinamicos = document.getElementById('seriaisDinamicos');
        
        if (!exigeSerial) {
            serialContainer.style.display = 'none';
            seriaisDinamicos.innerHTML = '';
            return;
        }
        
        serialContainer.style.display = 'block';
        
        if (tipo === 'entrada') {
            gerarCamposSerial(quantidade, exigeIMEI);
            seriaisDinamicos.style.display = 'block';
            
            document.getElementById('quantidade').addEventListener('change', function() {
                const novaQuantidade = parseInt(this.value) || 1;
                gerarCamposSerial(novaQuantidade, exigeIMEI);
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
    
    document.getElementById('tipo')?.addEventListener('change', carregarInterfaceSerial);
    document.getElementById('quantidade')?.addEventListener('change', function() {
        if (document.getElementById('tipo').value === 'entrada') {
            carregarInterfaceSerial();
        }
    });
    
    // =====================================================
    // HISTÓRICO
    // =====================================================
    
    window.verHistorico = async (id) => {
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
                        <h2>Histórico de Movimentações - ${produto.nome}</h2>
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
        if (!verificarPermissao('estoque', 'ajustar')) {
            mostrarNotificacao('Você não tem permissão para ajustar estoque!', 'error');
            return;
        }
        
        const id = document.getElementById('produtoId').value;
        const tipo = document.getElementById('tipo').value;
        const quantidade = parseInt(document.getElementById('quantidade').value);
        const motivo = document.getElementById('motivo').value;
        const produto = produtos.find(p => p.id == id);
        
        if (!quantidade || quantidade <= 0) {
            mostrarNotificacao('Quantidade inválida!', 'error');
            return;
        }
        
        const estoqueAtual = produto.estoque_total || produto.estoque || 0;
        const exigeSerial = await produtoExigeSerial(produto);
        const exigeIMEI = produto.categoria === 'Celular';
        
        if (tipo === 'entrada' && exigeSerial) {
            const seriais = coletarSeriais();
            
            if (seriais.length !== quantidade) {
                mostrarNotificacao(`Preencha todos os ${quantidade} números de série!`, 'error');
                return;
            }
            
            if (!validarSeriais(quantidade, exigeIMEI)) return;
            
            const numeros = seriais.map(s => s.numero_serie);
            const duplicados = numeros.filter((item, index) => numeros.indexOf(item) !== index);
            if (duplicados.length > 0) {
                mostrarNotificacao(`Números de série duplicados: ${duplicados.join(', ')}`, 'error');
                return;
            }
            
            for (const serial of seriais) {
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
        
        let seriaisSelecionados = [];
        if (tipo === 'saida' && exigeSerial) {
            const checkboxes = document.querySelectorAll('.serial-checkbox:checked');
            seriaisSelecionados = Array.from(checkboxes).map(cb => ({
                id: parseInt(cb.value),
                serial: cb.getAttribute('data-serial'),
                imei: cb.getAttribute('data-imei')
            }));
            
            if (seriaisSelecionados.length === 0) {
                mostrarNotificacao('Selecione pelo menos um número de série para dar saída!', 'error');
                return;
            }
            
            if (seriaisSelecionados.length !== quantidade) {
                mostrarNotificacao(`A quantidade selecionada (${seriaisSelecionados.length}) não corresponde à quantidade informada (${quantidade})!`, 'error');
                return;
            }
        }
        
        if (tipo === 'saida' && !exigeSerial && estoqueAtual < quantidade) {
            mostrarNotificacao(`Estoque insuficiente! Disponível: ${estoqueAtual}`, 'error');
            return;
        }
        
        const novoEstoque = tipo === 'entrada' 
            ? estoqueAtual + quantidade 
            : estoqueAtual - quantidade;
        
        try {
            const updateData = {
                estoque_total: novoEstoque,
                updated_at: new Date().toISOString()
            };
            
            try {
                updateData.ultima_movimentacao = new Date().toISOString();
            } catch(e) {}
            
            const { error: updateError } = await supabaseClient
                .from('produtos')
                .update(updateData)
                .eq('id', id);
            
            if (updateError) throw updateError;
            
            if (tipo === 'entrada' && exigeSerial) {
                const seriais = coletarSeriais();
                
                for (const serial of seriais) {
                    const { error: insertSerialError } = await supabaseClient
                        .from('produtos_seriais')
                        .insert([{
                            produto_id: id,
                            numero_serie: serial.numero_serie,
                            imei: serial.imei || null,
                            status: 'disponivel',
                            data_entrada: new Date().toISOString(),
                            valor_compra: produto.valor_compra,
                            valor_venda: produto.valor_venda,
                            observacao: `Entrada manual - ${new Date().toLocaleDateString('pt-BR')}`
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
                        motivo: motivo || `Entrada de ${quantidade} unidade(s) com serial(is)`,
                        data: new Date().toISOString(),
                        usuario_id: usuario.id
                    }]);
            }
            
            if (tipo === 'saida' && exigeSerial && seriaisSelecionados.length > 0) {
                for (const serial of seriaisSelecionados) {
                    await supabaseClient
                        .from('produtos_seriais')
                        .update({ 
                            status: 'vendido',
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
                            motivo: motivo || `Saída - Serial: ${serial.serial}`,
                            data: new Date().toISOString(),
                            usuario_id: usuario.id
                        }]);
                }
            }
            
            if (!exigeSerial) {
                await supabaseClient
                    .from('movimentos_estoque')
                    .insert([{
                        produto_id: id,
                        tipo: tipo,
                        quantidade: quantidade,
                        quantidade_anterior: estoqueAtual,
                        quantidade_nova: novoEstoque,
                        motivo: motivo || `Ajuste manual - ${tipo === 'entrada' ? 'adição' : 'remoção'}`,
                        data: new Date().toISOString(),
                        usuario_id: usuario.id
                    }]);
            }
            
            mostrarNotificacao(`✅ Estoque atualizado! Novo estoque: ${novoEstoque}`, 'success');
            document.getElementById('modal').style.display = 'none';
            await carregarProdutos();
        } catch (error) {
            console.error('Erro ao ajustar estoque:', error);
            mostrarNotificacao('Erro ao ajustar estoque: ' + error.message, 'error');
        }
    }
    
    // =====================================================
    // EVENTOS
    // =====================================================
    
    document.getElementById('searchInput')?.addEventListener('input', renderizarTabela);
    
    document.getElementById('btnAjustar')?.addEventListener('click', () => {
        if (!verificarPermissao('estoque', 'ajustar')) {
            mostrarNotificacao('Você não tem permissão para ajustar estoque!', 'error');
            return;
        }
        
        if (produtos.length > 0) {
            const produtoSelect = document.createElement('select');
            produtoSelect.id = 'produtoSelectTemp';
            produtoSelect.style.padding = '10px';
            produtoSelect.style.width = '100%';
            produtoSelect.style.marginBottom = '15px';
            produtoSelect.innerHTML = '<option value="">Selecione um produto</option>' +
                produtos.map(p => `<option value="${p.id}">${p.nome} (Estoque: ${p.estoque_total || p.estoque || 0})</option>`).join('');
            
            mostrarNotificacaoComSelect('Selecione o produto para ajustar:', produtoSelect, (produtoId) => {
                if (produtoId) ajustarEstoque(parseInt(produtoId));
            });
        } else {
            mostrarNotificacao('Nenhum produto cadastrado!', 'error');
        }
    });
    
    function mostrarNotificacaoComSelect(mensagem, select, callback) {
        const modalTemp = document.createElement('div');
        modalTemp.className = 'modal';
        modalTemp.style.display = 'flex';
        modalTemp.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Selecionar Produto</h2>
                    <span class="close-temp" style="cursor:pointer;">&times;</span>
                </div>
                <div class="modal-body">
                    <p>${mensagem}</p>
                    <div class="form-group" style="margin-top:15px;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-warning" id="btnCancelarTemp">Cancelar</button>
                    <button class="btn-primary" id="btnConfirmarTemp">Confirmar</button>
                </div>
            </div>
        `;
        
        modalTemp.querySelector('.modal-body .form-group').appendChild(select);
        document.body.appendChild(modalTemp);
        
        modalTemp.querySelector('.close-temp').addEventListener('click', () => modalTemp.remove());
        modalTemp.querySelector('#btnCancelarTemp').addEventListener('click', () => modalTemp.remove());
        modalTemp.querySelector('#btnConfirmarTemp').addEventListener('click', () => {
            const produtoId = select.value;
            modalTemp.remove();
            if (produtoId) callback(produtoId);
        });
    }
    
    document.getElementById('btnSalvar')?.addEventListener('click', salvarAjuste);
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });
    
    window.onclick = (event) => {
        const modal = document.getElementById('modal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
    
    // Eventos de Exportação
    document.getElementById('btnExportExcel')?.addEventListener('click', () => {
        exportarTabelaParaExcel('estoqueTable', 'relatorio_estoque');
    });
    
    document.getElementById('btnExportPDF')?.addEventListener('click', () => {
        exportarTabelaParaPDF('estoqueTable', 'Relatório de Estoque', 'Lista de níveis de estoque de produtos');
    });
    
    // Inicializar
    await carregarProdutos();
    
    window.ajustarEstoque = ajustarEstoque;
    window.verHistorico = verHistorico;
    window.toggleCheckbox = toggleCheckbox;
});