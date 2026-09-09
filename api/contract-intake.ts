import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleIntakeGet, handleIntakePost } from '../shared/contractIntake';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const result = await handleIntakeGet();
      return res.status(result.status).json(result.json);
    }
    if (req.method === 'POST') {
      const result = await handleIntakePost(undefined, req.body || {});
      return res.status(result.status).json(result.json);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[contract-intake]', err);
    return res.status(500).json({ error: err?.message || 'Erro interno' });
  }
}
