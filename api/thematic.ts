import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateThematicImages } from '../services/geminiService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { base64Image, mimeType, theme } = req.body;

    if (!base64Image || !mimeType || !theme) {
      return res.status(400).json({ error: 'Missing base64Image, mimeType, or theme' });
    }

    const images = await generateThematicImages(base64Image, mimeType, theme);
    return res.status(200).json({ images });

  } catch (error: any) {
    console.error('Error in /api/thematic:', error);
    return res.status(500).json({ error: error.message || 'An internal server error occurred' });
  }
}
