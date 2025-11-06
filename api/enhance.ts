
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    generateCatalogImage, 
    generateThematicImages,
    generatePresentationVideo,
    checkVideoOperation
} from '../services/geminiService';

// This is the API key that the frontend uses to authenticate with this serverless function.
// It MUST match the value of SERVER_API_KEY in App.tsx.
const SERVER_API_KEY = process.env.SERVER_API_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Check method and authentication
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authHeader = req.headers.authorization;
    if (!SERVER_API_KEY || !authHeader || authHeader !== `Bearer ${SERVER_API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse request body
    const { mode, base64Image, mimeType, userTheme, prompt, operation } = req.body;

    try {
        // 3. Route to the correct service function based on 'mode'
        switch (mode) {
            case 'catalog': {
                if (!base64Image || !mimeType) {
                    return res.status(400).json({ error: 'Missing base64Image or mimeType for catalog mode' });
                }
                const enhancedImages = await generateCatalogImage(base64Image, mimeType);
                return res.status(200).json({ enhancedImages });
            }

            case 'thematic': {
                if (!base64Image || !mimeType || !userTheme) {
                    return res.status(400).json({ error: 'Missing base64Image, mimeType, or userTheme for thematic mode' });
                }
                const enhancedImages = await generateThematicImages(base64Image, mimeType, userTheme);
                return res.status(200).json({ enhancedImages });
            }

            case 'video_start': {
                if (!base64Image || !mimeType || !prompt) {
                    return res.status(400).json({ error: 'Missing base64Image, mimeType, or prompt for video_start mode' });
                }
                const videoOperation = await generatePresentationVideo(base64Image, mimeType, prompt);
                return res.status(200).json({ operation: videoOperation });
            }

            case 'video_check': {
                if (!operation) {
                    return res.status(400).json({ error: 'Missing operation for video_check mode' });
                }
                const result = await checkVideoOperation(operation);
                return res.status(200).json(result);
            }

            default:
                return res.status(400).json({ error: 'Invalid mode specified' });
        }
    } catch (error: any) {
        console.error(`Error in mode '${mode}':`, error);
        // Provide a user-friendly error message
        return res.status(500).json({ error: error.message || 'An unexpected error occurred on the server.' });
    }
}
