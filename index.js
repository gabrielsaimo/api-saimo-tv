'use strict';

// Carrega .env se existir (requer `npm install` para o dotenv)
try { require('dotenv').config(); } catch (_) { /* sem dotenv — usa process.env */ }

const fs   = require('fs');
const path = require('path');

const { M3U_URLS }               = require('./src/config');
const { fetchAllM3U, categorizeM3UItems } = require('./src/fetch-m3u');
const { enrichItems }            = require('./src/enrich-tmdb');
const { generateSchema, generateData }    = require('./src/generate-sql');

// ─── Config via env ───────────────────────────────────────────────────────────

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const ITEM_LIMIT   = parseInt(process.env.ITEM_LIMIT || '0') || 0;
const SKIP_ENRICH  = process.env.SKIP_ENRICH === 'true';

const OUTPUT_DIR   = path.join(__dirname, 'output');
const SCHEMA_FILE  = path.join(OUTPUT_DIR, '01_schema.sql');
const DATA_FILE    = path.join(OUTPUT_DIR, '02_data.sql');
const CACHE_FILE   = path.join(OUTPUT_DIR, 'enriched-cache.json');

// ─── Utilitários ──────────────────────────────────────────────────────────────

function banner(text) {
    console.log(`\n${'─'.repeat(56)}`);
    console.log(`  ${text}`);
    console.log('─'.repeat(56));
}

function fmtBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n🎬  SAIMO TV — Gerador de SQL para Supabase');
    console.log('    https://sfumaypqhxzjssarmyrn.supabase.co\n');

    if (ITEM_LIMIT) console.log(`⚠️  Modo teste: limitado a ${ITEM_LIMIT} itens do M3U.\n`);

    // Garante pasta de saída
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // ── PASSO 1: Buscar M3U ──────────────────────────────────────────────────
    banner('PASSO 1 — Buscando M3U');

    const m3uItems = await fetchAllM3U(M3U_URLS);

    if (m3uItems.length === 0) {
        console.error('\n❌  Nenhum item VOD encontrado nas URLs M3U. Verifique os links em src/config.js.');
        process.exit(1);
    }

    console.log(`\n✅  ${m3uItems.length} itens VOD encontrados.`);

    // ── PASSO 2: Categorizar ─────────────────────────────────────────────────
    banner('PASSO 2 — Categorizando itens');

    const { movies, series } = categorizeM3UItems(m3uItems, ITEM_LIMIT || undefined);

    const totalEpisodes = series.reduce((acc, s) =>
        acc + Object.values(s.episodes || {}).reduce((a, e) => a + e.length, 0), 0);

    console.log(`   📽️  Filmes:     ${movies.length}`);
    console.log(`   📺  Séries:     ${series.length}`);
    console.log(`   🎞️  Episódios:  ${totalEpisodes}`);

    // ── PASSO 3: Enriquecimento TMDB ─────────────────────────────────────────
    banner('PASSO 3 — Enriquecimento TMDB');

    let enrichedMovies = movies;
    let enrichedSeries = series;

    // Usa cache se existir e SKIP_ENRICH não estiver ativo
    const USE_CACHE = !SKIP_ENRICH && TMDB_API_KEY && fs.existsSync(CACHE_FILE);

    if (USE_CACHE) {
        console.log('   ⚡  Carregando dados TMDB do cache (enriched-cache.json)...');
        const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        // Mescla dados TMDB do cache com os itens atuais (preserva URLs novas)
        const movieTmdb  = new Map(cache.movies.map(m => [m.id, m.tmdb]));
        const seriesTmdb = new Map(cache.series.map(s => [s.id, s.tmdb]));
        enrichedMovies = movies.map(m  => ({ ...m,  tmdb: movieTmdb.get(m.id)   || m.tmdb }));
        enrichedSeries = series.map(s  => ({ ...s,  tmdb: seriesTmdb.get(s.id)  || s.tmdb }));
        const withTmdb = enrichedMovies.filter(m => m.tmdb).length + enrichedSeries.filter(s => s.tmdb).length;
        console.log(`   ✅  Cache aplicado: ${withTmdb} itens com dados TMDB.`);
    } else if (SKIP_ENRICH || !TMDB_API_KEY) {
        if (!TMDB_API_KEY) {
            console.log('   ⚠️  TMDB_API_KEY não definida — enriquecimento pulado.');
            console.log('   💡 Copie .env.example → .env e adicione sua chave do TMDB.');
        } else {
            console.log('   ⏩  Enriquecimento pulado (SKIP_ENRICH=true).');
        }
    } else {
        console.log(`   🔑  API Key: ${TMDB_API_KEY.slice(0, 6)}${'*'.repeat(10)}\n`);

        console.log('   🎬  Filmes:');
        enrichedMovies = await enrichItems(movies, 'movie', TMDB_API_KEY);

        console.log('\n   📺  Séries:');
        enrichedSeries = await enrichItems(series, 'series', TMDB_API_KEY);

        const withTmdb =
            enrichedMovies.filter(m => m.tmdb).length +
            enrichedSeries.filter(s => s.tmdb).length;
        const total = enrichedMovies.length + enrichedSeries.length;
        const pct   = total ? Math.round((withTmdb / total) * 100) : 0;

        console.log(`\n   ✅  ${withTmdb}/${total} itens enriquecidos com TMDB (${pct}%).`);

        // Salva cache para reutilização futura
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ movies: enrichedMovies, series: enrichedSeries }), 'utf-8');
        console.log(`   💾  Cache salvo em enriched-cache.json.`);
    }

    // ── PASSO 4: Gerar SQL ───────────────────────────────────────────────────
    banner('PASSO 4 — Gerando SQL');

    const schemaSQL = generateSchema();
    const dataSQL   = generateData(enrichedMovies, enrichedSeries);

    fs.writeFileSync(SCHEMA_FILE, schemaSQL, 'utf-8');
    fs.writeFileSync(DATA_FILE,   dataSQL,   'utf-8');

    const schemaSize = fs.statSync(SCHEMA_FILE).size;
    const dataSize   = fs.statSync(DATA_FILE).size;

    console.log(`   📄  01_schema.sql  — ${fmtBytes(schemaSize)}`);
    console.log(`   📄  02_data.sql    — ${fmtBytes(dataSize)}`);

    // ── Resumo final ─────────────────────────────────────────────────────────
    banner('CONCLUÍDO');

    console.log('   Itens gerados:');
    console.log(`     Filmes:     ${enrichedMovies.length}`);
    console.log(`     Séries:     ${enrichedSeries.length}`);
    console.log(`     Episódios:  ${totalEpisodes}`);

    if (dataSize > 5 * 1024 * 1024) {
        console.log('\n   ⚠️  O arquivo 02_data.sql é grande (> 5 MB).');
        console.log('      Se o Supabase SQL Editor recusar, use o CLI:');
        console.log('      psql "postgresql://postgres:[senha]@db.sfumaypqhxzjssarmyrn.supabase.co:5432/postgres" -f output/02_data.sql');
    }

    console.log('\n   Suba no Supabase nessa ordem:');
    console.log('     1. output/01_schema.sql');
    console.log('     2. output/02_data.sql\n');
}

main().catch(err => {
    console.error('\n❌  Erro fatal:', err.message);
    process.exit(1);
});
