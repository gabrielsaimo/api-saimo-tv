'use strict';

/**
 * Divide o arquivo 02_data.sql em chunks menores para o Supabase SQL Editor.
 * Uso: node split-sql.js [tamanho_max_mb]
 *
 * Exemplo: node split-sql.js 4   → partes de até 4 MB
 */

const fs   = require('fs');
const path = require('path');

const MAX_MB   = parseFloat(process.argv[2] || '4');
const MAX_SIZE = MAX_MB * 1024 * 1024; // bytes

const INPUT  = path.join(__dirname, 'output', '02_data.sql');
const OUTDIR = path.join(__dirname, 'output', 'parts');

if (!fs.existsSync(INPUT)) {
    console.error('❌  output/02_data.sql não encontrado. Rode index.js primeiro.');
    process.exit(1);
}

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

// Remove partes antigas
for (const f of fs.readdirSync(OUTDIR)) {
    if (f.startsWith('data_') && f.endsWith('.sql')) {
        fs.unlinkSync(path.join(OUTDIR, f));
    }
}

const content = fs.readFileSync(INPUT, 'utf-8');

// Separa em blocos por instrução SQL terminada com ';'
// Considera cada bloco INSERT...ON CONFLICT...;  como uma unidade
const blocks = content.split(/(?<=;)\n/).filter(b => b.trim());

let partNum    = 1;
let partBuffer = '';
let partCount  = 0;

function writePartIfNeeded(force = false) {
    if (!partBuffer.trim()) return;
    if (force || Buffer.byteLength(partBuffer, 'utf-8') >= MAX_SIZE) {
        const filename = `data_${String(partNum).padStart(3, '0')}.sql`;
        fs.writeFileSync(path.join(OUTDIR, filename), partBuffer, 'utf-8');
        const size = Buffer.byteLength(partBuffer, 'utf-8');
        console.log(`   ✅  ${filename}  —  ${(size / 1024 / 1024).toFixed(2)} MB`);
        partNum++;
        partCount++;
        partBuffer = '';
    }
}

console.log(`\n✂️  Dividindo 02_data.sql em partes de até ${MAX_MB} MB...\n`);

for (const block of blocks) {
    const blockSize = Buffer.byteLength(block + '\n', 'utf-8');

    // Se um único bloco é maior que MAX_SIZE, adiciona mesmo assim (evita loop infinito)
    if (partBuffer && Buffer.byteLength(partBuffer + block, 'utf-8') > MAX_SIZE) {
        writePartIfNeeded(true);
    }

    partBuffer += block + '\n';
}

// Escreve o último chunk
writePartIfNeeded(true);

console.log(`\n✅  ${partCount} arquivos gerados em output/parts/`);
console.log('   Suba no Supabase SQL Editor na ordem numérica.\n');
