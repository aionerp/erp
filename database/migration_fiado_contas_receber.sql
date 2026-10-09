-- ============================================================================
-- MIGRATION: Módulo Fiado e Contas a Receber
-- Tabelas: public.contas_receber e public.contas_receber_pagamentos
-- ============================================================================

-- 1. TABELA PRINCIPAL DE CONTAS A RECEBER (VENDAS FIADO / DAV)
CREATE TABLE IF NOT EXISTS public.contas_receber (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    saida_id INTEGER REFERENCES public.saidas(id) ON DELETE CASCADE,
    cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_cpf VARCHAR(20),
    cliente_telefone VARCHAR(50),
    numero_documento VARCHAR(100),
    data_venda DATE NOT NULL DEFAULT CURRENT_DATE,
    data_vencimento DATE,
    valor_original NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    valor_pago NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    saldo_devedor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'aver_na_conta', 'pago', 'cancelado')),
    data_quitacao TIMESTAMP WITH TIME ZONE,
    data_ultimo_pagamento TIMESTAMP WITH TIME ZONE,
    usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contas_receber_loja_id ON public.contas_receber(loja_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_saida_id ON public.contas_receber(saida_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente_id ON public.contas_receber(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON public.contas_receber(status);
CREATE INDEX IF NOT EXISTS idx_contas_receber_data_venda ON public.contas_receber(data_venda);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON public.contas_receber(data_vencimento);

-- 2. TABELA DE HISTÓRICO DE PAGAMENTOS / MOVIMENTAÇÕES (RECEBIMENTOS)
CREATE TABLE IF NOT EXISTS public.contas_receber_pagamentos (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    conta_receber_id INTEGER NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
    saida_id INTEGER REFERENCES public.saidas(id) ON DELETE CASCADE,
    cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    caixa_id INTEGER REFERENCES public.caixas(id) ON DELETE SET NULL,
    usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    tipo_operacao VARCHAR(50) NOT NULL CHECK (tipo_operacao IN ('venda_realizada', 'pagamento_inicial', 'pagamento_parcial', 'pagamento_final', 'estorno')),
    valor_pago NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    forma_pagamento VARCHAR(50) DEFAULT 'Dinheiro',
    saldo_anterior NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    saldo_apos NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    numero_documento VARCHAR(100),
    data_pagamento TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    observacao TEXT,
    cancelado BOOLEAN DEFAULT false,
    cancelado_em TIMESTAMP WITH TIME ZONE,
    cancelado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    motivo_cancelamento TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cr_pagamentos_loja_id ON public.contas_receber_pagamentos(loja_id);
CREATE INDEX IF NOT EXISTS idx_cr_pagamentos_conta_id ON public.contas_receber_pagamentos(conta_receber_id);
CREATE INDEX IF NOT EXISTS idx_cr_pagamentos_saida_id ON public.contas_receber_pagamentos(saida_id);
CREATE INDEX IF NOT EXISTS idx_cr_pagamentos_caixa_id ON public.contas_receber_pagamentos(caixa_id);
CREATE INDEX IF NOT EXISTS idx_cr_pagamentos_data ON public.contas_receber_pagamentos(data_pagamento);

-- 3. Habilitar RLS e Políticas Multi-Tenant se função existir
DO $$
BEGIN
    ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.contas_receber_pagamentos ENABLE ROW LEVEL SECURITY;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'obter_loja_id_requisicao') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_contas_receber_policy') THEN
            CREATE POLICY tenant_contas_receber_policy ON public.contas_receber
                FOR ALL USING (loja_id = public.obter_loja_id_requisicao() OR public.obter_loja_id_requisicao() IS NULL);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_contas_receber_pagamentos_policy') THEN
            CREATE POLICY tenant_contas_receber_pagamentos_policy ON public.contas_receber_pagamentos
                FOR ALL USING (loja_id = public.obter_loja_id_requisicao() OR public.obter_loja_id_requisicao() IS NULL);
        END IF;
    END IF;
END $$;

-- 4. Garantir colunas necessárias na tabela saidas
ALTER TABLE public.saidas ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(255);
ALTER TABLE public.saidas ADD COLUMN IF NOT EXISTS cliente_cpf VARCHAR(20);
ALTER TABLE public.saidas ADD COLUMN IF NOT EXISTS caixa_id INTEGER REFERENCES public.caixas(id) ON DELETE SET NULL;

