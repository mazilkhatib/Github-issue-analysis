import { Router, Request, Response } from 'express';
import { getIssuesByRepo, hasRepoBeenScanned } from '../services/database';
import { analyzeIssues } from '../services/llm';
import { AnalyzeRequest, AnalyzeResponse, ErrorResponse } from '../types';

const router = Router();

/**
 * POST /analyze
 * Analyze cached issues for a repository using an LLM.
 */
router.post('/', async (req: Request<{}, AnalyzeResponse | ErrorResponse, AnalyzeRequest>, res: Response) => {
    try {
        const { repo, prompt } = req.body;

        // Validate request
        if (!repo || typeof repo !== 'string') {
            return res.status(400).json({
                error: 'Missing or invalid "repo" field',
                details: 'Expected format: "owner/repository-name"',
            });
        }

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({
                error: 'Missing or invalid "prompt" field',
                details: 'Please provide a natural-language prompt for analysis',
            });
        }

        // Check if repo has been scanned
        const hasBeenScanned = await hasRepoBeenScanned(repo);
        if (!hasBeenScanned) {
            return res.status(404).json({
                error: 'Repository not scanned',
                details: `Please scan the repository first using POST /scan with repo: "${repo}"`,
            });
        }

        // Get cached issues
        const issues = await getIssuesByRepo(repo);
        console.log(`Analyzing ${issues.length} issues for ${repo}`);

        if (issues.length === 0) {
            return res.json({
                analysis: 'No open issues found in this repository.',
            });
        }

        // Analyze with LLM
        const analysis = await analyzeIssues(prompt, issues);

        const response: AnalyzeResponse = {
            analysis,
        };

        return res.json(response);
    } catch (error: any) {
        console.error('Analysis error:', error.message);
        return res.status(500).json({
            error: 'Failed to analyze issues',
            details: error.message,
        });
    }
});

export default router;
