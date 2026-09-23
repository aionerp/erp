-- =====================================================
-- MIGRATION: SERVIÇOS RECORRENTES & ASSINATURAS
-- =====================================================

-- 1. Criar a tabela de servicos_recorrentes
CREATE TABLE IF NOT EXISTS public.servicos_recorrentes (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    produto_id INTEGER REFERENCES public.produtos(id) ON DELETE CASCADE,
    cliente_id INTEGER NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    plano_nome VARCHAR(255) NOT NULL,
    frequencia VARCHAR(50) NOT NULL DEFAULT 'mensal' CHECK (frequencia IN ('semanal', 'mensal', 'trimestral', 'semestral', 'anual')),
    valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_vencimento DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pendente', 'cancelado', 'suspenso')),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Índices para otimização de consultas e relatórios
CREATE INDEX IF NOT EXISTS idx_servicos_recorrentes_loja ON public.servicos_recorrentes(loja_id);
CREATE INDEX IF NOT EXISTS idx_servicos_recorrentes_cliente ON public.servicos_recorrentes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_servicos_recorrentes_vencimento ON public.servicos_recorrentes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_servicos_recorrentes_status ON public.servicos_recorrentes(status);

-- 2. Adicionar colunas de suporte na tabela de produtos
ALTER TABLE public.produtos 
    ADD COLUMN IF NOT EXISTS is_recorrente BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS plano_nome VARCHAR(255),
    ADD COLUMN IF NOT EXISTS plano_frequencia VARCHAR(50),
    ADD COLUMN IF NOT EXISTS plano_cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS plano_data_vencimento DATE,
    ADD COLUMN IF NOT EXISTS plano_valor NUMERIC(10, 2);

-- 3. Adicionar colunas de rastreabilidade de pagamentos em servicos_recorrentes
ALTER TABLE public.servicos_recorrentes
    ADD COLUMN IF NOT EXISTS data_ultimo_pagamento DATE,
    ADD COLUMN IF NOT EXISTS ultima_saida_id INTEGER REFERENCES public.saidas(id) ON DELETE SET NULL;

