import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { requestSchema } from '../shared/schema';
import { plan } from './planner';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || 'gpt-5-mini' }));
app.post('/api/plan', rateLimit({ windowMs: 60000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, validate: { xForwardedForHeader: false }, message: { error: 'Planner request limit reached. Try again in a minute.' } }), async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid goal or warehouse snapshot.' });
        return;
    }
    const { goal, state, incidentId } = parsed.data;
    const reply = await plan(state, goal, incidentId ?? null, { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5-mini' });
    res.json(reply);
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
if (process.env.NODE_ENV !== 'production' && path.basename(process.argv[1] ?? '') === 'index.ts') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, allowedHosts: process.env.REPLIT_DOMAINS?.split(',') }, appType: 'spa' });
    app.use(vite.middlewares);
}
else {
    app.use(express.static(path.resolve('dist/client')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/client/index.html')));
}
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(400).json({ error: 'Request could not be processed.' }); });
const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Overwatch ready at http://localhost:${port}`));
