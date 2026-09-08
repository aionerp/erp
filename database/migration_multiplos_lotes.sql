-- ======================================================================
-- MIGRAÇÃO PARA SUPORTE A MÚLTIPLOS LOTES E VALIDADES POR PRODUTO
-- Execute estes comandos no Editor SQL do seu painel Supabase
-- ======================================================================

-- 1. Adicionar coluna lotes (JSONB) na tabela de produtos
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS lotes JSONB DEFAULT '[]'::jsonb;

-- 2. Migrar lotes e validades existentes para o array lotes
UPDATE public.produtos
SET lotes = jsonb_build_array(
    jsonb_build_object(
        'lote', lote,
        'data_validade', data_validade,
        'quantidade', coalesce(estoque_total, estoque, 0),
        'alerta_vencimento_dias', coalesce(alerta_vencimento_dias, 30),
        'criado_em', created_at
    )
)
WHERE (lote IS NOT NULL OR data_validade IS NOT NULL) 
  AND (lotes IS NULL OR lotes = '[]'::jsonb);
