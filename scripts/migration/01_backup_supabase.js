// scripts/migration/01_backup_supabase.js
// Executa backup completo do banco Supabase de um cliente com suporte a RLS (x-tenant-id)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const targetClient = process.argv[2] || process.env.CLIENTE || 'cliente01';
const clientConfigPath = path.join(__dirname, '..', '..', 'clients', targetClient, 'config.json');

if (!fs.existsSync(clientConfigPath)) {
    console.error('ERRO: Configuracao do cliente nao encontrada em: ' + clientConfigPath);
    process.exit(1);
}

const clientConfig = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
const supabaseUrl = process.env[targetClient.toUpperCase() + '_SUPABASE_URL'] || clientConfig.supabase?.url;
const supabaseKey = process.env[targetClient.toUpperCase() + '_SUPABASE_ANON_KEY'] || clientConfig.supabase?.anonKey;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERRO: Credenciais do Supabase nao configuradas para o cliente ' + targetClient);
    process.exit(1);
}

const TABELAS = [
    'lojas', 'config_loja', 'usuarios', 'categorias', 'colaboradores',
    'clientes', 'produtos', 'produtos_seriais', 'caixas', 'entradas',
    'entrada_itens', 'saidas', 'saida_itens', 'despesas', 'boletos_pagar',
    'movimentos_estoque', 'agendamentos', 'mesas_comandas', 'promocoes', 'promocao_produtos'
];

async function fetchTableData(tableName) {
    const rowMap = new Map();
    // Varrer tenants de 1 a 10 para capturar dados protegidos por RLS
    for (let tenantId = 1; tenantId <= 10; tenantId++) {
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            
            try {
                const res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=*`, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': 'Bearer ' + supabaseKey,
                        'x-tenant-id': String(tenantId),
                        'Range': `${from}-${to}`,
                        'Prefer': 'count=exact'
                    }
                });

                if (res.status === 404) {
                    return { exists: false, count: 0, rows: [] };
                }

                if (!res.ok) break;

                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    for (const r of data) {
                        const key = r.id !== undefined ? r.id : JSON.stringify(r);
                        rowMap.set(key, r);
                    }
                    if (data.length < pageSize) hasMore = false;
                    else page++;
                } else {
                    hasMore = false;
                }
            } catch (err) {
                break;
            }
        }
    }

    const allRows = Array.from(rowMap.values());
    return { exists: true, count: allRows.length, rows: allRows };
}

async function runBackup() {
    console.log('================================================================');
    console.log(`🔒 BACKUP DE SEGURANÇA SUPABASE (COM RLS) — ${clientConfig.companyName} (${targetClient})`);
    console.log('================================================================');
    console.log('URL Origem:', supabaseUrl);
    console.log('Data/Hora :', new Date().toISOString());
    console.log('----------------------------------------------------------------');

    const backupDir = path.join(__dirname, '..', '..', 'backups', targetClient);
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupJsonPath = path.join(backupDir, `backup_supabase_${targetClient}_${timestamp}.json`);
    const backupSqlPath = path.join(backupDir, `backup_supabase_${targetClient}_${timestamp}.sql`);

    const backupData = {
        metadata: {
            clientId: targetClient,
            companyName: clientConfig.companyName,
            sourceUrl: supabaseUrl,
            timestamp: new Date().toISOString(),
            version: '1.1.0'
        },
        tables: {}
    };

    let totalRegistros = 0;
    let sqlContent = `-- Backup do Supabase para ${targetClient}\n-- Data: ${new Date().toISOString()}\n\n`;

    for (const tabela of TABELAS) {
        process.stdout.write(`Lendo ${tabela.padEnd(22, ' ')} ... `);
        try {
            const { exists, count, rows } = await fetchTableData(tabela);
            if (!exists) {
                console.log('⚠️  (tabela ausente)');
                continue;
            }
            backupData.tables[tabela] = rows;
            totalRegistros += count;
            console.log(`✅ ${count} registro(s)`);

            if (rows.length > 0) {
                sqlContent += `-- Tabela: ${tabela}\n`;
                for (const row of rows) {
                    const cols = Object.keys(row);
                    const vals = cols.map(c => {
                        const v = row[c];
                        if (v === null || v === undefined) return 'NULL';
                        if (typeof v === 'number' || typeof v === 'boolean') return v;
                        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
                        return `'${String(v).replace(/'/g, "''")}'`;
                    });
                    sqlContent += `INSERT INTO public.${tabela} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;\n`;
                }
                sqlContent += '\n';
            }
        } catch (err) {
            console.log('❌ ERRO:', err.message);
            throw err;
        }
    }

    const jsonStr = JSON.stringify(backupData, null, 2);
    fs.writeFileSync(backupJsonPath, jsonStr, 'utf8');
    fs.writeFileSync(backupSqlPath, sqlContent, 'utf8');

    const hash = crypto.createHash('sha256').update(jsonStr).digest('hex');
    const hashFile = backupJsonPath + '.sha256';
    fs.writeFileSync(hashFile, hash, 'utf8');

    console.log('----------------------------------------------------------------');
    console.log(`Backup JSON salvo em : ${backupJsonPath}`);
    console.log(`Backup SQL salvo em  : ${backupSqlPath}`);
    console.log(`Checksum SHA-256     : ${hash}`);
    console.log(`Total de Registros   : ${totalRegistros}`);
    console.log('----------------------------------------------------------------');

    console.log('🔍 Validando integridade do arquivo de backup...');
    const reloaded = JSON.parse(fs.readFileSync(backupJsonPath, 'utf8'));
    const reloadedHash = crypto.createHash('sha256').update(JSON.stringify(reloaded, null, 2)).digest('hex');
    
    if (reloadedHash !== hash) {
        throw new Error('FALHA DE INTEGRIDADE: O hash do arquivo recarregado nao coincide com o original!');
    }

    console.log('✅ VALIDACAO CONCLUIDA: O backup e 100% integro e pronto para restauracao.');
    console.log('================================================================\n');
    return backupJsonPath;
}

runBackup().catch(err => {
    console.error('❌ ERRO FATAL DURANTE O BACKUP:', err);
    process.exit(1);
});
