require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.CLIENTE01_DATABASE_URL });

async function audit() {
    console.log('=== AUDITORIA COMPLETA DE TABELAS NO NEON ===');
    const tablesRes = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`Total de tabelas encontradas: ${tables.length}`);
    console.log(tables.join(', '));

    console.log('\n=== VERIFICANDO COLUNAS IMPORTANTES ===');
    const colsCheck = [
        { table: 'saida_itens', col: 'desconto' },
        { table: 'saida_itens', col: 'origem_desconto' },
        { table: 'saida_itens', col: 'promocao_id' },
        { table: 'saidas', col: 'desconto' },
        { table: 'saidas', col: 'caixa_id' },
        { table: 'saidas', col: 'colaborador_id' },
        { table: 'saidas', col: 'comissao_calculada' },
        { table: 'saidas', col: 'comissao_paga' },
        { table: 'promocoes', col: 'id' },
        { table: 'promocao_produtos', col: 'id' }
    ];

    for (const c of colsCheck) {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        `, [c.table, c.col]);
        if (res.rows.length > 0) {
            console.log(`✅ ${c.table}.${c.col} (${res.rows[0].data_type})`);
        } else {
            console.log(`❌ FALTANDO: ${c.table}.${c.col}`);
        }
    }

    await pool.end();
}

audit().catch(console.error);
