// js/comissoes.js
// Gerenciamento e pagamento de comissões para colaboradores

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    // Verificar permissões (usando as permissões de relatorios ou despesas se comissao não tiver perfil exclusivo)
    if (!temPermissao('relatorios', 'ver') && !temPermissao('despesas', 'ver')) {
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
    
    // Variáveis
    let colaboradores = [];
    let vendas = [];
    let itensVendas = [];
    let produtos = [];
    
    // Carregar dados
    async function carregarDados() {
        try {
            const [colabRes, vendasRes, itensRes, produtosRes] = await Promise.all([
                supabaseClient.from('colaboradores').select('*').order('nome'),
                supabaseClient.from('saidas').select('*, clientes:cliente_id(nome)').eq('cancelado', false).not('colaborador_id', 'is', null).order('id', { ascending: false }),
                supabaseClient.from('saida_itens').select('*, produtos(*)'),
                supabaseClient.from('produtos').select('*')
            ]);
            
            if (colabRes.error) throw colabRes.error;
            if (vendasRes.error) throw vendasRes.error;
            if (itensRes.error) throw itensRes.error;
            if (produtosRes.error) throw produtosRes.error;
            
            colaboradores = colabRes.data || [];
            
            // Popular filtro de colaboradores
            const filterColabSelect = document.getElementById('filtroColaboradorComissao');
            if (filterColabSelect) {
                const currentVal = filterColabSelect.value;
                filterColabSelect.innerHTML = '<option value="todos">Todos os Colaboradores</option>' +
                    colaboradores.map(c => `<option value="${c.id}">${c.nome} ${c.sobrenome || ''}</option>`).join('');
                filterColabSelect.value = currentVal || 'todos';
            }
            
            vendas = vendasRes.data || [];
            itensVendas = itensRes.data || [];
            produtos = produtosRes.data || [];
            
            processarEMostrarComissoes();
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            mostrarNotificacao('Erro ao carregar comissões!', 'error');
        }
    }
    
    // Calcular comissão de uma venda específica
    function calcularComissaoVenda(venda) {
        const itens = itensVendas.filter(item => item.saida_id === venda.id);
        
        // Se a venda não tem itens gravados (ex: lançamento manual de comissão)
        if (itens.length === 0) {
            if (venda.comissao_calculada !== undefined && venda.comissao_calculada !== null && parseFloat(venda.comissao_calculada) >= 0) {
                return parseFloat(venda.comissao_calculada);
            }
            return 0;
        }
        
        const colab = colaboradores.find(c => c.id === venda.colaborador_id);
        if (!colab) return 0;
        
        const pctColab = parseFloat(colab.comissao || 0) / 100;
        let comissaoVal = 0;
        
        itens.forEach(item => {
            const subtotal = item.subtotal || item.valor_unitario * item.quantidade || 0;
            const isServico = item.produtos?.tipo === 'servico';
            
            if (isServico) {
                if (item.produtos?.comissao_habilitada === true) {
                    if (item.produtos?.comissao_100_porcento === true) {
                        comissaoVal += subtotal;
                    } else {
                        comissaoVal += subtotal * (parseFloat(item.produtos?.comissao_valor || 0) / 100);
                    }
                } else {
                    comissaoVal += subtotal * pctColab;
                }
            }
            // Produtos normais NÃO geram comissão
        });
        
        return comissaoVal;
    }
    
    // Processar e exibir as comissões na UI
    function processarEMostrarComissoes() {
        const statusFiltro = document.getElementById('filtroStatusComissao').value;
        const colabFiltro = document.getElementById('filtroColaboradorComissao')?.value || 'todos';
        const listSaldos = document.getElementById('colaboradoresSaldosList');
        const tbody = document.getElementById('comissoesTableBody');
        
        if (!listSaldos || !tbody) return;
        
        // 1. Calcular saldos por colaborador
        const saldosColab = colaboradores.map(colab => {
            const colabVendas = vendas.filter(v => v.colaborador_id === colab.id);
            let pendente = 0;
            let pago = 0;
            
            colabVendas.forEach(v => {
                const valorComissao = calcularComissaoVenda(v);
                if (v.comissao_paga === true) {
                    pago += valorComissao;
                } else {
                    pendente += valorComissao;
                }
            });
            
            return {
                colab,
                pendente,
                pago
            };
        });
        
        // Renderizar saldos colaboradores
        listSaldos.innerHTML = saldosColab.map(s => {
            return `
                <div class="colab-card">
                    <div>
                        <span class="colab-name">${s.colab.nome} ${s.colab.sobrenome || ''}</span><br>
                        <span class="colab-role">${s.colab.funcao || 'Colaborador'} • Base: ${parseFloat(s.colab.comissao || 0).toFixed(1)}%</span>
                    </div>
                    <div class="colab-balance">
                        <span class="colab-balance-val">R$ ${s.pendente.toFixed(2)}</span><br>
                        <span style="font-size: 11px; color: var(--success); font-weight: 600;">Pago: R$ ${s.pago.toFixed(2)}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        if (saldosColab.length === 0) {
            listSaldos.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--gray);">Nenhum colaborador com comissão</div>';
        }
        
        // 2. Filtrar e renderizar tabela de vendas
        const vendasComComissao = [];
        vendas.forEach(v => {
            const valorComissao = calcularComissaoVenda(v);
            const colab = colaboradores.find(c => c.id === v.colaborador_id);
            
            if (valorComissao > 0) {
                vendasComComissao.push({
                    venda: v,
                    colabName: colab ? `${colab.nome} ${colab.sobrenome || ''}` : 'Desconhecido',
                    comissao: valorComissao
                });
            }
        });
        
        const vendasFiltradas = vendasComComissao.filter(item => {
            // Filtro de status
            let matchStatus = true;
            if (statusFiltro === 'pendente') matchStatus = item.venda.comissao_paga !== true;
            else if (statusFiltro === 'paga') matchStatus = item.venda.comissao_paga === true;
            
            // Filtro de colaborador
            let matchColab = true;
            if (colabFiltro !== 'todos') matchColab = String(item.venda.colaborador_id) === colabFiltro;
            
            return matchStatus && matchColab;
        });
        
        tbody.innerHTML = vendasFiltradas.map(item => {
            const dataFmt = item.venda.data ? item.venda.data.split('-').reverse().join('/') : '-';
            const statusBadgeClass = item.venda.comissao_paga === true ? 'badge-paid' : 'badge-pending';
            const statusText = item.venda.comissao_paga === true ? '🟢 Pago' : '🔴 Pendente';
            
            const isManual = item.venda.observacao?.includes('[Comissão Manual]') || item.venda.forma_pagamento === 'Comissão Manual';
            
            const btnPagar = item.venda.comissao_paga !== true
                ? `<button class="btn-success" onclick="pagarComissao(${item.venda.id}, '${item.colabName.replace(/'/g, "\\'")}', ${item.comissao})" style="padding: 4px 8px; font-size: 12px; margin-left: 5px;">💰 Pagar</button>`
                : '';
                
            const btnExcluirManual = (isManual && item.venda.comissao_paga !== true)
                ? `<button class="btn-danger" onclick="cancelarComissaoManual(${item.venda.id})" style="padding: 4px 8px; font-size: 12px; margin-left: 5px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Excluir lançamento manual">🗑️ Excluir</button>`
                : '';
                
            const checkboxHtml = item.venda.comissao_paga !== true
                ? `<td style="text-align: center;"><input type="checkbox" class="comissao-checkbox" data-id="${item.venda.id}" data-valor="${item.comissao}" data-colab="${item.colabName.replace(/"/g, '&quot;')}" onchange="atualizarSelecaoComissoes()" style="cursor: pointer;"></td>`
                : `<td style="text-align: center;">-</td>`;
                
            const docBadge = isManual
                ? `<strong>#${item.venda.id}</strong> <span style="background: #e0e7ff; color: #3730a3; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-block;">✍️ Manual</span>`
                : `<strong>Nº #${item.venda.id}</strong>`;
                
            const totalVendaFmt = isManual
                ? `<span style="color: #64748b; font-style: italic;">Avulsa</span>`
                : `R$ ${parseFloat(item.venda.total || 0).toFixed(2)}`;
                
            return `
                <tr>
                    ${checkboxHtml}
                    <td>${docBadge}</td>
                    <td>${item.colabName}</td>
                    <td>${dataFmt}</td>
                    <td style="text-align: right;">${totalVendaFmt}</td>
                    <td style="text-align: right; font-weight: bold; color: var(--primary);">R$ ${item.comissao.toFixed(2)}</td>
                    <td style="text-align: center;"><span class="badge-status ${statusBadgeClass}">${statusText}</span></td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button class="btn-primary" onclick="verDetalhesVenda(${item.venda.id})" style="padding: 4px 8px; font-size: 12px;">👁️ Detalhes</button>
                        ${btnPagar}
                        ${btnExcluirManual}
                    </td>
                </tr>
            `;
        }).join('');
        
        if (vendasFiltradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--gray);">Nenhuma comissão encontrada para estes filtros</td></tr>';
        }
        
        // Resetar checkbox select-all e resumo de seleção
        const selectAll = document.getElementById('selectAllComissoes');
        if (selectAll) selectAll.checked = false;
        atualizarSelecaoComissoes();
    }
    
    // Ver detalhes da venda no modal
    window.verDetalhesVenda = (vendaId) => {
        const v = vendas.find(x => x.id === vendaId);
        if (!v) return;
        
        const colab = colaboradores.find(c => c.id === v.colaborador_id);
        const colabName = colab ? `${colab.nome} ${colab.sobrenome || ''}` : 'Não vinculado';
        
        const itens = itensVendas.filter(item => item.saida_id === vendaId);
        const pctColab = colab ? parseFloat(colab.comissao || 0) : 0;
        
        const dataFmt = v.data ? v.data.split('-').reverse().join('/') : '-';
        const statusText = v.comissao_paga === true ? '🟢 Pago' : '🔴 Pendente';
        const isManual = v.observacao?.includes('[Comissão Manual]') || v.forma_pagamento === 'Comissão Manual' || itens.length === 0;
        
        let totalComissaoCalculada = 0;
        let conteudoDetalhes = '';
        
        if (isManual) {
            totalComissaoCalculada = parseFloat(v.comissao_calculada || 0);
            conteudoDetalhes = `
                <div style="background: #f0f7ff; border: 1px solid #bae6fd; padding: 18px; border-radius: 8px; margin-top: 15px;">
                    <h4 style="margin: 0 0 10px 0; color: #0369a1; display: flex; align-items: center; gap: 8px;">
                        <span>✍️</span> Lançamento Manual de Comissão
                    </h4>
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;">
                        <strong>Motivo / Observação:</strong> ${v.observacao ? v.observacao.replace('[Comissão Manual]', '').trim() : 'Comissão avulsa informada manualmente'}
                    </p>
                    <div style="font-size: 13px; color: #475569; display: flex; gap: 20px; flex-wrap: wrap;">
                        <span>Valor da Comissão: <strong style="color: var(--primary); font-size: 15px;">R$ ${totalComissaoCalculada.toFixed(2)}</strong></span>
                        <span>Tipo de Registro: <strong>${v.forma_pagamento || 'Manual'}</strong></span>
                        ${v.comissao_paga_data ? `<span>Pago em: <strong>${new Date(v.comissao_paga_data).toLocaleDateString('pt-BR')}</strong></span>` : ''}
                    </div>
                </div>
            `;
        } else {
            const itensHtml = itens.map(item => {
                const subtotal = item.subtotal || item.valor_unitario * item.quantidade || 0;
                const isServico = item.produtos?.tipo === 'servico';
                
                let comissaoItem = 0;
                let regraDesc = '';
                
                if (isServico) {
                    if (item.produtos?.comissao_habilitada === true) {
                        if (item.produtos?.comissao_100_porcento === true) {
                            comissaoItem = subtotal;
                            regraDesc = 'Serviço com 100% comissão';
                        } else {
                            comissaoItem = subtotal * (parseFloat(item.produtos?.comissao_valor || 0) / 100);
                            regraDesc = `Serviço com comissão de ${parseFloat(item.produtos?.comissao_valor || 0).toFixed(1)}%`;
                        }
                    } else {
                        comissaoItem = subtotal * (pctColab / 100);
                        regraDesc = `Serviço com comissão base (${pctColab.toFixed(1)}%)`;
                    }
                } else {
                    comissaoItem = 0;
                    regraDesc = 'Produto físico não gera comissão';
                }
                
                totalComissaoCalculada += comissaoItem;
                
                return `
                    <tr>
                        <td>${item.produtos?.nome || 'Produto não encontrado'}</td>
                        <td style="text-align: center;"><span class="badge-status" style="background:#e9ecef;">${isServico ? '🛠️ Serviço' : '📦 Produto'}</span></td>
                        <td style="text-align: center;">${item.quantidade}</td>
                        <td style="text-align: right;">R$ ${parseFloat(item.valor_unitario || 0).toFixed(2)}</td>
                        <td style="text-align: right;">R$ ${subtotal.toFixed(2)}</td>
                        <td style="font-size: 11px; color: var(--gray);">${regraDesc}</td>
                        <td style="text-align: right; font-weight: bold; color: var(--primary);">R$ ${comissaoItem.toFixed(2)}</td>
                    </tr>
                `;
            }).join('');
            
            conteudoDetalhes = `
                <h4 style="margin-top: 15px;">🛒 Detalhes dos Itens da Venda</h4>
                <div class="table-container" style="margin-top: 10px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Item / Descrição</th>
                                <th style="text-align: center;">Tipo</th>
                                <th style="text-align: center;">Qtd</th>
                                <th style="text-align: right;">Preço Unit.</th>
                                <th style="text-align: right;">Subtotal</th>
                                <th>Regra Comissão</th>
                                <th style="text-align: right;">Comissão Item</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itensHtml}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        document.getElementById('modalVendaCorpo').innerHTML = `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                    <strong>Documento:</strong> ${isManual ? `Lançamento Manual #${v.id}` : `Venda Nº #${v.id}`}<br>
                    <strong>Data:</strong> ${dataFmt}<br>
                    <strong>Forma de Pagamento:</strong> ${v.forma_pagamento || 'Não informada'}<br>
                </div>
                <div>
                    <strong>Colaborador Comissionado:</strong> ${colabName}<br>
                    <strong>Comissão Total:</strong> R$ ${totalComissaoCalculada.toFixed(2)}<br>
                    <strong>Status da Comissão:</strong> <span class="badge-status ${v.comissao_paga === true ? 'badge-paid' : 'badge-pending'}">${statusText}</span>
                </div>
            </div>
            ${conteudoDetalhes}
        `;
        
        document.getElementById('modalDetalhesVenda').style.display = 'flex';
    };
    
    window.fecharModalDetalhes = () => {
        document.getElementById('modalDetalhesVenda').style.display = 'none';
    };
    
    // Efetuar pagamento de comissão
    window.pagarComissao = async (vendaId, colabName, comissaoValor) => {
        if (!confirm(`Deseja marcar a comissão de R$ ${comissaoValor.toFixed(2)} do colaborador "${colabName}" como PAGA?\n\nIsso gerará automaticamente um lançamento nas Despesas.`)) {
            return;
        }
        
        try {
            const hojeLocal = new Date().toISOString().split('T')[0];
            
            // 1. Atualizar venda no Supabase
            const { error: errorVenda } = await supabaseClient
                .from('saidas')
                .update({
                    comissao_paga: true,
                    comissao_paga_data: new Date().toISOString()
                })
                .eq('id', vendaId);
                
            if (errorVenda) throw errorVenda;
            
            // 2. Inserir despesa automática
            const { error: errorDespesa } = await supabaseClient
                .from('despesas')
                .insert([{
                    descricao: `Comissao do vendedo paga - ${colabName} | Venda: #${vendaId}`,
                    valor: comissaoValor,
                    data: hojeLocal,
                    categoria: 'Comissão Vendedor',
                    status: 'pago',
                    loja_id: usuario.loja_id
                }]);
                
            if (errorDespesa) {
                console.error('Erro ao gerar despesa:', errorDespesa);
                mostrarNotificacao('Comissão marcada como paga, mas erro ao criar o registro de despesa.', 'warning');
            } else {
                mostrarNotificacao('Comissão paga e despesa registrada com sucesso!', 'success');
            }
            
            // Recarregar dados
            await carregarDados();
        } catch (error) {
            console.error('Erro ao pagar comissão:', error);
            mostrarNotificacao('Erro ao processar pagamento de comissão', 'error');
        }
    };
    
    // Atualizar resumo e totalizador das comissões selecionadas
    window.atualizarSelecaoComissoes = () => {
        const checkboxes = document.querySelectorAll('.comissao-checkbox:checked');
        const summary = document.getElementById('selectionSummary');
        const countSpan = document.getElementById('selectedCount');
        const totalSpan = document.getElementById('selectedTotal');
        
        let count = checkboxes.length;
        let total = 0;
        
        checkboxes.forEach(cb => {
            total += parseFloat(cb.getAttribute('data-valor') || 0);
        });
        
        if (countSpan) countSpan.textContent = count;
        if (totalSpan) totalSpan.textContent = `R$ ${total.toFixed(2)}`;
        
        if (summary) {
            summary.style.display = count > 0 ? 'flex' : 'none';
        }
    };
    
    // Configurar evento de selecionar todos
    document.getElementById('selectAllComissoes')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibleCheckboxes = document.querySelectorAll('.comissao-checkbox');
        visibleCheckboxes.forEach(cb => {
            cb.checked = checked;
        });
        atualizarSelecaoComissoes();
    });

    // Pagar comissões selecionadas em lote
    document.getElementById('btnPagarSelecionados')?.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.comissao-checkbox:checked');
        if (checkboxes.length === 0) return;
        
        let totalVal = 0;
        const ids = [];
        const payloadDespesas = [];
        
        checkboxes.forEach(cb => {
            const id = parseInt(cb.getAttribute('data-id'));
            const valor = parseFloat(cb.getAttribute('data-valor') || 0);
            const colabName = cb.getAttribute('data-colab');
            
            totalVal += valor;
            ids.push(id);
            payloadDespesas.push({
                descricao: `Comissao do vendedo paga - ${colabName} | Venda: #${id}`,
                valor: valor,
                data: new Date().toISOString().split('T')[0],
                categoria: 'Comissão Vendedor',
                status: 'pago',
                loja_id: usuario.loja_id
            });
        });
        
        if (!confirm(`Deseja efetuar o pagamento em lote de ${checkboxes.length} comissões no valor total de R$ ${totalVal.toFixed(2)}?\n\nIsso marcará todas como pagas e gerará despesas automáticas no sistema.`)) {
            return;
        }
        
        const btn = document.getElementById('btnPagarSelecionados');
        btn.disabled = true;
        btn.textContent = 'Processando...';
        
        try {
            // 1. Atualizar todas as vendas selecionadas no Supabase
            const promisesVendas = ids.map(id => 
                supabaseClient
                    .from('saidas')
                    .update({
                        comissao_paga: true,
                        comissao_paga_data: new Date().toISOString()
                    })
                    .eq('id', id)
            );
            
            // 2. Inserir despesas correspondentes
            const promiseDespesas = supabaseClient
                .from('despesas')
                .insert(payloadDespesas);
                
            await Promise.all([...promisesVendas, promiseDespesas]);
            
            mostrarNotificacao(`${ids.length} comissões pagas e registradas com sucesso!`, 'success');
            
            // Recarregar dados
            await carregarDados();
        } catch (error) {
            console.error('Erro ao pagar comissões em lote:', error);
            mostrarNotificacao('Erro ao processar pagamento em lote', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '💰 Pagar Selecionados';
        }
    });
    
    document.getElementById('filtroStatusComissao')?.addEventListener('change', processarEMostrarComissoes);
    document.getElementById('filtroColaboradorComissao')?.addEventListener('change', processarEMostrarComissoes);
    
    // Cancelar comissão manual
    window.cancelarComissaoManual = async (vendaId) => {
        if (!confirm('Deseja realmente cancelar este lançamento manual de comissão?')) {
            return;
        }
        
        try {
            const { error } = await supabaseClient
                .from('saidas')
                .update({
                    cancelado: true,
                    cancelado_em: new Date().toISOString(),
                    cancelado_por: usuario ? usuario.id : null,
                    motivo_cancelamento: 'Cancelado pelo usuário no Controle de Comissões'
                })
                .eq('id', vendaId);
                
            if (error) throw error;
            
            mostrarNotificacao('Lançamento manual cancelado com sucesso!', 'success');
            await carregarDados();
        } catch (error) {
            console.error('Erro ao cancelar comissão manual:', error);
            mostrarNotificacao('Erro ao cancelar comissão manual: ' + (error.message || error), 'error');
        }
    };

    // Controle do Modal de Comissão Manual
    const modalManual = document.getElementById('modalComissaoManual');
    const btnNovoManual = document.getElementById('btnNovaComissaoManual');
    const fecharManualBtn = document.getElementById('fecharModalManual');
    const cancelarManualBtn = document.getElementById('btnCancelarManual');
    const salvarManualBtn = document.getElementById('btnSalvarComissaoManual');
    const selectStatusManual = document.getElementById('manualStatus');
    const groupFormaPagto = document.getElementById('groupManualFormaPagto');
    
    function abrirModalComissaoManual() {
        if (!modalManual) return;
        
        const selColab = document.getElementById('manualColaboradorId');
        if (selColab) {
            selColab.innerHTML = '<option value="">Selecione o colaborador...</option>' +
                colaboradores.filter(c => c.ativo !== false).map(c => 
                    `<option value="${c.id}">${c.nome} ${c.sobrenome || ''} (${c.funcao || 'Colaborador'} - Base: ${parseFloat(c.comissao || 0).toFixed(1)}%)</option>`
                ).join('');
        }
        
        const dataInput = document.getElementById('manualData');
        if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
        
        const valorInput = document.getElementById('manualValor');
        if (valorInput) valorInput.value = '';
        
        const descInput = document.getElementById('manualDescricao');
        if (descInput) descInput.value = '';
        
        if (selectStatusManual) selectStatusManual.value = 'pendente';
        if (groupFormaPagto) groupFormaPagto.style.display = 'none';
        
        modalManual.style.display = 'flex';
    }
    
    function fecharModalComissaoManual() {
        if (modalManual) modalManual.style.display = 'none';
    }
    
    btnNovoManual?.addEventListener('click', abrirModalComissaoManual);
    fecharManualBtn?.addEventListener('click', fecharModalComissaoManual);
    cancelarManualBtn?.addEventListener('click', fecharModalComissaoManual);
    
    selectStatusManual?.addEventListener('change', (e) => {
        if (groupFormaPagto) {
            groupFormaPagto.style.display = e.target.value === 'pago' ? 'block' : 'none';
        }
    });
    
    salvarManualBtn?.addEventListener('click', async () => {
        const colabId = document.getElementById('manualColaboradorId')?.value;
        const valor = parseFloat(document.getElementById('manualValor')?.value || 0);
        const data = document.getElementById('manualData')?.value;
        const descricao = document.getElementById('manualDescricao')?.value?.trim();
        const status = document.getElementById('manualStatus')?.value || 'pendente';
        const formaPagamento = document.getElementById('manualFormaPagto')?.value || 'PIX';
        
        if (!colabId) {
            mostrarNotificacao('Selecione o colaborador!', 'warning');
            return;
        }
        if (!valor || valor <= 0) {
            mostrarNotificacao('Informe um valor de comissão válido maior que zero!', 'warning');
            return;
        }
        if (!data) {
            mostrarNotificacao('Informe a data do lançamento!', 'warning');
            return;
        }
        if (!descricao) {
            mostrarNotificacao('Informe o motivo ou descrição da comissão!', 'warning');
            return;
        }
        
        const isPago = status === 'pago';
        const colabObj = colaboradores.find(c => c.id === parseInt(colabId));
        const colabNome = colabObj ? `${colabObj.nome} ${colabObj.sobrenome || ''}`.trim() : 'Colaborador';
        
        salvarManualBtn.disabled = true;
        salvarManualBtn.textContent = 'Salvando...';
        
        try {
            const insertSaida = {
                colaborador_id: parseInt(colabId),
                data: data,
                total: 0,
                desconto: 0,
                forma_pagamento: isPago ? formaPagamento : 'Comissão Manual',
                observacao: `[Comissão Manual] ${descricao}`,
                comissao_calculada: valor,
                comissao_paga: isPago,
                comissao_paga_data: isPago ? new Date().toISOString() : null,
                usuario_id: usuario ? usuario.id : null,
                data_finalizacao: new Date().toISOString()
            };
            
            if (usuario && usuario.loja_id) {
                insertSaida.loja_id = usuario.loja_id;
            }
            
            const { data: saidaCriada, error: erroSaida } = await supabaseClient
                .from('saidas')
                .insert([insertSaida])
                .select()
                .single();
                
            if (erroSaida) throw erroSaida;
            
            if (isPago) {
                const insertDespesa = {
                    descricao: `Comissao do vendedo paga - ${colabNome} | Lançamento Manual #${saidaCriada.id} - ${descricao}`,
                    valor: valor,
                    data: data,
                    categoria: 'Comissão Vendedor',
                    status: 'pago',
                    loja_id: usuario.loja_id
                };
                
                const { error: erroDesp } = await supabaseClient
                    .from('despesas')
                    .insert([insertDespesa]);
                    
                if (erroDesp) console.warn('Aviso: erro ao gerar registro em despesas:', erroDesp);
            }
            
            mostrarNotificacao('✅ Comissão manual lançada com sucesso!', 'success');
            fecharModalComissaoManual();
            await carregarDados();
        } catch (error) {
            console.error('Erro ao lançar comissão manual:', error);
            mostrarNotificacao('Erro ao lançar comissão manual: ' + (error.message || error), 'error');
        } finally {
            salvarManualBtn.disabled = false;
            salvarManualBtn.textContent = '💾 Salvar Comissão';
        }
    });

    await carregarDados();
});
