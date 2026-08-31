// js/agendamentos.js
// Lógica para controle de agendamentos (Nicho Estética)

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    // Set default date filter to today
    const inputFiltroData = document.getElementById('filtroData');
    if (inputFiltroData) {
        inputFiltroData.value = new Date().toISOString().substring(0, 10);
    }

    let agendamentos = [];
    let clientes = [];
    let servicos = [];
    let profissionais = [];

    // =====================================================
    // CARREGAR SELECTION OPTIONS (Clientes, Serviços, Profissionais)
    // =====================================================
    async function carregarDadosFormulario() {
        try {
            const [clientesRes, servicosRes, profissionaisRes] = await Promise.all([
                supabaseClient.from('clientes').select('id, nome').eq('tipo', 'cliente').order('nome'),
                supabaseClient.from('produtos').select('id, nome, valor_venda').order('nome'),
                supabaseClient.from('usuarios').select('id, nome').eq('ativo', true).order('nome')
            ]);

            clientes = clientesRes.data || [];
            servicos = servicosRes.data || [];
            profissionais = profissionaisRes.data || [];

            // Popular select de clientes
            const selectCliente = document.getElementById('clienteId');
            if (selectCliente) {
                selectCliente.innerHTML = '<option value="">Selecione um cliente</option>' +
                    clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
            }

            // Popular select de serviços
            const selectServico = document.getElementById('servicoId');
            if (selectServico) {
                selectServico.innerHTML = '<option value="">Selecione um serviço</option>' +
                    servicos.map(s => `<option value="${s.id}" data-valor="${s.valor_venda}">${s.nome} - R$ ${s.valor_venda.toFixed(2)}</option>`).join('');
                
                selectServico.addEventListener('change', (e) => {
                    const selectedOption = e.target.options[e.target.selectedIndex];
                    const valor = parseFloat(selectedOption.getAttribute('data-valor')) || 0;
                    document.getElementById('valor').value = valor;
                });
            }

            // Popular select de profissionais
            const selectProfissional = document.getElementById('profissionalId');
            const filtroProfissional = document.getElementById('filtroProfissional');
            if (selectProfissional) {
                selectProfissional.innerHTML = '<option value="">Selecione um profissional</option>' +
                    profissionais.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
            }
            if (filtroProfissional) {
                filtroProfissional.innerHTML = '<option value="">Todos Profissionais</option>' +
                    profissionais.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
            }

        } catch (error) {
            console.error('Erro ao carregar dados do formulário:', error);
        }
    }

    // =====================================================
    // CARREGAR E FILTRAR AGENDAMENTOS
    // =====================================================
    async function carregarAgendamentos() {
        try {
            // Fazer a query relacionando tabelas
            const { data, error } = await supabaseClient
                .from('agendamentos')
                .select(`
                    *,
                    clientes(nome, telefone),
                    usuarios(nome),
                    produtos(nome)
                `)
                .order('data_hora', { ascending: true });

            if (error) throw error;
            agendamentos = data || [];
            renderizarAgendamentos();

        } catch (error) {
            console.error('Erro ao carregar agendamentos:', error);
            mostrarNotificacao('Erro ao carregar agendamentos', 'error');
        }
    }

    function renderizarAgendamentos() {
        const container = document.getElementById('agendamentosContainer');
        if (!container) return;

        const filtroData = document.getElementById('filtroData').value;
        const filtroProfissional = document.getElementById('filtroProfissional').value;
        const filtroStatus = document.getElementById('filtroStatus').value;

        // Filtrar localmente
        let filtrados = agendamentos.filter(a => {
            if (!a.data_hora) return false;
            const dataHoraLocal = new Date(a.data_hora);
            const ano = dataHoraLocal.getFullYear();
            const mes = String(dataHoraLocal.getMonth() + 1).padStart(2, '0');
            const dia = String(dataHoraLocal.getDate()).padStart(2, '0');
            const dataAgendamento = `${ano}-${mes}-${dia}`;
            
            const matchData = !filtroData || dataAgendamento === filtroData;
            const matchProf = !filtroProfissional || (a.profissional_id && a.profissional_id.toString() === filtroProfissional);
            const matchStatus = !filtroStatus || a.status === filtroStatus;
            return matchData && matchProf && matchStatus;
        });

        if (filtrados.length === 0) {
            container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--gray);">
                📅 Nenhum agendamento para os filtros selecionados.
            </div>`;
            return;
        }

        const statusLabels = {
            agendado: 'Agendado',
            confirmado: 'Confirmado',
            concluido: 'Concluido',
            cancelado: 'Cancelado'
        };

        container.innerHTML = filtrados.map(a => {
            const dataHora = new Date(a.data_hora);
            const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const dataFormatada = dataHora.toLocaleDateString('pt-BR');
            const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.valor);

            return `
                <div class="appointment-card status-${a.status}">
                    <span class="badge-status badge-${a.status}">${statusLabels[a.status]}</span>
                    <div class="appointment-time">
                        ⏰ ${horaFormatada} <span style="font-size:12px; font-weight:normal; color:var(--gray);">(${dataFormatada})</span>
                    </div>
                    <div class="appointment-details">
                        <p><strong>Cliente:</strong> ${a.clientes?.nome || 'Não informado'} (${a.clientes?.telefone || 'Sem telefone'})</p>
                        <p><strong>Serviço:</strong> ${a.produtos?.nome || 'Serviço excluído'}</p>
                        <p><strong>Profissional:</strong> 👤 ${a.usuarios?.nome || 'Não definido'}</p>
                        <p><strong>Valor:</strong> <strong style="color:var(--primary);">${valorFormatado}</strong></p>
                        ${a.observacoes ? `<p style="margin-top:6px; font-style:italic;">"${a.observacoes}"</p>` : ''}
                    </div>
                    
                    <div class="appointment-actions">
                        ${a.status === 'agendado' ? `
                            <button class="btn-primary" onclick="alterarStatusAgendamento(${a.id}, 'confirmado')" style="font-size:11px; padding:4px 8px;">👍 Confirmar</button>
                        ` : ''}
                        ${a.status === 'confirmado' ? `
                            <button class="btn-success" onclick="concluirAgendamento(${a.id})" style="font-size:11px; padding:4px 8px;">✅ Concluir</button>
                        ` : ''}
                        ${a.status !== 'concluido' && a.status !== 'cancelado' ? `
                            <button class="btn-warning" onclick="editarAgendamento(${a.id})" style="font-size:11px; padding:4px 8px; font-weight:bold;">✏️</button>
                            <button class="btn-danger" onclick="alterarStatusAgendamento(${a.id}, 'cancelado')" style="font-size:11px; padding:4px 8px;">❌ Cancelar</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // =====================================================
    // SALVAR E EDITAR AGENDAMENTO
    // =====================================================
    window.editarAgendamento = (id) => {
        const a = agendamentos.find(item => item.id === id);
        if (!a) return;

        document.getElementById('modalTitle').textContent = 'Editar Agendamento';
        document.getElementById('agendamentoId').value = a.id;
        document.getElementById('clienteId').value = a.cliente_id;
        document.getElementById('servicoId').value = a.servico_id;
        document.getElementById('profissionalId').value = a.profissional_id;
        document.getElementById('dataHora').value = a.data_hora.substring(0, 16);
        document.getElementById('valor').value = a.valor;
        document.getElementById('observacoes').value = a.observacoes || '';

        document.getElementById('modalAgendamento').style.display = 'flex';
    };

    window.concluirAgendamento = (id) => {
        const a = agendamentos.find(item => item.id === id);
        if (!a) return;

        // Armazenar temporariamente no sessionStorage para o PDV (saidas.html) carregar
        sessionStorage.setItem('checkout_agendamento', JSON.stringify({
            agendamento_id: a.id,
            cliente_id: a.cliente_id,
            servico_id: a.servico_id,
            servico_nome: a.produtos?.nome || 'Serviço',
            codigo: a.produtos?.codigo || 'SERV-AGEND',
            valor: a.valor,
            profissional_id: a.profissional_id
        }));

        window.location.href = 'saidas.html';
    };

    window.alterarStatusAgendamento = async (id, novoStatus) => {
        if (!confirm(`Deseja alterar o status deste agendamento para "${novoStatus}"?`)) return;

        try {
            const { error } = await supabaseClient
                .from('agendamentos')
                .update({ status: novoStatus })
                .eq('id', id);

            if (error) throw error;
            mostrarNotificacao(`Agendamento atualizado com sucesso!`, 'success');
            carregarAgendamentos();
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            mostrarNotificacao('Erro ao alterar status do agendamento', 'error');
        }
    };

    async function salvarAgendamento() {
        const id = document.getElementById('agendamentoId').value;
        const clienteId = document.getElementById('clienteId').value;
        const servicoId = document.getElementById('servicoId').value;
        const profissionalId = document.getElementById('profissionalId').value;
        const dataHora = document.getElementById('dataHora').value;
        const valor = parseFloat(document.getElementById('valor').value) || 0;
        const observacoes = document.getElementById('observacoes').value;

        if (!clienteId || !servicoId || !profissionalId || !dataHora || !valor) {
            mostrarNotificacao('Preencha todos os campos obrigatórios!', 'error');
            return;
        }

        const dados = {
            cliente_id: parseInt(clienteId),
            servico_id: parseInt(servicoId),
            profissional_id: parseInt(profissionalId),
            data_hora: new Date(dataHora).toISOString(),
            valor: valor,
            observacoes: observacoes
        };

        try {
            if (id) {
                const { error } = await supabaseClient
                    .from('agendamentos')
                    .update(dados)
                    .eq('id', id);
                if (error) throw error;
                mostrarNotificacao('Agendamento atualizado!', 'success');
            } else {
                dados.status = 'agendado';
                const { error } = await supabaseClient
                    .from('agendamentos')
                    .insert([dados]);
                if (error) throw error;
                mostrarNotificacao('Agendamento criado com sucesso!', 'success');
            }

            document.getElementById('modalAgendamento').style.display = 'none';
            document.getElementById('agendamentoForm').reset();
            carregarAgendamentos();

        } catch (error) {
            console.error('Erro ao salvar agendamento:', error);
            mostrarNotificacao('Erro ao salvar agendamento', 'error');
        }
    }

    // =====================================================
    // EVENTOS
    // =====================================================
    document.getElementById('btnNovoAgendamento')?.addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Novo Agendamento';
        document.getElementById('agendamentoForm').reset();
        document.getElementById('agendamentoId').value = '';
        
        // Set default datetime to tomorrow at 09:00
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        amanha.setHours(9, 0, 0, 0);
        document.getElementById('dataHora').value = amanha.toISOString().substring(0, 16);

        document.getElementById('modalAgendamento').style.display = 'flex';
    });

    document.getElementById('btnSalvarAgendamento')?.addEventListener('click', salvarAgendamento);
    document.getElementById('btnCancelarModal')?.addEventListener('click', () => {
        document.getElementById('modalAgendamento').style.display = 'none';
    });

    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modalAgendamento').style.display = 'none';
        });
    });

    // Filtros
    document.getElementById('filtroData')?.addEventListener('change', renderizarAgendamentos);
    document.getElementById('filtroProfissional')?.addEventListener('change', renderizarAgendamentos);
    document.getElementById('filtroStatus')?.addEventListener('change', renderizarAgendamentos);

    // Inicializar
    carregarDadosFormulario();
    carregarAgendamentos();
});
