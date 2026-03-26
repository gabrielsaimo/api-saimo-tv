'use strict';

const { normalizeName, generateId } = require('./normalize');
const {
    CATEGORY_MAP,
    PRIORITY_TV_EXCLUDES,
    FALLBACK_TV_EXCLUDES,
    ADULT_KEYWORDS,
} = require('./config');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Aceita apenas arquivos de vídeo (VOD), rejeita streams ao vivo sem extensão. */
function isMediaFile(url) {
    const lower = url.toLowerCase().split('?')[0];
    return (
        lower.endsWith('.mp4') ||
        lower.endsWith('.mkv') ||
        lower.endsWith('.avi') ||
        lower.endsWith('.m4v')
    );
}

/** Mapeia o grupo M3U para uma categoria de banco. Retorna null se for TV ao vivo. */
function mapGroupToCategory(group) {
    const norm = normalizeName(group);

    // 1. Excluir TV ao vivo com nomes conflitantes com o mapa
    for (const tv of PRIORITY_TV_EXCLUDES) {
        if (norm.includes(tv)) return null;
    }

    // 2. Verificar mapa de categorias VOD
    for (const key of Object.keys(CATEGORY_MAP)) {
        if (norm.includes(normalizeName(key))) return CATEGORY_MAP[key];
    }

    // 3. Excluir TV ao vivo que não casou com nenhuma categoria
    for (const tv of FALLBACK_TV_EXCLUDES) {
        if (norm.includes(tv)) return null;
    }

    // 4. Gerar slug automático para grupos desconhecidos
    const slug = norm.trim().replace(/\s+/g, '-');
    return slug || null;
}

/** Verifica se um grupo/categoria é de conteúdo adulto. */
function isAdultGroup(group) {
    const norm = normalizeName(group);
    return ADULT_KEYWORDS.some(kw => norm.includes(normalizeName(kw)));
}

// ─── Parser de Episódios ──────────────────────────────────────────────────────

/**
 * Tenta identificar se um nome é um episódio de série.
 * Retorna { seriesName, season, episode } ou null se for filme.
 */
function parseEpisodeName(name, group) {
    // 1. Padrão: Nome S01 E01 | S01E01 | S01 Ep 01 | S01 Epis. 01
    let m = name.match(/(.+?)\s+S(\d{1,2})\s*(?:E|Ep|Epis[óo]dio\.?)\s*(\d{1,3})$/i);
    if (m) return { seriesName: m[1].trim(), season: m[2], episode: m[3] };

    // 2. Padrão com nome repetido/pontos: Nome S01 Nome.S01E21
    m = name.match(/(.+?)\s+S(\d{1,2}).*?(?:E|Ep)(\d{1,3})/i);
    if (m) return { seriesName: m[1].trim(), season: m[2], episode: m[3] };

    // 3. Padrão número solto: Nome S02 20
    m = name.match(/(.+?)\s+S(\d{1,2})\s+(\d{1,3})$/i);
    if (m) return { seriesName: m[1].trim(), season: m[2], episode: m[3] };

    // 4. Formato português: Nome Temporada 1 Episódio 2
    m = name.match(/(.+?)\s+Temporada\s+(\d+)\s+Epis[óo]dio\s+(\d+)$/i);
    if (m) return { seriesName: m[1].trim(), season: m[2], episode: m[3] };

    // 5. Formato curto PT: T1 E2 | T1 Ep2
    m = name.match(/(.+?)\s+T(\d{1,2})\s*(?:E|Ep)\s*(\d{1,3})$/i);
    if (m) return { seriesName: m[1].trim(), season: m[2], episode: m[3] };

    // 6. Genérico: Nome - 01x02
    m = name.match(/(.+?)\s*[-:]?\s*(\d{1,2})x(\d{1,3})$/i);
    if (m) return { seriesName: m[1].trim(), season: m[2], episode: m[3] };

    // 7. Heurística por grupo (série/anime/dorama): Nome 01
    if (group) {
        const gNorm = group.toLowerCase();
        if (
            gNorm.includes('serie') || gNorm.includes('série') ||
            gNorm.includes('anime') || gNorm.includes('dorama') ||
            gNorm.includes('reelshort')
        ) {
            m = name.match(/(.+?)\s+(\d{1,3})$/i);
            if (m) return { seriesName: m[1].trim(), season: '1', episode: m[2] };
        }
    }

    return null;
}

// ─── Parser do M3U ────────────────────────────────────────────────────────────

/** Faz parse de um bloco de texto M3U. Retorna array de itens brutos. */
function parseM3UText(text, seenNames) {
    const lines = text.split('\n');
    const items = [];
    let current = {};

    for (const raw of lines) {
        const line = raw.trim();

        if (line.startsWith('#EXTINF:')) {
            const tvgName  = line.match(/tvg-name="([^"]+)"/);
            const logo     = line.match(/tvg-logo="([^"]+)"/);
            const group    = line.match(/group-title="([^"]+)"/);
            const fallback = line.match(/,(.+)$/);

            current = {
                name:  (tvgName  ? tvgName[1]  : fallback ? fallback[1] : '').trim(),
                logo:  logo  ? logo[1]  : undefined,
                group: group ? group[1] : 'Outros',
            };

        } else if (line && !line.startsWith('#')) {
            if (current.name && isMediaFile(line)) {
                const normName = normalizeName(current.name);
                if (!seenNames.has(normName)) {
                    seenNames.add(normName);
                    items.push({ ...current, url: line });
                }
            }
            current = {};
        }
    }
    return items;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Baixa e parseia todas as URLs M3U.
 * Retorna array de itens brutos deduplicados.
 */
async function fetchAllM3U(urls) {
    const seenNames = new Set();
    const allItems = [];

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        process.stdout.write(`   [${i + 1}/${urls.length}] Baixando: ${url} ... `);

        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        } catch (err) {
            console.log(`FALHOU (${err.message})`);
            continue;
        }

        if (!response.ok) {
            console.log(`FALHOU (HTTP ${response.status})`);
            continue;
        }

        const text = await response.text();
        const before = seenNames.size;
        const items = parseM3UText(text, seenNames);
        // Evita stack overflow com spread em arrays muito grandes
        for (const item of items) allItems.push(item);
        console.log(`OK — ${items.length} novos (${seenNames.size - before} únicos acumulados)`);
    }

    return allItems;
}

// ─── Categorização ────────────────────────────────────────────────────────────

/**
 * Separa os itens M3U em filmes e séries.
 * Agrupa episódios por série, ordena por temporada/episódio.
 *
 * @param {Array} items - itens brutos do M3U
 * @param {number} [limit] - limitar total de itens (para testes)
 * @returns {{ movies: Array, series: Array }}
 */
function categorizeM3UItems(items, limit) {
    const limited = limit ? items.slice(0, limit) : items;
    const seriesMap = {};
    const movies = [];
    const seenMovieNames = new Set();

    for (const item of limited) {
        const epMatch = parseEpisodeName(item.name, item.group);

        if (epMatch) {
            // ── É um episódio de série ──
            const { seriesName, season, episode } = epMatch;
            const seriesKey = normalizeName(seriesName);

            if (!seriesMap[seriesKey]) {
                const category = mapGroupToCategory(item.group);
                seriesMap[seriesKey] = {
                    id:       generateId('series', seriesName),
                    name:     seriesName,
                    active:   true,
                    category: category || item.group,
                    type:     'series',
                    isAdult:  isAdultGroup(item.group),
                    logo:     item.logo || null,
                    episodes: {},
                };
            }

            const seasonKey = String(parseInt(season));
            if (!seriesMap[seriesKey].episodes[seasonKey]) {
                seriesMap[seriesKey].episodes[seasonKey] = [];
            }

            // Evita episódio duplicado na mesma temporada
            const epNum = parseInt(episode);
            const exists = seriesMap[seriesKey].episodes[seasonKey].some(e => e.episode === epNum);
            if (!exists) {
                // Usa o slug do series.id (já truncado em 80 chars) para garantir
                // que o sufixo -s01-e001 nunca seja cortado em nomes longos.
                // Usa o ID completo da série (sem o prefixo "series-") para garantir
                // unicidade de episódios mesmo em séries com nomes muito longos.
                const seriesSlug = seriesMap[seriesKey].id.replace(/^series-/, '');
                seriesMap[seriesKey].episodes[seasonKey].push({
                    id:      `ep-${seriesSlug}-s${season.padStart(2,'0')}-e${episode.padStart(3,'0')}`,
                    episode: epNum,
                    name:    item.name,
                    url:     item.url,
                    logo:    item.logo || null,
                });
            }

        } else {
            // ── É um filme ──
            const category = mapGroupToCategory(item.group);
            if (!category) continue; // TV ao vivo — ignorar

            const normName = normalizeName(item.name);
            if (seenMovieNames.has(normName)) continue;
            seenMovieNames.add(normName);

            movies.push({
                id:       generateId('movie', item.name),
                name:     item.name,
                url:      item.url,
                active:   true,
                category,
                type:     'movie',
                isAdult:  isAdultGroup(item.group),
                logo:     item.logo || null,
            });
        }
    }

    // Ordenar episódios e calcular totais
    const series = Object.values(seriesMap).map(s => {
        for (const seasonKey of Object.keys(s.episodes)) {
            s.episodes[seasonKey].sort((a, b) => a.episode - b.episode);
        }
        const totalEpisodes = Object.values(s.episodes)
            .reduce((sum, eps) => sum + eps.length, 0);
        return { ...s, totalSeasons: Object.keys(s.episodes).length, totalEpisodes };
    });

    return { movies, series };
}

module.exports = { fetchAllM3U, categorizeM3UItems };
