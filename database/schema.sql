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
    ultimo_acesso TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_email_per_loja UNIQUE (email)
);

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
        to_jsonb(c) as config_loja
    FROM public.usuarios u
    JOIN public.lojas l ON l.id = u.loja_id
    LEFT JOIN public.config_loja c ON c.loja_id = u.loja_id
    WHERE u.email = p_email 
      AND u.senha = p_senha 
      AND u.ativo = true;
END;
$$;


-- =====================================================
-- DADOS SEMENTES (SEED DATA) PARA TESTES E DEMONSTRAÇÃO
-- =====================================================

-- Inserir loja padrão única (configurável pelo painel)
INSERT INTO public.lojas (id, nome, segmento, cnpj, telefone, endereco) VALUES
(1, 'Minha Empresa', 'eletronico', '00.000.000/0001-00', '(11) 99999-9999', 'Rua Principal, 100 - Centro');

-- Reiniciar contador de ID da tabela lojas
SELECT setval('public.lojas_id_seq', 1);

-- Inserir usuário administrador master único (senha: admin)
INSERT INTO public.usuarios (id, loja_id, nome, email, senha, perfil, nivel_acesso, ativo, permissoes) VALUES
(1, 1, 'Ailton Rocha Cordeiro', 'arc48388528@gmail.com', 'admin', 'admin', 'admin', true, '{}'::jsonb),
(2, 1, 'Administrador Master', 'admin@admin.com', 'admin', 'admin', 'admin', true, '{}'::jsonb);

SELECT setval('public.usuarios_id_seq', 2);

-- Inserir configurações iniciais da loja única (todas as verticais ativas por padrão para experimentação)
INSERT INTO public.config_loja (loja_id, nome_fantasia, razao_social, cnpj, telefone, email, endereco, habilitar_seriais, habilitar_agendamentos, habilitar_mesas, habilitar_lotes, habilitar_variacoes) VALUES
(1, 'Minha Empresa', 'Minha Empresa Ltda', '00.000.000/0001-00', '(11) 99999-9999', 'arc48388528@gmail.com', 'Rua Principal, 100 - Centro', true, true, true, true, true);

-- Inserir algumas categorias padrão para a Loja 1 (Eletrônicos)
INSERT INTO public.categorias (id, loja_id, nome, descricao, exige_imei, exige_serial, ativo) VALUES
(1, 1, 'Celulares', 'Smartphones e aparelhos móveis', true, true, true),
(2, 1, 'Acessórios', 'Capas, carregadores, etc.', false, false, true);
SELECT setval('public.categorias_id_seq', 2);

-- Inserir alguns clientes padrão para a loja única
INSERT INTO public.clientes (id, loja_id, nome, tipo, cpf_cnpj, telefone, email, cidade, estado) VALUES
(1, 1, 'Carlos Silva (Cliente Eletrônicos)', 'cliente', '123.456.789-00', '(11) 91111-2222', 'carlos@email.com', 'São Paulo', 'SP'),
(2, 1, 'Maria Santos (Cliente Mercado)', 'cliente', '234.567.890-11', '(11) 92222-3333', 'maria@email.com', 'São Paulo', 'SP'),
(3, 1, 'Ana Oliveira (Cliente Estética)', 'cliente', '345.678.901-22', '(11) 93333-4444', 'ana@email.com', 'São Paulo', 'SP'),
(4, 1, 'Pedro Souza (Cliente Restaurante)', 'cliente', '456.789.012-33', '(11) 94444-5555', 'pedro@email.com', 'São Paulo', 'SP'),
(5, 1, 'Fernanda Lima (Cliente Joias)', 'cliente', '567.890.123-44', '(11) 95555-6666', 'fernanda@email.com', 'São Paulo', 'SP'),
-- Fornecedores
(6, 1, 'Distribuidora Tech (Fornecedor)', 'fornecedor', '12.345.678/0001-90', '(11) 3333-4444', 'contato@techdist.com', 'São Paulo', 'SP'),
(7, 1, 'Hortifruti Central (Fornecedor)', 'fornecedor', '23.456.789/0001-01', '(11) 3333-5555', 'vendas@horticentral.com', 'São Paulo', 'SP');

SELECT setval('public.clientes_id_seq', 7);

-- Inserir produtos padrão para a Loja 1 (Eletrônicos)
INSERT INTO public.produtos (id, loja_id, codigo, nome, categoria, categoria_id, marca, modelo, descricao, valor_compra, valor_venda, estoque_total, estoque_minimo, garantia_dias, imagem, ativo) VALUES
(1, 1, 'CEL-IPHONE15', 'iPhone 15 128GB', 'Celulares', 1, 'Apple', 'iPhone 15', 'Aparelho Celular Apple iPhone 15', 4500.00, 5999.00, 2, 2, 365, '', true),
(2, 1, 'ACE-CABOLIGHTNING', 'Cabo Lightning 1m', 'Acessórios', 2, 'Apple', 'Cabo Lightning', 'Cabo de carregamento Apple original 1 metro', 50.00, 129.00, 15, 5, 90, '', true);

SELECT setval('public.produtos_id_seq', 2);

-- Inserir seriais para os iPhones cadastrados
INSERT INTO public.produtos_seriais (id, produto_id, numero_serie, serial, imei, status, disponivel, valor_compra, valor_venda) VALUES
(1, 1, 'IPH15-SERIAL-001', 'IPH15-SERIAL-001', '358291002938471', 'disponivel', true, 4500.00, 5999.00),
(2, 1, 'IPH15-SERIAL-002', 'IPH15-SERIAL-002', '358291002938472', 'disponivel', true, 4500.00, 5999.00);

SELECT setval('public.produtos_seriais_id_seq', 2);

-- Inserir produtos padrão adicionais para a loja única (Mercado)
INSERT INTO public.produtos (id, loja_id, codigo, nome, categoria, marca, descricao, valor_compra, valor_venda, estoque_total, estoque_minimo, garantia_dias, ativo) VALUES
(3, 1, 'MER-ARROZ5KG', 'Arroz Prato Fino 5kg', 'Alimentos', 'Prato Fino', 'Arroz agulhinha tipo 1 pacote 5kg', 18.00, 26.90, 50, 10, 0, true),
(4, 1, 'MER-LECHE1L', 'Leite Integral Elegê 1L', 'Laticínios', 'Elegê', 'Leite UHT integral 1 litro', 3.20, 4.89, 120, 20, 0, true);

SELECT setval('public.produtos_id_seq', 4);

-- Inserir mesas de teste para a loja única (Restaurante)
INSERT INTO public.mesas_comandas (loja_id, numero, tipo, status, valor_acumulado) VALUES
(1, 'Mesa 01', 'mesa', 'livre', 0.00),
(1, 'Mesa 02', 'mesa', 'livre', 0.00),
(1, 'Mesa 03', 'mesa', 'ocupada', 45.50),
(1, 'Comanda 101', 'comanda', 'livre', 0.00),
(1, 'Comanda 102', 'comanda', 'ocupada', 128.90);

-- Inserir agendamentos de teste para a loja única (Estética)
INSERT INTO public.agendamentos (id, loja_id, cliente_id, profissional_id, servico_id, data_hora, status, valor, observacoes) VALUES
(1, 1, 3, 1, 2, date_trunc('hour', now() + interval '1 day' + interval '10 hours'), 'agendado', 129.00, 'Design de Sobrancelha / Ajuste de Produto'),
(2, 1, 4, 1, 2, date_trunc('hour', now() + interval '2 days' + interval '14 hours'), 'confirmado', 129.00, 'Limpeza de Pele');

SELECT setval('public.agendamentos_id_seq', 2);



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