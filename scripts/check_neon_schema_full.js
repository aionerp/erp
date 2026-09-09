require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.CLIENTE01_DATABASE_URL });

async function run() {
    const fn = await pool.query("SELECT routine_definition FROM information_schema.routines WHERE routine_name = 'obter_loja_id_requisicao'");
    console.log('Definition of obter_loja_id_requisicao:\n', fn.rows[0]?.routine_definition);

    const pols = await pool.query(`
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename IN ('saidas', 'produtos', 'promocoes', 'clientes')
    `);
    console.log('\nRow Security enabled:', pols.rows);

    await pool.end();
}
run().catch(console.error);

