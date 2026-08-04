-- ======================================================================
-- MIGRAÇÃO PARA CONTROLE DE LOTE E VALIDADE POR CATEGORIA E PRODUTOS
-- Execute estes comandos no Editor SQL do seu painel do Supabase
-- ======================================================================

-- 1. Adicionar colunas na tabela de categorias
ALTER TABLE public.categorias 
ADD COLUMN IF NOT EXISTS controla_lote_validade BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aviso_vencimento_dias INTEGER DEFAULT 30;

-- 2. Adicionar colunas na tabela de produtos
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS data_validade DATE,
ADD COLUMN IF NOT EXISTS lote VARCHAR(100),
ADD COLUMN IF NOT EXISTS alerta_vencimento_dias INTEGER DEFAULT 30;
