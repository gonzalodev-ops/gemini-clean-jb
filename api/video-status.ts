import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkVideoOperation } from '../services/geminiService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { operation } = req.body;

    if (!operation) {
      return res.status(400).json({ error: 'Missing operation object' });
    }

    let result = await checkVideoOperation(operation);

    // If the video is done, sign the URL with the API key from the server environment
    if (result.status === 'done' && result.videoUrl) {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new Error('API_KEY is not available on the server to sign the video URL.');
        }
        result.videoUrl = `${result.videoUrl}&key=${apiKey}`;
    }

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('Error in /api/video-status:', error);
    return res.status(500).json({ error: error.message || 'An internal server error occurred' });
  }
}