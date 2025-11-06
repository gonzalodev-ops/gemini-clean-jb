import { GoogleGenAI, Modality, GenerateContentResponse } from '@google/genai';

// Helper to get a fresh AI instance, crucial for video generation with user-provided keys.
const getAiInstance = () => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable is not set.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Extracts the base64 image data from a Gemini generateContent response.
 * @param response The response from the AI model.
 * @returns The base64 encoded image string, or null if not found.
 */
const extractBase64Image = (response: GenerateContentResponse): string | null => {
    const part = response?.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
        return part.inlineData.data;
    }
    return null;
};

// --- HIGH-FIDELITY PROMPTS (RESTORED) ---

const catalogPrompt = `
You are a precision digital imaging specialist AI. Your task is to process product photos of jewelry for an e-commerce catalog by following a strict, non-negotiable set of rules. You are a technical tool. Do not be creative.

**INPUT:** A single product photo of jewelry.
**OUTPUT:** A single, processed image file. Do not output any text.

**RULE 1: ABSOLUTE GEOMETRIC PRESERVATION (CRITICAL)**
- The processed jewelry MUST perfectly maintain the original object's complete geometry, orientation, scale, and aspect ratio.
- You MUST NOT remove, shorten, or alter any part of the original object, including functional parts like earring posts, hooks, or clasps.
- **FAILURE CONDITION:** Any part of the jewelry visible in the original photo is missing or altered in the output. This is a critical failure.
- **FAILURE CONDITION:** The jewelry's perspective, orientation, or aspect ratio is different from the original input.

**RULE 2: PERFECT ISOLATION & ENHANCEMENT**
- Create a perfect, clean mask of the jewelry as defined by Rule 1.
- **Metal Color:** Neutralize and remove all unwanted color casts (e.g., yellow/gold) from silver metallic surfaces. The metal must look like clean, bright, neutral silver.
- **Gemstone Color:** Preserve the original color of all gemstones or enameled parts.
- **Detail:** Apply minor sharpening and clarity adjustments. Gently increase specular highlights to add "sparkle" without oversaturating.

**RULE 3: FINAL COMPOSITION**
- Create a new, square (1:1 aspect ratio) canvas.
- Fill the canvas with a solid, neutral, light grey background suitable for a professional catalog.
- Place the processed jewelry (which has strictly followed all previous rules) onto the center of this background.
- The final output is this composite image.
`;

const thematicBasePrompt = `
TASK: You are a world-class jewelry product photographer AI. Your task is to extract the jewelry from the user's image and place it into a new, elegant, and photorealistic composition.

THEME: "{{THEME}}"
COMPOSITION STYLE: "{{STYLE_GUIDANCE}}"

**CRITICAL RULES:**
1.  **EXACT QUANTITY CONSERVATION:** If the source image contains one piece of jewelry, the output MUST contain exactly one piece. If the source contains a pair of earrings (two pieces), the output MUST contain exactly two pieces. Do not add or remove pieces.
2.  **PRESERVE JEWELRY INTEGRITY:** DO NOT alter the jewelry's shape, orientation, proportions, or colors.
3.  **CREATE A COMPOSITION, NOT JUST A BACKGROUND:** The jewelry must be integrated into a tasteful scene with props and surfaces related to the THEME. The result should look like a high-end product photoshoot.
4.  **JEWELRY IS THE STAR:** The composition must be clean and uncluttered. Use a shallow depth of field (strong bokeh) to ensure the background elements do not distract from the jewelry.
5.  **PROFESSIONAL LIGHTING:** Apply sophisticated studio lighting that enhances the metal's shine and the gemstones' sparkle and clarity.
6.  **PHOTOREALISM IS KEY:** The final image must be indistinguishable from a real photograph. The integration of the jewelry into the new scene must be seamless.
7.  **OUTPUT FORMAT:** Generate a single 1:1 square image. DO NOT add any text, watermarks, or logos.
`;

const creativeStyles = [
    `Elegant Still Life: Create a classic product shot. Place the jewelry on a clean, high-quality surface (like marble, silk, or fine wood). Add 1-2 small, elegant props from the theme in the background. The props and background should be heavily out of focus (strong bokeh). The composition should be balanced and minimalist.`,
    `Immersive Scene: Place the jewelry naturally within a complete, but simple, scene that evokes the theme. The jewelry can be resting on a prop or integrated more deeply. For example, for a 'Christmas' theme, earrings could be resting on a beautiful gift box or hanging delicately from a pine branch. The scene must remain clean and artistic, not cluttered.`,
    `Macro & Texture: Focus on a close-up, textural interpretation of the theme. Place the jewelry on a surface that is a macro shot of a thematic element (e.g., sparkling snow, a satin ribbon, a wet autumn leaf). The background should be an extreme blur of related colors and light, creating an abstract and sophisticated mood.`
];


// --- SERVICE FUNCTIONS ---

export async function generateCatalogImage(base64Image: string, mimeType: string): Promise<string[]> {
    const ai = getAiInstance();
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { data: base64Image, mimeType: mimeType } },
                { text: catalogPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    const enhancedImage = extractBase64Image(response);
    if (!enhancedImage) {
        throw new Error('Failed to generate catalog image from the AI response.');
    }
    
    return [enhancedImage];
}

export async function generateThematicImages(base64Image: string, mimeType: string, userTheme: string): Promise<string[]> {
    const ai = getAiInstance();

    const prompts = creativeStyles.map(styleGuidance =>
        thematicBasePrompt
            .replace('{{THEME}}', userTheme)
            .replace('{{STYLE_GUIDANCE}}', styleGuidance)
    );

    const imagePromises = prompts.map(prompt => 
        ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType: mimeType } },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        })
    );

    const responses = await Promise.all(imagePromises);
    
    const enhancedImages = responses.map(extractBase64Image).filter((img): img is string => img !== null);

    if (enhancedImages.length === 0) {
         throw new Error('Failed to generate any thematic images from the AI response.');
    }

    return enhancedImages;
}

export async function generatePresentationVideo(base64Image: string, mimeType: string, prompt: string): Promise<any> {
    const ai = getAiInstance();

    const operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        image: {
            imageBytes: base64Image,
            mimeType: mimeType,
        },
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9',
        },
    });

    return operation;
}

export async function checkVideoOperation(operation: any): Promise<{ status: string; videoUrl?: string; operation?: any }> {
    const ai = getAiInstance();
    const updatedOperation = await ai.operations.getVideosOperation({ operation: operation });

    if (!updatedOperation.done) {
        return { status: 'processing', operation: updatedOperation };
    }

    if (updatedOperation.response?.generatedVideos?.[0]?.video?.uri) {
        const uri = updatedOperation.response.generatedVideos[0].video.uri;
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
             throw new Error("API_KEY is not available to create video download URL.");
        }
        // The API key must be appended to the download URI
        const videoUrl = `${uri}&key=${apiKey}`;
        return { status: 'done', videoUrl: videoUrl };
    }
    
    if (updatedOperation.error) {
        console.error("Video generation failed with an error:", updatedOperation.error);
        return { status: 'failed', operation: updatedOperation };
    }

    return { status: 'done_no_uri', operation: updatedOperation };
}
