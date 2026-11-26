// js/config.js
// Configuração do Supabase

// 0. Aplicar tema salvo imediatamente para evitar flash de tela clara
(function() {
    try {
        const savedTheme = localStorage.getItem('aion_theme') || 'light';
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (document.body) document.body.classList.add('dark-theme');
        }
    } catch (e) {}
})();

// 1. Tentar carregar env.js de forma síncrona se disponível para preencher window.ENV
try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'env.js?t=' + Date.now(), false); // Síncrono sem cache
    xhr.send();
    if (xhr.status === 200) {
        eval(xhr.responseText);
    }
} catch (e) {
    console.log('Arquivo env.js não encontrado localmente.');
}

// Carregar data-layer.js de forma síncrona se disponível para a camada de abstração
if (typeof window.AionDataLayer === 'undefined') {
    try {
        const xhrDl = new XMLHttpRequest();
        xhrDl.open('GET', 'js/data-layer.js?t=' + Date.now(), false);
        xhrDl.send();
        if (xhrDl.status === 200) {
            eval(xhrDl.responseText);
        }
    } catch (e) {
        console.warn('Aviso: data-layer.js não encontrado.');
    }
}


// 2. Carregar manifesto de clientes de forma síncrona se disponível para resolução imediata
if (!window._CLIENTS_MANIFEST) {
    try {
        const xhrM = new XMLHttpRequest();
        xhrM.open('GET', 'clients.json?t=' + Date.now(), false);
        xhrM.send();
        if (xhrM.status === 200) {
            window._CLIENTS_MANIFEST = JSON.parse(xhrM.responseText);
        }
    } catch (e) {}
}

// 3. Determinar e sincronizar o cliente ativo
const activeClientStr = sessionStorage.getItem('active_client');
let activeClientObj = null;

if (activeClientStr) {
    try {
        activeClientObj = JSON.parse(activeClientStr);
    } catch (e) {
        activeClientObj = null;
    }
}

// Se não há active_client salvo, verificar se o usuario na sessão tem clientId
if (!activeClientObj) {
    try {
        const uStr = sessionStorage.getItem('usuario');
        if (uStr) {
            const u = JSON.parse(uStr);
            const targetId = u.clientId || u.cliente_id || window.ENV?.CLIENT_ID || window.ENV?.clientId;
            if (targetId && window._CLIENTS_MANIFEST) {
                const found = window._CLIENTS_MANIFEST.find(c => c.clientId === targetId || c.prefix === targetId);
                if (found) {
                    activeClientObj = found;
                }
            }
        }
    } catch(e) {}
}

// Se ainda não há activeClientObj, sincronizar com o clientId padrão definido no window.ENV
if (!activeClientObj && window.ENV?.CLIENT_ID && window._CLIENTS_MANIFEST) {
    const found = window._CLIENTS_MANIFEST.find(c => c.clientId === window.ENV.CLIENT_ID || c.prefix === window.ENV.PREFIX);
    if (found) {
        activeClientObj = found;
    }
}

// Se o cliente ativo na sessão diferir do CLIENT_ID embutido no build atual,
// e o usuario na sessão não pertencer explicitamente a esse outro cliente, sincronizar com o build
if (activeClientObj && window.ENV?.CLIENT_ID && activeClientObj.clientId !== window.ENV.CLIENT_ID) {
    try {
        const uStr = sessionStorage.getItem('usuario');
        const u = uStr ? JSON.parse(uStr) : null;
        if (!u || u.clientId === window.ENV.CLIENT_ID || !u.clientId) {
            if (window._CLIENTS_MANIFEST) {
                const envClient = window._CLIENTS_MANIFEST.find(c => c.clientId === window.ENV.CLIENT_ID);
                if (envClient) {
                    activeClientObj = envClient;
                }
            }
        }
    } catch(e) {}
}

if (activeClientObj) {
    const cid = activeClientObj.clientId || activeClientObj.CLIENT_ID;

    // Atualizar dados com o manifesto mais recente em clients.json
    if (window._CLIENTS_MANIFEST) {
        const fresh = window._CLIENTS_MANIFEST.find(c => c.clientId === cid);
        if (fresh) {
            activeClientObj.companyName = fresh.companyName || activeClientObj.companyName;
            activeClientObj.companySubtitle = fresh.companySubtitle || activeClientObj.companySubtitle;
            activeClientObj.prefix = fresh.prefix || activeClientObj.prefix;
            activeClientObj.cnpjFormatted = fresh.cnpjFormatted || fresh.cnpj || activeClientObj.cnpjFormatted;
            activeClientObj.database = fresh.database || activeClientObj.database;
            activeClientObj.branding = fresh.branding || activeClientObj.branding;
            activeClientObj.features = fresh.features || activeClientObj.features;
        }
    }

    // Se window.ENV for do mesmo cliente, respeitar os dados mais recentes do build
    if (window.ENV && (window.ENV.CLIENT_ID === cid || window.ENV.clientId === cid)) {
        if (window.ENV.COMPANY_NAME) activeClientObj.companyName = window.ENV.COMPANY_NAME;
        if (window.ENV.COMPANY_SUBTITLE) activeClientObj.companySubtitle = window.ENV.COMPANY_SUBTITLE;
        if (window.ENV.PREFIX) activeClientObj.prefix = window.ENV.PREFIX;
        if (window.ENV.CNPJ) activeClientObj.cnpjFormatted = window.ENV.CNPJ;
    }

    // Se for cliente01, desativar Supabase obsoleto/pausado
    if (activeClientObj.clientId === 'cliente01') {
        activeClientObj.database = { provider: 'neon', connectionId: 'cliente01' };
        delete activeClientObj.supabase;
    }

    // Padronizar todas as lojas na paleta oficial Aion ERP (Laranja #EB5E28 & Azul-Marinho #0D1728)
    if (activeClientObj.branding) {
        activeClientObj.branding.primaryColor = '#0D1728';
        activeClientObj.branding.primaryDarkColor = '#0B0F14';
        activeClientObj.branding.primaryLightColor = '#16243D';
    }

    try { sessionStorage.setItem('active_client', JSON.stringify(activeClientObj)); } catch(e){}

    const activeCid = activeClientObj.clientId || activeClientObj.CLIENT_ID;
    const activeDb = activeClientObj.database || (activeClientObj.supabase?.url ? { provider: 'supabase', connectionId: activeCid } : { provider: 'neon', connectionId: activeCid });
    const activeBrand = activeClientObj.branding || {};
    const activeFeat = activeClientObj.features || {};

    window.ENV = {
        ...window.ENV,
        CLIENT_ID: activeCid,
        clientId: activeCid,
        COMPANY_NAME: activeClientObj.companyName,
        companyName: activeClientObj.companyName,
        COMPANY_SUBTITLE: activeClientObj.companySubtitle,
        companySubtitle: activeClientObj.companySubtitle,
        PREFIX: activeClientObj.prefix,
        prefix: activeClientObj.prefix,
        CNPJ: activeClientObj.cnpjFormatted || activeClientObj.cnpj,
        cnpj: activeClientObj.cnpjFormatted || activeClientObj.cnpj,
        DATABASE: activeDb,
        database: activeDb,
        SUPABASE_URL: activeClientObj.supabase?.url,
        SUPABASE_ANON_KEY: activeClientObj.supabase?.anonKey,
        BRANDING: activeBrand,
        branding: activeBrand,
        FEATURES: activeFeat,
        features: activeFeat
    };

    // Sincronizar com usuario na sessão se presente
    try {
        const uStr = sessionStorage.getItem('usuario');
        if (uStr) {
            const u = JSON.parse(uStr);
            let mudou = false;
            if (activeClientObj.companyName && u.loja_nome !== activeClientObj.companyName) {
                u.loja_nome = activeClientObj.companyName;
                mudou = true;
            }
            if (activeCid && u.clientId !== activeCid) {
                u.clientId = activeCid;
                u.cliente_id = activeCid;
                mudou = true;
            }
            if (mudou) {
                sessionStorage.setItem('usuario', JSON.stringify(u));
            }
        }
    } catch(e) {}
}

window.getCompanyName = function() {
    return window.ENV?.COMPANY_NAME || window.ENV?.companyName || (activeClientObj && activeClientObj.companyName) || 'MarceloMotos';
};
window.getCompanySubtitle = function() {
    return window.ENV?.COMPANY_SUBTITLE || window.ENV?.companySubtitle || (activeClientObj && activeClientObj.companySubtitle) || 'Matriz';
};

// Garantir a paleta original do sistema para todos os clientes (Modern SaaS: Sidebar Azul Profundo / Dourado)
const existingBrandStyle = document.getElementById('dynamic-branding-styles');
if (existingBrandStyle) existingBrandStyle.remove();

const SUPABASE_URL = window.ENV?.DATABASE?.provider === 'neon' ? null : (window.ENV?.SUPABASE_URL || null);
const SUPABASE_ANON_KEY = window.ENV?.DATABASE?.provider === 'neon' ? null : (window.ENV?.SUPABASE_ANON_KEY || null);

// Função para instanciar cliente Supabase com interceptador de multi-tenancy
function criarClienteSupabase(url, anonKey) {
    if (!url || !anonKey || typeof supabase === 'undefined') {
        console.warn('Aviso: Supabase SDK não disponível ou credenciais ausentes.');
        return null;
    }

    const headers = {};
    const usuarioStr = sessionStorage.getItem('usuario');
    if (usuarioStr) {
        try {
            const usuario = JSON.parse(usuarioStr);
            if (usuario && usuario.loja_id) {
                headers['x-tenant-id'] = String(usuario.loja_id);
            }
        } catch (e) {
            console.error('Erro ao injetar loja_id nos cabeçalhos:', e);
        }
    }
    
    const client = supabase.createClient(url, anonKey, {
        global: {
            headers: headers
        }
    });

    const originalFrom = client.from;
    client.from = function(tableName) {
        let queryBuilder = originalFrom.apply(this, arguments);
        const tablesWithLojaField = [
            'usuarios', 'clientes', 'produtos', 'categorias', 'entradas', 'saidas',
            'movimentos_estoque', 'config_loja', 'agendamentos', 'mesas_comandas', 'caixas', 'colaboradores', 'despesas', 'boletos_pagar',
            'promocoes', 'promocao_produtos', 'contas_receber', 'contas_receber_pagamentos'
        ];
        
        if (tablesWithLojaField.includes(tableName)) {
            const uStr = sessionStorage.getItem('usuario');
            if (uStr) {
                try {
                    const u = JSON.parse(uStr);
                    if (u && u.loja_id) {
                        const originalSelect = queryBuilder.select;
                        queryBuilder.select = function() {
                            return originalSelect.apply(this, arguments).eq('loja_id', u.loja_id);
                        };
                        
                        const originalUpdate = queryBuilder.update;
                        queryBuilder.update = function(values) {
                            if (values) {
                                if (Array.isArray(values)) {
                                    values.forEach(v => v.loja_id = u.loja_id);
                                } else {
                                    values.loja_id = u.loja_id;
                                }
                            }
                            return originalUpdate.apply(this, arguments).eq('loja_id', u.loja_id);
                        };
                        
                        const originalDelete = queryBuilder.delete;
                        queryBuilder.delete = function() {
                            return originalDelete.apply(this, arguments).eq('loja_id', u.loja_id);
                        };
                        
                        const originalInsert = queryBuilder.insert;
                        queryBuilder.insert = function(values) {
                            if (values) {
                                if (Array.isArray(values)) {
                                    values.forEach(v => v.loja_id = u.loja_id);
                                } else {
                                    values.loja_id = u.loja_id;
                                }
                            }
                            return originalInsert.apply(this, arguments);
                        };
                    }
                } catch (e) {
                    console.error('Erro ao injetar multi-tenancy:', e);
                }
            }
        }
        return queryBuilder;
    };
    client._isIntercepted = true;
    window.criarClienteSupabaseOriginal = criarClienteSupabase;
    return client;
}

window.criarClienteSupabaseOriginal = criarClienteSupabase;

// Inicializar cliente padrão (via Data Layer para suporte transparente a Neon/Supabase)
if (typeof supabaseClient === 'undefined' || !supabaseClient) {
    const targetConfig = activeClientObj || window.ENV || { clientId: 'cliente01', database: { provider: 'neon', connectionId: 'cliente01' } };
    if (window.AionDataLayer) {
        var supabaseClient = window.AionDataLayer.createClient(targetConfig);
    } else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        var supabaseClient = criarClienteSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    window.supabaseClient = supabaseClient;
    window.dbClient = supabaseClient;
}

// =====================================================
// MANIFESTO E RESOLUÇÃO MULTICLIENTE (CNPJ E PREFIXO)
// =====================================================
window.carregarManifestoClientes = async function() {
    if (window._CLIENTS_MANIFEST && window._CLIENTS_MANIFEST.length > 0) {
        return window._CLIENTS_MANIFEST;
    }
    try {
        const res = await fetch('clients.json?t=' + Date.now());
        if (res.ok) {
            window._CLIENTS_MANIFEST = await res.json();
            return window._CLIENTS_MANIFEST;
        }
    } catch (e) {
        console.warn('clients.json não disponível via HTTP:', e);
    }
    return [];
};

window.buscarClientePorCnpj = async function(cnpj) {
    const clients = await window.carregarManifestoClientes();
    const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
    if (!cleanCnpj) return null;
    return clients.find(c => String(c.cnpj).replace(/\D/g, '') === cleanCnpj) || null;
};

window.buscarClientePorPrefixo = async function(prefixo) {
    const clients = await window.carregarManifestoClientes();
    const cleanPref = String(prefixo || '').trim().toLowerCase();
    if (!cleanPref) return null;
    return clients.find(c => {
        const pref = String(c.prefix || '').toLowerCase();
        const cid = String(c.clientId || '').toLowerCase();
        const cname = String(c.companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return pref === cleanPref || cid === cleanPref || (pref.length > 3 && cleanPref.startsWith(pref)) || (cleanPref.length > 3 && pref.startsWith(cleanPref)) || cname === cleanPref;
    }) || null;
};

window.conectarClienteSupabase = function(clienteConfig) {
    if (!clienteConfig) {
        console.error('Configuração inválida para o cliente:', clienteConfig);
        return null;
    }
    
    const activeCid = clienteConfig.clientId || clienteConfig.CLIENT_ID;
    const activeDb = clienteConfig.database || clienteConfig.DATABASE || { provider: clienteConfig.supabase?.url ? 'supabase' : 'neon', connectionId: activeCid };
    const activeBrand = clienteConfig.branding || {};
    const activeFeat = clienteConfig.features || {};

    // Atualizar window.ENV em tempo de execução
    window.ENV = {
        ...window.ENV,
        CLIENT_ID: activeCid,
        clientId: activeCid,
        COMPANY_NAME: clienteConfig.companyName,
        companyName: clienteConfig.companyName,
        COMPANY_SUBTITLE: clienteConfig.companySubtitle,
        companySubtitle: clienteConfig.companySubtitle,
        PREFIX: clienteConfig.prefix,
        prefix: clienteConfig.prefix,
        CNPJ: clienteConfig.cnpjFormatted || clienteConfig.cnpj,
        cnpj: clienteConfig.cnpjFormatted || clienteConfig.cnpj,
        DATABASE: activeDb,
        database: activeDb,
        SUPABASE_URL: clienteConfig.supabase?.url,
        SUPABASE_ANON_KEY: clienteConfig.supabase?.anonKey,
        BRANDING: activeBrand,
        branding: activeBrand,
        FEATURES: activeFeat,
        features: activeFeat
    };

    // Salvar cliente ativo na sessão para persistir em todas as telas
    try {
        sessionStorage.setItem('active_client', JSON.stringify(clienteConfig));
    } catch(e) {}
    
    // Garantir a paleta original do sistema para todos os clientes (Modern SaaS: Sidebar Azul Profundo / Dourado)
    const existingBrandStyle = document.getElementById('dynamic-branding-styles');
    if (existingBrandStyle) existingBrandStyle.remove();
    
    // Instanciar via Data Layer (suporta Supabase e Neon)
    if (window.AionDataLayer) {
        supabaseClient = window.AionDataLayer.createClient(clienteConfig);
    } else {
        supabaseClient = criarClienteSupabase(clienteConfig.supabase?.url, clienteConfig.supabase?.anonKey);
    }
    window.supabaseClient = supabaseClient;
    window.dbClient = supabaseClient;
    return supabaseClient;
};

window.criarClienteSupabase = criarClienteSupabase;

// Função para mostrar notificações
function mostrarNotificacao(mensagem, tipo = 'info') {
    // Remover notificações existentes
    const notificacaoExistente = document.querySelector('.notificacao');
    if (notificacaoExistente) {
        notificacaoExistente.remove();
    }
    
    const notificacao = document.createElement('div');
    notificacao.className = `notificacao notificacao-${tipo}`;
    notificacao.innerHTML = `
        <span>${mensagem}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(notificacao);
    
    setTimeout(() => {
        if (notificacao && notificacao.parentElement) {
            notificacao.remove();
        }
    }, 3000);
}

// Função global de logout centralizada com proteção estrita contra disparos múltiplos
window._isLoggingOut = false;
window.executarLogout = function(e) {
    if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (window._isLoggingOut) return;

    if (confirm('Tem certeza que deseja sair do sistema?')) {
        window._isLoggingOut = true;
        try {
            sessionStorage.clear();
            localStorage.removeItem('supabase.auth.token');
            localStorage.removeItem('active_client');
        } catch (err) {}
        window.location.replace('index.html');
    }
};
window.fazerLogout = window.executarLogout;
window.fazerLogoutDashboard = window.executarLogout;
function fazerLogout(e) {
    window.executarLogout(e);
}

// Adicionar estilos de notificação se não existirem
if (!document.querySelector('#notificacao-styles')) {
    const styleNotificacao = document.createElement('style');
    styleNotificacao.id = 'notificacao-styles';
    styleNotificacao.textContent = `
        .notificacao {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInNotificacao 0.3s ease;
        }
        .notificacao-success { background: #00A86B; }
        .notificacao-error { background: #dc3545; }
        .notificacao-info { background: #0A4D68; }
        .notificacao-warning { background: #D4AF37; color: #111827; }
        .notificacao button {
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            padding: 0 5px;
        }
        @keyframes slideInNotificacao {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(styleNotificacao);
}

// Função para verificar se o usuário está logado
function isLogado() {
    return sessionStorage.getItem('usuario') !== null;
}

// =====================================================
// FUNÇÕES DE PERMISSÃO E MATRIZ CENTRALIZADA (Aion ERP)
// =====================================================

// Função para obter o usuário logado
function getUsuarioLogado() {
    try {
        const usuario = sessionStorage.getItem('usuario');
        return usuario ? JSON.parse(usuario) : null;
    } catch (e) {
        return null;
    }
}

// 1. Esquema completo de módulos e ações granulares do Aion ERP
const SCHEMA_PERMISSOES = {
    // 1. Visão Geral & Empresa
    dashboard: {
        label: '📊 Dashboard',
        grupo: 'Visão Geral',
        acoes: ['ver'],
        acaoLabels: { ver: 'Visualizar Dashboard e Indicadores' }
    },
    configuracoes: {
        label: '🏢 Dados da Empresa',
        grupo: 'Empresa',
        acoes: ['ver', 'editar'],
        fallback: 'usuarios',
        acaoLabels: { ver: 'Visualizar Dados da Empresa', editar: 'Alterar Dados da Empresa e Cupons' }
    },
    usuarios: {
        label: '👤 Gestão de Usuários',
        grupo: 'Empresa',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Lista de Usuários', criar: 'Cadastrar Novo Usuário', editar: 'Editar Dados e Permissões', excluir: 'Ativar / Desativar Usuário' }
    },
    importacao: {
        label: '📥 Importação de Dados',
        grupo: 'Empresa',
        acoes: ['ver', 'executar'],
        fallback: 'usuarios',
        acaoLabels: { ver: 'Acessar Tela de Importação', executar: 'Executar Importação de Planilhas' }
    },

    // 2. CRM & Pessoas
    clientes: {
        label: '👥 Clientes',
        grupo: 'CRM',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Clientes', criar: 'Cadastrar Novo Cliente', editar: 'Editar Cliente', excluir: 'Excluir / Inativar Cliente' }
    },
    fornecedores: {
        label: '🏭 Fornecedores',
        grupo: 'CRM',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Fornecedores', criar: 'Cadastrar Fornecedor', editar: 'Editar Fornecedor', excluir: 'Excluir Fornecedor' }
    },
    colaboradores: {
        label: '👥 Colaboradores',
        grupo: 'CRM',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Colaboradores', criar: 'Cadastrar Colaborador', editar: 'Editar Colaborador', excluir: 'Excluir Colaborador' }
    },

    // 3. Suprimentos & Estoque
    produtos: {
        label: '📦 Serviços & Produtos',
        grupo: 'Suprimentos',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Catálogo de Produtos', criar: 'Cadastrar Produto/Serviço', editar: 'Editar Produto/Preço/Serial', excluir: 'Excluir Produto' }
    },
    estoque: {
        label: '💾 Saldo & Ajuste de Estoque',
        grupo: 'Suprimentos',
        acoes: ['ver', 'ajustar'],
        acaoLabels: { ver: 'Visualizar Saldo de Estoque', ajustar: 'Ajustar / Movimentar Estoque Manualmente' }
    },
    categorias: {
        label: '🏷️ Categorias',
        grupo: 'Suprimentos',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Categorias', criar: 'Criar Categoria', editar: 'Editar Categoria', excluir: 'Excluir Categoria' }
    },

    // 4. Compras
    entradas: {
        label: '📥 Compras / Entradas',
        grupo: 'Compras',
        acoes: ['ver', 'criar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Relatório de Compras', criar: 'Lançar Nova Entrada (Nota Fiscal)', excluir: 'Cancelar / Estornar Entrada' }
    },
    devolucoes: {
        label: '🔄 Devoluções de Mercadorias',
        grupo: 'Compras',
        acoes: ['ver', 'criar'],
        fallback: 'saidas',
        acaoLabels: { ver: 'Visualizar Devoluções', criar: 'Registrar Devolução de Mercadoria' }
    },

    // 5. Faturamento & Vendas
    saidas: {
        label: '💳 PDV / Vendas',
        grupo: 'Faturamento',
        acoes: ['ver', 'criar', 'cancelar', 'ver_vendas_outros'],
        acaoLabels: { ver: 'Acessar Frente de Caixa / Vendas', criar: 'Realizar Nova Venda (PDV)', cancelar: 'Cancelar Venda Concluída', ver_vendas_outros: 'Visualizar Vendas de Outros Operadores' }
    },
    assinaturas: {
        label: '🔄 Serviços Recorrentes / Assinaturas',
        grupo: 'Faturamento',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        fallback: 'saidas',
        acaoLabels: { ver: 'Visualizar Assinaturas Recorrentes', criar: 'Cadastrar Nova Assinatura', editar: 'Editar Assinatura', excluir: 'Cancelar / Encerrar Assinatura' }
    },
    promocoes: {
        label: '🎯 Ações Promocionais',
        grupo: 'Faturamento',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        fallback: 'saidas',
        acaoLabels: { ver: 'Visualizar Promoções', criar: 'Criar Ação Promocional', editar: 'Editar Promoção', excluir: 'Encerrar / Excluir Promoção' }
    },
    agendamentos: {
        label: '📅 Agendamentos de Atendimentos',
        grupo: 'Faturamento',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        fallback: 'dashboard',
        acaoLabels: { ver: 'Visualizar Grade de Agendamentos', criar: 'Criar Novo Agendamento', editar: 'Reagendar / Alterar Agendamento', excluir: 'Cancelar Agendamento' }
    },
    mesas: {
        label: '📋 Comanda / Mesas / Atendimentos',
        grupo: 'Faturamento',
        acoes: ['ver', 'criar', 'editar', 'fechar'],
        fallback: 'saidas',
        acaoLabels: { ver: 'Visualizar Comandas e Mesas', criar: 'Abrir Comanda / Mesa', editar: 'Adicionar / Modificar Itens', fechar: 'Encerrar e Fechar Comanda' }
    },
    ordens_servico: {
        label: '🔧 Ordens de Serviço (OS)',
        grupo: 'Faturamento',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        acaoLabels: { ver: 'Visualizar Ordens de Serviço', criar: 'Abrir Nova OS', editar: 'Atualizar Status e Laudo da OS', excluir: 'Cancelar / Excluir OS' }
    },

    // 6. Financeiro
    fechamento: {
        label: '💵 Fechamento de Caixa',
        grupo: 'Financeiro',
        acoes: ['ver', 'abrir', 'fechar', 'cancelar'],
        fallback: 'saidas',
        acaoLabels: { ver: 'Visualizar Histórico e Relatórios de Caixa', abrir: 'Realizar Abertura / Suprimento', fechar: 'Efetuar Fechamento / Sangria de Caixa', cancelar: 'Cancelar Fechamento e Reajustar Valores' }
    },
    fiado: {
        label: '📋 Fiado e Contas a Receber',
        grupo: 'Financeiro',
        acoes: ['ver', 'criar', 'receber', 'cancelar'],
        fallback: 'saidas',
        acaoLabels: { ver: 'Visualizar Contas a Receber (Fiado)', criar: 'Registrar Nova Conta / Carnê', receber: 'Dar Baixa / Receber Pagamentos', cancelar: 'Cancelar Venda a Prazo' }
    },
    despesas: {
        label: '💸 Despesas / Contas a Pagar',
        grupo: 'Financeiro',
        acoes: ['ver', 'criar', 'editar', 'excluir'],
        fallback: 'financeiro',
        acaoLabels: { ver: 'Visualizar Despesas', criar: 'Cadastrar Nova Despesa / Boleto', editar: 'Editar Despesa', excluir: 'Excluir / Cancelar Despesa' }
    },
    comissoes: {
        label: '💰 Comissões a Pagar',
        grupo: 'Financeiro',
        acoes: ['ver', 'pagar'],
        fallback: 'relatorios',
        acaoLabels: { ver: 'Visualizar Relatório de Comissões', pagar: 'Registrar Pagamento de Comissão' }
    },

    // 7. Relatórios
    relatorios: {
        label: '📊 Central de Relatórios',
        grupo: 'Relatórios',
        acoes: ['ver', 'exportar'],
        acaoLabels: { ver: 'Visualizar Relatórios Gerais', exportar: 'Exportar Relatórios (PDF / Excel)' }
    },
    inventario: {
        label: '📦 Registro de Inventário',
        grupo: 'Relatórios',
        acoes: ['ver', 'exportar'],
        fallback: 'relatorios',
        acaoLabels: { ver: 'Visualizar Inventário Físico e Financeiro', exportar: 'Exportar Balanço de Inventário' }
    }
};

// Aliases para módulos equivalentes
const ALIASES_MODULOS = {
    'financeiro': 'despesas',
    'contas_receber': 'fiado',
    'caixas': 'fechamento',
    'empresa': 'configuracoes'
};

// 2. Matriz de permissões padrão por perfil
const PERMISSOES_PADRAO_PERFIL = {
    admin: {
        dashboard: { ver: true },
        configuracoes: { ver: true, editar: true },
        usuarios: { ver: true, criar: true, editar: true, excluir: true },
        importacao: { ver: true, executar: true },
        clientes: { ver: true, criar: true, editar: true, excluir: true },
        fornecedores: { ver: true, criar: true, editar: true, excluir: true },
        colaboradores: { ver: true, criar: true, editar: true, excluir: true },
        produtos: { ver: true, criar: true, editar: true, excluir: true },
        estoque: { ver: true, ajustar: true },
        categorias: { ver: true, criar: true, editar: true, excluir: true },
        entradas: { ver: true, criar: true, excluir: true },
        devolucoes: { ver: true, criar: true },
        saidas: { ver: true, criar: true, cancelar: true, ver_vendas_outros: true },
        assinaturas: { ver: true, criar: true, editar: true, excluir: true },
        promocoes: { ver: true, criar: true, editar: true, excluir: true },
        agendamentos: { ver: true, criar: true, editar: true, excluir: true },
        mesas: { ver: true, criar: true, editar: true, fechar: true },
        ordens_servico: { ver: true, criar: true, editar: true, excluir: true },
        fechamento: { ver: true, abrir: true, fechar: true, cancelar: true },
        fiado: { ver: true, criar: true, receber: true, cancelar: true },
        despesas: { ver: true, criar: true, editar: true, excluir: true },
        comissoes: { ver: true, pagar: true },
        relatorios: { ver: true, exportar: true },
        inventario: { ver: true, exportar: true }
    },
    gerente: {
        dashboard: { ver: true },
        configuracoes: { ver: true, editar: true },
        usuarios: { ver: false, criar: false, editar: false, excluir: false },
        importacao: { ver: false, executar: false },
        clientes: { ver: true, criar: true, editar: true, excluir: false },
        fornecedores: { ver: true, criar: true, editar: true, excluir: false },
        colaboradores: { ver: true, criar: true, editar: true, excluir: false },
        produtos: { ver: true, criar: true, editar: true, excluir: false },
        estoque: { ver: true, ajustar: true },
        categorias: { ver: true, criar: false, editar: false, excluir: false },
        entradas: { ver: true, criar: true, excluir: false },
        devolucoes: { ver: true, criar: true },
        saidas: { ver: true, criar: true, cancelar: true, ver_vendas_outros: true },
        assinaturas: { ver: true, criar: true, editar: true, excluir: false },
        promocoes: { ver: true, criar: true, editar: true, excluir: false },
        agendamentos: { ver: true, criar: true, editar: true, excluir: false },
        mesas: { ver: true, criar: true, editar: true, fechar: true },
        ordens_servico: { ver: true, criar: true, editar: true, excluir: false },
        fechamento: { ver: true, abrir: true, fechar: true, cancelar: true },
        fiado: { ver: true, criar: true, receber: true, cancelar: false },
        despesas: { ver: true, criar: true, editar: true, excluir: false },
        comissoes: { ver: true, pagar: true },
        relatorios: { ver: true, exportar: true },
        inventario: { ver: true, exportar: true }
    },
    vendedor: {
        dashboard: { ver: true },
        configuracoes: { ver: false, editar: false },
        usuarios: { ver: false, criar: false, editar: false, excluir: false },
        importacao: { ver: false, executar: false },
        clientes: { ver: true, criar: true, editar: true, excluir: false },
        fornecedores: { ver: false, criar: false, editar: false, excluir: false },
        colaboradores: { ver: false, criar: false, editar: false, excluir: false },
        produtos: { ver: true, criar: false, editar: false, excluir: false },
        estoque: { ver: true, ajustar: false },
        categorias: { ver: false, criar: false, editar: false, excluir: false },
        entradas: { ver: false, criar: false, excluir: false },
        devolucoes: { ver: false, criar: false },
        saidas: { ver: true, criar: true, cancelar: false, ver_vendas_outros: false },
        assinaturas: { ver: false, criar: false, editar: false, excluir: false },
        promocoes: { ver: true, criar: false, editar: false, excluir: false },
        agendamentos: { ver: true, criar: true, editar: false, excluir: false },
        mesas: { ver: true, criar: true, editar: true, fechar: false },
        ordens_servico: { ver: false, criar: false, editar: false, excluir: false },
        fechamento: { ver: true, abrir: true, fechar: false, cancelar: false },
        fiado: { ver: true, criar: true, receber: true, cancelar: false },
        despesas: { ver: false, criar: false, editar: false, excluir: false },
        comissoes: { ver: false, pagar: false },
        relatorios: { ver: false, exportar: false },
        inventario: { ver: false, exportar: false }
    },
    tecnico: {
        dashboard: { ver: true },
        configuracoes: { ver: false, editar: false },
        usuarios: { ver: false, criar: false, editar: false, excluir: false },
        importacao: { ver: false, executar: false },
        clientes: { ver: true, criar: true, editar: true, excluir: false },
        fornecedores: { ver: false, criar: false, editar: false, excluir: false },
        colaboradores: { ver: false, criar: false, editar: false, excluir: false },
        produtos: { ver: true, criar: false, editar: false, excluir: false },
        estoque: { ver: false, ajustar: false },
        categorias: { ver: false, criar: false, editar: false, excluir: false },
        entradas: { ver: false, criar: false, excluir: false },
        devolucoes: { ver: false, criar: false },
        saidas: { ver: false, criar: false, cancelar: false, ver_vendas_outros: false },
        assinaturas: { ver: false, criar: false, editar: false, excluir: false },
        promocoes: { ver: false, criar: false, editar: false, excluir: false },
        agendamentos: { ver: true, criar: true, editar: true, excluir: false },
        mesas: { ver: false, criar: false, editar: false, fechar: false },
        ordens_servico: { ver: true, criar: true, editar: true, excluir: false },
        fechamento: { ver: false, abrir: false, fechar: false, cancelar: false },
        fiado: { ver: false, criar: false, receber: false, cancelar: false },
        despesas: { ver: false, criar: false, editar: false, excluir: false },
        comissoes: { ver: false, pagar: false },
        relatorios: { ver: false, exportar: false },
        inventario: { ver: false, exportar: false }
    },
    basico: {
        dashboard: { ver: false },
        configuracoes: { ver: false, editar: false },
        usuarios: { ver: false, criar: false, editar: false, excluir: false },
        importacao: { ver: false, executar: false },
        clientes: { ver: true, criar: false, editar: false, excluir: false },
        fornecedores: { ver: false, criar: false, editar: false, excluir: false },
        colaboradores: { ver: false, criar: false, editar: false, excluir: false },
        produtos: { ver: true, criar: false, editar: false, excluir: false },
        estoque: { ver: false, ajustar: false },
        categorias: { ver: false, criar: false, editar: false, excluir: false },
        entradas: { ver: false, criar: false, excluir: false },
        devolucoes: { ver: false, criar: false },
        saidas: { ver: false, criar: false, cancelar: false, ver_vendas_outros: false },
        assinaturas: { ver: false, criar: false, editar: false, excluir: false },
        promocoes: { ver: false, criar: false, editar: false, excluir: false },
        agendamentos: { ver: false, criar: false, editar: false, excluir: false },
        mesas: { ver: false, criar: false, editar: false, fechar: false },
        ordens_servico: { ver: false, criar: false, editar: false, excluir: false },
        fechamento: { ver: false, abrir: false, fechar: false, cancelar: false },
        fiado: { ver: false, criar: false, receber: false, cancelar: false },
        despesas: { ver: false, criar: false, editar: false, excluir: false },
        comissoes: { ver: false, pagar: false },
        relatorios: { ver: false, exportar: false },
        inventario: { ver: false, exportar: false }
    }
};

/**
 * Função mestre para checagem de permissão de um usuário
 * @param {object} usuario - Objeto do usuário (ou null para usar o logado)
 * @param {string} modulo - Nome do módulo ou tela
 * @param {string} acao - Ação desejada ('ver', 'criar', 'editar', 'excluir', etc.)
 * @returns {boolean}
 */
function verificarPermissaoUsuario(usuario, modulo, acao = 'ver') {
    if (!usuario) return false;

    // Administrador tem acesso absoluto a todas as telas e ações
    if (usuario.perfil === 'admin') return true;

    // Normalizar nome do módulo (suporte a aliases)
    const moduloReal = ALIASES_MODULOS[modulo] || modulo;
    const permissoes = usuario.permissoes || {};

    // 1. Permissão explicitamente configurada para o módulo e ação
    if (permissoes[moduloReal] && permissoes[moduloReal][acao] !== undefined) {
        return Boolean(permissoes[moduloReal][acao]);
    }

    // 2. Compatibilidade reversa: suporte a chaves legadas se o módulo não existir no JSON
    if (moduloReal === 'despesas' && permissoes.financeiro && permissoes.financeiro[acao] !== undefined) {
        return Boolean(permissoes.financeiro[acao]);
    }
    if (moduloReal === 'fiado' && permissoes.contas_receber && permissoes.contas_receber[acao] !== undefined) {
        return Boolean(permissoes.contas_receber[acao]);
    }

    // 3. Fallback inteligente de herança legado (se o módulo novo ainda não foi configurado no JSON)
    const fallbackModulo = SCHEMA_PERMISSOES[moduloReal]?.fallback;
    if (fallbackModulo && permissoes[fallbackModulo] && permissoes[fallbackModulo][acao] !== undefined) {
        return Boolean(permissoes[fallbackModulo][acao]);
    }

    // 4. Se não houver permissão customizada no usuário, aplicar o padrão do perfil
    const perfil = usuario.perfil || 'basico';
    const perfilDefaults = PERMISSOES_PADRAO_PERFIL[perfil] || PERMISSOES_PADRAO_PERFIL.basico;
    if (perfilDefaults[moduloReal] && perfilDefaults[moduloReal][acao] !== undefined) {
        return Boolean(perfilDefaults[moduloReal][acao]);
    }

    return false;
}

/**
 * Verifica se o usuário logado tem permissão para um módulo/ação
 * @param {string} modulo - Nome do módulo (ex: 'clientes', 'produtos', 'fiado')
 * @param {string} acao - Ação (ex: 'ver', 'criar', 'editar', 'excluir')
 * @returns {boolean}
 */
function temPermissao(modulo, acao = 'ver') {
    const usuario = getUsuarioLogado();
    return verificarPermissaoUsuario(usuario, modulo, acao);
}

// Alias para verificarPermissao
function verificarPermissao(modulo, acao = 'ver') {
    return temPermissao(modulo, acao);
}

/**
 * Obtém a primeira página que o usuário tem permissão para visualizar
 * @param {object} usuario - Objeto do usuário logado
 * @returns {string} - Nome do arquivo HTML correspondente
 */
function obterPrimeiraPaginaPermitida(usuario) {
    if (!usuario) return 'index.html';
    if (usuario.perfil === 'admin') return 'dashboard.html';

    const paginasOrdem = [
        { href: 'dashboard.html', modulo: 'dashboard' },
        { href: 'saidas.html', modulo: 'saidas' },
        { href: 'estoque.html', modulo: 'estoque' },
        { href: 'produtos.html', modulo: 'produtos' },
        { href: 'clientes.html', modulo: 'clientes' },
        { href: 'fechamento.html', modulo: 'fechamento' },
        { href: 'fiado.html', modulo: 'fiado' },
        { href: 'agendamentos.html', modulo: 'agendamentos' },
        { href: 'mesas.html', modulo: 'mesas' },
        { href: 'entradas.html', modulo: 'entradas' },
        { href: 'devolucoes.html', modulo: 'devolucoes' },
        { href: 'despesas.html', modulo: 'despesas' },
        { href: 'assinaturas.html', modulo: 'assinaturas' },
        { href: 'promocoes.html', modulo: 'promocoes' },
        { href: 'fornecedores.html', modulo: 'fornecedores' },
        { href: 'colaboradores.html', modulo: 'colaboradores' },
        { href: 'categorias.html', modulo: 'categorias' },
        { href: 'comissoes.html', modulo: 'comissoes' },
        { href: 'relatorios.html', modulo: 'relatorios' },
        { href: 'usuarios.html', modulo: 'usuarios' },
        { href: 'importacao.html', modulo: 'importacao' }
    ];

    for (const p of paginasOrdem) {
        if (verificarPermissaoUsuario(usuario, p.modulo, 'ver')) {
            return p.href;
        }
    }

    return 'index.html';
}

/**
 * Verifica se o usuário tem permissão e redireciona se não tiver
 * @param {string} modulo - Nome do módulo
 * @param {string} acao - Ação (padrão: 'ver')
 * @param {string} redirectTo - Página para redirecionar (padrão: automática)
 * @returns {boolean}
 */
function verificarEAcessar(modulo, acao = 'ver', redirectTo = null) {
    if (!temPermissao(modulo, acao)) {
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao('Acesso negado! Você não tem permissão para esta funcionalidade.', 'error');
        }
        const target = redirectTo || obterPrimeiraPaginaPermitida(getUsuarioLogado());
        setTimeout(() => {
            window.location.href = target;
        }, 800);
        return false;
    }
    return true;
}

// Objeto de namespace global
window.AionPermissoes = {
    SCHEMA: SCHEMA_PERMISSOES,
    PERFIS_PADRAO: PERMISSOES_PADRAO_PERFIL,
    ALIASES: ALIASES_MODULOS,
    verificar: verificarPermissaoUsuario,
    obterPrimeiraPagina: obterPrimeiraPaginaPermitida
};

// Exportar globalmente para todas as páginas e scripts
window.getUsuarioLogado = getUsuarioLogado;
window.temPermissao = temPermissao;
window.verificarPermissao = verificarPermissao;
window.verificarPermissaoUsuario = verificarPermissaoUsuario;
window.obterPrimeiraPaginaPermitida = obterPrimeiraPaginaPermitida;
window.verificarEAcessar = verificarEAcessar;

// =====================================================
// FUNÇÕES DE VALIDAÇÃO - SERIAL/IMEI (Tabela unificada produtos_seriais)
// =====================================================

/**
 * Validar se Serial/IMEI já existe no banco
 * @param {string} serial - Serial ou IMEI para validar
 * @param {number} produtoId - ID do produto (opcional)
 * @returns {Promise<boolean>} true se já existe, false se está disponível
 */
async function serialJaExiste(serial, produtoId = null) {
    if (!serial || serial.trim() === '') {
        return false; // Serial vazio é considerado válido
    }
    
    const usuario = getUsuarioLogado();
    if (usuario && usuario.config_loja?.habilitar_seriais === false) {
        return false;
    }
    
    try {
        let query = supabaseClient
            .from('produtos_seriais')
            .select('id')
            .eq('numero_serie', serial.trim())
            .eq('disponivel', false); // Procurar apenas os que estão EM USO
        
        if (produtoId) {
            query = query.eq('produto_id', produtoId);
        }
        
        const { data, error } = await query.limit(1);
        
        if (error) {
            console.error('Erro ao validar serial:', error);
            return false;
        }
        
        return data && data.length > 0;
    } catch (error) {
        console.error('Erro ao validar serial:', error);
        return false;
    }
}

/**
 * Registrar novo Serial/IMEI no banco
 * @param {object} dados - { produto_id, serial, data_entrada }
 * @returns {Promise<boolean>} true se sucesso, false se falhou
 */
async function registrarSerial(dados) {
    try {
        // Validar se já existe
        const existe = await serialJaExiste(dados.serial, dados.produto_id);
        if (existe) {
            mostrarNotificacao('❌ Este Serial/IMEI já está em uso!', 'error');
            return false;
        }
        
        const { error } = await supabaseClient
            .from('produtos_seriais')
            .insert([{
                produto_id: dados.produto_id,
                numero_serie: dados.serial.trim(),
                serial: dados.serial.trim(),
                disponivel: true,
                status: 'disponivel',
                data_entrada: dados.data_entrada || new Date().toISOString()
            }]);
        
        if (error) {
            console.error('Erro ao registrar serial:', error);
            mostrarNotificacao('❌ Erro ao registrar Serial/IMEI', 'error');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Erro ao registrar serial:', error);
        mostrarNotificacao('❌ Erro ao registrar Serial/IMEI', 'error');
        return false;
    }
}

/**
 * Marcar Serial como usado (em uma venda)
 * @param {string} serial - Serial para marcar como usado
 * @returns {Promise<boolean>} true se sucesso
 */
async function marcarSerialComoUsado(serial) {
    try {
        const { error } = await supabaseClient
            .from('produtos_seriais')
            .update({ disponivel: false, status: 'vendido', data_saida: new Date().toISOString() })
            .eq('numero_serie', serial.trim());
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao marcar serial como usado:', error);
        return false;
    }
}

/**
 * Reativar Serial (ao cancelar uma venda)
 * @param {string} serial - Serial para reativar
 * @returns {Promise<boolean>} true se sucesso
 */
async function reativarSerial(serial) {
    try {
        const { error } = await supabaseClient
            .from('produtos_seriais')
            .update({ disponivel: true, status: 'disponivel', data_saida: null })
            .eq('numero_serie', serial.trim());
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao reativar serial:', error);
        return false;
    }
}

// Exportar funções de serial
window.serialJaExiste = serialJaExiste;
window.registrarSerial = registrarSerial;
window.marcarSerialComoUsado = marcarSerialComoUsado;
window.reativarSerial = reativarSerial;

// =====================================================
// FUNÇÕES DE CONTROLE DE CAIXA
// =====================================================

function getDataHojeBrasil() {
    const hoje = new Date();
    const dataStr = hoje.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const partes = dataStr.split('/');
    return `${partes[2]}-${partes[1]}-${partes[0]}`; // YYYY-MM-DD
}

function obterDataCaixaBrasil(dataISO) {
    if (!dataISO) return '';
    const d = new Date(dataISO);
    const dataStr = d.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const partes = dataStr.split('/');
    return `${partes[2]}-${partes[1]}-${partes[0]}`; // YYYY-MM-DD
}

function isCaixaDiaAnterior(caixa) {
    if (!caixa || !caixa.data_abertura) return false;
    const dataCaixa = obterDataCaixaBrasil(caixa.data_abertura);
    const dataHoje = getDataHojeBrasil();
    return dataCaixa < dataHoje;
}

async function obterCaixaAtivo() {
    try {
        const { data, error } = await supabaseClient
            .from('caixas')
            .select('*')
            .eq('status', 'aberto')
            .order('id', { ascending: false })
            .limit(1);

        if (error) {
            if (error.code === 'PGRST116' || error.status === 404) {
                console.warn('⚠️ A tabela public.caixas não existe ou não foi configurada ainda.');
            }
            return null;
        }

        return data && data.length > 0 ? data[0] : null;
    } catch (e) {
        console.error('Erro ao consultar caixa ativo:', e);
        return null;
    }
}

async function obterUltimoCaixaFechado() {
    try {
        const { data, error } = await supabaseClient
            .from('caixas')
            .select('*')
            .eq('status', 'fechado')
            .order('id', { ascending: false })
            .limit(1);

        if (error) return null;
        return data && data.length > 0 ? data[0] : null;
    } catch (e) {
        console.error('Erro ao consultar último caixa fechado:', e);
        return null;
    }
}

async function obterStatusCaixa() {
    const caixa = await obterCaixaAtivo();
    if (!caixa) {
        return { tipo: 'fechado', caixa: null };
    }
    if (isCaixaDiaAnterior(caixa)) {
        return { tipo: 'pendente_fechamento_anterior', caixa: caixa };
    }
    return { tipo: 'aberto_hoje', caixa: caixa };
}

function formatarDataHora(dataISO) {
    if (!dataISO) return '-';
    const date = new Date(dataISO);
    return date.toLocaleString('pt-BR');
}

// Exportar funções de caixa
window.formatarDataHora = formatarDataHora;
window.getDataHojeBrasil = getDataHojeBrasil;
window.obterDataCaixaBrasil = obterDataCaixaBrasil;
window.isCaixaDiaAnterior = isCaixaDiaAnterior;
window.obterCaixaAtivo = obterCaixaAtivo;
window.obterUltimoCaixaFechado = obterUltimoCaixaFechado;
window.obterStatusCaixa = obterStatusCaixa;

// =====================================================
// FUNÇÕES DE CÓDIGO ALFANUMÉRICO AUTOMÁTICO (A0001)
// =====================================================

function nextCode(lastCode) {
    if (!lastCode) return 'A0001';
    
    const match = lastCode.toUpperCase().match(/^([A-Z])(\d{4})$/);
    if (!match) {
        return 'A0001';
    }
    
    let letter = match[1];
    let number = parseInt(match[2], 10);
    
    number++;
    if (number > 9999) {
        number = 1;
        let charCode = letter.charCodeAt(0);
        charCode++;
        if (charCode > 90) { // Passou de 'Z'
            letter = 'A';
        } else {
            letter = String.fromCharCode(charCode);
        }
    }
    
    const numberStr = String(number).padStart(4, '0');
    return `${letter}${numberStr}`;
}

async function obterProximoCodigoProduto() {
    try {
        const { data, error } = await supabaseClient
            .from('produtos')
            .select('codigo')
            .order('id', { ascending: false })
            .limit(100);
            
        if (error) throw error;
        
        let ultimoCodigoValido = null;
        if (data && data.length > 0) {
            for (const p of data) {
                if (p.codigo && /^[A-Z]\d{4}$/i.test(p.codigo.trim())) {
                    ultimoCodigoValido = p.codigo.trim().toUpperCase();
                    break;
                }
            }
        }
        
        return nextCode(ultimoCodigoValido);
    } catch (e) {
        console.error('Erro ao obter proximo codigo:', e);
        return 'A0001';
    }
}

window.nextCode = nextCode;
window.obterProximoCodigoProduto = obterProximoCodigoProduto;

// Inicialização Dinâmica de Branding no DOM
document.addEventListener('DOMContentLoaded', () => {
    if (window.ENV) {
        // A tela de login SEMPRE exibe estritamente: "Aion ERP" e "by AionLabs" (nunca nome ou id de cliente)
        const loginTitle = document.querySelector('.login-header h1');
        if (loginTitle) {
            loginTitle.textContent = 'Aion ERP';
        }
        
        const loginSubtitle = document.querySelector('.login-header .subtitle');
        if (loginSubtitle) {
            loginSubtitle.textContent = 'by AionLabs';
        }
        
        const footerText = document.querySelector('.login-footer p');
        if (footerText) {
            footerText.innerHTML = `Aion ERP &copy; ${new Date().getFullYear()} by AionLabs`;
        }
        
        // Substituir logotipo no login se especificado
        if (window.ENV.BRANDING?.logoUrl) {
            const logoContainer = document.querySelector('.login-logo');
            if (logoContainer) {
                logoContainer.innerHTML = `<img src="${window.ENV.BRANDING.logoUrl}" alt="Logo" style="max-height: 100%; max-width: 100%; object-fit: contain;">`;
            }
        }
    }
});