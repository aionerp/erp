const fs = require('fs');
const path = require('path');

// 1. Validar carregamento do clients.json
const clientsJsonPath = path.join(__dirname, '../clients.json');
if (!fs.existsSync(clientsJsonPath)) {
    console.error('FAIL: clients.json não encontrado!');
    process.exit(1);
}

const clients = JSON.parse(fs.readFileSync(clientsJsonPath, 'utf8'));
console.log(`PASS: clients.json carregado com ${clients.length} cliente(s).`);

// Helper para testar busca por CNPJ
function buscarClientePorCnpj(cnpj) {
    const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
    if (!cleanCnpj) return null;
    return clients.find(c => String(c.cnpj).replace(/\D/g, '') === cleanCnpj) || null;
}

// Helper para testar busca por Prefixo
function buscarClientePorPrefixo(prefixo) {
    const cleanPref = String(prefixo || '').trim().toLowerCase();
    if (!cleanPref) return null;
    return clients.find(c => String(c.prefix || c.clientId).toLowerCase() === cleanPref) || null;
}

// 2. Testar busca por CNPJ com e sem máscara
const c1 = buscarClientePorCnpj('12.345.678/0001-90');
const c1Raw = buscarClientePorCnpj('12345678000190');
if (!c1 || !c1Raw || c1.clientId !== 'cliente01') {
    console.error('FAIL: Busca por CNPJ falhou!', c1);
    process.exit(1);
}
console.log('PASS: Busca por CNPJ com e sem máscara validada com sucesso.');

// 3. Testar busca por Prefixo
const cPref = buscarClientePorPrefixo('aionerp');
if (!cPref || cPref.clientId !== 'cliente01') {
    console.error('FAIL: Busca por Prefixo "aionerp" falhou!', cPref);
    process.exit(1);
}
console.log('PASS: Busca por Prefixo "aionerp" retornou Cliente 01.');

// 4. Testar prefixo adm.<prefixo>
const inputUser = 'adm.aionerp';
const parts = inputUser.split('.');
const extractedPrefix = parts[parts.length - 1].toLowerCase();
const resolvedClient = buscarClientePorPrefixo(extractedPrefix);

if (!resolvedClient || resolvedClient.prefix !== 'aionerp') {
    console.error('FAIL: Resolução de login adm.aionerp falhou!');
    process.exit(1);
}
console.log(`PASS: Login "${inputUser}" roteado com sucesso para a loja "${resolvedClient.companyName}".`);

// 5. Testar CNPJ inexistente
const cInvalido = buscarClientePorCnpj('00.000.000/0000-00');
if (cInvalido !== null) {
    console.error('FAIL: CNPJ inexistente não retornou null!');
    process.exit(1);
}
console.log('PASS: CNPJ inexistente tratado com sucesso (retornou null).');

console.log('\n==========================================');
console.log('✅ TODOS OS TESTES DE VALIDAÇÃO PASSARAM!');
console.log('==========================================');
