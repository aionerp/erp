const fs = require('fs');
const path = require('path');

// Helper to recursively copy directories
function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    fs.readdirSync(from).forEach(element => {
        const stat = fs.lstatSync(path.join(from, element));
        if (stat.isFile()) {
            fs.copyFileSync(path.join(from, element), path.join(to, element));
        } else if (stat.isDirectory()) {
            // Exclude directories we don't want
            if (['node_modules', '.git', '.github', 'dist', 'clients', 'scratch', 'scripts'].includes(element)) {
                return;
            }
            copyFolderSync(path.join(from, element), path.join(to, element));
        }
    });
}

// Helper to clear folder contents
function cleanDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
    fs.mkdirSync(dirPath, { recursive: true });
}

// 1. Load env variables from local .env if exists
const env = {};
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            env[key] = val;
        }
    });
}

// 2. Identify target client
const client = process.env.CLIENTE || env.CLIENTE || env.VITE_CLIENT_ID || env.CLIENT_ID || process.argv[2];

if (!client) {
    console.error('ERRO: Defina a variável de ambiente CLIENTE antes de rodar o build.');
    console.error('Exemplo: CLIENTE=cliente01 node build.js');
    process.exit(1);
}

console.log(`Iniciando build para o cliente: ${client}...`);

// 3. Load client configuration
const clientConfigPath = path.join(__dirname, 'clients', client, 'config.json');
if (!fs.existsSync(clientConfigPath)) {
    console.error(`ERRO: Configuração do cliente "${client}" não encontrada em: ${clientConfigPath}`);
    process.exit(1);
}

let config;
try {
    config = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
} catch (e) {
    console.error(`ERRO: Falha ao ler o arquivo config.json para o cliente "${client}":`, e.message);
    process.exit(1);
}

// 4. Set up dist directory
const distPath = path.join(__dirname, 'dist');
cleanDir(distPath);

// 5. Copy core files
fs.readdirSync(__dirname).forEach(element => {
    const srcPath = path.join(__dirname, element);
    const destPath = path.join(distPath, element);
    const stat = fs.lstatSync(srcPath);

    if (stat.isFile()) {
        // Exclude specific files from root
        const excludes = ['.env', '.env.example', 'env.js', 'env.example.js', 'build.js', 'package.json', 'package-lock.json', '.gitattributes', '.gitattributes copy', '.gitignore', 'task.md', 'guia_limpeza_banco.md', 'manual_backup.md'];
        if (excludes.includes(element)) {
            return;
        }
        fs.copyFileSync(srcPath, destPath);
    } else if (stat.isDirectory()) {
        const excludes = ['node_modules', '.git', '.github', 'dist', 'clients', 'scratch', 'scripts'];
        if (excludes.includes(element)) {
            return;
        }
        copyFolderSync(srcPath, destPath);
    }
});

// 6. Generate env.js content
const logoUrl = (config.branding?.logo || fs.existsSync(path.join(__dirname, 'clients', client, 'logo.png'))) ? './assets/img/logo-cliente.png' : null;
const envJsContent = `// Arquivo gerado automaticamente pelo script de build - NÃO MODIFIQUE DIRETAMENTE
window.ENV = {
    CLIENT_ID: ${JSON.stringify(config.clientId)},
    COMPANY_NAME: ${JSON.stringify(config.companyName)},
    COMPANY_SUBTITLE: ${JSON.stringify(config.companySubtitle || "by AionLabs")},
    CNPJ: ${JSON.stringify(config.cnpj)},
    SUPABASE_URL: ${JSON.stringify(config.supabase?.url)},
    SUPABASE_ANON_KEY: ${JSON.stringify(config.supabase?.anonKey)},
    BRANDING: {
        logoUrl: ${JSON.stringify(logoUrl)},
        primaryColor: ${JSON.stringify(config.branding?.primaryColor)},
        primaryDarkColor: ${JSON.stringify(config.branding?.primaryDarkColor)},
        primaryLightColor: ${JSON.stringify(config.branding?.primaryLightColor)}
    },
    FEATURES: ${JSON.stringify(config.features || {})}
};
`;

fs.writeFileSync(path.join(distPath, 'env.js'), envJsContent, 'utf8');
console.log(`Arquivo env.js gerado com sucesso em: ${path.join(distPath, 'env.js')}`);

// 7. Copy client custom logo if exists
const clientLogoPath = path.join(__dirname, 'clients', client, 'logo.png');
if (fs.existsSync(clientLogoPath)) {
    const destLogoDir = path.join(distPath, 'assets', 'img');
    if (!fs.existsSync(destLogoDir)) {
        fs.mkdirSync(destLogoDir, { recursive: true });
    }
    fs.copyFileSync(clientLogoPath, path.join(destLogoDir, 'logo-cliente.png'));
    console.log(`Logotipo customizado do cliente copiado.`);
}

console.log(`Build para o cliente "${client}" concluído com sucesso em /dist!`);
