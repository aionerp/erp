// js/usuarios.js
// Gerenciamento de usuários

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    if (!temPermissao('usuarios', 'ver')) {
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
    
    let usuarios = [];
    
    // =====================================================
    // PERMISSÕES POR PERFIL
    // =====================================================
    
    const PERMISSOES_POR_PERFIL = {
        admin: {
            dashboard: { ver: true },
            clientes: { ver: true, criar: true, editar: true, excluir: true },
            produtos: { ver: true, criar: true, editar: true, excluir: true },
            categorias: { ver: true, criar: true, editar: true, excluir: true },
            estoque: { ver: true, ajustar: true },
            entradas: { ver: true, criar: true, excluir: true },
            saidas: { ver: true, criar: true, cancelar: true, ver_vendas_outros: true },
            fornecedores: { ver: true, criar: true, editar: true, excluir: true },
            relatorios: { ver: true, exportar: true },
            usuarios: { ver: true, criar: true, editar: true, excluir: true }
        },
        gerente: {
            dashboard: { ver: true },
            clientes: { ver: true, criar: true, editar: true, excluir: false },
            produtos: { ver: true, criar: true, editar: true, excluir: false },
            categorias: { ver: true, criar: false, editar: false, excluir: false },
            estoque: { ver: true, ajustar: false },
            entradas: { ver: true, criar: true, excluir: false },
            saidas: { ver: true, criar: true, cancelar: true, ver_vendas_outros: true },
            fornecedores: { ver: true, criar: true, editar: true, excluir: false },
            relatorios: { ver: true, exportar: true },
            usuarios: { ver: false, criar: false, editar: false, excluir: false }
        },
        vendedor: {
            dashboard: { ver: true },
            clientes: { ver: true, criar: true, editar: true, excluir: false },
            produtos: { ver: true, criar: false, editar: false, excluir: false },
            categorias: { ver: false },
            estoque: { ver: true, ajustar: false },
            entradas: { ver: false },
            saidas: { ver: true, criar: true, cancelar: false, ver_vendas_outros: false },
            fornecedores: { ver: false },
            relatorios: { ver: false },
            usuarios: { ver: false }
        },
        tecnico: {
            dashboard: { ver: true },
            clientes: { ver: true, criar: true, editar: true, excluir: false },
            produtos: { ver: true, criar: false, editar: false, excluir: false },
            categorias: { ver: false },
            estoque: { ver: false },
            entradas: { ver: false },
            saidas: { ver: false, criar: false, cancelar: false, ver_vendas_outros: false },
            fornecedores: { ver: false },
            relatorios: { ver: false },
            usuarios: { ver: false }
        },
        basico: {
            dashboard: { ver: false },
            clientes: { ver: true, criar: false, editar: false, excluir: false },
            produtos: { ver: true, criar: false, editar: false, excluir: false },
            categorias: { ver: false },
            estoque: { ver: false },
            entradas: { ver: false },
            saidas: { ver: false, criar: false, cancelar: false, ver_vendas_outros: false },
            fornecedores: { ver: false },
            relatorios: { ver: false },
            usuarios: { ver: false }
        }
    };
    
    // =====================================================
    // CARREGAR USUÁRIOS
    // =====================================================
    
    async function carregarUsuarios() {
        try {
            const { data, error } = await supabaseClient
                .from('usuarios')
                .select('*')
                .order('nome');
            
            if (error) throw error;
            usuarios = data || [];
            renderizarTabela();
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            mostrarNotificacao('Erro ao carregar usuários', 'error');
        }
    }
    
    function renderizarTabela() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        const search = document.getElementById('searchUsuario')?.value.toLowerCase() || '';
        const perfil = document.getElementById('filtroPerfil')?.value;
        const status = document.getElementById('filtroStatus')?.value;
        
        const filtrados = usuarios.filter(u => {
            const matchSearch = u.nome?.toLowerCase().includes(search) || 
                               u.email?.toLowerCase().includes(search);
            const matchPerfil = !perfil || u.perfil === perfil;
            const matchStatus = !status || u.ativo.toString() === status;
            return matchSearch && matchPerfil && matchStatus;
        });
        
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum usuário encontrado</td></tr>';
            return;
        }
        
        const perfilLabelsMap = {
            admin: '👑 Administrador',
            gerente: '📊 Gerente',
            vendedor: '💰 Vendedor',
            tecnico: '🔧 Técnico',
            basico: '👤 Básico'
        };
        
        const perfilClasses = {
            admin: 'perfil-admin',
            gerente: 'perfil-gerente',
            vendedor: 'perfil-vendedor',
            tecnico: 'perfil-tecnico',
            basico: 'perfil-basico'
        };
        
        const podeEditar = temPermissao('usuarios', 'editar');
        const podeExcluir = temPermissao('usuarios', 'excluir');
        
        tbody.innerHTML = filtrados.map(u => `
            <tr>
                <td>${u.id}</td>
                <td><strong>${u.nome}</strong></td>
                <td>${u.email}</td>
                <td><span class="perfil-badge ${perfilClasses[u.perfil] || 'perfil-basico'}">${perfilLabelsMap[u.perfil] || u.perfil}</span></td>
                <td>${u.ativo ? '✅ Ativo' : '❌ Inativo'}</td>
                <td>${u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleDateString('pt-BR') : '-'}</td>
                <td class="table-actions">
                    ${podeEditar ? `<button class="btn-warning" onclick="editarUsuario(${u.id})" title="Editar">✏️</button>` : ''}
                    ${podeExcluir ? `<button class="btn-danger" onclick="toggleStatus(${u.id}, ${!u.ativo})" title="${u.ativo ? 'Desativar' : 'Ativar'}">
                        ${u.ativo ? '🔴' : '🟢'}
                    </button>` : ''}
                </td>
            </tr>
        `).join('');
    }
    
    // =====================================================
    // CRUD USUÁRIOS
    // =====================================================
    
    function carregarPermissoes(perfil, customPermissoes = null) {
        const container = document.getElementById('permissoesContainer');
        const defaultPermissoes = PERMISSOES_POR_PERFIL[perfil] || PERMISSOES_POR_PERFIL.basico;
        const usuarioIdAberto = document.getElementById('usuarioId').value;
        
        const labels = {
            dashboard: '📊 Dashboard',
            clientes: '👥 Clientes',
            produtos: '📦 Serviços & Produtos',
            categorias: '🏷️ Categorias',
            estoque: '💾 Estoque',
            entradas: '📥 Entradas',
            saidas: '💳 PDV / Vendas',
            fornecedores: '🏭 Fornecedores',
            ordens_servico: '🔧 OS',
            relatorios: '📈 Relatórios',
            usuarios: '👤 Usuários'
        };
        
        container.innerHTML = Object.entries(defaultPermissoes).map(([modulo, permissoesModulo]) => {
            const permissoesHtml = Object.entries(permissoesModulo).map(([acao, defaultValor]) => {
                const valor = (customPermissoes && customPermissoes[modulo] && customPermissoes[modulo][acao] !== undefined)
                    ? customPermissoes[modulo][acao]
                    : defaultValor;

                const acaoLabels = {
                    ver: 'Visualizar',
                    criar: 'Cadastrar',
                    editar: 'Editar',
                    excluir: 'Excluir',
                    cancelar: 'Cancelar',
                    ajustar: 'Ajustar',
                    exportar: 'Exportar',
                    ver_vendas_outros: 'Visualizar Venda de Outros Usuários'
                };
                const labelText = acaoLabels[acao] || acao.charAt(0).toUpperCase() + acao.slice(1);
                
                return `
                <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-weight: normal; cursor: pointer;">
                    <input type="checkbox" 
                           data-modulo="${modulo}" 
                           data-acao="${acao}"
                           ${valor ? 'checked' : ''} 
                           ${usuarioIdAberto ? '' : 'disabled'}
                           class="checkbox-permissao"
                    >
                    ${labelText}
                </label>
                `;
            }).join('');
            
            return `
                <div class="permissoes-card">
                    <h4>${labels[modulo] || modulo}</h4>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
                        ${permissoesHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    document.getElementById('perfil')?.addEventListener('change', (e) => {
        carregarPermissoes(e.target.value);
    });
    
    window.editarUsuario = async (id) => {
        if (!temPermissao('usuarios', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar usuários!', 'error');
            return;
        }
        
        try {
            const usuario = usuarios.find(u => u.id === id);
            if (!usuario) return;
            
            document.getElementById('modalTitle').textContent = 'Editar Usuário';
            document.getElementById('usuarioId').value = usuario.id;
            document.getElementById('nome').value = usuario.nome || '';
            document.getElementById('email').value = usuario.email || '';
            document.getElementById('email').disabled = true;
            document.getElementById('senha').value = '';
            document.getElementById('senha').placeholder = 'Deixe em branco para manter a senha atual';
            document.getElementById('senha').required = false;
            document.getElementById('perfil').value = usuario.perfil || 'basico';
            document.getElementById('telefone').value = usuario.telefone || '';
            document.getElementById('cargo').value = usuario.cargo || '';
            document.getElementById('ativo').value = usuario.ativo ? 'true' : 'false';
            
            carregarPermissoes(usuario.perfil || 'basico', usuario.permissoes);
            
            document.getElementById('modalUsuario').style.display = 'flex';
        } catch (error) {
            console.error('Erro ao editar usuário:', error);
            mostrarNotificacao('Erro ao carregar dados do usuário', 'error');
        }
    };
    
    window.toggleStatus = async (id, novoStatus) => {
        if (!temPermissao('usuarios', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para alterar status!', 'error');
            return;
        }
        
        if (!confirm(`Tem certeza que deseja ${novoStatus ? 'ativar' : 'desativar'} este usuário?`)) return;
        
        try {
            const { error } = await supabaseClient
                .from('usuarios')
                .update({ ativo: novoStatus })
                .eq('id', id);
            
            if (error) throw error;
            
            mostrarNotificacao(`Usuário ${novoStatus ? 'ativado' : 'desativado'}!`, 'success');
            carregarUsuarios();
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            mostrarNotificacao('Erro ao alterar status', 'error');
        }
    };
    
    async function salvarUsuario() {
        const id = document.getElementById('usuarioId').value;
        const nome = document.getElementById('nome').value.trim();
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        const perfil = document.getElementById('perfil').value;
        const telefone = document.getElementById('telefone').value.trim();
        const cargo = document.getElementById('cargo').value.trim();
        const ativo = document.getElementById('ativo').value === 'true';
        
        if (!nome || !email) {
            mostrarNotificacao('Preencha nome e email!', 'error');
            return;
        }
        
        if (!id && !senha) {
            mostrarNotificacao('Informe a senha para o novo usuário!', 'error');
            return;
        }
        
        // Coletar permissões marcadas nos checkboxes
        let permissoes = PERMISSOES_POR_PERFIL[perfil] || PERMISSOES_POR_PERFIL.basico;
        
        // Se estamos editando, permitir customizar permissões
        if (id) {
            permissoes = {};
            const checkboxes = document.querySelectorAll('.checkbox-permissao');
            checkboxes.forEach(checkbox => {
                const modulo = checkbox.getAttribute('data-modulo');
                const acao = checkbox.getAttribute('data-acao');
                
                if (!permissoes[modulo]) {
                    permissoes[modulo] = {};
                }
                permissoes[modulo][acao] = checkbox.checked;
            });
        }
        
        const dados = {
            nome: nome,
            email: email,
            perfil: perfil,
            telefone: telefone,
            cargo: cargo,
            ativo: ativo,
            permissoes: permissoes
        };
        
        if (senha) {
            dados.senha = senha;
        }
        
        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('usuarios')
                    .update(dados)
                    .eq('id', id);
                
                if (error) throw error;
                mostrarNotificacao('✅ Usuário atualizado com sucesso!', 'success');
            } else {
                const { error } = await supabaseClient
                    .from('usuarios')
                    .insert([dados]);
                
                if (error) throw error;
                mostrarNotificacao('✅ Usuário criado com sucesso!', 'success');
            }
            
            document.getElementById('modalUsuario').style.display = 'none';
            document.getElementById('usuarioForm').reset();
            document.getElementById('email').disabled = false;
            document.getElementById('senha').required = true;
            document.getElementById('senha').placeholder = '';
            carregarUsuarios();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            mostrarNotificacao('❌ Erro ao salvar usuário: ' + error.message, 'error');
        }
    }
    
    // =====================================================
    // TABS
    // =====================================================
    
    function initTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');
                
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
    }
    
    // =====================================================
    // EVENTOS
    // =====================================================
    
    document.getElementById('btnNovoUsuario')?.addEventListener('click', () => {
        if (!temPermissao('usuarios', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar usuários!', 'error');
            return;
        }
        
        document.getElementById('modalTitle').textContent = 'Novo Usuário';
        document.getElementById('usuarioForm').reset();
        document.getElementById('usuarioId').value = '';
        document.getElementById('email').disabled = false;
        document.getElementById('senha').required = true;
        document.getElementById('senha').placeholder = '';
        document.getElementById('perfil').value = 'basico';
        document.getElementById('ativo').value = 'true';
        carregarPermissoes('basico');
        document.getElementById('modalUsuario').style.display = 'flex';
    });
    
    document.getElementById('btnSalvar')?.addEventListener('click', salvarUsuario);
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modalUsuario').style.display = 'none';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modalUsuario').style.display = 'none';
    });
    
    window.onclick = (event) => {
        if (event.target === document.getElementById('modalUsuario')) {
            document.getElementById('modalUsuario').style.display = 'none';
        }
    };
    
    document.getElementById('searchUsuario')?.addEventListener('input', renderizarTabela);
    document.getElementById('filtroPerfil')?.addEventListener('change', renderizarTabela);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarTabela);
    
    // =====================================================
    // INICIALIZAR
    // =====================================================
    
    carregarUsuarios();
    initTabs();
    
    window.editarUsuario = editarUsuario;
    window.toggleStatus = toggleStatus;
});
