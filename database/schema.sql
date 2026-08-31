-- =====================================================
-- SCHEMA DE BANCO DE DADOS - AION ERP
-- =====================================================

-- Habilitar extensão pgcrypto se necessário
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpar tabelas anteriores se existirem (para instalação limpa)
DROP VIEW IF EXISTS public.produtos_serial CASCADE;
DROP TABLE IF EXISTS public.mesas_comandas CASCADE;
DROP TABLE IF EXISTS public.agendamentos CASCADE;
DROP TABLE IF EXISTS public.config_loja CASCADE;
DROP TABLE IF EXISTS public.movimentos_estoque CASCADE;
DROP TABLE IF EXISTS public.saida_itens CASCADE;
DROP TABLE IF EXISTS public.saidas CASCADE;
DROP TABLE IF EXISTS public.caixas CASCADE;
DROP TABLE IF EXISTS public.entrada_itens CASCADE;
DROP TABLE IF EXISTS public.entradas CASCADE;
DROP TABLE IF EXISTS public.produtos_seriais CASCADE;
DROP TABLE IF EXISTS public.produtos CASCADE;
DROP TABLE IF EXISTS public.fornecedores CASCADE;
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

-- 5. TABELA DE PRODUTOS
CREATE TABLE public.produtos (
    id SERIAL PRIMARY KEY,
    loja_id INTEGER NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
    codigo VARCHAR(100),
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'produto' CHECK (tipo IN ('produto', 'servico')),
    categoria VARCHAR(255), -- mantido para compatibilidade de texto do front
    categoria_id INTEGER REFERENCES public.categorias(id) ON DELETE SET NULL, -- relacionamento relacional real
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
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 6. TABELA DE PRODUTOS SERIAIS (IMEI / SERIAL)
CREATE TABLE public.produtos_seriais (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    numero_serie VARCHAR(100),
    serial VARCHAR(100), -- duplicado para compatibilidade retroativa
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

-- 7. TABELA DE ENTRADAS (COMPRAS / ESTOQUE)
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

-- 8. ITENS DE ENTRADA
CREATE TABLE public.entrada_itens (
    id SERIAL PRIMARY KEY,
    entrada_id INTEGER NOT NULL REFERENCES public.entradas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL
);

-- 8.5 TABELA DE CAIXAS (FECHAMENTO DIÁRIO)
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

-- 9. TABELA DE SAÍDAS (VENDAS / PDV)
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
    colaborador_id INTEGER REFERENCES public.colaboradores(id) ON DELETE SET NULL
);

-- 10. ITENS DE SAÍDA
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

-- 11. TABELA DE MOVIMENTOS DE ESTOQUE
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

-- 12. TABELA DE CONFIGURAÇÕES DE LOJA
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. TABELA DE AGENDAMENTOS (NICHO ESTÉTICA)
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

-- 14. TABELA DE MESAS E COMANDAS (NICHO RESTAURANTE)
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

-- 15. TABELA DE COLABORADORES
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

-- 16. TABELA DE DESPESAS
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

-- 17. TABELA DE BOLETOS A PAGAR
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

-- 15. VIEW COMPATIBILIDADE RETROATIVA
CREATE OR REPLACE VIEW public.produtos_serial WITH (security_invoker = true) AS 
SELECT id, produto_id, numero_serie AS serial, imei, disponivel, data_entrada 
FROM public.produtos_seriais;

-- 16. HABILITAR RLS (ROW LEVEL SECURITY) E POLÍTICAS DE SEGURANÇA
-- Garante o isolamento correto dos dados por loja (tenant) usando o cabeçalho x-tenant-id

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_seriais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrada_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saida_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas_comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletos_pagar ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para obter o ID da loja a partir do cabeçalho HTTP
CREATE OR REPLACE FUNCTION public.obter_loja_id_requisicao()
RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.headers', true)::json->>'x-tenant-id', '')::integer;
$$;

-- Criar políticas baseadas no loja_id da requisição
CREATE POLICY tenant_lojas_policy ON public.lojas
    FOR ALL USING (id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_usuarios_policy ON public.usuarios
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_categorias_policy ON public.categorias
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_clientes_policy ON public.clientes
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_produtos_policy ON public.produtos
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_entradas_policy ON public.entradas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_saidas_policy ON public.saidas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_movimentos_estoque_policy ON public.movimentos_estoque
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_config_loja_policy ON public.config_loja
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_agendamentos_policy ON public.agendamentos
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_mesas_comandas_policy ON public.mesas_comandas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_caixas_policy ON public.caixas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_colaboradores_policy ON public.colaboradores
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_boletos_pagar_policy ON public.boletos_pagar
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

CREATE POLICY tenant_despesas_policy ON public.despesas
    FOR ALL USING (loja_id = public.obter_loja_id_requisicao());

-- Políticas para tabelas dependentes (que não contêm loja_id diretamente)
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

-- Função RPC para Autenticação segura (SECURITY DEFINER permite rodar mesmo sem RLS ativo/resolvido)
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


-- =====================================================
-- ESTRUTURA LIMPA PARA NOVAS LOJAS (SEM DADOS DE TESTE)
-- =====================================================
-- Todas as novas lojas/bases iniciam 100% em branco.
-- Os cadastros de loja, usuários e produtos são feitos pelo painel ou Primeiro Acesso.




/*
As rotinas de Agendamentos e Mesas & Comandas são controladas por flags booleanas na tabela public.config_loja associadas ao loja_id (tenant) de cada empresa.

Abaixo estão os comandos SQL para ativar ou remover (desativar) essas funcionalidades no banco de dados.

(Substitua 1 pelo ID da loja desejada em loja_id)

1. Rotina de Agendamentos (Estética / Serviços)
Para ATIVAR:
*/

-- UPDATE public.config_loja 
-- SET habilitar_agendamentos = true 
-- WHERE loja_id = 1;

/*
Para REMOVER (desativar):
*/

-- UPDATE public.config_loja 
-- SET habilitar_agendamentos = false 
-- WHERE loja_id = 1;

/*
2. Rotina de Mesas & Comandas (Restaurante / Alimentação)
Para ATIVAR:
*/

-- UPDATE public.config_loja 
-- SET habilitar_mesas = true 
-- WHERE loja_id = 1;

/*
Para REMOVER (desativar):
*/

-- UPDATE public.config_loja 
-- SET habilitar_mesas = false 
-- WHERE loja_id = 1;

/*
3. Verificar o status atual das configurações de uma loja
Caso queira checar o que está ativo em cada loja:
*/

-- SELECT 
--     loja_id, 
--     nome_fantasia, 
--     habilitar_agendamentos, 
--     habilitar_mesas, 
--     habilitar_seriais 
-- FROM public.config_loja;