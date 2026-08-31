const fs = require('fs');

const config = JSON.parse(fs.readFileSync('clients/cliente03/config.json', 'utf8'));

async function test() {
    const headers = {
        'apikey': config.supabase.anonKey,
        'Authorization': `Bearer ${config.supabase.anonKey}`,
        'Content-Type': 'application/json'
    };

    console.log('Testing RPC autenticar_usuario on:', config.supabase.url);
    const rpcRes = await fetch(`${config.supabase.url}/rest/v1/rpc/autenticar_usuario`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            p_email: 'adm.originaleltronico',
            p_senha: 'admin' // testing
        })
    });
    const rpcJson = await rpcRes.json();
    console.log('Status:', rpcRes.status, 'Response:', rpcJson);
}

test();
