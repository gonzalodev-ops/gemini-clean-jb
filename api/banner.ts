import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateBannerImage } from '../services/geminiService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { base64Image, promoText } = req.body;

    if (!base64Image || !promoText) {
      return res.status(400).json({ error: 'Missing base64Image or promoText' });
    }
    
    const images = await generateBannerImage(base64Image, promoText);
    // The service returns an array, but for a banner we expect one image.
    return res.status(200).json({ image: images[0] });

  } catch (error: any) {
    console.error('Error in /api/banner:', error);
    return res.status(500).json({ error: error.message || 'An internal server error occurred' });
  }
}
