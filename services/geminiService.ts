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
                    text: 'Given this product image, create a photorealistic, professional catalog image. Remove the original background and replace it with a clean, solid light gray background (hex #f0f0f0). Ensure the product is well-lit, centered, and maintains its original details and aspect ratio. The final image should be sharp and high-quality, suitable for an e-commerce website.',
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
    
    const prompts = [
        `Create a photorealistic lifestyle image of this product in a setting inspired by the theme: "${userTheme}". The product should be the main focus, naturally integrated into a scene that evokes the theme's atmosphere. Use creative lighting and composition.`,
        `Generate a high-fashion, editorial-style image of this product. The background and props should be abstract and artistic, reflecting the core concept of "${userTheme}". Think bold colors and dramatic shadows.`,
        `Produce a flat-lay or top-down composition featuring this product, surrounded by objects and textures that relate to the theme "${userTheme}". The arrangement should be aesthetically pleasing and well-balanced.`
    ];

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
