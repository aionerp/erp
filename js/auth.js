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
            
            try {
                // Autenticar chamando a RPC segura (bypassa RLS)
                let response = await supabaseClient
                    .rpc('autenticar_usuario', {
                        p_email: email,
                        p_senha: senha
                    });
                
                let data = response.data;
                let error = response.error;
                
                // Se a função autenticar_usuario não for encontrada (código PGRST202 ou status 404), tenta login_usuario
                if (error && (error.code === 'PGRST202' || error.status === 404 || error.message?.includes('autenticar_usuario'))) {
                    console.log('RPC autenticar_usuario não encontrada. Tentando login_usuario (fallback)...');
                    const fallbackRes = await supabaseClient
                        .rpc('login_usuario', {
                            p_email: email,
                            p_senha: senha
                        });
                    data = fallbackRes.data;
                    error = fallbackRes.error;
                }
                
                if (error) {
                    console.error('Erro na autenticação:', error);
                    throw new Error('Erro ao conectar com o banco de dados');
                }
                
                if (!data || data.length === 0) {
                    throw new Error('Email ou senha inválidos!');
                }

                const userData = data[0]; // Retorna uma lista de objetos
                
                if (!userData.ativo) {
                    throw new Error('Usuário inativo! Contate o administrador.');
                }
                
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
                await supabaseClient
                    .from('usuarios')
                    .update({ ultimo_acesso: new Date().toISOString() })
                    .eq('id', userData.id);
                
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