import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  handleUazapiSend,
  handleUazapiStatus,
  handleContingencyAlert,
} from './shared/uazapi';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.post('/api/uazapi/send', async (req: Request, res: Response) => {
    try {
      const result = await handleUazapiSend(req.body);
      return res.status(result.status).json(result.json);
    } catch (err: any) {
      console.error('Error in /api/uazapi/send:', err);
      return res.status(500).json({ error: err.message || 'Erro interno do servidor' });
    }
  });

  app.post('/api/uazapi/status', async (req: Request, res: Response) => {
    try {
      const result = await handleUazapiStatus(req.body);
      return res.status(result.status).json(result.json);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/uazapi/contingency-alert', async (req: Request, res: Response) => {
    try {
      const result = await handleContingencyAlert(req.body);
      return res.status(result.status).json(result.json);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/uazapi/webhook', (req: Request, res: Response) => {
    console.log('[UAZAPI WEBHOOK RECEIVED]:', JSON.stringify(req.body));
    return res.json({ received: true });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
