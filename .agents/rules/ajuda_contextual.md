# Regra: Ajuda Contextual Inteligente Obrigatória

Esta regra define a obrigatoriedade de adicionar ajuda contextual inteligente para todos os novos componentes, indicadores, dashboards ou telas desenvolvidos no ERP.

## Diretrizes

1. **Uso do Ícone ℹ️**:
   - Todo componente (tabela, KPI, gráfico, dashboard, formulário ou relatório) deve possuir um ícone informativo ao lado de seu título ou elemento principal.
   - Formato HTML recomendado: `<span class="ajuda-btn" data-help-id="identificador_unico">ℹ️</span>`

2. **Inclusão no Script de Ajuda**:
   - O identificador deve ser registrado no banco de dados de ajuda contido em `js/ajuda.js`.
   - A documentação de cada item no banco de dados deve preencher as seguintes seções estruturadas:
     - **Objetivo**: O que a funcionalidade faz de forma simples.
     - **Como é calculado**: Fórmulas, regras e filtros utilizados.
     - **Origem dos dados**: Tabelas do banco ou integrações envolvidas.
     - **Atualização**: Tempo real ou processamento/sincronização assíncrona.
     - **Interpretação**: Significado dos resultados (valores altos, baixos, negativos ou percentuais).
     - **Boas práticas**: Dicas de utilização e análise.
     - **Observações**: Limitações ou exceções.
     - **Atalhos**: Links para telas, relatórios ou cadastros relacionados.
     - **Exemplo prático**: Exemplo real e simples para facilitar o entendimento.

3. **Linguagem**:
   - Linguagem clara, simples, direta e profissional.
   - Evitar jargões excessivamente técnicos sem explicação prévia.
   - Siglas explicadas na primeira menção.
