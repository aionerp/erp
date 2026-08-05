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


-- 5. CÓDIGOS DE BARRAS MÚLTIPLOS EM PRODUTOS
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS codigos_barras JSONB DEFAULT '[]'::jsonb;


-- 6. COMISSÕES DE PRODUTOS E VENDAS
ALTER TABLE public.produtos 
    ADD COLUMN IF NOT EXISTS comissao_habilitada BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS comissao_100_porcento BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS comissao_valor NUMERIC DEFAULT 0;

ALTER TABLE public.saidas 
    ADD COLUMN IF NOT EXISTS comissao_calculada NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comissao_paga BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS comissao_paga_data TIMESTAMP WITH TIME ZONE;


-- 7. CONTROLE DE LOTE E VALIDADE POR CATEGORIA E PRODUTOS
ALTER TABLE public.categorias 
    ADD COLUMN IF NOT EXISTS controla_lote_validade BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS aviso_vencimento_dias INTEGER DEFAULT 30;

ALTER TABLE public.produtos 
    ADD COLUMN IF NOT EXISTS data_validade DATE,
    ADD COLUMN IF NOT EXISTS lote VARCHAR(100),
    ADD COLUMN IF NOT EXISTS alerta_vencimento_dias INTEGER DEFAULT 30;


-- 8. TERMOS DE GARANTIA E TROCA NA CONFIGURAÇÃO DA LOJA
ALTER TABLE public.config_loja 
    ADD COLUMN IF NOT EXISTS termo_garantia TEXT,
    ADD COLUMN IF NOT EXISTS termo_troca TEXT;
