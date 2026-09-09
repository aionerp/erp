// scripts/migration/05_sync_deltas.js
// Sincroniza dados novos ou atualizados do Supabase para o Neon (CDC / Delta Sync)

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

const syncStatePath = path.join(__dirname, '..', '..', 'backups', targetClient, 'last_sync.json');

const TABLES_WITH_TIMESTAMPS = [
    'produtos', 'clientes', 'categorias', 'colaboradores',
    'entradas', 'entrada_itens', 'saidas', 'saida_itens', 'despesas',
    'boletos_pagar', 'movimentos_estoque', 'caixas', 'agendamentos', 'mesas_comandas'
];

async function run() {
    console.log('================================================================');
    console.log(`🔄 SINCRONIZAÇÃO DE DELTAS (CDC): SUPABASE -> NEON (${targetClient.toUpperCase()})`);
    console.log('================================================================');

    if (!dbUrl || dbUrl.includes('[SENHA]')) {
        console.error('ERRO: Configure a CLIENTE01_DATABASE_URL no .env com a senha real do Neon.');
        process.exit(1);
    }

    let lastSyncTime = '1970-01-01T00:00:00.000Z';
    if (fs.existsSync(syncStatePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(syncStatePath, 'utf8'));
            if (state.lastSync) lastSyncTime = state.lastSync;
        } catch (e) {}
    }

    console.log(`Última sincronização registrada: ${lastSyncTime}`);
    const currentSyncStart = new Date().toISOString();

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        let totalDeltas = 0;

        for (const table of TABLES_WITH_TIMESTAMPS) {
            process.stdout.write(`Verificando deltas em ${table.padEnd(20, ' ')} ... `);
            
            // Buscar registros alterados ou criados após lastSyncTime
            const url = `${supabaseUrl}/rest/v1/${table}?or=(created_at.gt.${lastSyncTime},updated_at.gt.${lastSyncTime})&order=id.asc`;
            let rows = [];
            try {
                const res = await fetch(url, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey
                    }
                });
                if (res.ok) {
                    rows = await res.json();
                }
            } catch (err) {
                // Se a tabela não tiver updated_at, tentar apenas por id
                try {
                    const fallbackUrl = `${supabaseUrl}/rest/v1/${table}?created_at=gt.${lastSyncTime}&order=id.asc`;
                    const res2 = await fetch(fallbackUrl, {
                        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
                    });
                    if (res2.ok) rows = await res2.json();
                } catch(e) {}
            }

            if (!Array.isArray(rows) || rows.length === 0) {
                console.log('0 deltas');
                continue;
            }

            for (const r of rows) {
                const cols = Object.keys(r);
                const vals = cols.map(c => r[c]);
                const params = cols.map((_, idx) => `$${idx + 1}`);

                const q = `
                    INSERT INTO public.${table} (${cols.join(', ')})
                    VALUES (${params.join(', ')})
                    ON CONFLICT (id) DO UPDATE SET
                    ${cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')};
                `;
                await client.query(q, vals);
            }

            totalDeltas += rows.length;
            console.log(`⚡ ${rows.length} registros sincronizados.`);
        }

        // Salvar estado da sincronização
        fs.mkdirSync(path.dirname(syncStatePath), { recursive: true });
        fs.writeFileSync(syncStatePath, JSON.stringify({
            targetClient,
            lastSync: currentSyncStart,
            totalDeltas
        }, null, 2), 'utf8');

        console.log('----------------------------------------------------------------');
        console.log(`✅ Sincronização concluída! Total de deltas aplicados: ${totalDeltas}`);
        console.log(`Novo marco de sincronização: ${currentSyncStart}`);
        console.log('================================================================\n');
    } catch (e) {
        console.error('❌ Falha na sincronização de deltas:', e.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
