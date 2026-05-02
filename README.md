# SAIMO TV — Gerador de SQL para Supabase

Sistema automatizado para buscar, categorizar e enriquecer conteúdo de M3U e gerar SQL para importação no Supabase.

---

## 🚀 GUIA COMPLETO: Do Zero ao Supabase

### ⚡ Comando Rápido (Faz tudo de uma vez)

Se você já instalou as dependências (`npm install`) e configurou o `.env`, basta rodar este comando para executar todo o pipeline (baixar, processar, dividir em partes de 4MB e enviar para o Supabase):

```bash
node index.js && node split-sql.js 4 && node upload-supabase.js
```

---

### ⚙️ PASSO 1: Verificar Pré-requisitos

```bash
# Verificar Node.js (DEVE SER 18+, recomendado 24+)
node --version

# Se não tem Node 18+, instale via nvm ou brew
# Via nvm:
nvm install 24
nvm use 24

# Via brew (macOS):
brew install node@24
```

**Requisitos:**
- ✅ Node.js **v18 ou superior** (v24 recomendado)
- ✅ npm (vem com Node.js)
- ✅ Chave TMDB API (opcional, para enriquecimento)
- ✅ Credenciais Supabase (para upload direto)

---

### 📦 PASSO 2: Instalar Dependências

```bash
cd /seu/diretorio/api-saimo-tv

# Instalar dependências
npm install
```

**Saída esperada:**
```
audited 2 packages in 3s
found 0 vulnerabilities
```

---

### 🔑 PASSO 3: Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar .env com seu editor favorito
nano .env
# ou
code .env
```

**Preencher com:**

```env
# Chave da API do TMDB (obtenha em: https://www.themoviedb.org/settings/api)
TMDB_API_KEY=sua_chave_aqui

# Opcional: Limite de itens para teste (0 = sem limite)
# ITEM_LIMIT=100

# Opcional: Pular enriquecimento TMDB (mais rápido)
# SKIP_ENRICH=true
```

---

### 🎬 PASSO 4: Executar o Pipeline Principal

```bash
node index.js
```

**O que acontece:**
1. ⬇️ **Busca M3U** — Faz download das URLs configuradas
2. 📂 **Categoriza** — Classifica filmes (20.097) e séries (7.200)
3. 🎬 **Enriquece TMDB** — Adiciona dados de cobertura e certificação
4. 💾 **Gera SQL** — Cria `01_schema.sql` e `02_data.sql`

**Saída esperada:**
```
🎬  SAIMO TV — Gerador de SQL para Supabase

────────────────────────────────────────────────
  PASSO 1 — Buscando M3U
────────────────────────────────────────────────
   ✅  27297 itens VOD encontrados.

  PASSO 2 — Categorizando itens
   📽️  Filmes:     20097
   📺  Séries:     7200
   🎞️  Episódios:  222387

  PASSO 3 — Enriquecimento TMDB
   ✅  15400/27297 itens enriquecidos (56%).

  PASSO 4 — Gerando SQL
   📄  01_schema.sql  — 45.2 KB
   📄  02_data.sql    — 87.3 MB
```

---

### 🎬 PASSO 5: Enriquecer TMDB (Patch) — Opcional

Melhora dados de itens que não tiveram cobertura completa:
- Adiciona **IDs dos atores** no elenco
- Expande para **top 50 do elenco** (em vez de 10)
- Adiciona **classificação indicativa** (certificação)

```bash
~/.nvm/versions/node/v24.14.0/bin/node patch-enrich.js
```

**Saída:**
```
📦  Carregando cache de 27297 itens...
   🎬  Filmes: (processando...)
   📺  Séries: (processando...)

✅  Enriquecimento concluído após ~30 minutos
   💾  Cache salvo em enriched-cache.json
```

**Quando usar:**
- ✅ Quer máximo de dados TMDB (melhor experiência)
- ✅ Quer certificações de conteúdo
- ✅ Quer top 50 elenco (em vez de apenas 10)
- ❌ Quer ser mais rápido (pule este passo)

---

### 🔄 PASSO 6: Rerodar Gerador com Dados Enriquecidos

Após enriquecer, regenera SQL com os dados melhorados:

```bash
node index.js
```

Isso regenera `02_data.sql` com os dados de patch-enrich inclusos.

---

### ✂️ PASSO 7: Dividir SQL em Partes (Automático)

Se `02_data.sql` for **maior que 5 MB**, executar:

```bash
node split-sql.js
```

**Saída:**
```
✂️  Dividindo 02_data.sql em partes de até 4 MB...

   ✅  data_001.sql  —  3.88 MB
   ✅  data_002.sql  —  3.85 MB
   ...
   ✅  data_028.sql  —  2.33 MB

✅  28 arquivos gerados em output/parts/
```

---

### 📤 PASSO 8: Upload para Supabase

#### Opção A: Upload Automático (RECOMENDADO ⭐)

O script `upload-supabase.js` usa a API do Supabase (credenciais já codificadas):

```bash
# Use Node 24+
~/.nvm/versions/node/v24.14.0/bin/node upload-supabase.js

# Ou se nvm use 24 estiver ativo:
node upload-supabase.js
```

**Saída:**
```
🚀  Iniciando upload para Supabase...
   Projeto: sfumaypqhxzjssarmyrn

📤  01_schema.sql  (0.00 MB)
   ✅  01_schema.sql concluído.

📦  28 partes de dados para enviar...

📤  data_001.sql  (3.88 MB, 18 blocos INSERT)
   ✅  data_001.sql concluído.
   
[... continua para data_028.sql ...]

🎉  Upload completo! Todos os dados estão no Supabase.
```

**Tempo estimado:** 5-10 minutos para 28 arquivos

---

#### Opção B: Upload Manual (SQL Editor do Supabase)

Se preferir fazer manualmente:

1. Acesse https://app.supabase.com/
2. Selecione seu projeto
3. Clique em **SQL Editor** → **+ New Query**

4. **Suba o Schema primeiro:**
   - Abra `output/01_schema.sql`
   - Copie todo conteúdo (Cmd+A, Cmd+C)
   - Cole na query do Supabase
   - Clique **RUN**

5. **Suba os dados em ordem:**
   - Para cada arquivo em `output/parts/`:
   - `data_001.sql` até `data_028.sql`
   - Abra → Copie → Cole em **nova query** → RUN
   - **Aguarde cada parte terminar** (status verde)

⚠️ **Demora muito!** Use **Opção A** (automático) quando possível.

---

#### Opção C: CLI PostgreSQL Local

Para máxima performance (execute localmente):

```bash
# Ter psql instalado (PostgreSQL client)
brew install postgresql

# Executar schema
psql "postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres" \
  -f output/01_schema.sql

# Executar dados (todos de uma vez ou em partes)
psql "postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres" \
  -f output/02_data.sql
```

💡 **Onde encontrar as credenciais:**
- Supabase → Seu Projeto → **Settings** → **Database**
- `PROJECT_REF`: Veja na URL de conexão
- `PASSWORD`: Senha definida na criação do projeto

---

## 📁 Estrutura de Saída

Após executar todos os passos, seu `output/` terá:

```
output/
├── 01_schema.sql              # Tabelas, índices, constraints
├── 02_data.sql                # Todos os dados (se < 5MB)
├── enriched-cache.json        # Cache TMDB para reuso
└── parts/                     # SQL dividido em partes
    ├── data_001.sql (3.88 MB)
    ├── data_002.sql (3.85 MB)
    ├── ...
    └── data_028.sql (2.33 MB)
```

---

## 🧪 MODO TESTE (Opcional)

Testar com menos itens (mais rápido):

```bash
# Processar apenas 100 itens
ITEM_LIMIT=100 node index.js

# Pular enriquecimento TMDB completamente
SKIP_ENRICH=true node index.js

# Combinar ambos (muito rápido!)
ITEM_LIMIT=100 SKIP_ENRICH=true node index.js
```

---

## 🐛 Troubleshooting

### ❌ "fetch is not defined"
**Solução:** Você está usando Node < 18
```bash
# Verificar versão
node --version  # Deve ser v18+

# Usar Node 24 via nvm
~/.nvm/versions/node/v24.14.0/bin/node index.js
```

### ❌ "Nenhum item VOD encontrado"
**Solução:** URLs do M3U estão inacessíveis
```bash
# Editar e adicionar URLs válidas
nano src/config.js

# Buscar linha M3U_URLS e confirmar URLs
# Testar URL manualmente no navegador
```

### ❌ Upload falha com erro de autenticação
**Solução:** Token Supabase expiraram ou inválidos
```bash
# Regenerar a string de conexão
# Supabase → Settings → Database → Connection string
# Copiar e adicionar em `.env` se necessário
```

### ⚠️ Arquivo `02_data.sql` > 100 MB
**Solução:** Dividir em partes menores
```bash
node split-sql.js
# Depois fazer upload em partes (Opção A ou B)
```

---

## ⚡ TIMINGS (Referência)

| Operação | Tempo | Condição |
|----------|-------|----------|
| Buscar + Categorizar | 2-3 min | Conexão normal |
| Enriquecimento TMDB (1ª vez) | 5-10 min | Primeira execução, com API Key |
| Cache TMDB | 1-2 min | Reutilizando cache |
| **Patch Enrich (Melhorias)** | **20-30 min** | **Adiciona IDs, certificações, top 50 elenco** |
| Gerar SQL | <1 min | Sempre rápido |
| Dividir SQL | <1 min | Split em 4MB |
| Upload Automático | 5-10 min | 28 arquivos × 4MB |

**Total do zero até Supabase:** 
- **Sem patch-enrich:** ~20-30 minutos
- **Com patch-enrich:** ~50-70 minutos (recomendado para máximo de dados)

---

## 📊 Configurações Avançadas

### Adicionar Novas URLs M3U

Edite `src/config.js`:

```javascript
const M3U_URLS = [
    'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/refs/heads/master/CanaisIPTV.m3u',
    'https://seu-outro-link.com/playlist.m3u',  // + adicione aqui
];
```

### Customizar Mapeamento de Categorias

Edite `CATEGORY_MAP` em `src/config.js`:

```javascript
const CATEGORY_MAP = {
    'acao':        'acao',
    'comedia':     'comedia',
    'sua-categoria': 'categoria-no-banco',
    // ... adicione mais
};
```

---

## 📌 Fluxo Resumido (Cheat Sheet)

### 🚀 O Comando Mágico (Faz tudo)
Se o ambiente já estiver configurado, rode apenas:
```bash
node index.js && node split-sql.js 4 && node upload-supabase.js
```

### Passo a Passo Detalhado
```bash
# 1. Verificar Node
node --version  # v24+ recomendado

# 2. Instalar deps
npm install

# 3. Configurar env
cp .env.example .env
# Editar .env com sua chave TMDB

# 4. Rodar gerador
node index.js

# 5. Enriquecer TMDB com mais dados (OPCIONAL mas recomendado)
~/.nvm/versions/node/v24.14.0/bin/node patch-enrich.js

# 6. Rerodar gerador com dados enriquecidos
node index.js

# 7. Dividir SQL (se > 5MB)
node split-sql.js

# 8. Upload para Supabase (RECOMENDADO)
~/.nvm/versions/node/v24.14.0/bin/node upload-supabase.js

# ✅ Pronto! Dados no Supabase com máximo enriquecimento
```

---

## 📌 Arquivos Principais

| Arquivo | Descrição |
|---------|-----------|
| `index.js` | Ponto de entrada — executa todo o pipeline |
| `src/config.js` | Configurações de categorias e URLs |
| `src/fetch-m3u.js` | Busca e parse dos arquivos M3U |
| `src/enrich-tmdb.js` | Enriquecimento com dados TMDB |
| `src/generate-sql.js` | Geração de SQL |
| `src/normalize.js` | Funções de normalização |
| `split-sql.js` | Divide SQL em partes menores |
| `upload-supabase.js` | Upload direto no Supabase (recomendado) |
| `patch-enrich.js` | Patch e enriquecimento posterior |

---

## 📝 Suporte

- **Docs do Supabase:** https://supabase.com/docs
- **Docs TMDB:** https://www.themoviedb.org/settings/api
- **Issues do projeto:** GitHub

---

**Última atualização:** 13 de março de 2026 | **Pipeline v1.0 ✅**
