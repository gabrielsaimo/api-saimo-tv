'use strict';

// URLs do M3U para buscar conteúdo
const M3U_URLS = [
    'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/refs/heads/master/CanaisIPTV.m3u',
    // Adicione mais URLs aqui se necessário:
    // 'https://exemplo.com/outro.m3u',
];

// Mapeamento de grupos M3U → categoria no banco
const CATEGORY_MAP = {
    // Gêneros principais
    'acao':        'acao',
    'comedia':     'comedia',
    'drama':       'drama',
    'terror':      'terror',
    'ficcao':      'ficcao-cientifica',
    'animacao':    'animacao',
    'infantil':    'animacao',
    'desenho':     'desenhos',
    'anime':       'animes',
    'romance':     'romance',
    'suspense':    'suspense',
    'aventura':    'aventura',
    'fantasia':    'fantasia',
    'faroeste':    'faroeste',
    'western':     'western',
    'guerra':      'guerra',
    'documentario':  'documentario',
    'documentarios': 'documentario',
    'docu':        'docu',
    'biografia':   'biografia',
    'historia':    'historia',
    'crime':       'crime',
    'policial':    'crime',
    'misterio':    'misterio',
    'familia':     'familia',
    'musica':      'musicais',
    'show':        'shows',
    'dorama':      'doramas',
    'novela':      'novelas',
    'nacional':    'nacionais',
    'religioso':   'religiosos',
    'gospel':      'religiosos',
    'lancamentos': 'lancamentos',

    // Streaming
    'netflix':     'netflix',
    'amazon':      'prime-video',
    'prime':       'prime-video',
    'disney':      'disney',
    'hbo':         'max',
    'max':         'max',
    'globo':       'globoplay',
    'globoplay':   'globoplay',
    'apple':       'apple-tv',
    'paramount':   'paramount',
    'star':        'star',
    'discovery':   'discovery',
    'amc':         'amc-plus',
    'crunchyroll': 'crunchyroll',
    'funimation':  'funimation-now',
    'claro':       'claro-video',
    'directv':     'directv',
    'lionsgate':   'lionsgate',
    'pluto':       'plutotv',
    'plutotv':     'plutotv',
    'universal':   'universal-plus',
    'univer':      'univer',
    'hulu':        'hulu',
    'reelshort':   'reelshort',
    'sbt':         'sbt',
    'brasil paralelo': 'brasil-paralelo',

    // Conteúdo especial
    '4k':          'uhd-4k',
    'uhd':         'uhd-4k',
    'cinema':      'cinema',
    'oscar':       'oscar-2025',
    'stand-up':    'stand-up-comedy',
    'standup':     'stand-up-comedy',
    'reality':     'reality',
    'marvel':      'marvel-dc',
    'brasileiro':  'brasileiro',
    'infantis':    'infantil',
    'esporte':     'esportes',
    'esportes':    'esportes',
    'sports':      'esportes',
    'programa':    'programas-de-tv',
    'tv show':     'programas-de-tv',
    'turca':       'novelas-turcas',
    'turkish':     'novelas-turcas',
    'curso':       'cursos',
    'cursos':      'cursos',
    'dublagem':    'dublagem-nao-oficial',
    'legendada':   'legendadas',
    'legendadas':  'legendadas',
    'legendado':   'legendados',
    'outros':      'outros',
    'outras':      'outras-produtoras',
    'especial':    'especial-infantil',

    // Adultos
    'adultos':     'hot-adultos',
    'adultos | bella da semana': 'hot-adultos-bella-da-semana',
    'adultos | legendado':       'hot-adultos-legendado',
    'xxx':         'hot-adultos',
};

// Grupos excluídos antes de verificar o mapa (canais ao vivo com nomes conflitantes)
const PRIORITY_TV_EXCLUDES = [
    '24h',
    'globo nordeste', 'globo sudeste', 'globo sul', 'globo norte', 'globo centro',
    'hora do jogo', 'bbb',
    'nfl game', 'nba league', 'mlb game', 'mls season', 'nhl center',
    'esportes ppv', 'estados unidos', 'filmes series', 'maratona',
];

// Grupos excluídos depois de verificar o mapa (canais ao vivo sem categoria VOD)
const FALLBACK_TV_EXCLUDES = [
    'abertos', 'espn', 'premiere', 'telecine',
    'noticias', 'desporto', 'portugal', 'variedade', 'fitness',
    'record', 'cine sky', 'filmes 24', 'filmes',
    'band', 'hora do',
];

// Grupos que identificam conteúdo adulto
const ADULT_KEYWORDS = ['adultos', 'adulto', 'xxx', 'hot-adultos', 'bella da semana'];

// Configurações de enriquecimento TMDB
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const ENRICH_BATCH_SIZE = 80;   // itens por lote
const ENRICH_BATCH_DELAY = 1600; // ms entre lotes (evita rate limit)
const TMDB_MIN_SCORE = 10;      // score mínimo para aceitar um resultado do TMDB

// SQL — quantas linhas por INSERT
const SQL_INSERT_BATCH = 100;

module.exports = {
    M3U_URLS,
    CATEGORY_MAP,
    PRIORITY_TV_EXCLUDES,
    FALLBACK_TV_EXCLUDES,
    ADULT_KEYWORDS,
    TMDB_BASE_URL,
    ENRICH_BATCH_SIZE,
    ENRICH_BATCH_DELAY,
    TMDB_MIN_SCORE,
    SQL_INSERT_BATCH,
};
