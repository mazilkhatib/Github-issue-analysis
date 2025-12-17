// Type definitions for the GitHub Issue Analysis API

export interface GitHubIssue {
    id: number;
    title: string;
    body: string | null;
    html_url: string;
    created_at: string;
}

export interface ScanRequest {
    repo: string; // Format: owner/repository-name
}

export interface ScanResponse {
    repo: string;
    issues_fetched: number;
    cached_successfully: boolean;
}

export interface AnalyzeRequest {
    repo: string;
    prompt: string;
}

export interface AnalyzeResponse {
    analysis: string;
}

export interface ErrorResponse {
    error: string;
    details?: string;
}
