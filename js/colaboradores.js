// js/colaboradores.js
// Gerenciamento de colaboradores, comissões e comissionados

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    // Validar permissão
    if (!verificarPermissao('colaboradores', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }
    
    // Configurações do cabeçalho do usuário
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
    
    let colaboradores = [];
    
    // =====================================================
    // CARREGAR COLABORADORES
    // =====================================================
    async function carregarColaboradores() {
        const tbody = document.getElementById('colaboradoresTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray); padding: 40px 20px;">Carregando colaboradores...</td></tr>';
        }

        try {
            const { data, error } = await supabaseClient
                .from('colaboradores')
                .select('*')
                .order('nome', { ascending: true });
                
            if (error) throw error;
            colaboradores = data || [];
            renderizarTabelaColaboradores();
        } catch (error) {
            console.error('Erro ao carregar colaboradores:', error);
            mostrarNotificacao('Erro ao carregar colaboradores!', 'error');
        }
    }
    
    // =====================================================
    // RENDERIZAR TABELA
    // =====================================================
    function renderizarTabelaColaboradores() {
        const tbody = document.getElementById('colaboradoresTableBody');
        if (!tbody) return;
        
        const search = document.getElementById('searchColaborador').value.toLowerCase();
        
        const filtrados = colaboradores.filter(c => {
            const matchNome = (c.nome + ' ' + (c.sobrenome || '')).toLowerCase().includes(search);
            const matchFuncao = (c.funcao || '').toLowerCase().includes(search);
            return matchNome || matchFuncao;
        });
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray); padding: 40px 20px;">Nenhum colaborador encontrado.</td></tr>';
            return;
        }
        
        const podeEditar = verificarPermissao('colaboradores', 'editar');
        const podeExcluir = verificarPermissao('colaboradores', 'excluir');
        
        tbody.innerHTML = filtrados.map(c => {
            const dataNasc = c.data_nascimento ? new Date(c.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
            const comissaoVal = parseFloat(c.comissao || 0).toFixed(2);
            const statusText = c.ativo !== false ? '🟢 Ativo' : '🔴 Inativo';
            
            return `
                <tr>
                    <td><strong>${c.nome} ${c.sobrenome || ''}</strong></td>
                    <td>${c.funcao || '-'}</td>
                    <td>${c.telefone || '-'}</td>
                    <td><span class="commission-badge">${comissaoVal}%</span></td>
                    <td style="text-align: center;">${statusText}</td>
                    <td>${dataNasc}</td>
                    <td class="table-actions" style="text-align: center;">
                        ${podeEditar ? `<button class="btn-warning" onclick="editarColaborador(${c.id})" title="Editar">✏️</button>` : ''}
                        ${podeExcluir ? `<button class="btn-danger" onclick="excluirColaborador(${c.id})" title="Excluir">🗑️</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // SALVAR COLABORADOR
    // =====================================================
    async function salvarColaborador() {
        const id = document.getElementById('colaboradorId').value;
        const nome = document.getElementById('nome').value.trim();
        const sobrenome = document.getElementById('sobrenome').value.trim();
        const dataNascimento = document.getElementById('data_nascimento').value || null;
        const telefone = document.getElementById('telefone').value.trim();
        const funcao = document.getElementById('funcao').value.trim();
        const comissao = parseFloat(document.getElementById('comissao').value) || 0.00;
        const ativo = document.getElementById('ativo').checked;
        
        if (!nome) {
            mostrarNotificacao('O nome do colaborador é obrigatório!', 'error');
            return;
        }
        
        const btnSalvar = document.getElementById('btnSalvar');
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'Gravando...';
        
        const dados = {
            nome,
            sobrenome,
            data_nascimento: dataNascimento,
            telefone,
            funcao,
            comissao,
            ativo,
            loja_id: usuario.loja_id
        };
        
        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('colaboradores')
                    .update(dados)
                    .eq('id', id);
                    
                if (error) throw error;
                mostrarNotificacao('Colaborador atualizado com sucesso!', 'success');
            } else {
                const { error } = await supabaseClient
                    .from('colaboradores')
                    .insert([dados]);
                    
                if (error) throw error;
                mostrarNotificacao('Colaborador cadastrado com sucesso!', 'success');
            }
            
            document.getElementById('modalColaborador').style.display = 'none';
            carregarColaboradores();
        } catch (error) {
            console.error('Erro ao salvar colaborador:', error);
            mostrarNotificacao('Erro ao salvar colaborador!', 'error');
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = 'Salvar';
        }
    }
    
    // =====================================================
    // CRUD ACTIONS (EXPOSTAS NO ESCOPO GLOBAL)
    // =====================================================
    window.editarColaborador = (id) => {
        if (!verificarPermissao('colaboradores', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar colaboradores!', 'error');
            return;
        }
        
        const c = colaboradores.find(item => item.id === id);
        if (!c) return;
        
        document.getElementById('modalTitle').textContent = 'Editar Colaborador';
        document.getElementById('colaboradorId').value = c.id;
        document.getElementById('nome').value = c.nome;
        document.getElementById('sobrenome').value = c.sobrenome || '';
        document.getElementById('data_nascimento').value = c.data_nascimento || '';
        document.getElementById('telefone').value = c.telefone || '';
        document.getElementById('funcao').value = c.funcao || '';
        document.getElementById('comissao').value = c.comissao || '0.00';
        document.getElementById('ativo').checked = c.ativo !== false;
        
        document.getElementById('modalColaborador').style.display = 'flex';
    };
    
    window.excluirColaborador = async (id) => {
        if (!verificarPermissao('colaboradores', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir colaboradores!', 'error');
            return;
        }
        
        if (!confirm('Deseja realmente excluir este colaborador?')) return;
        
        try {
            const { error } = await supabaseClient
                .from('colaboradores')
                .delete()
                .eq('id', id);
                
            if (error) throw error;
            mostrarNotificacao('Colaborador excluído com sucesso!', 'success');
            carregarColaboradores();
        } catch (error) {
            console.error('Erro ao excluir colaborador:', error);
            mostrarNotificacao('Erro ao excluir colaborador!', 'error');
        }
    };
    
    // =====================================================
    // EVENT LISTENERS
    // =====================================================
    document.getElementById('btnNovoColaborador')?.addEventListener('click', () => {
        if (!verificarPermissao('colaboradores', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar colaboradores!', 'error');
            return;
        }
        
        document.getElementById('modalTitle').textContent = 'Novo Colaborador';
        document.getElementById('colaboradorForm').reset();
        document.getElementById('colaboradorId').value = '';
        document.getElementById('comissao').value = '0.00';
        document.getElementById('ativo').checked = true;
        
        document.getElementById('modalColaborador').style.display = 'flex';
    });
    
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modalColaborador').style.display = 'none';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modalColaborador').style.display = 'none';
    });
    
    document.getElementById('btnSalvar')?.addEventListener('click', salvarColaborador);
    
    document.getElementById('btnPesquisar')?.addEventListener('click', renderizarTabelaColaboradores);
    document.getElementById('searchColaborador')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            renderizarTabelaColaboradores();
        }
    });
    
    // Inicialização
    carregarColaboradores();
});
