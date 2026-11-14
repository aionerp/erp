require('dotenv').config({ path: 'C:/Users/ailton.cordeiro/ERP-Novo/erp/.env' });
const { Client } = require('pg');
const fs = require('fs');

async function fullAudit() {
    console.log('Iniciando auditoria completa do banco de dados cliente03 (MarceloMotos)...');

    const c1 = new Client({ connectionString: process.env.CLIENTE01_DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const c3 = new Client({ connectionString: process.env.CLIENTE03_DATABASE_URL, ssl: { rejectUnauthorized: false } });

    await c1.connect();
    await c3.connect();

    // 1. Tabelas
    const qTables = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
        ORDER BY table_name;
    `;
    const tables1 = (await c1.query(qTables)).rows.map(r => r.table_name);
    const tables3 = (await c3.query(qTables)).rows.map(r => r.table_name);

    console.log(`\n======================================================`);
    console.log(`1. VERIFICAÇÃO DE TABELAS (Total C1: ${tables1.length} | Total C3: ${tables3.length})`);
    console.log(`======================================================`);
    
    const set3 = new Set(tables3);
    const missingTablesIn3 = tables1.filter(t => !set3.has(t));
    if (missingTablesIn3.length === 0) {
        console.log('✅ Todas as tabelas do sistema de referência existem no cliente03!');
    } else {
        console.log('❌ Tabelas ausentes no cliente03:', missingTablesIn3);
    }

    const extraTablesIn3 = tables3.filter(t => !new Set(tables1).has(t));
    if (extraTablesIn3.length > 0) {
        console.log('ℹ️ Tabelas extras no cliente03:', extraTablesIn3);
    }

    // 2. Colunas
    console.log(`\n======================================================`);
    console.log(`2. VERIFICAÇÃO DE COLUNAS EM TODAS AS TABELAS`);
    console.log(`======================================================`);
    const qCols = `
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
    `;
    const cols1 = (await c1.query(qCols)).rows;
    const cols3 = (await c3.query(qCols)).rows;

    const map3 = new Map(cols3.map(r => [`${r.table_name}.${r.column_name}`, r]));
    const missingCols = [];
    for (const c of cols1) {
        const key = `${c.table_name}.${c.column_name}`;
        if (!map3.has(key)) {
            missingCols.push(c);
        }
    }

    if (missingCols.length === 0) {
        console.log('✅ Nenhuma coluna ausente em nenhuma tabela no cliente03!');
    } else {
        console.log(`❌ ${missingCols.length} colunas ausentes no cliente03:`);
        missingCols.forEach(c => console.log(`   - ${c.table_name}.${c.column_name} (${c.data_type})`));
    }

    // 3. Triggers & Functions
    console.log(`\n======================================================`);
    console.log(`3. FUNÇÕES E PROCEDIMENTOS`);
    console.log(`======================================================`);
    const qFuncs = `
        SELECT routine_name, routine_type 
        FROM information_schema.routines 
        WHERE specific_schema = 'public'
        ORDER BY routine_name;
    `;
    const f1 = (await c1.query(qFuncs)).rows.map(r => r.routine_name);
    const f3 = (await c3.query(qFuncs)).rows.map(r => r.routine_name);
    const setF3 = new Set(f3);
    const missingFuncs = f1.filter(f => !setF3.has(f));
    if (missingFuncs.length === 0) {
        console.log('✅ Todas as funções do schema existem no cliente03!');
    } else {
        console.log('❌ Funções ausentes:', missingFuncs);
    }

    // 4. Triggers
    console.log(`\n======================================================`);
    console.log(`4. TRIGGERS`);
    console.log(`======================================================`);
    const qTrig = `
        SELECT event_object_table, trigger_name 
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name;
    `;
    const tr1 = (await c1.query(qTrig)).rows;
    const tr3 = (await c3.query(qTrig)).rows;
    const setTr3 = new Set(tr3.map(r => `${r.event_object_table}.${r.trigger_name}`));
    const missingTr = tr1.filter(r => !setTr3.has(`${r.event_object_table}.${r.trigger_name}`));
    if (missingTr.length === 0) {
        console.log('✅ Todos os triggers existem no cliente03!');
    } else {
        console.log('❌ Triggers ausentes no cliente03:', missingTr);
    }

    // 5. Volume de dados no cliente03
    console.log(`\n======================================================`);
    console.log(`5. CONTAGEM DE REGISTROS POR TABELA NO CLIENTE03`);
    console.log(`======================================================`);
    const counts = [];
    for (const t of tables3) {
        try {
            const res = await c3.query(`SELECT count(*) FROM public."${t}";`);
            counts.push({ tabela: t, registros: parseInt(res.rows[0].count) });
        } catch (e) {
            counts.push({ tabela: t, registros: 'ERRO: ' + e.message });
        }
    }
    console.table(counts);

    // 6. Teste de integridade de INSERT/SELECT em tabelas principais
    console.log(`\n======================================================`);
    console.log(`6. TESTE DE INTEGRIDADE DAS TABELAS CHAVE`);
    console.log(`======================================================`);
    const testTables = [
        'lojas', 'usuarios', 'categorias', 'produtos', 'clientes',
        'fornecedores', 'caixas', 'saidas', 'saida_itens', 'entradas',
        'entrada_itens', 'movimentos_estoque', 'despesas', 'contas_receber',
        'contas_receber_pagamentos', 'servicos_recorrentes'
    ];

    for (const t of testTables) {
        try {
            const res = await c3.query(`SELECT * FROM public."${t}" LIMIT 1;`);
            console.log(`✅ Tabela ${t.padEnd(25)}: OK (Acesso e select funcionando)`);
        } catch (e) {
            console.log(`❌ Tabela ${t.padEnd(25)}: ERRO -> ${e.message}`);
        }
    }

    await c1.end();
    await c3.end();
    console.log('\nAuditoria concluída.');
}

fullAudit().catch(console.error);
