

// FIX: Implement the serverless function handler for /api/enhance.
// This file was previously a placeholder and caused multiple errors.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    generateCatalogImage, 
    generateThematicImages,
    generatePresentationVideo,
    checkVideoOperation
} from '../services/geminiService.js'; // FIX: Ensure .js extension for Node ESM

/**
 * Handles API requests for image enhancement and video generation.
 * This is designed as a Vercel Serverless Function, which is inferred from the `api/` directory structure.
 * It authenticates requests and routes them to the appropriate service based on the 'mode' parameter.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // 1. Check for POST method
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // 2. Authenticate the request
  const authHeader = req.headers.authorization;
  const serverApiKey = process.env.SERVER_API_KEY;

  if (!serverApiKey) {
      console.error('SERVER_API_KEY is not set on the server.');
      return res.status(500).json({ error: 'Internal server configuration error.' });
  }

  if (authHeader !== `Bearer ${serverApiKey}`) {
      // FIX: Corrected status code from '4unauthorized' to 401
      return res.status(401).json({ error: 'Unauthorized' });
  }

  const { mode, base64Image, mimeType, userTheme, prompt, operation } = req.body;

  try {
    switch (mode) {
      case 'catalog': {
        if (!base64Image || !mimeType) {
          return res.status(400).json({ error: 'Missing base64Image or mimeType for catalog mode.' });
        }
        const enhancedImages = await generateCatalogImage(base64Image, mimeType);
        return res.status(200).json({ enhancedImages });
      }

      case 'thematic': {
        if (!base64Image || !mimeType || !userTheme) {
          return res.status(400).json({ error: 'Missing base64Image, mimeType, or userTheme for thematic mode.' });
        }
        const enhancedImages = await generateThematicImages(base64Image, mimeType, userTheme);
        return res.status(200).json({ enhancedImages });
      }
      
      case 'video_start': {
        if (!base64Image || !mimeType || !prompt) {
          return res.status(400).json({ error: 'Missing base64Image, mimeType, or prompt for video_start mode.' });
        }
        const videoOperation = await generatePresentationVideo(base64Image, mimeType, prompt);
        return res.status(200).json({ operation: videoOperation });
      }

      case 'video_check': {
        if (!operation) {
          return res.status(400).json({ error: 'Missing operation for video_check mode.' });
        }
        const result = await checkVideoOperation(operation);
        return res.status(200).json(result);
      }

      default:
        return res.status(400).json({ error: `Invalid mode: ${mode}` });
    }
  } catch (error: any) {
    console.error(`Error in mode '${mode}':`, error);
    return res.status(500).json({ error: error.message || 'An unexpected error occurred.' });
  }
}
