'use strict';

/**
 * patch-enrich.js
 *
 * Atualiza o cache existente (enriched-cache.json) com:
 *  - ID TMDB de cada ator no elenco (cast[].id)
 *  - Top 50 do elenco (em vez de 10)
 *  - Classificação indicativa real do TMDB (certification)
 *
 * Não refaz a busca — usa os tmdb.id já gravados no cache.
 * Muito mais rápido que rodar node index.js do zero.
 *
 * Uso:
 *   node patch-enrich.js
 *
 * Após concluir:
 *   node index.js        → gera SQL a partir do cache atualizado (~30s)
 *   node split-sql.js 4  → divide em partes
 *   node upload-supabase.js → sobe para o Supabase
 */

try { require('dotenv').config(); } catch (_) {}

const fs   = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const CACHE_FILE   = path.join(__dirname, 'output', 'enriched-cache.json');
const BATCH_SIZE   = 20;
const BATCH_DELAY  = 650; // ms entre lotes (respeita rate limit do TMDB)

// ─── TMDB fetch ───────────────────────────────────────────────────────────────

async function tmdbFetch(endpoint, apiKey) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `https://api.themoviedb.org/3/${endpoint}${sep}api_key=${apiKey}&language=pt-BR`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

// ─── Extrai classificação indicativa ─────────────────────────────────────────

function extractCertification(details, mediaType) {
    if (mediaType === 'movie') {
        const results = details.release_dates && details.release_dates.results;
        if (!results) return null;
        for (const country of ['BR', 'US']) {
            const data = results.find(r => r.iso_3166_1 === country);
            if (data) {
                const cert = data.release_dates
                    .find(d => d.certification && d.certification !== '')
                    ?.certification;
                if (cert) return cert;
            }
        }
    } else {
        const results = details.content_ratings && details.content_ratings.results;
        if (!results) return null;
        for (const country of ['BR', 'US']) {
            const data = results.find(r => r.iso_3166_1 === country);
            if (data && data.rating) return data.rating;
        }
    }
    return null;
}

// ─── Patch de um item ─────────────────────────────────────────────────────────

async function patchItem(item, itemType) {
    if (!item.tmdb || !item.tmdb.id) return false; // sem dados TMDB → pula

    const tmdbType = item.tmdb.mediaType === 'tv' ? 'tv' : 'movie';
    const extra    = tmdbType === 'tv' ? 'credits,content_ratings' : 'credits,release_dates';

    const details = await tmdbFetch(
        `${tmdbType}/${item.tmdb.id}?append_to_response=${extra}`,
        TMDB_API_KEY
    );
    if (!details) return false;

    // Top 50 do elenco COM ID TMDB da pessoa
    const cast = ((details.credits && details.credits.cast) || [])
        .slice(0, 50)
        .map(p => ({
            id:          p.id,
            name:        p.name,
            character:   p.character || null,
            profilePath: p.profile_path || null,
            order:       p.order ?? null,
        }));

    item.tmdb.cast          = cast;
    item.tmdb.certification = extractCertification(details, tmdbType);
    return true;
}

// ─── Processa um array em lotes ───────────────────────────────────────────────

async function patchAll(items, label) {
    let processed = 0;
    let patched   = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch   = items.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(item => patchItem(item)));
        processed += batch.length;
        patched   += results.filter(Boolean).length;

        const pct = Math.round((processed / items.length) * 100);
        process.stdout.write(`\r   [${pct}%] ${processed}/${items.length} ${label} — atualizados: ${patched}   `);

        if (i + BATCH_SIZE < items.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
    }
    console.log(`\r   ✅  ${label}: ${patched}/${items.length} itens atualizados.                     `);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    if (!TMDB_API_KEY) {
        console.error('\n❌  TMDB_API_KEY não definida. Adicione ao .env e tente novamente.');
        process.exit(1);
    }

    if (!fs.existsSync(CACHE_FILE)) {
        console.error('\n❌  Cache não encontrado. Execute primeiro: node index.js');
        process.exit(1);
    }

    console.log('\n🔄  SAIMO TV — Patch de Enriquecimento TMDB');
    console.log('    Adicionando IDs de atores e classificação indicativa...\n');

    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));

    const moviesWithTmdb = cache.movies.filter(m => m.tmdb && m.tmdb.id).length;
    const seriesWithTmdb = cache.series.filter(s => s.tmdb && s.tmdb.id).length;
    console.log(`   Filmes com TMDB: ${moviesWithTmdb} / ${cache.movies.length}`);
    console.log(`   Séries com TMDB: ${seriesWithTmdb} / ${cache.series.length}`);
    console.log(`   Total de chamadas TMDB: ~${moviesWithTmdb + seriesWithTmdb}`);
    console.log(`   Tempo estimado: ~${Math.ceil((moviesWithTmdb + seriesWithTmdb) / BATCH_SIZE * BATCH_DELAY / 60000)} min\n`);

    // ── Filmes ──────────────────────────────────────────────────────────────
    console.log('   🎬  Filmes:');
    await patchAll(cache.movies, 'filmes');

    // ── Séries ──────────────────────────────────────────────────────────────
    console.log('\n   📺  Séries:');
    await patchAll(cache.series, 'séries');

    // ── Salva cache atualizado ───────────────────────────────────────────────
    console.log('\n   💾  Salvando cache atualizado...');
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');

    // ── Resumo ───────────────────────────────────────────────────────────────
    const withCert = [
        ...cache.movies.filter(m => m.tmdb && m.tmdb.certification),
        ...cache.series.filter(s => s.tmdb && s.tmdb.certification),
    ].length;
    const withCastId = [
        ...cache.movies.filter(m => m.tmdb && m.tmdb.cast && m.tmdb.cast[0]?.id),
        ...cache.series.filter(s => s.tmdb && s.tmdb.cast && s.tmdb.cast[0]?.id),
    ].length;

    console.log('\n' + '─'.repeat(56));
    console.log('  PATCH CONCLUÍDO');
    console.log('─'.repeat(56));
    console.log(`   Com classificação indicativa: ${withCert}`);
    console.log(`   Com IDs de ator no elenco:   ${withCastId}`);
    console.log('\n   Próximos passos:');
    console.log('     node index.js          → gera SQL (~30s, usa cache)');
    console.log('     node split-sql.js 4    → divide em partes de 4MB');
    console.log('     node upload-supabase.js → sobe para o Supabase\n');
}

main().catch(err => {
    console.error('\n❌  Erro fatal:', err.message);
    process.exit(1);
});
