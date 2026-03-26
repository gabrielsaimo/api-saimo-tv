'use strict';

const { normalizeName, cleanTitle } = require('./normalize');
const {
    TMDB_BASE_URL,
    ENRICH_BATCH_SIZE,
    ENRICH_BATCH_DELAY,
    TMDB_MIN_SCORE,
} = require('./config');

// Artigos PT/EN que podem aparecer no início do título no M3U mas não no TMDB
const LEADING_ARTICLES = /^(o|a|os|as|um|uma|the|an?)\s+/i;

// ─── Helpers de título ────────────────────────────────────────────────────────

/**
 * Gera todas as variantes de busca para um nome de item.
 * Mesma estratégia do fix-enriched-data.cjs:
 *   1. Título limpo base
 *   2. Sem marcadores de idioma residuais
 *   3. Sem artigo inicial (O, A, The, Um, etc.)
 *   4. Sem subtítulo após ":"  ou " - "
 *   5. Versão ASCII (remove acentos)
 *   6. Sem número romano no final
 */
function buildSearchVariants(name) {
    const cleaned = cleanTitle(name);
    const add = (s) => s && s.length > 1 ? variants.push(s) : undefined;
    const variants = [cleaned];

    // Sem marcadores de idioma ainda presentes
    const withoutLang = cleaned
        .replace(/\s*[\(\[](leg|dub|dublado|legendado|dual|national)[\)\]]/gi, '')
        .trim();
    add(withoutLang !== cleaned ? withoutLang : null);

    // Sem artigo inicial
    const withoutArticle = cleaned.replace(LEADING_ARTICLES, '').trim();
    add(withoutArticle !== cleaned ? withoutArticle : null);

    // Sem subtítulo (tudo após ":" ou " - ")
    const withoutSubtitle = cleaned.split(/\s*[:\-]\s+/)[0].trim();
    add(withoutSubtitle !== cleaned && withoutSubtitle.length > 2 ? withoutSubtitle : null);

    // Versão ASCII (remove acentos — útil para títulos misturados)
    const ascii = cleaned
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    add(ascii !== cleaned ? ascii : null);

    // Sem número romano no final
    const withoutRoman = cleaned.replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim();
    add(withoutRoman !== cleaned ? withoutRoman : null);

    return [...new Set(variants)].filter(Boolean);
}

// ─── Scoring de match ─────────────────────────────────────────────────────────

/**
 * Extrai o poster path de uma logo URL do TMDB.
 * Ex: "https://image.tmdb.org/t/p/w780/o2WoeYJv9ISS9bw0kKD2cvmg9xN.jpg"
 *     → "/o2WoeYJv9ISS9bw0kKD2cvmg9xN.jpg"
 * Retorna null se a logo não for do TMDB.
 */
function extractTmdbPosterPath(logoUrl) {
    if (!logoUrl || !logoUrl.includes('image.tmdb.org')) return null;
    const parts = logoUrl.split('/');
    const file  = parts[parts.length - 1];
    return file ? `/${file}` : null;
}

/**
 * Calcula score de similaridade entre item local e resultado do TMDB.
 * Considera: correspondência de título, popularidade, ano e poster path.
 * @param {string}      localName
 * @param {object}      tmdbResult
 * @param {string}      mediaType
 * @param {string|null} [posterPathHint]  - path extraído da logo M3U (quando for img TMDB)
 */
function scoreResult(localName, tmdbResult, mediaType, posterPathHint = null) {
    const localNorm = normalizeName(cleanTitle(localName));

    const tmdbTitle    = mediaType === 'tv' ? tmdbResult.name         : tmdbResult.title;
    const tmdbOriginal = mediaType === 'tv' ? tmdbResult.original_name : tmdbResult.original_title;
    const tmdbNorm     = normalizeName(tmdbTitle    || '');
    const origNorm     = normalizeName(tmdbOriginal || '');

    let score = 0;

    // Correspondência de título
    if (localNorm === tmdbNorm || localNorm === origNorm) {
        score += 100;
    } else if (tmdbNorm.startsWith(localNorm) || localNorm.startsWith(tmdbNorm)) {
        score += 70;
    } else if (origNorm.startsWith(localNorm) || localNorm.startsWith(origNorm)) {
        score += 65;
    } else if (tmdbNorm.includes(localNorm) || localNorm.includes(tmdbNorm)) {
        score += 50;
    } else if (origNorm.includes(localNorm) || localNorm.includes(origNorm)) {
        score += 45;
    }

    // Bônus por popularidade
    if ((tmdbResult.vote_count || 0) > 1000) score += 15;
    else if ((tmdbResult.vote_count || 0) > 100) score += 8;

    // Bônus/penalidade por ano de lançamento
    const yearMatch = localName.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) {
        const localYear = parseInt(yearMatch[1]);
        const relDate   = mediaType === 'tv' ? tmdbResult.first_air_date : tmdbResult.release_date;
        const tmdbYear  = relDate ? parseInt(relDate.slice(0, 4)) : null;
        if (tmdbYear) {
            if (Math.abs(localYear - tmdbYear) === 0) score += 25;
            else if (Math.abs(localYear - tmdbYear) === 1) score += 10;
            else if (Math.abs(localYear - tmdbYear) > 2) score -= 25;
        }
    }

    // Bônus máximo: logo M3U já é imagem do TMDB e poster_path bate exatamente
    // (fix-enriched-data.cjs usa esse sinal pois muitos M3U referenciam imagens do TMDB)
    if (posterPathHint && tmdbResult.poster_path === posterPathHint) {
        score += 200; // certeza quase absoluta
    }

    return score;
}

// ─── Chamadas à API ───────────────────────────────────────────────────────────

/**
 * Fetch genérico para o TMDB.
 * @param {string} pathAndQuery  - ex: "search/movie?query=Matrix"
 * @param {string} apiKey
 * @param {string} [lang]        - idioma (padrão: pt-BR)
 */
async function tmdbFetch(pathAndQuery, apiKey, lang = 'pt-BR') {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const url = `${TMDB_BASE_URL}/${pathAndQuery}${sep}api_key=${apiKey}&language=${lang}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

/**
 * Busca no TMDB por título.
 * Tenta pt-BR primeiro; se não retornar resultados, tenta en-US (fallback).
 */
async function searchTMDB(title, mediaType, apiKey) {
    const endpoint = mediaType === 'tv' ? 'search/tv' : 'search/movie';
    const query    = `${endpoint}?query=${encodeURIComponent(title)}`;

    const ptData = await tmdbFetch(query, apiKey, 'pt-BR');
    if (ptData?.results?.length) return ptData.results;

    // Fallback inglês — igual ao fix-enriched-data.cjs
    const enData = await tmdbFetch(query, apiKey, 'en-US');
    return enData?.results || [];
}

/** Busca detalhes completos (créditos + classificação indicativa). */
async function getTMDBDetails(id, mediaType, apiKey) {
    const endpoint = mediaType === 'tv' ? `tv/${id}` : `movie/${id}`;
    const extra    = mediaType === 'tv' ? 'credits,content_ratings' : 'credits,release_dates';
    return tmdbFetch(`${endpoint}?append_to_response=${extra}`, apiKey, 'pt-BR');
}

/**
 * Extrai a classificação indicativa a partir dos dados TMDB.
 * Tenta Brasil (BR) primeiro, depois EUA (US) como fallback.
 */
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

// ─── Busca com troca de tipo ──────────────────────────────────────────────────

/**
 * Tenta achar o melhor resultado no TMDB para um título, testando:
 *   1. Tipo principal (ex: movie)
 *   2. Tipo alternativo (ex: tv) — fallback igual ao fix-enriched-data.cjs
 * Retorna { result, score, foundMediaType } ou null.
 */
async function findBestTMDBMatch(name, primaryMediaType, apiKey, posterPathHint = null) {
    const alternativeType = primaryMediaType === 'movie' ? 'tv' : 'movie';
    const variants        = buildSearchVariants(name);

    let bestResult    = null;
    let bestScore     = 0;
    let foundType     = primaryMediaType;

    // ── Tentativa 1: tipo principal, todas as variantes ──
    for (const variant of variants) {
        const results = await searchTMDB(variant, primaryMediaType, apiKey);
        for (const r of results.slice(0, 5)) {
            const s = scoreResult(name, r, primaryMediaType, posterPathHint);
            if (s > bestScore) { bestScore = s; bestResult = r; }
        }
        if (bestScore >= 90) break;
    }

    // ── Tentativa 2: tipo alternativo se score ainda baixo ──
    if (bestScore < TMDB_MIN_SCORE) {
        for (const variant of variants) {
            const results = await searchTMDB(variant, alternativeType, apiKey);
            for (const r of results.slice(0, 5)) {
                const s = scoreResult(name, r, alternativeType, posterPathHint);
                if (s > bestScore) { bestScore = s; bestResult = r; foundType = alternativeType; }
            }
            if (bestScore >= 90) break;
        }
    }

    if (!bestResult || bestScore < TMDB_MIN_SCORE) return null;
    return { result: bestResult, score: bestScore, foundMediaType: foundType };
}

// ─── Enriquecimento de um item ────────────────────────────────────────────────

async function enrichOneItem(item, type, apiKey) {
    const primaryType    = type === 'series' ? 'tv' : 'movie';
    const posterPathHint = extractTmdbPosterPath(item.logo);

    const match = await findBestTMDBMatch(item.name, primaryType, apiKey, posterPathHint);
    if (!match) return item;

    const { result, score, foundMediaType } = match;

    const details = await getTMDBDetails(result.id, foundMediaType, apiKey);
    if (!details) return item;

    const title         = foundMediaType === 'tv' ? details.name          : details.title;
    const originalTitle = foundMediaType === 'tv' ? details.original_name  : details.original_title;
    const releaseDate   = foundMediaType === 'tv' ? details.first_air_date  : details.release_date;

    // Top 50 do elenco principal (com ID TMDB da pessoa)
    const cast = ((details.credits && details.credits.cast) || [])
        .slice(0, 50)
        .map(p => ({
            id:          p.id,
            name:        p.name,
            character:   p.character || null,
            profilePath: p.profile_path || null,
            order:       p.order ?? null,
        }));

    // Diretor (filmes) ou criadores (séries)
    const director = foundMediaType === 'movie'
        ? ((details.credits && details.credits.crew) || [])
            .filter(c => c.job === 'Director')
            .map(c => c.name)
        : (details.created_by || []).map(c => c.name);

    item.tmdb = {
        id:            details.id,
        title:         title         || null,
        originalTitle: originalTitle || null,
        overview:      details.overview   || null,
        posterPath:    details.poster_path   || null,
        backdropPath:  details.backdrop_path || null,
        releaseDate:   releaseDate    || null,
        voteAverage:   details.vote_average  ?? null,
        voteCount:     details.vote_count    ?? null,
        genres:        (details.genres || []).map(g => g.name),
        cast:          cast,
        director:      director,
        certification: extractCertification(details, foundMediaType),
        mediaType:     foundMediaType,
        tmdbScore:     score,
    };

    return item;
}

// ─── Enriquecimento em lote ───────────────────────────────────────────────────

/**
 * Enriquece um array de filmes ou séries em lotes paralelos, respeitando rate limit.
 * Pula conteúdo adulto (TMDB não cobre de forma confiável).
 *
 * @param {Array}  items
 * @param {'movie'|'series'} type
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
async function enrichItems(items, type, apiKey) {
    const label = type === 'series' ? 'séries' : 'filmes';

    const toEnrich = items.filter(i => !i.isAdult);
    const adults   = items.filter(i => i.isAdult);

    if (toEnrich.length === 0) return items;

    console.log(`   Enriquecendo ${toEnrich.length} ${label} em lotes de ${ENRICH_BATCH_SIZE}...`);

    const enriched = [];
    let processed  = 0;
    let tmdbFound  = 0;

    for (let i = 0; i < toEnrich.length; i += ENRICH_BATCH_SIZE) {
        const batch   = toEnrich.slice(i, i + ENRICH_BATCH_SIZE);
        const results = await Promise.all(batch.map(item => enrichOneItem(item, type, apiKey)));

        for (const r of results) enriched.push(r);
        processed += batch.length;
        tmdbFound += results.filter(r => r.tmdb).length;

        const pct = Math.round((processed / toEnrich.length) * 100);
        process.stdout.write(`\r   [${pct}%] ${processed}/${toEnrich.length} — TMDB: ${tmdbFound}   `);

        if (i + ENRICH_BATCH_SIZE < toEnrich.length) {
            await new Promise(r => setTimeout(r, ENRICH_BATCH_DELAY));
        }
    }

    console.log(`\r   Concluído: ${tmdbFound}/${toEnrich.length} ${label} enriquecidos.          `);

    return [...enriched, ...adults];
}

module.exports = { enrichItems };
