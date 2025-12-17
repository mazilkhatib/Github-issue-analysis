# GitHub Issue Analysis Backend

A backend server that fetches GitHub issues and analyzes them using LLMs.

## Features

- **POST /scan** - Fetch and cache all open issues from a GitHub repository
- **POST /analyze** - Analyze cached issues using natural language prompts

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: SQLite with Prisma ORM
- **LLM**: OpenRouter (cloud, primary) / Ollama (local, fallback)
- **Text Chunking**: LangChain `RecursiveCharacterTextSplitter` (with 10% overlap)

## Storage Choice: SQLite + Prisma

I chose SQLite over in-memory or JSON file storage because:

1. **Durability** - Data persists across server restarts
2. **Performance** - Fast queries even with thousands of issues
3. **Type Safety** - Prisma provides auto-generated TypeScript types
4. **Easy Backup** - Single `.db` file to backup/restore
5. **No Setup** - No external database server required

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and configure:
- `OPENROUTER_API_KEY` - Get from [OpenRouter](https://openrouter.ai/keys) (primary LLM)
- `OLLAMA_HOST` (optional) - Ollama server URL for local fallback (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (optional) - Local model to use (default: `deepseek-r1`)
- `GITHUB_TOKEN` (optional) - For private repos or higher rate limits

### 3. Initialize Database

```bash
npm run db:push
```

### 4. Start Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

## API Usage

### Scan Repository

```bash
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo": "facebook/react"}'
```

**Response:**
```json
{
  "repo": "facebook/react",
  "issues_fetched": 842,
  "cached_successfully": true
}
```

### Analyze Issues

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "facebook/react",
    "prompt": "What are the top 5 most common issue themes? What should maintainers fix first?"
  }'
```

**Response:**
```json
{
  "analysis": "<LLM-generated analysis>"
}
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Repository not scanned` | Calling /analyze before /scan | Run /scan first |
| `Repository not found` | Invalid repo name | Check owner/repo format |
| `Rate limit exceeded` | Too many GitHub API calls | Add GITHUB_TOKEN |
| `All LLM providers failed` | No OpenRouter key + Ollama not running | Add OPENROUTER_API_KEY or start Ollama |

## Project Structure

```
├── prisma/
│   └── schema.prisma    # Database schema
├── src/
│   ├── index.ts         # Express server
│   ├── routes/
│   │   ├── scan.ts      # POST /scan endpoint
│   │   └── analyze.ts   # POST /analyze endpoint
│   ├── services/
│   │   ├── database.ts  # Prisma/SQLite operations
│   │   ├── github.ts    # GitHub API client
│   │   └── llm.ts       # LLM integration
│   └── types/
│       └── index.ts     # TypeScript interfaces
├── .env.example
├── package.json
└── README.md
```

## Prompts Used While Building

### AI Coding Tool Prompts

These are the prompts I used while building this project with AI assistance:

1. **Initial Setup**: "Create a Node.js + TypeScript backend server with Express that has two endpoints: POST /scan to fetch GitHub issues and POST /analyze to analyze them with an LLM"

2. **GitHub Integration**: "How do I use @octokit/rest to fetch all open issues from a repository with pagination?"

3. **Database Design**: "Design a Prisma schema for storing GitHub issues with fields for id, title, body, html_url, and created_at"

4. **Error Handling**: "Add proper error handling for rate limits and not found errors in the GitHub API"

### LLM Request Construction Prompts

The prompt template used in the `/analyze` endpoint (`llm.ts`):

```
You are an expert software analyst. Analyze the following GitHub issues and respond to the user's request.

USER REQUEST: {user's prompt}

GITHUB ISSUES:
{formatted issues with title, URL, date, and description}

Please provide a clear, structured analysis based on the issues above.
```

### Chunking Strategy (LangChain)

For large repositories with many issues, the system uses **LangChain's `RecursiveCharacterTextSplitter`** with:
- **Chunk size**: 25,000 characters (~6,250 tokens)
- **Chunk overlap**: 2,500 characters (10%) for context preservation
- **Separators**: `['\n---\n', '\n\n', '\n', ' ', '']` (splits by issue boundaries first)

Each chunk is summarized with:

```
Summarize the key themes, common problems, and notable issues in this batch (batch X of Y). Be concise.
```

Then combines summaries with:

```
Based on these summaries of GitHub issues from a repository, {user's original prompt}
```

## License

MIT
