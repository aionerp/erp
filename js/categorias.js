// js/categorias.js
// Gerenciamento de categorias

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    // Verificar permissão para categorias
    if (!verificarPermissao('categorias', 'ver')) {
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
    
    let categorias = [];
    
    async function carregarCategorias() {
        try {
            const { data, error } = await supabaseClient
                .from('categorias')
                .select('*')
                .order('nome');
            
            if (error) throw error;
            categorias = data || [];
            renderizarTabela();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao carregar categorias', 'error');
        }
    }
    
    function renderizarTabela() {
        const tbody = document.getElementById('categoriasTableBody');
        if (!tbody) return;
        
        const search = document.getElementById('searchCategoria')?.value.toLowerCase() || '';
        const filtroStatus = document.getElementById('filtroStatus')?.value;
        const filtroIMEI = document.getElementById('filtroIMEI')?.value;
        
        let filtrados = categorias.filter(c => {
            const matchSearch = c.nome?.toLowerCase().includes(search) || 
                               (c.descricao || '').toLowerCase().includes(search);
            const matchStatus = !filtroStatus || c.ativo.toString() === filtroStatus;
            const matchIMEI = !filtroIMEI || c.exige_imei.toString() === filtroIMEI;
            return matchSearch && matchStatus && matchIMEI;
        });
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhuma categoria encontrada</td></tr>';
            return;
        }
        
        const podeEditar = verificarPermissao('categorias', 'editar');
        const podeExcluir = verificarPermissao('categorias', 'excluir');
        
        tbody.innerHTML = filtrados.map(c => `
            <tr>
                <td>${c.id}</td>
                <td><strong>${c.nome}</strong></td>
                <td>${c.descricao || '-'}</td>
                <td>
                    ${c.exige_imei 
                        ? '<span class="badge-imei badge-imei-obrigatorio">📱 IMEI Obrigatório</span>' 
                        : '<span class="badge-imei badge-imei-opcional">📱 IMEI Opcional</span>'}
                </td>
                <td>
                    ${c.exige_serial 
                        ? '<span class="badge-serial badge-serial-obrigatorio">🔢 Serial Obrigatório</span>' 
                        : '<span class="badge-serial">🔢 Serial Opcional</span>'}
                </td>
                <td>
                    ${c.ativo 
                        ? '<span class="badge-ativo">✅ Ativo</span>' 
                        : '<span class="badge-inativo">❌ Inativo</span>'}
                </td>
                <td>${c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                <td class="table-actions">
                    ${podeEditar ? `<button class="btn-warning" onclick="editarCategoria(${c.id})" title="Editar">✏️</button>` : ''}
                    ${podeExcluir ? `<button class="btn-danger" onclick="toggleStatusCategoria(${c.id}, ${!c.ativo})" title="${c.ativo ? 'Desativar' : 'Ativar'}">
                        ${c.ativo ? '🔴' : '🟢'}
                    </button>` : ''}
                </td>
            </tr>
        `).join('');
    }
    
    window.editarCategoria = async (id) => {
        if (!verificarPermissao('categorias', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar categorias!', 'error');
            return;
        }
        
        const categoria = categorias.find(c => c.id === id);
        if (!categoria) return;
        
        document.getElementById('modalCategoriaTitle').textContent = 'Editar Categoria';
        document.getElementById('categoriaId').value = categoria.id;
        document.getElementById('nome').value = categoria.nome || '';
        document.getElementById('descricao').value = categoria.descricao || '';
        document.getElementById('exige_imei').checked = categoria.exige_imei || false;
        document.getElementById('exige_serial').checked = categoria.exige_serial !== false;
        document.getElementById('ativo').checked = categoria.ativo !== false;
        
        document.getElementById('modalCategoria').style.display = 'flex';
    };
    
    window.toggleStatusCategoria = async (id, novoStatus) => {
        if (!verificarPermissao('categorias', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para alterar status!', 'error');
            return;
        }
        
        const acao = novoStatus ? 'ativar' : 'desativar';
        if (!confirm(`Tem certeza que deseja ${acao} esta categoria?`)) return;
        
        try {
            const { error } = await supabaseClient
                .from('categorias')
                .update({ 
                    ativo: novoStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (error) throw error;
            
            mostrarNotificacao(`Categoria ${novoStatus ? 'ativada' : 'desativada'}!`, 'success');
            carregarCategorias();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao alterar status', 'error');
        }
    };
    
    async function salvarCategoria() {
        const id = document.getElementById('categoriaId').value;
        const nome = document.getElementById('nome').value.trim();
        
        if (!nome) {
            mostrarNotificacao('Informe o nome da categoria!', 'error');
            return;
        }
        
        const dados = {
            nome: nome,
            descricao: document.getElementById('descricao').value,
            exige_imei: document.getElementById('exige_imei').checked,
            exige_serial: document.getElementById('exige_serial').checked,
            ativo: document.getElementById('ativo').checked,
            updated_at: new Date().toISOString()
        };
        
        if (!id) {
            const existe = categorias.some(c => c.nome.toLowerCase() === nome.toLowerCase());
            if (existe) {
                mostrarNotificacao('Já existe uma categoria com este nome!', 'error');
                return;
            }
        }
        
        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('categorias')
                    .update(dados)
                    .eq('id', id);
                
                if (error) throw error;
                mostrarNotificacao('Categoria atualizada!', 'success');
            } else {
                dados.created_at = new Date().toISOString();
                const { error } = await supabaseClient
                    .from('categorias')
                    .insert([dados]);
                
                if (error) throw error;
                mostrarNotificacao('Categoria cadastrada!', 'success');
            }
            
            document.getElementById('modalCategoria').style.display = 'none';
            document.getElementById('categoriaForm').reset();
            carregarCategorias();
        } catch (error) {
            console.error('Erro:', error);
            mostrarNotificacao('Erro ao salvar categoria', 'error');
        }
    }
    
    // Eventos
    document.getElementById('btnNovaCategoria')?.addEventListener('click', () => {
        if (!verificarPermissao('categorias', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar categorias!', 'error');
            return;
        }
        
        document.getElementById('modalCategoriaTitle').textContent = 'Nova Categoria';
        document.getElementById('categoriaForm').reset();
        document.getElementById('categoriaId').value = '';
        document.getElementById('exige_serial').checked = true;
        document.getElementById('ativo').checked = true;
        document.getElementById('modalCategoria').style.display = 'flex';
    });
    
    document.getElementById('btnSalvar')?.addEventListener('click', salvarCategoria);
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modalCategoria').style.display = 'none';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modalCategoria').style.display = 'none';
    });
    
    document.getElementById('searchCategoria')?.addEventListener('input', renderizarTabela);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarTabela);
    document.getElementById('filtroIMEI')?.addEventListener('change', renderizarTabela);
    
    window.onclick = (event) => {
        if (event.target === document.getElementById('modalCategoria')) {
            document.getElementById('modalCategoria').style.display = 'none';
        }
    };
    
    // Eventos de Exportação
    document.getElementById('btnExportExcel')?.addEventListener('click', () => {
        exportarTabelaParaExcel('categoriasTable', 'relatorio_categorias');
    });
    
    document.getElementById('btnExportPDF')?.addEventListener('click', () => {
        exportarTabelaParaPDF('categoriasTable', 'Relatório de Categorias', 'Lista de categorias cadastradas no sistema');
    });
    
    carregarCategorias();
});