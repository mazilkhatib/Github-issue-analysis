import { Router, Request, Response } from 'express';
import { fetchOpenIssues, parseRepoString } from '../services/github';
import { saveIssues } from '../services/database';
import { ScanRequest, ScanResponse, ErrorResponse } from '../types';

const router = Router();

/**
 * POST /scan
 * Fetch all open issues from a GitHub repository and cache them locally.
 */
router.post('/', async (req: Request<{}, ScanResponse | ErrorResponse, ScanRequest>, res: Response) => {
    try {
        const { repo } = req.body;

        // Validate request
        if (!repo || typeof repo !== 'string') {
            return res.status(400).json({
                error: 'Missing or invalid "repo" field',
                details: 'Expected format: "owner/repository-name"',
            });
        }

        // Parse repo string
        let owner: string, repoName: string;
        try {
            const parsed = parseRepoString(repo);
            owner = parsed.owner;
            repoName = parsed.repo;
        } catch (error: any) {
            return res.status(400).json({
                error: error.message,
            });
        }

        console.log(`Scanning repository: ${owner}/${repoName}`);

        // Fetch issues from GitHub
        const issues = await fetchOpenIssues(owner, repoName);
        console.log(`Fetched ${issues.length} open issues`);

        // Save to database
        const savedCount = await saveIssues(repo, issues);
        console.log(`Cached ${savedCount} issues`);

        // Return response
        const response: ScanResponse = {
            repo,
            issues_fetched: issues.length,
            cached_successfully: true,
        };

        return res.json(response);
    } catch (error: any) {
        console.error('Scan error:', error.message);
        return res.status(500).json({
            error: 'Failed to scan repository',
            details: error.message,
        });
    }
});

export default router;
