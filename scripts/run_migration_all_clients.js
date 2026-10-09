// scripts/run_migration_all_clients.js
// Executa o script SQL de migração para todos os clientes multi-tenant configurados
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function executeForAllClients() {
    console.log('========================================================================');
    console.log('🚀 EXECUÇÃO DE SQL / MIGRAÇÃO PARA TODOS OS CLIENTES (MULTI-TENANT)');
    console.log('========================================================================\n');

    const sqlPath = path.join(__dirname, '..', 'database', 'migration_fiado_contas_receber.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ Arquivo SQL não encontrado:', sqlPath);
        process.exit(1);
    }
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Carregar clientes do clients.json se disponível
    const clientsJsonPath = path.join(__dirname, '..', 'clients.json');
    let clientsMeta = {};
    if (fs.existsSync(clientsJsonPath)) {
        try {
            const list = JSON.parse(fs.readFileSync(clientsJsonPath, 'utf8'));
            list.forEach(c => {
                clientsMeta[c.clientId] = c.companyName || c.clientId;
            });
        } catch (e) {}
    }

    const tenantConfigs = [
        {
            id: 'cliente01',
            name: clientsMeta['cliente01'] || 'AionERP Oficial',
            url: process.env.CLIENTE01_DATABASE_URL
        },
        {
            id: 'cliente02',
            name: clientsMeta['cliente02'] || 'E-commerce Original Eletrônico',
            url: process.env.CLIENTE02_DATABASE_URL
        },
        {
            id: 'cliente03',
            name: clientsMeta['cliente03'] || 'MarceloMotos Matriz',
            url: process.env.CLIENTE03_DATABASE_URL
        }
    ];

    let totalSuccess = 0;
    let totalErrors = 0;

    for (const tenant of tenantConfigs) {
        console.log(`------------------------------------------------------------------------`);
        console.log(`📦 Processando: ${tenant.id.toUpperCase()} — "${tenant.name}"`);
        console.log(`------------------------------------------------------------------------`);

        if (!tenant.url || tenant.url.includes('[SENHA]')) {
            console.warn(`⚠️  PULADO: URL de banco não configurada para ${tenant.id}.\n`);
            continue;
        }

        // Mascarar URL para exibição segura
        const maskedUrl = tenant.url.replace(/:([^@]+)@/, ':***@');
        console.log(`🔌 Conectando a: ${maskedUrl}`);

        const pool = new Pool({
            connectionString: tenant.url,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 15000
        });

        try {
            const client = await pool.connect();
            console.log('⚡ Conexão estabelecida com sucesso.');

            // 1. Executar o script SQL completo
            console.log('📄 Executando script SQL migration_fiado_contas_receber.sql...');
            await client.query(sqlContent);
            console.log('✅ Comandos SQL executados com sucesso.');

            // 2. Verificação das tabelas criadas
            const tablesCheck = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                  AND table_name IN ('contas_receber', 'contas_receber_pagamentos')
                ORDER BY table_name;
            `);
            const foundTables = tablesCheck.rows.map(r => r.table_name);
            console.log(`🔍 Tabelas verificadas (${foundTables.length}/2):`, foundTables.join(', '));

            // 3. Verificação das colunas da tabela contas_receber
            const colsCR = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = 'contas_receber'
                ORDER BY ordinal_position;
            `);
            console.log(`📋 Tabela public.contas_receber: ${colsCR.rows.length} colunas estruturadas.`);

            // 4. Verificação das colunas da tabela contas_receber_pagamentos
            const colsCRP = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = 'contas_receber_pagamentos'
                ORDER BY ordinal_position;
            `);
            console.log(`📋 Tabela public.contas_receber_pagamentos: ${colsCRP.rows.length} colunas estruturadas.`);

            // 5. Verificação das colunas complementares em saidas
            const colsSaidas = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = 'saidas'
                  AND column_name IN ('cliente_nome', 'cliente_cpf', 'caixa_id')
                ORDER BY column_name;
            `);
            console.log(`📋 Tabela public.saidas: colunas integradas ->`, colsSaidas.rows.map(r => r.column_name).join(', '));

            // 6. Verificação de Políticas RLS
            const rlsCheck = await client.query(`
                SELECT policyname, tablename 
                FROM pg_policies 
                WHERE schemaname = 'public' 
                  AND tablename IN ('contas_receber', 'contas_receber_pagamentos');
            `);
            console.log(`🛡️  Políticas de Segurança Multi-Tenant (RLS) ativas: ${rlsCheck.rows.length} política(s).`);

            client.release();
            await pool.end();

            console.log(`✨ Status final para ${tenant.id.toUpperCase()}: SUCESSO COMPLETO!\n`);
            totalSuccess++;

        } catch (err) {
            console.error(`❌ Erro ao aplicar SQL em ${tenant.id.toUpperCase()}:`, err.message);
            await pool.end();
            totalErrors++;
        }
    }

    console.log('========================================================================');
    console.log(`🏁 RESUMO DA OPERAÇÃO:`);
    console.log(`   - Sucesso: ${totalSuccess} cliente(s)`);
    console.log(`   - Erros:   ${totalErrors} cliente(s)`);
    console.log('========================================================================\n');

    if (totalErrors > 0) {
        process.exit(1);
    }
}

executeForAllClients().catch(err => {
    console.error('❌ Falha inesperada:', err);
    process.exit(1);
});
