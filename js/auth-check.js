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

    // Validar permissão de página imediatamente para evitar bypass de URL
    const linksMapPaginas = {
        'dashboard.html': 'dashboard',
        'clientes.html': 'clientes',
        'produtos.html': 'produtos',
        'categorias.html': 'categorias',
        'estoque.html': 'estoque',
        'entradas.html': 'entradas',
        'saidas.html': 'saidas',
        'fechamento.html': 'saidas',
        'despesas.html': 'financeiro',
        'devolucoes.html': 'saidas',
        'fornecedores.html': 'fornecedores',
        'colaboradores.html': 'colaboradores',
        'comissoes.html': 'relatorios',
        'ordem-servico.html': 'ordens_servico',
        'agendamentos.html': 'dashboard',
        'mesas.html': 'saidas',
        'relatorios.html': 'relatorios',
        'usuarios.html': 'usuarios'
    };

    const moduloAtual = linksMapPaginas[currentPage];
    if (moduloAtual) {
        const podeVer = verificarPermissaoUsuario(usuario, moduloAtual, 'ver');
        if (!podeVer) {
            console.warn(`Acesso negado para a página ${currentPage}. Redirecionando...`);
            const proximaPagina = obterPrimeiraPaginaPermitida(usuario);
            if (proximaPagina && proximaPagina !== currentPage) {
                window.location.href = proximaPagina;
            } else {
                window.location.href = 'index.html';
            }
            return;
        }
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
        else if (config.habilitar_agendamentos && !config.habilitar_seriais && !config.habilitar_mesas) icone = '📅';
        else if (config.habilitar_mesas && !config.habilitar_seriais && !config.habilitar_agendamentos) icone = '📋';
        else if (config.habilitar_lotes && !config.habilitar_mesas && !config.habilitar_seriais) icone = '🛒';
        else if (config.habilitar_variacoes) icone = '💍';
        
        // Injetar estilos customizados para os cabeçalhos de grupo e submenus
        const styleId = 'sidebar-accordion-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .sidebar-group-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 14px;
                    color: rgba(255, 252, 242, 0.55);
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.2px;
                    cursor: pointer;
                    user-select: none;
                    transition: color var(--transition-fast), background-color var(--transition-fast);
                    margin-top: 10px;
                    margin-bottom: 2px;
                    border-radius: var(--radius-sm);
                }
                .sidebar-group-header:hover {
                    color: var(--floral-white);
                    background: rgba(255, 255, 255, 0.04);
                }
                .sidebar-group-header.active {
                    color: var(--floral-white);
                }
                .sidebar-group-header .arrow {
                    font-size: 9px;
                    transition: transform 0.25s ease;
                    opacity: 0.7;
                }
                .sidebar-group-header.active .arrow {
                    transform: rotate(180deg);
                    opacity: 1;
                }
                .sidebar-subnav {
                    list-style: none;
                    padding-left: 14px !important;
                    margin: 0;
                    display: none;
                }
                .sidebar-subnav.open {
                    display: block;
                }
                .sidebar-subnav li a {
                    font-size: 13px !important;
                    padding: 8px 12px !important;
                    opacity: 0.85;
                }
                .sidebar-subnav li a:hover {
                    opacity: 1;
                    transform: translateX(3px) !important;
                }
                .sidebar-subnav li a.active {
                    background: rgba(235, 94, 40, 0.2) !important;
                    color: var(--floral-white) !important;
                    box-shadow: none !important;
                }
                .sidebar-subnav li a.active::after {
                    width: 30% !important;
                }
            `;
            document.head.appendChild(style);
        }

        // Labels específicas de segmento
        const labelProdutos = '📦 Serviços e Produtos';
        const labelVendas = '💳 PDV/Vendas';
        
        // Definição da estrutura do menu solicitada pelo usuário
        const menuStructure = [
            {
                type: 'link',
                label: '📊 Dashboard',
                href: 'dashboard.html',
                modulo: 'dashboard'
            },
            {
                type: 'group',
                label: '🏢 Empresa',
                items: [
                    { label: '🏢 Dados da Empresa', href: 'javascript:void(0)', onclick: 'abrirModalConfigLoja()', modulo: 'usuarios' },
                    { label: '👤 Usuários', href: 'usuarios.html', modulo: 'usuarios' }
                ]
            },
            {
                type: 'group',
                label: '👥 CRM',
                items: [
                    { label: '👥 Clientes', href: 'clientes.html', modulo: 'clientes' },
                    { label: '🏭 Fornecedores', href: 'fornecedores.html', modulo: 'fornecedores' },
                    { label: '👥 Colaboradores', href: 'colaboradores.html', modulo: 'colaboradores' }
                ]
            },
            {
                type: 'group',
                label: '📦 Suprimentos',
                items: [
                    { label: '💾 Estoque', href: 'estoque.html', modulo: 'estoque' },
                    { label: labelProdutos, href: 'produtos.html', modulo: 'produtos' },
                    { label: '🏷️ Categorias', href: 'categorias.html', modulo: 'categorias' }
                ]
            },
            {
                type: 'group',
                label: '📥 Compras',
                items: [
                    { label: '📥 Entradas', href: 'entradas.html', modulo: 'entradas' },
                    { label: '🔄 Devoluções', href: 'devolucoes.html', modulo: 'saidas' }
                ]
            },
            {
                type: 'group',
                label: '💰 Faturamento',
                items: [
                    { label: labelVendas, href: 'saidas.html', modulo: 'saidas' },
                    { label: '💸 Despesas', href: 'despesas.html', modulo: 'financeiro' },
                    { label: '💸 Comissões a Pagar', href: 'comissoes.html', modulo: 'relatorios' },
                    { label: '📅 Agendamento', href: 'agendamentos.html', modulo: 'dashboard', condicao: config.habilitar_agendamentos },
                    { label: '📋 Comanda/Serviço', href: 'mesas.html', modulo: 'saidas', condicao: config.habilitar_mesas }
                ]
            },
            {
                type: 'group',
                label: '📈 Relatórios',
                items: [
                    { label: '📊 Acessar', href: 'relatorios.html', modulo: 'relatorios' }
                ]
            }
        ];

        let menuHtml = '';
        menuStructure.forEach((item, index) => {
            if (item.type === 'link') {
                const podeVer = verificarPermissaoUsuario(usuario, item.modulo, 'ver');
                if (podeVer) {
                    const isActive = currentPage === item.href;
                    menuHtml += `
                        <li>
                            <a href="${item.href}" class="${isActive ? 'active' : ''}">
                                ${item.label}
                            </a>
                        </li>
                    `;
                }
            } else if (item.type === 'group') {
                // Filtrar os itens permitidos e com condição ativa
                const visibleItems = item.items.filter(subItem => {
                    if (subItem.condicao === false) return false;
                    return verificarPermissaoUsuario(usuario, subItem.modulo, subItem.action || 'ver');
                });
                
                if (visibleItems.length > 0) {
                    // Verificar se o item ativo está neste grupo
                    const isAnyActive = visibleItems.some(subItem => currentPage === subItem.href);
                    
                    const subItemsHtml = visibleItems.map(subItem => {
                        const isActive = currentPage === subItem.href;
                        const clickAttr = subItem.onclick ? `onclick="${subItem.onclick}"` : '';
                        const hrefAttr = subItem.href;
                        return `
                            <li>
                                <a href="${hrefAttr}" ${clickAttr} class="${isActive ? 'active' : ''}">
                                    ${subItem.label}
                                </a>
                            </li>
                        `;
                    }).join('');
                    
                    menuHtml += `
                        <li class="sidebar-group-item">
                            <div class="sidebar-group-header ${isAnyActive ? 'active' : ''}" data-group-index="${index}">
                                <span>${item.label}</span>
                                <span class="arrow">▼</span>
                            </div>
                            <ul class="sidebar-subnav ${isAnyActive ? 'open' : ''}" id="subnav-${index}">
                                ${subItemsHtml}
                            </ul>
                        </li>
                    `;
                }
            }
        });

        sidebar.innerHTML = `
            <div class="sidebar-header" style="padding: 20px 16px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
                <h2 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span style="background: var(--primary); color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 800; letter-spacing: 0.5px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">ERP</span>
                    <span class="brand-text" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">${usuario.loja_nome || 'Aion ERP'}</span>
                </h2>
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #D4AF37; margin-top: 4px; font-weight: bold;">
                    by AionLabs
                </div>
            </div>
            <ul class="sidebar-nav" style="overflow-y: auto; max-height: calc(100vh - 120px);">
                ${menuHtml}
            </ul>
        `;

        // Adicionar eventos de toggle para os cabeçalhos de grupo
        sidebar.querySelectorAll('.sidebar-group-header').forEach(header => {
            header.addEventListener('click', () => {
                const groupIndex = header.getAttribute('data-group-index');
                const subnav = document.getElementById(`subnav-${groupIndex}`);
                if (subnav) {
                    const isOpen = subnav.classList.contains('open');
                    if (isOpen) {
                        subnav.classList.remove('open');
                        header.classList.remove('active');
                    } else {
                        subnav.classList.add('open');
                        header.classList.add('active');
                    }
                }
            });
        });
    }

    // === DEFINIR TÍTULO DA PÁGINA COM NOME DO SISTEMA ===
    const cleanTitle = document.title.replace(' - Sistema de Estoque', '');
    document.title = `Aion ERP | ${cleanTitle}`;
    
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

    // === BOTÃO DADOS DA EMPRESA ===
    const userInfo = document.querySelector('.user-info');
    if (userInfo && !document.getElementById('btnConfigLoja') && (usuario.perfil === 'admin' || usuario.perfil === 'gerente')) {
        const btnConfig = document.createElement('button');
        btnConfig.id = 'btnConfigLoja';
        btnConfig.className = 'settings-btn';
        btnConfig.style.cssText = 'background:none; border:none; font-size:18px; cursor:pointer; color:var(--primary); margin-right: 12px; transition: transform 0.3s ease;';
        btnConfig.innerHTML = '⚙️';
        btnConfig.title = 'Dados da Empresa';
        
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
// FUNÇÕES DE CONFIGURAÇÃO DADOS DA EMPRESA
// =====================================================

function abrirModalConfigLoja() {
    const usuario = JSON.parse(sessionStorage.getItem('usuario')) || {};
    const config = usuario.config_loja || {};

    let modal = document.getElementById('modalGlobalConfigLoja');
    if (modal) {
        modal.remove();
    }
    
    modal = document.createElement('div');
    modal.id = 'modalGlobalConfigLoja';
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:999999;';

    let termosHtml = '';
    if (config.termo_garantia !== undefined) {
        termosHtml = `
            <div class="form-group" style="margin-bottom:12px;">
                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#374151;">Garantia dos Produtos (Cupom)</label>
                <textarea id="cfgTermoGarantia" rows="5" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-family:monospace; resize:vertical; box-sizing:border-box;"></textarea>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#374151;">Política de Trocas (Cupom)</label>
                <textarea id="cfgTermoTroca" rows="4" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-family:monospace; resize:vertical; box-sizing:border-box;"></textarea>
            </div>
        `;
    } else {
        termosHtml = `
            <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:12px; margin-bottom:12px; font-size:12px; color:#b45309; line-height:1.4;">
                <strong style="display:block; margin-bottom:4px;">⚠️ Habilitar Termos no Cupom</strong>
                Para habilitar a personalização de garantia e trocas nos cupons, execute este script SQL no editor do seu Supabase:
                <textarea readonly style="width:100%; height:60px; font-family:monospace; font-size:11px; margin-top:6px; padding:6px; border:1px solid #fcd34d; border-radius:4px; background:#fff; resize:none; box-sizing:border-box;" onclick="this.select()">ALTER TABLE public.config_loja ADD COLUMN IF NOT EXISTS termo_garantia TEXT;
ALTER TABLE public.config_loja ADD COLUMN IF NOT EXISTS termo_troca TEXT;</textarea>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="modal-content" style="background:#fff; padding:24px; border-radius:12px; width:100%; max-width:500px; box-shadow:0 10px 30px rgba(0,0,0,0.3); position:relative; animation:fadeInUp 0.3s ease; box-sizing:border-box; font-family:inherit;">
            <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <h2 style="font-size:18px; font-weight:700; color:var(--dark); margin:0;">🏢 Dados da Empresa - Aion ERP</h2>
                <span class="close-config" style="cursor:pointer; font-size:24px; font-weight:bold; color:var(--gray);">&times;</span>
            </div>
            <div class="modal-body" style="max-height: 430px; overflow-y: auto; padding-right: 5px;">
                <form id="formGlobalConfigLoja">
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#374151;">Nome (Razão Social)</label>
                        <input type="text" id="cfgRazao" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px; box-sizing:border-box;">
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#374151;">Nome Fantasia</label>
                        <input type="text" id="cfgNome" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px; box-sizing:border-box;">
                    </div>
                    <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div class="form-group">
                            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#374151;">CNPJ</label>
                            <input type="text" id="cfgCnpj" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px; box-sizing:border-box;">
                        </div>
                        <div class="form-group">
                            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#374151;">Telefone</label>
                            <input type="text" id="cfgTelefone" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px; box-sizing:border-box;">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:#374151;">Endereço da Empresa (Saída no cupom)</label>
                        <input type="text" id="cfgEndereco" style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:14px; box-sizing:border-box;">
                    </div>
                    ${termosHtml}
                </form>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #eee; padding-top:12px; margin-top:12px;">
                <button class="btn-warning" id="btnFecharConfig" style="padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-weight:600; background:#f3f4f6; color:#4b5563;">Cancelar</button>
                <button class="btn-primary" id="btnSalvarConfigLoja" style="padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-weight:600; background:var(--primary); color:#fff;">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('.close-config').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btnFecharConfig').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btnSalvarConfigLoja').addEventListener('click', salvarConfigLojaMaster);

    document.getElementById('cfgNome').value = usuario.loja_nome || '';
    document.getElementById('cfgRazao').value = config.razao_social || '';
    document.getElementById('cfgCnpj').value = config.cnpj || '';
    document.getElementById('cfgTelefone').value = config.telefone || '';
    document.getElementById('cfgEndereco').value = config.endereco || '';
    
    if (config.termo_garantia !== undefined) {
        document.getElementById('cfgTermoGarantia').value = config.termo_garantia || '';
        document.getElementById('cfgTermoTroca').value = config.termo_troca || '';
    }
    
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
    
    const hasTermosFields = document.getElementById('cfgTermoGarantia') !== null;
    
    const updateData = {
        nome_fantasia: nome,
        razao_social: razao,
        cnpj: cnpj,
        telefone: tel,
        endereco: endereco
    };
    
    if (hasTermosFields) {
        updateData.termo_garantia = document.getElementById('cfgTermoGarantia').value;
        updateData.termo_troca = document.getElementById('cfgTermoTroca').value;
    }
    
    try {
        const { error: errConfig } = await supabaseClient
            .from('config_loja')
            .update(updateData)
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
            nome_fantasia: nome,
            razao_social: razao,
            cnpj: cnpj,
            telefone: tel,
            endereco: endereco
        };
        if (hasTermosFields) {
            usuario.config_loja.termo_garantia = updateData.termo_garantia;
            usuario.config_loja.termo_troca = updateData.termo_troca;
        }
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
        'despesas.html': 'financeiro',
        'devolucoes.html': 'saidas',
        'fornecedores.html': 'fornecedores',
        'colaboradores.html': 'colaboradores',
        'comissoes.html': 'relatorios',
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
                colaboradores: { ver: true, criar: true, editar: true, excluir: false },
                financeiro: { ver: true, criar: true, editar: true, excluir: false },
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
                colaboradores: { ver: false },
                financeiro: { ver: false },
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
                colaboradores: { ver: false },
                financeiro: { ver: false },
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
                colaboradores: { ver: false },
                financeiro: { ver: false },
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

// Exportações globais para uso nas páginas e menus
window.abrirModalConfigLoja = abrirModalConfigLoja;
window.verificarPermissao = verificarPermissao;
window.verificarPermissaoUsuario = verificarPermissaoUsuario;