-- ================================================================
-- SAIMO TV — RPC Functions para API Supabase (Catálogo)
-- Execute no Supabase SQL Editor: Dashboard → SQL Editor → New query
-- ================================================================

-- ── Remove funções antigas com assinaturas diferentes ────────────────────────
DROP FUNCTION IF EXISTS public.get_filmography(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.get_filmography(TEXT, TEXT, INTEGER);

-- ── Permissões de leitura ─────────────────────────────────────────────────────
GRANT USAGE  ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.content  TO anon, authenticated;
GRANT SELECT ON public.episodes TO anon, authenticated;

ALTER TABLE public.content  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read content"  ON public.content;
DROP POLICY IF EXISTS "Public read episodes" ON public.episodes;
CREATE POLICY "Public read content"  ON public.content  FOR SELECT USING (true);
CREATE POLICY "Public read episodes" ON public.episodes FOR SELECT USING (true);


-- ================================================================
-- category_label(slug)
-- Converte slug de categoria para nome de exibição.
-- ================================================================
CREATE OR REPLACE FUNCTION public.category_label(slug TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE slug
        -- Gêneros
        WHEN 'acao'              THEN 'Ação'
        WHEN 'aventura'          THEN 'Aventura'
        WHEN 'comedia'           THEN 'Comédia'
        WHEN 'drama'             THEN 'Drama'
        WHEN 'terror'            THEN 'Terror'
        WHEN 'suspense'          THEN 'Suspense'
        WHEN 'fantasia'          THEN 'Fantasia'
        WHEN 'romance'           THEN 'Romance'
        WHEN 'ficcao-cientifica' THEN 'Ficção Científica'
        WHEN 'animacao'          THEN 'Animação'
        WHEN 'desenhos'          THEN 'Desenhos Animados'
        WHEN 'animes'            THEN 'Animes'
        WHEN 'doramas'           THEN 'Doramas'
        WHEN 'novelas'           THEN 'Novelas'
        WHEN 'documentario'      THEN 'Documentário'
        WHEN 'faroeste'          THEN 'Faroeste'
        WHEN 'guerra'            THEN 'Guerra'
        WHEN 'musicais'          THEN 'Musicais'
        WHEN 'shows'             THEN 'Shows'
        WHEN 'cinema'            THEN 'Cinema'
        WHEN 'reality'           THEN 'Reality Shows'
        WHEN 'marvel-dc'         THEN 'Marvel/DC'
        -- Nacionais
        WHEN 'brasileiro'        THEN 'Brasileiro'
        WHEN 'nacionais'         THEN 'Nacionais'
        WHEN 'religiosos'        THEN 'Religiosos'
        WHEN 'lancamentos'       THEN 'Lançamentos'
        WHEN 'legendados'        THEN 'Legendados'
        WHEN 'legendadas'        THEN 'Legendadas'
        WHEN 'uhd-4k'            THEN '4K/UHD'
        WHEN 'hot-adultos'       THEN 'Adultos'
        WHEN 'brasil-paralelo'   THEN 'Brasil Paralelo'
        WHEN 'outros'            THEN 'Outros'
        WHEN 'outras-produtoras' THEN 'Outras Produtoras'
        WHEN 'Fitness'           THEN 'Fitness'
        -- Streamings
        WHEN 'netflix'           THEN 'Netflix'
        WHEN 'prime-video'       THEN 'Prime Video'
        WHEN 'disney'            THEN 'Disney+'
        WHEN 'max'               THEN 'Max'
        WHEN 'globoplay'         THEN 'Globoplay'
        WHEN 'apple-tv'          THEN 'Apple TV+'
        WHEN 'paramount'         THEN 'Paramount+'
        WHEN 'discovery'         THEN 'Discovery+'
        WHEN 'crunchyroll'       THEN 'Crunchyroll'
        WHEN 'directv'           THEN 'DirecTV Go'
        WHEN 'lionsgate'         THEN 'Lionsgate+'
        WHEN 'universal-plus'    THEN 'Universal+'
        WHEN 'univer'            THEN 'Universo'
        WHEN 'hulu'              THEN 'Hulu'
        WHEN 'reelshort'         THEN 'ReelShort'
        ELSE initcap(REPLACE(slug, '-', ' '))
    END;
$$;


-- ================================================================
-- _build_card_json(c)
-- Versão slim para listagens (catálogo, home, filmografia).
-- Retorna apenas: id, name, type, category, logo, poster, backdrop,
--                 rating, certification, year, totalSeasons, totalEpisodes.
-- SEM: url, cast, overview, genres, directors, episodes.
-- ================================================================
CREATE OR REPLACE FUNCTION public._build_card_json(c public.content)
RETURNS JSONB LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'id',            c.id,
        'name',          c.name,
        'type',          c.type,
        'category',      c.category,
        'categoryLabel', public.category_label(c.category),
        'isAdult',       c.is_adult,
        'logo',          c.logo,
        'totalSeasons',  c.total_seasons,
        'totalEpisodes', c.total_episodes,
        'tmdb', CASE WHEN c.tmdb_id IS NOT NULL THEN
            jsonb_build_object(
                'id',            c.tmdb_id,
                'title',         c.tmdb_title,
                'year',          CASE WHEN c.tmdb_release_date IS NOT NULL
                                      THEN EXTRACT(YEAR FROM c.tmdb_release_date)::text
                                      ELSE NULL END,
                'rating',        c.tmdb_vote_average,
                'certification', c.tmdb_certification,
                'poster',        CASE WHEN c.tmdb_poster_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/w500' || c.tmdb_poster_path
                                      ELSE NULL END,
                'posterHD',      CASE WHEN c.tmdb_poster_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/original' || c.tmdb_poster_path
                                      ELSE NULL END,
                'backdrop',      CASE WHEN c.tmdb_backdrop_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/w1280' || c.tmdb_backdrop_path
                                      ELSE NULL END,
                'backdropHD',    CASE WHEN c.tmdb_backdrop_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/original' || c.tmdb_backdrop_path
                                      ELSE NULL END
            )
        ELSE NULL END
    );
$$;


-- ================================================================
-- _build_content_json(c)
-- Versão completa de um item. Usado apenas por get_item.
-- Inclui: url, cast, overview, genres, directors, episodes.
-- ================================================================
CREATE OR REPLACE FUNCTION public._build_content_json(c public.content)
RETURNS JSONB LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'id',            c.id,
        'name',          c.name,
        'url',           c.url,
        'active',        c.active,
        'category',      c.category,
        'categoryLabel', public.category_label(c.category),
        'type',          c.type,
        'isAdult',       c.is_adult,
        'logo',          c.logo,
        'totalSeasons',  c.total_seasons,
        'totalEpisodes', c.total_episodes,

        -- Episódios agrupados por temporada (somente séries)
        'episodes', CASE WHEN c.type = 'series' THEN (
            SELECT COALESCE(
                jsonb_object_agg(sd.season_num, sd.eps_list),
                '{}'::jsonb
            )
            FROM (
                SELECT
                    e.season::text AS season_num,
                    jsonb_agg(
                        jsonb_build_object(
                            'id',      e.id,
                            'episode', e.episode,
                            'name',    e.name,
                            'url',     e.url,
                            'logo',    e.logo
                        )
                        ORDER BY e.episode
                    ) AS eps_list
                FROM public.episodes e
                WHERE e.series_id = c.id
                GROUP BY e.season
            ) sd
        ) ELSE NULL END,

        -- Metadados TMDB
        'tmdb', CASE WHEN c.tmdb_id IS NOT NULL THEN
            jsonb_build_object(
                'id',            c.tmdb_id,
                'title',         c.tmdb_title,
                'originalTitle', c.tmdb_original_title,
                'overview',      c.tmdb_overview,
                'releaseDate',   TO_CHAR(c.tmdb_release_date, 'YYYY-MM-DD'),
                'year',          CASE WHEN c.tmdb_release_date IS NOT NULL
                                      THEN EXTRACT(YEAR FROM c.tmdb_release_date)::text
                                      ELSE NULL END,
                'rating',        c.tmdb_vote_average,
                'voteCount',     c.tmdb_vote_count,
                'certification', c.tmdb_certification,
                'genres',        COALESCE(to_jsonb(c.tmdb_genres), '[]'::jsonb),
                'poster',        CASE WHEN c.tmdb_poster_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/w500' || c.tmdb_poster_path
                                      ELSE NULL END,
                'posterHD',      CASE WHEN c.tmdb_poster_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/original' || c.tmdb_poster_path
                                      ELSE NULL END,
                'backdrop',      CASE WHEN c.tmdb_backdrop_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/w1280' || c.tmdb_backdrop_path
                                      ELSE NULL END,
                'backdropHD',    CASE WHEN c.tmdb_backdrop_path IS NOT NULL
                                      THEN 'https://image.tmdb.org/t/p/original' || c.tmdb_backdrop_path
                                      ELSE NULL END,
                'cast', CASE WHEN c.tmdb_cast IS NOT NULL THEN (
                    SELECT COALESCE(jsonb_agg(
                        jsonb_build_object(
                            'id',        (actor->>'id')::integer,
                            'name',      actor->>'name',
                            'character', actor->>'character',
                            'photo',     CASE WHEN actor->>'profilePath' IS NOT NULL
                                              THEN 'https://image.tmdb.org/t/p/w185' || (actor->>'profilePath')
                                              ELSE NULL END
                        )
                    ), '[]'::jsonb)
                    FROM jsonb_array_elements(c.tmdb_cast) AS actor
                ) ELSE '[]'::jsonb END,
                'directors', COALESCE(to_jsonb(c.tmdb_director), '[]'::jsonb)
            )
        ELSE NULL END
    );
$$;


-- ================================================================
-- get_catalog
-- Retorna lista paginada (50 itens) de filmes e/ou séries.
--
-- Parâmetros:
--   p_type      TEXT    — 'movie' | 'series' | null (ambos)
--   p_category  TEXT    — slug da categoria, ex: 'acao', 'netflix'
--   p_page      INTEGER — página (começa em 1)
--   p_search    TEXT    — busca por nome (case-insensitive, parcial)
--   p_actor     TEXT    — filtra por nome de ator no elenco
--   p_order_by  TEXT    — 'name' | 'rating' | 'new'
--   p_is_adult  BOOLEAN — false = exclui adulto (padrão)
--
-- Retorna: { items, total, page, totalPages }
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_catalog(
    p_type     TEXT    DEFAULT NULL,
    p_category TEXT    DEFAULT NULL,
    p_page     INTEGER DEFAULT 1,
    p_search   TEXT    DEFAULT NULL,
    p_actor    TEXT    DEFAULT NULL,
    p_order_by TEXT    DEFAULT 'name',
    p_is_adult BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
    v_limit  CONSTANT INTEGER := 50;
    v_offset INTEGER          := (GREATEST(p_page, 1) - 1) * v_limit;
    v_total  BIGINT;
    v_items  JSONB;
BEGIN
    -- ── 1. Contagem total ─────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_total
    FROM public.content c
    WHERE
        (p_type     IS NULL OR c.type     = p_type)
        AND (p_category IS NULL OR c.category = p_category)
        AND (p_is_adult            OR NOT c.is_adult)
        AND (p_search   IS NULL OR c.name ILIKE '%' || p_search || '%')
        AND (p_actor    IS NULL OR c.tmdb_cast::text ILIKE '%' || p_actor || '%');

    -- ── 2. Itens paginados ────────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(public._build_card_json(c)), '[]'::jsonb) INTO v_items
    FROM (
        SELECT c.*
        FROM public.content c
        WHERE
            (p_type     IS NULL OR c.type     = p_type)
            AND (p_category IS NULL OR c.category = p_category)
            AND (p_is_adult            OR NOT c.is_adult)
            AND (p_search   IS NULL OR c.name ILIKE '%' || p_search || '%')
            AND (p_actor    IS NULL OR c.tmdb_cast::text ILIKE '%' || p_actor || '%')
        ORDER BY
            CASE WHEN p_order_by = 'rating' THEN c.tmdb_vote_average END DESC NULLS LAST,
            CASE WHEN p_order_by = 'new'    THEN c.tmdb_release_date END DESC NULLS LAST,
            c.name ASC
        LIMIT v_limit OFFSET v_offset
    ) c;

    RETURN jsonb_build_object(
        'items',      v_items,
        'total',      v_total,
        'page',       GREATEST(p_page, 1),
        'totalPages', CEIL(v_total::numeric / v_limit)::integer
    );
END;
$$;


-- ================================================================
-- get_filmography
-- Todos os filmes/séries em que um ator participou.
--
-- Parâmetros:
--   p_actor_id  INTEGER — ID TMDB do ator (cast[].id) — busca exata via GIN
--   p_actor     TEXT    — nome parcial do ator (fallback, menos preciso)
--   p_page      INTEGER — página (começa em 1)
--
-- Prioridade: p_actor_id > p_actor. Forneça um dos dois.
-- Retorna: mesmo formato de get_catalog
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_filmography(
    p_actor_id INTEGER DEFAULT NULL,
    p_actor    TEXT    DEFAULT NULL,
    p_page     INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
    v_limit  CONSTANT INTEGER := 50;
    v_offset INTEGER          := (GREATEST(p_page, 1) - 1) * v_limit;
    v_total  BIGINT;
    v_items  JSONB;
BEGIN
    IF p_actor_id IS NULL AND p_actor IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'Informe p_actor_id (INTEGER) ou p_actor (TEXT)',
            'items', '[]'::jsonb, 'total', 0, 'page', 1, 'totalPages', 0
        );
    END IF;

    -- ── 1. Contagem total ─────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_total
    FROM public.content c
    WHERE
        NOT c.is_adult
        AND CASE
            WHEN p_actor_id IS NOT NULL
                THEN c.tmdb_cast @> jsonb_build_array(jsonb_build_object('id', p_actor_id))
            ELSE
                c.tmdb_cast::text ILIKE '%' || p_actor || '%'
        END;

    -- ── 2. Itens paginados ────────────────────────────────────────────────────
    SELECT COALESCE(jsonb_agg(public._build_card_json(c)), '[]'::jsonb) INTO v_items
    FROM (
        SELECT c.*
        FROM public.content c
        WHERE
            NOT c.is_adult
            AND CASE
                WHEN p_actor_id IS NOT NULL
                    THEN c.tmdb_cast @> jsonb_build_array(jsonb_build_object('id', p_actor_id))
                ELSE
                    c.tmdb_cast::text ILIKE '%' || p_actor || '%'
            END
        ORDER BY c.tmdb_release_date DESC NULLS LAST, c.name ASC
        LIMIT v_limit OFFSET v_offset
    ) c;

    RETURN jsonb_build_object(
        'items',      v_items,
        'total',      v_total,
        'page',       GREATEST(p_page, 1),
        'totalPages', CEIL(v_total::numeric / v_limit)::integer
    );
END;
$$;


-- ================================================================
-- get_categories
-- Lista todas as categorias disponíveis com ID e label de exibição.
--
-- Retorna:
-- {
--   "movies": [{"id":"acao","label":"Ação","count":3119}, ...],
--   "series": [{"id":"netflix","label":"Netflix","count":1291}, ...]
-- }
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT jsonb_build_object(
        'movies', (
            SELECT COALESCE(jsonb_agg(row ORDER BY row->>'label'), '[]'::jsonb)
            FROM (
                SELECT jsonb_build_object(
                    'id',    category,
                    'label', public.category_label(category),
                    'count', COUNT(*)
                ) AS row
                FROM public.content
                WHERE type = 'movie' AND category IS NOT NULL AND category <> ''
                GROUP BY category
            ) m
        ),
        'series', (
            SELECT COALESCE(jsonb_agg(row ORDER BY row->>'label'), '[]'::jsonb)
            FROM (
                SELECT jsonb_build_object(
                    'id',    category,
                    'label', public.category_label(category),
                    'count', COUNT(*)
                ) AS row
                FROM public.content
                WHERE type = 'series' AND category IS NOT NULL AND category <> ''
                GROUP BY category
            ) s
        )
    );
$$;


-- ================================================================
-- get_item
-- Retorna um único filme ou série pelo ID.
--
-- Parâmetros:
--   p_id TEXT — ex: 'movie-matrix', 'series-dark'
--
-- Retorna: objeto JSON completo do item, ou null se não encontrado
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_item(p_id TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
    SELECT public._build_content_json(c)
    FROM public.content c
    WHERE c.id = p_id;
$$;


-- ================================================================
-- get_home
-- Retorna N itens de cada categoria para montar a tela inicial.
-- Dados slim: sem cast, overview, episodes, url.
--
-- Parâmetros:
--   p_type     TEXT    — 'movie' | 'series' | null (ambos)
--   p_limit    INTEGER — itens por categoria (padrão: 20, máx: 50)
--   p_order_by TEXT    — 'rating' | 'new' | 'name'
--
-- Retorna: array de { id, label, type, items: [...] }
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_home(
    p_type     TEXT    DEFAULT NULL,
    p_limit    INTEGER DEFAULT 20,
    p_order_by TEXT    DEFAULT 'rating'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',    grp.cat,
            'label', public.category_label(grp.cat),
            'type',  grp.tp,
            'items', (
                SELECT COALESCE(jsonb_agg(public._build_card_json(c2)), '[]'::jsonb)
                FROM (
                    SELECT c2.*
                    FROM public.content c2
                    WHERE c2.category = grp.cat
                      AND c2.type     = grp.tp
                      AND NOT c2.is_adult
                    ORDER BY
                        CASE WHEN p_order_by = 'rating' THEN c2.tmdb_vote_average END DESC NULLS LAST,
                        CASE WHEN p_order_by = 'new'    THEN c2.tmdb_release_date END DESC NULLS LAST,
                        c2.name ASC
                    LIMIT LEAST(GREATEST(p_limit, 1), 50)
                ) c2
            )
        )
        ORDER BY grp.tp DESC, public.category_label(grp.cat)
    ), '[]'::jsonb) INTO v_result
    FROM (
        SELECT DISTINCT type AS tp, category AS cat
        FROM public.content
        WHERE NOT is_adult
          AND category IS NOT NULL AND category <> ''
          AND (p_type IS NULL OR type = p_type)
    ) grp;

    RETURN v_result;
END;
$$;


-- ── Permissões de execução ────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.category_label(TEXT)                                                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._build_card_json(public.content)                                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._build_content_json(public.content)                                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_home(TEXT, INTEGER, TEXT)                                              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_catalog(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, BOOLEAN)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_filmography(INTEGER, TEXT, INTEGER)                                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_categories()                                                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_item(TEXT)                                                             TO anon, authenticated;
