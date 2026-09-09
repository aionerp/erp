// scripts/migration/02_setup_neon_schema.js
// Provisiona ou valida a estrutura completa de schema no Neon PostgreSQL

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const targetClient = process.argv[2] || process.env.CLIENTE || 'cliente01';
const dbUrl = process.env[targetClient.toUpperCase() + '_DATABASE_URL'] || process.env.DATABASE_URL;
const schemaFile = path.join(__dirname, '..', '..', 'database', 'schema_completo.sql');

async function run() {
    console.log('================================================================');
    console.log(`🏗️  PROVISIONAMENTO DE ESTRUTURA NO NEON — ${targetClient.toUpperCase()}`);
    console.log('================================================================');

    if (!fs.existsSync(schemaFile)) {
        console.error('ERRO: Arquivo de schema não encontrado em:', schemaFile);
        process.exit(1);
    }

    const sql = fs.readFileSync(schemaFile, 'utf8');

    if (!dbUrl || dbUrl.includes('[SENHA]')) {
        console.log(`⚠️  ${targetClient.toUpperCase()}_DATABASE_URL não configurada no arquivo .env.`);
        return;
    }

    console.log('Conectando ao Neon PostgreSQL via pg...');
    const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Conexão estabelecida com sucesso com o Neon.');

        console.log('Verificando / criando roles compatíveis (anon, authenticated, service_role)...');
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
                    CREATE ROLE anon NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
                    CREATE ROLE authenticated NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
                    CREATE ROLE service_role NOLOGIN;
                END IF;
            END
            $$;
        `);

        console.log('Executando script de schema completo (tabelas, índices, triggers, functions)...');
        await client.query(sql);
        console.log('✅ Schema provisionado no Neon com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao aplicar schema no Neon:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
