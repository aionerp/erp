// js/despesas.js
// Gerenciamento financeiro de despesas do Aion ERP

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }
    
    // Validar permissão
    if (!verificarPermissao('financeiro', 'ver')) {
        document.querySelector('.content').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>🔒 Acesso Negado</h2>
                <p>Você não tem permissão para acessar esta página.</p>
                <button class="btn-primary" onclick="window.location.href='dashboard.html'">Voltar ao Dashboard</button>
            </div>
        `;
        return;
    }
    
    // Configurações do cabeçalho
    document.getElementById('userName').textContent = usuario.nome || 'Usuário';
    const perfilLabels = {
        admin: '👑 Administrador',
        gerente: '📊 Gerente',
        vendedor: '💰 Vendedor',
        tecnico: '🔧 Técnico',
        basico: '👤 Básico'
    };
    document.getElementById('userPerfil').textContent = perfilLabels[usuario.perfil] || usuario.perfil || 'Usuário';
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
    });
    
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });
    
    // Definir datas iniciais (mês atual)
    const hoje = new Date();
    const primeiroDiaStr = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
    const ultimoDiaStr = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    
    document.getElementById('filtroDataInicio').value = primeiroDiaStr;
    document.getElementById('filtroDataFim').value = ultimoDiaStr;
    document.getElementById('data').value = new Date().toISOString().split('T')[0];
    
    let despesas = [];
    
    // =====================================================
    // CARREGAR DESPESAS
    // =====================================================
    async function carregarDespesas() {
        const tbody = document.getElementById('despesasTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray); padding: 40px 20px;">Carregando despesas...</td></tr>';
        }

        const dataInicio = document.getElementById('filtroDataInicio').value;
        const dataFim = document.getElementById('filtroDataFim').value;

        try {
            let query = supabaseClient.from('despesas').select('*');

            if (dataInicio) query = query.gte('data', dataInicio);
            if (dataFim) query = query.lte('data', dataFim);
            
            const { data, error } = await query.order('data', { ascending: false });
                
            if (error) throw error;
            despesas = data || [];
            
            calcularKpis();
            renderizarTabelaDespesas();
        } catch (error) {
            console.error('Erro ao carregar despesas:', error);
            mostrarNotificacao('Erro ao carregar despesas!', 'error');
        }
    }
    
    // =====================================================
    // CALCULAR KPIS FINANCEIROS
    // =====================================================
    function calcularKpis() {
        let totalPago = 0;
        let totalPendente = 0;
        
        despesas.forEach(d => {
            const valor = parseFloat(d.valor || 0);
            if (d.status === 'pago') {
                totalPago += valor;
            } else {
                totalPendente += valor;
            }
        });
        
        const totalGeral = totalPago + totalPendente;
        
        document.getElementById('kpiPago').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPago);
        document.getElementById('kpiPendente').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendente);
        document.getElementById('kpiTotal').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGeral);
    }
    
    // =====================================================
    // RENDERIZAR TABELA
    // =====================================================
    function renderizarTabelaDespesas() {
        const tbody = document.getElementById('despesasTableBody');
        if (!tbody) return;
        
        const search = document.getElementById('searchDespesa').value.toLowerCase().trim();
        const categoria = document.getElementById('filtroCategoria').value;
        const status = document.getElementById('filtroStatus').value;
        
        const filtradas = despesas.filter(d => {
            const matchSearch = d.descricao?.toLowerCase().includes(search);
            const matchCategoria = !categoria || d.categoria === categoria;
            const matchStatus = !status || d.status === status;
            return matchSearch && matchCategoria && matchStatus;
        });
        
        if (filtradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gray); padding: 40px 20px;">Nenhuma despesa encontrada.</td></tr>';
            return;
        }
        
        const podeEditar = verificarPermissao('financeiro', 'editar');
        const podeExcluir = verificarPermissao('financeiro', 'excluir');
        
        tbody.innerHTML = filtradas.map(d => {
            const dataFmt = d.data ? d.data.split('-').reverse().join('/') : '-';
            const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.valor || 0);
            
            const isPago = d.status === 'pago';
            const statusClass = isPago ? 'status-pago' : 'status-pendente';
            const statusText = isPago ? 'Pago' : 'Pendente';
            
            // Botão rápido de marcar como pago se estiver pendente
            const btnPagarHtml = (!isPago && podeEditar) 
                ? `<button class="btn-success" onclick="marcarComoPaga(${d.id})" title="Marcar como Pago" style="font-size:11px; padding:4px 8px; margin-right:4px; font-weight:600;">💸 Pagar</button>` 
                : '';
                
            return `
                <tr>
                    <td><strong>${dataFmt}</strong></td>
                    <td>${d.descricao}</td>
                    <td>${d.categoria || 'Outros'}</td>
                    <td style="text-align: right; font-weight: 600;">${valorFmt}</td>
                    <td style="text-align: center;"><span class="badge-status ${statusClass}">${statusText}</span></td>
                    <td class="table-actions" style="text-align: center;">
                        ${btnPagarHtml}
                        ${podeEditar ? `<button class="btn-warning" onclick="editarDespesa(${d.id})" title="Editar">✏️</button>` : ''}
                        ${podeExcluir ? `<button class="btn-danger" onclick="excluirDespesa(${d.id})" title="Excluir">🗑️</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // =====================================================
    // SALVAR DESPESA
    // =====================================================
    async function salvarDespesa() {
        const id = document.getElementById('despesaId').value;
        const descricao = document.getElementById('descricao').value.trim();
        const valor = parseFloat(document.getElementById('valor').value) || 0;
        const data = document.getElementById('data').value;
        const categoria = document.getElementById('categoria').value;
        const status = document.getElementById('status').value;
        
        if (!descricao || !valor || !data) {
            mostrarNotificacao('Preencha todos os campos obrigatórios!', 'error');
            return;
        }
        
        const btnSalvar = document.getElementById('btnSalvar');
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'Gravando...';
        
        const dados = {
            descricao,
            valor,
            data,
            categoria,
            status,
            loja_id: usuario.loja_id
        };
        
        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('despesas')
                    .update(dados)
                    .eq('id', id);
                    
                if (error) throw error;
                mostrarNotificacao('Despesa atualizada com sucesso!', 'success');
            } else {
                const { error } = await supabaseClient
                    .from('despesas')
                    .insert([dados]);
                    
                if (error) throw error;
                mostrarNotificacao('Despesa cadastrada com sucesso!', 'success');
            }
            
            document.getElementById('modalDespesa').style.display = 'none';
            carregarDespesas();
        } catch (error) {
            console.error('Erro ao salvar despesa:', error);
            mostrarNotificacao('Erro ao salvar despesa!', 'error');
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = 'Salvar';
        }
    }
    
    // Rápido: Marcar como Paga
    window.marcarComoPaga = async (id) => {
        if (!confirm('Deseja realmente marcar esta despesa como PAGA?')) return;
        
        try {
            const { error } = await supabaseClient
                .from('despesas')
                .update({ status: 'pago' })
                .eq('id', id);
                
            if (error) throw error;
            mostrarNotificacao('Despesa paga!', 'success');
            carregarDespesas();
        } catch (error) {
            console.error('Erro ao atualizar status da despesa:', error);
            mostrarNotificacao('Erro ao atualizar despesa', 'error');
        }
    };
    
    // =====================================================
    // CRUD ACTIONS (EXPOSTAS NO ESCOPO GLOBAL)
    // =====================================================
    window.editarDespesa = (id) => {
        if (!verificarPermissao('financeiro', 'editar')) {
            mostrarNotificacao('Você não tem permissão para editar!', 'error');
            return;
        }
        
        const d = despesas.find(item => item.id === id);
        if (!d) return;
        
        document.getElementById('modalTitle').textContent = 'Editar Despesa';
        document.getElementById('despesaId').value = d.id;
        document.getElementById('descricao').value = d.descricao;
        document.getElementById('valor').value = d.valor;
        document.getElementById('data').value = d.data;
        document.getElementById('categoria').value = d.categoria || 'Outros';
        document.getElementById('status').value = d.status || 'pago';
        
        document.getElementById('modalDespesa').style.display = 'flex';
    };
    
    window.excluirDespesa = async (id) => {
        if (!verificarPermissao('financeiro', 'excluir')) {
            mostrarNotificacao('Você não tem permissão para excluir!', 'error');
            return;
        }
        
        if (!confirm('Deseja realmente excluir esta despesa?')) return;
        
        try {
            const { error } = await supabaseClient
                .from('despesas')
                .delete()
                .eq('id', id);
                
            if (error) throw error;
            mostrarNotificacao('Despesa excluída!', 'success');
            carregarDespesas();
        } catch (error) {
            console.error('Erro ao excluir despesa:', error);
            mostrarNotificacao('Erro ao excluir despesa!', 'error');
        }
    };
    
    // =====================================================
    // EVENT LISTENERS
    // =====================================================
    document.getElementById('btnNovaDespesa')?.addEventListener('click', () => {
        if (!verificarPermissao('financeiro', 'criar')) {
            mostrarNotificacao('Você não tem permissão para criar despesas!', 'error');
            return;
        }
        
        document.getElementById('modalTitle').textContent = 'Nova Despesa';
        document.getElementById('despesaForm').reset();
        document.getElementById('despesaId').value = '';
        document.getElementById('data').value = new Date().toISOString().split('T')[0];
        document.getElementById('status').value = 'pago';
        document.getElementById('categoria').value = 'Outros';
        
        document.getElementById('modalDespesa').style.display = 'flex';
    });
    
    document.getElementById('btnCancelar')?.addEventListener('click', () => {
        document.getElementById('modalDespesa').style.display = 'none';
    });
    
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('modalDespesa').style.display = 'none';
    });
    
    document.getElementById('btnSalvar')?.addEventListener('click', salvarDespesa);
    document.getElementById('btnFiltrar')?.addEventListener('click', carregarDespesas);
    
    document.getElementById('searchDespesa')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            renderizarTabelaDespesas();
        }
    });
    
    // Inicialização
    carregarDespesas();
});
