-- ======================================================================
-- MIGRAÇÕES COMPLETAS (COLABORADORES, DESPESAS E BOLETOS A PAGAR)
-- Execute estes comandos no SQL Editor do painel do Supabase
-- Link do projeto: https://supabase.com/dashboard/project/madaoptvsbnhelamwyzp
-- ======================================================================

-- 1. TABELA DE COLABORADORES
CREATE TABLE IF NOT EXISTS public.colaboradores (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    sobrenome VARCHAR(100),
    data_nascimento DATE,
    telefone VARCHAR(50),
    funcao VARCHAR(100),
    comissao NUMERIC(5, 2) DEFAULT 0.00,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir que a coluna ativo exista caso a tabela já tenha sido criada anteriormente
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- Habilitar RLS em colaboradores
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

-- Garantir que recria a política se ela já existir
DROP POLICY IF EXISTS tenant_colaboradores_policy ON public.colaboradores;
CREATE POLICY tenant_colaboradores_policy ON public.colaboradores
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

-- Vincular colaborador na tabela de saídas (vendas)
ALTER TABLE public.saidas ADD COLUMN IF NOT EXISTS colaborador_id INTEGER REFERENCES public.colaboradores(id) ON DELETE SET NULL;


-- 2. TABELA DE DESPESAS
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

-- Garantir que recria a política se ela já existir
DROP POLICY IF EXISTS tenant_despesas_policy ON public.despesas;
CREATE POLICY tenant_despesas_policy ON public.despesas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());


-- 3. FORMA DE PAGAMENTO EM ENTRADAS (NOTAS)
ALTER TABLE public.entradas ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50) DEFAULT 'Dinheiro';


-- 4. TABELA DE BOLETOS A PAGAR
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

-- Garantir que recria a política se ela já existir
DROP POLICY IF EXISTS tenant_boletos_pagar_policy ON public.boletos_pagar;
CREATE POLICY tenant_boletos_pagar_policy ON public.boletos_pagar
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
