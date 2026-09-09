// js/data-layer.js
// Camada de Abstração de Acesso a Dados (Data Layer) — Aion ERP
// Permite alternar transparentemente entre Supabase e Neon PostgreSQL sem alterar as telas

(function() {
    class NeonQueryBuilder {
        constructor(clientId, tableName) {
            this.clientId = clientId || 'cliente01';
            this.tableName = tableName;
            this.action = 'select';
            this.selectCols = '*';
            this.filters = [];
            this.orderParam = null;
            this.limitParam = null;
            this.valuesParam = null;
            this.isSingle = false;
        }

        select(cols = '*', options = {}) {
            if (this.action !== 'insert' && this.action !== 'update' && this.action !== 'delete') {
                this.action = 'select';
            }
            this.selectCols = cols;
            this.countExact = options?.count === 'exact';
            return this;
        }

        insert(values) {
            this.action = 'insert';
            this.valuesParam = values;
            return this;
        }

        update(values) {
            this.action = 'update';
            this.valuesParam = values;
            return this;
        }

        delete() {
            this.action = 'delete';
            return this;
        }

        eq(column, value) {
            this.filters.push({ column, operator: '=', value });
            return this;
        }

        neq(column, value) {
            this.filters.push({ column, operator: '!=', value });
            return this;
        }

        gt(column, value) {
            this.filters.push({ column, operator: '>', value });
            return this;
        }

        gte(column, value) {
            this.filters.push({ column, operator: '>=', value });
            return this;
        }

        lt(column, value) {
            this.filters.push({ column, operator: '<', value });
            return this;
        }

        lte(column, value) {
            this.filters.push({ column, operator: '<=', value });
            return this;
        }

        like(column, pattern) {
            this.filters.push({ column, operator: 'LIKE', value: pattern });
            return this;
        }

        ilike(column, pattern) {
            this.filters.push({ column, operator: 'ILIKE', value: pattern });
            return this;
        }

        is(column, value) {
            this.filters.push({ column, operator: 'IS', value });
            return this;
        }

        in(column, values) {
            this.filters.push({ column, operator: 'IN', value: values });
            return this;
        }

        not(column, operator, value) {
            this.filters.push({ column, operator: 'NOT', subOperator: operator, value: value });
            return this;
        }

        or(filterStr) {
            this.filters.push({ operator: 'OR', raw: filterStr });
            return this;
        }

        contains(column, value) {
            this.filters.push({ column, operator: '@>', value: value });
            return this;
        }

        order(column, options = {}) {
            this.orderParam = {
                column,
                ascending: options.ascending !== false
            };
            return this;
        }

        limit(n) {
            this.limitParam = n;
            return this;
        }

        range(from, to) {
            this.limitParam = (to - from + 1);
            return this;
        }

        single() {
            this.isSingle = true;
            this.limitParam = 1;
            return this;
        }

        maybeSingle() {
            this.isSingle = true;
            this.limitParam = 1;
            return this;
        }

        async execute() {
            const baseUrl = (typeof window !== 'undefined' && window.location && ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3000' && window.location.port !== '')) ? 'http://127.0.0.1:3000' : '';
            const endpoint = `${baseUrl}/api/data/${this.clientId}/${this.tableName}`;
            const headers = { 'Content-Type': 'application/json' };

            // Injetar tenant-id da sessão se disponível
            try {
                const uStr = sessionStorage.getItem('usuario');
                if (uStr) {
                    const u = JSON.parse(uStr);
                    if (u?.loja_id) headers['x-tenant-id'] = String(u.loja_id);
                }
            } catch(e){}

            const payload = {
                action: this.action,
                select: this.selectCols,
                countExact: this.countExact,
                filters: this.filters,
                order: this.orderParam,
                limit: this.limitParam,
                values: this.valuesParam
            };

            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });

                const result = await res.json();
                if (!res.ok || result.error) {
                    const rawErr = result.error || `Erro HTTP ${res.status}`;
                    const errorObj = typeof rawErr === 'string' ? { message: rawErr } : rawErr;
                    if (!errorObj.message) errorObj.message = JSON.stringify(rawErr);
                    return { data: null, error: errorObj, count: 0 };
                }

                let data = result.data;
                if (this.isSingle) {
                    data = Array.isArray(data) && data.length > 0 ? data[0] : (Array.isArray(data) && data.length === 0 ? null : data);
                }

                return {
                    data,
                    error: null,
                    count: result.count !== undefined ? result.count : (Array.isArray(data) ? data.length : (data ? 1 : 0))
                };
            } catch (err) {
                console.error(`[DataLayer] Erro ao conectar ao servidor backend em ${endpoint}:`, err);
                return { data: null, error: { message: `Servidor backend offline. Certifique-se de executar 'npm run dev' no terminal.` }, count: 0 };
            }
        }

        then(onFulfilled, onRejected) {
            return this.execute().then(onFulfilled, onRejected);
        }
    }

    class NeonClient {
        constructor(clientConfig) {
            this.clientId = clientConfig?.clientId || 'cliente01';
            this.config = clientConfig;
        }

        from(tableName) {
            return new NeonQueryBuilder(this.clientId, tableName);
        }

        async rpc(functionName, params = {}) {
            const baseUrl = (typeof window !== 'undefined' && window.location && ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3000' && window.location.port !== '')) ? 'http://127.0.0.1:3000' : '';
            const endpoint = `${baseUrl}/api/rpc/${this.clientId}/${functionName}`;
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params)
                });
                const result = await res.json();
                if (!res.ok) {
                    return { data: null, error: result.error || { message: `Erro na RPC (${res.status})` } };
                }
                return { data: result.data, error: null };
            } catch (err) {
                console.error(`[DataLayer] Erro ao executar RPC em ${endpoint}:`, err);
                return { data: null, error: { message: `Servidor backend offline. Certifique-se de executar 'npm run dev' no terminal.` } };
            }
        }
    }

    window.AionDataLayer = {
        createClient: function(clientConfig) {
            const hasSupabaseCreds = !!(clientConfig?.supabase?.url && clientConfig?.supabase?.anonKey);
            const provider = clientConfig?.database?.provider || (hasSupabaseCreds ? 'supabase' : 'neon');
            
            if (provider === 'neon' || !hasSupabaseCreds) {
                console.log(`[DataLayer] Conectando ao provedor NEON para o cliente: ${clientConfig?.clientId || 'cliente01'}`);
                return new NeonClient(clientConfig || { clientId: 'cliente01' });
            }

            // Provedor: Supabase (apenas quando credenciais existirem)
            console.log(`[DataLayer] Conectando ao provedor SUPABASE para o cliente: ${clientConfig?.clientId || 'cliente01'}`);
            if (typeof window.criarClienteSupabaseOriginal === 'function') {
                const client = window.criarClienteSupabaseOriginal(clientConfig?.supabase?.url, clientConfig?.supabase?.anonKey);
                if (client) return client;
            }
            return new NeonClient(clientConfig || { clientId: 'cliente01' });
        }
    };
})();
