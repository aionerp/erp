const fs = require('fs');
const path = require('path');

const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const result = [];

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const scripts = [];
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    scripts.push(match[1]);
  }
  const hasAuthCheck = scripts.some(s => s.includes('auth-check'));
  const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
  result.push({
    file,
    size: content.length,
    title: titleMatch ? titleMatch[1].trim() : 'Sem título',
    hasAuthCheck,
    scripts: scripts.filter(s => !s.startsWith('http'))
  });
}

console.log(JSON.stringify(result, null, 2));
