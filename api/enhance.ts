import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateCatalogImage, generateThematicImages } from '../services/geminiService';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // --- 1. Security Check: Method and API Key ---
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = request.headers.authorization?.split(' ')[1];
  const SERVER_API_KEY = process.env.SERVER_API_KEY;

  if (!SERVER_API_KEY) {
    console.error("SERVER_API_KEY is not configured on the server.");
    return response.status(500).json({ error: 'Internal Server Error: Missing server configuration.' });
  }

  if (!apiKey || apiKey !== SERVER_API_KEY) {
    return response.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  // --- 2. Input Validation ---
  const { base64Image, mimeType, mode, userTheme } = request.body;

  if (!base64Image || !mimeType || !mode) {
    return response.status(400).json({ 
      error: 'Bad Request: Missing one or more required fields: base64Image, mimeType, mode' 
    });
  }

  if (mode !== 'catalog' && mode !== 'thematic') {
    return response.status(400).json({ error: "Bad Request: 'mode' must be either 'catalog' or 'thematic'." });
  }

  if (mode === 'thematic' && (!userTheme || typeof userTheme !== 'string' || userTheme.trim().length === 0)) {
    return response.status(400).json({ error: 'Bad Request: userTheme is required and must be a non-empty string for thematic mode.' });
  }

  // --- 3. Call the Core Service based on Mode ---
  try {
    let results: string[];

    if (mode === 'catalog') {
      results = await generateCatalogImage(base64Image, mimeType);
    } else { // mode === 'thematic'
      results = await generateThematicImages(base64Image, mimeType, userTheme);
    }

    // --- 4. Send Success Response ---
    return response.status(200).json({ enhancedImages: results });

  } catch (error: any) {
    console.error(`[API Error - Mode: ${mode}] Failed to enhance image:`, error);
    return response.status(500).json({ error: error.message || 'An unexpected error occurred while processing the image.' });
  }
}
