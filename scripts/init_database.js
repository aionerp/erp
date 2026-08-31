// scripts/init_database.js
// Script para inicializar o schema completo de tabelas de um cliente no Supabase

const fs = require('fs');
const path = require('path');

const targetClient = process.argv[2] || process.env.CLIENTE || 'cliente01';
const clientConfigPath = path.join(__dirname, '..', 'clients', targetClient, 'config.json');

if (!fs.existsSync(clientConfigPath)) {
    console.error(`ERRO: Configuração do cliente "${targetClient}" não encontrada em: ${clientConfigPath}`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
const sqlPath = path.join(__dirname, '..', 'database', 'schema_completo.sql');

if (!fs.existsSync(sqlPath)) {
    console.error(`ERRO: Arquivo SQL não encontrado em: ${sqlPath}`);
    process.exit(1);
}

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

let projectRef = '';
try {
    const u = new URL(config.supabase?.url);
    projectRef = u.hostname.split('.')[0];
} catch(e) {
    projectRef = config.supabase?.url || '';
}

console.log('================================================================');
console.log(`🚀 INICIALIZAÇÃO DE BANCO DE DADOS — CLIENTE: ${config.companyName} (${targetClient})`);
console.log('================================================================');
console.log(`URL Supabase: ${config.supabase?.url}`);
console.log(`Project Ref : ${projectRef}`);
console.log(`Link Direto SQL Editor: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
console.log('================================================================\n');

console.log('Instruções:');
console.log('1. Abra o link do SQL Editor acima no seu navegador.');
console.log(`2. O arquivo com todo o schema está em: ${sqlPath}`);
console.log('3. Cole o conteúdo do script SQL e clique em "RUN".');
console.log('4. Pronto! O banco estará 100% preparado com todas as tabelas, permissões e triggers.');
console.log('\n================================================================');
