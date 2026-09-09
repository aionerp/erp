// scripts/migration/cutover.js
// Executa o chaveamento definitivo (cutover) para o Neon PostgreSQL

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
console.log(`🚀 INICIANDO CUTOVER DE PRODUÇÃO — CLIENTE: ${targetClient.toUpperCase()}`);
console.log('================================================================');

console.log('1. Executando sincronização delta final...');
try {
    execSync(`node scripts/migration/05_sync_deltas.js ${targetClient}`, { stdio: 'inherit' });
} catch (e) {
    console.error('❌ Falha na sincronização delta final. Cutover abortado para segurança!');
    process.exit(1);
}

console.log('\n2. Executando validação cruzada de dados...');
try {
    execSync(`node scripts/migration/06_validate_data.js ${targetClient}`, { stdio: 'inherit' });
} catch (e) {
    console.error('❌ Falha na validação de integridade. Cutover abortado!');
    process.exit(1);
}

console.log('\n3. Alternando provedor de banco de dados para "neon"...');
const config = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
if (!config.database) config.database = {};
config.database.provider = 'neon';
config.database.connectionId = targetClient;

fs.writeFileSync(clientConfigPath, JSON.stringify(config, null, 2), 'utf8');
console.log(`✅ Configuração de ${targetClient} atualizada para "provider": "neon".`);

console.log('\n4. Regerando build estático e manifesto multicliente...');
try {
    execSync(`node build.js ${targetClient}`, { stdio: 'inherit' });
} catch (e) {
    console.error('❌ Falha no build pós-cutover. Revertendo...');
    execSync(`node scripts/migration/rollback.js ${targetClient}`, { stdio: 'inherit' });
    process.exit(1);
}

console.log('----------------------------------------------------------------');
console.log(`🎉 CUTOVER CONCLUÍDO COM SUCESSO! O cliente ${targetClient} está operando no Neon PostgreSQL.`);
console.log(`Lembrete: O banco Supabase original permanece preservado e seguro.`);
console.log('================================================================\n');
