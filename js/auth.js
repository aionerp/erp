// js/auth.js
// Lógica de autenticação

// Aguardar DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se já está logado - se sim, ir para a primeira página permitida
    if (sessionStorage.getItem('usuario')) {
        const usuario = JSON.parse(sessionStorage.getItem('usuario'));
        window.location.href = obterPrimeiraPaginaPermitida(usuario);
        return;
    }

    // Limpar resquício de active_client de sessão anterior para evitar contaminação entre tenants
    try {
        sessionStorage.removeItem('active_client');
    } catch (e) {}
    
    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const senha = document.getElementById('password').value;
            const btn = document.querySelector('.btn-login');
            
            if (!email || !senha) {
                mostrarNotificacao('Preencha todos os campos!', 'error');
                return;
            }
            
            btn.disabled = true;
            btn.textContent = 'Entrando...';
            
            const inputIdentificador = email.trim();
            let matchedClient = null;

            // Identificar prefixo no usuário (ex: adm.originaleletronico ou adm.aionerp) e rotear para o cliente correto
            if (inputIdentificador.includes('.') && !inputIdentificador.includes('@')) {
                const parts = inputIdentificador.split('.');
                const prefix = parts[parts.length - 1].toLowerCase();
                if (typeof window.buscarClientePorPrefixo === 'function') {
                    matchedClient = await window.buscarClientePorPrefixo(prefix);
                    if (matchedClient) {
                        console.log(`Prefixo identificado (${prefix}). Conectando à loja: ${matchedClient.companyName}`);
                        window.conectarClienteSupabase(matchedClient);
                    }
                }
            } else {
                // Se for email sem prefixo (ex: arc48388528@gmail.com), rotear para o cliente01 padrão
                if (typeof window.buscarClientePorPrefixo === 'function') {
                    matchedClient = await window.buscarClientePorPrefixo('aionerp');
                    if (matchedClient) {
                        window.conectarClienteSupabase(matchedClient);
                    }
                }
            }
            
            try {
                // Obter cliente ativo de forma segura (evita erro se supabaseClient for null)
                let client = (typeof supabaseClient !== 'undefined' && supabaseClient) 
                    ? supabaseClient 
                    : (window.supabaseClient || window.dbClient);

                if (matchedClient && window.conectarClienteSupabase) {
                    client = window.conectarClienteSupabase(matchedClient);
                }

                if (!client && window.AionDataLayer) {
                    client = window.AionDataLayer.createClient(window.ENV || { clientId: 'cliente01', database: { provider: 'neon', connectionId: 'cliente01' } });
                    window.supabaseClient = client;
                }

                if (!client) {
                    throw new Error('Banco de dados não inicializado. Por favor, recarregue a página (Ctrl + F5).');
                }

                // Autenticar chamando a RPC segura (bypassa RLS)
                let response = await client
                    .rpc('autenticar_usuario', {
                        p_email: inputIdentificador,
                        p_senha: senha
                    });
                
                let data = response.data;
                let error = response.error;
                
                // Se a função autenticar_usuario não for encontrada, tenta login_usuario ou query direta
                if (error && (error.code === 'PGRST202' || error.status === 404 || error.message?.includes('autenticar_usuario'))) {
                    console.log('RPC autenticar_usuario não encontrada. Tentando login_usuario (fallback)...');
                    const fallbackRes = await client
                        .rpc('login_usuario', {
                            p_email: inputIdentificador,
                            p_senha: senha
                        });
                    data = fallbackRes.data;
                    error = fallbackRes.error;
                }

                // Fallback direto na tabela usuarios se RPCs não estiverem presentes
                if ((!data || data.length === 0) && (error || !response.data)) {
                    try {
                        const { data: directUsers } = await client
                            .from('usuarios')
                            .select('*, lojas(nome, segmento), config_loja(*)')
                            .eq('email', inputIdentificador)
                            .eq('senha', senha)
                            .eq('ativo', true)
                            .limit(1);
                        
                        if (directUsers && directUsers.length > 0) {
                            const u = directUsers[0];
                            data = [{
                                id: u.id,
                                nome: u.nome,
                                email: u.email,
                                perfil: u.perfil,
                                nivel_acesso: u.nivel_acesso,
                                ativo: u.ativo,
                                permissoes: u.permissoes,
                                loja_id: u.loja_id,
                                loja_nome: u.lojas?.nome || window.ENV?.COMPANY_NAME || 'Aion ERP',
                                loja_segmento: u.lojas?.segmento || 'eletronico',
                                config_loja: u.config_loja?.[0] || u.config_loja || null
                            }];
                            error = null;
                        }
                    } catch (e) {
                        console.warn('Fallback direto falhou:', e);
                    }
                }
                
                if (error) {
                    console.error('Erro na autenticação:', error);
                    throw new Error(error.message || error.details || 'Erro ao conectar com o banco de dados');
                }
                
                if (!data || data.length === 0) {
                    throw new Error('Usuário ou senha inválidos!');
                }

                const userData = data[0]; // Retorna uma lista de objetos
                
                if (!userData.ativo) {
                    throw new Error('Usuário inativo! Contate o administrador.');
                }
                
                const targetClientId = matchedClient?.clientId || window.ENV?.clientId || window.ENV?.CLIENT_ID || 'cliente01';

                // Salvar sessão com todas as informações (incluindo dados do tenant/loja e configurações)
                const usuarioLogado = {
                    id: userData.id,
                    nome: userData.nome,
                    email: userData.email,
                    perfil: userData.perfil || 'basico',
                    nivel_acesso: userData.nivel_acesso || 'basico',
                    permissoes: userData.permissoes || {},
                    ativo: userData.ativo,
                    loja_id: userData.loja_id,
                    loja_nome: userData.loja_nome || 'Aion ERP',
                    loja_segmento: userData.loja_segmento || 'eletronico',
                    clientId: targetClientId,
                    cliente_id: targetClientId,
                    config_loja: userData.config_loja || {
                        habilitar_seriais: true,
                        habilitar_agendamentos: false,
                        habilitar_mesas: false,
                        habilitar_lotes: false,
                        habilitar_variacoes: false
                    }
                };
                
                sessionStorage.setItem('usuario', JSON.stringify(usuarioLogado));
                
                // Atualizar último acesso
                try {
                    await client
                        .from('usuarios')
                        .update({ ultimo_acesso: new Date().toISOString() })
                        .eq('id', userData.id);
                } catch (e) {
                    console.warn('Não foi possível atualizar ultimo_acesso:', e);
                }
                
                mostrarNotificacao(`Bem-vindo, ${userData.nome}!`, 'success');
                
                setTimeout(() => {
                    window.location.href = obterPrimeiraPaginaPermitida(usuarioLogado);
                }, 500);
                
            } catch (error) {
                console.error('Erro no login:', error);
                mostrarNotificacao(error.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }
        });
    }
});