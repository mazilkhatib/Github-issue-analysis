import { Router, Request, Response } from 'express';
import { fetchIssuesWithCursor, parseRepoString, RateLimitError, checkRateLimit } from '../services/github';
import {
    appendIssues,
    createOrResetScanProgress,
    getScanProgress,
    updateScanProgress,
    completeScan,
    setRateLimitRetry,
    getIssueCount,
} from '../services/database';
import { ScanRequest, ErrorResponse } from '../types';

const router = Router();

interface ScanResponse {
    repo: string;
    status: 'in_progress' | 'completed' | 'rate_limited';
    progress: {
        currentPage: number;
        issuesFetched: number;
    };
    message: string;
    nextCallAllowedAt?: string;
    rateLimit?: {
        remaining: number;
        limit: number;
        resetAt: string;
    };
}

/**
 * POST /scan
 * Burst mode with GraphQL cursor-based pagination (unlimited issues).
 */
router.post('/', async (req: Request<{}, ScanResponse | ErrorResponse, ScanRequest>, res: Response) => {
    try {
        const { repo, fresh } = req.body as ScanRequest & { fresh?: boolean };

        if (!repo || typeof repo !== 'string') {
            return res.status(400).json({
                error: 'Missing or invalid "repo" field',
                details: 'Expected format: "owner/repository-name"',
            });
        }

        let owner: string, repoName: string;
        try {
            const parsed = parseRepoString(repo);
            owner = parsed.owner;
            repoName = parsed.repo;
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }

        let progress = await getScanProgress(repo);

        if (!progress || fresh || progress.status === 'completed') {
            console.log(`Starting fresh scan for: ${owner}/${repoName}`);
            progress = await createOrResetScanProgress(repo);
        }

        // Check if rate limited
        if (progress.nextRetryAt && new Date() < progress.nextRetryAt) {
            const waitMs = progress.nextRetryAt.getTime() - Date.now();
            return res.status(429).json({
                repo,
                status: 'rate_limited',
                progress: { currentPage: progress.currentPage, issuesFetched: progress.issuesFetched },
                message: `Rate limited. ${progress.issuesFetched} issues saved. Wait ${Math.ceil(waitMs / 1000)}s.`,
                nextCallAllowedAt: progress.nextRetryAt.toISOString(),
            });
        }

        if (progress.nextRetryAt) {
            await updateScanProgress(repo, { nextRetryAt: null, errorMessage: null });
        }

        console.log(`🚀 Starting burst fetch for ${owner}/${repoName} (GraphQL cursor pagination)...`);

        let cursor = progress.cursor;
        let currentPage = progress.currentPage;
        let totalIssuesFetched = progress.issuesFetched;
        let hasMorePages = true;
        let rateLimited = false;
        let rateLimitError: RateLimitError | null = null;

        // Burst fetch with cursor-based pagination
        while (hasMorePages && !rateLimited) {
            currentPage++;

            try {
                console.log(`  Fetching page ${currentPage}${cursor ? ' (cursor: ' + cursor.slice(0, 10) + '...)' : ''}...`);
                const result = await fetchIssuesWithCursor(owner, repoName, cursor);

                if (result.issues.length > 0) {
                    await appendIssues(repo, result.issues);
                    totalIssuesFetched += result.issues.length;
                    console.log(`  ✓ Page ${currentPage}: ${result.issues.length} issues (total: ${totalIssuesFetched})`);
                }

                // Update progress with new cursor
                cursor = result.endCursor;
                await updateScanProgress(repo, {
                    currentPage,
                    issuesFetched: totalIssuesFetched,
                    cursor,
                });

                hasMorePages = result.hasNextPage;

            } catch (error: any) {
                if (error instanceof RateLimitError) {
                    rateLimited = true;
                    rateLimitError = error;
                    console.log(`  ⚠️ Rate limit hit at page ${currentPage}. ${totalIssuesFetched} issues saved.`);
                } else {
                    throw error;
                }
            }
        }

        const rateLimit = await checkRateLimit();

        if (rateLimited && rateLimitError) {
            await setRateLimitRetry(repo, rateLimitError.resetAt);

            return res.status(429).json({
                repo,
                status: 'rate_limited',
                progress: { currentPage, issuesFetched: totalIssuesFetched },
                message: `Rate limit reached. ${totalIssuesFetched} issues saved. Call again after reset.`,
                nextCallAllowedAt: rateLimitError.resetAt.toISOString(),
                rateLimit: { remaining: 0, limit: rateLimit.limit, resetAt: rateLimitError.resetAt.toISOString() },
            });
        }

        await completeScan(repo, totalIssuesFetched);
        console.log(`✅ Scan completed for ${owner}/${repoName}: ${totalIssuesFetched} issues`);

        return res.json({
            repo,
            status: 'completed',
            progress: { currentPage, issuesFetched: totalIssuesFetched },
            message: `Scan completed! Fetched ${totalIssuesFetched} open issues in ${currentPage} pages.`,
            rateLimit: { remaining: rateLimit.remaining, limit: rateLimit.limit, resetAt: rateLimit.resetAt.toISOString() },
        });

    } catch (error: any) {
        console.error('Scan error:', error.message);
        return res.status(500).json({ error: 'Failed to scan repository', details: error.message });
    }
});

/**
 * GET /scan/:repo/status
 */
router.get('/:repo/status', async (req: Request, res: Response) => {
    try {
        const repo = decodeURIComponent(req.params.repo);
        const progress = await getScanProgress(repo);

        if (!progress) {
            const issueCount = await getIssueCount(repo);
            if (issueCount > 0) {
                return res.json({
                    repo,
                    status: 'completed',
                    progress: { currentPage: 0, issuesFetched: issueCount },
                    message: `Repository has ${issueCount} cached issues.`,
                });
            }
            return res.status(404).json({
                error: 'No scan found',
                details: 'POST to /scan with {"repo": "owner/repo"}',
            });
        }

        let nextCallAllowedAt: string | undefined;
        if (progress.nextRetryAt && new Date() < progress.nextRetryAt) {
            nextCallAllowedAt = progress.nextRetryAt.toISOString();
        }

        return res.json({
            repo,
            status: nextCallAllowedAt ? 'rate_limited' : progress.status,
            progress: { currentPage: progress.currentPage, issuesFetched: progress.issuesFetched },
            message: progress.errorMessage || `${progress.issuesFetched} issues fetched.`,
            nextCallAllowedAt,
        });
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to get status', details: error.message });
    }
});

export default router;
