import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  console.log('[UAZAPI WEBHOOK RECEIVED]:', JSON.stringify(req.body));
  return res.json({ received: true });
}
