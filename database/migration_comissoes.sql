-- Migration: Colunas de controle de comissão de serviço em produtos e comissão em vendas
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS comissao_habilitada BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS comissao_100_porcento BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS comissao_valor NUMERIC DEFAULT 0;

ALTER TABLE public.saidas 
ADD COLUMN IF NOT EXISTS comissao_calculada NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS comissao_paga BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS comissao_paga_data TIMESTAMP WITH TIME ZONE;
