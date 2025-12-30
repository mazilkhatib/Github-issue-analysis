import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import fs from 'fs';
import path from 'path';
import { GitHubIssue } from '../types';

/**
 * Rate limit information from GitHub API
 */
export interface RateLimitInfo {
    remaining: number;
    limit: number;
    resetAt: Date;
    waitMs: number;
}

/**
 * Result of fetching issues with cursor
 */
export interface CursorFetchResult {
    issues: GitHubIssue[];
    hasNextPage: boolean;
    endCursor: string | null;
}

/**
 * Custom error for rate limit exceeded
 */
export class RateLimitError extends Error {
    waitMs: number;
    resetAt: Date;

    constructor(waitMs: number, resetAt: Date) {
        super(`Rate limit exceeded. Retry after ${Math.ceil(waitMs / 1000)} seconds.`);
        this.name = 'RateLimitError';
        this.waitMs = waitMs;
        this.resetAt = resetAt;
    }
}

/**
 * Create Octokit instance with the best available authentication
 */
function createOctokit(): Octokit {
    if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY_PATH) {
        try {
            const privateKeyPath = path.resolve(process.env.GITHUB_APP_PRIVATE_KEY_PATH);
            const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');

            console.log('🔐 Using GitHub App authentication (5,000 req/hour)');

            return new Octokit({
                authStrategy: createAppAuth,
                auth: {
                    appId: process.env.GITHUB_APP_ID,
                    privateKey,
                    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
                },
            });
        } catch (error: any) {
            console.error('Failed to load GitHub App credentials:', error.message);
        }
    }

    if (process.env.GITHUB_TOKEN) {
        console.log('🔑 Using GitHub Token authentication (5,000 req/hour)');
        return new Octokit({ auth: process.env.GITHUB_TOKEN });
    }

    console.log('⚠️  Using unauthenticated access (60 req/hour)');
    return new Octokit();
}

// Lazy initialization
let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
    if (!_octokit) {
        _octokit = createOctokit();
    }
    return _octokit;
}

/**
 * GraphQL query for fetching issues with cursor-based pagination
 */
const ISSUES_QUERY = `
query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, states: OPEN, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        databaseId
        title
        body
        url
        createdAt
      }
    }
  }
  rateLimit {
    remaining
    limit
    resetAt
  }
}
`;

/**
 * Check current rate limit status
 */
export async function checkRateLimit(): Promise<RateLimitInfo> {
    try {
        const { data } = await getOctokit().rest.rateLimit.get();
        const core = data.resources.core;
        const resetAt = new Date(core.reset * 1000);
        const waitMs = Math.max(0, resetAt.getTime() - Date.now());

        return { remaining: core.remaining, limit: core.limit, resetAt, waitMs };
    } catch (error: any) {
        return {
            remaining: 10,
            limit: 60,
            resetAt: new Date(Date.now() + 3600000),
            waitMs: 3600000,
        };
    }
}

/**
 * Fetch issues using GraphQL with cursor-based pagination.
 * This supports unlimited pagination (no 100-page limit).
 */
export async function fetchIssuesWithCursor(
    owner: string,
    repo: string,
    cursor: string | null = null
): Promise<CursorFetchResult> {
    const octokit = getOctokit();

    try {
        const response: any = await octokit.graphql(ISSUES_QUERY, {
            owner,
            repo,
            cursor,
        });

        const rateLimit = response.rateLimit;
        console.log(`Rate limit: ${rateLimit.remaining}/${rateLimit.limit} remaining`);

        if (rateLimit.remaining < 3) {
            const resetAt = new Date(rateLimit.resetAt);
            const waitMs = resetAt.getTime() - Date.now();
            throw new RateLimitError(waitMs, resetAt);
        }

        const issues: GitHubIssue[] = response.repository.issues.nodes.map((node: any) => ({
            id: node.databaseId,
            title: node.title,
            body: node.body,
            html_url: node.url,
            created_at: node.createdAt,
        }));

        return {
            issues,
            hasNextPage: response.repository.issues.pageInfo.hasNextPage,
            endCursor: response.repository.issues.pageInfo.endCursor,
        };
    } catch (error: any) {
        if (error.name === 'RateLimitError') {
            throw error;
        }
        if (error.status === 404 || error.message?.includes('Could not resolve')) {
            throw new Error(`Repository '${owner}/${repo}' not found`);
        }
        if (error.message?.includes('rate limit')) {
            const resetAt = new Date(Date.now() + 3600000);
            throw new RateLimitError(resetAt.getTime() - Date.now(), resetAt);
        }
        throw new Error(`Failed to fetch issues: ${error.message}`);
    }
}

/**
 * Legacy REST API function (kept for compatibility, but limited to ~10k issues)
 */
export async function fetchIssuePage(
    owner: string,
    repo: string,
    page: number,
    perPage: number = 100
): Promise<{ issues: GitHubIssue[]; hasNextPage: boolean }> {
    const rateLimit = await checkRateLimit();
    console.log(`Rate limit: ${rateLimit.remaining}/${rateLimit.limit} remaining`);

    if (rateLimit.remaining < 3) {
        throw new RateLimitError(rateLimit.waitMs, rateLimit.resetAt);
    }

    try {
        const response = await getOctokit().rest.issues.listForRepo({
            owner,
            repo,
            state: 'open',
            per_page: perPage,
            page,
        });

        const issues: GitHubIssue[] = response.data
            .filter((issue: any) => !issue.pull_request)
            .map((issue: any) => ({
                id: issue.id,
                title: issue.title,
                body: issue.body ?? null,
                html_url: issue.html_url,
                created_at: issue.created_at,
            }));

        const linkHeader = response.headers.link || '';
        const hasNextPage = linkHeader.includes('rel="next"');

        return { issues, hasNextPage };
    } catch (error: any) {
        if (error.status === 404) {
            throw new Error(`Repository '${owner}/${repo}' not found`);
        }
        if (error.message?.includes('cursor based pagination')) {
            throw new Error('PAGE_LIMIT_EXCEEDED');
        }
        throw new Error(`Failed to fetch issues: ${error.message}`);
    }
}

/**
 * Parse a repo string in format "owner/repo" into separate parts.
 */
export function parseRepoString(repoString: string): { owner: string; repo: string } {
    const parts = repoString.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error('Invalid repo format. Expected "owner/repository-name"');
    }
    return { owner: parts[0], repo: parts[1] };
}
