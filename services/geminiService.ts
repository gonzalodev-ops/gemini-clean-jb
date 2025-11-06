import { GoogleGenAI, Modality } from "@google/genai";

const model = 'gemini-2.5-flash-image';

// --- PROMPT ENGINEERING ---
// This prompt guides the model to act as a product photographer creating a full composition.
const basePrompt = `
TASK: You are a world-class jewelry product photographer. Your task is to extract the jewelry from the user's image and place it into a new, elegant, and photorealistic composition.

THEME: "{{THEME}}"
COMPOSITION STYLE: "{{STYLE_GUIDANCE}}"

CRITICAL RULES:
1.  **Create a Composition, Not Just a Background:** The jewelry must be integrated into a tasteful scene with props and surfaces related to the THEME. The result should look like a high-end product photoshoot.
2.  **Preserve Jewelry Integrity:** DO NOT alter the jewelry's shape, orientation, proportions, or colors. If it's a pair of earrings, BOTH must be in the final image, positioned naturally.
3.  **Jewelry is the Star:** The composition must be clean and uncluttered. Use a shallow depth of field (strong bokeh) to ensure the background elements do not distract from the jewelry.
4.  **Professional Lighting:** Apply sophisticated studio lighting that enhances the metal's shine and the gemstones' sparkle and clarity.
5.  **Photorealism is Key:** The final image must be indistinguishable from a real photograph. The integration of the jewelry into the new scene must be seamless.
6.  **Output Format:** Generate a single 1:1 square image. DO NOT add any text, watermarks, or logos.
`;

// These styles guide the model in creating different types of photographic compositions.
const creativeStyles = [
    // Style 0: Elegant Still Life
    `Elegant Still Life: Create a classic product shot. Place the jewelry on a clean, high-quality surface (like marble, silk, or fine wood). Add 1-2 small, elegant props from the theme in the background. The props and background should be heavily out of focus (strong bokeh). The composition should be balanced and minimalist.`,
    
    // Style 1: Immersive Scene
    `Immersive Scene: Place the jewelry naturally within a complete, but simple, scene that evokes the theme. The jewelry can be resting on a prop or integrated more deeply. For example, for a 'Christmas' theme, earrings could be resting on a beautiful gift box or hanging delicately from a pine branch. The scene must remain clean and artistic, not cluttered.`,

    // Style 2: Macro & Texture
    `Macro & Texture: Focus on a close-up, textural interpretation of the theme. Place the jewelry on a surface that is a macro shot of a thematic element (e.g., sparkling snow, a satin ribbon, a wet autumn leaf). The background should be an extreme blur of related colors and light, creating an abstract and sophisticated mood.`
];

// --- HELPER FUNCTIONS ---

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Handles API calls with an exponential backoff retry mechanism for rate limit errors.
 */
async function generateWithRetry(
    ai: GoogleGenAI,
    base64Image: string,
    mimeType: string,
    prompt: string, // The full, formatted prompt
    maxRetries: number = 3
): Promise<string | null> {
    let attempt = 0;
    let currentDelay = 5000; // 5 seconds initial delay for retry

    while (attempt < maxRetries) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: {
                    parts: [
                        { inlineData: { data: base64Image, mimeType: mimeType } },
                        { text: prompt },
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });

            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
            return null; // Successful call but no image data

        } catch (error: any) {
            const errorMessage = error.message?.toLowerCase() || '';
            const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota');

            if (isRateLimitError && attempt < maxRetries - 1) {
                console.warn(`Rate limit hit on attempt ${attempt + 1}. Retrying in ${currentDelay / 1000}s...`);
                await delay(currentDelay);
                currentDelay *= 2; // Exponential backoff
                attempt++;
            } else {
                // For non-rate-limit errors or final attempt, re-throw the original error
                throw error;
            }
        }
    }
    // This line is reached if all retries fail
    throw new Error("Límite de peticiones excedido. No se pudo procesar la imagen después de varios intentos.");
}

// --- MAIN SERVICE FUNCTION ---

export async function enhanceJewelryImage(
    base64Image: string, 
    mimeType: string, 
    userTheme: string, 
    stylesToGenerate: number[]
): Promise<string[]> {
    const API_KEY = process.env.API_KEY;

    if (!API_KEY) {
        throw new Error("La clave API no ha sido configurada. El procesamiento no puede continuar.");
    }
    
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    let theme = userTheme.trim();
    if (!theme) {
        theme = 'A clean, professional studio background with a soft gradient from light gray to white.';
    }
    
    try {
        const prompts = stylesToGenerate.map(index => {
            const styleGuidance = creativeStyles[index];
            if (!styleGuidance) throw new Error(`Style with index ${index} not found.`);
            
            return basePrompt
                .replace('{{THEME}}', theme)
                .replace('{{STYLE_GUIDANCE}}', styleGuidance);
        });
        
        const results: (string | null)[] = [];
        for (const prompt of prompts) {
            const result = await generateWithRetry(ai, base64Image, mimeType, prompt);
            results.push(result);
            if (prompts.length > 1) {
                await delay(5000); // 5-second delay between on-demand generations
            }
        }

        const validResults = results.filter((r): r is string => r !== null);

        if (validResults.length !== prompts.length) {
            throw new Error("No se pudieron generar todas las variaciones de la imagen solicitadas.");
        }

        return validResults;

    } catch (error: any) {
        console.error("Error calling Gemini API:", error);
        
        const errorMessage = error.message?.toLowerCase() || '';

        if (errorMessage.includes('429') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota')) {
            throw new Error("Límite de peticiones excedido (Rate Limit). La API está recibiendo demasiadas solicitudes. Por favor, espera unos minutos antes de volver a intentarlo.");
        }
        if (errorMessage.includes('api key not valid')) {
            throw new Error("La clave API proporcionada no es válida o ha caducado. Por favor, verifica tu configuración.");
        }
        if (errorMessage.includes('safety')) {
            throw new Error("La solicitud fue bloqueada por políticas de seguridad. Intenta con una imagen o descripción de fondo diferente.");
        }
        
        throw new Error("Ocurrió un error inesperado al contactar la API. Verifica tu conexión o inténtalo más tarde.");
    }
}
