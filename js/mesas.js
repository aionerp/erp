// js/mesas.js
// Lógica para controle de Mesas e Comandas (Nicho Restaurante)

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    let mesas = [];
    let listaProdutos = [];

    // =====================================================
    // CARREGAR PRODUTOS DO SUPABASE
    // =====================================================
    async function carregarProdutosListagem() {
        try {
            const { data, error } = await supabaseClient
                .from('produtos')
                .select('id, nome, codigo, valor_venda, codigos_barras')
                .order('nome');
            
            if (error) throw error;
            listaProdutos = data || [];
        } catch (error) {
            console.error('Erro ao carregar lista de produtos:', error);
        }
    }

    // =====================================================
    // CARREGAR MESAS DO SUPABASE
    // =====================================================
    async function carregarMesas() {
        try {
            const { data, error } = await supabaseClient
                .from('mesas_comandas')
                .select('*')
                .order('numero');

            if (error) throw error;
            mesas = data || [];
            renderizarMesas();

        } catch (error) {
            console.error('Erro ao carregar mesas:', error);
            mostrarNotificacao('Erro ao carregar mesas e comandas', 'error');
        }
    }

    function renderizarMesas() {
        const container = document.getElementById('restaurantContainer');
        if (!container) return;

        const filtroTipo = document.getElementById('filtroTipo').value;
        const filtroStatus = document.getElementById('filtroStatus').value;

        // Filtrar localmente
        let filtrados = mesas.filter(m => {
            const matchTipo = !filtroTipo || m.tipo === filtroTipo;
            const matchStatus = !filtroStatus || m.status === filtroStatus;
            return matchTipo && matchStatus;
        });

        if (filtrados.length === 0) {
            container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--gray);">
                🍽️ Nenhuma mesa ou comanda cadastrada com estes filtros.
            </div>`;
            return;
        }

        const statusLabels = {
            livre: 'Livre',
            ocupada: 'Ocupada',
            fechando: 'Pedindo Conta'
        };

        const tipoIcones = {
            mesa: '🪑',
            comanda: '📝',
            servico: '🛠️'
        };

        container.innerHTML = filtrados.map(m => {
            const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.valor_acumulado);
            
            return `
                <div class="mesa-card status-${m.status}" onclick="gerenciarConsumo(${m.id})" style="position: relative;">
                    ${m.status === 'livre' ? `
                        <button onclick="event.stopPropagation(); excluirMesa(${m.id}, '${m.numero}')" 
                                style="position: absolute; top: 8px; right: 8px; border: none; background: rgba(220,38,38,0.1); color: #dc2626; cursor: pointer; font-size: 11px; padding: 4px 6px; border-radius: 6px; font-weight: bold; transition: background 0.15s;" 
                                onmouseover="this.style.background='rgba(220,38,38,0.2)'"
                                onmouseout="this.style.background='rgba(220,38,38,0.1)'"
                                title="Excluir comanda/serviço">
                            🗑️
                        </button>
                    ` : ''}
                    <div class="mesa-icon">${tipoIcones[m.tipo]}</div>
                    <div class="mesa-numero">${m.numero}</div>
                    <span class="mesa-status status-badge-${m.status}">${statusLabels[m.status]}</span>
                    <div class="mesa-valor">${m.valor_acumulado > 0 ? valorFormatado : 'R$ 0,00'}</div>
                </div>
            `;
        }).join('');
    }

    // =====================================================
    // CRIAR MESA / COMANDA
    // =====================================================
    async function salvarMesa() {
        const numero = document.getElementById('numero').value.trim();
        const tipo = document.getElementById('tipo').value;

        if (!numero || !tipo) {
            mostrarNotificacao('Informe o número ou identificação!', 'error');
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('mesas_comandas')
                .insert([{
                    numero: numero,
                    tipo: tipo,
                    status: 'livre',
                    valor_acumulado: 0.00
                }]);

            if (error) throw error;
            mostrarNotificacao('Comanda/Serviço criada com sucesso!', 'success');
            document.getElementById('modalMesa').style.display = 'none';
            document.getElementById('mesaForm').reset();
            carregarMesas();

        } catch (error) {
            console.error('Erro ao salvar mesa:', error);
            mostrarNotificacao('Erro ao cadastrar Comanda/Serviço (verifique duplicidade)', 'error');
        }
    }

    // =====================================================
    // GERENCIAR CONSUMO (Modal Consumo)
    // =====================================================
    window.gerenciarConsumo = (id) => {
        const m = mesas.find(item => item.id === id);
        if (!m) return;

        document.getElementById('consumoMesaId').value = m.id;
        let iconeMesa = '🪑';
        if (m.tipo === 'comanda') iconeMesa = '📝';
        else if (m.tipo === 'servico') iconeMesa = '🛠️';
        document.getElementById('consumoTitle').innerHTML = `${iconeMesa} Gerenciar ${m.numero}`;
        
        document.getElementById('consumoValorTotal').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.valor_acumulado);
        document.getElementById('consumoStatus').value = m.status;
        document.getElementById('lancamentoValor').value = '';

        // Reset product search and quantity
        const searchInput = document.getElementById('searchProdutoMesa');
        if (searchInput) searchInput.value = '';
        const hiddenId = document.getElementById('lancamentoProdutoId');
        if (hiddenId) hiddenId.value = '';
        const qtdInput = document.getElementById('lancamentoProdutoQtd');
        if (qtdInput) qtdInput.value = '1';

        // Renderizar carrinho de itens da mesa
        renderCarrinhoMesa(m.itens_carrinho || []);

        // Exibir botão de checkout (Vender) se houver consumo acumulado
        const btnCheckout = document.getElementById('btnLancarVendaMesa');
        if (btnCheckout) {
            if (m.valor_acumulado > 0) {
                btnCheckout.style.display = 'inline-block';
            } else {
                btnCheckout.style.display = 'none';
            }
        }

        document.getElementById('modalConsumo').style.display = 'flex';
    };

    function renderCarrinhoMesa(itens) {
        const container = document.getElementById('carrinhoMesaContainer');
        const tbody = document.getElementById('carrinhoMesaBody');
        if (!tbody || !container) return;

        if (!itens || itens.length === 0) {
            container.style.display = 'none';
            tbody.innerHTML = '';
            return;
        }

        container.style.display = 'block';
        tbody.innerHTML = itens.map((it, idx) => {
            const subtotal = it.valor_venda * it.quantidade;
            const subtotalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal);
            return `
                <tr>
                    <td style="padding: 6px 10px; border-bottom: 1px solid var(--border); font-weight: 500;">${it.nome}</td>
                    <td style="padding: 6px 10px; text-align: center; border-bottom: 1px solid var(--border);">${it.quantidade}</td>
                    <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid var(--border); font-weight: 600; color: var(--primary);">${subtotalFormatado}</td>
                    <td style="padding: 6px 10px; text-align: center; border-bottom: 1px solid var(--border);">
                        <button type="button" class="btn-danger" onclick="removerItemMesa(${idx})" style="padding: 4px 8px; font-size: 11px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none;">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.removerItemMesa = async (index) => {
        const id = parseInt(document.getElementById('consumoMesaId').value);
        const m = mesas.find(item => item.id === id);
        if (!m) return;

        const itens = [...(m.itens_carrinho || [])];
        const itemRemovido = itens[index];
        if (!itemRemovido) return;

        itens.splice(index, 1);
        
        const valorItem = itemRemovido.valor_venda * itemRemovido.quantidade;
        let novoValor = Math.max(0, m.valor_acumulado - valorItem);

        try {
            const { error } = await supabaseClient
                .from('mesas_comandas')
                .update({
                    itens_carrinho: itens,
                    valor_acumulado: novoValor
                })
                .eq('id', id);

            if (error) throw error;

            m.itens_carrinho = itens;
            m.valor_acumulado = novoValor;

            document.getElementById('consumoValorTotal').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(novoValor);
            renderCarrinhoMesa(itens);
            
            const btnCheckout = document.getElementById('btnLancarVendaMesa');
            if (btnCheckout) {
                btnCheckout.style.display = novoValor > 0 ? 'inline-block' : 'none';
            }

            mostrarNotificacao('Item removido com sucesso!', 'success');
            carregarMesas();
        } catch (error) {
            console.error('Erro ao remover item:', error);
            mostrarNotificacao('Erro ao remover item da comanda', 'error');
        }
    };

    async function atualizarConsumo() {
        const id = parseInt(document.getElementById('consumoMesaId').value);
        const m = mesas.find(item => item.id === id);
        if (!m) return;

        const lancamento = parseFloat(document.getElementById('lancamentoValor').value) || 0;
        const status = document.getElementById('consumoStatus').value;
        
        let novoValor = m.valor_acumulado + lancamento;
        let novoStatus = status;
        let novosItens = [...(m.itens_carrinho || [])];

        // Se o status for setado como livre, zera o consumo acumulado e limpa itens
        if (status === 'livre') {
            novoValor = 0.00;
            novosItens = [];
        } else if (lancamento > 0 && status === 'livre') {
            novoStatus = 'ocupada'; // se lançou valor, marca como ocupada
        } else if (novoValor > 0 && status === 'livre') {
            novoStatus = 'ocupada'; // se tem valor e estava livre, força ocupada
        }

        try {
            const { error } = await supabaseClient
                .from('mesas_comandas')
                .update({
                    status: novoStatus,
                    valor_acumulado: novoValor,
                    itens_carrinho: novosItens
                })
                .eq('id', id);

            if (error) throw error;
            mostrarNotificacao('Mesa atualizada com sucesso!', 'success');
            document.getElementById('modalConsumo').style.display = 'none';
            carregarMesas();
        } catch (error) {
            console.error('Erro ao atualizar consumo:', error);
            mostrarNotificacao('Erro ao atualizar consumo', 'error');
        }
    }

    // Lançar Venda/Checkout
    document.getElementById('btnLancarVendaMesa')?.addEventListener('click', () => {
        const id = parseInt(document.getElementById('consumoMesaId').value);
        const m = mesas.find(item => item.id === id);
        if (!m) return;

        // Armazenar temporariamente no sessionStorage para o PDV (saidas.html) carregar
        sessionStorage.setItem('checkout_restaurante', JSON.stringify({
            mesa_id: m.id,
            numero: m.numero,
            valor: m.valor_acumulado,
            itens: m.itens_carrinho || []
        }));

        document.getElementById('modalConsumo').style.display = 'none';
        window.location.href = 'saidas.html';
    });

    document.getElementById('btnAdicionarLancamentoRapido')?.addEventListener('click', async () => {
        const id = parseInt(document.getElementById('consumoMesaId').value);
        const m = mesas.find(item => item.id === id);
        if (!m) return;

        const lancamento = parseFloat(document.getElementById('lancamentoValor').value) || 0;
        if (lancamento <= 0) {
            mostrarNotificacao('Informe um valor de lançamento maior que zero!', 'error');
            return;
        }

        const btn = document.getElementById('btnAdicionarLancamentoRapido');
        btn.disabled = true;
        btn.textContent = '...';

        const novoValor = m.valor_acumulado + lancamento;
        const novoStatus = m.status === 'livre' ? 'ocupada' : m.status;

        try {
            const { error } = await supabaseClient
                .from('mesas_comandas')
                .update({
                    status: novoStatus,
                    valor_acumulado: novoValor
                })
                .eq('id', id);

            if (error) throw error;

            m.valor_acumulado = novoValor;
            m.status = novoStatus;

            document.getElementById('consumoValorTotal').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(novoValor);
            document.getElementById('consumoStatus').value = novoStatus;
            document.getElementById('lancamentoValor').value = '';

            const btnCheckout = document.getElementById('btnLancarVendaMesa');
            if (btnCheckout) {
                btnCheckout.style.display = 'inline-block';
            }

            mostrarNotificacao('Lançamento adicionado!', 'success');
            carregarMesas();

        } catch (error) {
            console.error('Erro ao adicionar lançamento:', error);
            mostrarNotificacao('Erro ao adicionar lançamento', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '➕ Lançar Valor';
        }
    });

    // Lançamento de Produto do Cardápio / Listagem
    // Sugestões de produtos na mesa
    document.getElementById('searchProdutoMesa')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const suggestionsContainer = document.getElementById('mesaProdutoSuggestions');
        if (!suggestionsContainer) return;

        if (!query) {
            suggestionsContainer.style.display = 'none';
            suggestionsContainer.innerHTML = '';
            return;
        }

        const filtrados = listaProdutos.filter(p => 
            p.nome.toLowerCase().includes(query) || 
            (p.codigo || '').toLowerCase().includes(query) ||
            (Array.isArray(p.codigos_barras) && p.codigos_barras.some(b => b.toLowerCase().includes(query)))
        ).slice(0, 10);

        if (filtrados.length === 0) {
            suggestionsContainer.innerHTML = '<div style="padding: 10px; color: var(--gray); font-size: 13px;">Nenhum produto encontrado</div>';
            suggestionsContainer.style.display = 'block';
            return;
        }

        suggestionsContainer.innerHTML = filtrados.map(p => `
            <div class="suggestion-item" data-id="${p.id}" data-nome="${p.nome}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                <span><strong>${p.nome}</strong> <small style="color: var(--gray);">(${p.codigo || 'Sem código'})</small></span>
                <span style="font-weight: 600; color: var(--primary);">R$ ${p.valor_venda.toFixed(2)}</span>
            </div>
        `).join('');

        suggestionsContainer.style.display = 'block';

        suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                document.getElementById('lancamentoProdutoId').value = item.dataset.id;
                document.getElementById('searchProdutoMesa').value = item.dataset.nome;
                suggestionsContainer.style.display = 'none';
                suggestionsContainer.innerHTML = '';
            });
        });
    });

    document.addEventListener('click', (e) => {
        const suggestionsContainer = document.getElementById('mesaProdutoSuggestions');
        if (suggestionsContainer && !e.target.closest('#searchProdutoMesa') && !e.target.closest('#mesaProdutoSuggestions')) {
            suggestionsContainer.style.display = 'none';
        }
    });

    document.getElementById('btnLancarProdutoMesa')?.addEventListener('click', async () => {
        const id = parseInt(document.getElementById('consumoMesaId').value);
        const m = mesas.find(item => item.id === id);
        if (!m) return;

        const prodId = parseInt(document.getElementById('lancamentoProdutoId').value);
        if (!prodId) {
            mostrarNotificacao('Pesquise e selecione um produto para lançar!', 'error');
            return;
        }

        const qtdInput = document.getElementById('lancamentoProdutoQtd');
        const quantidade = parseInt(qtdInput.value) || 1;
        if (quantidade <= 0) {
            mostrarNotificacao('Informe uma quantidade maior que zero!', 'error');
            return;
        }

        const produto = listaProdutos.find(p => p.id === prodId);
        if (!produto) return;

        const btn = document.getElementById('btnLancarProdutoMesa');
        btn.disabled = true;
        btn.textContent = '...';

        const itens = [...(m.itens_carrinho || [])];
        const itemExistente = itens.find(it => it.id === produto.id);
        if (itemExistente) {
            itemExistente.quantidade += quantidade;
        } else {
            itens.push({
                id: produto.id,
                nome: produto.nome,
                codigo: produto.codigo,
                valor_venda: produto.valor_venda,
                quantidade: quantidade
            });
        }

        const valorAdicional = produto.valor_venda * quantidade;
        const novoValor = m.valor_acumulado + valorAdicional;
        const novoStatus = m.status === 'livre' ? 'ocupada' : m.status;

        try {
            const { error } = await supabaseClient
                .from('mesas_comandas')
                .update({
                    itens_carrinho: itens,
                    status: novoStatus,
                    valor_acumulado: novoValor
                })
                .eq('id', id);

            if (error) throw error;

            m.itens_carrinho = itens;
            m.valor_acumulado = novoValor;
            m.status = novoStatus;

            document.getElementById('consumoValorTotal').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(novoValor);
            document.getElementById('consumoStatus').value = novoStatus;
            
            document.getElementById('searchProdutoMesa').value = '';
            document.getElementById('lancamentoProdutoId').value = '';
            qtdInput.value = '1';

            renderCarrinhoMesa(itens);

            const btnCheckout = document.getElementById('btnLancarVendaMesa');
            if (btnCheckout) {
                btnCheckout.style.display = 'inline-block';
            }

            mostrarNotificacao('Item lançado com sucesso!', 'success');
            carregarMesas();
        } catch (error) {
            console.error('Erro ao lançar produto na comanda:', error);
            mostrarNotificacao('Erro ao lançar produto', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '➕ Lançar';
        }
    });

    // =====================================================
    // EVENTOS
    // =====================================================
    document.getElementById('btnNovaMesa')?.addEventListener('click', () => {
        document.getElementById('modalMesa').style.display = 'flex';
        document.getElementById('numero').focus();
    });

    document.getElementById('btnSalvarMesa')?.addEventListener('click', salvarMesa);
    document.getElementById('btnAtualizarConsumo')?.addEventListener('click', atualizarConsumo);

    document.getElementById('btnCancelarModal')?.addEventListener('click', () => {
        document.getElementById('modalMesa').style.display = 'none';
    });
    document.getElementById('btnCancelarConsumo')?.addEventListener('click', () => {
        document.getElementById('modalConsumo').style.display = 'none';
    });

    document.querySelectorAll('.close, #closeConsumo').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalMesa').style.display = 'none';
            document.getElementById('modalConsumo').style.display = 'none';
        });
    });

    // Filtros
    document.getElementById('filtroTipo')?.addEventListener('change', renderizarMesas);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarMesas);

    // Excluir Mesa/Comanda/Serviço
    window.excluirMesa = async (id, numero) => {
        if (!confirm(`Deseja realmente excluir a comanda/mesa "${numero}"?`)) return;

        try {
            const { error } = await supabaseClient
                .from('mesas_comandas')
                .delete()
                .eq('id', id);

            if (error) throw error;

            mostrarNotificacao(`Comanda/serviço "${numero}" excluída com sucesso!`, 'success');
            await carregarMesas();
        } catch (error) {
            console.error('Erro ao excluir comanda/serviço:', error);
            mostrarNotificacao('Erro ao excluir comanda/serviço', 'error');
        }
    };

    // Inicializar
    carregarMesas();
    carregarProdutosListagem();
});
