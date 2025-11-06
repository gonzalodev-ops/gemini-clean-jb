// FIX: Implement Gemini service functions. This file was previously a placeholder.
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


/**
 * Generates a clean, catalog-style image of a product on a neutral background.
 * @param base64Image The base64 encoded source image.
 * @param mimeType The MIME type of the source image.
 * @returns A promise that resolves to an array containing the base64 string of the new image.
 */
export async function generateCatalogImage(base64Image: string, mimeType: string): Promise<string[]> {
    const ai = getAiInstance();
    
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
                    text: 'Given this product image, place it on a clean, professional, neutral light grey background suitable for a product catalog. The product should be perfectly cut out with no shadows.',
                },
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

/**
 * Generates three thematic images for a product based on a user-provided theme.
 * @param base64Image The base64 encoded source image.
 * @param mimeType The MIME type of the source image.
 * @param userTheme The theme for the generated images (e.g., 'Navidad', 'Verano').
 * @returns A promise that resolves to an array of three base64 image strings.
 */
export async function generateThematicImages(base64Image: string, mimeType: string, userTheme: string): Promise<string[]> {
    const ai = getAiInstance();

    const prompts = [
        `Create a professional product shot featuring the provided item. The scene should have a strong thematic connection to "${userTheme}". Use high-quality, photorealistic lighting and composition.`,
        `Generate a lifestyle photograph that includes the product. The overall atmosphere must clearly evoke the feeling of "${userTheme}". The product must be the central focus of the image.`,
        `Compose a creative and artistic image with the product, visually inspired by the theme of "${userTheme}". Employ dramatic studio lighting and a unique composition to make it stand out for a marketing campaign.`
    ];

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

    if (enhancedImages.length < 3) {
        // Log the issue, but still return what we got. The frontend can handle partial results.
        console.warn(`Expected 3 thematic images, but only generated ${enhancedImages.length}.`);
    }
    if (enhancedImages.length === 0) {
         throw new Error('Failed to generate any thematic images from the AI response.');
    }

    return enhancedImages;
}

/**
 * Starts a video generation process for a product presentation.
 * @param base64Image The base64 encoded source image.
 * @param mimeType The MIME type of the source image.
 * @param prompt The prompt describing the desired video.
 * @returns A promise that resolves to the video generation operation object.
 */
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

/**
 * Checks the status of an ongoing video generation operation.
 * @param operation The operation object to check.
 * @returns A promise that resolves to the current status and result of the operation.
 */
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
