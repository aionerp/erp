// js/config.js
// Configuração do Supabase

// 1. Tentar carregar env.js de forma síncrona se disponível para preencher window.ENV
try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'env.js', false); // Síncrono
    xhr.send();
    if (xhr.status === 200) {
        eval(xhr.responseText);
    }
} catch (e) {
    console.log('Arquivo env.js não encontrado localmente.');
}

// 2. Se houver um cliente ativo na sessão (definido no login ou primeiro acesso), usar suas credenciais
const activeClientStr = sessionStorage.getItem('active_client');
if (activeClientStr) {
    try {
        const activeClient = JSON.parse(activeClientStr);
        if (activeClient && activeClient.supabase?.url && activeClient.supabase?.anonKey) {
            window.ENV = {
                ...window.ENV,
                CLIENT_ID: activeClient.clientId,
                COMPANY_NAME: activeClient.companyName,
                COMPANY_SUBTITLE: activeClient.companySubtitle,
                PREFIX: activeClient.prefix,
                CNPJ: activeClient.cnpjFormatted || activeClient.cnpj,
                SUPABASE_URL: activeClient.supabase.url,
                SUPABASE_ANON_KEY: activeClient.supabase.anonKey,
                BRANDING: activeClient.branding || {},
                FEATURES: activeClient.features || {}
            };
        }
    } catch (e) {
        console.warn('Erro ao carregar active_client da sessão:', e);
    }
}

// Injeção dinâmica de branding/cores se configuradas
if (window.ENV?.BRANDING?.primaryColor) {
    let style = document.getElementById('dynamic-branding-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'dynamic-branding-styles';
        document.head.appendChild(style);
    }
    style.textContent = `
        :root {
            --primary: ${window.ENV.BRANDING.primaryColor} !important;
            ${window.ENV.BRANDING.primaryDarkColor ? `--primary-dark: ${window.ENV.BRANDING.primaryDarkColor} !important;` : ''}
            ${window.ENV.BRANDING.primaryLightColor ? `--primary-light: ${window.ENV.BRANDING.primaryLightColor} !important;` : ''}
        }
    `;
}

const SUPABASE_URL = window.ENV?.SUPABASE_URL || 'https://madaoptvsbnhelamwyzp.supabase.co';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZGFvcHR2c2JuaGVsYW13eXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzIxMTQsImV4cCI6MjA5OTg0ODExNH0.I3QKcld6haTURNf9f3VfxduHjx9-9-mjiEdg0HmlqD4';

if (!SUPABASE_ANON_KEY) {
    console.warn('⚠️ AVISO DE SEGURANÇA: SUPABASE_ANON_KEY não configurada!');
}

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
            'movimentos_estoque', 'config_loja', 'agendamentos', 'mesas_comandas', 'caixas', 'colaboradores', 'despesas', 'boletos_pagar'
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
    return client;
}

// Inicializar cliente Supabase padrão
if (typeof supabaseClient === 'undefined') {
    var supabaseClient = criarClienteSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
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
    return clients.find(c => String(c.prefix || c.clientId).toLowerCase() === cleanPref) || null;
};

window.conectarClienteSupabase = function(clienteConfig) {
    if (!clienteConfig || !clienteConfig.supabase?.url || !clienteConfig.supabase?.anonKey) {
        console.error('Configuração de Supabase inválida para o cliente:', clienteConfig);
        return null;
    }
    
    // Atualizar window.ENV em tempo de execução
    window.ENV = {
        ...window.ENV,
        CLIENT_ID: clienteConfig.clientId,
        COMPANY_NAME: clienteConfig.companyName,
        COMPANY_SUBTITLE: clienteConfig.companySubtitle,
        PREFIX: clienteConfig.prefix,
        CNPJ: clienteConfig.cnpjFormatted || clienteConfig.cnpj,
        SUPABASE_URL: clienteConfig.supabase.url,
        SUPABASE_ANON_KEY: clienteConfig.supabase.anonKey,
        BRANDING: clienteConfig.branding || {},
        FEATURES: clienteConfig.features || {}
    };

    // Salvar cliente ativo na sessão para persistir em todas as telas
    try {
        sessionStorage.setItem('active_client', JSON.stringify(clienteConfig));
    } catch(e) {}
    
    // Aplicar branding dinâmico
    if (clienteConfig.branding?.primaryColor) {
        let style = document.getElementById('dynamic-branding-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dynamic-branding-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            :root {
                --primary: ${clienteConfig.branding.primaryColor} !important;
                ${clienteConfig.branding.primaryDarkColor ? `--primary-dark: ${clienteConfig.branding.primaryDarkColor} !important;` : ''}
                ${clienteConfig.branding.primaryLightColor ? `--primary-light: ${clienteConfig.branding.primaryLightColor} !important;` : ''}
            }
        `;
    }
    
    // Recriar o cliente Supabase apontando para o banco do cliente
    supabaseClient = criarClienteSupabase(clienteConfig.supabase.url, clienteConfig.supabase.anonKey);
    window.supabaseClient = supabaseClient;
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

// Função global de logout - PREVENÇÃO DE LOOP
function fazerLogout() {
    if (confirm('Tem certeza que deseja sair do sistema?')) {
        // Limpar completamente a sessão
        sessionStorage.clear();
        // Usar window.location.replace para não manter histórico
        window.location.replace('index.html');
    }
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

// Função para obter o usuário logado
function getUsuarioLogado() {
    const usuario = sessionStorage.getItem('usuario');
    return usuario ? JSON.parse(usuario) : null;
}

// =====================================================
// FUNÇÕES DE PERMISSÃO
// =====================================================

/**
 * Verifica se o usuário logado tem permissão para um módulo/ação
 * @param {string} modulo - Nome do módulo (ex: 'clientes', 'produtos')
 * @param {string} acao - Ação (ex: 'ver', 'criar', 'editar', 'excluir')
 * @returns {boolean}
 */
function temPermissao(modulo, acao = 'ver') {
    const usuario = getUsuarioLogado();
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

/**
 * Obtém a primeira página que o usuário tem permissão para visualizar
 * @param {object} usuario - Objeto do usuário logado
 * @returns {string} - Nome do arquivo HTML correspondente
 */
function obterPrimeiraPaginaPermitida(usuario) {
    if (!usuario) return 'index.html';
    
    if (usuario.perfil === 'admin') return 'dashboard.html';
    
    const paginas = [
        { href: 'dashboard.html', modulo: 'dashboard' },
        { href: 'clientes.html', modulo: 'clientes' },
        { href: 'produtos.html', modulo: 'produtos' },
        { href: 'categorias.html', modulo: 'categorias' },
        { href: 'estoque.html', modulo: 'estoque' },
        { href: 'entradas.html', modulo: 'entradas' },
        { href: 'saidas.html', modulo: 'saidas' },
        { href: 'despesas.html', modulo: 'financeiro' },
        { href: 'fornecedores.html', modulo: 'fornecedores' },
        { href: 'colaboradores.html', modulo: 'colaboradores' },
        { href: 'relatorios.html', modulo: 'relatorios' },
        { href: 'usuarios.html', modulo: 'usuarios' }
    ];
    
    for (const p of paginas) {
        if (temPermissao(p.modulo, 'ver')) {
            return p.href;
        }
    }
    
    return 'index.html';
}

window.obterPrimeiraPaginaPermitida = obterPrimeiraPaginaPermitida;

/**
 * Verifica se o usuário tem permissão e redireciona se não tiver
 * @param {string} modulo - Nome do módulo
 * @param {string} acao - Ação (padrão: 'ver')
 * @param {string} redirectTo - Página para redirecionar (padrão: 'dashboard.html')
 * @returns {boolean}
 */
function verificarEAcessar(modulo, acao = 'ver', redirectTo = 'dashboard.html') {
    if (!temPermissao(modulo, acao)) {
        mostrarNotificacao('Acesso negado! Você não tem permissão.', 'error');
        setTimeout(() => {
            window.location.href = redirectTo;
        }, 1000);
        return false;
    }
    return true;
}

// Exportar funções
window.temPermissao = temPermissao;
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

// Exportar funções de caixa
window.obterCaixaAtivo = obterCaixaAtivo;
window.obterUltimoCaixaFechado = obterUltimoCaixaFechado;

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
        // Títulos de Páginas e Textos de Branding (Login)
        if (window.ENV.COMPANY_NAME) {
            const loginTitle = document.querySelector('.login-header h1');
            if (loginTitle) {
                loginTitle.textContent = window.ENV.COMPANY_NAME;
            }
            
            const loginSubtitle = document.querySelector('.login-header .subtitle');
            if (loginSubtitle) {
                loginSubtitle.textContent = window.ENV.COMPANY_SUBTITLE || 'by AionLabs';
            }
            
            const footerText = document.querySelector('.login-footer p');
            if (footerText) {
                footerText.innerHTML = `${window.ENV.COMPANY_NAME} &copy; ${new Date().getFullYear()} ${window.ENV.COMPANY_SUBTITLE ? window.ENV.COMPANY_SUBTITLE : ''}`;
            }

            // Títulos do Manual do Sistema se houver
            const coverTitle = document.querySelector('.cover-subtitle');
            if (coverTitle) {
                coverTitle.textContent = `${window.ENV.COMPANY_NAME} - Guia Prático de Operação de Vendas (PDV) e Controle de Estoque`;
            }
            const coverLogoHeader = document.querySelector('.cover-logo + h2');
            if (coverLogoHeader) {
                coverLogoHeader.textContent = `🍀 Manual do Sistema ${window.ENV.COMPANY_NAME}`;
            }
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