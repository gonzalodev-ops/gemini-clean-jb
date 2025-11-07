import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generatePresentationVideo } from '../services/geminiService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { base64Image, mimeType, prompt } = req.body;

    if (!base64Image || !mimeType || !prompt) {
      return res.status(400).json({ error: 'Missing base64Image, mimeType, or prompt' });
    }

    const operation = await generatePresentationVideo(base64Image, mimeType, prompt);
    return res.status(200).json({ operation });

  } catch (error: any) {
    console.error('Error in /api/video-generate:', error);
    return res.status(500).json({ error: error.message || 'An internal server error occurred' });
  }
}
