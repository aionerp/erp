// scripts/migration/04_initial_data_copy.js
// Executa a copia inicial de dados do Supabase para o Neon preservando IDs, datas e sequences

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

// Ordem topológica estrita para respeitar chaves estrangeiras
const ORDERED_TABLES = [
    'lojas', 'config_loja', 'usuarios', 'categorias', 'colaboradores',
    'clientes', 'produtos', 'produtos_seriais', 'caixas', 'entradas',
    'entrada_itens', 'saidas', 'saida_itens', 'despesas', 'boletos_pagar',
    'movimentos_estoque', 'agendamentos', 'mesas_comandas'
];

async function fetchFromSupabase(table) {
    const rowMap = new Map();
    for (let tenantId = 1; tenantId <= 10; tenantId++) {
        let page = 0;
        const limit = 1000;
        while (true) {
            const from = page * limit;
            const to = from + limit - 1;
            try {
                const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey,
                        'x-tenant-id': String(tenantId),
                        'Range': `${from}-${to}`
                    }
                });
                if (res.status === 404) break;
                if (!res.ok) break;
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    for (const r of data) {
                        const key = r.id !== undefined ? r.id : JSON.stringify(r);
                        rowMap.set(key, r);
                    }
                    if (data.length < limit) break;
                    page++;
                } else break;
            } catch(e) {
                break;
            }
        }
    }
    return Array.from(rowMap.values());
}

async function run() {
    console.log('================================================================');
    console.log(`🚀 CÓPIA DE DADOS REAIS: SUPABASE -> NEON (${targetClient.toUpperCase()})`);
    console.log('================================================================');

    if (!dbUrl || dbUrl.includes('[SENHA]')) {
        console.error('ERRO: Configure a CLIENTE01_DATABASE_URL no .env com a senha real do Neon.');
        process.exit(1);
    }

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        let totalCopied = 0;
        for (const table of ORDERED_TABLES) {
            process.stdout.write(`Migrando ${table.padEnd(22, ' ')} ... `);
            const rows = await fetchFromSupabase(table);
            if (rows.length === 0) {
                console.log('0 registros (vazio)');
                continue;
            }

            // Descobrir colunas existentes no Neon
            const colRes = await client.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = $1;
            `, [table]);
            const targetCols = new Set(colRes.rows.map(r => r.column_name));

            for (const r of rows) {
                const cols = Object.keys(r).filter(c => targetCols.has(c));
                const vals = cols.map(c => {
                    const v = r[c];
                    if (v !== null && typeof v === 'object') {
                        return JSON.stringify(v);
                    }
                    return v;
                });
                const params = cols.map((_, idx) => `$${idx + 1}`);

                const q = `
                    INSERT INTO public.${table} (${cols.join(', ')})
                    VALUES (${params.join(', ')})
                    ON CONFLICT (id) DO UPDATE SET
                    ${cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')};
                `;
                await client.query(q, vals);
            }

            totalCopied += rows.length;
            console.log(`✅ ${rows.length} registros copiados.`);
        }

        console.log('\nAtualizando sequences do PostgreSQL no Neon...');
        for (const table of ORDERED_TABLES) {
            try {
                await client.query(`
                    SELECT setval(
                        pg_get_serial_sequence('public.${table}', 'id'),
                        coalesce(max(id), 1),
                        max(id) IS NOT NULL
                    ) FROM public.${table};
                `);
            } catch (seqErr) {
                // Tabela pode não ter sequence no id
            }
        }

        console.log('----------------------------------------------------------------');
        console.log(`✅ Cópia de dados concluída com sucesso! Total: ${totalCopied} registros.`);
        console.log('================================================================\n');
    } catch (e) {
        console.error('❌ Falha na cópia de dados:', e.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
