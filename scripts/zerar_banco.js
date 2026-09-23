// scripts/zerar_banco.js
// Utilitário para limpar dados de teste do banco Neon PostgreSQL

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const targetClient = process.argv[2] || process.env.CLIENTE || 'cliente01';
const keepUsers = process.argv.includes('--manter-usuarios');
const dbUrl = process.env[targetClient.toUpperCase() + '_DATABASE_URL'] || process.env.DATABASE_URL;

const sqlFile = keepUsers 
    ? path.join(__dirname, '..', 'database', 'zerar_apenas_movimentacoes.sql')
    : path.join(__dirname, '..', 'database', 'zerar_banco.sql');

async function run() {
    console.log('================================================================');
    console.log(`🧹 RESET DE DADOS DE TESTE — CLIENTE: ${targetClient.toUpperCase()}`);
    console.log(`Modo: ${keepUsers ? 'Manter Usuários e Loja' : 'Reset Geral Completo (Loja Matriz + adm.padrao)'}`);
    console.log('================================================================');

    if (!dbUrl || dbUrl.includes('[SENHA]')) {
        console.error(`❌ Variável ${targetClient.toUpperCase()}_DATABASE_URL não configurada no .env.`);
        process.exit(1);
    }

    if (!fs.existsSync(sqlFile)) {
        console.error('❌ Arquivo SQL não encontrado:', sqlFile);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('Conectando ao Neon PostgreSQL...');
    const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Executando script de limpeza e reset de sequences...');
        await client.query(sql);
        console.log('================================================================');
        console.log(`✅ SUCESSO! Banco de dados de ${targetClient.toUpperCase()} foi zerado.`);
        if (!keepUsers) {
            console.log('🔑 Acesso padrão disponível:');
            console.log('   Usuário: adm.padrao');
            console.log('   Senha:   123');
        } else {
            console.log('ℹ️  Seus usuários e dados da loja foram mantidos.');
        }
        console.log('================================================================');
    } catch (err) {
        console.error('❌ Erro ao zerar banco de dados:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
