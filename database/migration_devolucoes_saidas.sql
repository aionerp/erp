-- migration_devolucoes_saidas.sql
-- Permite que itens de saida tenham quantidades negativas (para devolucoes/estornos de vendas)

ALTER TABLE public.saida_itens DROP CONSTRAINT IF EXISTS saida_itens_quantidade_check;
ALTER TABLE public.saida_itens ADD CONSTRAINT saida_itens_quantidade_check CHECK (quantidade != 0);
