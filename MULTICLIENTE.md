# Arquitetura Multicliente — Aion ERP CORE

Este documento descreve a nova estrutura multicliente (multi-tenant) do **Aion ERP**, projetada para permitir que um único repositório de código-fonte compartilhado atenda a múltiplos clientes independentes, cada um com seu próprio banco de dados Supabase, configurações, recursos (Feature Flags) e identidade visual (branding).

---

## 1. Visão Geral da Arquitetura

O sistema agora opera no modelo **ERP CORE** centralizado com compilação de deploys estáticos isolados.

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
```

### Como Funciona:
* **Código-fonte Comum:** Fica na raiz do projeto (HTML, CSS e JS principais).
* **Módulo de Compilação (`build.js`):** Script Node.js que copia os arquivos comuns para a pasta `/dist` e injeta dinamicamente o arquivo `/dist/env.js` com os dados do cliente ativo.
* **Mecanismo de Inicialização (Runtime):** O arquivo `js/config.js` carrega o `/dist/env.js` de forma síncrona, instanciando o cliente do Supabase e injetando as variáveis de cores CSS (`--primary`, `--primary-dark`, `--primary-light`) e marcas no DOM na inicialização.

---

## 2. Estrutura de Pastas do Projeto

Abaixo estão os novos arquivos e diretórios essenciais para o suporte multicliente:

```
erp-core/
├── clients/                  # Configurações específicas de cada cliente
│   ├── cliente01/
│   │   ├── config.json       # Credenciais, cores e flags do Cliente 01
│   │   └── logo.png          # Logotipo personalizado do Cliente 01 (opcional)
│   ├── cliente02/
│   │   └── config.json
│   └── cliente03/
│       └── config.json
├── dist/                     # Pasta gerada pelo build pronta para deploy (Gitignored)
├── js/
│   ├── config.js             # Refatorado: inicializa Supabase e aplica cores/branding
│   └── auth-check.js         # Refatorado: aplica títulos e mescla Feature Flags
├── .github/workflows/
│   └── ci-cd.yml             # Executa validação de build para todos os clientes em cada Push/PR
├── .env.example              # Exemplo de variáveis de ambiente
├── build.js                  # Script Node.js de build multicliente
├── package.json              # Mapeamento de scripts de build e execução
├── server.js                 # Servidor local (suporta servir a pasta /dist)
└── MULTICLIENTE.md           # Este manual de documentação
```

---

## 3. Como Configurar um Novo Cliente

Para adicionar um cliente chamado `empresa-exemplo`, siga os passos abaixo:

### Passo 1: Criar pasta e arquivo de configuração
Crie o diretório `clients/empresa-exemplo/` e o arquivo `config.json` com o seguinte formato:

```json
{
  "clientId": "empresa-exemplo",
  "companyName": "Exemplo Enterprise",
  "companySubtitle": "Soluções de Tecnologia",
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

### Passo 2: Logotipo Personalizado (Opcional)
Se o cliente tiver um logotipo próprio, salve-o na mesma pasta com o nome `logo.png` (formato quadrado recomendado):
`clients/empresa-exemplo/logo.png`

O script de compilação copiará automaticamente essa imagem para a pasta `/dist/assets/img/logo-cliente.png` e atualizará as referências.

---

## 4. Como Executar e Gerar o Build

### Rodar Localmente em Desenvolvimento (Sem Compilar)
Renomeie o arquivo `.env.example` para `.env` e configure o cliente de desenvolvimento:
```env
CLIENTE=cliente01
```
Rode o servidor local:
```bash
npm run dev
```

### Gerar Compilação (Build) de um Cliente Específico
Para gerar a pasta `/dist` configurada para um cliente, você pode usar os scripts no `package.json` ou passar o nome do cliente como argumento do script de build:

```bash
# Método 1 (Recomendado/Cross-platform):
node build.js cliente01

# Método 2 (Através dos atalhos do package.json):
npm run build:cliente01
```

A pasta `/dist` conterá todo o código estático do ERP com o arquivo `env.js` injetado com as credenciais do Supabase e configurações específicas daquele cliente.

---

## 5. Estratégia de Deploy e CI/CD

### Deploy de Produção
Para publicar o sistema para um cliente, basta gerar o build correspondente (`node build.js cliente01`) e apontar a hospedagem estática (Vercel, Netlify, IIS, Cloudflare Pages ou S3/Cloudfront) para a pasta `/dist`.

### Integração Contínua (GitHub Actions)
O arquivo `.github/workflows/ci-cd.yml` foi configurado para automatizar validações. Em cada `git push` ou `Pull Request` enviado para a branch principal (`main` ou `master`):
1. Instala o Node.js.
2. Varre o diretório `/clients` identificando todos os clientes cadastrados.
3. Executa o build de cada um individualmente (`CLIENTE=[cliente] node build.js`).
4. Relata sucesso ou aponta erros caso a configuração de algum cliente esteja corrompida.

---

## 6. Atualização de Clientes Existentes

Quando uma nova funcionalidade é adicionada ou um bug é corrigido no ERP CORE:
1. Altere o código-fonte compartilhado na raiz do projeto (ex: `js/saidas.js`).
2. Atualize a versão se necessário no `package.json`.
3. Dê `git push` para o repositório principal.
4. O CI/CD irá validar a compilação de todos os clientes.
5. Os pipelines de deploy vinculados a cada cliente lerão a pasta `/dist` gerada do CORE e publicarão as atualizações de forma sincronizada e automática.
