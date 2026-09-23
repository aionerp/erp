# Arquitetura Multicliente — Aion ERP CORE

Este documento descreve a estrutura multicliente (multi-tenant) do **Aion ERP**, projetada para permitir que um único repositório de código-fonte compartilhado atenda a múltiplos clientes independentes, cada um com seu próprio banco de dados Neon PostgreSQL isolado, configurações, recursos (Feature Flags), identidade visual (branding) e fluxo seguro de Primeiro Acesso por CNPJ.

---

## 1. Visão Geral da Arquitetura

O sistema opera no modelo **ERP CORE** centralizado com compilação de deploys estáticos isolados e roteamento inteligente por CNPJ e Prefixo de Usuário.

```text
                    ┌────────────────────────┐
                    │      ERP CORE (Git)    │
                    │   Código Compartilhado  │
                    └───────────┬────────────┘
                                │
                    NPM Build (build.js) [Clientes]
                                │
            ┌───────────────────┴───────────────────┐
            ▼                                       ▼
       Cliente 01                              Cliente 02
       (Aion ERP)                              (Original Eletrônicos)
       Neon PostgreSQL                         Neon PostgreSQL
       Branding Aion                           Branding Original
       adm.aionerp                             adm.originaleletronico
```

---

## 2. Clientes Ativos em Produção

Atualmente, apenas **dois clientes estão ativos**:

1. **`cliente01`**: Aion ERP Oficial (Prefixo: `aionerp` | CNPJ: `12.345.678/0001-90`)
2. **`cliente02`**: Original Eletrônicos (Prefixo: `originaleletronico` | CNPJ: `47.391.014/0001-47`)

---

## 3. Estrutura de Pastas do Projeto

```text
erp/
├── clients/                  # Configurações específicas de cada cliente
│   ├── cliente01/
│   │   ├── config.json       # Credenciais, cores, prefixo e flags do Cliente 01
│   │   └── logo.png          # Logotipo personalizado do Cliente 01
│   └── cliente02/
│       ├── config.json       # Credenciais, cores, prefixo e flags do Cliente 02
│       └── logo.png
├── clients.json              # Catálogo compilado de todos os clientes registrados
├── database/
│   ├── schema_completo.sql   # SQL COMPLETO de execução única (21 tabelas, índices, triggers e seeds)
│   └── schema.sql            # Cópia de referência idêntica do schema
├── dist/                     # Pasta gerada pelo build pronta para deploy
├── js/
│   ├── config.js             # Resolução de CNPJ/prefixo e branding dinâmico
│   ├── auth.js               # Autenticação com suporte a usuário prefixado (ex: adm.aionerp)
│   ├── auth-check.js         # Aplica títulos e mescla Feature Flags
│   └── primeiro-acesso.js    # Módulo de Primeiro Acesso por CNPJ com Trava de Segurança
├── scripts/
│   └── migration/
│       └── 02_setup_neon_schema.js # Script Node para provisionar schema no Neon em 1 comando
├── .env                      # Connection strings dos bancos (CLIENTE01_DATABASE_URL, CLIENTE02_DATABASE_URL)
├── build.js                  # Script Node.js de build multicliente
├── server.js                 # Servidor local Node.js / Express
├── guia_adicionar_novo_cliente.md # Guia passo a passo rápido para novos clientes
└── MULTICLIENTE.md           # Este manual de documentação
```

---

## 4. Primeiro Acesso & Trava de Segurança

### Como Funciona o Primeiro Acesso (Onboarding):
1. Na tela de login (`index.html`), o usuário clica em **"✨ Primeiro Acesso? Identificar Loja por CNPJ"**.
2. O sistema solicita o **CNPJ da empresa**.
3. O CNPJ é consultado no registro multicliente (`clients.json`).
4. Ao localizar o cliente (ex: `clientId: "cliente01"`), o sistema se conecta ao banco Neon PostgreSQL correspondente.
5. **Trava de Segurança (Anti-Repetição):**
   * O sistema verifica se a loja ou o usuário administrador já foram configurados no banco.
   * Se já existirem, o cadastro é **bloqueado**, alertando que o primeiro acesso já foi concluído e preenchendo o login para entrada direta.
6. Se for o primeiro acesso legítimo:
   * Abre a **Ficha de Cadastro da Empresa** (Razão Social, Nome Fantasia, CNPJ, Segmento, Telefone, Email, Endereço).
   * Exibe o usuário administrador fixo: **`adm.<prefixo>`**.
   * Solicita o Nome do Responsável e a Senha do Administrador.
7. Ao salvar:
   * Cria/atualiza o registro em `public.lojas` e `public.config_loja`.
   * Cria o usuário administrador em `public.usuarios` com `perfil = 'admin'` e **todas as permissões do sistema ativadas** (`dashboard`, `clientes`, `produtos`, `categorias`, `estoque`, `entradas`, `saidas`, `assinaturas`, `fornecedores`, `ordens_servico`, `colaboradores`, `financeiro`, `relatorios`, `usuarios`).

---

## 5. Padrão de Login com Prefixo por Loja

Para garantir o isolamento e a segurança das lojas:
* Os logins utilizam o formato **`<usuario>.<prefixo>`** (ex: `adm.aionerp`, `vendedor.aionerp`, `adm.originaleletronico`).
* Quando um usuário digita `adm.originaleletronico` na tela inicial, o sistema detecta o prefixo/sufixo, identifica a loja correspondente e conecta automaticamente ao banco de dados do cliente antes de autenticar.

---

## 6. Como Adicionar um Novo Cliente

Para adicionar novos clientes de forma rápida em 3 minutos, consulte o guia dedicado:
👉 **[guia_adicionar_novo_cliente.md](file:///C:/Users/ailton.cordeiro/ERP-Novo/erp/guia_adicionar_novo_cliente.md)**

---

## 7. Scripts de Execução

```bash
# Executar servidor de desenvolvimento local
npm run dev
# ou
node server.js

# Provisionar schema completo de um cliente no Neon
node scripts/migration/02_setup_neon_schema.js cliente01
node scripts/migration/02_setup_neon_schema.js cliente02

# Atualizar manifesto de clientes e compilar
node build.js
```
