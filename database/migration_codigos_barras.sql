-- Migration: Adicionar coluna de códigos de barras (múltiplos) na tabela de produtos
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS codigos_barras JSONB DEFAULT '[]'::jsonb;
