import { Octokit } from '@octokit/rest';
import { GitHubIssue } from '../types';

// Initialize Octokit with optional auth token
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
});

/**
 * Fetch all open issues from a GitHub repository.
 * Handles pagination automatically.
 */
export async function fetchOpenIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    const issues: GitHubIssue[] = [];

    try {
        // Use pagination to fetch all open issues
        const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
            owner,
            repo,
            state: 'open',
            per_page: 100,
        });

        for await (const response of iterator) {
            for (const issue of response.data) {
                // Skip pull requests (they also appear in issues endpoint)
                if (issue.pull_request) {
                    continue;
                }

                issues.push({
                    id: issue.id,
                    title: issue.title,
                    body: issue.body ?? null,
                    html_url: issue.html_url,
                    created_at: issue.created_at,
                });
            }
        }

        return issues;
    } catch (error: any) {
        if (error.status === 404) {
            throw new Error(`Repository '${owner}/${repo}' not found`);
        }
        if (error.status === 403 && error.message.includes('rate limit')) {
            throw new Error('GitHub API rate limit exceeded. Please try again later or provide a GITHUB_TOKEN.');
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
