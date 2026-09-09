# 📘 Guia Definitivo: Como Adicionar Novos Clientes ao Aion ERP

Este guia detalha o passo a passo completo para cadastrar e colocar no ar um novo cliente no sistema, mantendo a arquitetura **multi-tenant** com banco de dados Neon PostgreSQL isolado, segurança de credenciais e a identidade visual padrão do sistema.

---

## 🧭 Visão Geral do Fluxo

Para cada novo cliente (ex: `cliente03`), realizamos 5 etapas simples:

```text
1. Provisionar Neon ➔ 2. Executar Schema ➔ 3. Configurar Pasta ➔ 4. Rodar Build ➔ 5. Deploy no Render e Git
```

---

## 🛠️ Passo 1: Criar o Banco de Dados no Neon

1. Acesse o console do **[Neon](https://console.neon.tech/)**.
2. Crie um novo projeto (ou novo branch/database) com o nome do cliente (ex: `cliente03-db`).
3. Copie a **Connection String** do tipo PostgreSQL (pooled ou direct):
   ```text
   postgresql://neondb_owner:SENHA_AQUI@ep-exemplo-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## 🔐 Passo 2: Configurar o Arquivo `.env` Local e no Render

### 2.1 No seu ambiente local
Abra o arquivo `.env` na raiz do projeto e adicione a nova variável com o identificador do cliente em letras maiúsculas:

```env
# Novo Cliente 03
CLIENTE03_DATABASE_URL=postgresql://neondb_owner:SENHA_AQUI@ep-exemplo-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 2.2 No Render (Servidor de Produção)
1. Acesse o dashboard do seu serviço no **[Render.com](https://render.com/)**.
2. Vá na aba **Environment**.
3. Adicione a variável `CLIENTE03_DATABASE_URL` com a mesma connection string do Neon.
4. Salve as alterações.

---

## 🏗️ Passo 3: Criar as 20 Tabelas e Funções Automaticamente

O Aion ERP possui um script automatizado que cria todas as tabelas, índices, sequences, funções (`autenticar_usuario`, `verificar_status_loja`) e triggers no banco novo com um único comando:

No terminal, execute:
```bash
node scripts/migration/02_setup_neon_schema.js cliente03
```

> **Dica:** O script informará `✅ Schema provisionado no Neon com sucesso!`. Todas as 20 tabelas e stored procedures estarão criadas e prontas.

---

## 📁 Passo 4: Criar a Pasta de Configuração do Cliente

1. Crie uma nova pasta dentro de `clients/` com o código do cliente:
   - Exemplo: `clients/cliente03/`

2. Dentro dessa pasta, crie o arquivo `config.json`:
   - Caminho: `clients/cliente03/config.json`

### Modelo padrão do `config.json`:
```json
{
  "clientId": "cliente03",
  "companyName": "Nome da Empresa ou Loja",
  "companySubtitle": "Unidade Centro",
  "prefix": "nomedaloja",
  "cnpj": "12.345.678/0001-90",
  "active": true,
  "configured": true,
  "database": {
    "provider": "neon",
    "connectionId": "cliente03"
  },
  "branding": {
    "primaryColor": "#111824",
    "primaryDarkColor": "#0a1525",
    "primaryLightColor": "#152031"
  },
  "features": {
    "habilitar_seriais": true,
    "habilitar_agendamentos": true,
    "habilitar_mesas": true,
    "habilitar_lotes": true,
    "habilitar_variacoes": true
  }
}
```

### 📋 Campos Importantes:
| Campo | Descrição | Exemplo |
| :--- | :--- | :--- |
| `clientId` | Identificador único interno da pasta e da URL | `"cliente03"` |
| `companyName` | Nome fantasia exibido no topo do sistema | `"Original Calçados"` |
| `prefix` | Prefixo usado no login dos usuários | `"originalcalcados"` |
| `cnpj` | CNPJ da empresa (usado no Primeiro Acesso) | `"47.391.014/0001-47"` |
| `database.connectionId` | Deve ser exatamente igual ao `clientId` | `"cliente03"` |
| `branding` | Paleta oficial original (#111824) | *Mantenha o padrão acima* |
| `features` | Módulos ativos (seriais, lotes, agendamentos, mesas) | `true` ou `false` |

*(Opcional: Você pode colocar a imagem do logo do cliente em `clients/cliente03/logo.png`).*

---

## 👤 Passo 5: Criar a Loja e o Usuário Administrador Inicial

Você tem **duas formas** de criar o acesso inicial do cliente:

### Opção A: Inserção Direta via SQL (Recomendado)
Acesse o **SQL Editor** do Neon no projeto do cliente e execute:

```sql
-- 1. Criar o registro da Loja (ID 1)
INSERT INTO public.lojas (id, nome, cnpj, segmento)
VALUES (1, 'Nome da Empresa', '12345678000190', 'geral')
ON CONFLICT (id) DO NOTHING;

-- 2. Criar as configurações da Loja
INSERT INTO public.config_loja (loja_id, nome_fantasia, razao_social, cnpj, habilitar_seriais, habilitar_lotes)
VALUES (1, 'Nome da Empresa', 'Nome da Empresa LTDA', '12.345.678/0001-90', true, true)
ON CONFLICT (loja_id) DO NOTHING;

-- 3. Criar o usuário administrador com senha criptografada em bcrypt
-- O usuário de login será: adm.<prefixo> (ex: adm.nomedaloja)
INSERT INTO public.usuarios (loja_id, nome, email, senha, perfil, nivel_acesso, ativo)
VALUES (
    1, 
    'Administrador', 
    'adm.nomedaloja', 
    crypt('senha123', gen_salt('bf')), 
    'admin', 
    'admin', 
    true
);

-- 4. Ajustar sequences
SELECT setval('public.lojas_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.lojas));
SELECT setval('public.usuarios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.usuarios));
```

### Opção B: Via "Primeiro Acesso" na Tela de Login
1. Acesse a tela de login (`index.html`).
2. Clique no botão: **✨ Primeiro Acesso? Identificar Loja por CNPJ**.
3. Digite o CNPJ cadastrado no `config.json`.
4. O sistema identificará a loja e solicitará a criação da senha do usuário `adm.<prefixo>`.

---

## ⚙️ Passo 6: Compilar e Atualizar o Manifesto

Para que o sistema registre o novo cliente no catálogo global `clients.json` e na pasta `/dist`, execute no terminal:

```bash
node build.js
```

Ou se quiser compilar especificamente para esse cliente:
```bash
node build.js cliente03
```

> **Nota:** O `build.js` varre automaticamente todas as subpastas dentro de `clients/` e regenera o catálogo `clients.json` e `dist/clients.json`.

---

## 🚀 Passo 7: Enviar para o GitHub (Deploy Automático)

No terminal:
```bash
git add .
git commit -m "feat: adiciona cliente03 (Nome do Cliente)"
git push origin main
```

- O **Render** detectará o commit e atualizará o backend automaticamente.
- O **GitHub Pages** publicará a versão estática atualizada em instantes.

---

## 🔑 Como o Novo Cliente Acessa o Sistema

1. O cliente entra no link:
   `https://aionerp.github.io/erp/` (ou no domínio oficial).
2. No campo **Usuário**, ele digita:
   `adm.nomedaloja`
3. O sistema detecta o prefixo `nomedaloja`, conecta instantaneamente à base Neon do `cliente03` e carrega o painel com isolamento total.

---

## ✅ Checklist Rápido de Verificação

- [ ] Banco de dados provisionado no Neon
- [ ] Schema executado via `node scripts/migration/02_setup_neon_schema.js clienteXX`
- [ ] Variável `CLIENTEXX_DATABASE_URL` adicionada no `.env` e no Render
- [ ] Pasta `clients/clienteXX/config.json` criada com o prefixo correto
- [ ] Usuário `adm.<prefixo>` criado no banco com `crypt('senha', gen_salt('bf'))`
- [ ] Comando `node build.js` executado
- [ ] Alterações enviadas via `git push origin main`
