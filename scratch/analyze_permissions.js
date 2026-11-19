const { Pool } = require('pg');
require('dotenv').config();

async function analyzeClient(clientKey) {
  const url = process.env[clientKey.toUpperCase() + '_DATABASE_URL'] || (clientKey === 'cliente01' ? process.env.DATABASE_URL : null);
  if (!url) {
    console.log(`[${clientKey}] No DB URL found.`);
    return;
  }

  const pool = new Pool({ connectionString: url });
  try {
    console.log(`\n========================================`);
    console.log(`CLIENTE: ${clientKey}`);
    console.log(`========================================`);

    // 1. Usuários cadastrados e suas permissões
    const users = await pool.query(`
      SELECT id, nome, email, perfil, nivel_acesso, ativo, loja_id, permissoes 
      FROM public.usuarios 
      ORDER BY id
    `);
    console.log(`\nUsuários cadastrados (${users.rows.length}):`);
    users.rows.forEach(u => {
      console.log(`  ID: ${u.id} | Email/Login: ${u.email} | Perfil: ${u.perfil} | Nível: ${u.nivel_acesso} | Ativo: ${u.ativo} | Loja: ${u.loja_id}`);
      console.log(`    Permissões:`, JSON.stringify(u.permissoes, null, 2));
    });

    // 2. RLS policies
    const rls = await pool.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'public'
    `);
    console.log(`\nPolíticas RLS (${rls.rows.length}):`);
    rls.rows.forEach(p => {
      console.log(`  - Tabela: ${p.tablename} | Política: ${p.policyname} | Cmd: ${p.cmd}`);
    });

    // 3. Funções RPC relevantes (autenticação, etc.)
    const funcs = await pool.query(`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      ORDER BY routine_name
    `);
    console.log(`\nFunções RPC (${funcs.rows.length}):`, funcs.rows.map(r => r.routine_name).join(', '));

    // 4. Ver conteúdo de autenticar_usuario e login_usuario se existirem
    for (const fn of ['autenticar_usuario', 'login_usuario', 'primeiro_acesso_loja']) {
      const def = await pool.query(`
        SELECT pg_get_functiondef(p.oid) as def
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [fn]);
      if (def.rows.length > 0) {
        console.log(`\n--- DEFINIÇÃO DE ${fn} ---`);
        console.log(def.rows[0].def);
      }
    }

  } catch (err) {
    console.error(`Erro ao analisar ${clientKey}:`, err.message);
  } finally {
    await pool.end();
  }
}

(async () => {
  for (const c of ['cliente01', 'cliente02', 'cliente03']) {
    await analyzeClient(c);
  }
})();
