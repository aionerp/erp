-- ============================================================================
-- SCRIPT PARA ZERAR DADOS DO BANCO DE DADOS (RESET DE TESTES) - AION ERP
-- ============================================================================
-- Use este script quando terminar seus testes para limpar o banco de dados.
--
-- O que este script faz:
--   1. Apaga com segurança todos os dados operacionais (Vendas, Caixas,
--      Contas a Pagar/Despesas, Movimentações de Estoque, Clientes, Produtos,
--      Lotes, Seriais, Agendamentos, Mesas e Assinaturas Recorrentes).
--   2. Reinicia todos os contadores de ID (auto-increment) de volta para o número 1.
--   3. Recria a carga inicial padrão (Loja Matriz, Configurações e Usuário adm.padrao).
--
-- Como executar no Neon:
--   1. Acesse o console do Neon (console.neon.tech)
--   2. Clique no seu projeto -> SQL Editor
--   3. Cole este script e clique em RUN. (Executa em menos de 1 segundo).
-- ============================================================================

BEGIN;

-- 1. TRUNCATE EM TODAS AS 21 TABELAS COM RESET DE SEQUENCES
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
    public.categorias,
    public.config_loja,
    public.usuarios,
    public.lojas
RESTART IDENTITY CASCADE;

-- 2. BANCO LIMPO PARA NOVO PRIMEIRO ACESSO
-- Nenhuma loja ou usuário pré-inserido. O cadastro será gerado via tela inicial "Primeiro Acesso por CNPJ".

-- 3. REINSERIR PRODUTO PADRÃO PARA RECORRÊNCIAS / ASSINATURAS
INSERT INTO public.produtos (
    loja_id, codigo, nome, tipo, valor_venda, valor_compra, estoque, estoque_total, ativo
)
VALUES (
    1, 'REC-MENSALIDADE', 'Mensalidade de Serviço Recorrente', 'servico', 0.01, 0.00, 0, 0, true
)
ON CONFLICT DO NOTHING;

-- 4. SINCRONIZAR SEQUENCES PARA O PRÓXIMO REGISTRO
SELECT setval('public.lojas_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.lojas));
SELECT setval('public.usuarios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.usuarios));
SELECT setval('public.produtos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.produtos));
SELECT setval('public.config_loja_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.config_loja));

COMMIT;

-- ============================================================================
-- DADOS ZERADOS COM SUCESSO!
-- O banco está limpo e disponível para realização do Primeiro Acesso por CNPJ.
-- ============================================================================
