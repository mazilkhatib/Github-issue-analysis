<div align="center">

# GitHub Issue Analysis Backend

**AI-powered repository intelligence at scale**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)

A powerful backend server that fetches GitHub issues and analyzes them using Large Language Models. Perfect for maintainers, contributors, and researchers who need insights into repository activity.

[Features](#-features) • [Quick Start](#-quick-start) • [API Documentation](#-api-documentation) • [Contributing](#-contributing)

</div>

---

## ✨ Features

- **🚀 High-Performance Scanning** - Fetch and cache all open issues with progressive scanning and cursor-based GraphQL pagination
- **🧠 Intelligent Analysis** - Natural language processing powered by OpenRouter (cloud) and Ollama (local)
- **📊 Unlimited Scale** - No 10k issue limit thanks to GraphQL pagination
- **⚡ Rate Limit Optimized** - GitHub App authentication provides 5,000 requests/hour (vs 60 unauthenticated)
- **💾 Persistent Storage** - SQLite database with Prisma ORM for reliable data persistence
- **🔄 Smart Context Handling** - LangChain-powered text chunking with 10% overlap for large repositories

## 🎯 Use Cases

- **Maintainers**: Identify common issues, track themes, prioritize roadmap
- **Contributors**: Understand project patterns before contributing
- **Researchers**: Analyze open source trends and community health
- **Teams**: Get insights into competitor or dependency repositories

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js + TypeScript |
| **Framework** | Express.js |
| **Database** | SQLite + Prisma ORM |
| **AI/LLM** | OpenRouter (primary) / Ollama (fallback) |
| **Text Processing** | LangChain RecursiveCharacterTextSplitter |
| **GitHub API** | GraphQL + REST with GitHub App auth |

## 💡 Why SQLite + Prisma?

This project uses SQLite over in-memory or JSON file storage for several reasons:

1. **🔒 Durability** - Data persists across server restarts and crashes
2. **⚡ Performance** - Fast queries even with thousands of issues
3. **🛡️ Type Safety** - Prisma provides auto-generated TypeScript types
4. **💾 Easy Backup** - Single `.db` file to backup and restore
5. **🚀 Zero Configuration** - No external database server required

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn package manager

### 1️⃣ Clone and Install

```bash
git clone https://github.com/yourusername/github-issue-analysis.git
cd github-issue-analysis
npm install
```

### 2️⃣ Environment Setup

```bash
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
# Required: LLM Provider
OPENROUTER_API_KEY=your_openrouter_key

# Optional: Local LLM (fallback)
OLLAMA_HOST=http://localhost:11434

# Optional: GitHub Authentication
GITHUB_TOKEN=your_github_token

# Or use GitHub App (recommended for large repos)
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY_PATH=./github-app-private-key.pem
GITHUB_APP_INSTALLATION_ID=your_installation_id
```

### 3️⃣ Get API Keys

**OpenRouter API Key** (Required):
- Visit [OpenRouter](https://openrouter.ai/keys)
- Create an account and generate an API key
- Add it to your `.env` file

**GitHub Token** (Optional - 60 req/hour):
- Go to GitHub Settings → Developer settings → Personal access tokens
- Generate new token with `repo:status` scope

### 4️⃣ GitHub App Setup (Recommended)

For scanning large repositories (10,000+ issues), set up a GitHub App for **5,000 req/hour**:

1. **Create GitHub App** at https://github.com/settings/apps/new
   - App name: `GitHub Issue Analyzer` (or choose unique name)
   - Homepage URL: `http://localhost:3000`
   - Webhook: **Uncheck** "Active"
   - Permissions: `Issues` → Read-only, `Metadata` → Read-only

2. **Generate Credentials**
   - Note the **App ID** from the app page
   - Generate and download a **Private Key** (.pem file)
   - Save the .pem file as `github-app-private-key.pem` in project root

3. **Install the App**
   - Go to https://github.com/settings/installations
   - Install your app on your account or target repositories
   - Note the **Installation ID** from the URL

4. **Update `.env`**:
   ```env
   GITHUB_APP_ID=your_app_id
   GITHUB_APP_PRIVATE_KEY_PATH=./github-app-private-key.pem
   GITHUB_APP_INSTALLATION_ID=your_installation_id
   ```

### 5️⃣ Initialize Database

```bash
npm run db:push
```

### 6️⃣ Start the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

The server will start at `http://localhost:3000`

---

## 📚 API Documentation

### Scan Repository

Fetches and caches all open issues from a repository.

```bash
# Start or resume a scan
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo": "facebook/react"}'

# Force fresh scan (clears cached data)
curl -X POST http://localhost:3000/scan \
  -H "Content-Type: application/json" \
  -d '{"repo": "facebook/react", "fresh": true}'
```

**Response:**
```json
{
  "repo": "facebook/react",
  "status": "completed",
  "progress": {
    "currentPage": 15,
    "issuesFetched": 842
  },
  "message": "Scan completed! Fetched 842 open issues.",
  "rateLimit": {
    "remaining": 4985,
    "limit": 5000,
    "resetAt": "2024-01-15T12:34:56Z"
  }
}
```

### Check Scan Status

Monitor the progress of an ongoing scan.

```bash
curl http://localhost:3000/scan/facebook%2Freact/status
```

**Response:**
```json
{
  "repo": "facebook/react",
  "status": "in_progress",
  "progress": {
    "currentPage": 42,
    "issuesFetched": 2100,
    "hasNextPage": true
  }
}
```

### Analyze Issues

Analyze cached issues using natural language queries.

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "facebook/react",
    "prompt": "What are the top 5 most common issue themes?"
  }'
```

**Response:**
```json
{
  "analysis": "Based on the issues analyzed, here are the top 5 themes:\n\n1. Hooks-related questions (23%)\n2. TypeScript integration issues (18%)\n3. Performance optimization (15%)\n4. State management patterns (12%)\n5. Testing challenges (10%)",
  "issuesAnalyzed": 842,
  "provider": "openrouter"
}
```

---

## 🏗️ How It Works

### Architecture Overview

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Client    │─────▶│   Express   │─────▶│  Database   │
└─────────────┘      └─────────────┘      │   (SQLite)  │
                           │              └─────────────┘
                           ▼
                    ┌─────────────┐
                    │   Services  │
                    ├─────────────┤
                    │  • GitHub   │─────▶ GitHub API
                    │  • Database │
                    │  • LLM      │─────▶ OpenRouter/Ollama
                    └─────────────┘
```

### Chunking Strategy

For large repositories with thousands of issues, the system uses **LangChain's `RecursiveCharacterTextSplitter`** to handle LLM context limitations:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **Chunk Size** | 25,000 chars (~6,250 tokens) | Fits within LLM context windows |
| **Chunk Overlap** | 2,500 chars (10%) | Preserves context between chunks |
| **Separators** | `['\n---\n', '\n\n', '\n', ' ', '']` | Respects issue boundaries |

**Two-Stage Analysis Process:**

1. **Per-Chunk Summary**: Each chunk is analyzed independently:
   ```
   Summarize the key themes, common problems, and notable issues
   in this batch (batch X of Y). Be concise.
   ```

2. **Final Synthesis**: All summaries are combined and analyzed:
   ```
   Based on these summaries of GitHub issues from a repository,
   {user's original prompt}
   ```

This approach enables accurate analysis of repositories with tens of thousands of issues while maintaining context and quality.

---

## 📁 Project Structure

```
github-issue-analysis/
├── prisma/
│   └── schema.prisma          # Database schema and models
├── src/
│   ├── index.ts               # Express server setup
│   ├── routes/
│   │   ├── scan.ts            # POST /scan endpoint
│   │   └── analyze.ts         # POST /analyze endpoint
│   ├── services/
│   │   ├── database.ts        # Prisma/SQLite operations
│   │   ├── github.ts          # GitHub API client (GraphQL + REST)
│   │   └── llm.ts             # LLM integration (OpenRouter/Ollama)
│   └── types/
│       └── index.ts           # TypeScript type definitions
├── .env.example               # Environment variables template
├── package.json
└── README.md
```

---

## ❓ FAQ

### Q: Can I analyze private repositories?

**A:** Yes! If you set up GitHub App authentication and install it on your private repositories, the tool can access and analyze private issues.

### Q: What's the maximum number of issues that can be analyzed?

**A:** There's no hard limit. The GraphQL pagination and chunking strategy enable analysis of repositories with tens of thousands of issues.

### Q: Can I use a different LLM provider?

**A:** Currently, OpenRouter (cloud) and Ollama (local) are supported. Additional providers can be added by extending the `llm.ts` service.

### Q: How much does it cost to run?

**A:**
- **OpenRouter**: Costs vary by model used. Check [OpenRouter pricing](https://openrouter.ai/docs#models)
- **Ollama**: Free if running locally (requires sufficient RAM)
- **GitHub API**: Free tier includes 5,000 req/hour with GitHub App

### Q: Is my data secure?

**A:** Yes. All data is stored locally in SQLite. Issue content is only sent to LLM providers you configure. We don't collect or transmit any data externally.

---

## 🐛 Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `Repository not scanned` | Calling `/analyze` before `/scan` | Run `/scan` endpoint first |
| `Repository not found` | Invalid repository name | Use `owner/repo` format (e.g., `facebook/react`) |
| `Rate limit exceeded` | Too many API requests | Set up GitHub App for higher limits |
| `All LLM providers failed` | No API key + Ollama unavailable | Add `OPENROUTER_API_KEY` or start Ollama |
| `Database error` | SQLite file missing or corrupted | Run `npm run db:push` to reinitialize |

---

## 🤝 Contributing

We love contributions! Here's how you can help:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Write tests (if applicable)
5. Commit with conventional commits: `git commit -m "feat: add amazing feature"`
6. Push to your branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- **Code Style**: Follow existing TypeScript conventions
- **Testing**: Add tests for new features and bug fixes
- **Documentation**: Update README, API docs, and comments
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) format:
  - `feat:` - New features
  - `fix:` - Bug fixes
  - `docs:` - Documentation changes
  - `refactor:` - Code refactoring
  - `test:` - Adding or updating tests

### Areas for Contribution

- **🧠 Additional LLM Providers**: Support for more AI services (Anthropic, Cohere, etc.)
- **📊 Enhanced Analysis**: Sentiment analysis, issue clustering, trend detection
- **🎨 UI/Frontend**: Web dashboard for browsing and analyzing issues
- **⚡ Performance**: Caching optimizations, database indexing, parallel processing
- **🧪 Testing**: Unit tests, integration tests, E2E tests
- **📖 Documentation**: API docs, tutorials, examples, blog posts
- **🌍 Internationalization**: Multi-language support
- **🔔 Notifications**: Webhook support for issue updates

### Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together. Harassment or disrespectful behavior will not be tolerated.

---

## 🙏 Acknowledgments

Built with amazing open source tools:

- [**Express.js**](https://expressjs.com/) - Fast, minimalist web framework
- [**Prisma**](https://www.prisma.io/) - Next-generation TypeScript ORM
- [**LangChain**](https://langchain.com/) - Framework for LLM applications
- [**Octokit**](https://github.com/octokit) - GitHub API client library
- [**OpenRouter**](https://openrouter.ai/) - Unified API for LLM access
- [**Ollama**](https://ollama.ai/) - Local LLM inference

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📮 Support

- **🐛 Bug Reports**: [Open an issue](https://github.com/mazilkhatib/Github-issue-analysis/issues/new?template=bug_report.md)
- **💡 Feature Requests**: [Open an issue](https://github.com/mazilkhatib/Github-issue-analysis/issues/new?template=feature_request.md)
- **❓ Questions**: [Start a discussion](https://github.com/mazilkhatib/Github-issue-analysis/discussions)

---

<div align="center">

**⭐ Star this repo if it helped you!**

Made with ❤️ by the open source community

[⬆ Back to Top](#github-issue-analysis-backend)

</div>
