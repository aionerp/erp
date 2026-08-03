// js/export-helper.js
// Biblioteca de exportação para Excel e PDF

/**
 * Exporta uma tabela HTML para Excel (CSV compatível com Excel)
 * @param {string} tableId - ID da tabela HTML
 * @param {string} nomeArquivo - Nome do arquivo a ser salvo
 */
function exportarTabelaParaExcel(tableId, nomeArquivo) {
    const table = document.getElementById(tableId);
    if (!table) {
        mostrarNotificacao('Erro: Tabela não encontrada para exportação', 'error');
        return;
    }
    
    const rows = Array.from(table.querySelectorAll('tr'));
    const dados = [];
    
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        // Ignorar a última coluna se contiver ações (botões, etc.)
        const rowData = [];
        cells.forEach((cell, idx) => {
            if (idx === cells.length - 1 && (cell.querySelector('button') || cell.classList.contains('table-actions') || cell.classList.contains('acoes'))) {
                return; // Ignora coluna de ações
            }
            // Limpa o texto de quebras de linha e ponto e vírgula
            let texto = cell.innerText.trim().replace(/[\n\r]+/g, ' ').replace(/;/g, ',');
            rowData.push(texto);
        });
        if (rowData.length > 0) {
            dados.push(rowData);
        }
    });
    
    if (dados.length === 0) {
        mostrarNotificacao('Nenhum dado para exportar', 'warning');
        return;
    }
    
    try {
        const csv = dados.map(row => row.join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        mostrarNotificacao('Exportação Excel (CSV) concluída!', 'success');
    } catch (error) {
        console.error('Erro ao exportar Excel:', error);
        mostrarNotificacao('Erro ao exportar dados', 'error');
    }
}

/**
 * Exporta uma tabela HTML para PDF usando diálogo de impressão nativo
 * @param {string} tableId - ID da tabela HTML
 * @param {string} titulo - Título do PDF
 * @param {string} subtitulo - Subtítulo do PDF
 */
function exportarTabelaParaPDF(tableId, titulo, subtitulo = '') {
    const table = document.getElementById(tableId);
    if (!table) {
        mostrarNotificacao('Erro: Tabela não encontrada para exportação', 'error');
        return;
    }
    
    const clone = table.cloneNode(true);
    // Remover colunas de ações
    const rows = Array.from(clone.querySelectorAll('tr'));
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        if (cells.length > 0) {
            const lastCell = cells[cells.length - 1];
            if (lastCell.querySelector('button') || lastCell.classList.contains('table-actions') || lastCell.classList.contains('acoes')) {
                lastCell.remove();
            }
        }
    });
    
    const dataHora = new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    
    const janela = window.open('', '_blank', 'width=900,height=700');
    if (!janela) {
        mostrarNotificacao('Permita popups neste site para exportar PDF!', 'warning');
        return;
    }
    
    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${titulo}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            color: #333;
            padding: 25px 30px;
            background: #fff;
        }
        .pdf-header {
            text-align: center;
            border-bottom: 3px solid #0A4D68;
            padding-bottom: 14px;
            margin-bottom: 20px;
        }
        .pdf-header h1 {
            color: #0A4D68;
            font-size: 20px;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .pdf-header p { color: #666; font-size: 11px; margin-top: 3px; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0 18px 0;
            font-size: 11px;
        }
        th {
            background-color: #0A4D68;
            color: #fff;
            padding: 8px 10px;
            text-align: left;
            font-weight: bold;
        }
        td {
            padding: 6px 10px;
            border-bottom: 1px solid #e0e0e0;
            vertical-align: middle;
        }
        tr:nth-child(even) td { background-color: #f9f9f9; }
        .pdf-footer {
            margin-top: 30px;
            border-top: 1px solid #ccc;
            padding-top: 8px;
            font-size: 10px;
            color: #777;
            display: flex;
            justify-content: space-between;
        }
        @media print {
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>
    <div class="pdf-header">
        <h1>${titulo}</h1>
        \${subtitulo ? \`<p>\${subtitulo}</p>\` : ''}
        <p>Gerado em: \${dataHora}</p>
    </div>
    
    \${clone.outerHTML}
    
    <div class="pdf-footer">
        <span>Aion ERP - Relatório Oficial</span>
        <span>Página 1 de 1</span>
    </div>
    
    <div class="no-print" style="margin-top: 20px; text-align: center;">
        <button onclick="window.print()" style="padding: 10px 20px; background: #0A4D68; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Imprimir / Salvar PDF</button>
        <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-left: 10px;">Fechar</button>
    </div>
</body>
</html>`);
    janela.document.close();
}

// Tornar funções globais
window.exportarTabelaParaExcel = exportarTabelaParaExcel;
window.exportarTabelaParaPDF = exportarTabelaParaPDF;
