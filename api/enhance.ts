import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  generateCatalogImage, 
  generateThematicImages,
  generatePresentationVideo,
  checkVideoOperation
} from '../services/geminiService';

async function securityCheck(request: VercelRequest, response: VercelResponse): Promise<boolean> {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' });
    return false;
  }

  const apiKey = request.headers.authorization?.split(' ')[1];
  const SERVER_API_KEY = process.env.SERVER_API_KEY;

  if (!SERVER_API_KEY) {
    console.error("SERVER_API_KEY is not configured on the server.");
    response.status(500).json({ error: 'Internal Server Error: Missing server configuration.' });
    return false;
  }

  if (!apiKey || apiKey !== SERVER_API_KEY) {
    response.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    return false;
  }
  return true;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (!(await securityCheck(request, response))) return;

  const { mode } = request.body;

  try {
    switch (mode) {
      case 'catalog':
      case 'thematic': {
        const { base64Image, mimeType, userTheme } = request.body;
        if (!base64Image || !mimeType) {
          return response.status(400).json({ error: 'Bad Request: Missing image data.' });
        }
        if (mode === 'thematic' && (!userTheme || typeof userTheme !== 'string' || userTheme.trim().length === 0)) {
          return response.status(400).json({ error: 'Bad Request: userTheme is required for thematic mode.' });
        }
        const results = mode === 'catalog'
          ? await generateCatalogImage(base64Image, mimeType)
          : await generateThematicImages(base64Image, mimeType, userTheme);
        return response.status(200).json({ enhancedImages: results });
      }

      case 'video_start': {
        const { base64Image, mimeType, prompt } = request.body;
        if (!base64Image || !mimeType || !prompt) {
          return response.status(400).json({ error: 'Bad Request: Missing data for video generation.' });
        }
        const operation = await generatePresentationVideo(base64Image, mimeType, prompt);
        return response.status(202).json({ status: 'processing', operation });
      }

      case 'video_check': {
        const { operation } = request.body;
        if (!operation) {
          return response.status(400).json({ error: 'Bad Request: Missing operation data for video check.' });
        }
        const result = await checkVideoOperation(operation);
        return response.status(200).json(result);
      }

      default:
        return response.status(400).json({ error: "Bad Request: Invalid 'mode' provided." });
    }
  } catch (error: any) {
    console.error(`[API Error - Mode: ${mode}] Failed to process request:`, error);
    const statusCode = error.message.includes('Unauthorized') || error.message.includes('API key not valid') ? 401 : 500;
    return response.status(statusCode).json({ error: error.message || 'An unexpected error occurred.' });
  }
}