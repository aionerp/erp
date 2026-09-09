// js/data-layer.js
// Camada de Abstração de Acesso a Dados (Data Layer) — Aion ERP
// Permite alternar transparentemente entre Supabase e Neon PostgreSQL sem alterar as telas

(function() {
    // Helper de resolução determinística do ID do cliente com isolamento rigoroso de tenancy
    function resolveClientId(configOrId) {
        // 1. Se já for uma string válida e explícita diferente de default 'cliente01'
        if (typeof configOrId === 'string' && configOrId.trim()) {
            const trimmed = configOrId.trim();
            if (trimmed !== 'cliente01') return trimmed;
        }

        // 2. Se for um objeto de configuração
        if (configOrId && typeof configOrId === 'object') {
            const id = configOrId.clientId || configOrId.CLIENT_ID || configOrId.database?.connectionId || configOrId.DATABASE?.connectionId;
            if (id && id !== 'cliente01') return id;
        }

        // 3. Tentar da sessão ativa (sessionStorage.active_client)
        try {
            if (typeof sessionStorage !== 'undefined') {
                const activeStr = sessionStorage.getItem('active_client');
                if (activeStr) {
                    const active = JSON.parse(activeStr);
                    const sId = active?.clientId || active?.CLIENT_ID || active?.database?.connectionId || active?.DATABASE?.connectionId;
                    if (sId) return sId;
                }

                // 4. Do usuário logado na sessão (sessionStorage.usuario)
                const uStr = sessionStorage.getItem('usuario');
                if (uStr) {
                    const u = JSON.parse(uStr);
                    const uId = u?.clientId || u?.cliente_id;
                    if (uId) return uId;
                }
            }
        } catch(e) {}

        // 5. De window.ENV global
        if (typeof window !== 'undefined' && window.ENV) {
            const envId = window.ENV.clientId || window.ENV.CLIENT_ID || window.ENV.DATABASE?.connectionId || window.ENV.database?.connectionId;
            if (envId) return envId;
        }

        if (configOrId && typeof configOrId === 'object') {
            const fallbackId = configOrId.clientId || configOrId.CLIENT_ID;
            if (fallbackId) return fallbackId;
        }

        return (typeof configOrId === 'string' && configOrId) ? configOrId : 'cliente01';
    }

    function getBackendBaseUrl() {
        if (typeof window !== 'undefined') {
            if (window.ENV?.API_URL) return window.ENV.API_URL.replace(/\/$/, '');
            if (window.ENV?.BACKEND_URL) return window.ENV.BACKEND_URL.replace(/\/$/, '');
            try {
                const localApi = localStorage.getItem('aion_api_url');
                if (localApi) return localApi.replace(/\/$/, '');
            } catch(e) {}

            if (window.location) {
                const host = window.location.hostname;
                const port = window.location.port;
                if ((host === 'localhost' || host === '127.0.0.1') && port !== '3000' && port !== '') {
                    return 'http://127.0.0.1:3000';
                }
            }
        }
        return '';
    }

    class NeonQueryBuilder {
        constructor(clientId, tableName) {
            this.clientId = resolveClientId(clientId);
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
            const finalClientId = resolveClientId(this.clientId);
            const baseUrl = getBackendBaseUrl();
            const endpoint = `${baseUrl}/api/data/${finalClientId}/${this.tableName}`;
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
                const isGitHubPages = typeof window !== 'undefined' && window.location && window.location.hostname.includes('github.io');
                const msg = isGitHubPages
                    ? `O GitHub Pages é uma hospedagem de páginas estáticas e não executa o servidor Node.js/Neon. Para funcionar na nuvem, publique o backend (Render, Vercel ou Railway) e configure a API_URL.`
                    : `Servidor backend offline. Certifique-se de executar 'npm run dev' no terminal.`;
                return { data: null, error: { message: msg }, count: 0 };
            }
        }

        then(onFulfilled, onRejected) {
            return this.execute().then(onFulfilled, onRejected);
        }
    }

    class NeonClient {
        constructor(clientConfig) {
            this.clientId = resolveClientId(clientConfig);
            this.config = clientConfig;
        }

        from(tableName) {
            return new NeonQueryBuilder(resolveClientId(this.clientId), tableName);
        }

        async rpc(functionName, params = {}) {
            const finalClientId = resolveClientId(this.clientId);
            const baseUrl = getBackendBaseUrl();
            const endpoint = `${baseUrl}/api/rpc/${finalClientId}/${functionName}`;
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
                const isGitHubPages = typeof window !== 'undefined' && window.location && window.location.hostname.includes('github.io');
                const msg = isGitHubPages
                    ? `O GitHub Pages é uma hospedagem de páginas estáticas e não executa o servidor Node.js/Neon. Para funcionar na nuvem, publique o backend (Render, Vercel ou Railway) e configure a API_URL.`
                    : `Servidor backend offline. Certifique-se de executar 'npm run dev' no terminal.`;
                return { data: null, error: { message: msg } };
            }
        }
    }

    window.AionDataLayer = {
        createClient: function(clientConfig) {
            const resolvedId = resolveClientId(clientConfig);
            const hasSupabaseCreds = !!(clientConfig?.supabase?.url && clientConfig?.supabase?.anonKey);
            const provider = clientConfig?.database?.provider || clientConfig?.DATABASE?.provider || (hasSupabaseCreds ? 'supabase' : 'neon');
            
            const normalizedConfig = Object.assign({}, clientConfig, { clientId: resolvedId, CLIENT_ID: resolvedId });

            if (provider === 'neon' || !hasSupabaseCreds) {
                console.log(`[DataLayer] Conectando ao provedor NEON para o cliente: ${resolvedId}`);
                return new NeonClient(normalizedConfig);
            }

            // Provedor: Supabase (apenas quando credenciais existirem)
            console.log(`[DataLayer] Conectando ao provedor SUPABASE para o cliente: ${resolvedId}`);
            if (typeof window.criarClienteSupabaseOriginal === 'function') {
                const client = window.criarClienteSupabaseOriginal(clientConfig?.supabase?.url, clientConfig?.supabase?.anonKey);
                if (client) return client;
            }
            return new NeonClient(normalizedConfig);
        }
    };
})();
