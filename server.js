const http = require('http');
const fs = require('fs');
const path = require('path');

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
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Decodificar URL para suportar caracteres especiais e acentos
    let decodedUrl = decodeURIComponent(req.url);
    
    // Remover query strings da URL (ex: ?t=123)
    const qIndex = decodedUrl.indexOf('?');
    if (qIndex !== -1) {
        decodedUrl = decodedUrl.substring(0, qIndex);
    }

    let filePath = path.join(__dirname, serveDir, decodedUrl === '/' ? 'index.html' : decodedUrl);
    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 Página Não Encontrada</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Erro no Servidor: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
    console.log(`Servindo diretório: "${serveDir}"`);
});
