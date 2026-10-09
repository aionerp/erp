// scripts/fix_cancelados_fiado.js
const { Pool } = require('pg');
require('dotenv').config();

const clients = [
    { name: 'CLIENTE01', url: process.env.CLIENTE01_DATABASE_URL },
    { name: 'CLIENTE02', url: process.env.CLIENTE02_DATABASE_URL },
    { name: 'CLIENTE03', url: process.env.CLIENTE03_DATABASE_URL }
];

async function fix() {
    console.log('🔄 Sincronizando e corrigindo registros cancelados em todos os tenants...');

    for (const cli of clients) {
        if (!cli.url) {
            console.log(`[${cli.name}] Ignorado (sem URL)`);
            continue;
        }

        const pool = new Pool({ connectionString: cli.url });
        try {
            console.log(`\n--- Processando ${cli.name} ---`);

            // 1. Sincronizar contas_receber de saidas canceladas
            const resCR = await pool.query(`
                UPDATE public.contas_receber
                SET status = 'cancelado',
                    updated_at = now()
                WHERE status != 'cancelado'
                  AND saida_id IN (SELECT id FROM public.saidas WHERE cancelado = true)
                RETURNING id, saida_id;
            `);
            console.log(`[${cli.name}] Contas a receber marcadas como canceladas: ${resCR.rowCount}`);

            // 2. Sincronizar contas_receber_pagamentos de saidas canceladas ou contas canceladas
            const resCRP = await pool.query(`
                UPDATE public.contas_receber_pagamentos
                SET cancelado = true,
                    cancelado_em = COALESCE(cancelado_em, now()),
                    motivo_cancelamento = COALESCE(motivo_cancelamento, 'Cancelamento automático: Venda ou Conta a Receber associada foi cancelada')
                WHERE cancelado = false
                  AND (
                    saida_id IN (SELECT id FROM public.saidas WHERE cancelado = true)
                    OR conta_receber_id IN (SELECT id FROM public.contas_receber WHERE status = 'cancelado')
                  )
                RETURNING id, saida_id, conta_receber_id, valor_pago;
            `);
            console.log(`[${cli.name}] Pagamentos de fiado marcados como cancelados: ${resCRP.rowCount}`);
            if (resCRP.rowCount > 0) {
                console.log(`[${cli.name}] IDs corrigidos:`, resCRP.rows.map(r => `ID #${r.id} (R$ ${r.valor_pago})`));
            }

        } catch (err) {
            console.error(`[${cli.name}] Erro:`, err.message);
        } finally {
            await pool.end();
        }
    }

    console.log('\n✅ Correção de integridade concluída com sucesso!');
}

fix();
