# GitHub Issue Analysis Backend

A backend server that fetches GitHub issues and analyzes them using LLMs.

## Features

- **POST /scan** - Fetch and cache all open issues with progressive scanning
- **POST /analyze** - Analyze cached issues using natural language prompts
- **GraphQL pagination** - Unlimited issue fetching (no 10k limit)
- **GitHub App auth** - 5,000 requests/hour (vs 60 unauthenticated)

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
- `OLLAMA_HOST` (optional) - Ollama server URL for local fallback
- `GITHUB_TOKEN` (optional) - For 5,000 req/hour (or use GitHub App below)

### 3. GitHub App Setup (Recommended - 5,000 req/hour)

For scanning large repositories (10,000+ issues), set up a GitHub App:

1. **Create the App** at https://github.com/settings/apps/new
   - App Name: `GitHub Issue Analyzer` (or unique name)
   - Homepage URL: `http://localhost:3000`
   - Webhook: Uncheck "Active"
   - Permissions: `Issues` → Read-only, `Metadata` → Read-only

2. **Get Credentials**
   - Note the **App ID** from the app page
   - Generate and download a **Private Key** (.pem file)
   - Save the .pem file in your project root as `github-app-private-key.pem`

3. **Install the App**
   - Go to https://github.com/settings/installations
   - Install your app on your account/repos
   - Note the **Installation ID** from the URL

4. **Configure .env**
   ```env
   GITHUB_APP_ID=your_app_id
   GITHUB_APP_PRIVATE_KEY_PATH=./github-app-private-key.pem
   GITHUB_APP_INSTALLATION_ID=your_installation_id
   ```

### 4. Initialize Database

```bash
npm run db:push
```

### 5. Start Server

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
# Start/resume a scan
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo": "facebook/react"}'

# Force fresh scan (clears old data)
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo": "facebook/react", "fresh": true}'
```

**Response:**
```json
{
  "repo": "facebook/react",
  "status": "completed",
  "progress": { "currentPage": 15, "issuesFetched": 842 },
  "message": "Scan completed! Fetched 842 open issues.",
  "rateLimit": { "remaining": 4985, "limit": 5000 }
}
```

### Check Scan Status

```bash
curl http://localhost:3000/scan/facebook%2Freact/status
```

### Analyze Issues

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "facebook/react",
    "prompt": "What are the top 5 most common issue themes?"
  }'
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Repository not scanned` | Calling /analyze before /scan | Run /scan first |
| `Repository not found` | Invalid repo name | Check owner/repo format |
| `Rate limit exceeded` | Too many API calls | Set up GitHub App |
| `All LLM providers failed` | No API key + Ollama not running | Add OPENROUTER_API_KEY |

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

## How It Works

### Chunking Strategy

For large repositories with many issues, the system uses **LangChain's `RecursiveCharacterTextSplitter`** to handle context limitations:

- **Chunk size**: 25,000 characters (~6,250 tokens)
- **Chunk overlap**: 2,500 characters (10%) for context preservation
- **Separators**: `['\n---\n', '\n\n', '\n', ' ', '']` (splits by issue boundaries first)

The analysis process works in two stages:

1. **Per-chunk summary**: Each chunk is analyzed with the prompt:
   ```
   Summarize the key themes, common problems, and notable issues in this batch (batch X of Y). Be concise.
   ```

2. **Final synthesis**: All chunk summaries are combined and analyzed with:
   ```
   Based on these summaries of GitHub issues from a repository, {user's original prompt}
   ```

This approach enables analysis of repositories with thousands of issues while maintaining context and accuracy.

## Contributing

We welcome contributions! Here are some ways you can help:

### Reporting Issues

- Search existing issues before creating new ones
- Include steps to reproduce, expected behavior, and actual behavior
- Provide environment details (OS, Node version, etc.)

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and ensure tests pass
4. Commit with clear, descriptive messages
5. Push to your branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Development Guidelines

- **Code Style**: Follow existing TypeScript conventions
- **Testing**: Add tests for new features
- **Documentation**: Update README and API docs as needed
- **Commits**: Use conventional commit messages (feat:, fix:, docs:, etc.)

### Areas for Contribution

- **Additional LLM providers**: Support for more AI services
- **Enhanced analysis**: Sentiment analysis, issue clustering, trend detection
- **UI/Frontend**: Web dashboard for browsing and analyzing issues
- **Performance**: Caching optimizations, database indexing
- **Testing**: Unit tests, integration tests, E2E tests
- **Documentation**: API docs, tutorials, examples

### Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together.

## License

MIT
