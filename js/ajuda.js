// js/ajuda.js — Sistema Unificado de Ajuda Contextual Inteligente

(function () {
    // 1. BANCO DE DADOS DE AJUDA CONTEXTUAL
    const ajudaDb = {
        movimento_diario: {
            titulo: "Movimento Diário",
            objetivo: "Apresenta o fluxo de caixa do dia selecionado, confrontando as entradas de recursos (vendas realizadas) com as saídas (compras/entradas de mercadoria) para exibir o saldo financeiro consolidado.",
            calculo: "<strong>Saldo do Dia = Total de Saídas (Vendas) - Total de Entradas (Compras)</strong>.<br>Considera apenas os registros da data selecionada e, opcionalmente, filtrados por um vendedor específico.",
            origem: "Tabelas <code>saidas</code> (vendas finalizadas) e <code>entradas</code> (compras de fornecedores) do banco de dados Supabase.",
            atualizacao: "Atualizado em tempo real à medida que novas vendas são concluídas ou novas entradas de estoque são dadas no sistema.",
            interpretacao: "<ul><li><strong>Saldo Positivo (azul):</strong> As vendas superaram os custos de reposição de estoque do dia.</li><li><strong>Saldo Negativo (vermelho):</strong> O valor gasto em reposição de mercadoria foi maior que a receita gerada no dia.</li></ul>",
            boas_praticas: "Sempre selecione o dia correspondente para realizar a conferência física do caixa. Ao analisar, lembre-se de confrontar esses dados com o relatório de despesas avulsas.",
            observacoes: "Este relatório foca estritamente no movimento de mercadoria e vendas. Despesas operacionais avulsas (como água, luz, etc.) devem ser consultadas na tela de Fechamento Diário ou Despesas.",
            atalhos: "Telas relacionadas: <a href='fechamento.html'>Fechamento Diário</a>, <a href='despesas.html'>Despesas</a>, Cadastro de <a href='produtos.html'>Produtos</a>.",
            exemplo: "Se hoje você vendeu R$ 1.200,00 (Saídas) e registrou uma compra de estoque de R$ 400,00 (Entradas), o Saldo do Dia exibido será R$ 800,00 (positivo)."
        },
        faturamento: {
            titulo: "Faturamento",
            objetivo: "Apresenta a receita bruta gerada por vendas no período selecionado, agrupando os dados pela periodicidade desejada (diário, semanal, mensal ou anual) para análise de desempenho e sazonalidade.",
            calculo: "Soma acumulada do campo <code>total</code> das vendas não canceladas (tabela <code>saidas</code>) dentro do período de datas e vendedor filtrados.",
            origem: "Tabela <code>saidas</code> no banco de dados Supabase.",
            atualizacao: "Calculado em tempo real ao clicar no botão 'Filtrar', consultando as transações mais recentes.",
            interpretacao: "Representa o faturamento bruto (vendas totais). A análise dos agrupamentos semanais ou mensais permite identificar tendências de crescimento ou sazonalidade do negócio.",
            boas_praticas: "Utilize o filtro de datas para comparar meses fechados (ex: primeiro trimestre de 2026 vs. primeiro trimestre de 2025) para entender o crescimento real da empresa.",
            observacoes: "O faturamento exibido é bruto. Não estão deduzidos os custos de aquisição dos produtos (CMV), taxas de meios de pagamento ou impostos.",
            atalhos: "Telas relacionadas: <a href='dashboard.html'>Dashboard</a>, Relatório de <a href='comissoes.html'>Comissões</a>, Tela de <a href='saidas.html'>Vendas (PDV)</a>.",
            exemplo: "Ao selecionar o plano 'Mensal' e o filtro de data do último ano, o gráfico e a tabela mostrarão exatamente quanto a empresa faturou bruto em cada mês."
        }
    };

    // 2. ELEMENTOS DA INTERFACE (SINGLETONS)
    let popoverEl = null;
    let backdropEl = null;
    let ativoBtn = null;

    // Criar elementos no DOM
    function criarEstruturaAjuda() {
        if (popoverEl) return;

        // Criar Popover
        popoverEl = document.createElement('div');
        popoverEl.className = 'ajuda-popover';
        popoverEl.innerHTML = `
            <div class="ajuda-popover-header">
                <h3><span class="ajuda-popover-icon">ℹ️</span> <span id="ajuda-popover-titulo">Ajuda</span></h3>
                <button class="ajuda-popover-close" aria-label="Fechar">&times;</button>
            </div>
            <div class="ajuda-popover-body" id="ajuda-popover-conteudo"></div>
        `;
        document.body.appendChild(popoverEl);

        // Criar Backdrop (Mobile)
        backdropEl = document.createElement('div');
        backdropEl.className = 'ajuda-backdrop';
        document.body.appendChild(backdropEl);

        // Listeners para Fechar
        popoverEl.querySelector('.ajuda-popover-close').addEventListener('click', fecharAjuda);
        backdropEl.addEventListener('click', fecharAjuda);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') fecharAjuda();
        });

        // Fechar ao clicar fora no desktop
        document.addEventListener('click', (e) => {
            if (popoverEl.classList.contains('active') && 
                !popoverEl.contains(e.target) && 
                !e.target.closest('.ajuda-btn')) {
                fecharAjuda();
            }
        });
    }

    // Exibir Ajuda
    function exibirAjuda(btnEl, helpId) {
        criarEstruturaAjuda();

        const info = ajudaDb[helpId];
        if (!info) {
            console.warn(`Ajuda não encontrada para o ID: ${helpId}`);
            return;
        }

        // Preencher Conteúdo
        document.getElementById('ajuda-popover-titulo').textContent = info.titulo;
        
        let bodyHtml = '';
        const secoes = [
            { chave: 'objetivo', titulo: 'Objetivo' },
            { chave: 'calculo', titulo: 'Como é calculado' },
            { chave: 'origem', titulo: 'Origem dos dados' },
            { chave: 'atualizacao', titulo: 'Atualização' },
            { chave: 'interpretacao', titulo: 'Interpretação' },
            { chave: 'boas_praticas', titulo: 'Boas práticas' },
            { chave: 'observacoes', titulo: 'Observações' },
            { chave: 'atalhos', titulo: 'Atalhos' },
            { chave: 'exemplo', titulo: 'Exemplo prático' }
        ];

        secoes.forEach(sec => {
            if (info[sec.chave]) {
                bodyHtml += `
                    <div class="ajuda-secao">
                        <div class="ajuda-secao-titulo">${sec.titulo}</div>
                        <div class="ajuda-secao-conteudo">${info[sec.chave]}</div>
                    </div>
                `;
            }
        });

        document.getElementById('ajuda-popover-conteudo').innerHTML = bodyHtml;

        // Ativar Popover e Backdrop
        ativoBtn = btnEl;
        popoverEl.classList.add('active');
        
        if (window.innerWidth <= 600) {
            backdropEl.classList.add('active');
            document.body.style.overflow = 'hidden'; // Travar scroll
        } else {
            posicionarPopover(btnEl);
        }
    }

    // Fechar Ajuda
    function fecharAjuda() {
        if (!popoverEl) return;
        popoverEl.classList.remove('active');
        backdropEl.classList.remove('active');
        document.body.style.overflow = ''; // Destravar scroll
        ativoBtn = null;
    }

    // Posicionar Popover Próximo ao Botão (Desktop)
    function posicionarPopover(btnEl) {
        const btnRect = btnEl.getBoundingClientRect();
        const popoverWidth = popoverEl.offsetWidth;
        const popoverHeight = popoverEl.offsetHeight;
        
        // Calcular posição (preferencialmente abaixo e alinhado à direita do botão)
        let top = btnRect.bottom + window.scrollY + 8;
        let left = btnRect.left + window.scrollX - popoverWidth + btnRect.width;

        // Se passar da esquerda da tela, alinhar à esquerda do botão
        if (left < 10) {
            left = btnRect.left + window.scrollX;
        }

        // Se passar do fundo da tela, posicionar acima do botão
        if (btnRect.bottom + popoverHeight + 20 > window.innerHeight) {
            top = btnRect.top + window.scrollY - popoverHeight - 8;
        }

        popoverEl.style.top = `${top}px`;
        popoverEl.style.left = `${left}px`;
    }

    // Inicializar os botões na página
    function inicializarAjuda() {
        document.querySelectorAll('.ajuda-btn').forEach(btn => {
            if (btn.dataset.ajudaInicializada) return;
            
            btn.dataset.ajudaInicializada = "true";
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const helpId = btn.dataset.helpId;
                if (popoverEl && popoverEl.classList.contains('active') && ativoBtn === btn) {
                    fecharAjuda();
                } else {
                    exibirAjuda(btn, helpId);
                }
            });
        });
    }

    // Exportar para escopo global para inicialização dinâmica se necessário
    window.inicializarAjudaContextual = inicializarAjuda;
    window.fecharAjudaContextual = fecharAjuda;

    // Inicializar automaticamente ao carregar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarAjuda);
    } else {
        inicializarAjuda();
    }

    // Reposicionar se redimensionar a tela
    window.addEventListener('resize', () => {
        if (popoverEl && popoverEl.classList.contains('active') && ativoBtn) {
            if (window.innerWidth <= 600) {
                popoverEl.style.top = '';
                popoverEl.style.left = '';
                backdropEl.classList.add('active');
                document.body.style.overflow = 'hidden';
            } else {
                backdropEl.classList.remove('active');
                document.body.style.overflow = '';
                posicionarPopover(ativoBtn);
            }
        }
    });
})();
