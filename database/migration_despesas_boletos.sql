-- ======================================================================
-- MIGRAÇÃO PARA MÓDULO DE DESPESAS E BOLETOS A PAGAR
-- Execute estes comandos no Editor SQL do seu painel do Supabase
-- ======================================================================

-- 1. Criar tabela de despesas
CREATE TABLE IF NOT EXISTS public.despesas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    categoria VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pago' CHECK (status IN ('pago', 'pendente')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS em despesas
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

-- Criar política RLS para despesas
CREATE POLICY tenant_despesas_policy ON public.despesas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

-- 2. Adicionar coluna forma_pagamento à tabela de entradas
ALTER TABLE public.entradas ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50) DEFAULT 'Dinheiro';

-- 3. Criar tabela de boletos a pagar
CREATE TABLE IF NOT EXISTS public.boletos_pagar (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    fornecedor_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    entrada_id INTEGER REFERENCES public.entradas(id) ON DELETE CASCADE,
    data_vencimento DATE NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    confirmado BOOLEAN DEFAULT false,
    data_pagamento DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS em boletos a pagar
ALTER TABLE public.boletos_pagar ENABLE ROW LEVEL SECURITY;

-- Criar política RLS para boletos a pagar
CREATE POLICY tenant_boletos_pagar_policy ON public.boletos_pagar
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
