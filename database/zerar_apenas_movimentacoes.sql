-- ============================================================================
-- SCRIPT PARA ZERAR APENAS TESTES (MANTENDO LOJAS E USUÁRIOS) - AION ERP
-- ============================================================================
-- Use este script se você já configurou a sua Loja e seus Usuários reais,
-- e deseja apagar APENAS os testes de vendas, caixas, clientes, produtos e estoque.
--
-- O que este script apaga:
--   • Vendas, Itens Vendidos, Caixas e Pagamentos
--   • Despesas, Boletos a Pagar e Movimentos de Estoque
--   • Entradas de Mercadorias e Produtos Seriais
--   • Clientes, Categorias e Produtos cadastrados nos testes
--   • Agendamentos, Mesas/Comandas e Assinaturas Recorrentes
--
-- O que este script PRESERVA:
--   ✅ Sua Loja (nome, cnpj, dados)
--   ✅ Suas Configurações da Loja
--   ✅ Seus Usuários e senhas já criados
-- ============================================================================

BEGIN;

TRUNCATE TABLE 
    public.servicos_recorrentes,
    public.promocao_produtos,
    public.promocoes,
    public.mesas_comandas,
    public.agendamentos,
    public.movimentos_estoque,
    public.boletos_pagar,
    public.despesas,
    public.saida_itens,
    public.saidas,
    public.caixas,
    public.entrada_itens,
    public.entradas,
    public.produtos_seriais,
    public.produtos,
    public.colaboradores,
    public.clientes,
    public.categorias
RESTART IDENTITY CASCADE;

-- Re-inserir apenas o produto padrão de serviços recorrentes
INSERT INTO public.produtos (
    loja_id, codigo, nome, tipo, valor_venda, valor_compra, estoque, estoque_total, ativo
)
VALUES (
    1, 'REC-MENSALIDADE', 'Mensalidade de Serviço Recorrente', 'servico', 0.01, 0.00, 0, 0, true
)
ON CONFLICT DO NOTHING;

SELECT setval('public.produtos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.produtos));

COMMIT;

-- ============================================================================
-- MOVIMENTAÇÕES DE TESTE ZERADAS COM SUCESSO!
-- Suas lojas e seus usuários continuam intactos.
-- ============================================================================
