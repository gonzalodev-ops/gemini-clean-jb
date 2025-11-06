import { GoogleGenAI, Modality } from "@google/genai";

const model = 'gemini-2.5-flash-image';

// --- PROMPT TÉCNICO PARA CATÁLOGO ---
const catalogPrompt = `You are a precision digital imaging specialist AI. Your task is to process product photos of silver jewelry for an e-commerce catalog by following a strict, non-negotiable set of rules. You are a technical tool. Do not be creative.

**INPUT:** A single product photo of silver jewelry.
**OUTPUT:** A single, processed image file. Do not output any text.

**RULE 1: PERFECT ISOLATION**
- Identify every pixel of the jewelry in the input image.
- Create a perfect, clean mask of the jewelry.
- **FAILURE CONDITION:** The mask is incomplete, cutting off parts of the jewelry (e.g., shortening earring posts).
- **FAILURE CONDITION:** The mask includes elements not present in the original photo (e.g., adding earring posts that were not visible).

**RULE 2: ENHANCEMENT OF THE ISOLATED JEWELRY**
- **Metal Color:** The jewelry is silver. Neutralize and remove all yellow/gold color casts from metallic surfaces. The metal must look like clean, bright, neutral silver.
- **Gemstone Color:** Preserve the original color of all gemstones or enameled parts. Do not alter their hue.
- **Detail:** Apply minor sharpening and clarity adjustments to improve detail. Gently increase specular highlights on gems and metal to add "sparkle" without oversaturating.
- **FAILURE CONDITION:** Yellow/gold tints remain on the silver.
- **FAILURE CONDITION:** Gemstone colors are changed.

**RULE 3: PRESERVATION OF FORM**
- **THIS IS THE MOST IMPORTANT RULE.**
- The processed jewelry (from Rule 1 & 2) **MUST** perfectly maintain the original object's orientation, scale, and aspect ratio.
- It must not be rotated, flipped, stretched, skewed, or distorted in any way.
- **FAILURE CONDITION:** Any change to the jewelry's perspective, orientation, or aspect ratio compared to the original input. This is a critical failure.

**RULE 4: FINAL COMPOSITION**
- Create a new, square (1:1 aspect ratio) canvas.
- Fill the canvas with a solid background color: hex code #B0C4DE (foggy blue).
- Place the processed jewelry (which has strictly followed Rule 3) onto the center of this background.
- The final output is this composite image.

**SUMMARY OF CRITICAL FAILURE CONDITIONS (REJECT IF ANY ARE TRUE):**
1.  **GEOMETRY/FORM IS ALTERED:** The jewelry's shape, orientation, scale, or aspect ratio is different from the original.
2.  **ELEMENTS ADDED/REMOVED:** Parts are added that weren't visible, or parts that were visible are cropped or deleted.
3.  **INCORRECT COLORS:** Silver appears yellow/gold, or gemstone colors are changed.

Output ONLY the final, edited image data.`;

// --- PROMPT CREATIVO PARA TEMPORADA ---
const thematicBasePrompt = `
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

const creativeStyles = [
    `Elegant Still Life: Create a classic product shot. Place the jewelry on a clean, high-quality surface (like marble, silk, or fine wood). Add 1-2 small, elegant props from the theme in the background. The props and background should be heavily out of focus (strong bokeh). The composition should be balanced and minimalist.`,
    `Immersive Scene: Place the jewelry naturally within a complete, but simple, scene that evokes the theme. The jewelry can be resting on a prop or integrated more deeply. For example, for a 'Christmas' theme, earrings could be resting on a beautiful gift box or hanging delicately from a pine branch. The scene must remain clean and artistic, not cluttered.`,
    `Macro & Texture: Focus on a close-up, textural interpretation of the theme. Place the jewelry on a surface that is a macro shot of a thematic element (e.g., sparkling snow, a satin ribbon, a wet autumn leaf). The background should be an extreme blur of related colors and light, creating an abstract and sophisticated mood.`
];

// --- HELPER FUNCTIONS ---

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function generateWithRetry(
    ai: GoogleGenAI,
    base64Image: string,
    mimeType: string,
    prompt: string,
    maxRetries: number = 3
): Promise<string> {
    let attempt = 0;
    let currentDelay = 5000;

    while (attempt < maxRetries) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts: [{ inlineData: { data: base64Image, mimeType } }, { text: prompt }] },
                config: { responseModalities: [Modality.IMAGE] },
            });

            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
            throw new Error("La respuesta de la API no contenía datos de imagen.");

        } catch (error: any) {
            const errorMessage = error.message?.toLowerCase() || '';
            const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota');

            if (isRateLimitError && attempt < maxRetries - 1) {
                console.warn(`Rate limit en intento ${attempt + 1}. Reintentando en ${currentDelay / 1000}s...`);
                await delay(currentDelay);
                currentDelay *= 2;
                attempt++;
            } else {
                throw error;
            }
        }
    }
    throw new Error("Límite de peticiones excedido. No se pudo procesar la imagen después de varios intentos.");
}

function getApiKey(): string {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
        throw new Error("La clave API no ha sido configurada. El procesamiento no puede continuar.");
    }
    return API_KEY;
}

// --- PUBLIC SERVICE FUNCTIONS ---

export async function generateCatalogImage(
    base64Image: string, 
    mimeType: string, 
): Promise<string[]> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    try {
        const result = await generateWithRetry(ai, base64Image, mimeType, catalogPrompt);
        return [result];
    } catch (error: any) {
        console.error("Error en generateCatalogImage:", error);
        // Re-throw with a user-friendly message
        if (error.message.includes('safety')) {
            throw new Error("La solicitud fue bloqueada por políticas de seguridad de la IA.");
        }
        throw new Error(`Error al generar imagen de catálogo: ${error.message}`);
    }
}

export async function generateThematicImages(
    base64Image: string, 
    mimeType: string, 
    userTheme: string, 
): Promise<string[]> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    if (!userTheme.trim()) {
        throw new Error("El tema para la temporada creativa no puede estar vacío.");
    }
    
    try {
        const prompts = creativeStyles.map(styleGuidance => {
            return thematicBasePrompt
                .replace('{{THEME}}', userTheme)
                .replace('{{STYLE_GUIDANCE}}', styleGuidance);
        });
        
        const results: string[] = [];
        // Use a for...of loop to handle async calls sequentially with delays
        for (const prompt of prompts) {
            const result = await generateWithRetry(ai, base64Image, mimeType, prompt);
            results.push(result);
            if (prompts.length > 1 && prompts.indexOf(prompt) < prompts.length - 1) {
                await delay(5000); // 5-second delay between generations
            }
        }

        if (results.length !== prompts.length) {
            throw new Error("No se pudieron generar todas las variaciones de la imagen solicitadas.");
        }

        return results;

    } catch (error: any) {
        console.error("Error en generateThematicImages:", error);
         if (error.message.includes('safety')) {
            throw new Error("La solicitud fue bloqueada por políticas de seguridad. Intenta con una imagen o tema diferente.");
        }
        throw new Error(`Error al generar imágenes de temporada: ${error.message}`);
    }
}
