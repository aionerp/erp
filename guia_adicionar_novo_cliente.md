# 🚀 Guia Rápido: Como Adicionar Novos Clientes ao Aion ERP

Este guia foi simplificado para ser direto e sem complicações.  
Em **menos de 3 minutos**, você adiciona um novo cliente com banco de dados isolado, 21 tabelas criadas de uma única vez e pronto para uso.

---

## 📌 Clientes Atualmente Ativos no Sistema

Atualmente, o sistema conta com **apenas 2 clientes ativos**:

| ID | Cliente / Empresa | Prefixo de Login | Provedor de Banco | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`cliente01`** | **Aion ERP** (*AionERP Oficial*) | `aionerp` | Neon PostgreSQL | 🟢 Ativo |
| **`cliente02`** | **Original Eletrônicos** (*E-commerce Original Eletronico*) | `originaleletronico` | Neon PostgreSQL | 🟢 Ativo |

> Qualquer novo cliente cadastrado será o **`cliente03`**, **`cliente04`**, etc.

---

## 🧭 O Processo em 3 Passos Simples

```text
[Passo 1] Criar Banco no Neon ➔ [Passo 2] Rodar SQL Completo ➔ [Passo 3] Cadastrar Pasta e Fazer Build
```

---

## 🛠️ Passo 1: Criar o Banco de Dados no Neon

1. Acesse o console do **[Neon](https://console.neon.tech/)**.
2. Clique em **New Project** e dê um nome (ex: `cliente03-db`).
3. Copie a **Connection String** do tipo PostgreSQL:
   ```text
   postgresql://neondb_owner:SENHA_AQUI@ep-exemplo.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## ⚡ Passo 2: Executar o SQL Completo (Execução Única)

O arquivo `database/schema_completo.sql` contém **100% da estrutura do ERP**:
- 21 tabelas (Vendas, Produtos, Seriais/IMEI, Lotes, Recorrência/Assinaturas, Financeiro, etc.)
- Triggers automáticos de senha criptografada em bcrypt
- Funções de autenticação e isolamento por loja
- Carga inicial pronta: Loja Matriz, configurações e usuário administrador `adm.padrao` (senha: `123`).

Você pode rodar de **uma única vez** escolhendo uma das duas opções:

### 👉 Opção A: Direto pelo Navegador no Neon (Mais fácil)
1. No painel do Neon, clique na aba **SQL Editor**.
2. Abra o arquivo `database/schema_completo.sql` no seu VS Code/Editor, copie todo o conteúdo e cole no SQL Editor do Neon.
3. Clique em **Run** (Executar).  
   *Em 3 segundos, todas as 21 tabelas e dados iniciais estarão criados!*

---

### 👉 Opção B: Automático via Linha de Comando (Via Terminal)
1. No seu arquivo `.env`, adicione a connection string do novo cliente:
   ```env
   CLIENTE03_DATABASE_URL=postgresql://neondb_owner:SENHA_AQUI@ep-exemplo.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
2. No terminal do projeto, execute o comando:
   ```bash
   node scripts/migration/02_setup_neon_schema.js cliente03
   ```
   *O script conecta no Neon, cria todas as tabelas e funções automaticamente.*

---

## 📁 Passo 3: Configurar a Loja no ERP

### 3.1 Criar a pasta do cliente
Crie a pasta `clients/cliente03/` e dentro dela crie o arquivo `config.json`:

**Caminho:** `clients/cliente03/config.json`

```json
{
  "clientId": "cliente03",
  "companyName": "Nome da Nova Loja",
  "companySubtitle": "Unidade Centro",
  "prefix": "novaloja",
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

> **Atenção:**  
> - `prefix`: É o sufixo que o cliente usa para logar (ex: se for `novaloja`, o login será `adm.novaloja`).  
> - `connectionId`: Deve ser exatamente o mesmo código da pasta (`cliente03`).

---

### 3.2 Adicionar a variável no Render (Servidor de Produção)
1. Acesse seu painel no **[Render.com](https://render.com/)**.
2. Vá no serviço do backend ➔ aba **Environment**.
3. Adicione a variável `CLIENTE03_DATABASE_URL` com a connection string do Neon.
4. Salve as alterações.

---

### 3.3 Compilar o Sistema e Publicar
No terminal, execute o build para atualizar o catálogo:

```bash
node build.js
```

E envie para o repositório Git:
```bash
git add .
git commit -m "feat: adicionado cliente03 - Nome da Loja"
git push origin main
```

---

## 🔑 Como Acessar a Nova Loja

Assim que o banco for provisionado, o acesso inicial pode ser feito de duas formas:

### 1. Login com o Administrador Padrão
- **Usuário:** `adm.padrao`
- **Senha:** `123`
- Ao entrar, acesse o menu **Usuários** para alterar a senha ou criar novos colaboradores.

### 2. Pelo botão "Primeiro Acesso por CNPJ"
- Na tela de login, clique em **✨ Primeiro Acesso? Identificar Loja por CNPJ**.
- Digite o CNPJ cadastrado no `config.json`.
- O sistema reconhece a loja e solicita a criação da senha de administrador personalizada.

---

## 📋 Resumo das 21 Tabelas Provisionadas

O script `database/schema_completo.sql` cria automaticamente:
1. `lojas` — Cadastro da empresa
2. `usuarios` — Usuários e operadores com senhas criptografadas em bcrypt
3. `categorias` — Categorias de produtos e serviços
4. `clientes` — Cadastro de clientes e dados fiscais
5. `colaboradores` — Vendedores e técnicos com comissão
6. `produtos` — Produtos e serviços (com suporte a lotes, seriais e recorrência)
7. `produtos_seriais` — Controle de seriais e IMEI
8. `entradas` — Compras e notas de entrada de mercadorias
9. `entrada_itens` — Itens de compras
10. `caixas` — Abertura, fechamento e controle de caixa
11. `saidas` — Vendas e pedidos
12. `saida_itens` — Itens vendidos com descontos e promoções
13. `despesas` — Contas a pagar e custos operacionais
14. `boletos_pagar` — Gestão de boletos a pagar
15. `movimentos_estoque` — Kardex e rastreamento de estoque
16. `config_loja` — Configurações da loja e módulos ativos
17. `agendamentos` — Módulo de agendamentos e serviços
18. `mesas_comandas` — Módulo de mesas e comandas
19. `promocoes` — Campanhas e regras promocionais
20. `promocao_produtos` — Produtos vinculados a promoções
21. `servicos_recorrentes` — Assinaturas, planos mensais e controle de vencimentos
