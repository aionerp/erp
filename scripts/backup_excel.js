const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Carregar .env local se disponível
try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                process.env[key] = val;
            }
        });
    }
} catch (e) {
    // Silencioso
}

// Pegar variáveis das variáveis de ambiente (GitHub Secrets ou Local)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_DESTINATARIO = process.env.EMAIL_DESTINATARIO;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('ERRO: SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios nas variáveis de ambiente.');
    process.exit(1);
}

const TABELAS = [
    'clientes',
    'produtos',
    'produtos_seriais',
    'entradas',
    'entrada_itens',
    'saidas',
    'saida_itens',
    'usuarios',
    'config_loja',
    'fornecedores',
    'categorias'
];

async function obterDadosTabela(tabela) {
    try {
        console.log(`Baixando dados da tabela: ${tabela}...`);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        if (!res.ok) {
            throw new Error(`Status ${res.status}: ${await res.text()}`);
        }
        return await res.json();
    } catch (error) {
        console.error(`Erro ao baixar tabela ${tabela}:`, error.message);
        return [];
    }
}

async function run() {
    if (!RESEND_API_KEY || !EMAIL_DESTINATARIO) {
        console.error('ERRO: RESEND_API_KEY e EMAIL_DESTINATARIO são obrigatórios nas variáveis de ambiente.');
        process.exit(1);
    }

    console.log('Iniciando rotina de backup semanal...');
    
    // Criar planilha Excel em memória
    const workbook = xlsx.utils.book_new();

    for (const tabela of TABELAS) {
        const dados = await obterDadosTabela(tabela);
        
        // Se a tabela estiver vazia, cria uma linha placeholder para não corromper a planilha
        const dadosPlanilha = dados.length > 0 ? dados : [{ Status: 'Nenhum registro encontrado nesta tabela.' }];
        
        const worksheet = xlsx.utils.json_to_sheet(dadosPlanilha);
        xlsx.utils.book_append_sheet(workbook, worksheet, tabela.substring(0, 31)); // Limite de 31 caracteres da aba do Excel
    }

    // Salvar arquivo Excel temporário
    const dataAtual = new Date().toISOString().split('T')[0];
    const nomeArquivo = `backup_sistema_${dataAtual}.xlsx`;
    const caminhoArquivo = path.join(__dirname, nomeArquivo);
    
    xlsx.writeFile(workbook, caminhoArquivo);
    console.log(`Planilha de backup criada com sucesso em: ${caminhoArquivo}`);

    // Ler planilha e converter para Base64
    const fileBuffer = fs.readFileSync(caminhoArquivo);
    const base64File = fileBuffer.toString('base64');

    // Enviar email usando a API da Resend
    console.log(`Enviando backup para o e-mail: ${EMAIL_DESTINATARIO}...`);
    const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify({
            from: 'Backup Sistema <onboarding@resend.dev>', // Domínio padrão gratuito da Resend
            to: [EMAIL_DESTINATARIO],
            subject: `💾 Backup Automático — ${dataAtual}`,
            html: `
                <h2>Backup Semanal de Dados</h2>
                <p>Olá,</p>
                <p>Segue em anexo a planilha de backup automático do banco de dados referente ao dia <strong>${dataAtual}</strong>.</p>
                <p>O arquivo contém planilhas separadas para todas as tabelas do sistema (Clientes, Produtos, Vendas, Entradas, etc.).</p>
                <br>
                <small>Este e-mail foi gerado e enviado de forma automatizada pelo servidor de backup.</small>
            `,
            attachments: [
                {
                    content: base64File,
                    filename: nomeArquivo
                }
            ]
        })
    });

    if (emailRes.ok) {
        console.log('E-mail com backup enviado com sucesso!');
    } else {
        console.error('Erro ao enviar e-mail:', await emailRes.text());
    }

    // Excluir arquivo temporário local após envio
    try {
        fs.unlinkSync(caminhoArquivo);
        console.log('Arquivo temporário local limpo.');
    } catch (e) {
        console.error('Erro ao remover arquivo temporário:', e.message);
    }
}

run().catch(console.error);
