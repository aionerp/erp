# Arquitetura Multicliente — Aion ERP CORE

Este documento descreve a estrutura multicliente (multi-tenant) do **Aion ERP**, projetada para permitir que um único repositório de código-fonte compartilhado atenda a múltiplos clientes independentes, cada um com seu próprio banco de dados Supabase, configurações, recursos (Feature Flags), identidade visual (branding) e fluxo seguro de Primeiro Acesso por CNPJ.

---

## 1. Visão Geral da Arquitetura

O sistema opera no modelo **ERP CORE** centralizado com compilação de deploys estáticos isolados e roteamento inteligente por CNPJ e Prefixo de Usuário.

```
                    ┌────────────────────────┐
                    │      ERP CORE (Git)    │
                    │   Código Compartilhado  │
                    └───────────┬────────────┘
                                │
                    NPM Build (build.js) [Cliente]
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
       Cliente 01          Cliente 02          Cliente 03
       (dist/)             (dist/)             (dist/)
       Supabase Proj 01    Supabase Proj 02    Supabase Proj 03
       Branding Azul       Branding Verde      Branding Laranja
       adm.aionerp         adm.cliente02       adm.cliente03
```

---

## 2. Estrutura de Pastas do Projeto

```
erp-core/
├── clients/                  # Configurações específicas de cada cliente
│   ├── cliente01/
│   │   ├── config.json       # Credenciais, cores, prefixo e flags do Cliente 01
│   │   └── logo.png          # Logotipo personalizado do Cliente 01 (opcional)
│   ├── cliente02/
│   │   └── config.json
│   └── cliente03/
│       └── config.json
├── clients.json              # Manifesto compilado de todos os clientes registrados
├── dist/                     # Pasta gerada pelo build pronta para deploy (Gitignored)
├── js/
│   ├── config.js             # Inicializa Supabase, resolução de CNPJ/prefixo e branding
│   ├── auth.js               # Autenticação com suporte a usuário prefixado (ex: adm.aionerp)
│   ├── auth-check.js         # Aplica títulos e mescla Feature Flags
│   └── primeiro-acesso.js    # Módulo de Primeiro Acesso por CNPJ com Trava de Segurança
├── .github/workflows/
│   └── ci-cd.yml             # Executa validação de build para todos os clientes em cada Push/PR
├── .env.example              # Exemplo de variáveis de ambiente
├── build.js                  # Script Node.js de build multicliente
├── package.json              # Mapeamento de scripts de build e execução
├── server.js                 # Servidor local (suporta servir a pasta /dist)
└── MULTICLIENTE.md           # Este manual de documentação
```

---

## 3. Primeiro Acesso & Trava de Segurança

### Como Funciona o Primeiro Acesso (Onboarding):
1. Na tela de login (`index.html`), o usuário clica em **"✨ Primeiro Acesso? Identificar Loja por CNPJ"**.
2. O sistema solicita o **CNPJ da empresa**.
3. O CNPJ é consultado no registro multicliente (`clients.json`).
4. Ao localizar o cliente (ex: `clientId: "cliente01"`), o sistema se conecta ao banco Supabase correspondente.
5. **Trava de Segurança (Anti-Repetição):**
   * O sistema verifica se a loja ou o usuário `adm.<prefixo>` já foram criados no banco.
   * Se já existirem, o cadastro é **bloqueado**, alertando que o primeiro acesso já foi concluído e preenchendo o login para entrada direta.
6. Se for o primeiro acesso legítimo:
   * Abre a **Ficha de Cadastro da Empresa** (Razão Social, Nome Fantasia, CNPJ, Segmento, Telefone, Email, Endereço).
   * Exibe o usuário administrador fixo: **`adm.<prefixo>`**.
   * Solicita o Nome do Responsável e a Senha do Administrador.
7. Ao salvar:
   * Cria o registro em `public.lojas` e `public.config_loja`.
   * Cria o usuário administrador em `public.usuarios` com `perfil = 'admin'` e **todas as permissões do sistema ativadas** (`dashboard`, `clientes`, `produtos`, `categorias`, `estoque`, `entradas`, `saidas`, `fornecedores`, `ordens_servico`, `colaboradores`, `financeiro`, `relatorios`, `usuarios`).

---

## 4. Padrão de Login com Prefixo por Loja

Para garantir o isolamento e a segurança das lojas:
* Os logins utilizam o formato **`<usuario>.<prefixo>`** (ex: `adm.aionerp`, `vendedor.aionerp`, `caixa.cliente02`).
* Quando um usuário digita `adm.aionerp` na tela inicial, o sistema detecta o sufixo `.aionerp`, identifica a loja correspondente e conecta automaticamente ao banco de dados do cliente antes de autenticar.

---

## 5. Como Cadastrar um Novo Cliente

### Passo 1: Criar pasta e arquivo de configuração
Crie a pasta `clients/empresa-exemplo/` e o arquivo `config.json`:

```json
{
  "clientId": "empresa-exemplo",
  "companyName": "Exemplo Enterprise",
  "companySubtitle": "Soluções em Tecnologia",
  "prefix": "exemplo",
  "cnpj": "12.345.678/0001-99",
  "supabase": {
    "url": "https://sua-url-do-supabase.supabase.co",
    "anonKey": "sua-anon-key-gerada-no-painel"
  },
  "branding": {
    "primaryColor": "#5B21B6",
    "primaryDarkColor": "#4C1D95",
    "primaryLightColor": "#7C3AED"
  },
  "features": {
    "habilitar_seriais": true,
    "habilitar_agendamentos": false,
    "habilitar_mesas": true,
    "habilitar_lotes": false,
    "habilitar_variacoes": true
  }
}
```

### Passo 2: Gerar manifesto e compilar
```bash
# Atualizar manifesto de clientes
node build.js

# Gerar build estático para o novo cliente
node build.js empresa-exemplo
```

---

## 6. Scripts de Automação

```bash
# Executar servidor de desenvolvimento local
npm run dev

# Gerar build do Cliente 01
npm run build:cliente01

# Servir a pasta compilada /dist
npm run serve
```
