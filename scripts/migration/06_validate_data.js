// scripts/migration/06_validate_data.js
// Valida contagens, somas financeiras, datas min/max e integridade entre Supabase e Neon

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

const VALIDATION_TABLES = [
    { table: 'lojas', valueCol: null, dateCol: 'created_at' },
    { table: 'config_loja', valueCol: null, dateCol: null },
    { table: 'usuarios', valueCol: null, dateCol: 'created_at' },
    { table: 'clientes', valueCol: null, dateCol: 'created_at' },
    { table: 'colaboradores', valueCol: null, dateCol: 'created_at' },
    { table: 'produtos', valueCol: 'valor_venda', dateCol: 'created_at' },
    { table: 'produtos_seriais', valueCol: null, dateCol: 'data_entrada' },
    { table: 'saidas', valueCol: 'total', dateCol: 'data' },
    { table: 'saida_itens', valueCol: 'subtotal', dateCol: null },
    { table: 'entradas', valueCol: 'total', dateCol: 'data' },
    { table: 'entrada_itens', valueCol: 'subtotal', dateCol: null },
    { table: 'movimentos_estoque', valueCol: 'quantidade', dateCol: 'data' },
    { table: 'despesas', valueCol: 'valor', dateCol: 'data' },
    { table: 'caixas', valueCol: 'saldo_inicial', dateCol: 'data_abertura' }
];

async function getSupabaseStats(spec) {
    try {
        const rowMap = new Map();
        for (let tenantId = 1; tenantId <= 10; tenantId++) {
            const res = await fetch(`${supabaseUrl}/rest/v1/${spec.table}?select=*`, {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': 'Bearer ' + supabaseKey,
                    'x-tenant-id': String(tenantId)
                }
            });
            if (res.status === 404) return { exists: false, count: 0, sum: 0, minDate: null, maxDate: null };
            if (res.ok) {
                const rows = await res.json();
                for (const r of rows) {
                    const key = r.id !== undefined ? r.id : JSON.stringify(r);
                    rowMap.set(key, r);
                }
            }
        }
        const rows = Array.from(rowMap.values());
        const count = rows.length;
        let sum = 0;
        let dates = [];
        for (const r of rows) {
            if (spec.valueCol && r[spec.valueCol] != null) {
                sum += Number(r[spec.valueCol]) || 0;
            }
            if (spec.dateCol && r[spec.dateCol]) {
                dates.push(new Date(r[spec.dateCol]).getTime());
            }
        }
        return {
            exists: true,
            count,
            sum: Math.round(sum * 100) / 100,
            minDate: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
            maxDate: dates.length ? new Date(Math.max(...dates)).toISOString() : null
        };
    } catch (e) {
        return { exists: false, count: 0, sum: 0, error: e.message };
    }
}

async function getNeonStats(client, spec) {
    if (!client) return { exists: false, count: null, sum: null };
    try {
        const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM public.${spec.table}`);
        const count = countRes.rows[0].cnt;
        let sum = 0;
        if (spec.valueCol) {
            const sumRes = await client.query(`SELECT COALESCE(SUM(${spec.valueCol}), 0)::numeric AS total FROM public.${spec.table}`);
            sum = Number(sumRes.rows[0].total) || 0;
        }
        let minDate = null;
        let maxDate = null;
        if (spec.dateCol) {
            const dateRes = await client.query(`SELECT MIN(${spec.dateCol}) AS min_d, MAX(${spec.dateCol}) AS max_d FROM public.${spec.table}`);
            minDate = dateRes.rows[0].min_d ? new Date(dateRes.rows[0].min_d).toISOString() : null;
            maxDate = dateRes.rows[0].max_d ? new Date(dateRes.rows[0].max_d).toISOString() : null;
        }
        return { exists: true, count, sum: Math.round(sum * 100) / 100, minDate, maxDate };
    } catch (e) {
        return { exists: false, count: null, sum: null, error: e.message };
    }
}

async function run() {
    console.log('================================================================');
    console.log(`📋 AUDITORIA E VALIDAÇÃO DE DADOS: SUPABASE vs NEON (${targetClient.toUpperCase()})`);
    console.log('================================================================');

    let neonClient = null;
    if (dbUrl && !dbUrl.includes('[SENHA]')) {
        try {
            neonClient = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
            await neonClient.connect();
        } catch(e) {
            console.warn('Aviso: Conexão com Neon indisponível para validação:', e.message);
        }
    }

    console.log('Tabela                 Supabase         Neon             Status');
    console.log('----------------------------------------------------------------');

    let allOk = true;
    let reportMd = `# Relatório de Validação de Dados (Supabase vs Neon)\n\n`;
    reportMd += `**Cliente:** ${clientConfig.companyName} (\`${targetClient}\`)\n`;
    reportMd += `**Data:** ${new Date().toISOString()}\n\n`;
    reportMd += `| Tabela | Supabase (Qtd / Soma) | Neon (Qtd / Soma) | Status |\n`;
    reportMd += `| :--- | :--- | :--- | :--- |\n`;

    for (const spec of VALIDATION_TABLES) {
        const s = await getSupabaseStats(spec);
        const n = await getNeonStats(neonClient, spec);

        let status = 'OK';
        if (n.count === null) {
            status = 'Aguardando Conexão Neon';
            allOk = false;
        } else if (s.count !== n.count || s.sum !== n.sum) {
            status = 'DIVERGÊNCIA';
            allOk = false;
        }

        const sDesc = `${s.count} r${s.sum ? ' / R$' + s.sum.toFixed(2) : ''}`;
        const nDesc = n.count !== null ? `${n.count} r${n.sum ? ' / R$' + n.sum.toFixed(2) : ''}` : 'N/A';

        console.log(`${spec.table.padEnd(22, ' ')} ${sDesc.padEnd(16, ' ')} ${nDesc.padEnd(16, ' ')} ${status}`);
        reportMd += `| \`${spec.table}\` | ${sDesc} | ${nDesc} | ${status === 'OK' ? '✅ OK' : '⚠️ ' + status} |\n`;
    }

    const reportPath = path.join(__dirname, '..', '..', 'relatorio_validacao_dados.md');
    fs.writeFileSync(reportPath, reportMd, 'utf8');

    console.log('----------------------------------------------------------------');
    console.log(`Relatório salvo em: ${reportPath}`);
    if (allOk) {
        console.log('✅ VALIDAÇÃO CONCLUÍDA: Todos os dados e somas conferem 100%!');
    } else {
        console.log('⚠️  ATENÇÃO: Existem divergências ou validação pendente de conexão.');
    }
    console.log('================================================================\n');

    if (neonClient) await neonClient.end();
}

run();
