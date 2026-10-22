const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApiRequest } = require('./server-api');

const PORT = process.env.PORT || 3000;
const serveDir = process.argv[2] || '.';


const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.sql': 'text/plain; charset=utf-8'
};

function isPathForbidden(resolvedPath, rootDir) {
    // 1. Deve estar estritamente contido no diretório raiz servido
    if (!resolvedPath.startsWith(rootDir)) {
        return true;
    }

    const relative = path.relative(rootDir, resolvedPath);
    const parts = relative.split(path.sep);

    // 2. Bloquear dotfiles (qualquer arquivo ou pasta que comece com '.')
    for (const part of parts) {
        if (part.startsWith('.')) return true;
    }

    // 3. Bloquear arquivos protegidos do backend e configuração
    const baseName = path.basename(resolvedPath).toLowerCase();
    if (baseName === 'package.json' || baseName === 'package-lock.json') return true;
    if (baseName.startsWith('server') && baseName.endsWith('.js')) return true;

    return false;
}

const server = http.createServer(async (req, res) => {
    // Interceptar requisições de API para o Neon/Data Layer
    if (req.url.startsWith('/api/')) {
        const handled = await handleApiRequest(req, res);
        if (handled) return;
    }

    // Decodificar URL para suportar caracteres especiais e acentos
    let decodedUrl;
    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>400 Requisição Inválida</h1>', 'utf-8');
        return;
    }
    
    // Remover query strings da URL (ex: ?t=123)
    const qIndex = decodedUrl.indexOf('?');
    if (qIndex !== -1) {
        decodedUrl = decodedUrl.substring(0, qIndex);
    }

    const rootDir = path.resolve(__dirname, serveDir);
    const targetFile = decodedUrl === '/' ? '/index.html' : (decodedUrl.startsWith('/') ? decodedUrl : '/' + decodedUrl);
    const filePath = path.resolve(rootDir, '.' + targetFile);

    // Proteção contra Path Traversal, arquivos ocultos e arquivos do backend
    if (isPathForbidden(filePath, rootDir)) {
        res.writeHead(403, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
        });
        res.end('<h1>403 Acesso Proibido</h1>', 'utf-8');
        return;
    }

    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY'
                });
                res.end('<h1>404 Página Não Encontrada</h1>', 'utf-8');
            } else {
                res.writeHead(500, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'X-Content-Type-Options': 'nosniff'
                });
                res.end(`Erro no Servidor: ${err.code}`);
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'Referrer-Policy': 'strict-origin-when-cross-origin'
            });
            res.end(content, 'utf-8');
        }
    });
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
        console.log(`Servindo diretório: "${serveDir}"`);
    });
}

module.exports = {
    server,
    isPathForbidden
};
