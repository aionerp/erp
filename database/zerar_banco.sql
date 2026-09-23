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

-- 2. REINSERIR LOJA MATRIZ INICIAL (ID 1)
INSERT INTO public.lojas (id, nome, segmento, cnpj, telefone)
VALUES (1, 'Loja Matriz', 'eletronico', '12.345.678/0001-90', '(11) 99999-9999')
ON CONFLICT (id) DO NOTHING;

-- 3. REINSERIR CONFIGURAÇÕES DA LOJA MATRIZ (ID 1)
INSERT INTO public.config_loja (
    loja_id, nome_fantasia, razao_social, cnpj, 
    habilitar_seriais, habilitar_agendamentos, habilitar_mesas, habilitar_lotes, habilitar_variacoes
)
VALUES (
    1, 'Loja Matriz', 'Loja Matriz LTDA', '12.345.678/0001-90',
    true, false, false, true, false
)
ON CONFLICT (loja_id) DO NOTHING;

-- 4. REINSERIR USUÁRIO ADMINISTRADOR PADRÃO (adm.padrao / senha: 123)
-- Permite login imediato após zerar o banco
INSERT INTO public.usuarios (loja_id, nome, email, senha, perfil, nivel_acesso, permissoes, ativo)
VALUES (
    1,
    'Administrador',
    'adm.padrao',
    '123',
    'admin',
    'admin',
    '{
        "dashboard": { "ver": true },
        "clientes": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "produtos": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "categorias": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "estoque": { "ver": true, "ajustar": true },
        "entradas": { "ver": true, "criar": true, "excluir": true },
        "saidas": { "ver": true, "criar": true, "cancelar": true, "ver_vendas_outros": true },
        "assinaturas": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "fornecedores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "ordens_servico": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "colaboradores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "financeiro": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "relatorios": { "ver": true, "exportar": true },
        "usuarios": { "ver": true, "criar": true, "editar": true, "excluir": true }
    }'::jsonb,
    true
)
ON CONFLICT (email) DO NOTHING;

-- 5. REINSERIR PRODUTO PADRÃO PARA RECORRÊNCIAS / ASSINATURAS
INSERT INTO public.produtos (
    loja_id, codigo, nome, tipo, valor_venda, valor_compra, estoque, estoque_total, ativo
)
VALUES (
    1, 'REC-MENSALIDADE', 'Mensalidade de Serviço Recorrente', 'servico', 0.01, 0.00, 0, 0, true
)
ON CONFLICT DO NOTHING;

-- 6. SINCRONIZAR SEQUENCES PARA O PRÓXIMO REGISTRO
SELECT setval('public.lojas_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.lojas));
SELECT setval('public.usuarios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.usuarios));
SELECT setval('public.produtos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.produtos));
SELECT setval('public.config_loja_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.config_loja));

COMMIT;

-- ============================================================================
-- DADOS ZERADOS COM SUCESSO!
-- Login disponível:
--   Usuário: adm.padrao
--   Senha:   123
-- ============================================================================
