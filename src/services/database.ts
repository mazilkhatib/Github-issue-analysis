import { PrismaClient } from '@prisma/client';
import { GitHubIssue } from '../types';

const prisma = new PrismaClient();

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

export { prisma };
