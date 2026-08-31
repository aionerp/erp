-- ============================================================================
-- SCHEMA COMPLETO DE BANCO DE DADOS - AION ERP (PRONTO PARA NOVOS CLIENTES)
-- ============================================================================
-- Este arquivo cria toda a estrutura de tabelas, funções, RLS (Row Level Security),
-- views e políticas necessárias para instalar e isolar multi-lojas (tenants)
-- do repositório Aion ERP.
--
-- Para criar uma nova empresa isolada, basta rodar este script no Supabase 
-- e criar os registros correspondentes na tabela 'lojas' e 'usuarios'.
-- ============================================================================

-- Habilitar extensão pgcrypto se necessário
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpar tabelas anteriores se existirem (para instalação limpa)
DROP VIEW IF EXISTS public.produtos_serial CASCADE;
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

-- 1. TABELA DE LOJAS (TENANTS)
CREATE TABLE public.lojas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    segmento VARCHAR(50) NOT NULL CHECK (segmento IN ('eletronico', 'mercado', 'estetica', 'restaurante', 'bijuteria')),
    cnpj VARCHAR(20),
    telefone VARCHAR(20),
    endereco TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABELA DE USUÁRIOS
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
            -- Se a senha não estiver no formato bcrypt ($2a$, $2b$) ou hash sha256 (64 chars hex)
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

-- 3. TABELA DE CATEGORIAS
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 4. TABELA DE CLIENTES E FORNECEDORES (Unificada)
CREATE TABLE public.clientes (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) DEFAULT 'cliente' CHECK (tipo IN ('cliente', 'fornecedor')),
    cpf_cnpj VARCHAR(20),
    documento VARCHAR(50),
    telefone VARCHAR(20),
    email VARCHAR(255),
    endereco TEXT,
    numero VARCHAR(20),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado VARCHAR(50),
    cep VARCHAR(20),
    observacao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. TABELA DE COLABORADORES (COMISSIONADOS / VENDEDORES / TÉCNICOS)
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

-- 6. TABELA DE PRODUTOS E SERVIÇOS
CREATE TABLE public.produtos (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    codigo VARCHAR(100),
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'produto' CHECK (tipo IN ('produto', 'servico')),
    categoria VARCHAR(255), -- compatibilidade retroativa
    categoria_id INTEGER REFERENCES public.categorias(id) ON DELETE SET NULL,
    marca VARCHAR(255),
    modelo VARCHAR(255),
    descricao TEXT,
    valor_compra NUMERIC(10, 2) DEFAULT 0.00,
    valor_venda NUMERIC(10, 2) DEFAULT 0.00,
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
    
    -- Múltiplos Códigos de Barras
    codigos_barras JSONB DEFAULT '[]'::jsonb,
    
    -- Comissões customizadas para serviços
    comissao_habilitada BOOLEAN DEFAULT false,
    comissao_100_porcento BOOLEAN DEFAULT true,
    comissao_valor NUMERIC DEFAULT 0
);

-- 7. TABELA DE PRODUTOS SERIAIS (IMEI / SERIAL)
CREATE TABLE public.produtos_seriais (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    numero_serie VARCHAR(100),
    serial VARCHAR(100), -- compatibilidade retroativa
    imei VARCHAR(100),
    status VARCHAR(50) DEFAULT 'disponivel', -- 'disponivel', 'vendido', 'devolvido'
    disponivel BOOLEAN DEFAULT true,
    data_entrada TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_saida TIMESTAMP WITH TIME ZONE,
    valor_compra NUMERIC(10, 2) DEFAULT 0.00,
    valor_venda NUMERIC(10, 2) DEFAULT 0.00,
    observacao TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 8. TABELA DE ENTRADAS (COMPRAS / ENTRADA ESTOQUE)
CREATE TABLE public.entradas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    fornecedor_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    total NUMERIC(10, 2) DEFAULT 0.00,
    forma_pagamento VARCHAR(50) DEFAULT 'Dinheiro',
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. ITENS DE ENTRADA
CREATE TABLE public.entrada_itens (
    id SERIAL PRIMARY KEY,
    entrada_id INTEGER NOT NULL REFERENCES public.entradas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL
);

-- 10. TABELA DE CAIXAS (FECHAMENTOS DE TURNO)
CREATE TABLE public.caixas (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    data_abertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_fechamento TIMESTAMP WITH TIME ZONE,
    saldo_inicial NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    saldo_final NUMERIC(10, 2),
    usuario_abertura_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_fechamento_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'aberto' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. TABELA DE SAÍDAS (VENDAS / SAÍDAS DO CAIXA)
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
    
    -- Comissão calculada na venda
    comissao_calculada NUMERIC DEFAULT 0,
    comissao_paga BOOLEAN DEFAULT false,
    comissao_paga_data TIMESTAMP WITH TIME ZONE
);

-- 12. ITENS DE SAÍDA (ITENS VENDIDOS)
CREATE TABLE public.saida_itens (
    id SERIAL PRIMARY KEY,
    saida_id INTEGER NOT NULL REFERENCES public.saidas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    serial_id INTEGER REFERENCES public.produtos_seriais(id) ON DELETE SET NULL,
    serial VARCHAR(100),
    imei VARCHAR(100)
);

-- 13. TABELA DE DESPESAS GERAIS
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

-- 14. TABELA DE BOLETOS A PAGAR (INTEGRAÇÃO COM COMPRAS / ENTRADAS)
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

-- 15. TABELA DE HISTÓRICO DE MOVIMENTAÇÃO DE ESTOQUE
CREATE TABLE public.movimentos_estoque (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    quantidade INTEGER NOT NULL,
    quantidade_anterior INTEGER NOT NULL,
    quantidade_nova INTEGER NOT NULL,
    motivo VARCHAR(255),
    data TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL
);

-- 16. TABELA DE CONFIGURAÇÕES DE RECURSOS E DADOS DA LOJA
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
    termo_garantia TEXT,
    termo_troca TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 17. TABELA DE AGENDAMENTOS (NICHO ESTÉTICA / BELEZA)
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

-- 18. TABELA DE MESAS E COMANDAS (NICHO RESTAURANTE / BARES)
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
-- VIEWS DE COMPATIBILIDADE
-- ============================================================================

CREATE OR REPLACE VIEW public.produtos_serial WITH (security_invoker = true) AS 
SELECT id, produto_id, numero_serie AS serial, imei, disponivel, data_entrada 
FROM public.produtos_seriais;

-- ============================================================================
-- HABILITAR RLS (ROW LEVEL SECURITY) E POLÍTICAS DE SEGURANÇA MULTI-TENANT
-- ============================================================================

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
ALTER TABLE public.saidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saida_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletos_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas_comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para obter o ID da loja logada a partir do cabeçalho da requisição HTTP (x-tenant-id)
CREATE OR REPLACE FUNCTION public.obter_loja_id_requisicao()
RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.headers', true)::json->>'x-tenant-id', '')::integer;
$$;

-- Criar políticas de isolamento baseadas no loja_id retornado pelo obter_loja_id_requisicao()
CREATE POLICY tenant_lojas_policy ON public.lojas FOR ALL USING (id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_usuarios_policy ON public.usuarios FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_categorias_policy ON public.categorias FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_clientes_policy ON public.clientes FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_colaboradores_policy ON public.colaboradores FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_produtos_policy ON public.produtos FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_entradas_policy ON public.entradas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_saidas_policy ON public.saidas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_despesas_policy ON public.despesas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_boletos_pagar_policy ON public.boletos_pagar FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_movimentos_estoque_policy ON public.movimentos_estoque FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_config_loja_policy ON public.config_loja FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_agendamentos_policy ON public.agendamentos FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_mesas_comandas_policy ON public.mesas_comandas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());
CREATE POLICY tenant_caixas_policy ON public.caixas FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

-- Políticas para tabelas filhas (que não possuem loja_id direto na linha)
CREATE POLICY tenant_produtos_seriais_policy ON public.produtos_seriais
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.produtos p 
            WHERE p.id = produto_id 
              AND p.loja_id = public.obter_loja_id_requisicao()
        )
    );

CREATE POLICY tenant_entrada_itens_policy ON public.entrada_itens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.entradas e 
            WHERE e.id = entrada_id 
              AND e.loja_id = public.obter_loja_id_requisicao()
        )
    );

CREATE POLICY tenant_saida_itens_policy ON public.saida_itens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.saidas s 
            WHERE s.id = saida_id 
              AND s.loja_id = public.obter_loja_id_requisicao()
        )
    );

-- ============================================================================
-- FUNÇÃO RPC PARA AUTENTICAÇÃO SEGURA (IGNORA RLS)
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
-- FUNÇÃO RPC PARA REGISTRAR PRIMEIRO ACESSO COM TRAVA DE SEGURANÇA
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

    -- 1. Trava de Segurança: Verificar se já existe o usuário adm ou loja com mesmo CNPJ
    IF EXISTS (SELECT 1 FROM public.usuarios WHERE email = p_usuario_adm) THEN
        RAISE EXCEPTION 'TRAVA_SEGURANCA: O usuário % já existe no banco de dados.', p_usuario_adm;
    END IF;

    IF v_clean_cnpj <> '' AND EXISTS (SELECT 1 FROM public.lojas WHERE regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_clean_cnpj) THEN
        RAISE EXCEPTION 'TRAVA_SEGURANCA: O CNPJ % já foi cadastrado no banco de dados.', p_cnpj;
    END IF;

    -- 2. Inserir Loja
    INSERT INTO public.lojas (nome, segmento, cnpj, telefone, endereco)
    VALUES (p_razao_social, coalesce(p_segmento, 'eletronico'), p_cnpj, p_telefone, p_endereco)
    RETURNING id INTO v_loja_id;

    -- 3. Inserir Configurações da Loja
    INSERT INTO public.config_loja (
        loja_id, nome_fantasia, razao_social, cnpj, telefone, email, endereco,
        habilitar_seriais, habilitar_agendamentos, habilitar_mesas, habilitar_lotes, habilitar_variacoes
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
        coalesce((p_features->>'habilitar_variacoes')::boolean, false)
    );

    -- 4. Montar Permissões Totais do Administrador
    v_permissoes := '{
        "dashboard": { "ver": true },
        "clientes": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "produtos": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "categorias": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "estoque": { "ver": true, "ajustar": true },
        "entradas": { "ver": true, "criar": true, "excluir": true },
        "saidas": { "ver": true, "criar": true, "cancelar": true, "ver_vendas_outros": true },
        "fornecedores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "ordens_servico": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "colaboradores": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "financeiro": { "ver": true, "criar": true, "editar": true, "excluir": true },
        "relatorios": { "ver": true, "exportar": true },
        "usuarios": { "ver": true, "criar": true, "editar": true, "excluir": true }
    }'::jsonb;

    -- 5. Inserir Usuário Administrador
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
-- CONCESSÃO DE PERMISSÕES PARA API SUPABASE (ANON, AUTHENTICATED, SERVICE_ROLE)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

