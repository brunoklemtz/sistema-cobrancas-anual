import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUazapiStatus } from '../../shared/uazapi';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await handleUazapiStatus(req.body);
    return res.status(result.status).json(result.json);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
