-- ======================================================================
-- MIGRAÇÃO: AÇÕES PROMOCIONAIS E REGRA DE PREÇO MÍNIMO DE VENDA (R$ 0,01)
-- Execute estes comandos no SQL Editor do painel do Supabase
-- ======================================================================

-- 1. REGRA DE NEGÓCIO: PREÇO DE VENDA NUNCA PODE SER MENOR QUE R$ 0,01
-- Atualiza produtos existentes que eventualmente estejam com zero para 0.01
UPDATE public.produtos SET valor_venda = 0.01 WHERE valor_venda < 0.01;

-- Adiciona restrição de validação para impedir preço de venda zerado
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_valor_venda_minimo'
    ) THEN
        ALTER TABLE public.produtos ADD CONSTRAINT check_valor_venda_minimo CHECK (valor_venda >= 0.01);
    END IF;
END $$;


-- 2. TABELA DE AÇÕES PROMOCIONAIS
CREATE TABLE IF NOT EXISTS public.promocoes (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo_desconto VARCHAR(50) DEFAULT 'porcentagem' CHECK (tipo_desconto IN ('porcentagem', 'valor_fixo')),
    valor_desconto NUMERIC(10, 2) DEFAULT 0.00,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim DATE,
    ativo BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar RLS em promocoes
ALTER TABLE public.promocoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_promocoes_policy ON public.promocoes;
CREATE POLICY tenant_promocoes_policy ON public.promocoes
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());


-- 3. TABELA DE PRODUTOS DA AÇÃO PROMOCIONAL
CREATE TABLE IF NOT EXISTS public.promocao_produtos (
    id SERIAL PRIMARY KEY,
    promocao_id INTEGER NOT NULL REFERENCES public.promocoes(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    tipo_desconto VARCHAR(50) DEFAULT 'porcentagem' CHECK (tipo_desconto IN ('porcentagem', 'valor_fixo', 'preco_fixo')),
    valor_desconto NUMERIC(10, 2) NOT NULL,
    ativo BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_promocao_produto UNIQUE (promocao_id, produto_id)
);

-- Habilitar RLS em promocao_produtos
ALTER TABLE public.promocao_produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_promocao_produtos_policy ON public.promocao_produtos;
CREATE POLICY tenant_promocao_produtos_policy ON public.promocao_produtos
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());


-- 4. CAMPOS DE DESCONTO E ORIGEM NA TABELA DE ITENS DE SAÍDA
ALTER TABLE public.saida_itens 
    ADD COLUMN IF NOT EXISTS desconto NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS origem_desconto VARCHAR(255),
    ADD COLUMN IF NOT EXISTS promocao_id INTEGER REFERENCES public.promocoes(id) ON DELETE SET NULL;

-- 5. CAMPO DE ORIGEM DO DESCONTO NA TABELA DE SAÍDAS (VENDAS)
ALTER TABLE public.saidas 
    ADD COLUMN IF NOT EXISTS origem_desconto VARCHAR(255);
