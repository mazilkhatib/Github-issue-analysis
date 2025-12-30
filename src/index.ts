import dotenv from 'dotenv';
// Load environment variables FIRST, before any other imports
dotenv.config();

import express from 'express';
import scanRouter from './routes/scan';
import analyzeRouter from './routes/analyze';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/scan', scanRouter);
app.use('/analyze', analyzeRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'GitHub Issue Analysis API',
        version: '1.0.0',
        endpoints: {
            'POST /scan': 'Fetch and cache issues from a GitHub repository',
            'POST /analyze': 'Analyze cached issues using an LLM',
            'GET /health': 'Health check endpoint',
        },
    });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message,
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`
Available endpoints:
  POST /scan     - Fetch and cache GitHub issues
  POST /analyze  - Analyze issues with LLM
  GET  /health   - Health check
  `);
});
