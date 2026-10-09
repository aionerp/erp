// js/importacao.js
// Lógica de importação de dados por planilhas Excel e CSV utilizando Supabase e SheetJS

let entidadeSelecionada = '';
let dadosCarregados = [];
let linhasDesconsideradasGlobal = [];
let colunasMapeadas = {};
let usuarioLogado = null;
let categoriasCache = [];
let categoriasMetaMap = {};

// Helper para converter números monetários com vírgula ou ponto
function parseNumeroMoeda(val) {
    if (val === undefined || val === null || val === '') return null;
    let s = String(val).trim().replace('R$', '').trim();
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

// Aliases para mapeamento inteligente de colunas
const camposMapeamento = {
    clientes: {
        nome: ['nome', 'cliente', 'razaosocial', 'nomecompleto'],
        telefone: ['telefone', 'tel', 'celular', 'cel', 'contato'],
        email: ['email', 'mail', 'correioeletronico'],
        cpf_cnpj: ['cpfcnpj', 'cpf', 'cnpj', 'documento', 'doc', 'cpf_cnpj'],
        endereco: ['endereco', 'logradouro', 'rua', 'avenida', 'end'],
        numero: ['numero', 'num'],
        bairro: ['bairro'],
        cidade: ['cidade', 'municipio'],
        estado: ['estado', 'uf'],
        cep: ['cep'],
        observacao: ['observacao', 'obs', 'detalhes', 'observacoes']
    },
    fornecedores: {
        nome: ['nome', 'fornecedor', 'razaosocial', 'fantasia', 'nomecompleto'],
        telefone: ['telefone', 'tel', 'celular', 'cel', 'contato'],
        email: ['email', 'mail'],
        documento: ['documento', 'doc', 'cnpj', 'cpf', 'cpfcnpj', 'cnpjcpf'],
        endereco: ['endereco', 'rua', 'avenida', 'logradouro', 'end'],
        observacao: ['observacao', 'obs', 'detalhes', 'observacoes']
    },
    produtos: {
        codigo: ['codigo', 'cod', 'sku', 'id', 'referencia', 'codigoproduto'],
        nome: ['nome', 'produto', 'titulo', 'nomeproduto'],
        tipo: ['tipo', 'classificacao', 'tiposervico'],
        categoria: ['categoria', 'grupo', 'secao'],
        marca: ['marca', 'fabricante'],
        modelo: ['modelo'],
        descricao: ['descricao', 'descricaodetalhada', 'obs', 'detalhes', 'observacoes', 'detalhe'],
        valor_compra: ['valorcompra', 'precocompra', 'compra', 'custo', 'valor_compra', 'precocusto'],
        valor_venda: ['valorvenda', 'precovenda', 'venda', 'preco', 'valor_venda'],
        estoque_minimo: ['estoqueminimo', 'minimo', 'estoque_minimo'],
        estoque_total: ['estoquetotal', 'estoque', 'quantidade', 'qtd', 'estoque_total'],
        garantia_dias: ['garantiadias', 'garantia', 'garantia_dias'],
        codigos_barras: ['codigosbarras', 'codigobarras', 'barras', 'ean', 'codigos_barras'],
        numeros_serie: ['numerosserie', 'numerosdeserie', 'seriais', 'serial', 'numeros_serie'],
        imeis: ['imeis', 'imei']
    }
};

// Configurações e Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));
    if (!usuarioLogado) {
        window.location.href = 'index.html';
        return;
    }

    // Carregar informações das categorias do banco de dados
    await carregarMetadadosCategorias();

    // Eventos de drag and drop
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect({ target: fileInput });
        }
    });

    fileInput.addEventListener('change', handleFileSelect);

    // Confirmar e iniciar importação
    document.getElementById('btn-iniciar-importacao').addEventListener('click', executarImportacao);

    // Concluir e voltar
    document.getElementById('btn-concluir').addEventListener('click', () => {
        window.location.reload();
    });
});

// Carregar categorias ativas para validações
async function carregarMetadadosCategorias() {
    try {
        const { data, error } = await supabaseClient
            .from('categorias')
            .select('*')
            .eq('ativo', true);
        
        if (error) throw error;
        
        categoriasCache = (data || []).map(c => c.nome);
        (data || []).forEach(c => {
            categoriasMetaMap[c.nome] = {
                exige_serial: c.exige_serial || false,
                exige_imei: c.exige_imei || false,
                controla_lote: c.controla_lote_validade || false
            };
        });
    } catch (e) {
        console.error('Erro ao carregar metadados de categorias:', e);
    }
}

// Selecionar tipo de entidade (card clicado)
function selecionarEntidade(tipo) {
    entidadeSelecionada = tipo;
    
    // Toggle active classes on cards
    document.querySelectorAll('.import-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`card-${tipo}`).classList.add('active');

    // Show sections 2 and 3
    document.getElementById('secao-modelo').style.display = 'block';
    document.getElementById('secao-upload').style.display = 'block';

    // Hide preview in case of toggling
    document.getElementById('preview-container').style.display = 'none';
    document.getElementById('file-input').value = '';

    // Render instruction text and required fields
    renderizarInfoColunas(tipo);
}

// Renderizar informações explicativas de colunas
function renderizarInfoColunas(tipo) {
    const infoDiv = document.getElementById('colunas-info');
    let html = '';

    if (tipo === 'clientes') {
        html = `
            <strong>📌 Informações de Colunas para Clientes:</strong>
            <ul style="margin-left: 20px; margin-top: 8px;">
                <li><strong>Nome</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Nome completo ou Razão Social.</li>
                <li><strong>Telefone</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Contato telefônico.</li>
                <li><strong>Email</strong>: Endereço de email do cliente.</li>
                <li><strong>CPF_CNPJ</strong>: Cadastro de Pessoa Física ou Jurídica.</li>
                <li><strong>Endereco, Numero, Bairro, Cidade, Estado (UF), CEP</strong>: Dados de localização.</li>
                <li><strong>Observacao</strong>: Notas adicionais sobre o cliente.</li>
            </ul>
        `;
    } else if (tipo === 'fornecedores') {
        html = `
            <strong>📌 Informações de Colunas para Fornecedores:</strong>
            <ul style="margin-left: 20px; margin-top: 8px;">
                <li><strong>Nome</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Nome Fantasia ou Razão Social do Fornecedor.</li>
                <li><strong>Telefone</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Contato do fornecedor.</li>
                <li><strong>Email</strong>: Endereço de email para compras.</li>
                <li><strong>Documento</strong>: CNPJ ou CPF fiscal.</li>
                <li><strong>Endereco</strong>: Endereço comercial completo.</li>
                <li><strong>Observacao</strong>: Linhas de produtos ou notas de fornecimento.</li>
            </ul>
        `;
    } else if (tipo === 'produtos') {
        html = `
            <strong>📌 Informações de Colunas para Produtos:</strong>
            <p style="margin-top: 6px; margin-bottom: 8px; color: #495057;">
                <strong>⚠️ Trava de Validação:</strong> Para importar produtos, as seguintes 9 colunas são <strong>obrigatórias</strong> e devem estar preenchidas em todas as linhas. Se alguma linha tiver qualquer um desses 9 campos em branco, essa linha será desconsiderada e o sistema importará os demais produtos válidos:
            </p>
            <ul style="margin-left: 20px; margin-top: 4px;">
                <li><strong>Codigo</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Código SKU interno único (letras e números).</li>
                <li><strong>Nome</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Título descritivo do produto ou serviço.</li>
                <li><strong>Tipo</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Indicar <code>produto</code> ou <code>servico</code>.</li>
                <li><strong>Categoria</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Categoria (Ex: Celulares, Acessórios). Se não existir, será criada automaticamente.</li>
                <li><strong>Marca</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Fabricante ou marca do item.</li>
                <li><strong>Modelo</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Modelo ou identificador técnico do produto.</li>
                <li><strong>Descricao</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Descrição detalhada do produto ou serviço.</li>
                <li><strong>Valor_Compra</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Preço de custo (ex: 120.50 ou 0 para serviços).</li>
                <li><strong>Valor_Venda</strong> <span style="color: #dc3545; font-weight: bold;">(Obrigatório)</span>: Preço de venda comercial (mínimo R$ 0,01).</li>
                <li style="margin-top: 6px; color: #6c757d;"><strong>Estoque_Minimo / Estoque_Total</strong> <em>(Opcionais)</em>: Estoque de segurança e estoque físico atual.</li>
                <li style="color: #6c757d;"><strong>Garantia_Dias</strong> <em>(Opcional)</em>: Tempo de garantia em dias.</li>
                <li style="color: #6c757d;"><strong>Codigos_Barras</strong> <em>(Opcional)</em>: Códigos de barras (EAN/GTIN) separados por vírgula.</li>
                <li style="color: #6c757d;"><strong>Numeros_Serie / IMEIs</strong> <em>(Opcionais)</em>: Números de série ou IMEIs separados por vírgula para categorias serializadas.</li>
            </ul>
        `;
    }

    infoDiv.innerHTML = html;
}

// Download de modelo dinâmico
function baixarModeloFormato(formato) {
    if (!entidadeSelecionada) return;

    let headers = [];
    let sampleData = [];

    if (entidadeSelecionada === 'clientes') {
        headers = ['Nome', 'Telefone', 'Email', 'CPF_CNPJ', 'Endereco', 'Numero', 'Bairro', 'Cidade', 'Estado', 'CEP', 'Observacao'];
        sampleData = [
            ['João da Silva', '(11) 98888-8888', 'joao@email.com', '123.456.789-00', 'Rua das Flores', '100', 'Centro', 'São Paulo', 'SP', '01001-000', 'Cliente prioritário'],
            ['Maria Oliveira Santos', '(21) 97777-7777', 'maria.santos@email.com', '22.333.444/0001-55', 'Av. Atlântica', '1050', 'Copacabana', 'Rio de Janeiro', 'RJ', '22010-000', '']
        ];
    } else if (entidadeSelecionada === 'fornecedores') {
        headers = ['Nome', 'Telefone', 'Email', 'Documento', 'Endereco', 'Observacao'];
        sampleData = [
            ['Distribuidora Tech Brasil', '(11) 3333-4444', 'pedidos@techbrasil.com.br', '12.345.678/0001-99', 'Av. Paulista, 1000 - São Paulo/SP', 'Fornecedor de smartphones e cases'],
            ['Importadora Central Ltda', '(47) 99999-1111', 'comercial@importadoracentral.com', '98.765.432/0001-00', 'Rua do Porto, 45 - Itajaí/SC', 'Foco em peças de reposição']
        ];
    } else if (entidadeSelecionada === 'produtos') {
        headers = ['Codigo', 'Nome', 'Tipo', 'Categoria', 'Marca', 'Modelo', 'Descricao', 'Valor_Compra', 'Valor_Venda', 'Estoque_Minimo', 'Estoque_Total', 'Garantia_Dias', 'Codigos_Barras', 'Numeros_Serie', 'IMEIs'];
        sampleData = [
            ['PROD001', 'iPhone 13 Apple 128GB', 'produto', 'Celulares', 'Apple', 'A2633', 'Smartphone Apple original', '4200.00', '5499.00', '5', '2', '365', '7891234567890, 7891234567891', 'SNIPH13-001, SNIPH13-002', '351234567890123, 351234567890124'],
            ['PROD002', 'Cabo Lightning USB 1m', 'produto', 'Acessórios', 'Genérico', 'Lightning 1m', 'Cabo de dados e carga', '12.90', '49.90', '15', '30', '90', '7899999999999', '', ''],
            ['SERV001', 'Manutenção Troca Tela Frontal', 'servico', 'Serviços', 'Aion', 'Consertos', 'Mão de obra de troca de tela de smartphone', '0.00', '180.00', '0', '1', '90', '', '', '']
        ];
    }

    if (formato === 'xlsx') {
        const wb = XLSX.utils.book_new();
        const wsData = [headers, ...sampleData];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Modelo Importacao");
        XLSX.writeFile(wb, `modelo_${entidadeSelecionada}.xlsx`);
    } else {
        const wsData = [headers, ...sampleData];
        const csvContent = wsData.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `modelo_${entidadeSelecionada}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Normalizar texto para correspondência de cabeçalho
function normalizar(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

// Processar arquivo selecionado
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Converter planilha para array de arrays (raw cells)
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (rawRows.length === 0) {
                mostrarAlertaValidacao('O arquivo selecionado está vazio!', false);
                return;
            }

            processarDadosPlanilha(rawRows);
        } catch (err) {
            console.error('Erro ao ler planilha:', err);
            mostrarAlertaValidacao('Erro ao decodificar a planilha. Verifique o formato do arquivo.', false);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Cruzar cabeçalhos com aliases e ler dados
function processarDadosPlanilha(rawRows) {
    const headers = rawRows[0].map(h => String(h).trim());
    const dataRows = rawRows.slice(1).filter(r => r.length > 0 && r.some(cell => cell !== '' && cell !== undefined)); // Evita linhas vazias
    
    // Encontrar índices correspondentes no mapeamento de aliases
    const aliases = camposMapeamento[entidadeSelecionada];
    colunasMapeadas = {};
    const colunasFaltantes = [];
    const indicesUsados = new Set();

    // Obrigatoriedades de colunas no cabeçalho
    const obrigatorios = {
        clientes: ['nome', 'telefone'],
        fornecedores: ['nome', 'telefone'],
        produtos: ['codigo', 'nome', 'tipo', 'categoria', 'marca', 'modelo', 'descricao', 'valor_compra', 'valor_venda']
    };

    // Checar quais campos foram mapeados
    for (let campo in aliases) {
        let index = -1;
        
        // Procurar nas colunas
        for (let i = 0; i < headers.length; i++) {
            if (indicesUsados.has(i)) continue;
            const headerNorm = normalizar(headers[i]);
            if (aliases[campo].includes(headerNorm)) {
                index = i;
                break;
            }
        }
        
        if (index !== -1) {
            colunasMapeadas[campo] = index;
            indicesUsados.add(index);
        } else {
            // Verificar obrigatoriedade no cabeçalho
            if (obrigatorios[entidadeSelecionada] && obrigatorios[entidadeSelecionada].includes(campo)) {
                colunasFaltantes.push(campo.toUpperCase());
            }
        }
    }

    if (colunasFaltantes.length > 0) {
        mostrarAlertaValidacao(`Erro de Estrutura: As colunas obrigatórias <strong>${colunasFaltantes.join(', ')}</strong> não foram encontradas no cabeçalho da planilha. Corrija o cabeçalho e tente novamente.`, false);
        document.getElementById('preview-container').style.display = 'none';
        return;
    }

    // Criar objetos de dados mapeados e validar linha a linha
    const todosItensMapeados = [];
    const linhasValidas = [];
    const linhasDesconsideradas = [];

    dataRows.forEach((row, idx) => {
        const item = { _linha: idx + 2, _rawRow: row };
        
        for (let campo in colunasMapeadas) {
            const val = row[colunasMapeadas[campo]];
            item[campo] = val !== undefined && val !== null ? String(val).trim() : '';
        }

        const camposFaltando = [];

        if (entidadeSelecionada === 'produtos') {
            const camposObrigatoriosProdutos = [
                { campo: 'codigo', nome: 'Codigo' },
                { campo: 'nome', nome: 'Nome' },
                { campo: 'tipo', nome: 'Tipo' },
                { campo: 'categoria', nome: 'Categoria' },
                { campo: 'marca', nome: 'Marca' },
                { campo: 'modelo', nome: 'Modelo' },
                { campo: 'descricao', nome: 'Descricao' },
                { campo: 'valor_compra', nome: 'Valor_Compra' },
                { campo: 'valor_venda', nome: 'Valor_Venda' }
            ];

            camposObrigatoriosProdutos.forEach(c => {
                if (!item[c.campo] || item[c.campo] === '') {
                    camposFaltando.push(c.nome);
                }
            });

            // Validação numérica adicional dos valores
            if (item.valor_compra !== '') {
                const nCompra = parseNumeroMoeda(item.valor_compra);
                if (nCompra === null || isNaN(nCompra)) {
                    camposFaltando.push('Valor_Compra (numérico inválido)');
                }
            }

            if (item.valor_venda !== '') {
                const nVenda = parseNumeroMoeda(item.valor_venda);
                if (nVenda === null || isNaN(nVenda) || nVenda < 0.01) {
                    camposFaltando.push('Valor_Venda (numérico inválido ou menor que R$ 0,01)');
                }
            }
        } else if (entidadeSelecionada === 'clientes' || entidadeSelecionada === 'fornecedores') {
            if (!item.nome) camposFaltando.push('Nome');
            if (!item.telefone) camposFaltando.push('Telefone');
        }

        if (camposFaltando.length > 0) {
            item._desconsiderado = true;
            item._motivoDesconsiderado = `Campo(s) em branco ou inválido(s): ${camposFaltando.join(', ')}`;
            linhasDesconsideradas.push(item);
        } else {
            item._desconsiderado = false;
            linhasValidas.push(item);
        }

        todosItensMapeados.push(item);
    });

    dadosCarregados = linhasValidas;
    linhasDesconsideradasGlobal = linhasDesconsideradas;

    // Exibir na tabela de preview os registros com status
    gerarTabelaPreview(headers, todosItensMapeados.slice(0, 15));
    
    // Validar logicamente os dados carregados válidos
    const errosValida = realizarPreValidacao();

    const btnConfirmar = document.getElementById('btn-iniciar-importacao');
    const totalLinhas = dataRows.length;
    const totalValidas = linhasValidas.length;
    const totalDesconsideradas = linhasDesconsideradas.length;

    if (totalValidas === 0) {
        document.getElementById('txt-total-linhas').innerHTML = 
            `Planilha: <strong>${totalLinhas} linhas</strong> | ` +
            `<span style="color: #dc3545; font-weight: bold;">0 válidas</span> | ` +
            `<span style="color: #dc3545; font-weight: bold;">${totalDesconsideradas} desconsideradas</span>`;

        mostrarAlertaValidacao(`Nenhuma linha atende aos requisitos obrigatórios. Todas as <strong>${totalDesconsideradas} linha(s)</strong> possuem campos obrigatórios em branco e foram desconsideradas.<br>Para produtos, é obrigatório preencher: <em>Codigo, Nome, Tipo, Categoria, Marca, Modelo, Descricao, Valor_Compra, Valor_Venda</em>. A importação não pode continuar até que as linhas sejam corrigidas.`, false);
        btnConfirmar.disabled = true;
    } else if (totalDesconsideradas > 0) {
        document.getElementById('txt-total-linhas').innerHTML = 
            `Planilha: <strong>${totalLinhas} linhas</strong> | ` +
            `<span style="color: #28a745; font-weight: bold;">${totalValidas} válidas</span> | ` +
            `<span style="color: #dc3545; font-weight: bold;">${totalDesconsideradas} desconsideradas</span>`;

        let msg = `Foram encontrados <strong>${totalValidas} registro(s) válido(s)</strong> para importação. <br>⚠️ <strong>${totalDesconsideradas} registro(s) foram desconsiderados</strong> por conterem campos obrigatórios em branco. O sistema seguirá importando apenas os <strong>${totalValidas}</strong> registros válidos.`;
        if (errosValida.length > 0) {
            msg += `<br><br>⚠️ <strong>Avisos adicionais (${errosValida.length}):</strong><br><small>${errosValida.slice(0, 3).join('<br>')}</small>`;
        }
        mostrarAlertaValidacao(msg, true);
        btnConfirmar.disabled = false;
    } else {
        document.getElementById('txt-total-linhas').innerHTML = 
            `Planilha: <strong>${totalLinhas} linhas</strong> | ` +
            `<span style="color: #28a745; font-weight: bold;">${totalValidas} válidas</span> | ` +
            `<span style="color: #6c757d;">0 desconsideradas</span>`;

        if (errosValida.length > 0) {
            mostrarAlertaValidacao(`Todas as <strong>${totalValidas} linhas</strong> possuem os campos obrigatórios preenchidos, porém foram identificados ${errosValida.length} avisos de seriais/estoque.<br><small>${errosValida.slice(0, 3).join('<br>')}</small>`, true);
        } else {
            mostrarAlertaValidacao(`Validação 100% concluída! Todas as <strong>${totalValidas} linhas</strong> atendem a todos os requisitos obrigatórios e serão importadas com sucesso.`, true, true);
        }
        btnConfirmar.disabled = false;
    }

    document.getElementById('preview-container').style.display = 'block';
}

// Exibir tabela de preview das primeiras linhas com indicação de status
function gerarTabelaPreview(headers, itensPreview) {
    const table = document.getElementById('tabela-preview');
    table.innerHTML = '';

    // Cabeçalho
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');

    const thStatus = document.createElement('th');
    thStatus.textContent = 'Status da Linha';
    thStatus.style.minWidth = '160px';
    thStatus.style.textAlign = 'center';
    trHead.appendChild(thStatus);

    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    itensPreview.forEach(item => {
        const tr = document.createElement('tr');
        
        // Coluna Status
        const tdStatus = document.createElement('td');
        tdStatus.style.textAlign = 'center';
        tdStatus.style.verticalAlign = 'middle';
        
        if (item._desconsiderado) {
            tr.style.backgroundColor = '#fff5f5';
            tdStatus.innerHTML = `<span style="background: #f8d7da; color: #721c24; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; display: inline-block; border: 1px solid #f5c6cb;">❌ Desconsiderado</span><br><small style="font-size: 10px; color: #dc3545; display: block; margin-top: 2px;">${item._motivoDesconsiderado}</small>`;
        } else {
            tdStatus.innerHTML = `<span style="background: #d4edda; color: #155724; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; display: inline-block; border: 1px solid #c3e6cb;">🟢 Válido</span>`;
        }
        tr.appendChild(tdStatus);

        // Células de dados
        const rawRow = item._rawRow || [];
        headers.forEach((_, idx) => {
            const td = document.createElement('td');
            const val = rawRow[idx] !== undefined && rawRow[idx] !== null ? String(rawRow[idx]).trim() : '';
            td.textContent = val;
            if (item._desconsiderado && val === '') {
                td.style.backgroundColor = '#ffe3e6';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

// Validar dados carregados na memória
function realizarPreValidacao() {
    const erros = [];
    
    dadosCarregados.forEach(row => {
        // Validações básicas por tipo
        if (entidadeSelecionada === 'clientes' || entidadeSelecionada === 'fornecedores') {
            if (!row.nome) {
                erros.push(`Linha ${row._linha}: Nome está em branco.`);
            }
            if (!row.telefone) {
                erros.push(`Linha ${row._linha}: Telefone está em branco.`);
            }
        } else if (entidadeSelecionada === 'produtos') {
            // Validar seriais se aplicável
            if (row.categoria) {
                const meta = categoriasMetaMap[row.categoria];
                if (meta && (meta.exige_serial || meta.exige_imei)) {
                    const totalEstoque = parseInt(row.estoque_total) || 0;
                    const seriais = row.numeros_serie ? row.numeros_serie.split(',').map(s => s.trim()).filter(s => s) : [];
                    if (seriais.length !== totalEstoque) {
                        erros.push(`Linha ${row._linha}: A categoria "${row.categoria}" exige Números de Série. Foram informados ${seriais.length} seriais para estoque de ${totalEstoque}.`);
                    }
                }
            }
        }
    });

    return erros;
}

// Mostrar alertas de validação na tela
function mostrarAlertaValidacao(mensagem, isAviso = false, isCompletamenteValido = false) {
    const card = document.getElementById('validacao-resumo');
    card.style.display = 'block';

    if (isCompletamenteValido) {
        card.className = 'validation-card valid';
        card.innerHTML = `<strong>🟢 Validação Concluída:</strong> ${mensagem}`;
    } else if (isAviso) {
        card.className = 'validation-card invalid';
        card.style.backgroundColor = '#fff3cd';
        card.style.color = '#856404';
        card.style.borderColor = '#ffeeba';
        card.innerHTML = `<strong>⚠️ Avisos na Planilha:</strong> ${mensagem}`;
    } else {
        card.className = 'validation-card invalid';
        card.innerHTML = `<strong>🔴 Erro de Estrutura:</strong> ${mensagem}`;
        document.getElementById('btn-iniciar-importacao').disabled = true;
    }
}

// Executar importação linha a linha
async function executarImportacao() {
    if (dadosCarregados.length === 0 || !entidadeSelecionada) return;

    // Mostrar painel de progresso e ocultar outros
    document.getElementById('secao-modelo').style.display = 'none';
    document.getElementById('secao-upload').style.display = 'none';
    document.getElementById('preview-container').style.display = 'none';
    document.getElementById('secao-progresso').style.display = 'block';

    const statusText = document.getElementById('txt-progresso-status');
    const progressFill = document.getElementById('bar-progresso-fill');
    const progressPercent = document.getElementById('txt-progresso-percent');
    const logContainer = document.getElementById('log-container');
    const txtSucesso = document.getElementById('txt-sucesso-count');
    const txtErro = document.getElementById('txt-erro-count');

    logContainer.innerHTML = '';
    let sucessos = 0;
    let falhas = 0;
    const total = dadosCarregados.length;
    const ignoradosPrevios = linhasDesconsideradasGlobal.length;
    txtErro.textContent = ignoradosPrevios;

    adicionarLinhaLog(`🚀 Iniciando fila de importação de ${total} registro(s) válido(s)...`, 'info');
    if (ignoradosPrevios > 0) {
        adicionarLinhaLog(`ℹ️ ${ignoradosPrevios} linha(s) da planilha foram desconsideradas previamente por conterem campos obrigatórios em branco e não serão processadas.`, 'warning');
    }
    
    // Obter lista atualizada de categorias para criar se faltar
    await carregarMetadadosCategorias();

    for (let i = 0; i < total; i++) {
        const row = dadosCarregados[i];
        
        // Atualizar progresso visual
        const percent = Math.round(((i) / total) * 100);
        progressFill.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        statusText.textContent = `Processando registro ${i + 1} de ${total}...`;

        try {
            if (entidadeSelecionada === 'clientes') {
                await processarImportacaoCliente(row);
            } else if (entidadeSelecionada === 'fornecedores') {
                await processarImportacaoFornecedor(row);
            } else if (entidadeSelecionada === 'produtos') {
                await processarImportacaoProduto(row);
            }
            
            sucessos++;
            txtSucesso.textContent = sucessos;
        } catch (err) {
            console.error(`Erro na linha ${row._linha}:`, err);
            falhas++;
            txtErro.textContent = falhas + ignoradosPrevios;
            adicionarLinhaLog(`❌ Linha ${row._linha}: Falha ao importar. Motivo: ${err.message || err}`, 'error');
        }
    }

    // Finalizar
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
    statusText.textContent = `Processamento concluído! total: ${total} registros analisados.`;
    adicionarLinhaLog(`🏁 Processamento finalizado! Sucessos: ${sucessos}, Falhas na importação: ${falhas}, Linhas desconsideradas: ${ignoradosPrevios}.`, 'success');
    
    document.getElementById('progresso-acoes').style.display = 'flex';
}

// Adicionar linha ao console de log preto
function adicionarLinhaLog(msg, tipo = 'info') {
    const logContainer = document.getElementById('log-container');
    const div = document.createElement('div');
    div.className = `log-item log-${tipo}`;
    
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    div.textContent = `[${timestamp}] ${msg}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Processar cliente individual
async function processarImportacaoCliente(row) {
    if (!row.nome || !row.telefone) {
        throw new Error("Nome e Telefone são campos obrigatórios");
    }

    const dados = {
        nome: row.nome,
        telefone: row.telefone,
        email: row.email || null,
        cpf_cnpj: row.cpf_cnpj || null,
        endereco: row.endereco || null,
        numero: row.numero || null,
        bairro: row.bairro || null,
        cidade: row.cidade || null,
        estado: row.estado || null,
        cep: row.cep || null,
        observacao: row.observacao || null,
        tipo: 'cliente',
        loja_id: usuarioLogado.loja_id
    };

    // Validar CPF/CNPJ duplicado para o mesmo tenant (opcional, apenas info se já cadastrado)
    if (dados.cpf_cnpj) {
        const { data: exist } = await supabaseClient
            .from('clientes')
            .select('id, nome')
            .eq('cpf_cnpj', dados.cpf_cnpj)
            .eq('loja_id', usuarioLogado.loja_id)
            .limit(1);
        
        if (exist && exist.length > 0) {
            adicionarLinhaLog(`⚠️ Linha ${row._linha}: Cliente "${dados.nome}" possui CPF/CNPJ já cadastrado em outro registro (${exist[0].nome}). Gravando duplicado...`, 'warning');
        }
    }

    const { error } = await supabaseClient
        .from('clientes')
        .insert([dados]);

    if (error) throw error;
    adicionarLinhaLog(`✔️ Linha ${row._linha}: Cliente "${dados.nome}" importado com sucesso.`, 'success');
}

// Processar fornecedor individual
async function processarImportacaoFornecedor(row) {
    if (!row.nome || !row.telefone) {
        throw new Error("Nome e Telefone são obrigatórios");
    }

    const dados = {
        nome: row.nome,
        telefone: row.telefone,
        email: row.email || null,
        documento: row.documento || null,
        endereco: row.endereco || null,
        observacao: row.observacao || null,
        tipo: 'fornecedor',
        ativo: true,
        loja_id: usuarioLogado.loja_id
    };

    const { error } = await supabaseClient
        .from('clientes') // Fornecedores ficam na tabela clientes
        .insert([dados]);

    if (error) throw error;
    adicionarLinhaLog(`✔️ Linha ${row._linha}: Fornecedor "${dados.nome}" importado com sucesso.`, 'success');
}

// Processar produto individual (com categorias e seriais)
async function processarImportacaoProduto(row) {
    const obrigatorios = [
        { key: 'codigo', label: 'Codigo' },
        { key: 'nome', label: 'Nome' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'marca', label: 'Marca' },
        { key: 'modelo', label: 'Modelo' },
        { key: 'descricao', label: 'Descricao' },
        { key: 'valor_compra', label: 'Valor_Compra' },
        { key: 'valor_venda', label: 'Valor_Venda' }
    ];

    const faltando = obrigatorios.filter(c => !row[c.key] || String(row[c.key]).trim() === '');
    if (faltando.length > 0) {
        throw new Error(`Campos obrigatórios em branco: ${faltando.map(f => f.label).join(', ')}`);
    }

    const sku = row.codigo.trim().toUpperCase();
    
    // Verificar se já existe um produto com o mesmo SKU neste tenant
    const { data: existProd } = await supabaseClient
        .from('produtos')
        .select('id, nome')
        .eq('codigo', sku)
        .eq('loja_id', usuarioLogado.loja_id)
        .limit(1);
        
    if (existProd && existProd.length > 0) {
        throw new Error(`Código SKU "${sku}" já está em uso pelo produto "${existProd[0].nome}"`);
    }

    // Auto-criar categoria se não existir no banco
    let catName = row.categoria ? row.categoria.trim() : 'Geral';
    if (catName && !categoriasCache.includes(catName)) {
        adicionarLinhaLog(`⚙️ Categoria "${catName}" não cadastrada. Criando dinamicamente...`, 'info');
        const { error: catError } = await supabaseClient
            .from('categorias')
            .insert([{ nome: catName, ativo: true, loja_id: usuarioLogado.loja_id }]);
        
        if (catError) {
            adicionarLinhaLog(`⚠️ Não foi possível criar a categoria "${catName}". Continuando com categoria 'Geral'.`, 'warning');
            catName = 'Geral';
        } else {
            categoriasCache.push(catName);
            categoriasMetaMap[catName] = { exige_serial: false, exige_imei: false, controla_lote: false };
        }
    }

    // Processar códigos de barras (array)
    let barcodes = [];
    if (row.codigos_barras) {
        barcodes = row.codigos_barras.split(',').map(b => b.trim()).filter(b => b);
    }

    const valorCompra = parseNumeroMoeda(row.valor_compra);
    const valorVenda = parseNumeroMoeda(row.valor_venda);
    if (valorCompra === null || isNaN(valorCompra)) {
        throw new Error(`Valor de Compra inválido: "${row.valor_compra}"`);
    }
    if (valorVenda === null || isNaN(valorVenda) || valorVenda < 0.01) {
        throw new Error(`Preço de Venda do produto "${row.nome}" não pode ser zero ou negativo (mínimo R$ 0,01)`);
    }

    const estoqueMinimo = parseInt(row.estoque_minimo) || 5;
    const estoqueTotal = parseInt(row.estoque_total) || 0;
    const garantiaDias = parseInt(row.garantia_dias) || 0;
    const tipoNorm = normalizar(row.tipo);
    const tipo = (tipoNorm.includes('servico') || tipoNorm === 'servicos') ? 'servico' : 'produto';

    const dadosProduto = {
        codigo: sku,
        nome: row.nome.trim(),
        tipo: tipo,
        categoria: catName,
        marca: row.marca.trim(),
        modelo: row.modelo.trim(),
        descricao: row.descricao.trim(),
        valor_compra: valorCompra,
        valor_venda: valorVenda,
        estoque_minimo: tipo === 'servico' ? 0 : estoqueMinimo,
        estoque_total: tipo === 'servico' ? 1 : estoqueTotal,
        garantia_dias: garantiaDias,
        codigos_barras: barcodes,
        loja_id: usuarioLogado.loja_id
    };

    // Validar se exige serial pela categoria
    const catMeta = categoriasMetaMap[catName];
    const exigeSerial = catMeta && catMeta.exige_serial && tipo !== 'servico';
    const exigeIMEI = catMeta && catMeta.exige_imei && tipo !== 'servico';
    const controlaItens = (exigeSerial || exigeIMEI) && tipo !== 'servico';

    if (controlaItens) {
        const seriais = row.numeros_serie ? row.numeros_serie.split(',').map(s => s.trim()).filter(s => s) : [];
        const imeis = row.imeis ? row.imeis.split(',').map(m => m.trim()).filter(m => m) : [];

        if (exigeSerial && seriais.length !== estoqueTotal) {
            throw new Error(`A categoria "${catName}" exige números de série. Planilha contém ${seriais.length} seriais, mas estoque é ${estoqueTotal}.`);
        }
        if (exigeIMEI && imeis.length !== estoqueTotal) {
            throw new Error(`A categoria "${catName}" exige IMEIs. Planilha contém ${imeis.length} IMEIs, mas estoque é ${estoqueTotal}.`);
        }

        // Salvar produto
        const { data: insertedProd, error: insertError } = await supabaseClient
            .from('produtos')
            .insert([dadosProduto])
            .select();

        if (insertError) throw insertError;
        const prodId = insertedProd[0].id;

        // Inserir seriais na tabela produtos_seriais
        for (let idx = 0; idx < estoqueTotal; idx++) {
            const serialObj = {
                produto_id: prodId,
                numero_serie: seriais[idx] || null,
                serial: seriais[idx] || null,
                imei: imeis[idx] || null,
                status: 'disponivel',
                disponivel: true,
                data_entrada: new Date().toISOString(),
                valor_compra: valorCompra,
                valor_venda: valorVenda,
                loja_id: usuarioLogado.loja_id
            };

            const { error: errSerial } = await supabaseClient
                .from('produtos_seriais')
                .insert([serialObj]);

            if (errSerial) {
                adicionarLinhaLog(`⚠️ Erro ao inserir serial/IMEI do produto "${dadosProduto.nome}".`, 'warning');
            }
        }
        adicionarLinhaLog(`✔️ Linha ${row._linha}: Produto serializado "${dadosProduto.nome}" cadastrado com ${estoqueTotal} item(ns).`, 'success');
    } else {
        // Salvar produto simples
        const { error } = await supabaseClient
            .from('produtos')
            .insert([dadosProduto]);
        
        if (error) throw error;
        adicionarLinhaLog(`✔️ Linha ${row._linha}: Produto "${dadosProduto.nome}" cadastrado com sucesso.`, 'success');
    }
}
