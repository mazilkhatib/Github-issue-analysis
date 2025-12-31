import { PrismaClient, ScanProgress } from '@prisma/client';
import { GitHubIssue } from '../types';

const prisma = new PrismaClient();

// Scan status types
export type ScanStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Save issues to the database for a given repository.
 * Clears existing issues for the repo before inserting new ones.
 */
export async function saveIssues(repo: string, issues: GitHubIssue[]): Promise<number> {
    // Clear existing issues for this repo
    await prisma.issue.deleteMany({
        where: { repo },
    });

    // Insert new issues
    const created = await prisma.issue.createMany({
        data: issues.map((issue) => ({
            repo,
            githubId: BigInt(issue.id),
            title: issue.title,
            body: issue.body,
            htmlUrl: issue.html_url,
            createdAt: new Date(issue.created_at),
        })),
    });

    return created.count;
}

/**
 * Append issues to the database without clearing existing ones.
 * Used for progressive scanning.
 */
export async function appendIssues(repo: string, issues: GitHubIssue[]): Promise<number> {
    if (issues.length === 0) return 0;

    // Use upsert to handle duplicates gracefully
    let count = 0;
    for (const issue of issues) {
        await prisma.issue.upsert({
            where: {
                repo_githubId: {
                    repo,
                    githubId: BigInt(issue.id),
                },
            },
            update: {
                title: issue.title,
                body: issue.body,
                htmlUrl: issue.html_url,
                createdAt: new Date(issue.created_at),
            },
            create: {
                repo,
                githubId: BigInt(issue.id),
                title: issue.title,
                body: issue.body,
                htmlUrl: issue.html_url,
                createdAt: new Date(issue.created_at),
            },
        });
        count++;
    }

    return count;
}

/**
 * Get all cached issues for a given repository.
 */
export async function getIssuesByRepo(repo: string) {
    return prisma.issue.findMany({
        where: { repo },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Check if a repository has been scanned.
 */
export async function hasRepoBeenScanned(repo: string): Promise<boolean> {
    const count = await prisma.issue.count({
        where: { repo },
    });
    return count > 0;
}

/**
 * Get issue count for a repository.
 */
export async function getIssueCount(repo: string): Promise<number> {
    return prisma.issue.count({
        where: { repo },
    });
}

// ============================================
// Scan Progress Tracking Functions
// ============================================

/**
 * Create or reset scan progress for a repository.
 * If a scan already exists, it will be reset to start fresh.
 */
export async function createOrResetScanProgress(repo: string): Promise<ScanProgress> {
    // Clear existing issues when starting fresh
    await prisma.issue.deleteMany({
        where: { repo },
    });

    return prisma.scanProgress.upsert({
        where: { repo },
        update: {
            status: 'in_progress',
            currentPage: 0,
            issuesFetched: 0,
            totalPages: null,
            errorMessage: null,
            nextRetryAt: null,
            startedAt: new Date(),
        },
        create: {
            repo,
            status: 'in_progress',
            currentPage: 0,
            issuesFetched: 0,
        },
    });
}

/**
 * Get current scan progress for a repository.
 */
export async function getScanProgress(repo: string): Promise<ScanProgress | null> {
    return prisma.scanProgress.findUnique({
        where: { repo },
    });
}

/**
 * Update scan progress after fetching a page.
 */
export async function updateScanProgress(
    repo: string,
    updates: {
        currentPage?: number;
        issuesFetched?: number;
        totalPages?: number | null;
        status?: ScanStatus;
        errorMessage?: string | null;
        nextRetryAt?: Date | null;
        cursor?: string | null;
    }
): Promise<ScanProgress> {
    return prisma.scanProgress.update({
        where: { repo },
        data: updates,
    });
}

/**
 * Mark scan as completed.
 */
export async function completeScan(repo: string, totalIssues: number): Promise<ScanProgress> {
    return prisma.scanProgress.update({
        where: { repo },
        data: {
            status: 'completed',
            issuesFetched: totalIssues,
            errorMessage: null,
            nextRetryAt: null,
        },
    });
}

/**
 * Mark scan as failed.
 */
export async function failScan(repo: string, errorMessage: string): Promise<ScanProgress> {
    return prisma.scanProgress.update({
        where: { repo },
        data: {
            status: 'failed',
            errorMessage,
        },
    });
}

/**
 * Set rate limit retry time.
 */
export async function setRateLimitRetry(repo: string, retryAt: Date): Promise<ScanProgress> {
    return prisma.scanProgress.update({
        where: { repo },
        data: {
            nextRetryAt: retryAt,
            errorMessage: `Rate limited. Retry after ${retryAt.toISOString()}`,
        },
    });
}

/**
 * Delete scan progress (for cleanup).
 */
export async function deleteScanProgress(repo: string): Promise<void> {
    await prisma.scanProgress.deleteMany({
        where: { repo },
    });
}

export { prisma };
