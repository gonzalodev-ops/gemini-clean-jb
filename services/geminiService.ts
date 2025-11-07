// FIX: Implement Gemini service functions to power the API backend.
// This file was previously a placeholder and caused server errors.
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

// Creates a new GoogleGenAI instance.
// For video generation, this ensures the latest user-selected API key from process.env is used for each call.
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });


/**
 * Extracts the base64 data from a Gemini API image generation response.
 * @param response The response from the generateContent call.
 * @returns The base64 encoded image string.
 * @throws An error if image data cannot be extracted.
 */
const extractBase64FromResponse = (response: GenerateContentResponse): string => {
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData?.data) {
                return part.inlineData.data;
            }
        }
    }
    console.error("Invalid Gemini response, could not find image data:", JSON.stringify(response, null, 2));
    throw new Error('Could not extract image data from Gemini response.');
};

/**
 * Generates a clean, catalog-style image from a source image.
 * The output is an array containing one image string, as expected by the frontend.
 */
export async function generateCatalogImage(base64Image: string, mimeType: string): Promise<string[]> {
    const ai = getAi();
    const prompt = `You are a precision digital imaging specialist AI. Your task is to process product photos of silver jewelry for an e-commerce catalog by following a strict, non-negotiable set of rules. You are a technical tool. Do not be creative.

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
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType,
                    },
                },
                {
                    text: prompt,
                },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    
    const enhancedImageBase64 = extractBase64FromResponse(response);
    return [enhancedImageBase64];
}

/**
 * Generates three thematic images for a product based on a user-provided theme.
 */
export async function generateThematicImages(base64Image: string, mimeType: string, userTheme: string): Promise<string[]> {
    const ai = getAi();
    const model = 'gemini-2.5-flash-image';
    
    const basePrompt = `
TASK: You are a jewelry photography expert. Isolate the main jewelry piece from the input image and place it on a new, subtle, photorealistic background.
THEME: "{{THEME}}"
STYLE: "{{STYLE_GUIDANCE}}"

CRITICAL RULES:
1.  **Jewelry is the HERO:** The background must be simple, clean, and heavily blurred (strong bokeh) to not distract.
2.  **Preserve Jewelry:** DO NOT alter the jewelry's shape, orientation, proportions, or original gemstone colors.
3.  **Enhance Materials:** Apply professional studio lighting. Make silver look like clean, bright silver. Enhance gem clarity and sparkle.
4.  **Natural Integration:** The final composition must look like a single, cohesive photograph.
5.  **Output:** A single 1:1 square image. NO TEXT.
`;
    
    const styleGuidances = [
        "Photorealistic lifestyle. The product is naturally integrated into a scene that evokes the theme's atmosphere. Use creative, soft lighting.",
        "High-fashion, editorial-style. The background and props are abstract and artistic, reflecting the theme's core concept. Think bold colors and dramatic shadows.",
        "Flat-lay or top-down composition. The product is surrounded by objects and textures related to the theme. The arrangement is aesthetically pleasing and well-balanced."
    ];

    const prompts = styleGuidances.map(style => 
        basePrompt
            .replace('{{THEME}}', userTheme)
            .replace('{{STYLE_GUIDANCE}}', style)
    );

    const imagePromises = prompts.map(prompt => 
        ai.models.generateContent({
            model,
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType } },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        }).then(extractBase64FromResponse)
    );

    return Promise.all(imagePromises);
}

/**
 * Starts a video generation process using the Veo model.
 */
export async function generatePresentationVideo(base64Image: string, mimeType: string, prompt: string): Promise<any> {
    const ai = getAi();
    
    const operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        image: {
            imageBytes: base64Image,
            mimeType: mimeType,
        },
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9'
        }
    });

    return operation;
}

/**
 * Checks the status of an ongoing video generation operation.
 */
export async function checkVideoOperation(operation: any): Promise<any> {
    const ai = getAi();
    
    const updatedOperation = await ai.operations.getVideosOperation({ operation });

    if (updatedOperation.done) {
        const downloadLink = updatedOperation.response?.generatedVideos?.[0]?.video?.uri;
        if (downloadLink) {
            const apiKey = process.env.API_KEY;
            if (!apiKey) {
                console.error('API_KEY is not available to sign the video URL.');
                return { status: 'failed', message: 'API key not found on server.', operation: updatedOperation };
            }
            // The video URI from Veo needs the API key appended for the client to access it.
            const videoUrlWithKey = `${downloadLink}&key=${apiKey}`;
            return { status: 'done', videoUrl: videoUrlWithKey, operation: updatedOperation };
        } else {
            console.error('Video operation is done but no download URI was found.', updatedOperation);
            return { status: 'done_no_uri', operation: updatedOperation };
        }
    }

    return { status: 'processing', operation: updatedOperation };
}