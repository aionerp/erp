// js/primeiro-acesso.js
// Módulo de Primeiro Acesso (Onboarding por CNPJ com Trava de Segurança e Usuário adm.<prefixo>)

document.addEventListener('DOMContentLoaded', () => {
    // Injetar estilos do modal de primeiro acesso se não existirem
    if (!document.getElementById('primeiro-acesso-styles')) {
        const style = document.createElement('style');
        style.id = 'primeiro-acesso-styles';
        style.textContent = `
            .modal-pa-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(17, 24, 39, 0.7);
                backdrop-filter: blur(6px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            }
            .modal-pa-overlay.active {
                opacity: 1;
                pointer-events: auto;
            }
            .modal-pa-card {
                background: #ffffff;
                border-radius: 16px;
                width: 100%;
                max-width: 560px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 20px 40px rgba(0,0,0,0.25);
                border: 1px solid rgba(255,255,255,0.2);
                transform: scale(0.95);
                transition: transform 0.25s ease;
                padding: 24px;
                box-sizing: border-box;
                font-family: inherit;
            }
            .modal-pa-overlay.active .modal-pa-card {
                transform: scale(1);
            }
            .modal-pa-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 14px;
                margin-bottom: 18px;
            }
            .modal-pa-header h2 {
                margin: 0;
                font-size: 18px;
                color: #111827;
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 700;
            }
            .modal-pa-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #6b7280;
                line-height: 1;
            }
            .modal-pa-close:hover { color: #111827; }
            .pa-step-badge {
                display: inline-flex;
                align-items: center;
                padding: 4px 10px;
                border-radius: 20px;
                background: #EEF2FF;
                color: #4F46E5;
                font-size: 12px;
                font-weight: 700;
                margin-bottom: 12px;
            }
            .pa-form-group {
                margin-bottom: 14px;
            }
            .pa-form-group label {
                display: block;
                font-size: 13px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 5px;
            }
            .pa-form-group input, .pa-form-group select {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                font-size: 14px;
                box-sizing: border-box;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .pa-form-group input:focus, .pa-form-group select:focus {
                outline: none;
                border-color: var(--primary, #0A4D68);
                box-shadow: 0 0 0 3px rgba(10, 77, 104, 0.15);
            }
            .pa-alert {
                padding: 12px;
                border-radius: 8px;
                font-size: 13px;
                line-height: 1.4;
                margin-bottom: 16px;
            }
            .pa-alert-info { background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; }
            .pa-alert-warning { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
            .pa-alert-error { background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
            .pa-alert-success { background: #DCFCE7; color: #166534; border: 1px solid #BBF7D0; }
            .pa-btn {
                width: 100%;
                padding: 12px;
                border-radius: 8px;
                border: none;
                background: var(--primary, #0A4D68);
                color: #fff;
                font-weight: 700;
                font-size: 14px;
                cursor: pointer;
                transition: opacity 0.2s;
                margin-top: 8px;
            }
            .pa-btn:hover { opacity: 0.9; }
            .pa-btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .pa-user-highlight {
                background: #F3F4F6;
                border: 1px dashed #9CA3AF;
                padding: 10px 14px;
                border-radius: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 14px;
            }
            .pa-user-highlight span { font-weight: 800; color: #111827; font-size: 15px; }
        `;
        document.head.appendChild(style);
    }

    // Criar elemento do modal no DOM se não existir
    if (!document.getElementById('modalPrimeiroAcesso')) {
        const modalContainer = document.createElement('div');
        modalContainer.id = 'modalPrimeiroAcesso';
        modalContainer.className = 'modal-pa-overlay';
        modalContainer.innerHTML = `
            <div class="modal-pa-card">
                <div class="modal-pa-header">
                    <h2>✨ Primeiro Acesso à Loja</h2>
                    <button type="button" class="modal-pa-close" id="btnFecharModalPA">&times;</button>
                </div>
                <div id="paConteudoModal">
                    <!-- Preenchido dinamicamente pelo JavaScript -->
                </div>
            </div>
        `;
        document.body.appendChild(modalContainer);
    }

    const modalPA = document.getElementById('modalPrimeiroAcesso');
    const btnFecharPA = document.getElementById('btnFecharModalPA');
    const paConteudo = document.getElementById('paConteudoModal');

    function fecharModalPA() {
        modalPA.classList.remove('active');
    }

    if (btnFecharPA) {
        btnFecharPA.addEventListener('click', fecharModalPA);
    }

    // Máscara dinâmica de CNPJ
    function aplicarMascaraCnpj(v) {
        v = v.replace(/\D/g, '');
        if (v.length > 14) v = v.substring(0, 14);
        v = v.replace(/^(\d{2})(\d)/, '$1.$2');
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
        return v;
    }

    // Estado do cliente selecionado no primeiro acesso
    let clienteSelecionadoPA = null;

    // Etapa 1: Consulta de CNPJ
    window.abrirPrimeiroAcesso = function() {
        clienteSelecionadoPA = null;
        modalPA.classList.add('active');
        renderizarEtapaCnpj();
    };

    function renderizarEtapaCnpj() {
        paConteudo.innerHTML = `
            <div class="pa-step-badge">Etapa 1 de 2: Identificação da Empresa</div>
            <p style="font-size: 13px; color: #4B5563; margin-top: 0; margin-bottom: 16px;">
                Digite o <strong>CNPJ</strong> da sua empresa para localizar as configurações do seu ERP e iniciar o cadastro do primeiro acesso.
            </p>
            <div id="paAlertContainer"></div>
            <form id="paFormCnpj">
                <div class="pa-form-group">
                    <label for="paInputCnpj">CNPJ da Empresa *</label>
                    <input type="text" id="paInputCnpj" placeholder="00.000.000/0000-00" maxlength="18" required autofocus>
                </div>
                <button type="submit" class="pa-btn" id="paBtnVerificarCnpj">Verificar CNPJ e Continuar</button>
            </form>
        `;

        const inputCnpj = document.getElementById('paInputCnpj');
        inputCnpj.addEventListener('input', (e) => {
            e.target.value = aplicarMascaraCnpj(e.target.value);
        });

        const formCnpj = document.getElementById('paFormCnpj');
        formCnpj.addEventListener('submit', async (e) => {
            e.preventDefault();
            const cnpjDigitado = inputCnpj.value;
            const btn = document.getElementById('paBtnVerificarCnpj');
            const alertBox = document.getElementById('paAlertContainer');

            btn.disabled = true;
            btn.textContent = 'Consultando cliente...';
            alertBox.innerHTML = '';

            try {
                // 1. Localizar o cliente configurado na pasta clients
                const cliente = await window.buscarClientePorCnpj(cnpjDigitado);
                if (!cliente) {
                    throw new Error('❌ CNPJ não encontrado nas configurações do ERP CORE. Verifique o número digitado ou configure o arquivo clients/[cliente]/config.json.');
                }

                clienteSelecionadoPA = cliente;

                const prefixo = cliente.prefix || cliente.clientId;
                const usuarioAdmEsperado = `adm.${prefixo.toLowerCase()}`;
                const cleanCnpj = cnpjDigitado.replace(/\D/g, '');

                let lojaJaAtivada = false;
                let usuarioPrincipal = usuarioAdmEsperado;

                // 2. Trava 1: Checagem no Manifesto/JSON do Cliente (config.json)
                if (cliente.active === true || cliente.status === 'ativo' || cliente.configured === true || cliente.ativado === true) {
                    lojaJaAtivada = true;
                }

                // 3. Trava 2: Conectar dinamicamente ao banco Supabase daquele cliente e verificar banco de dados
                if (!lojaJaAtivada) {
                    btn.textContent = 'Verificando status de ativação no banco...';
                    const clientSupabase = window.conectarClienteSupabase(cliente);
                    if (clientSupabase) {
                        // 3.1 RPC de Segurança no PostgreSQL
                        try {
                            const { data: statusLoja, error: errRpc } = await clientSupabase.rpc('verificar_status_loja', {
                                p_cnpj: cleanCnpj
                            });

                            if (!errRpc && statusLoja) {
                                if (statusLoja.loja_ativa === true || statusLoja.permite_onboarding === false) {
                                    lojaJaAtivada = true;
                                    if (statusLoja.usuario_adm) usuarioPrincipal = statusLoja.usuario_adm;
                                }
                            }
                        } catch (rpcEx) {
                            console.log('RPC verificar_status_loja:', rpcEx);
                        }

                        // 3.2 Checagem direta de usuários cadastrados
                        if (!lojaJaAtivada) {
                            try {
                                const { data: usersCadastrados } = await clientSupabase
                                    .from('usuarios')
                                    .select('id, email, nome, ativo')
                                    .limit(5);

                                if (usersCadastrados && usersCadastrados.length > 0) {
                                    lojaJaAtivada = true;
                                    const uAdm = usersCadastrados.find(u => u.email && u.email.startsWith('adm.')) || usersCadastrados[0];
                                    if (uAdm?.email) usuarioPrincipal = uAdm.email;
                                }
                            } catch (e) {}
                        }

                        // 3.3 Checagem direta de lojas cadastradas
                        if (!lojaJaAtivada) {
                            try {
                                const { data: lojasCadastradas } = await clientSupabase
                                    .from('lojas')
                                    .select('id, nome, cnpj')
                                    .limit(5);

                                if (lojasCadastradas && lojasCadastradas.length > 0) {
                                    lojaJaAtivada = true;
                                }
                            } catch (e) {}
                        }
                    }
                }

                // Se a loja já estiver ativada, BLOQUEIA IMEDIATAMENTE O ACESSO
                if (lojaJaAtivada) {
                    alertBox.innerHTML = `
                        <div class="pa-alert pa-alert-error" style="border-left: 4px solid #dc2626; padding: 16px; background: #FEF2F2; color: #991B1B;">
                            <strong style="font-size: 15px; display: block; margin-bottom: 6px;">❌ Acesso Negado (Loja já ativada).</strong>
                            <p style="margin: 0 0 10px 0; font-size: 13px; color: #7F1D1D; line-height: 1.4;">
                                Esta empresa (<strong>${cliente.companyName}</strong>) já possui usuários e configurações ativas no sistema.
                            </p>
                            <div style="font-size: 13px; font-weight: 700; color: #991B1B; background: #FEE2E2; padding: 8px 12px; border-radius: 6px; border: 1px solid #FECACA;">
                                ⚠️ Acione o supervisor do seu sistema.
                            </div>
                        </div>
                    `;
                    btn.disabled = false;
                    btn.textContent = 'Ir para a Tela de Login';
                    btn.onclick = () => {
                        fecharModalPA();
                        const inputLogin = document.getElementById('email');
                        if (inputLogin) {
                            inputLogin.value = usuarioPrincipal;
                            document.getElementById('password')?.focus();
                        }
                    };
                    return;
                }

                // Se passou de todas as travas e não há nenhum usuário cadastrado, avança para a Ficha
                renderizarFichaCadastro(cliente);

            } catch (err) {
                console.error('Erro no primeiro acesso:', err);
                alertBox.innerHTML = `<div class="pa-alert pa-alert-error">${err.message}</div>`;
                btn.disabled = false;
                btn.textContent = 'Verificar CNPJ e Continuar';
            }
        });
    }

    // Etapa 2: Ficha de Cadastro da Empresa e Criação do Administrador
    function renderizarFichaCadastro(cliente) {
        const prefixo = (cliente.prefix || cliente.clientId).toLowerCase();
        const usuarioAdm = `adm.${prefixo}`;

        paConteudo.innerHTML = `
            <div class="pa-step-badge">Etapa 2 de 2: Ficha da Empresa & Usuário ADM</div>
            <div class="pa-alert pa-alert-info">
                Loja identificada: <strong>${cliente.companyName}</strong> (Prefixo: <code>${prefixo}</code>)
            </div>
            <div id="paFichaAlertContainer"></div>
            <form id="paFormFicha">
                <div style="font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                    🏢 1. Dados da Loja
                </div>
                <div class="pa-form-group">
                    <label>Razão Social / Nome da Empresa *</label>
                    <input type="text" id="paRazaoSocial" value="${cliente.companyName}" required>
                </div>
                <div class="pa-form-group">
                    <label>Nome Fantasia</label>
                    <input type="text" id="paNomeFantasia" value="${cliente.companyName}">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="pa-form-group">
                        <label>CNPJ</label>
                        <input type="text" id="paCnpj" value="${cliente.cnpjFormatted || cliente.cnpj}" readonly style="background: #F3F4F6; cursor: not-allowed;">
                    </div>
                    <div class="pa-form-group">
                        <label>Segmento de Atuação *</label>
                        <select id="paSegmento" required>
                            <option value="eletronico" selected>Eletrônicos / Assistência</option>
                            <option value="mercado">Mercado / Mercearia</option>
                            <option value="estetica">Estética / Salão</option>
                            <option value="restaurante">Restaurante / Bar</option>
                            <option value="bijuteria">Bijuterias / Acessórios</option>
                        </select>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="pa-form-group">
                        <label>Telefone / WhatsApp</label>
                        <input type="text" id="paTelefone" placeholder="(00) 00000-0000">
                    </div>
                    <div class="pa-form-group">
                        <label>Email de Contato</label>
                        <input type="email" id="paEmailLoja" placeholder="contato@empresa.com">
                    </div>
                </div>
                <div class="pa-form-group">
                    <label>Endereço Completo</label>
                    <input type="text" id="paEndereco" placeholder="Rua, Número, Bairro, Cidade - UF">
                </div>

                <div style="font-size: 13px; font-weight: 700; color: #111827; margin-top: 18px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                    👑 2. Primeiro Usuário (Administrador do Sistema)
                </div>

                <div class="pa-user-highlight">
                    <div>
                        <small style="color: #6B7280; display: block; font-size: 11px;">USUÁRIO DE LOGIN GERADO</small>
                        <span>${usuarioAdm}</span>
                    </div>
                    <span style="font-size: 11px; background: #DCFCE7; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 700;">PERMISSÃO TOTAL</span>
                </div>

                <div class="pa-form-group">
                    <label>Nome do Administrador / Responsável *</label>
                    <input type="text" id="paNomeAdm" placeholder="Ex: Administrador Principal" required>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="pa-form-group">
                        <label>Senha de Acesso *</label>
                        <input type="password" id="paSenhaAdm" placeholder="••••••••" required minlength="4">
                    </div>
                    <div class="pa-form-group">
                        <label>Confirmar Senha *</label>
                        <input type="password" id="paSenhaAdmConf" placeholder="••••••••" required minlength="4">
                    </div>
                </div>

                <button type="submit" class="pa-btn" id="paBtnSalvarFicha">Concluir Primeiro Acesso e Salvar</button>
            </form>
        `;

        const formFicha = document.getElementById('paFormFicha');
        formFicha.addEventListener('submit', async (e) => {
            e.preventDefault();

            const alertBox = document.getElementById('paFichaAlertContainer');
            const btn = document.getElementById('paBtnSalvarFicha');
            alertBox.innerHTML = '';

            const razaoSocial = document.getElementById('paRazaoSocial').value.trim();
            const nomeFantasia = document.getElementById('paNomeFantasia').value.trim();
            const cleanCnpj = document.getElementById('paCnpj').value.replace(/\D/g, '');
            const segmento = document.getElementById('paSegmento').value;
            const telefone = document.getElementById('paTelefone').value.trim();
            const emailLoja = document.getElementById('paEmailLoja').value.trim();
            const endereco = document.getElementById('paEndereco').value.trim();
            const nomeAdm = document.getElementById('paNomeAdm').value.trim();
            const senhaAdm = document.getElementById('paSenhaAdm').value;
            const senhaAdmConf = document.getElementById('paSenhaAdmConf').value;

            if (senhaAdm !== senhaAdmConf) {
                alertBox.innerHTML = '<div class="pa-alert pa-alert-error">As senhas digitadas não coincidem!</div>';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Salvando e configurando loja...';

            try {
                // 1. Tentar primeiro via RPC segura registrar_primeiro_acesso
                let salvouViaRpc = false;
                try {
                    const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('registrar_primeiro_acesso', {
                        p_razao_social: razaoSocial,
                        p_nome_fantasia: nomeFantasia || razaoSocial,
                        p_cnpj: document.getElementById('paCnpj').value,
                        p_segmento: segmento || 'eletronico',
                        p_telefone: telefone || null,
                        p_email: emailLoja || null,
                        p_endereco: endereco || null,
                        p_usuario_adm: usuarioAdm,
                        p_nome_adm: nomeAdm,
                        p_senha_adm: senhaAdm,
                        p_features: cliente.features || {}
                    });

                    if (!rpcErr && rpcRes && rpcRes.sucesso) {
                        salvouViaRpc = true;
                    } else if (rpcErr) {
                        console.warn('Tentativa via RPC retornou:', rpcErr);
                    }
                } catch (rpcEx) {
                    console.log('RPC registrar_primeiro_acesso não disponível. Tentando inserts diretos...', rpcEx);
                }

                // 2. Fallback de Inserts Diretos se a RPC não estiver disponível
                if (!salvouViaRpc) {
                    // Inserir Loja em public.lojas
                    const { data: lojaCriada, error: errLoja } = await supabaseClient
                        .from('lojas')
                        .insert([{
                            nome: razaoSocial,
                            segmento: segmento || 'eletronico',
                            cnpj: cleanCnpj,
                            telefone: telefone || null,
                            endereco: endereco || null
                        }])
                        .select();

                    if (errLoja) throw errLoja;
                    const lojaId = lojaCriada && lojaCriada.length > 0 ? lojaCriada[0].id : 1;

                    // Inserir Configurações em public.config_loja
                    await supabaseClient
                        .from('config_loja')
                        .insert([{
                            loja_id: lojaId,
                            nome_fantasia: nomeFantasia || razaoSocial,
                            razao_social: razaoSocial,
                            cnpj: cleanCnpj,
                            telefone: telefone || null,
                            email: emailLoja || null,
                            endereco: endereco || null,
                            habilitar_seriais: cliente.features?.habilitar_seriais !== false,
                            habilitar_agendamentos: cliente.features?.habilitar_agendamentos === true,
                            habilitar_mesas: cliente.features?.habilitar_mesas === true,
                            habilitar_lotes: cliente.features?.habilitar_lotes === true,
                            habilitar_variacoes: cliente.features?.habilitar_variacoes === true
                        }]);

                    // Montar permissões ativas
                    const permissoesCompletas = {
                        dashboard: { ver: true },
                        clientes: { ver: true, criar: true, editar: true, excluir: true },
                        produtos: { ver: true, criar: true, editar: true, excluir: true },
                        categorias: { ver: true, criar: true, editar: true, excluir: true },
                        estoque: { ver: true, ajustar: true },
                        entradas: { ver: true, criar: true, excluir: true },
                        saidas: { ver: true, criar: true, cancelar: true, ver_vendas_outros: true },
                        fornecedores: { ver: true, criar: true, editar: true, excluir: true },
                        ordens_servico: { ver: true, criar: true, editar: true, excluir: true },
                        colaboradores: { ver: true, criar: true, editar: true, excluir: true },
                        financeiro: { ver: true, criar: true, editar: true, excluir: true },
                        relatorios: { ver: true, exportar: true },
                        usuarios: { ver: true, criar: true, editar: true, excluir: true }
                    };

                    // Criar usuário ADM
                    const { error: errUser } = await supabaseClient
                        .from('usuarios')
                        .insert([{
                            loja_id: lojaId,
                            nome: nomeAdm,
                            email: usuarioAdm,
                            senha: senhaAdm,
                            perfil: 'admin',
                            nivel_acesso: 'admin',
                            permissoes: permissoesCompletas,
                            ativo: true
                        }]);

                    if (errUser) throw errUser;
                }

                // Guardar cliente ativo na sessão
                sessionStorage.setItem('active_client', JSON.stringify(cliente));

                // Sucesso!
                paConteudo.innerHTML = `
                    <div style="text-align: center; padding: 20px 0;">
                        <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
                        <h3 style="color: #166534; margin: 0 0 10px 0; font-size: 20px;">Primeiro Acesso Concluído!</h3>
                        <p style="color: #4B5563; font-size: 14px; margin-bottom: 20px;">
                            Sua empresa e o usuário <strong>Administrador</strong> foram configurados com sucesso no banco de dados.
                        </p>
                        <div class="pa-user-highlight" style="text-align: left;">
                            <div>
                                <small style="color: #6B7280; font-size: 11px;">SEU USUÁRIO DE LOGIN</small>
                                <span>${usuarioAdm}</span>
                            </div>
                            <span style="font-size: 12px; background: #DCFCE7; color: #166534; padding: 4px 10px; border-radius: 6px; font-weight: 700;">ATIVO</span>
                        </div>
                        <button type="button" class="pa-btn" id="paBtnIrLogin">Fazer Login Agora</button>
                    </div>
                `;

                document.getElementById('paBtnIrLogin').addEventListener('click', () => {
                    fecharModalPA();
                    const inputLogin = document.getElementById('email');
                    const inputPass = document.getElementById('password');
                    if (inputLogin) {
                        inputLogin.value = usuarioAdm;
                    }
                    if (inputPass) {
                        inputPass.value = '';
                        inputPass.focus();
                    }
                    mostrarNotificacao(`Empresa configurada! Faça login com ${usuarioAdm}`, 'success');
                });

            } catch (err) {
                console.error('Erro ao salvar ficha:', err);
                const msg = err.message || String(err);
                alertBox.innerHTML = `<div class="pa-alert pa-alert-error">Erro ao salvar cadastro: ${msg}</div>`;
                btn.disabled = false;
                btn.textContent = 'Concluir Primeiro Acesso e Salvar';
            }
        });
    }
});
