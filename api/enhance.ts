
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    generateCatalogImage, 
    generateThematicImages,
    generatePresentationVideo,
    checkVideoOperation
} from '../services/geminiService';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // --- PASO 1: Verificación de seguridad y configuración ---
  // Esta es la verificación más importante. Si algo falla aquí, sabremos exactamente por qué.

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  const { SERVER_API_KEY, API_KEY } = process.env;

  if (!SERVER_API_KEY) {
    console.error("FATAL: SERVER_API_KEY environment variable is not set on Vercel.");
    return response.status(500).json({ error: 'Error de Configuración del Servidor: Falta la clave de seguridad interna.' });
  }

  if (!API_KEY) {
    console.error("FATAL: API_KEY (Gemini API Key) environment variable is not set on Vercel.");
    return response.status(500).json({ error: 'Error de Configuración del Servidor: La clave de la API de Gemini (API_KEY) no está configurada.' });
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${SERVER_API_KEY}`) {
    return response.status(401).json({ error: 'No Autorizado: La clave de la aplicación no es válida.' });
  }

  // --- PASO 2: Procesamiento de la solicitud ---
  const { mode } = request.body;

  try {
    switch (mode) {
      case 'catalog':
      case 'thematic': {
        const { base64Image, mimeType, userTheme } = request.body;
        if (!base64Image || !mimeType) {
          return response.status(400).json({ error: 'Solicitud incorrecta: Faltan datos de la imagen.' });
        }
        if (mode === 'thematic' && (!userTheme || typeof userTheme !== 'string' || userTheme.trim().length === 0)) {
          return response.status(400).json({ error: 'Solicitud incorrecta: El modo temático requiere un tema.' });
        }
        
        const results = mode === 'catalog'
          ? await generateCatalogImage(base64Image, mimeType)
          : await generateThematicImages(base64Image, mimeType, userTheme);
        
        return response.status(200).json({ enhancedImages: results });
      }

      case 'video_start': {
        const { base64Image, mimeType, prompt } = request.body;
        if (!base64Image || !mimeType || !prompt) {
          return response.status(400).json({ error: 'Solicitud incorrecta: Faltan datos para la generación de video.' });
        }
        const operation = await generatePresentationVideo(base64Image, mimeType, prompt);
        return response.status(202).json({ status: 'processing', operation });
      }

      case 'video_check': {
        const { operation } = request.body;
        if (!operation) {
          return response.status(400).json({ error: 'Solicitud incorrecta: Falta el objeto de operación para la verificación de video.' });
        }
        const result = await checkVideoOperation(operation);
        return response.status(200).json(result);
      }

      default:
        return response.status(400).json({ error: "Solicitud incorrecta: El 'modo' proporcionado no es válido." });
    }
  } catch (error: any) {
    console.error(`[API Error - Modo: ${mode}]`, error);
    // Devuelve un error más específico si es posible
    if (error.message.includes('timeout')) {
        return response.status(504).json({ error: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.' });
    }
    return response.status(500).json({ error: error.message || 'Ocurrió un error inesperado en el servidor.' });
  }
}
