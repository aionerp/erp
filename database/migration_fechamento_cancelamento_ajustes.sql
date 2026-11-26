-- ============================================================================
-- MIGRAÇÃO: Relatório de Fechamento de Caixa, Cancelamento e Ajustes de Valores
-- ============================================================================

ALTER TABLE public.caixas
    ADD COLUMN IF NOT EXISTS saldo_esperado NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS diferenca_caixa NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS ajustes_fechamento JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS observacao_fechamento TEXT,
    ADD COLUMN IF NOT EXISTS cancelado BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cancelado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT,
    ADD COLUMN IF NOT EXISTS historico_fechamentos JSONB DEFAULT '[]'::jsonb;

-- Garantir que usuario_abertura_id e usuario_fechamento_id existam (para bancos legados)
ALTER TABLE public.caixas
    ADD COLUMN IF NOT EXISTS usuario_abertura_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS usuario_fechamento_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- Atualizar constraint de status permitindo 'aberto', 'fechado' e 'cancelado'
ALTER TABLE public.caixas DROP CONSTRAINT IF EXISTS caixas_status_check;
ALTER TABLE public.caixas ADD CONSTRAINT caixas_status_check CHECK (status IN ('aberto', 'fechado', 'cancelado'));
