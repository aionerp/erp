// js/clientes.js
// Gerenciamento de clientes

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    // Verificar permissão para clientes
    if (!verificarPermissao('clientes', 'ver')) {
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
    
    // Menu toggle
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
        });
    }
    
    let clientes = [];
    
    // =====================================================
    // CARREGAR CLIENTES
    // =====================================================
    
    async function carregarClientes() {
        try {
            console.log('🔄 Carregando clientes...');
            
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('*')
                .order('id', { ascending: false });
            
            if (error) {
                console.error('❌ Erro ao carregar clientes:', error);
                mostrarNotificacao('Erro ao carregar clientes: ' + error.message, 'error');
                return;
            }
            
            console.log(`✅ ${data?.length || 0} clientes carregados`);
            clientes = data || [];
            renderizarTabela();
            
        } catch (error) {
            console.error('❌ Erro inesperado:', error);
            mostrarNotificacao('Erro ao carregar clientes', 'error');
        }
    }
    
    function renderizarTabela() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        const filtrados = clientes.filter(c => 
            c.nome?.toLowerCase().includes(search) || 
            (c.telefone || '').includes(search) ||
            (c.email || '').toLowerCase().includes(search) ||
            (c.cpf_cnpj || '').includes(search)
        );
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum cliente encontrado</td></tr>';
            return;
        }
        
        // Verificar permissões para ações
        const podeEditar = verificarPermissao('clientes', 'editar');
        const podeExcluir = verificarPermissao('clientes', 'excluir');
        
        tbody.innerHTML = filtrados.map(c => {
            let acoesHtml = '';
            
            // Botão visualizar (todos podem ver)
            acoesHtml += `<button class="btn-info" onclick="visualizarCliente(${c.id})" title="Visualizar">👁️</button>`;
            
            // Botão editar (se tiver permissão)
            if (podeEditar) {
                acoesHtml += `<button class="btn-warning" onclick="editarCliente(${c.id})" title="Editar">✏️</button>`;
            }
            
            // Botão excluir (se tiver permissão)
            if (podeExcluir) {
                acoesHtml += `<button class="btn-danger" onclick="excluirCliente(${c.id})" title="Excluir">🗑️</button>`;
            }
            
            return `
                <tr>
                    <td>${c.id}</td>
                    <td><strong>${c.nome || '-'}</strong><br><small>${c.cpf_cnpj || ''}</small></td>
                    <td>${c.telefone || '-'}</td>
                    <td>${c.email || '-'}</td>
                    <td>${c.cidade || '-'}/${c.estado || '-'}</td>
                    <td class="table-actions">${acoesHtml}</td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // CRUD - COM VERIFICAÇÃO DE PERMISSÃO
    // =====================================================
    
    window.editarCliente = async (id) => {
        // Verificar permissão para editar
        if (!verificarPermissao('clientes', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar clientes!', 'error');
            return;
        }
        
        try {
            const cliente = clientes.find(c => c.id === id);
            if (!cliente) {
                mostrarNotificacao('Cliente não encontrado!', 'error');
                return;
            }
            
            document.getElementById('modalTitle').textContent = 'Editar Cliente';
            document.getElementById('clienteId').value = cliente.id;
            document.getElementById('nome').value = cliente.nome || '';
            document.getElementById('email').value = cliente.email || '';
            document.getElementById('telefone').value = cliente.telefone || '';
            document.getElementById('cpf_cnpj').value = cliente.cpf_cnpj || '';
            document.getElementById('endereco').value = cliente.endereco || '';
            document.getElementById('numero').value = cliente.numero || '';
            document.getElementById('bairro').value = cliente.bairro || '';
            document.getElementById('cidade').value = cliente.cidade || '';
            document.getElementById('estado').value = cliente.estado || '';
            document.getElementById('cep').value = cliente.cep || '';
            document.getElementById('observacao').value = cliente.observacao || '';
            
            document.getElementById('modal').style.display = 'flex';
        } catch (error) {
            console.error('Erro ao editar cliente:', error);
            mostrarNotificacao('Erro ao carregar dados do cliente', 'error');
        }
    };
    
    window.excluirCliente = async (id) => {
        // Verificar permissão para excluir
        if (!verificarPermissao('clientes', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir clientes!', 'error');
            return;
        }
        
        if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
        
        try {
            const { error } = await supabaseClient
                .from('clientes')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            mostrarNotificacao('Cliente excluído!', 'success');
            carregarClientes();
        } catch (error) {
            console.error('Erro ao excluir cliente:', error);
            mostrarNotificacao('Erro ao excluir cliente', 'error');
        }
    };
    
    window.visualizarCliente = async (id) => {
        try {
            const cliente = clientes.find(c => c.id === id);
            if (!cliente) {
                mostrarNotificacao('Cliente não encontrado!', 'error');
                return;
            }
            
            const modalBody = document.querySelector('#modal .modal-body');
            modalBody.innerHTML = `
                <div style="padding: 10px;">
                    <p><strong>Nome:</strong> ${cliente.nome || '-'}</p>
                    <p><strong>CPF/CNPJ:</strong> ${cliente.cpf_cnpj || '-'}</p>
                    <p><strong>Telefone:</strong> ${cliente.telefone || '-'}</p>
                    <p><strong>Email:</strong> ${cliente.email || '-'}</p>
                    <p><strong>Endereço:</strong> ${cliente.endereco || '-'}, ${cliente.numero || '-'}</p>
                    <p><strong>Bairro:</strong> ${cliente.bairro || '-'}</p>
                    <p><strong>Cidade/UF:</strong> ${cliente.cidade || '-'}/${cliente.estado || '-'}</p>
                    <p><strong>CEP:</strong> ${cliente.cep || '-'}</p>
                    <p><strong>Observação:</strong> ${cliente.observacao || '-'}</p>
                    <p><strong>Data Cadastro:</strong> ${cliente.created_at ? new Date(cliente.created_at).toLocaleDateString('pt-BR') : (cliente.data_cadastro ? new Date(cliente.data_cadastro).toLocaleDateString('pt-BR') : '-')}</p>
                </div>
            `;
            
            document.getElementById('modalTitle').textContent = 'Visualizar Cliente';
            document.getElementById('btnSalvar').style.display = 'none';
            document.getElementById('btnCancelar').textContent = 'Fechar';
            document.getElementById('modal').style.display = 'flex';
        } catch (error) {
            console.error('Erro ao visualizar cliente:', error);
            mostrarNotificacao('Erro ao carregar dados do cliente', 'error');
        }
    };
    
    // =====================================================
    // EVENTOS
    // =====================================================
    
    document.getElementById('btnNovo')?.addEventListener('click', () => {
        // Verificar permissão para criar
        if (!verificarPermissao('clientes', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar clientes!', 'error');
            return;
        }
        
        document.getElementById('modalTitle').textContent = 'Novo Cliente';
        document.getElementById('clienteId').value = '';
        document.getElementById('nome').value = '';
        document.getElementById('email').value = '';
        document.getElementById('telefone').value = '';
        document.getElementById('cpf_cnpj').value = '';
        document.getElementById('endereco').value = '';
        document.getElementById('numero').value = '';
        document.getElementById('bairro').value = '';
        document.getElementById('cidade').value = '';
        document.getElementById('estado').value = '';
        document.getElementById('cep').value = '';
        document.getElementById('observacao').value = '';
        document.getElementById('btnSalvar').style.display = 'block';
        document.getElementById('btnCancelar').textContent = 'Cancelar';
        document.getElementById('modal').style.display = 'flex';
    });
    
    document.getElementById('btnSalvar')?.addEventListener('click', async () => {
        // Verificar permissão para criar/editar
        const id = document.getElementById('clienteId').value;
        const permissao = id ? 'editar' : 'criar';
        
        if (!verificarPermissao('clientes', permissao)) {
            mostrarNotificacao(`Você não tem permissão para ${permissao === 'criar' ? 'criar' : 'editar'} clientes!`, 'error');
            return;
        }
        
        const dados = {
            nome: document.getElementById('nome').value.trim(),
            email: document.getElementById('email').value.trim(),
            telefone: document.getElementById('telefone').value.trim(),
            cpf_cnpj: document.getElementById('cpf_cnpj').value.trim(),
            endereco: document.getElementById('endereco').value.trim(),
            numero: document.getElementById('numero').value.trim(),
            bairro: document.getElementById('bairro').value.trim(),
            cidade: document.getElementById('cidade').value.trim(),
            estado: document.getElementById('estado').value,
            cep: document.getElementById('cep').value.trim(),
            observacao: document.getElementById('observacao').value.trim()
        };
        
        if (!dados.nome || !dados.telefone) {
            mostrarNotificacao('Preencha nome e telefone!', 'error');
            return;
        }
        
        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('clientes')
                    .update(dados)
                    .eq('id', id);
                
                if (error) throw error;
                mostrarNotificacao('Cliente atualizado!', 'success');
            } else {
                const { error } = await supabaseClient
                    .from('clientes')
                    .insert([dados]);
                
                if (error) throw error;
                mostrarNotificacao('Cliente cadastrado!', 'success');
            }
            
            document.getElementById('modal').style.display = 'none';
            document.getElementById('btnSalvar').style.display = 'block';
            carregarClientes();
        } catch (error) {
            console.error('Erro ao salvar cliente:', error);
            mostrarNotificacao('Erro ao salvar cliente', 'error');
        }
    });
    
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
        document.getElementById('btnSalvar').style.display = 'block';
        document.getElementById('btnCancelar').textContent = 'Cancelar';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
        document.getElementById('btnSalvar').style.display = 'block';
        document.getElementById('btnCancelar').textContent = 'Cancelar';
    });
    
    document.getElementById('searchInput')?.addEventListener('input', renderizarTabela);
    
    // Eventos de Exportação
    document.getElementById('btnExportExcel')?.addEventListener('click', () => {
        exportarTabelaParaExcel('clientesTable', 'relatorio_clientes');
    });
    
    document.getElementById('btnExportPDF')?.addEventListener('click', () => {
        exportarTabelaParaPDF('clientesTable', 'Relatório de Clientes', 'Lista de clientes cadastrados no sistema');
    });
    
    window.onclick = (event) => {
        if (event.target === document.getElementById('modal')) {
            document.getElementById('modal').style.display = 'none';
            document.getElementById('btnSalvar').style.display = 'block';
            document.getElementById('btnCancelar').textContent = 'Cancelar';
        }
    };
    
    // Inicializar
    carregarClientes();
});