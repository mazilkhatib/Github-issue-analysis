import { OpenRouter } from '@openrouter/sdk';
import { Issue } from '@prisma/client';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

// Ollama API endpoint (local)
const OLLAMA_API_URL = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Initialize OpenRouter (fallback)
const openRouter = process.env.OPENROUTER_API_KEY
    ? new OpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
    })
    : null;

// Initialize LangChain text splitter with overlap for better context preservation
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 25000,      // ~6250 tokens (assuming 4 chars per token)
    chunkOverlap: 2500,    // 10% overlap to preserve context at boundaries
    separators: ['\n---\n', '\n\n', '\n', ' ', ''], // Split by issue separator first
});

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Estimate token count for a string (rough approximation).
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Format issues into a readable text for LLM analysis.
 */
function formatIssuesForLLM(issues: Issue[]): string {
    return issues.map((issue, index) => {
        const body = issue.body
            ? issue.body.substring(0, 300) + (issue.body.length > 300 ? '...' : '')
            : 'No description';

        return `## Issue ${index + 1}: ${issue.title}
URL: ${issue.htmlUrl}
Created: ${issue.createdAt.toISOString().split('T')[0]}
Description: ${body}
`;
    }).join('\n---\n');
}

/**
 * Chunk text using LangChain's RecursiveCharacterTextSplitter.
 * This provides semantic-aware splitting with overlap for better context preservation.
 */
async function chunkText(text: string): Promise<string[]> {
    return await textSplitter.splitText(text);
}

/**
 * Build the analysis prompt
 */
function buildPrompt(userPrompt: string, issuesText: string): string {
    return `You are an expert software analyst. Analyze the following GitHub issues and respond to the user's request.

USER REQUEST: ${userPrompt}

GITHUB ISSUES:
${issuesText}

Please provide a clear, structured analysis based on the issues above.`;
}

/**
 * Analyze issues using Ollama (local DeepSeek R1)
 */
async function analyzeWithOllama(prompt: string, issuesText: string): Promise<string> {
    const fullPrompt = buildPrompt(prompt, issuesText);

    // Use the model name from env or default to deepseek-r1
    const model = process.env.OLLAMA_MODEL || 'deepseek-r1';

    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'user', content: fullPrompt }
            ],
            stream: false,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama error: ${error}`);
    }

    const data = await response.json() as {
        message: { content: string };
    };

    if (!data.message?.content) {
        throw new Error('Ollama returned empty response');
    }

    return data.message.content;
}

/**
 * Analyze issues using OpenRouter (fallback)
 */
async function analyzeWithOpenRouter(prompt: string, issuesText: string): Promise<string> {
    if (!openRouter) {
        throw new Error('OpenRouter API key not configured');
    }

    const fullPrompt = buildPrompt(prompt, issuesText);

    // Using DeepSeek v3.1 NEX N1 (free model)
    const completion = await openRouter.chat.send({
        model: 'nex-agi/deepseek-v3.1-nex-n1:free',
        messages: [
            { role: 'user', content: fullPrompt }
        ],
        stream: false,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
        throw new Error('OpenRouter returned empty or invalid response');
    }
    return content;
}

/**
 * Main analysis function with provider fallback:
 * Ollama (local) -> OpenRouter (cloud)
 * Uses LangChain's RecursiveCharacterTextSplitter for chunking large datasets.
 */
export async function analyzeIssues(prompt: string, issues: Issue[]): Promise<string> {
    if (issues.length === 0) {
        return 'No issues to analyze.';
    }

    const issuesText = formatIssuesForLLM(issues);
    const totalTokens = estimateTokens(issuesText);

    console.log(`Total issues: ${issues.length}, estimated tokens: ${totalTokens}`);

    // If issues fit in one request, analyze directly
    if (totalTokens < 40000) {
        return await analyzeWithProvider(prompt, issuesText);
    }

    // Otherwise, use LangChain's text splitter for semantic-aware chunking with overlap
    console.log('Large dataset detected. Using LangChain chunked analysis with overlap...');
    const chunks = await chunkText(issuesText);
    console.log(`Split into ${chunks.length} chunks using RecursiveCharacterTextSplitter`);

    const summaries: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunkTokens = estimateTokens(chunks[i]);
        console.log(`Processing chunk ${i + 1}/${chunks.length} (~${chunkTokens} tokens)...`);

        const chunkPrompt = `Summarize the key themes, common problems, and notable issues in this batch (batch ${i + 1} of ${chunks.length}). Be concise.`;

        const summary = await analyzeWithProvider(chunkPrompt, chunks[i]);
        summaries.push(`Batch ${i + 1} Summary:\n${summary}`);

        if (i < chunks.length - 1) {
            console.log('Waiting 2 seconds before next chunk...');
            await sleep(2000);
        }
    }

    console.log('Generating final analysis...');
    await sleep(1000);

    const combinedSummaries = summaries.join('\n\n---\n\n');
    const finalPrompt = `Based on these summaries of GitHub issues from a repository, ${prompt}`;

    return await analyzeWithProvider(finalPrompt, combinedSummaries);
}

/**
 * Try providers in order: OpenRouter (cloud) -> Ollama (local)
 * NOTE: OpenRouter set as primary for testing. Swap back to Ollama-first for production.
 */
async function analyzeWithProvider(prompt: string, issuesText: string): Promise<string> {
    const errors: string[] = [];

    // 1. Try OpenRouter first (for testing)
    if (process.env.OPENROUTER_API_KEY) {
        try {
            console.log('Using OpenRouter (cloud)...');
            return await analyzeWithOpenRouter(prompt, issuesText);
        } catch (error: any) {
            console.error('OpenRouter error:', error.message);
            errors.push(`OpenRouter: ${error.message}`);
        }
    }

    // 2. Fall back to Ollama (local)
    try {
        console.log('Falling back to Ollama (local)...');
        return await analyzeWithOllama(prompt, issuesText);
    } catch (error: any) {
        console.error('Ollama error:', error.message);
        errors.push(`Ollama: ${error.message}`);
    }

    throw new Error(`All LLM providers failed:\n${errors.join('\n')}`);
}
