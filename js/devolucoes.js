// js/devolucoes.js
// Gerenciamento de Devoluções de Vendas

document.addEventListener('DOMContentLoaded', () => {
    // =====================================================
    // CONTROLE DE AUTENTICAÇÃO E PERMISSÕES
    // =====================================================
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    if (!verificarPermissao('saidas', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }

    // Configurações do Header
    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = {
        admin: '👑 Administrador',
        gerente: '📊 Gerente',
        vendedor: '💰 Vendedor',
        tecnico: '🔧 Técnico',
        basico: '👤 Básico'
    };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';

    // =====================================================
    // VARIÁVEIS GLOBAIS E ELEMENTOS DO DOM
    // =====================================================
    let vendas = [];
    let vendaSelecionada = null;
    let itensVendaSelecionada = [];

    const searchInput = document.getElementById('searchVendaInput');
    const btnBuscarVenda = document.getElementById('btnBuscarVenda');
    const vendasTableBody = document.getElementById('vendasTableBody');

    const modalDevolucao = document.getElementById('modalDevolucao');
    const closeDevolucao = document.querySelector('.close-devolucao');
    const btnFecharDevolucao = document.getElementById('btnFecharDevolucao');
    const btnConfirmarDevolucao = document.getElementById('btnConfirmarDevolucao');

    // =====================================================
    // FUNÇÕES AUXILIARES
    // =====================================================
    function getDataLocalBrasil() {
        const hoje = new Date();
        const dataStr = hoje.toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const partes = dataStr.split('/');
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }

    function formatarData(data) {
        if (!data) return '-';
        const partes = data.substring(0, 10).split('-');
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    function formatarMoeda(valor) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency', currency: 'BRL'
        }).format(valor || 0);
    }

    function obterHorasDecorridas(dataFinalizacao) {
        if (!dataFinalizacao) return 999;
        const diff = (new Date() - new Date(dataFinalizacao)) / (1000 * 60 * 60);
        return diff;
    }

    // =====================================================
    // CARREGAR DADOS
    // =====================================================
    async function carregarVendas() {
        try {
            vendasTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Buscando vendas...</td></tr>';
            const termo = searchInput.value.trim();

            let query = supabaseClient
                .from('saidas')
                .select('*, clientes(nome, cpf_cnpj)')
                .eq('cancelado', false)
                .order('id', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            vendas = data || [];

            if (termo) {
                const termoLower = termo.toLowerCase();

                // Buscar seriais/imeis correspondentes em paralelo
                const { data: seriaisEncontrados } = await supabaseClient
                    .from('produtos_seriais')
                    .select('id')
                    .or(`numero_serie.ilike.%${termo}%,imei.ilike.%${termo}%`);

                let saidaIdsPorSerial = [];
                if (seriaisEncontrados && seriaisEncontrados.length > 0) {
                    const serialIds = seriaisEncontrados.map(s => s.id);
                    const { data: itensEncontrados } = await supabaseClient
                        .from('saida_itens')
                        .select('saida_id')
                        .in('serial_id', serialIds);
                    if (itensEncontrados) {
                        saidaIdsPorSerial = itensEncontrados.map(i => i.saida_id);
                    }
                }

                vendas = vendas.filter(v => {
                    const matchesId = !isNaN(termo) && v.id === parseInt(termo);
                    const nome = v.clientes?.nome?.toLowerCase() || '';
                    const doc = v.clientes?.cpf_cnpj?.toLowerCase() || '';
                    const matchesClient = nome.includes(termoLower) || doc.includes(termoLower);
                    const matchesSerial = saidaIdsPorSerial.includes(v.id);
                    return matchesId || matchesClient || matchesSerial;
                });
            }

            renderizarVendas();
        } catch (error) {
            console.error('Erro ao carregar vendas:', error);
            mostrarNotificacao('Erro ao carregar vendas: ' + error.message, 'error');
            vendasTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Erro ao carregar dados</td></tr>';
        }
    }

    function renderizarVendas() {
        if (vendas.length === 0) {
            vendasTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhuma venda ativa encontrada</td></tr>';
            return;
        }

        vendasTableBody.innerHTML = vendas.map(v => {
            const horas = obterHorasDecorridas(v.data_finalizacao);
            const cancelavel = horas <= 2;

            let badgeHtml = '';
            if (cancelavel) {
                badgeHtml = `<span class="status-tempo-badge tempo-cancelavel">Cancelável (${Math.round(horas * 10) / 10}h decorridas)</span>`;
            } else {
                badgeHtml = `<span class="status-tempo-badge tempo-devolucao">Prazo Expirado (${Math.round(horas * 10) / 10}h decorridas)</span>`;
            }

            // Exibir aviso se a venda já possui devoluções registradas no histórico
            const jaDevolvido = v.observacao && v.observacao.includes('[Devolvido');

            return `
                <tr>
                    <td><strong>#${v.id}</strong></td>
                    <td>${formatarData(v.data)} ${v.data_finalizacao ? 'às ' + new Date(v.data_finalizacao).toLocaleTimeString('pt-BR') : ''}</td>
                    <td>
                        ${v.clientes?.nome || '<span style="color:#9ca3af">—</span>'}<br>
                        <small style="color:var(--gray);">${v.clientes?.cpf_cnpj || ''}</small>
                    </td>
                    <td><strong style="color:var(--primary)">${formatarMoeda(v.total)}</strong></td>
                    <td>${v.forma_pagamento || '—'}</td>
                    <td>
                        ${badgeHtml}
                        ${jaDevolvido ? `<br><small style="color:var(--danger);font-weight:600;">🔄 Já possui devolução anterior</small>` : ''}
                    </td>
                    <td>
                        <button class="btn-acao-tabela btn-primary" onclick="abrirModalDevolucao(${v.id})">🔄 Devolver Itens</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // =====================================================
    // DETALHES DA VENDA PARA DEVOLUÇÃO
    // =====================================================
    window.abrirModalDevolucao = async (vendaId) => {
        vendaSelecionada = vendas.find(v => v.id === vendaId);
        if (!vendaSelecionada) return;

        // Limpar campos
        document.getElementById('motivoDevolucao').value = '';
        document.getElementById('devolucaoVendaId').textContent = vendaSelecionada.id;
        document.getElementById('devolucaoVendaData').textContent = formatarData(vendaSelecionada.data);
        document.getElementById('devolucaoVendaCliente').textContent = vendaSelecionada.clientes?.nome || 'Não Informado';
        document.getElementById('devolucaoVendaTotal').textContent = formatarMoeda(vendaSelecionada.total);

        document.getElementById('resumoQtdDevolvida').textContent = '0';
        document.getElementById('resumoTotalDevolucao').textContent = formatarMoeda(0);

        // Habilitar botão de confirmação e remover qualquer banner de aviso
        btnConfirmarDevolucao.disabled = false;
        btnConfirmarDevolucao.style.opacity = '1';
        btnConfirmarDevolucao.style.cursor = 'pointer';
        const avisoExistente = document.getElementById('avisoDevolucaoCompleta');
        if (avisoExistente) avisoExistente.remove();

        try {
            const { data: itens, error } = await supabaseClient
                .from('saida_itens')
                .select('*, produtos(id, nome, codigo, estoque_total)')
                .eq('saida_id', vendaId);

            if (error) throw error;
            itensVendaSelecionada = itens || [];

            // Buscar devoluções anteriores
            const { data: entradasAnteriores } = await supabaseClient
                .from('entradas')
                .select('id')
                .ilike('observacao', `%Nota: ${vendaId}%`);

            let devolvidosAgrupados = {}; // produto_id -> quantidade devolvida

            if (entradasAnteriores && entradasAnteriores.length > 0) {
                const entradaIds = entradasAnteriores.map(e => e.id);
                const { data: itensDevolvidos } = await supabaseClient
                    .from('entrada_itens')
                    .select('produto_id, quantidade')
                    .in('entrada_id', entradaIds);

                if (itensDevolvidos) {
                    itensDevolvidos.forEach(it => {
                        devolvidosAgrupados[it.produto_id] = (devolvidosAgrupados[it.produto_id] || 0) + it.quantidade;
                    });
                }
            }

            // Buscar seriais correspondentes
            for (const item of itensVendaSelecionada) {
                item.qtd_ja_devolvida = devolvidosAgrupados[item.produto_id] || 0;
                if (item.serial_id) {
                    const { data: s } = await supabaseClient
                        .from('produtos_seriais')
                        .select('numero_serie, imei, status, observacao')
                        .eq('id', item.serial_id)
                        .single();
                    if (s) {
                        item.numero_serie = s.numero_serie;
                        item.imei = s.imei;
                        item.serial_status = s.status;
                        item.serial_observacao = s.observacao;
                    }
                }
            }

            renderizarItensDevolucao();
            modalDevolucao.style.display = 'flex';
        } catch (error) {
            console.error('Erro ao buscar itens da venda:', error);
            mostrarNotificacao('Erro ao carregar itens da venda', 'error');
        }
    };

    function renderizarItensDevolucao() {
        const tbody = document.getElementById('devolucaoItensBody');
        if (itensVendaSelecionada.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum produto encontrado</td></tr>';
            return;
        }

        let todasDevolvidas = true;

        tbody.innerHTML = itensVendaSelecionada.map((item, index) => {
            let jaDevolvido = false;
            let maxDevolver = item.quantidade;

            if (item.serial_id) {
                if (item.serial_status === 'disponivel' || (item.serial_observacao && item.serial_observacao.includes(`venda #${vendaSelecionada.id}`))) {
                    jaDevolvido = true;
                }
            } else {
                if (item.qtd_ja_devolvida >= item.quantidade) {
                    jaDevolvido = true;
                } else {
                    maxDevolver = item.quantidade - item.qtd_ja_devolvida;
                }
            }

            if (!jaDevolvido) {
                todasDevolvidas = false;
            }

            const serialInfo = item.numero_serie 
                ? `<br><small style="color:#2563eb;">🔢 Série: <code>${item.numero_serie}</code>${item.imei ? ` | IMEI: ${item.imei}` : ''}</small>`
                : '';

            const statusLabel = jaDevolvido 
                ? ` <span style="color:#c1121f; font-weight:bold; font-size:11px; margin-left:8px; background:#fde8e8; padding:2px 6px; border-radius:4px;">(Já Devolvido)</span>`
                : (item.qtd_ja_devolvida > 0 ? ` <span style="color:#d97706; font-weight:bold; font-size:11px; margin-left:8px; background:#fef3c7; padding:2px 6px; border-radius:4px;">(Devolvido ${item.qtd_ja_devolvida} un.)</span>` : '');

            const rowStyle = jaDevolvido 
                ? 'style="opacity: 0.5; background-color: #f3f4f6;"' 
                : '';

            return `
                <tr ${rowStyle}>
                    <td style="text-align: center;">
                        <input type="checkbox" class="checkbox-item-devolucao" data-index="${index}" onchange="atualizarResumoDevolucao()" ${jaDevolvido ? 'disabled' : ''}>
                    </td>
                    <td>${item.produtos?.codigo || item.produto_id}</td>
                    <td>
                        <strong>${item.produtos?.nome || 'Produto'}</strong>${statusLabel}
                        ${serialInfo}
                    </td>
                    <td style="text-align: center;">${item.quantidade}</td>
                    <td style="text-align: center;">
                        <input type="number" class="input-qtd-devolver" data-index="${index}" min="1" max="${maxDevolver}" value="${maxDevolver}" 
                               onchange="atualizarQtdDevolucao(${index}, this.value)" 
                               ${(item.serial_id || jaDevolvido) ? 'disabled' : ''}>
                    </td>
                    <td style="text-align: right;">${formatarMoeda(item.valor_unitario)}</td>
                    <td style="text-align: right; font-weight: 600;" id="subtotal-${index}">${formatarMoeda(jaDevolvido ? 0 : (maxDevolver * item.valor_unitario))}</td>
                </tr>
            `;
        }).join('');

        if (todasDevolvidas) {
            // Mostrar aviso de venda totalmente devolvida e desabilitar botão
            const modalBody = document.querySelector('#modalDevolucao .modal-body');
            const alertDiv = document.createElement('div');
            alertDiv.id = 'avisoDevolucaoCompleta';
            alertDiv.style.background = '#fee2e2';
            alertDiv.style.border = '1px solid #fca5a5';
            alertDiv.style.color = '#991b1b';
            alertDiv.style.padding = '12px 15px';
            alertDiv.style.borderRadius = '8px';
            alertDiv.style.marginBottom = '15px';
            alertDiv.style.fontWeight = 'bold';
            alertDiv.style.fontSize = '14px';
            alertDiv.innerHTML = '⚠️ Esta venda já foi devolvida por completo!';
            modalBody.insertBefore(alertDiv, modalBody.firstChild);

            btnConfirmarDevolucao.disabled = true;
            btnConfirmarDevolucao.style.opacity = '0.6';
            btnConfirmarDevolucao.style.cursor = 'not-allowed';
        }
    }

    window.atualizarQtdDevolucao = (index, valor) => {
        let qtd = parseInt(valor);
        const item = itensVendaSelecionada[index];
        const maxDevolver = item.serial_id ? 1 : (item.quantidade - item.qtd_ja_devolvida);
        if (isNaN(qtd) || qtd < 1) qtd = 1;
        if (qtd > maxDevolver) qtd = maxDevolver;

        // Atualizar no array local temporariamente
        const subtotal = qtd * item.valor_unitario;
        document.getElementById(`subtotal-${index}`).textContent = formatarMoeda(subtotal);

        atualizarResumoDevolucao();
    };

    window.atualizarResumoDevolucao = () => {
        let totalItens = 0;
        let totalValor = 0;

        const checkboxes = document.querySelectorAll('.checkbox-item-devolucao');
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const idx = parseInt(cb.getAttribute('data-index'));
                const item = itensVendaSelecionada[idx];
                const inputQtd = document.querySelectorAll('.input-qtd-devolver')[idx];
                const qtd = parseInt(inputQtd.value);

                totalItens += qtd;
                totalValor += (qtd * item.valor_unitario);
            }
        });

        document.getElementById('resumoQtdDevolvida').textContent = totalItens;
        document.getElementById('resumoTotalDevolucao').textContent = formatarMoeda(totalValor);
    };

    // =====================================================
    // PROCESSAR DEVOLUÇÃO
    // =====================================================
    async function confirmarDevolucao() {
        const checkboxes = document.querySelectorAll('.checkbox-item-devolucao');
        const itensSelecionados = [];

        checkboxes.forEach(cb => {
            if (cb.checked) {
                const idx = parseInt(cb.getAttribute('data-index'));
                const item = itensVendaSelecionada[idx];
                const inputQtd = document.querySelectorAll('.input-qtd-devolver')[idx];
                const qtdADevolver = parseInt(inputQtd.value);

                itensSelecionados.push({
                    ...item,
                    qtdADevolver: qtdADevolver,
                    valorTotalDevolvido: qtdADevolver * item.valor_unitario
                });
            }
        });

        if (itensSelecionados.length === 0) {
            mostrarNotificacao('Selecione pelo menos um item para devolução!', 'error');
            return;
        }

        const motivo = document.getElementById('motivoDevolucao').value.trim();
        if (!motivo) {
            mostrarNotificacao('Informe o motivo da devolução!', 'error');
            document.getElementById('motivoDevolucao').focus();
            return;
        }

        const horas = obterHorasDecorridas(vendaSelecionada.data_finalizacao);
        if (horas <= 2) {
            const prosseguir = confirm(
                `Esta venda ainda está dentro do prazo de cancelamento (2h).\n` +
                `Deseja prosseguir com a Devolução mesmo assim em vez de apenas Cancelar no menu lateral?\n` +
                `(O cancelamento estorna tudo automaticamente e desativa a venda)`
            );
            if (!prosseguir) return;
        }

        if (!confirm(`Confirma o registro de devolução de ${itensSelecionados.length} item(ns) da venda #${vendaSelecionada.id}?\nEsta ação irá estornar as quantidades ao estoque.`)) {
            return;
        }

        btnConfirmarDevolucao.disabled = true;
        btnConfirmarDevolucao.textContent = 'Processando...';

        try {
            const dataHoje = getDataLocalBrasil();
            const totalDevolucaoVal = itensSelecionados.reduce((sum, item) => sum + item.valorTotalDevolvido, 0);

            // 1. Criar cabeçalho em `entradas`
            const observacaoEntrada = `Nota: ${vendaSelecionada.id} | Série: Dev | Data Lançamento: ${dataHoje} | Obs: Devoluçao de Venda - Nota (${vendaSelecionada.id})`;
            const { data: entradaObj, error: errorEntrada } = await supabaseClient
                .from('entradas')
                .insert([{
                    fornecedor_id: null,
                    data: dataHoje,
                    observacao: observacaoEntrada,
                    total: totalDevolucaoVal,
                    usuario_id: usuario.id
                }])
                .select()
                .single();

            if (errorEntrada) throw errorEntrada;

            // 2. Processar item por item
            for (const item of itensSelecionados) {
                // Inserir item em `entrada_itens`
                await supabaseClient
                    .from('entrada_itens')
                    .insert([{
                        entrada_id: entradaObj.id,
                        produto_id: item.produto_id,
                        quantidade: item.qtdADevolver,
                        valor_unitario: item.valor_unitario,
                        subtotal: item.valorTotalDevolvido
                    }]);

                // Obter estoque atual e tipo do produto
                const { data: prodData } = await supabaseClient
                    .from('produtos')
                    .select('estoque_total, tipo')
                    .eq('id', item.produto_id)
                    .single();

                const isServico = prodData?.tipo === 'servico';

                if (!isServico) {
                    const estoqueAtual = prodData?.estoque_total || 0;
                    const novoEstoque = estoqueAtual + item.qtdADevolver;

                    // Atualizar saldo do produto
                    await supabaseClient
                        .from('produtos')
                        .update({
                            estoque_total: novoEstoque,
                            ultima_movimentacao: new Date().toISOString()
                         })
                        .eq('id', item.produto_id);

                    // Reativar serial se aplicável
                    if (item.serial_id) {
                        await supabaseClient
                            .from('produtos_seriais')
                            .update({
                                status: 'disponivel',
                                data_saida: null,
                                observacao: `Estornado via Devolução da venda #${vendaSelecionada.id}`
                            })
                            .eq('id', item.serial_id);
                    }

                    // Criar registro em `movimentos_estoque`
                    await supabaseClient
                        .from('movimentos_estoque')
                        .insert([{
                            produto_id: item.produto_id,
                            tipo: 'entrada',
                            quantidade: item.qtdADevolver,
                            quantidade_anterior: estoqueAtual,
                            quantidade_nova: novoEstoque,
                            motivo: `Devolução de Venda - Nota (${vendaSelecionada.id}) — ${motivo}`,
                            data: new Date().toISOString(),
                            usuario_id: usuario.id
                        }]);
                }
            }

            // 3. Atualizar a observação da venda original para documentar
            const obsAntiga = vendaSelecionada.observacao || '';
            const novaObs = obsAntiga 
                ? `${obsAntiga} | [Devolvido em ${new Date().toLocaleString('pt-BR')}: ${itensSelecionados.length} item(ns) — Obs: ${motivo}]`
                : `[Devolvido em ${new Date().toLocaleString('pt-BR')}: ${itensSelecionados.length} item(ns) — Obs: ${motivo}]`;

            await supabaseClient
                .from('saidas')
                .update({ 
                    observacao: novaObs,
                    comissao_calculada: 0
                })
                .eq('id', vendaSelecionada.id);

            mostrarNotificacao(`✅ Devolução registrada com sucesso! Entrada #${entradaObj.id} gerada.`, 'success');
            modalDevolucao.style.display = 'none';

            await carregarVendas();
        } catch (error) {
            console.error('Erro ao realizar devolução:', error);
            mostrarNotificacao('Erro ao registrar devolução: ' + error.message, 'error');
        } finally {
            btnConfirmarDevolucao.disabled = false;
            btnConfirmarDevolucao.textContent = '🔄 Confirmar Devolução';
        }
    }

    // =====================================================
    // EVENTOS E INICIALIZAÇÃO
    // =====================================================
    btnBuscarVenda.addEventListener('click', carregarVendas);
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') carregarVendas();
    });

    closeDevolucao.addEventListener('click', () => {
        modalDevolucao.style.display = 'none';
    });

    btnFecharDevolucao.addEventListener('click', () => {
        modalDevolucao.style.display = 'none';
    });

    btnConfirmarDevolucao.addEventListener('click', confirmarDevolucao);

    // Carregar dados iniciais
    carregarVendas();
});
