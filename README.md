# Aion ERP — CORE Centralizado

Este repositório contém o código-fonte unificado do **Aion ERP** configurado para operar em formato **multicliente**.

Todas as melhorias, correções de bugs e novas funcionalidades devem ser desenvolvidas diretamente neste repositório CORE. Os builds individuais de cada cliente são gerados dinamicamente com base nas configurações isoladas na pasta `/clients`.

---

## 🚀 Como Começar

1. **Clonar o Repositório:**
   ```bash
   git clone https://github.com/aionerp/erp.git
   ```

2. **Configuração Multicliente:**
   Toda a documentação detalhada sobre arquitetura, injeção de identidade visual (branding), ativação de funcionalidades (Feature Flags) e automação de builds e deploys está disponível no manual oficial:
   * **[Manual de Arquitetura Multicliente (MULTICLIENTE.md)](MULTICLIENTE.md)**

3. **Instalação e Scripts:**
   ```bash
   # Executar servidor de desenvolvimento local
   npm run dev
   
   # Gerar build estático para o Cliente 01
   npm run build:cliente01
   
   # Servir localmente os arquivos compilados do Cliente 01
   npm run serve
   ```
