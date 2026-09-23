-- ============================================================================
-- SCHEMA COMPLETO UNIFICADO - AION ERP (EXECUÇÃO ÚNICA PARA NOVOS CLIENTES)
-- ============================================================================
-- Este script provisiona de uma única vez 100% da estrutura do banco de dados
-- PostgreSQL / Neon para novas instâncias do Aion ERP.
--
-- Inclui:
--   • 21 tabelas completas com todas as colunas, restrições e foreign keys
--   • Módulos: Vendas, Estoque, Seriais/IMEI, Lotes/Validade, Recorrência/Assinaturas,
--     Promoções, Comissões, Agendamentos, Mesas & Comandas, Financeiro e Caixa
--   • Triggers automáticos de criptografia de senhas (bcrypt/blowfish)
--   • Funções RPC (autenticação segura, verificação de loja, primeiro acesso)
--   • Índices de performance e Políticas de Isolamento Multi-loja (RLS)
--   • Permissões completas para as roles do sistema
--   • Carga inicial padrão (Loja Matriz, Configurações e Produto Padrão de Recorrência)
--
-- Como executar no Neon:
--   Basta abrir o SQL Editor no console do Neon (ou ferramenta pgAdmin/DBeaver)
--   e executar este arquivo inteiro. Tempo estimado: < 3 segundos.
-- ============================================================================

-- 0. Habilitar extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 0.1 Garantir roles padrão compatíveis (PostgREST / Supabase / Neon)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END
$$;

-- 0.2 Limpeza prévia para garantir execução limpa caso reexecutado
DROP VIEW IF EXISTS public.produtos_serial CASCADE;
DROP TABLE IF EXISTS public.servicos_recorrentes CASCADE;
DROP TABLE IF EXISTS public.promocao_produtos CASCADE;
DROP TABLE IF EXISTS public.promocoes CASCADE;
DROP TABLE IF EXISTS public.mesas_comandas CASCADE;
DROP TABLE IF EXISTS public.agendamentos CASCADE;
DROP TABLE IF EXISTS public.config_loja CASCADE;
DROP TABLE IF EXISTS public.movimentos_estoque CASCADE;
DROP TABLE IF EXISTS public.boletos_pagar CASCADE;
DROP TABLE IF EXISTS public.despesas CASCADE;
DROP TABLE IF EXISTS public.saida_itens CASCADE;
DROP TABLE IF EXISTS public.saidas CASCADE;
DROP TABLE IF EXISTS public.caixas CASCADE;
DROP TABLE IF EXISTS public.entrada_itens CASCADE;
DROP TABLE IF EXISTS public.entradas CASCADE;
DROP TABLE IF EXISTS public.produtos_seriais CASCADE;
DROP TABLE IF EXISTS public.produtos CASCADE;
DROP TABLE IF EXISTS public.colaboradores CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;
DROP TABLE IF EXISTS public.categorias CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.lojas CASCADE;

-- ============================================================================
-- 1. TABELA DE LOJAS (TENANTS)
-- ============================================================================
CREATE TABLE public.lojas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    segmento VARCHAR(50) NOT NULL DEFAULT 'geral' CHECK (segmento IN ('eletronico', 'mercado', 'estetica', 'restaurante', 'bijuteria', 'geral')),
    cnpj VARCHAR(20),
    telefone VARCHAR(20),
    endereco TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 2. TABELA DE USUÁRIOS
-- ============================================================================
CREATE TABLE public.usuarios (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    perfil VARCHAR(50) NOT NULL DEFAULT 'basico',
    nivel_acesso VARCHAR(50) DEFAULT 'basico',
    permissoes JSONB DEFAULT '{}'::jsonb,
    cargo VARCHAR(100),
    telefone VARCHAR(20),
    ativo BOOLEAN DEFAULT true NOT NULL,
    ultimo_acesso TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_email_per_loja UNIQUE (email)
);

-- Trigger para Criptografar Senhas com Bcrypt (Blowfish) Automaticamente
CREATE OR REPLACE FUNCTION public.fn_criptografar_senha_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.senha IS DISTINCT FROM OLD.senha)) THEN
        IF NEW.senha IS NOT NULL AND length(NEW.senha) > 0 THEN
            IF NOT (NEW.senha ~ '^\$2[abxy]\$[0-9]{2}\$[A-Za-z0-9\.\/]{53}$' OR NEW.senha ~ '^[a-fA-F0-9]{64}$') THEN
                NEW.senha := crypt(NEW.senha, gen_salt('bf', 10));
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criptografar_senha_usuario ON public.usuarios;
CREATE TRIGGER trg_criptografar_senha_usuario
    BEFORE INSERT OR UPDATE OF senha ON public.usuarios
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_criptografar_senha_usuario();

-- ============================================================================
-- 3. TABELA DE CATEGORIAS
-- ============================================================================
CREATE TABLE public.categorias (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    exige_imei BOOLEAN DEFAULT false,
    exige_serial BOOLEAN DEFAULT false,
    controla_lote_validade BOOLEAN DEFAULT false,
    aviso_vencimento_dias INTEGER DEFAULT 30,
    ativo BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 4. TABELA DE CLIENTES E FORNECEDORES
-- ============================================================================
CREATE TABLE public.clientes (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cpf_cnpj VARCHAR(20),
    tipo VARCHAR(20) DEFAULT 'pf' CHECK (tipo IN ('pf', 'pj', 'fornecedor')),
    telefone VARCHAR(50),
    email VARCHAR(255),
    cep VARCHAR(10),
    logradouro VARCHAR(255),
    numero VARCHAR(50),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado VARCHAR(2),
    observacoes TEXT,
    ativo BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 5. TABELA DE COLABORADORES (VENDEDORES / TÉCNICOS)
-- ============================================================================
CREATE TABLE public.colaboradores (
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

-- ============================================================================
-- 6. TABELA DE PRODUTOS E SERVIÇOS
-- ============================================================================
CREATE TABLE public.produtos (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    codigo VARCHAR(100),
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'produto' CHECK (tipo IN ('produto', 'servico')),
    categoria VARCHAR(255),
    categoria_id INTEGER REFERENCES public.categorias(id) ON DELETE SET NULL,
    marca VARCHAR(255),
    modelo VARCHAR(255),
    descricao TEXT,
    valor_compra NUMERIC(10, 2) DEFAULT 0.00,
    valor_venda NUMERIC(10, 2) DEFAULT 0.01,
    estoque INTEGER DEFAULT 0,
    estoque_total INTEGER DEFAULT 0,
    estoque_minimo INTEGER DEFAULT 5,
    garantia_dias INTEGER DEFAULT 0,
    imagem TEXT,
    ativo BOOLEAN DEFAULT true,
    ultima_movimentacao TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Lote e Validade
    data_validade DATE,
    lote VARCHAR(100),
    alerta_vencimento_dias INTEGER DEFAULT 30,
    lotes JSONB DEFAULT '[]'::jsonb,
    
    -- Múltiplos Códigos de Barras
    codigos_barras JSONB DEFAULT '[]'::jsonb,
    
    -- Comissões para serviços
    comissao_habilitada BOOLEAN DEFAULT false,
    comissao_100_porcento BOOLEAN DEFAULT true,
    comissao_valor NUMERIC DEFAULT 0,
    
    -- Planos e Assinaturas Recorrentes
    is_recorrente BOOLEAN DEFAULT false,
    plano_nome VARCHAR(255),
    plano_frequencia VARCHAR(50),
    plano_cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    plano_data_vencimento DATE,
    plano_valor NUMERIC(10, 2),

    CONSTRAINT check_valor_venda_minimo CHECK (valor_venda >= 0.01)
);

-- ============================================================================
-- 7. TABELA DE PRODUTOS SERIAIS (IMEI / SERIAL INDIVIDUAL)
-- ============================================================================
CREATE TABLE public.produtos_seriais (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    numero_serie VARCHAR(100),
    serial VARCHAR(100),
    imei VARCHAR(100),
    status VARCHAR(50) DEFAULT 'disponivel',
    disponivel BOOLEAN DEFAULT true,
    data_entrada TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_saida TIMESTAMP WITH TIME ZONE,
    valor_compra NUMERIC(10, 2) DEFAULT 0.00,
    valor_venda NUMERIC(10, 2) DEFAULT 0.00
);

-- ============================================================================
-- 8. TABELA DE ENTRADAS (COMPRAS DE FORNECEDORES / NOTAS)
-- ============================================================================
CREATE TABLE public.entradas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    numero_nota VARCHAR(100),
    serie VARCHAR(50),
    chave_acesso VARCHAR(100),
    fornecedor_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    data_entrada TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    valor_produtos NUMERIC(10, 2) DEFAULT 0.00,
    valor_frete NUMERIC(10, 2) DEFAULT 0.00,
    valor_seguro NUMERIC(10, 2) DEFAULT 0.00,
    outras_despesas NUMERIC(10, 2) DEFAULT 0.00,
    valor_total NUMERIC(10, 2) DEFAULT 0.00,
    observacoes TEXT,
    forma_pagamento VARCHAR(50) DEFAULT 'Dinheiro',
    data DATE DEFAULT CURRENT_DATE,
    total NUMERIC(10, 2) DEFAULT 0.00,
    observacao TEXT
);

-- ============================================================================
-- 9. ITENS DE ENTRADA (PRODUTOS COMPRADOS)
-- ============================================================================
CREATE TABLE public.entrada_itens (
    id SERIAL PRIMARY KEY,
    entrada_id INTEGER NOT NULL REFERENCES public.entradas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL
);

-- ============================================================================
-- 10. TABELA DE CAIXAS (ABERTURA E FECHAMENTO DIÁRIO)
-- ============================================================================
CREATE TABLE public.caixas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    data_abertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_fechamento TIMESTAMP WITH TIME ZONE,
    saldo_inicial NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    saldo_final NUMERIC(10, 2),
    status VARCHAR(50) DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
    usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL
);

-- ============================================================================
-- 11. TABELA DE SAÍDAS (VENDAS / PDV / MOVIMENTAÇÃO DE SAÍDA)
-- ============================================================================
CREATE TABLE public.saidas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    total NUMERIC(10, 2) DEFAULT 0.00,
    desconto NUMERIC(10, 2) DEFAULT 0.00,
    forma_pagamento VARCHAR(50),
    cancelado BOOLEAN DEFAULT false,
    cancelado_em TIMESTAMP WITH TIME ZONE,
    cancelado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    motivo_cancelamento TEXT,
    data_finalizacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    observacao TEXT,
    caixa_id INTEGER REFERENCES public.caixas(id) ON DELETE SET NULL,
    colaborador_id INTEGER REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    cliente_nome VARCHAR(255),
    cliente_cpf VARCHAR(20),
    comissao_calculada NUMERIC DEFAULT 0,
    comissao_paga BOOLEAN DEFAULT false,
    comissao_paga_data TIMESTAMP WITH TIME ZONE,
    origem_desconto VARCHAR(255)
);

-- ============================================================================
-- 12. ITENS DE SAÍDA (ITENS VENDIDOS)
-- ============================================================================
CREATE TABLE public.saida_itens (
    id SERIAL PRIMARY KEY,
    saida_id INTEGER NOT NULL REFERENCES public.saidas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL CHECK (quantidade != 0),
    valor_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    serial_id INTEGER REFERENCES public.produtos_seriais(id) ON DELETE SET NULL,
    serial VARCHAR(100),
    imei VARCHAR(100),
    desconto NUMERIC(10, 2) DEFAULT 0.00,
    origem_desconto VARCHAR(255),
    promocao_id INTEGER
);

-- ============================================================================
-- 13. TABELA DE DESPESAS GERAIS
-- ============================================================================
CREATE TABLE public.despesas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    categoria VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pago' CHECK (status IN ('pago', 'pendente')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 14. TABELA DE BOLETOS A PAGAR
-- ============================================================================
CREATE TABLE public.boletos_pagar (
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

-- ============================================================================
-- 15. TABELA DE MOVIMENTAÇÕES DE ESTOQUE (LOG DE AUDITORIA)
-- ============================================================================
CREATE TABLE public.movimentos_estoque (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'devolucao')),
    quantidade INTEGER NOT NULL,
    motivo TEXT,
    data TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL
);

-- ============================================================================
-- 16. TABELA DE CONFIGURAÇÕES DE RECURSOS E DADOS DA LOJA
-- ============================================================================
CREATE TABLE public.config_loja (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL UNIQUE REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome_fantasia VARCHAR(255),
    razao_social VARCHAR(255),
    cnpj VARCHAR(20),
    telefone VARCHAR(20),
    email VARCHAR(255),
    endereco TEXT,
    logo_url TEXT,
    habilitar_seriais BOOLEAN DEFAULT true,
    habilitar_agendamentos BOOLEAN DEFAULT false,
    habilitar_mesas BOOLEAN DEFAULT false,
    habilitar_lotes BOOLEAN DEFAULT false,
    habilitar_variacoes BOOLEAN DEFAULT false,
    permitir_venda_sem_saldo BOOLEAN DEFAULT false,
    termo_garantia TEXT,
    termo_troca TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 17. TABELA DE AGENDAMENTOS (NICHO ESTÉTICA / BELEZA / SERVIÇOS)
-- ============================================================================
CREATE TABLE public.agendamentos (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    cliente_id INTEGER NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    profissional_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    servico_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    data_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'agendado' CHECK (status IN ('agendado', 'confirmado', 'concluido', 'cancelado')),
    valor NUMERIC(10, 2) NOT NULL,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 18. TABELA DE MESAS E COMANDAS (NICHO RESTAURANTES / BARES)
-- ============================================================================
CREATE TABLE public.mesas_comandas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    numero VARCHAR(50) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('mesa', 'comanda', 'servico')),
    status VARCHAR(50) DEFAULT 'livre' CHECK (status IN ('livre', 'ocupada', 'fechando')),
    valor_acumulado NUMERIC(10, 2) DEFAULT 0.00,
    itens_carrinho JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_numero_tipo_por_loja UNIQUE (loja_id, numero, tipo)
);

-- ============================================================================
-- 19. TABELA DE AÇÕES PROMOCIONAIS E DESCONTOS
-- ============================================================================
CREATE TABLE public.promocoes (
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

CREATE TABLE public.promocao_produtos (
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

-- ============================================================================
-- 20. TABELA DE SERVIÇOS RECORRENTES & ASSINATURAS (CONTRATOS)
-- ============================================================================
CREATE TABLE public.servicos_recorrentes (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL DEFAULT 1 REFERENCES public.lojas(id) ON DELETE CASCADE,
    produto_id INTEGER REFERENCES public.produtos(id) ON DELETE SET NULL,
    cliente_id INTEGER NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    plano_nome VARCHAR(255) NOT NULL,
    frequencia VARCHAR(50) NOT NULL DEFAULT 'mensal' CHECK (frequencia IN ('semanal', 'mensal', 'trimestral', 'semestral', 'anual')),
    valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_vencimento DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pendente', 'cancelado', 'suspenso')),
    observacao TEXT,
    data_ultimo_pagamento DATE,
    ultima_saida_id INTEGER REFERENCES public.saidas(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Foreign key de promocao_id em saida_itens
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_saida_itens_promocao'
    ) THEN
        ALTER TABLE public.saida_itens
            ADD CONSTRAINT fk_saida_itens_promocao FOREIGN KEY (promocao_id) REFERENCES public.promocoes(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- 21. VIEW DE COMPATIBILIDADE: PRODUTOS_SERIAL
-- ============================================================================
CREATE OR REPLACE VIEW public.produtos_serial AS
SELECT 
    ps.id,
    ps.produto_id,
    p.codigo AS produto_codigo,
    p.nome AS produto_nome,
    ps.numero_serie,
    ps.serial,
    ps.imei,
    ps.status,
    ps.disponivel,
    ps.data_entrada,
    ps.data_saida,
    ps.valor_compra,
    ps.valor_venda,
    p.loja_id
FROM public.produtos_seriais ps
JOIN public.produtos p ON p.id = ps.produto_id;

-- ============================================================================
-- 22. ÍNDICES DE PERFORMANCE E PESQUISA
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_loja ON public.usuarios(loja_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_categorias_loja ON public.categorias(loja_id);
CREATE INDEX IF NOT EXISTS idx_clientes_loja ON public.clientes(loja_id);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf_cnpj ON public.clientes(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_colaboradores_loja ON public.colaboradores(loja_id);
CREATE INDEX IF NOT EXISTS idx_produtos_loja ON public.produtos(loja_id);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON public.produtos(codigo);
CREATE INDEX IF NOT EXISTS idx_produtos_nome ON public.produtos(nome);
CREATE INDEX IF NOT EXISTS idx_produtos_seriais_prod ON public.produtos_seriais(produto_id);
CREATE INDEX IF NOT EXISTS idx_produtos_seriais_num ON public.produtos_seriais(numero_serie);
CREATE INDEX IF NOT EXISTS idx_entradas_loja ON public.entradas(loja_id);
CREATE INDEX IF NOT EXISTS idx_entrada_itens_entrada ON public.entrada_itens(entrada_id);
CREATE INDEX IF NOT EXISTS idx_caixas_loja ON public.caixas(loja_id);
CREATE INDEX IF NOT EXISTS idx_saidas_loja ON public.saidas(loja_id);
CREATE INDEX IF NOT EXISTS idx_saidas_data ON public.saidas(data);
CREATE INDEX IF NOT EXISTS idx_saida_itens_saida ON public.saida_itens(saida_id);
CREATE INDEX IF NOT EXISTS idx_despesas_loja ON public.despesas(loja_id);
CREATE INDEX IF NOT EXISTS idx_boletos_pagar_loja ON public.boletos_pagar(loja_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_prod ON public.movimentos_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_loja ON public.agendamentos(loja_id);
CREATE INDEX IF NOT EXISTS idx_mesas_comandas_loja ON public.mesas_comandas(loja_id);
CREATE INDEX IF NOT EXISTS idx_promocoes_loja ON public.promocoes(loja_id);
CREATE INDEX IF NOT EXISTS idx_servicos_recorrentes_loja ON public.servicos_recorrentes(loja_id);
CREATE INDEX IF NOT EXISTS idx_servicos_recorrentes_cliente ON public.servicos_recorrentes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_servicos_recorrentes_venc ON public.servicos_recorrentes(data_vencimento);

-- ============================================================================
-- 23. FUNÇÕES UTILITÁRIAS & RLS (ISOLAMENTO MULTI-TENANT)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.obter_loja_id_requisicao()
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_loja_id integer;
    v_header_tenant text;
BEGIN
    BEGIN
        v_header_tenant := current_setting('request.headers', true)::json->>'x-tenant-id';
        IF v_header_tenant IS NOT NULL AND v_header_tenant <> '' THEN
            RETURN v_header_tenant::integer;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
        v_loja_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'loja_id')::integer;
        IF v_loja_id IS NOT NULL THEN
            RETURN v_loja_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN 1;
END;
$$;

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_seriais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrada_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saida_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletos_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas_comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocao_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos_recorrentes ENABLE ROW LEVEL SECURITY;

-- Políticas de isolamento por loja_id
CREATE POLICY tenant_lojas_policy ON public.lojas FOR ALL USING (id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_usuarios_policy ON public.usuarios FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_categorias_policy ON public.categorias FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_clientes_policy ON public.clientes FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_colaboradores_policy ON public.colaboradores FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_produtos_policy ON public.produtos FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_entradas_policy ON public.entradas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_caixas_policy ON public.caixas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_saidas_policy ON public.saidas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_despesas_policy ON public.despesas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_boletos_pagar_policy ON public.boletos_pagar FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_movimentos_estoque_policy ON public.movimentos_estoque FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_config_loja_policy ON public.config_loja FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_agendamentos_policy ON public.agendamentos FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_mesas_comandas_policy ON public.mesas_comandas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_promocoes_policy ON public.promocoes FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_promocao_produtos_policy ON public.promocao_produtos FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_servicos_recorrentes_policy ON public.servicos_recorrentes FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_produtos_seriais_policy ON public.produtos_seriais FOR ALL USING (
    EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id AND p.loja_id = public.obter_loja_id_requisicao())
);

CREATE POLICY tenant_entrada_itens_policy ON public.entrada_itens FOR ALL USING (
    EXISTS (SELECT 1 FROM public.entradas e WHERE e.id = entrada_id AND e.loja_id = public.obter_loja_id_requisicao())
);

CREATE POLICY tenant_saida_itens_policy ON public.saida_itens FOR ALL USING (
    EXISTS (SELECT 1 FROM public.saidas s WHERE s.id = saida_id AND s.loja_id = public.obter_loja_id_requisicao())
);

-- ============================================================================
-- 24. FUNÇÃO RPC: AUTENTICAÇÃO SEGURA DE USUÁRIOS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.autenticar_usuario(p_email text, p_senha text)
RETURNS TABLE (
    id integer,
    nome varchar,
    email varchar,
    perfil varchar,
    nivel_acesso varchar,
    ativo boolean,
    permissoes jsonb,
    loja_id integer,
    loja_nome varchar,
    loja_segmento varchar,
    config_loja jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id, 
        u.nome, 
        u.email, 
        u.perfil, 
        u.nivel_acesso, 
        u.ativo, 
        u.permissoes, 
        u.loja_id,
        l.nome as loja_nome,
        l.segmento as loja_segmento,
        jsonb_build_object(
            'nome_fantasia', c.nome_fantasia,
            'razao_social', c.razao_social,
            'cnpj', c.cnpj,
            'telefone', c.telefone,
            'email', c.email,
            'endereco', c.endereco,
            'habilitar_seriais', coalesce(c.habilitar_seriais, true),
            'habilitar_agendamentos', coalesce(c.habilitar_agendamentos, false),
            'habilitar_mesas', coalesce(c.habilitar_mesas, false),
            'habilitar_lotes', coalesce(c.habilitar_lotes, true),
            'habilitar_variacoes', coalesce(c.habilitar_variacoes, false),
            'permitir_venda_sem_saldo', coalesce(c.permitir_venda_sem_saldo, false),
            'termo_garantia', c.termo_garantia,
            'termo_troca', c.termo_troca
        ) as config_loja
    FROM public.usuarios u
    JOIN public.lojas l ON l.id = u.loja_id
    LEFT JOIN public.config_loja c ON c.loja_id = u.loja_id
    WHERE u.email = p_email 
      AND (
          u.senha = crypt(p_senha, u.senha)
          OR u.senha = encode(digest(p_senha, 'sha256'), 'hex')
          OR u.senha = p_senha
      )
      AND u.ativo = true;
END;
$$;

-- ============================================================================
-- 25. FUNÇÃO RPC: VERIFICAR STATUS DA LOJA / ONBOARDING
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verificar_status_loja(p_cnpj text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_cnpj text;
    v_qtd_usuarios integer;
    v_qtd_lojas integer;
    v_loja_nome text;
    v_usuario_adm text;
BEGIN
    v_clean_cnpj := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');

    SELECT COUNT(*), (ARRAY_AGG(email))[1]
    INTO v_qtd_usuarios, v_usuario_adm
    FROM public.usuarios
    WHERE ativo = true;

    SELECT COUNT(*), (ARRAY_AGG(nome))[1]
    INTO v_qtd_lojas, v_loja_nome
    FROM public.lojas;

    IF coalesce(v_qtd_usuarios, 0) > 0 OR coalesce(v_qtd_lojas, 0) > 0 THEN
        RETURN jsonb_build_object(
            'loja_ativa', true,
            'permite_onboarding', false,
            'qtd_usuarios', v_qtd_usuarios,
            'usuario_adm', v_usuario_adm,
            'loja_nome', v_loja_nome,
            'mensagem', 'Acesso Negado (Loja já ativada). Acione o supervisor do seu sistema.'
        );
    ELSE
        RETURN jsonb_build_object(
            'loja_ativa', false,
            'permite_onboarding', true,
            'qtd_usuarios', 0,
            'mensagem', 'Loja disponível para primeiro acesso.'
        );
    END IF;
END;
$$;

-- ============================================================================
-- 26. FUNÇÃO RPC: REGISTRAR PRIMEIRO ACESSO COM TRAVA DE SEGURANÇA
-- ============================================================================
CREATE OR REPLACE FUNCTION public.registrar_primeiro_acesso(
    p_razao_social text,
    p_nome_fantasia text,
    p_cnpj text,
    p_segmento text,
    p_telefone text,
    p_email text,
    p_endereco text,
    p_usuario_adm text,
    p_nome_adm text,
    p_senha_adm text,
    p_features jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loja_id integer;
    v_usuario_id integer;
    v_permissoes jsonb;
    v_clean_cnpj text;
BEGIN
    v_clean_cnpj := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');

    IF EXISTS (SELECT 1 FROM public.usuarios WHERE email = p_usuario_adm) THEN
        RAISE EXCEPTION 'TRAVA_SEGURANCA: O usuário % já existe no banco de dados.', p_usuario_adm;
    END IF;

    IF v_clean_cnpj <> '' AND EXISTS (SELECT 1 FROM public.lojas WHERE regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_clean_cnpj) THEN
        RAISE EXCEPTION 'TRAVA_SEGURANCA: O CNPJ % já foi cadastrado no banco de dados.', p_cnpj;
    END IF;

    INSERT INTO public.lojas (nome, segmento, cnpj, telefone, endereco)
    VALUES (p_razao_social, coalesce(p_segmento, 'geral'), p_cnpj, p_telefone, p_endereco)
    RETURNING id INTO v_loja_id;

    INSERT INTO public.config_loja (
        loja_id, nome_fantasia, razao_social, cnpj, telefone, email, endereco,
        habilitar_seriais, habilitar_agendamentos, habilitar_mesas, habilitar_lotes, habilitar_variacoes,
        permitir_venda_sem_saldo
    ) VALUES (
        v_loja_id,
        coalesce(p_nome_fantasia, p_razao_social),
        p_razao_social,
        p_cnpj,
        p_telefone,
        p_email,
        p_endereco,
        coalesce((p_features->>'habilitar_seriais')::boolean, true),
        coalesce((p_features->>'habilitar_agendamentos')::boolean, false),
        coalesce((p_features->>'habilitar_mesas')::boolean, false),
        coalesce((p_features->>'habilitar_lotes')::boolean, true),
        coalesce((p_features->>'habilitar_variacoes')::boolean, false),
        coalesce((p_features->>'permitir_venda_sem_saldo')::boolean, false)
    );

    v_permissoes := '{
        "dashboard": { "ver": true },
        "clientes": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "produtos": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "categorias": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "estoque": { "ver": true, "ajustar": true },
        "entradas": { "ver": true, "criar": true, "excluir": true },
        "saidas": { "ver": true, "criar": true, "cancelar": true, "ver_vendas_outros": true },
        "assinaturas": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "fornecedores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "ordens_servico": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "colaboradores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "financeiro": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "relatorios": { "ver": true, "exportar": true },
        "usuarios": { "ver": true, "criar": true, "editar": true, "excluir": true }
    }'::jsonb;

    INSERT INTO public.usuarios (loja_id, nome, email, senha, perfil, nivel_acesso, permissoes, ativo)
    VALUES (v_loja_id, p_nome_adm, p_usuario_adm, p_senha_adm, 'admin', 'admin', v_permissoes, true)
    RETURNING id INTO v_usuario_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'loja_id', v_loja_id,
        'usuario_id', v_usuario_id,
        'usuario', p_usuario_adm
    );
END;
$$;

-- ============================================================================
-- 27. PERMISSÕES PARA AS ROLES DO BANCO (ANON, AUTHENTICATED, SERVICE_ROLE)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ============================================================================
-- 28. CARGA INICIAL PADRÃO (SEEDS PARA NOVA INSTÂNCIA)
-- ============================================================================
-- 28.1 Criar Loja Matriz Inicial (ID 1)
INSERT INTO public.lojas (id, nome, segmento, cnpj, telefone)
VALUES (1, 'Loja Matriz', 'geral', '12.345.678/0001-90', '(11) 99999-9999')
ON CONFLICT (id) DO NOTHING;

-- 28.2 Criar Configurações da Loja Matriz
INSERT INTO public.config_loja (
    loja_id, nome_fantasia, razao_social, cnpj, 
    habilitar_seriais, habilitar_agendamentos, habilitar_mesas, habilitar_lotes, habilitar_variacoes, permitir_venda_sem_saldo
)
VALUES (
    1, 'Loja Matriz', 'Loja Matriz LTDA', '12.345.678/0001-90',
    true, false, false, true, false, false
)
ON CONFLICT (loja_id) DO NOTHING;

-- 28.3 Criar Usuário Administrador Padrão (adm.padrao / senha: 123)
-- (Pode ser alterado na tela de Usuários ou no Primeiro Acesso)
INSERT INTO public.usuarios (loja_id, nome, email, senha, perfil, nivel_acesso, permissoes, ativo)
VALUES (
    1,
    'Administrador',
    'adm.padrao',
    '123',
    'admin',
    'admin',
    '{
        "dashboard": { "ver": true },
        "clientes": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "produtos": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "categorias": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "estoque": { "ver": true, "ajustar": true },
        "entradas": { "ver": true, "criar": true, "excluir": true },
        "saidas": { "ver": true, "criar": true, "cancelar": true, "ver_vendas_outros": true },
        "assinaturas": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "fornecedores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "ordens_servico": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "colaboradores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "financeiro": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "relatorios": { "ver": true, "exportar": true },
        "usuarios": { "ver": true, "criar": true, "editar": true, "excluir": true }
    }'::jsonb,
    true
)
ON CONFLICT (email) DO NOTHING;

-- 28.4 Criar Produto de Serviço Padrão para Quitação de Mensalidades Recorrentes
INSERT INTO public.produtos (
    loja_id, codigo, nome, tipo, valor_venda, valor_compra, estoque, estoque_total, ativo
)
VALUES (
    1, 'REC-MENSALIDADE', 'Mensalidade de Serviço Recorrente', 'servico', 0.01, 0.00, 0, 0, true
)
ON CONFLICT DO NOTHING;

-- 28.5 Atualizar os ponteiros das sequences para evitar colisões
SELECT setval('public.lojas_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.lojas));
SELECT setval('public.usuarios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.usuarios));
SELECT setval('public.produtos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.produtos));
SELECT setval('public.config_loja_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.config_loja));

-- ============================================================================
-- FIM DO SCRIPT UNIFICADO: BANCO DE DADOS TOTALMENTE PRONTO PARA USO!
-- ============================================================================