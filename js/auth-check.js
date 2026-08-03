// js/auth-check.js
// Verificação de autenticação e filtro de menu

document.addEventListener('DOMContentLoaded', () => {
    // Verificar se a página atual é index.html (login)
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'index.html' || currentPage === '') {
        return;
    }
    
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    
    if (!usuario) {
        console.log('Usuário não logado, redirecionando para login...');
        window.location.href = 'index.html';
        return;
    }
    
    const config = usuario.config_loja || {
        habilitar_seriais: true,
        habilitar_agendamentos: false,
        habilitar_mesas: false,
        habilitar_lotes: false,
        habilitar_variacoes: false
    };

    // === RECONSTRUIR SIDEBAR DINAMICAMENTE POR RECURSOS ATIVOS ===
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        // Determinar ícone da loja baseado nas verticais ativas
        let icone = '🏢';
        if (config.habilitar_seriais && !config.habilitar_agendamentos && !config.habilitar_mesas) icone = '🤖';
        else if (config.habilitar_agendamentos && !config.habilitar_seriais && !config.habilitar_mesas) icone = '💅';
        else if (config.habilitar_mesas && !config.habilitar_seriais && !config.habilitar_agendamentos) icone = '🍔';
        else if (config.habilitar_lotes && !config.habilitar_mesas && !config.habilitar_seriais) icone = '🛒';
        else if (config.habilitar_variacoes) icone = '💍';
        
        // Labels específicas de segmento
        let labelProdutos = '📦 Produtos';
        if (config.habilitar_agendamentos) labelProdutos = '💅 Serviços & Produtos';
        else if (config.habilitar_mesas) labelProdutos = '🍔 Cardápio / Itens';
        
        let labelVendas = '📤 Nova Venda';
        if (config.habilitar_mesas) labelVendas = '🍕 PDV / Vendas';
        
        // Links extras condicionais
        let extraLinksHtml = '';
        if (config.habilitar_agendamentos) {
            extraLinksHtml += '<li><a href="agendamentos.html">💅 Agendamentos</a></li>';
        }
        if (config.habilitar_mesas) {
            extraLinksHtml += '<li><a href="mesas.html">🍔 Comanda/Serviço</a></li>';
        }
        
        sidebar.innerHTML = `
            <div class="sidebar-header" style="padding: 20px 16px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
                <h2 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span>${icone}</span>
                    <span class="brand-text" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">${usuario.loja_nome || 'Aion ERP'}</span>
                </h2>
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #D4AF37; margin-top: 4px; font-weight: bold;">
                    by AionLabs
                </div>
            </div>
            <ul class="sidebar-nav">
                <li><a href="dashboard.html">📊 Dashboard</a></li>
                <li><a href="clientes.html">👥 Clientes</a></li>
                <li><a href="produtos.html">${labelProdutos}</a></li>
                <li><a href="categorias.html">🏷️ Categorias</a></li>
                <li><a href="estoque.html">💾 Estoque</a></li>
                <li><a href="entradas.html">📥 Entradas</a></li>
                <li><a href="saidas.html">${labelVendas}</a></li>
                <li><a href="fechamento.html">💵 Fechamento de Caixa</a></li>
                <li><a href="devolucoes.html">🔄 Devoluções</a></li>
                <li><a href="fornecedores.html">🏭 Fornecedores</a></li>
                ${extraLinksHtml}
                <li><a href="relatorios.html">📈 Relatórios</a></li>
                <li><a href="usuarios.html">👤 Usuários</a></li>
            </ul>
        `;
    }

    // === DEFINIR TÍTULO DA PÁGINA COM NOME DO SISTEMA ===
    const cleanTitle = document.title.replace(' - Sistema de Estoque', '');
    document.title = `Aion ERP | ${cleanTitle}`;

    // === FILTRAR MENU POR PERMISSÃO ===
    filtrarMenuPorPermissao(usuario);
    
    // Mostrar informações do usuário
    const userNameElement = document.getElementById('userName');
    const userPerfilElement = document.getElementById('userPerfil');
    
    if (userNameElement) {
        userNameElement.textContent = usuario.nome || 'Usuário';
    }
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

    // === BOTÃO DE CONFIGURAÇÃO DO ERP (Módulos / Verticais) ===
    const userInfo = document.querySelector('.user-info');
    if (userInfo && !document.getElementById('btnConfigLoja') && (usuario.perfil === 'admin' || usuario.perfil === 'gerente')) {
        const btnConfig = document.createElement('button');
        btnConfig.id = 'btnConfigLoja';
        btnConfig.className = 'settings-btn';
        btnConfig.style.cssText = 'background:none; border:none; font-size:18px; cursor:pointer; color:var(--primary); margin-right: 12px; transition: transform 0.3s ease;';
        btnConfig.innerHTML = '⚙️';
        btnConfig.title = 'Configurações do ERP';
        
        btnConfig.addEventListener('mouseenter', () => btnConfig.style.transform = 'rotate(45deg)');
        btnConfig.addEventListener('mouseleave', () => btnConfig.style.transform = 'rotate(0deg)');
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            userInfo.insertBefore(btnConfig, logoutBtn);
        } else {
            userInfo.appendChild(btnConfig);
        }
        
        btnConfig.addEventListener('click', abrirModalConfigLoja);
    }
    
    // === LOGOUT ===
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        newLogoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('Tem certeza que deseja sair do sistema?')) {
                sessionStorage.clear();
                window.location.replace('index.html');
            }
        });
    }
    
    // === MENU TOGGLE (mobile) ===
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        const newMenuToggle = menuToggle.cloneNode(true);
        menuToggle.parentNode.replaceChild(newMenuToggle, menuToggle);
        newMenuToggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
        });
    }
});

// =====================================================
// FUNÇÕES DE CONFIGURAÇÃO DE VERTICAIS (MÓDULOS)
// =====================================================

function abrirModalConfigLoja() {
    let modal = document.getElementById('modalGlobalConfigLoja');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalGlobalConfigLoja';
        modal.className = 'modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:999999;';
        
        modal.innerHTML = `
            <div class="modal-content" style="background:#fff; padding:24px; border-radius:12px; width:100%; max-width:500px; box-shadow:0 10px 30px rgba(0,0,0,0.3); position:relative; animation:fadeInUp 0.3s ease;">
                <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <h2 style="font-size:18px; font-weight:700; color:var(--dark); margin:0;">⚙️ Dados da Empresa - Aion ERP</h2>
                    <span class="close-config" style="cursor:pointer; font-size:24px; font-weight:bold; color:var(--gray);">&times;</span>
                </div>
                <div class="modal-body" style="max-height: 450px; overflow-y: auto; padding-right: 5px;">
                    <form id="formGlobalConfigLoja">
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="display:block; font-size:12px; font-weight:500; margin-bottom:4px;">Nome da Loja</label>
                            <input type="text" id="cfgNome" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="display:block; font-size:12px; font-weight:500; margin-bottom:4px;">Razão Social</label>
                            <input type="text" id="cfgRazao" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
                        </div>
                        <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                            <div class="form-group">
                                <label style="display:block; font-size:12px; font-weight:500; margin-bottom:4px;">CNPJ</label>
                                <input type="text" id="cfgCnpj" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
                            </div>
                            <div class="form-group">
                                <label style="display:block; font-size:12px; font-weight:500; margin-bottom:4px;">Telefone</label>
                                <input type="text" id="cfgTelefone" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="display:block; font-size:12px; font-weight:500; margin-bottom:4px;">Endereço da Loja (Saída no cupom)</label>
                            <input type="text" id="cfgEndereco" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
                        </div>
                    </form>
                </div>
                <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #eee; padding-top:12px; margin-top:12px;">
                    <button class="btn-warning" id="btnFecharConfig" style="padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-weight:600;">Cancelar</button>
                    <button class="btn-primary" id="btnSalvarConfigLoja" style="padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-weight:600;">Salvar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.querySelector('.close-config').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('btnFecharConfig').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('btnSalvarConfigLoja').addEventListener('click', salvarConfigLojaMaster);
    }
    
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    const config = usuario.config_loja || {};
    
    document.getElementById('cfgNome').value = usuario.loja_nome || '';
    document.getElementById('cfgRazao').value = config.razao_social || '';
    document.getElementById('cfgCnpj').value = config.cnpj || '';
    document.getElementById('cfgTelefone').value = config.telefone || '';
    document.getElementById('cfgEndereco').value = config.endereco || '';
    
    modal.style.display = 'flex';
}

async function salvarConfigLojaMaster() {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) return;
    
    const btn = document.getElementById('btnSalvarConfigLoja');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    
    const nome = document.getElementById('cfgNome').value.trim();
    const razao = document.getElementById('cfgRazao').value.trim();
    const cnpj = document.getElementById('cfgCnpj').value.trim();
    const tel = document.getElementById('cfgTelefone').value.trim();
    const endereco = document.getElementById('cfgEndereco').value.trim();
    
    try {
        const { error: errConfig } = await supabaseClient
            .from('config_loja')
            .update({
                nome_fantasia: nome,
                razao_social: razao,
                cnpj: cnpj,
                telefone: tel,
                endereco: endereco
            })
            .eq('loja_id', usuario.loja_id);
            
        if (errConfig) throw errConfig;
        
        const { error: errLoja } = await supabaseClient
            .from('lojas')
            .update({ nome: nome })
            .eq('id', usuario.loja_id);
            
        if (errLoja) throw errLoja;
        
        usuario.loja_nome = nome;
        usuario.config_loja = {
            ...usuario.config_loja,
            razao_social: razao,
            cnpj: cnpj,
            telefone: tel,
            endereco: endereco
        };
        sessionStorage.setItem('usuario', JSON.stringify(usuario));
        
        mostrarNotificacao('Dados da empresa atualizados com sucesso!', 'success');
        document.getElementById('modalGlobalConfigLoja').style.display = 'none';
        
        setTimeout(() => {
            window.location.reload();
        }, 800);
        
    } catch (e) {
        console.error('Erro ao salvar configurações:', e);
        mostrarNotificacao('Erro ao salvar configurações', 'error');
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

// =====================================================
// FUNÇÃO PARA FILTRAR MENU POR PERMISSÃO
// =====================================================

function filtrarMenuPorPermissao(usuario) {
    const linksMap = {
        'dashboard.html': 'dashboard',
        'clientes.html': 'clientes',
        'produtos.html': 'produtos',
        'categorias.html': 'categorias',
        'estoque.html': 'estoque',
        'entradas.html': 'entradas',
        'saidas.html': 'saidas',
        'fechamento.html': 'saidas',
        'devolucoes.html': 'saidas',
        'fornecedores.html': 'fornecedores',
        'ordem-servico.html': 'ordens_servico',
        'agendamentos.html': 'dashboard',
        'mesas.html': 'saidas',
        'relatorios.html': 'relatorios',
        'usuarios.html': 'usuarios'
    };
    
    const links = document.querySelectorAll('.sidebar-nav a');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        const modulo = linksMap[href];
        
        if (modulo) {
            const podeVer = verificarPermissaoUsuario(usuario, modulo, 'ver');
            
            if (!podeVer) {
                link.style.display = 'none';
                link.parentElement.style.display = 'none';
            } else {
                link.style.display = 'flex';
                link.parentElement.style.display = 'block';
            }
        }
    });
}

// =====================================================
// FUNÇÃO PARA VERIFICAR PERMISSÃO DO USUÁRIO
// =====================================================

function verificarPermissaoUsuario(usuario, modulo, acao = 'ver') {
    if (!usuario) return false;
    
    // Admin tem acesso total
    if (usuario.perfil === 'admin') return true;
    
    // Verificar permissões do usuário
    const permissoes = usuario.permissoes || {};
    
    // Se não tiver permissões definidas, usar fallback por perfil
    if (Object.keys(permissoes).length === 0) {
        const permissoesFallback = {
            gerente: {
                dashboard: { ver: true },
                clientes: { ver: true, criar: true, editar: true, excluir: false },
                produtos: { ver: true, criar: true, editar: true, excluir: false },
                categorias: { ver: true, criar: false, editar: false, excluir: false },
                estoque: { ver: true, ajustar: false },
                entradas: { ver: true, criar: true, excluir: false },
                saidas: { ver: true, criar: true, cancelar: true, ver_vendas_outros: true },
                fornecedores: { ver: true, criar: true, editar: true, excluir: false },
                ordens_servico: { ver: true, criar: true, editar: true, excluir: false },
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
                ordens_servico: { ver: false },
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
                ordens_servico: { ver: true, criar: true, editar: true, excluir: false },
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
                ordens_servico: { ver: false },
                relatorios: { ver: false },
                usuarios: { ver: false }
            }
        };
        
        const perfilPermissoes = permissoesFallback[usuario.perfil] || permissoesFallback.basico;
        return perfilPermissoes[modulo]?.[acao] || false;
    }
    
    return permissoes[modulo]?.[acao] || false;
}

// =====================================================
// FUNÇÃO GLOBAL PARA VERIFICAR PERMISSÃO
// =====================================================

function verificarPermissao(modulo, acao = 'ver') {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    return verificarPermissaoUsuario(usuario, modulo, acao);
}