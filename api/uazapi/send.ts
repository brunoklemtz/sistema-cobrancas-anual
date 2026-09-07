import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUazapiSend } from '../../shared/uazapi';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await handleUazapiSend(req.body);
    return res.status(result.status).json(result.json);
  } catch (err: any) {
    console.error('Error in /api/uazapi/send:', err);
    return res.status(500).json({ error: err.message || 'Erro interno do servidor' });
  }
}
