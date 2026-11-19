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
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && typeof window.fazerLogout === 'function') {
        logoutBtn.addEventListener('click', window.fazerLogout);
    }
    
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    let usuarios = [];

    // Obter prefixo da loja atual
    function obterPrefixoLoja() {
        if (window.ENV?.PREFIX) return window.ENV.PREFIX.toLowerCase();
        if (window.ENV?.CLIENT_ID) return window.ENV.CLIENT_ID.toLowerCase();
        const u = JSON.parse(sessionStorage.getItem('usuario'));
        if (u && u.email && u.email.includes('.')) {
            const parts = u.email.split('.');
            return parts[parts.length - 1].toLowerCase();
        }
        return 'aionerp';
    }

    // Listener para o campo de nome de usuário com prefixo automático
    const inputUsernameBase = document.getElementById('username_base');
    if (inputUsernameBase) {
        inputUsernameBase.addEventListener('input', (e) => {
            const prefixo = obterPrefixoLoja();
            const val = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
            e.target.value = val;
            const fullUser = val ? `${val}.${prefixo}` : '';
            const emailHidden = document.getElementById('email');
            const preview = document.getElementById('previewUsuarioGerado');
            if (emailHidden) emailHidden.value = fullUser;
            if (preview) preview.textContent = fullUser || `exemplo.${prefixo}`;
        });
    }
    
    // Schema e perfis são providos centralmente por window.AionPermissoes (definido em config.js)
    const SCHEMA_PERMISSOES = window.AionPermissoes?.SCHEMA || {};
    const PERMISSOES_POR_PERFIL = window.AionPermissoes?.PERFIS_PADRAO || {};

    
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
        if (!container) return;

        const schema = window.AionPermissoes?.SCHEMA || {};
        const perfisPadrao = window.AionPermissoes?.PERFIS_PADRAO || {};
        const perfilDefaults = perfisPadrao[perfil] || perfisPadrao.basico || {};

        // Agrupar módulos por categoria funcional
        const grupos = {};
        for (const [moduloKey, moduloMeta] of Object.entries(schema)) {
            const grupoNome = moduloMeta.grupo || 'Outros';
            if (!grupos[grupoNome]) grupos[grupoNome] = [];
            grupos[grupoNome].push({ modulo: moduloKey, ...moduloMeta });
        }

        let html = '';
        for (const [grupoNome, modulosDoGrupo] of Object.entries(grupos)) {
            html += `
                <div class="permissoes-grupo-wrapper" data-grupo="${grupoNome.toLowerCase()}">
                    <div class="permissoes-grupo-header">
                        <span>📁 ${grupoNome}</span>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="btn-toggle-card" onclick="window.toggleGrupoPermissoes('${grupoNome}', true)">Marcar Grupo</button>
                            <span style="color:#cbd5e1">|</span>
                            <button type="button" class="btn-toggle-card" onclick="window.toggleGrupoPermissoes('${grupoNome}', false)">Desmarcar Grupo</button>
                        </div>
                    </div>
                    <div class="permissoes-grupo-cards">
            `;

            for (const mod of modulosDoGrupo) {
                const moduloKey = mod.modulo;
                const acoes = mod.acoes || ['ver'];
                const labelModulo = mod.label || moduloKey;

                let acoesHtml = '';
                for (const acao of acoes) {
                    // Valor padrão do perfil
                    const perfilVal = perfilDefaults[moduloKey]?.[acao] !== undefined
                        ? perfilDefaults[moduloKey][acao]
                        : false;

                    // Valor customizado se fornecido (com fallback de herança)
                    let valor = perfilVal;
                    if (customPermissoes && customPermissoes[moduloKey] && customPermissoes[moduloKey][acao] !== undefined) {
                        valor = customPermissoes[moduloKey][acao];
                    } else if (customPermissoes && mod.fallback && customPermissoes[mod.fallback] && customPermissoes[mod.fallback][acao] !== undefined) {
                        valor = customPermissoes[mod.fallback][acao];
                    } else if (customPermissoes && moduloKey === 'despesas' && customPermissoes.financeiro && customPermissoes.financeiro[acao] !== undefined) {
                        valor = customPermissoes.financeiro[acao];
                    } else if (customPermissoes && moduloKey === 'fiado' && customPermissoes.contas_receber && customPermissoes.contas_receber[acao] !== undefined) {
                        valor = customPermissoes.contas_receber[acao];
                    }

                    const acaoDesc = mod.acaoLabels?.[acao] || acao.charAt(0).toUpperCase() + acao.slice(1);

                    acoesHtml += `
                        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-weight: normal; cursor: pointer; font-size: 12.5px;">
                            <input type="checkbox" 
                                   data-modulo="${moduloKey}" 
                                   data-acao="${acao}"
                                   data-grupo="${grupoNome}"
                                   ${valor ? 'checked' : ''} 
                                   class="checkbox-permissao"
                            >
                            <span>${acaoDesc}</span>
                        </label>
                    `;
                }

                html += `
                    <div class="permissoes-card" data-modulo="${moduloKey}" data-grupo="${grupoNome.toLowerCase()}">
                        <div class="permissoes-card-header">
                            <h4>${labelModulo}</h4>
                            <div style="display:flex; gap:6px;">
                                <button type="button" class="btn-toggle-card" onclick="window.toggleCardPermissoes('${moduloKey}', true)">Todos</button>
                                <span style="color:#cbd5e1">|</span>
                                <button type="button" class="btn-toggle-card" onclick="window.toggleCardPermissoes('${moduloKey}', false)">Nenhum</button>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            ${acoesHtml}
                        </div>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        aplicarFiltroPermissoes();
    }

    // Toggle de todas as permissões de um card específico
    window.toggleCardPermissoes = (modulo, checked) => {
        const checkboxes = document.querySelectorAll(`.checkbox-permissao[data-modulo="${modulo}"]`);
        checkboxes.forEach(cb => { cb.checked = checked; });
    };

    // Toggle de todas as permissões de um grupo funcional
    window.toggleGrupoPermissoes = (grupo, checked) => {
        const checkboxes = document.querySelectorAll(`.checkbox-permissao[data-grupo="${grupo}"]`);
        checkboxes.forEach(cb => { cb.checked = checked; });
    };

    // Marcar / desmarcar todas globalmente
    window.marcarTodasPermissoes = (checked) => {
        const checkboxes = document.querySelectorAll('.checkbox-permissao');
        checkboxes.forEach(cb => { cb.checked = checked; });
    };

    // Restaurar padrões do perfil atualmente selecionado
    window.restaurarPadraoPerfil = () => {
        const perfilSel = document.getElementById('perfil')?.value || 'basico';
        carregarPermissoes(perfilSel);
    };

    // Filtro interativo de busca nas permissões
    function aplicarFiltroPermissoes() {
        const query = (document.getElementById('filtroPermissoesInput')?.value || '').toLowerCase().trim();
        const cards = document.querySelectorAll('.permissoes-card');
        const grupos = document.querySelectorAll('.permissoes-grupo-wrapper');

        if (!query) {
            cards.forEach(c => c.style.display = '');
            grupos.forEach(g => g.style.display = '');
            return;
        }

        grupos.forEach(grupo => {
            let temCardVisivel = false;
            const cardsDoGrupo = grupo.querySelectorAll('.permissoes-card');
            cardsDoGrupo.forEach(card => {
                const texto = card.textContent.toLowerCase();
                const modulo = (card.getAttribute('data-modulo') || '').toLowerCase();
                if (texto.includes(query) || modulo.includes(query)) {
                    card.style.display = '';
                    temCardVisivel = true;
                } else {
                    card.style.display = 'none';
                }
            });
            grupo.style.display = temCardVisivel ? '' : 'none';
        });
    }

    document.getElementById('filtroPermissoesInput')?.addEventListener('input', aplicarFiltroPermissoes);
    document.getElementById('btnMarcarTodasPermissoes')?.addEventListener('click', () => window.marcarTodasPermissoes(true));
    document.getElementById('btnDesmarcarTodasPermissoes')?.addEventListener('click', () => window.marcarTodasPermissoes(false));
    document.getElementById('btnRestaurarPadraoPerfil')?.addEventListener('click', window.restaurarPadraoPerfil);
    
    document.getElementById('perfil')?.addEventListener('change', (e) => {
        carregarPermissoes(e.target.value);
    });
    
    window.editarUsuario = async (id) => {
        if (!temPermissao('usuarios', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar usuários!', 'error');
            return;
        }
        
        try {
            const usuarioAlvo = usuarios.find(u => u.id === id);
            if (!usuarioAlvo) return;
            
            document.getElementById('modalTitle').textContent = 'Editar Usuário';
            document.getElementById('usuarioId').value = usuarioAlvo.id;
            document.getElementById('nome').value = usuarioAlvo.nome || '';
            
            const prefixo = obterPrefixoLoja();
            const badge = document.getElementById('prefixoLojaBadge');
            if (badge) badge.textContent = '.' + prefixo;

            let baseUser = usuarioAlvo.email || '';
            if (baseUser.endsWith('.' + prefixo)) {
                baseUser = baseUser.substring(0, baseUser.length - (prefixo.length + 1));
            }
            const inputBase = document.getElementById('username_base');
            if (inputBase) {
                inputBase.value = baseUser;
                inputBase.disabled = true;
            }
            document.getElementById('email').value = usuarioAlvo.email || '';
            const preview = document.getElementById('previewUsuarioGerado');
            if (preview) preview.textContent = usuarioAlvo.email || '';

            document.getElementById('senha').value = '';
            document.getElementById('senha').placeholder = 'Deixe em branco para manter a senha atual';
            document.getElementById('senha').required = false;
            
            const selectPerfil = document.getElementById('perfil');
            const selectAtivo = document.getElementById('ativo');
            selectPerfil.value = usuarioAlvo.perfil || 'basico';
            selectAtivo.value = usuarioAlvo.ativo ? 'true' : 'false';

            document.getElementById('telefone').value = usuarioAlvo.telefone || '';
            document.getElementById('cargo').value = usuarioAlvo.cargo || '';
            
            // Regra de segurança: O próprio usuário logado não pode revogar seu admin ou desativar a si mesmo
            const isMesmoUsuario = String(usuarioAlvo.id) === String(usuario.id);
            if (isMesmoUsuario && usuario.perfil === 'admin') {
                selectPerfil.disabled = true;
                selectPerfil.title = 'Você não pode alterar seu próprio perfil de Administrador.';
                selectAtivo.disabled = true;
                selectAtivo.title = 'Você não pode desativar seu próprio usuário.';
            } else {
                selectPerfil.disabled = false;
                selectPerfil.title = '';
                selectAtivo.disabled = false;
                selectAtivo.title = '';
            }

            carregarPermissoes(usuarioAlvo.perfil || 'basico', usuarioAlvo.permissoes);

            // Regra de segurança: Apenas administradores podem alterar a matriz de permissões
            const isAdmin = usuario.perfil === 'admin';
            document.querySelectorAll('.checkbox-permissao').forEach(cb => {
                cb.disabled = !isAdmin;
            });
            const btnToolbar = document.querySelectorAll('.permissoes-toolbar button, .btn-toggle-card');
            btnToolbar.forEach(b => {
                b.disabled = !isAdmin;
            });
            
            document.getElementById('modalUsuario').style.display = 'flex';
        } catch (error) {
            console.error('Erro ao editar usuário:', error);
            mostrarNotificacao('Erro ao carregar dados do usuário', 'error');
        }
    };
    
    window.toggleStatus = async (id, novoStatus) => {
        if (!temPermissao('usuarios', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para alterar status de usuários!', 'error');
            return;
        }

        if (String(id) === String(usuario.id) && !novoStatus) {
            mostrarNotificacao('Ação bloqueada: você não pode desativar seu próprio usuário!', 'error');
            return;
        }
        
        if (!confirm(`Tem certeza que deseja ${novoStatus ? 'ativar' : 'desativar'} este usuário?`)) return;
        
        try {
            const { error } = await supabaseClient
                .from('usuarios')
                .update({ ativo: novoStatus })
                .eq('id', id);
            
            if (error) throw error;
            
            mostrarNotificacao(`Usuário ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`, 'success');
            carregarUsuarios();
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            mostrarNotificacao('Erro ao alterar status: ' + (error.message || error), 'error');
        }
    };
    
    async function salvarUsuario() {
        const id = document.getElementById('usuarioId').value;
        const nome = document.getElementById('nome').value.trim();
        let email = document.getElementById('email').value.trim();
        const baseUser = document.getElementById('username_base')?.value.trim();
        const prefixo = obterPrefixoLoja();

        if (id) {
            if (!temPermissao('usuarios', 'editar')) {
                mostrarNotificacao('Você não tem permissão para editar usuários!', 'error');
                return;
            }
        } else {
            if (!temPermissao('usuarios', 'criar')) {
                mostrarNotificacao('Você não tem permissão para criar novos usuários!', 'error');
                return;
            }
        }

        if (!email && baseUser) {
            email = `${baseUser}.${prefixo}`;
            document.getElementById('email').value = email;
        }
        
        const senha = document.getElementById('senha').value;
        const perfil = document.getElementById('perfil').value;
        const telefone = document.getElementById('telefone').value.trim();
        const cargo = document.getElementById('cargo').value.trim();
        const ativo = document.getElementById('ativo').value === 'true';
        
        if (!nome || !email) {
            mostrarNotificacao('Preencha o nome e o usuário de acesso!', 'error');
            return;
        }
        
        if (!id && !senha) {
            mostrarNotificacao('Informe a senha para o novo usuário!', 'error');
            return;
        }

        // Regra de segurança: Não permitir que usuários sem perfil admin criem ou alterem usuários para admin
        if (usuario.perfil !== 'admin' && perfil === 'admin') {
            mostrarNotificacao('Apenas administradores podem conceder o perfil de Administrador.', 'error');
            return;
        }

        // Regra de segurança: Não permitir que o usuário atual revogue seu próprio perfil de admin
        if (id && String(id) === String(usuario.id)) {
            if (usuario.perfil === 'admin' && perfil !== 'admin') {
                mostrarNotificacao('Você não pode alterar seu próprio perfil de Administrador.', 'error');
                return;
            }
            if (usuario.ativo && !ativo) {
                mostrarNotificacao('Você não pode desativar seu próprio usuário.', 'error');
                return;
            }
        }
        
        // Coletar permissões marcadas nos checkboxes
        let permissoes = {};
        if (perfil === 'admin') {
            // Se o perfil for admin, gerar matriz completa com true em todos os módulos e ações
            const schema = window.AionPermissoes?.SCHEMA || {};
            for (const [modKey, modMeta] of Object.entries(schema)) {
                permissoes[modKey] = {};
                for (const ac of (modMeta.acoes || ['ver'])) {
                    permissoes[modKey][ac] = true;
                }
            }
        } else {
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
            const btnSalvar = document.getElementById('btnSalvar');
            btnSalvar.disabled = true;
            btnSalvar.textContent = 'Salvando...';

            if (id) {
                const { error } = await supabaseClient
                    .from('usuarios')
                    .update(dados)
                    .eq('id', id);
                
                if (error) throw error;
                mostrarNotificacao('✅ Usuário atualizado com sucesso!', 'success');

                // Se o próprio usuário logado for editado, atualizar a sessão local
                if (String(id) === String(usuario.id)) {
                    const usuarioAtualizado = {
                        ...usuario,
                        nome: dados.nome,
                        email: dados.email,
                        cargo: dados.cargo,
                        telefone: dados.telefone,
                        permissoes: dados.permissoes
                    };
                    sessionStorage.setItem('usuario', JSON.stringify(usuarioAtualizado));
                }
            } else {
                const { error } = await supabaseClient
                    .from('usuarios')
                    .insert([dados]);
                
                if (error) throw error;
                mostrarNotificacao('✅ Usuário criado com sucesso!', 'success');
            }
            
            document.getElementById('modalUsuario').style.display = 'none';
            document.getElementById('usuarioForm').reset();
            const inputBase = document.getElementById('username_base');
            if (inputBase) inputBase.disabled = false;
            document.getElementById('senha').required = true;
            document.getElementById('senha').placeholder = '';
            carregarUsuarios();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            mostrarNotificacao('❌ Erro ao salvar usuário: ' + (error.message || error), 'error');
        } finally {
            const btnSalvar = document.getElementById('btnSalvar');
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.textContent = 'Salvar';
            }
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
        
        const prefixo = obterPrefixoLoja();
        const badge = document.getElementById('prefixoLojaBadge');
        if (badge) badge.textContent = '.' + prefixo;

        const inputBase = document.getElementById('username_base');
        if (inputBase) {
            inputBase.value = '';
            inputBase.disabled = false;
        }
        document.getElementById('email').value = '';
        const preview = document.getElementById('previewUsuarioGerado');
        if (preview) preview.textContent = `nome.${prefixo}`;

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
    
    document.getElementById('searchUsuario')?.addEventListener('input', renderizarTabela);
    document.getElementById('filtroPerfil')?.addEventListener('change', renderizarTabela);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarTabela);
    
    function renderizarAbaPerfis() {
        const perfisGrid = document.getElementById('perfisGrid');
        if (!perfisGrid) return;

        const perfisMeta = [
            { key: 'admin', nome: '👑 Administrador', badgeClass: 'perfil-admin', desc: 'Acesso total irrestrito a todas as 24 áreas e funcionalidades do sistema.' },
            { key: 'gerente', nome: '📊 Gerente', badgeClass: 'perfil-gerente', desc: 'Acesso operacional amplo (vendas, estoque, financeiro, clientes, relatórios), sem gestão de usuários.' },
            { key: 'vendedor', nome: '💰 Vendedor', badgeClass: 'perfil-vendedor', desc: 'Frente de caixa (PDV), abertura de caixa, emissão de carnês/fiado, consulta de estoque e catálogo.' },
            { key: 'tecnico', nome: '🔧 Técnico', badgeClass: 'perfil-tecnico', desc: 'Ordens de serviço, assistência técnica, catálogo e agendamentos.' },
            { key: 'basico', nome: '👤 Básico', badgeClass: 'perfil-basico', desc: 'Acesso mínimo de consulta aos cadastros permitidos.' }
        ];

        const schema = window.AionPermissoes?.SCHEMA || {};
        const perfisPadrao = window.AionPermissoes?.PERFIS_PADRAO || {};

        perfisGrid.innerHTML = perfisMeta.map(p => {
            const defaults = perfisPadrao[p.key] || {};
            const modulosPermitidos = Object.keys(schema).filter(m => defaults[m]?.ver);

            return `
                <div class="card" style="border-left: 4px solid var(--primary, #0A4D68); padding: 16px; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h4 style="margin: 0; font-size: 15px;">${p.nome}</h4>
                        <span class="perfil-badge ${p.badgeClass}">${p.key.toUpperCase()}</span>
                    </div>
                    <p style="font-size: 12.5px; color: #64748b; margin: 0 0 12px 0;">${p.desc}</p>
                    <div style="font-size: 11.5px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                        Módulos Liberados por Padrão (${modulosPermitidos.length} de ${Object.keys(schema).length}):
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${modulosPermitidos.map(m => `<span style="background: #f1f5f9; color: #1e293b; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">${schema[m]?.label || m}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    // =====================================================
    // INICIALIZAR
    // =====================================================
    
    renderizarAbaPerfis();
    carregarUsuarios();
    initTabs();
    
    window.editarUsuario = editarUsuario;
    window.toggleStatus = toggleStatus;
});
