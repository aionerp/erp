-- 1. Executar no SQL Editor do Supabase para habilitar termos de garantia e troca personalizáveis
ALTER TABLE public.config_loja ADD COLUMN IF NOT EXISTS termo_garantia TEXT;
ALTER TABLE public.config_loja ADD COLUMN IF NOT EXISTS termo_troca TEXT;
