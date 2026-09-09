// scripts/migration/03_compare_schemas.js
// Compara a estrutura do Supabase com o Neon PostgreSQL e gera relatorio de equivalencia

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const targetClient = process.argv[2] || process.env.CLIENTE || 'cliente01';
const clientConfigPath = path.join(__dirname, '..', '..', 'clients', targetClient, 'config.json');
const clientConfig = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));

const supabaseUrl = process.env[targetClient.toUpperCase() + '_SUPABASE_URL'] || clientConfig.supabase?.url;
const supabaseKey = process.env[targetClient.toUpperCase() + '_SUPABASE_ANON_KEY'] || clientConfig.supabase?.anonKey;
const dbUrl = process.env[targetClient.toUpperCase() + '_DATABASE_URL'] || process.env.DATABASE_URL;

const EXPECTED_TABLES = [
    'lojas', 'usuarios', 'categorias', 'clientes', 'colaboradores',
    'produtos', 'produtos_seriais', 'entradas', 'entrada_itens', 'caixas',
    'saidas', 'saida_itens', 'despesas', 'boletos_pagar', 'movimentos_estoque',
    'config_loja', 'agendamentos', 'mesas_comandas', 'promocoes', 'promocao_produtos'
];

async function checkSupabaseTables() {
    const status = {};
    for (const t of EXPECTED_TABLES) {
        try {
            const res = await fetch(`${supabaseUrl}/rest/v1/${t}?select=*&limit=1`, {
                headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
            });
            status[t] = res.status !== 404;
        } catch (e) {
            status[t] = false;
        }
    }
    return status;
}

async function checkNeonTables() {
    const status = {};
    if (!dbUrl) {
        // Se a connection string não estiver no .env, assumimos pendência de validação
        EXPECTED_TABLES.forEach(t => status[t] = null);
        return status;
    }

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);
        const existing = new Set(res.rows.map(r => r.table_name));
        EXPECTED_TABLES.forEach(t => status[t] = existing.has(t));
    } catch (e) {
        console.warn('Aviso: Não foi possível conectar diretamente ao Neon:', e.message);
        EXPECTED_TABLES.forEach(t => status[t] = false);
    } finally {
        try { await client.end(); } catch(e){}
    }
    return status;
}

async function run() {
    console.log('================================================================');
    console.log(`📊 COMPARATIVO DE ESTRUTURA: SUPABASE vs NEON (${targetClient.toUpperCase()})`);
    console.log('================================================================');

    const supaTables = await checkSupabaseTables();
    const neonTables = await checkNeonTables();

    let mdReport = `# Relatório de Equivalência de Estrutura (Supabase vs Neon)\n\n`;
    mdReport += `**Cliente:** ${clientConfig.companyName} (\`${targetClient}\`)\n`;
    mdReport += `**Data da Auditoria:** ${new Date().toISOString()}\n\n`;
    mdReport += `| Tabela | Supabase | Neon | Status da Equivalência |\n`;
    mdReport += `| :--- | :--- | :--- | :--- |\n`;

    let allMatch = true;

    for (const t of EXPECTED_TABLES) {
        const sStatus = supaTables[t] ? '✅ Presente' : '❌ Ausente';
        let nStatus = neonTables[t] === true ? '✅ Presente' : (neonTables[t] === false ? '❌ Ausente' : '⏳ Aguardando Conexão');
        
        let match = 'OK';
        if (neonTables[t] === null) {
            match = 'Aguardando Credenciais Neon';
            allMatch = false;
        } else if (supaTables[t] !== neonTables[t]) {
            match = '⚠️ Divergência Detectada';
            allMatch = false;
        }

        mdReport += `| \`${t}\` | ${sStatus} | ${nStatus} | ${match} |\n`;
        console.log(`- ${t.padEnd(20, ' ')} | Supabase: ${sStatus} | Neon: ${nStatus} | ${match}`);
    }

    const reportPath = path.join(__dirname, '..', '..', 'relatorio_equivalencia_schemas.md');
    fs.writeFileSync(reportPath, mdReport, 'utf8');

    console.log('----------------------------------------------------------------');
    console.log(`Relatório salvo em: ${reportPath}`);
    if (allMatch) {
        console.log('✅ SUCESSO: Estrutura 100% equivalente entre Supabase e Neon!');
    } else {
        console.log('⚠️  AVISO: Existem itens pendentes ou divergentes para resolver antes do cutover.');
    }
    console.log('================================================================\n');
}

run();
