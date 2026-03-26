'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_REF = 'sfumaypqhxzjssarmyrn';
const API_URL     = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

// Decode access token from keychain base64
const ACCESS_TOKEN = Buffer.from(
    'c2JwXzFiMmYwNDU2OTdjNzY3ZWI0ODNmMTk2ZTM4ZmMyNDMzODFmOTY2MTY=',
    'base64'
).toString('utf8');

async function runSQL(sql, retries = 5) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(API_URL, {
                method:  'POST',
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type':  'application/json',
                },
                body: JSON.stringify({ query: sql }),
                signal: AbortSignal.timeout(120_000),
            });
            if (res.status === 503 || res.status === 429 || res.status === 502) {
                const wait = attempt * 3000;
                process.stdout.write(`\n   ⏳  HTTP ${res.status}, tentativa ${attempt}/${retries}, aguardando ${wait/1000}s...`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
            }
            return res.json();
        } catch (err) {
            if (attempt === retries) throw err;
            const wait = attempt * 2000;
            process.stdout.write(`\n   ⏳  Erro rede (${err.message.slice(0, 50)}), tentativa ${attempt}/${retries}, aguardando ${wait/1000}s...`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
}

/**
 * Extract all INSERT blocks from a SQL data file.
 * Finds each INSERT ... ON CONFLICT ...; block regardless of surrounding comments.
 */
function splitInsertBlocks(content) {
    const blocks = [];
    // Match each INSERT...ON CONFLICT...SET...;  block
    const re = /INSERT\s+INTO\s+public\.\w+[\s\S]+?ON CONFLICT[\s\S]+?;/gi;
    let match;
    while ((match = re.exec(content)) !== null) {
        const block = match[0].trim();
        if (block) blocks.push(block);
    }
    return blocks;
}

async function uploadFile(filePath, label, isSchema = false) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sizeMB  = (Buffer.byteLength(content, 'utf-8') / 1024 / 1024).toFixed(2);

    if (isSchema) {
        // Send entire schema as one request
        console.log(`\n📤  ${label}  (${sizeMB} MB)`);
        process.stdout.write(`   enviando...`);
        try {
            await runSQL(content);
        } catch (err) {
            console.error(`\n   ❌  Erro: ${err.message}`);
            throw err;
        }
        console.log(`\r   ✅  ${label} concluído.           `);
        return;
    }

    // Split data files by INSERT blocks
    const blocks = splitInsertBlocks(content);
    console.log(`\n📤  ${label}  (${sizeMB} MB, ${blocks.length} blocos INSERT)`);

    for (let i = 0; i < blocks.length; i++) {
        process.stdout.write(`\r   [${i + 1}/${blocks.length}] enviando...   `);
        try {
            await runSQL(blocks[i]);
        } catch (err) {
            console.error(`\n   ❌  Erro no bloco ${i + 1}: ${err.message}`);
            throw err;
        }
    }
    console.log(`\r   ✅  ${label} concluído.                        `);
}

async function main() {
    const OUTPUT = path.join(__dirname, 'output');
    const PARTS  = path.join(OUTPUT, 'parts');

    console.log('🚀  Iniciando upload para Supabase...');
    console.log(`    Projeto: ${PROJECT_REF}\n`);

    // Resume from a specific file: node upload-supabase.js data_008.sql
    const resumeFrom = process.argv[2] || null;

    if (!resumeFrom) {
        // 1. Schema (sent as whole file)
        await uploadFile(path.join(OUTPUT, '01_schema.sql'), '01_schema.sql', true);
    } else {
        console.log(`⏭️   Retomando a partir de: ${resumeFrom} (schema ignorado)\n`);
    }

    // 2. Data parts in order (split by INSERT blocks)
    const parts = fs.readdirSync(PARTS)
        .filter(f => f.startsWith('data_') && f.endsWith('.sql'))
        .sort();

    const startIdx = resumeFrom ? parts.indexOf(resumeFrom) : 0;
    if (resumeFrom && startIdx === -1) {
        throw new Error(`Arquivo não encontrado em parts/: ${resumeFrom}`);
    }

    const pending = parts.slice(startIdx);
    console.log(`\n📦  ${pending.length} partes de dados para enviar...`);

    for (const part of pending) {
        await uploadFile(path.join(PARTS, part), part, false);
    }

    console.log('\n🎉  Upload completo! Todos os dados estão no Supabase.\n');
}

main().catch(err => {
    console.error('\n❌  Falha fatal:', err.message);
    process.exit(1);
});
