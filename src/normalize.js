'use strict';

/**
 * Normaliza um nome para comparação:
 * - Minúsculas, remove acentos, mantém só alfanumérico + espaço.
 */
function normalizeName(name) {
    return String(name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
        .replace(/[^a-z0-9\s]/g, ' ')   // tudo que não é letra/número → espaço
        .replace(/\s+/g, ' ')            // colapsa espaços
        .trim();
}

/**
 * Limpa um título para busca no TMDB:
 * - Remove qualificadores de idioma: (Leg), (Dub), (Legendado) etc.
 * - Remove marcadores de qualidade: 4K, UHD, BluRay etc.
 * - Remove ano entre colchetes/parênteses.
 * - Remove padrões de episódio: S01E01, T1 Ep2, Temporada 1 etc.
 */
function cleanTitle(title) {
    return String(title)
        // Qualificadores de idioma
        .replace(/\s*[\(\[]\s*(leg|dub|dublado|legendado|dual|national|pt-br|pt-pt|eng|legendada)\s*[\)\]]/gi, '')
        // Marcadores de qualidade/formato
        .replace(/\b(4K|UHD|HD|FHD|SD|BluRay|BDRip|WEB-DL|WEBRip|HDTV|DVDRip|CAM|HDR|SDR)\b/gi, '')
        // Ano entre colchetes ou parênteses
        .replace(/\s*[\(\[]\d{4}[\)\]]\s*/g, '')
        // Padrões de episódio
        .replace(/\s+S\d{1,2}\s*(?:E|Ep)?\s*\d{1,3}.*/i, '')
        .replace(/\s+T\d{1,2}\s*(?:E|Ep)?\s*\d{1,3}.*/i, '')
        .replace(/\s+Temporada\s+\d+.*/i, '')
        .replace(/\s+\d{1,2}x\d{1,3}.*/i, '')
        // Pontuação final
        .replace(/[\s.\-_]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Gera um ID estável e legível a partir de um prefixo e nome.
 * Ex: generateId('movie', 'O Poderoso Chefão') → 'movie-o-poderoso-chefao'
 */
function generateId(prefix, name) {
    const slug = String(name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return `${prefix}-${slug}`;
}

module.exports = { normalizeName, cleanTitle, generateId };
