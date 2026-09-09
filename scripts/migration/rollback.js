// scripts/migration/rollback.js
// Executa rollback imediato do cliente para o Supabase sem interrupção

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetClient = process.argv[2] || process.env.CLIENTE || 'cliente01';
const clientConfigPath = path.join(__dirname, '..', '..', 'clients', targetClient, 'config.json');

if (!fs.existsSync(clientConfigPath)) {
    console.error(`ERRO: Configuração do cliente "${targetClient}" não encontrada.`);
    process.exit(1);
}

console.log('================================================================');
console.log(`⏪ ROLLBACK DE EMERGÊNCIA — CLIENTE: ${targetClient.toUpperCase()}`);
console.log('================================================================');

const config = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));

// Reverter provedor para supabase
if (!config.database) config.database = {};
config.database.provider = 'supabase';
config.database.connectionId = targetClient;

fs.writeFileSync(clientConfigPath, JSON.stringify(config, null, 2), 'utf8');
console.log(`✅ Configuração de ${targetClient} revertida para "provider": "supabase".`);

console.log('Regerando manifesto clients.json e build estático...');
try {
    execSync(`node build.js ${targetClient}`, { stdio: 'inherit' });
    console.log('----------------------------------------------------------------');
    console.log(`✅ ROLLBACK CONCLUÍDO COM SUCESSO! O cliente ${targetClient} está operando no Supabase.`);
    console.log('================================================================\n');
} catch (e) {
    console.error('❌ Falha ao executar rebuild do cliente pós-rollback:', e.message);
    process.exit(1);
}
