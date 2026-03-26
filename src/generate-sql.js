'use strict';

const { SQL_INSERT_BATCH } = require('./config');

// ─── Escapamento SQL ──────────────────────────────────────────────────────────

/** Escapa uma string para SQL PostgreSQL (dobra aspas simples). */
function str(v) {
    if (v === null || v === undefined) return 'NULL';
    return `'${String(v).replace(/'/g, "''")}'`;
}

/** Valor booleano. */
function bool(v) { return v ? 'TRUE' : 'FALSE'; }

/** Número (inteiro ou decimal). */
function num(v) {
    if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return 'NULL';
    return String(Number(v));
}

/** Decimal com precisão. */
function dec(v, precision = 2) {
    if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return 'NULL';
    return Number(v).toFixed(precision);
}

/** Data no formato YYYY-MM-DD. */
function date(v) {
    if (!v) return 'NULL';
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'NULL';
    return `'${d.toISOString().slice(0, 10)}'`;
}

/** Array de texto PostgreSQL: ARRAY['A','B'] ou NULL. */
function textArr(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 'NULL';
    const items = arr.map(s => `'${String(s).replace(/'/g, "''")}'`).join(',');
    return `ARRAY[${items}]`;
}

/** Objeto/array como JSONB: '{"key":"val"}'::jsonb ou NULL. */
function jsonb(v) {
    if (v === null || v === undefined) return 'NULL';
    if (Array.isArray(v) && v.length === 0) return 'NULL';
    try {
        return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    } catch {
        return 'NULL';
    }
}

// ─── Schema DDL ───────────────────────────────────────────────────────────────

function generateSchema() {
    return `-- ================================================================
-- SAIMO TV — Schema para Supabase
-- Gerado em: ${new Date().toISOString()}
-- ================================================================
-- Execute no Supabase SQL Editor: Dashboard → SQL Editor → New query
-- ================================================================

-- ------------------------------------------------------------
-- Tabela principal: filmes e séries
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content (
    id                  TEXT        PRIMARY KEY,
    name                TEXT        NOT NULL,
    url                 TEXT,                          -- NULL para séries
    active              BOOLEAN     NOT NULL DEFAULT TRUE,
    category            TEXT,
    type                TEXT        NOT NULL CHECK (type IN ('movie', 'series')),
    is_adult            BOOLEAN     NOT NULL DEFAULT FALSE,
    logo                TEXT,

    -- Dados específicos de séries
    total_seasons       INTEGER,
    total_episodes      INTEGER,

    -- Dados do TMDB (quando disponíveis)
    tmdb_id             INTEGER,
    tmdb_title          TEXT,
    tmdb_original_title TEXT,
    tmdb_overview       TEXT,
    tmdb_poster_path    TEXT,
    tmdb_backdrop_path  TEXT,
    tmdb_release_date   DATE,
    tmdb_vote_average   NUMERIC(4,2),
    tmdb_vote_count     INTEGER,
    tmdb_genres         TEXT[],
    tmdb_director       TEXT[],    -- diretor(es) do filme / criador(es) da série
    tmdb_cast           JSONB,     -- top 50 elenco: [{id, name, character, profilePath, order}]
    tmdb_media_type     TEXT,
    tmdb_certification  TEXT,      -- classificação indicativa (ex: L, 10, 12, 14, 16, 18, PG-13)

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Tabela de episódios (somente séries)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.episodes (
    id          TEXT        PRIMARY KEY,
    series_id   TEXT        NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    season      INTEGER     NOT NULL,
    episode     INTEGER     NOT NULL,
    name        TEXT,
    url         TEXT,
    logo        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT episodes_unique_per_series UNIQUE (series_id, season, episode)
);

-- ------------------------------------------------------------
-- Índices para performance
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_content_type       ON public.content (type);
CREATE INDEX IF NOT EXISTS idx_content_active     ON public.content (active);
CREATE INDEX IF NOT EXISTS idx_content_category   ON public.content (category);
CREATE INDEX IF NOT EXISTS idx_content_tmdb_id    ON public.content (tmdb_id);
CREATE INDEX IF NOT EXISTS idx_content_is_adult   ON public.content (is_adult);

-- Full-text search em português (nome + overview)
CREATE INDEX IF NOT EXISTS idx_content_name_fts
    ON public.content USING gin (to_tsvector('portuguese', name));
CREATE INDEX IF NOT EXISTS idx_content_cast_gin
    ON public.content USING gin (tmdb_cast);

CREATE INDEX IF NOT EXISTS idx_episodes_series    ON public.episodes (series_id);
CREATE INDEX IF NOT EXISTS idx_episodes_num
    ON public.episodes (series_id, season, episode);

-- ------------------------------------------------------------
-- Adiciona coluna se ainda não existir (safe para re-execução)
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS tmdb_certification TEXT;

-- ------------------------------------------------------------
-- Trigger para atualizar updated_at automaticamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_content_updated_at ON public.content;
CREATE TRIGGER trg_content_updated_at
    BEFORE UPDATE ON public.content
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
`;
}

// ─── Helpers de INSERT ────────────────────────────────────────────────────────

const CONTENT_COLS = [
    'id', 'name', 'url', 'active', 'category', 'type', 'is_adult', 'logo',
    'total_seasons', 'total_episodes',
    'tmdb_id', 'tmdb_title', 'tmdb_original_title', 'tmdb_overview',
    'tmdb_poster_path', 'tmdb_backdrop_path', 'tmdb_release_date',
    'tmdb_vote_average', 'tmdb_vote_count', 'tmdb_genres',
    'tmdb_director', 'tmdb_cast', 'tmdb_media_type', 'tmdb_certification',
].join(', ');

const CONTENT_UPSERT = [
    'url = EXCLUDED.url',
    'active = EXCLUDED.active',
    'logo = EXCLUDED.logo',
    'total_seasons = EXCLUDED.total_seasons',
    'total_episodes = EXCLUDED.total_episodes',
    'tmdb_id = EXCLUDED.tmdb_id',
    'tmdb_title = EXCLUDED.tmdb_title',
    'tmdb_original_title = EXCLUDED.tmdb_original_title',
    'tmdb_overview = EXCLUDED.tmdb_overview',
    'tmdb_poster_path = EXCLUDED.tmdb_poster_path',
    'tmdb_backdrop_path = EXCLUDED.tmdb_backdrop_path',
    'tmdb_release_date = EXCLUDED.tmdb_release_date',
    'tmdb_vote_average = EXCLUDED.tmdb_vote_average',
    'tmdb_vote_count = EXCLUDED.tmdb_vote_count',
    'tmdb_genres = EXCLUDED.tmdb_genres',
    'tmdb_director = EXCLUDED.tmdb_director',
    'tmdb_cast = EXCLUDED.tmdb_cast',
    'tmdb_media_type = EXCLUDED.tmdb_media_type',
    'tmdb_certification = EXCLUDED.tmdb_certification',
    'updated_at = NOW()',
].join(',\n        ');

function contentRow(item) {
    const t = item.tmdb || {};
    return [
        str(item.id),
        str(item.name),
        str(item.url),
        bool(item.active),
        str(item.category),
        str(item.type),
        bool(item.isAdult),
        str(item.logo),
        // series-only
        item.type === 'series' ? num(item.totalSeasons)  : 'NULL',
        item.type === 'series' ? num(item.totalEpisodes) : 'NULL',
        // tmdb
        num(t.id),
        str(t.title),
        str(t.originalTitle),
        str(t.overview),
        str(t.posterPath),
        str(t.backdropPath),
        date(t.releaseDate),
        dec(t.voteAverage),
        num(t.voteCount),
        textArr(t.genres),
        textArr(t.director),   // TEXT[]
        jsonb(t.cast),         // JSONB
        str(t.mediaType),
        str(t.certification),
    ].join(', ');
}

/** Gera blocos INSERT … ON CONFLICT para conteúdo (filmes ou séries). */
function generateContentInserts(items) {
    if (items.length === 0) return '';
    const parts = [];

    for (let i = 0; i < items.length; i += SQL_INSERT_BATCH) {
        const chunk = items.slice(i, i + SQL_INSERT_BATCH);
        const vals  = chunk.map(item => `    (${contentRow(item)})`).join(',\n');

        parts.push(
            `INSERT INTO public.content (${CONTENT_COLS})\nVALUES\n${vals}\nON CONFLICT (id) DO UPDATE SET\n        ${CONTENT_UPSERT};\n`
        );
    }

    return parts.join('\n');
}

// ─── Episódios ────────────────────────────────────────────────────────────────

const EP_COLS  = 'id, series_id, season, episode, name, url, logo';
const EP_UPSERT = [
    'name = EXCLUDED.name',
    'url  = EXCLUDED.url',
    'logo = EXCLUDED.logo',
].join(',\n        ');

function epRow(ep, seriesId) {
    return [
        str(ep.id),
        str(seriesId),
        num(ep.season),
        num(ep.episode),
        str(ep.name),
        str(ep.url),
        str(ep.logo),
    ].join(', ');
}

/** Flatten de episódios de todas as séries + geração de INSERTs. */
function generateEpisodeInserts(seriesArr) {
    const allEps = [];
    for (const s of seriesArr) {
        if (!s.episodes) continue;
        for (const [seasonKey, eps] of Object.entries(s.episodes)) {
            const season = parseInt(seasonKey);
            for (const ep of eps) {
                allEps.push({ ...ep, season, _seriesId: s.id });
            }
        }
    }

    if (allEps.length === 0) return '';

    const parts = [];
    for (let i = 0; i < allEps.length; i += SQL_INSERT_BATCH) {
        const chunk = allEps.slice(i, i + SQL_INSERT_BATCH);
        const vals  = chunk.map(ep => `    (${epRow(ep, ep._seriesId)})`).join(',\n');

        parts.push(
            `INSERT INTO public.episodes (${EP_COLS})\nVALUES\n${vals}\nON CONFLICT (series_id, season, episode) DO UPDATE SET\n        ${EP_UPSERT};\n`
        );
    }

    return parts.join('\n');
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

/**
 * Gera o arquivo de dados SQL completo.
 * @param {Array} movies  - filmes enriquecidos
 * @param {Array} series  - séries enriquecidas
 * @returns {string}
 */
function generateData(movies, series) {
    const totalEpisodes = series.reduce((acc, s) =>
        acc + Object.values(s.episodes || {}).reduce((a, e) => a + e.length, 0), 0);

    const header = `-- ================================================================
-- SAIMO TV — Dados para Supabase
-- Gerado em:  ${new Date().toISOString()}
-- Filmes:     ${movies.length}
-- Séries:     ${series.length}
-- Episódios:  ${totalEpisodes}
-- ================================================================
-- Execute APÓS o schema (01_schema.sql).
-- Os INSERTs usam ON CONFLICT para serem idempotentes (re-executáveis).
-- ================================================================
`;

    const movieSection = movies.length === 0 ? '' : `
-- ============================================================
-- FILMES (${movies.length})
-- ============================================================
${generateContentInserts(movies)}`;

    const seriesSection = series.length === 0 ? '' : `
-- ============================================================
-- SÉRIES (${series.length})
-- ============================================================
${generateContentInserts(series)}`;

    const episodeSection = totalEpisodes === 0 ? '' : `
-- ============================================================
-- EPISÓDIOS (${totalEpisodes})
-- ============================================================
${generateEpisodeInserts(series)}`;

    return [header, movieSection, seriesSection, episodeSection].join('\n');
}

module.exports = { generateSchema, generateData };
