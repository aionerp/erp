// scripts/migration/04_copy_cliente03_to_cliente02.js
// Migra os dados do backup Supabase (cliente03) para o banco dedicado Neon (cliente02)

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const backupPath = path.join(__dirname, '..', '..', 'backups', 'cliente03', 'backup_supabase_cliente03_2026-09-09T16-48-51-718Z.json');
const dbUrl = process.env.CLIENTE02_DATABASE_URL;

const ORDERED_TABLES = [
    'lojas',
    'config_loja',
    'usuarios',
    'categorias',
    'clientes',
    'produtos',
    'produtos_seriais',
    'caixas',
    'saidas',
    'saida_itens',
    'movimentos_estoque'
];

async function run() {
    console.log('================================================================');
    console.log('🚀 CARGA DE DADOS: SUPABASE (CLIENTE03) ➔ NEON (CLIENTE02)');
    console.log('================================================================');

    if (!fs.existsSync(backupPath)) {
        console.error('ERRO: Arquivo de backup não encontrado em:', backupPath);
        process.exit(1);
    }

    if (!dbUrl) {
        console.error('ERRO: CLIENTE02_DATABASE_URL não configurada no arquivo .env!');
        process.exit(1);
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    console.log(`Backup lido com sucesso: ${backupData.metadata?.companyName} (${backupData.metadata?.timestamp})`);

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('✅ Conectado com sucesso ao Neon PostgreSQL (cliente02).');

    try {
        let totalInserido = 0;

        for (const table of ORDERED_TABLES) {
            const tableData = backupData.tables?.[table];
            const rows = Array.isArray(tableData) ? tableData : (tableData?.rows || []);

            process.stdout.write(`Inserindo em public.${table.padEnd(20, ' ')} ... `);

            if (rows.length === 0) {
                console.log('0 registros (vazio)');
                continue;
            }

            // Obter colunas existentes na tabela do Neon
            const colRes = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = $1
            `, [table]);
            const targetCols = new Set(colRes.rows.map(r => r.column_name));

            for (const r of rows) {
                const cols = Object.keys(r).filter(c => targetCols.has(c));
                const vals = cols.map(c => {
                    const val = r[c];
                    if (val !== null && typeof val === 'object') {
                        return JSON.stringify(val);
                    }
                    return val;
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

            totalInserido += rows.length;
            console.log(`✅ ${rows.length} registros inseridos com sucesso.`);
        }

        console.log('\nSincronizando sequences das tabelas no Neon...');
        for (const table of ORDERED_TABLES) {
            try {
                const seqRes = await client.query(`
                    SELECT setval(
                        pg_get_serial_sequence('public.${table}', 'id'),
                        coalesce(max(id), 1),
                        max(id) IS NOT NULL
                    ) as val FROM public.${table};
                `);
                console.log(`  Sequence public.${table}_id_seq ajustada para: ${seqRes.rows[0].val}`);
            } catch (seqErr) {
                // Tabela pode ter sequence com nome diferente ou gerado automaticamente
                try {
                    await client.query(`
                        SELECT setval(
                            '${table}_id_seq',
                            coalesce(max(id), 1),
                            max(id) IS NOT NULL
                        ) FROM public.${table};
                    `);
                } catch(e) {}
            }
        }

        console.log('----------------------------------------------------------------');
        console.log(`🎉 MIGRAÇÃO CONCLUÍDA: ${totalInserido} registros inseridos no Neon cliente02!`);
        console.log('================================================================\n');

    } catch (err) {
        console.error('\n❌ ERRO DURANTE A CARGA DE DADOS:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
