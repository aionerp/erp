// js/fornecedores.js
// Gerenciamento de fornecedores

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    if (!verificarPermissao('fornecedores', 'ver')) {
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
    
    let fornecedores = [];
    
    // =====================================================
    // CARREGAR FORNECEDORES
    // =====================================================
    
    async function carregarFornecedores() {
        try {
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('*')
                .eq('tipo', 'fornecedor')
                .order('nome');
            
            if (error) throw error;
            
            fornecedores = data || [];
            renderizarTabela();
        } catch (error) {
            console.error('Erro ao carregar fornecedores:', error);
            mostrarNotificacao('Erro ao carregar fornecedores', 'error');
        }
    }
    
    // =====================================================
    // RENDERIZAR TABELA
    // =====================================================
    
    function renderizarTabela() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        
        const filtrados = fornecedores.filter(f => 
            f.nome?.toLowerCase().includes(search) || 
            (f.documento || f.cpf_cnpj || '').toLowerCase().includes(search) ||
            (f.email || '').toLowerCase().includes(search) ||
            (f.telefone || '').includes(search)
        );
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum fornecedor encontrado</td></tr>';
            return;
        }
        
        const podeEditar = verificarPermissao('fornecedores', 'editar');
        const podeExcluir = verificarPermissao('fornecedores', 'excluir');
        
        tbody.innerHTML = filtrados.map(f => {
            const ativo = f.ativo !== false;
            const statusClass = ativo ? 'badge-ativo' : 'badge-inativo';
            const statusText = ativo ? '✅ Ativo' : '❌ Inativo';
            const documento = f.documento || f.cpf_cnpj || '-';
            
            return `
                <tr>
                    <td>${f.id}</td>
                    <td><strong>${f.nome}</strong></td>
                    <td>${documento}</td>
                    <td>${f.telefone || '-'}</td>
                    <td>${f.email || '-'}</td>
                    <td><span class="badge-tipo ${statusClass}">${statusText}</span></td>
                    <td class="table-actions">
                        ${podeEditar ? `<button class="btn-warning" onclick="editarFornecedor(${f.id})" title="Editar">✏️</button>` : ''}
                        ${podeExcluir ? `<button class="btn-danger" onclick="excluirFornecedor(${f.id})" title="Excluir">🗑️</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // CRUD FORNECEDORES
    // =====================================================
    
    window.editarFornecedor = async (id) => {
        if (!verificarPermissao('fornecedores', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar fornecedores!', 'error');
            return;
        }
        
        try {
            const fornecedor = fornecedores.find(f => f.id === id);
            if (!fornecedor) {
                mostrarNotificacao('Fornecedor não encontrado!', 'error');
                return;
            }
            
            document.getElementById('modalTitle').textContent = 'Editar Fornecedor';
            document.getElementById('fornecedorId').value = fornecedor.id;
            document.getElementById('nome').value = fornecedor.nome || '';
            document.getElementById('documento').value = fornecedor.documento || fornecedor.cpf_cnpj || '';
            document.getElementById('telefone').value = fornecedor.telefone || '';
            document.getElementById('email').value = fornecedor.email || '';
            document.getElementById('endereco').value = fornecedor.endereco || '';
            document.getElementById('ativo').value = fornecedor.ativo !== false ? 'true' : 'false';
            document.getElementById('observacao').value = fornecedor.observacao || '';
            
            document.getElementById('modalFornecedor').style.display = 'flex';
        } catch (error) {
            console.error('Erro ao editar fornecedor:', error);
            mostrarNotificacao('Erro ao carregar dados do fornecedor', 'error');
        }
    };
    
    window.excluirFornecedor = async (id) => {
        if (!verificarPermissao('fornecedores', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir fornecedores!', 'error');
            return;
        }
        
        if (!confirm('Tem certeza que deseja excluir este fornecedor?')) return;
        
        try {
            const { error } = await supabaseClient
                .from('clientes')
                .delete()
                .eq('id', id)
                .eq('tipo', 'fornecedor');
            
            if (error) throw error;
            
            mostrarNotificacao('Fornecedor excluído!', 'success');
            await carregarFornecedores();
        } catch (error) {
            console.error('Erro ao excluir fornecedor:', error);
            mostrarNotificacao('Erro ao excluir fornecedor', 'error');
        }
    };
    
    async function salvarFornecedor() {
        const id = document.getElementById('fornecedorId').value;
        
        const nome = document.getElementById('nome').value.trim();
        const documento = document.getElementById('documento').value.trim();
        const telefone = document.getElementById('telefone').value.trim();
        const email = document.getElementById('email').value.trim();
        const endereco = document.getElementById('endereco').value.trim();
        const ativo = document.getElementById('ativo').value === 'true';
        const observacao = document.getElementById('observacao').value.trim();
        
        if (!nome) {
            mostrarNotificacao('O nome do fornecedor é obrigatório!', 'error');
            document.getElementById('nome').focus();
            return;
        }
        
        if (!telefone) {
            mostrarNotificacao('O telefone do fornecedor é obrigatório!', 'error');
            document.getElementById('telefone').focus();
            return;
        }
        
        const dados = {
            nome: nome,
            documento: documento,
            telefone: telefone,
            email: email,
            endereco: endereco,
            ativo: ativo,
            observacao: observacao,
            tipo: 'fornecedor'
        };
        
        try {
            if (id) {
                
                const { error } = await supabaseClient
                    .from('clientes')
                    .update(dados)
                    .eq('id', id);
                
                if (error) throw error;
                mostrarNotificacao('Fornecedor atualizado!', 'success');
            } else {
                const { error } = await supabaseClient
                    .from('clientes')
                    .insert([dados]);
                
                if (error) throw error;
                mostrarNotificacao('Fornecedor cadastrado!', 'success');
            }
            
            document.getElementById('modalFornecedor').style.display = 'none';
            document.getElementById('formFornecedor').reset();
            await carregarFornecedores();
        } catch (error) {
            console.error('Erro ao salvar fornecedor:', error);
            mostrarNotificacao('Erro ao salvar fornecedor: ' + (error.message || 'Verifique os dados'), 'error');
        }
    }
    
    // =====================================================
    // EVENTOS
    // =====================================================
    
    document.getElementById('searchInput')?.addEventListener('input', renderizarTabela);
    
    document.getElementById('btnNovoFornecedor')?.addEventListener('click', () => {
        if (!verificarPermissao('fornecedores', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar fornecedores!', 'error');
            return;
        }
        
        document.getElementById('modalTitle').textContent = 'Novo Fornecedor';
        document.getElementById('formFornecedor').reset();
        document.getElementById('fornecedorId').value = '';
        document.getElementById('ativo').value = 'true';
        document.getElementById('modalFornecedor').style.display = 'flex';
    });
    
    document.getElementById('btnSalvar')?.addEventListener('click', salvarFornecedor);
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modalFornecedor').style.display = 'none';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modalFornecedor').style.display = 'none';
    });
    
    carregarFornecedores();
    
    window.buscarFornecedores = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('id, nome, documento, telefone, email')
                .eq('tipo', 'fornecedor')
                .eq('ativo', true)
                .order('nome');
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Erro ao buscar fornecedores:', error);
            return [];
        }
    };
});