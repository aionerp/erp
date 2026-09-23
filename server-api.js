// server-api.js
// Roteador de API Backend para persistencia segura com Neon PostgreSQL

require('dotenv').config();
const { Pool, types } = require('pg');

// Converter colunas NUMERIC/DECIMAL (OID 1700) para números JavaScript (evitando strings no frontend)
types.setTypeParser(1700, val => val === null ? null : parseFloat(val));

// Manter colunas DATE (OID 1082) como strings 'YYYY-MM-DD' puras sem conversão para UTC/Date object
types.setTypeParser(1082, val => val);

const pools = new Map();

function getPool(clientId) {
    const key = (clientId || 'cliente01').toLowerCase();
    if (pools.has(key)) return pools.get(key);

    const envKey = `${key.toUpperCase()}_DATABASE_URL`;
    const dbUrl = process.env[envKey] || process.env.DATABASE_URL;

    if (!dbUrl || dbUrl.includes('[SENHA]')) {
        return null;
    }

    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000
    });

    pool.on('error', (err) => {
        console.error(`[Pool ${key}] Erro inesperado:`, err.message);
    });

    pools.set(key, pool);
    return pool;
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end(JSON.stringify(data));
}

const TABLES_WITH_LOJA_ID = new Set([
    'agendamentos', 'boletos_pagar', 'caixas', 'categorias',
    'clientes', 'colaboradores', 'config_loja', 'despesas',
    'entradas', 'mesas_comandas', 'movimentos_estoque', 'produtos',
    'promocao_produtos', 'promocoes', 'saidas', 'usuarios',
    'servicos_recorrentes'
]);

// Helper para converter sintaxe de relações do Supabase / PostgREST em subqueries JSON do PostgreSQL
function parsePostgrestSelect(tableName, selectStr, mainAlias = 'm') {
    if (!selectStr || selectStr.trim() === '*' || selectStr.trim() === '') {
        return `${mainAlias}.*`;
    }

    if (!selectStr.includes('(')) {
        return selectStr.split(',').map(c => {
            const col = c.trim();
            if (!col) return '';
            return col === '*' ? `${mainAlias}.*` : (col.includes('.') ? col : `${mainAlias}.${col}`);
        }).filter(Boolean).join(', ');
    }

    const selectItems = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < selectStr.length; i++) {
        const char = selectStr[i];
        if (char === '(') depth++;
        if (char === ')') depth--;
        if (char === ',' && depth === 0) {
            if (current.trim()) selectItems.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) selectItems.push(current.trim());

    const FK_MAP = {
        saidas: { clientes: 'cliente_id', usuarios: 'usuario_id', colaboradores: 'colaborador_id', caixas: 'caixa_id' },
        saida_itens: { produtos: 'produto_id', saidas: 'saida_id', produtos_seriais: 'serial_id' },
        entradas: { clientes: 'fornecedor_id', fornecedores: 'fornecedor_id', usuarios: 'usuario_id' },
        entrada_itens: { produtos: 'produto_id', entradas: 'entrada_id' },
        movimentos_estoque: { produtos: 'produto_id', usuarios: 'usuario_id' },
        produtos_seriais: { produtos: 'produto_id' },
        promocao_produtos: { produtos: 'produto_id', promocoes: 'promocao_id' },
        despesas: { categorias: 'categoria_id', caixas: 'caixa_id', colaboradores: 'colaborador_id' },
        agendamentos: { clientes: 'cliente_id', produtos: 'produto_id', colaboradores: 'profissional_id', usuarios: 'usuario_id' },
        usuarios: { lojas: 'loja_id', config_loja: 'loja_id' },
        boletos_pagar: { fornecedores: 'fornecedor_id', clientes: 'fornecedor_id', entradas: 'entrada_id' },
        servicos_recorrentes: { clientes: 'cliente_id', produtos: 'produto_id' },
        produtos: { clientes: 'plano_cliente_id' }
    };

    const resultColumns = [];
    for (const item of selectItems) {
        const relMatch = item.match(/^([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+)|!([a-zA-Z0-9_]+))?\s*\(([\s\S]*)\)$/);
        if (relMatch) {
            const relKey = relMatch[1];
            const explicitFk = relMatch[2] || relMatch[3];
            const innerCols = relMatch[4]?.trim() || '*';
            const aliasName = relKey;

            let targetTable = relKey;
            let fkCol = explicitFk || FK_MAP[tableName]?.[targetTable] || `${targetTable.replace(/s$/, '')}_id`;

            if (tableName === 'entradas' && targetTable === 'clientes' && !explicitFk) {
                fkCol = 'fornecedor_id';
            }

            if (targetTable === 'lojas') {
                resultColumns.push(`(SELECT to_jsonb(rel) FROM (SELECT ${innerCols} FROM public.lojas WHERE id = ${mainAlias}.loja_id) rel) AS ${aliasName}`);
            } else if (targetTable === 'config_loja') {
                resultColumns.push(`(SELECT to_jsonb(rel) FROM (SELECT ${innerCols} FROM public.config_loja WHERE loja_id = ${mainAlias}.loja_id) rel) AS ${aliasName}`);
            } else {
                resultColumns.push(`(SELECT to_jsonb(rel) FROM (SELECT ${innerCols} FROM public.${targetTable} WHERE id = ${mainAlias}.${fkCol}) rel) AS ${aliasName}`);
            }
        } else {
            if (item === '*') {
                resultColumns.push(`${mainAlias}.*`);
            } else if (!item.includes('.')) {
                resultColumns.push(`${mainAlias}.${item}`);
            } else {
                resultColumns.push(item);
            }
        }
    }

    return resultColumns.join(', ');
}

// Handler para rotas /api/*
async function handleApiRequest(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        });
        res.end();
        return true;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 1. Health check
    if (pathname === '/api/health') {
        const targetClient = url.searchParams.get('client') || 'cliente01';
        const pool = getPool(targetClient);
        let dbStatus = 'not_configured';
        if (pool) {
            try {
                const test = await pool.query('SELECT 1 as connected');
                dbStatus = test.rows[0].connected === 1 ? 'connected' : 'error';
            } catch (e) {
                dbStatus = `error: ${e.message}`;
            }
        }
        sendJson(res, 200, {
            status: 'ok',
            client: targetClient,
            neonStatus: dbStatus,
            timestamp: new Date().toISOString()
        });
        return true;
    }

    // 2. Query de dados: POST /api/data/:client/:table
    const dataMatch = pathname.match(/^\/api\/data\/([^\/]+)\/([^\/]+)$/);
    if (dataMatch) {
        const clientId = dataMatch[1];
        const tableName = dataMatch[2];
        const pool = getPool(clientId);

        if (!pool) {
            sendJson(res, 503, {
                error: { message: `Banco Neon não configurado para o cliente ${clientId}. Verifique o arquivo .env.` }
            });
            return true;
        }

        try {
            const body = await parseJsonBody(req);
            let tenantId = req.headers['x-tenant-id'] || body.loja_id;
            if (!tenantId && TABLES_WITH_LOJA_ID.has(tableName)) {
                tenantId = 1;
            }

            if (body.action === 'select') {
                const selectClause = parsePostgrestSelect(tableName, body.select, 'm');
                let queryStr = `SELECT ${selectClause} FROM public.${tableName} m`;
                const whereClauses = [];
                const params = [];

                if (tenantId && TABLES_WITH_LOJA_ID.has(tableName)) {
                    params.push(tenantId);
                    whereClauses.push(`m.loja_id = $${params.length}`);
                }

                if (Array.isArray(body.filters)) {
                    for (const f of body.filters) {
                        if (f.operator === 'OR' && f.raw) {
                            const parts = f.raw.split(',');
                            const orClauses = [];
                            for (const p of parts) {
                                const m = p.trim().match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\.(.*)$/);
                                if (m) {
                                    const colName = m[1].includes('.') ? m[1] : `m.${m[1]}`;
                                    const opName = m[2];
                                    let rawVal = m[3];
                                    if (opName === 'eq') {
                                        params.push(rawVal);
                                        orClauses.push(`${colName} = $${params.length}`);
                                    } else if (opName === 'ilike') {
                                        params.push(rawVal);
                                        orClauses.push(`${colName} ILIKE $${params.length}`);
                                    } else if (opName === 'like') {
                                        params.push(rawVal);
                                        orClauses.push(`${colName} LIKE $${params.length}`);
                                    } else if (opName === 'neq') {
                                        params.push(rawVal);
                                        orClauses.push(`${colName} != $${params.length}`);
                                    }
                                }
                            }
                            if (orClauses.length > 0) {
                                whereClauses.push(`(${orClauses.join(' OR ')})`);
                            }
                            continue;
                        }

                        if (f.operator === 'NOT') {
                            const col = f.column.includes('.') ? f.column : `m.${f.column}`;
                            if (f.subOperator === 'is' && (f.value === null || f.value === 'null')) {
                                whereClauses.push(`${col} IS NOT NULL`);
                            } else {
                                params.push(f.value);
                                whereClauses.push(`${col} != $${params.length}`);
                            }
                            continue;
                        }

                        if (f.operator === 'IN' || f.operator === '= ANY') {
                            const col = f.column.includes('.') ? f.column : `m.${f.column}`;
                            const vals = Array.isArray(f.value) ? f.value : [f.value];
                            params.push(vals);
                            whereClauses.push(`${col} = ANY($${params.length})`);
                            continue;
                        }

                        if (f.operator === '@>') {
                            const col = f.column.includes('.') ? f.column : `m.${f.column}`;
                            params.push(typeof f.value === 'string' ? f.value : JSON.stringify(f.value));
                            whereClauses.push(`${col} @> $${params.length}::jsonb`);
                            continue;
                        }

                        if (f.operator === 'IS') {
                            const col = f.column.includes('.') ? f.column : `m.${f.column}`;
                            if (f.value === null || f.value === 'null') {
                                whereClauses.push(`${col} IS NULL`);
                            } else {
                                params.push(f.value);
                                whereClauses.push(`${col} IS $${params.length}`);
                            }
                            continue;
                        }

                        params.push(f.value);
                        const col = f.column.includes('.') ? f.column : `m.${f.column}`;
                        whereClauses.push(`${col} ${f.operator || '='} $${params.length}`);
                    }
                }

                if (whereClauses.length > 0) {
                    queryStr += ` WHERE ${whereClauses.join(' AND ')}`;
                }

                if (body.order && body.order.column) {
                    const ordCol = body.order.column.includes('.') ? body.order.column : `m.${body.order.column}`;
                    queryStr += ` ORDER BY ${ordCol} ${body.order.ascending ? 'ASC' : 'DESC'}`;
                }

                let totalCount = null;
                if (body.countExact && body.limit) {
                    let countQ = `SELECT count(*) as total FROM public.${tableName} m`;
                    if (whereClauses.length > 0) countQ += ` WHERE ${whereClauses.join(' AND ')}`;
                    const countRes = await pool.query(countQ, params);
                    totalCount = parseInt(countRes.rows[0].total, 10);
                }

                if (body.limit) {
                    params.push(Number(body.limit));
                    queryStr += ` LIMIT $${params.length}`;
                }

                const result = await pool.query(queryStr, params);
                sendJson(res, 200, {
                    data: result.rows,
                    error: null,
                    count: totalCount !== null ? totalCount : result.rowCount
                });
                return true;
            }

            if (body.action === 'insert') {
                const rows = Array.isArray(body.values) ? body.values : [body.values];
                if (rows.length === 0) {
                    sendJson(res, 200, { data: [], error: null });
                    return true;
                }

                const inserted = [];
                for (const r of rows) {
                    if (tenantId && !r.loja_id && TABLES_WITH_LOJA_ID.has(tableName)) {
                        r.loja_id = tenantId;
                    }
                    // Remover id se for nulo, indefinido ou vazio para permitir o serial/autoincrement do banco
                    if (r.id === null || r.id === undefined || r.id === '') {
                        delete r.id;
                    }
                    const cols = Object.keys(r);
                    const vals = cols.map(c => r[c] === undefined ? null : r[c]);
                    const placeholders = vals.map((_, idx) => `$${idx + 1}`);

                    const q = `INSERT INTO public.${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
                    const resIns = await pool.query(q, vals);
                    inserted.push(...resIns.rows);
                }

                sendJson(res, 201, { data: inserted, error: null });
                return true;
            }

            if (body.action === 'update') {
                const values = body.values || {};
                const cols = Object.keys(values).filter(c => c !== 'id');
                const params = cols.map(c => values[c] === undefined ? null : values[c]);

                let whereClauses = [];
                if (tenantId && TABLES_WITH_LOJA_ID.has(tableName)) {
                    params.push(tenantId);
                    whereClauses.push(`loja_id = $${params.length}`);
                }

                if (Array.isArray(body.filters)) {
                    for (const f of body.filters) {
                        if (f.operator === 'IN' || f.operator === '= ANY') {
                            const vals = Array.isArray(f.value) ? f.value : [f.value];
                            params.push(vals);
                            whereClauses.push(`${f.column} = ANY($${params.length})`);
                        } else if (f.operator === 'IS') {
                            if (f.value === null || f.value === 'null') {
                                whereClauses.push(`${f.column} IS NULL`);
                            } else {
                                params.push(f.value);
                                whereClauses.push(`${f.column} IS $${params.length}`);
                            }
                        } else {
                            params.push(f.value);
                            whereClauses.push(`${f.column} ${f.operator || '='} $${params.length}`);
                        }
                    }
                }

                const setStr = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
                let q = `UPDATE public.${tableName} SET ${setStr}`;
                if (whereClauses.length > 0) q += ` WHERE ${whereClauses.join(' AND ')}`;
                q += ` RETURNING *`;

                const resUpd = await pool.query(q, params);
                sendJson(res, 200, { data: resUpd.rows, error: null });
                return true;
            }

            if (body.action === 'delete') {
                const params = [];
                let whereClauses = [];

                if (tenantId && TABLES_WITH_LOJA_ID.has(tableName)) {
                    params.push(tenantId);
                    whereClauses.push(`loja_id = $${params.length}`);
                }

                if (Array.isArray(body.filters)) {
                    for (const f of body.filters) {
                        if (f.operator === 'IN' || f.operator === '= ANY') {
                            const vals = Array.isArray(f.value) ? f.value : [f.value];
                            params.push(vals);
                            whereClauses.push(`${f.column} = ANY($${params.length})`);
                        } else {
                            params.push(f.value);
                            whereClauses.push(`${f.column} ${f.operator || '='} $${params.length}`);
                        }
                    }
                }

                let q = `DELETE FROM public.${tableName}`;
                if (whereClauses.length > 0) q += ` WHERE ${whereClauses.join(' AND ')}`;
                q += ` RETURNING *`;

                const resDel = await pool.query(q, params);
                sendJson(res, 200, { data: resDel.rows, error: null });
                return true;
            }

            sendJson(res, 400, { error: { message: `Ação ${body.action} não suportada.` } });
            return true;
        } catch (err) {
            console.error(`Erro na API /api/data/${clientId}/${tableName}:`, err);
            sendJson(res, 500, { data: null, error: { message: err.message, detail: err.detail } });
            return true;
        }
    }

    // 3. Execução RPC: POST /api/rpc/:client/:function
    const rpcMatch = pathname.match(/^\/api\/rpc\/([^\/]+)\/([^\/]+)$/);
    if (rpcMatch) {
        const clientId = rpcMatch[1];
        const fnName = rpcMatch[2];
        const pool = getPool(clientId);

        if (!pool) {
            sendJson(res, 503, { error: `Banco Neon não configurado para ${clientId}.` });
            return true;
        }

        try {
            const body = await parseJsonBody(req);
            const paramKeys = Object.keys(body);
            const paramVals = paramKeys.map(k => body[k]);
            const placeholders = paramVals.map((_, idx) => `$${idx + 1}`).join(', ');

            const q = `SELECT * FROM public.${fnName}(${placeholders})`;
            const result = await pool.query(q, paramVals);

            // Se retornar coluna única jsonb ou objeto, desembrulhar
            let outData = result.rows;
            if (result.rows.length === 1) {
                const row = result.rows[0];
                const keys = Object.keys(row);
                if (keys.length === 1 && typeof row[keys[0]] === 'object') {
                    outData = row[keys[0]];
                }
            }

            sendJson(res, 200, { data: outData, error: null });
            return true;
        } catch (err) {
            console.error(`Erro na RPC /api/rpc/${clientId}/${fnName}:`, err);
            sendJson(res, 500, { data: null, error: err.message });
            return true;
        }
    }

    return false;
}

module.exports = {
    handleApiRequest
};
