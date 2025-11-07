import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateCatalogImage } from '../services/geminiService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { base64Image, mimeType } = req.body;

    if (!base64Image || !mimeType) {
      return res.status(400).json({ error: 'Missing base64Image or mimeType' });
    }

    const images = await generateCatalogImage(base64Image, mimeType);
    return res.status(200).json({ images });

  } catch (error: any) {
    console.error('Error in /api/catalog:', error);
    return res.status(500).json({ error: error.message || 'An internal server error occurred' });
  }
}