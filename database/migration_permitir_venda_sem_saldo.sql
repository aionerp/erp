-- Adiciona a coluna permitir_venda_sem_saldo na tabela public.config_loja caso não exista
ALTER TABLE public.config_loja ADD COLUMN IF NOT EXISTS permitir_venda_sem_saldo BOOLEAN DEFAULT false;
