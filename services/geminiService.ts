import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

// Creates a new GoogleGenAI instance using the API key from the server environment.
const getAi = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API_KEY is not configured in the server environment.");
    }
    return new GoogleGenAI({ apiKey });
};

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
    const prompt = `You are a precision digital imaging specialist AI. Your task is to process product photos of silver jewelry for an e-commerce catalog by following a strict, non-negotiable set of rules. You are a technical tool. Do not be creative. Think of this as a Photoshop batch process, not a creative task.

**INPUT:** A single product photo of silver jewelry.
**OUTPUT:** A single, processed image file. Do not output any text. The output image file MUST be perfectly square (1:1 aspect ratio).

**RULE 1: PERFECT ISOLATION**
- Identify every pixel of the jewelry in the input image.
- Create a perfect, clean mask of the jewelry.
- **FAILURE CONDITION:** The mask is incomplete, cutting off **any part** of the jewelry (e.g., shortening earring posts, clipping edges of the main piece, removing delicate chains). **All original pixels of the jewelry must be retained.**
- **FAILURE CONDITION:** The mask includes elements not present in the original photo (e.g., adding earring posts that were not visible).

**RULE 2: ENHANCEMENT OF THE ISOLATED JEWELRY**
- **Lighting & Metal:** Apply professional, bright studio lighting. The jewelry is silver. Neutralize and remove all yellow/gold color casts from metallic surfaces. The metal must look like clean, bright, neutral silver with realistic highlights and shadows.
- **Gemstone Color:** Preserve the original color of all gemstones or enameled parts. Do not alter their hue.
- **Detail:** Apply minor sharpening and clarity adjustments to improve detail. Gently increase specular highlights on gems and metal to add "sparkle" without oversaturating.
- **FAILURE CONDITION:** Yellow/gold tints remain on the silver.
- **FAILURE CONDITION:** Gemstone colors are changed.

**RULE 3: ABSOLUTE GEOMETRIC PRESERVATION**
- **THIS IS THE MOST IMPORTANT RULE.**
- Treat the isolated jewelry from Rule 1 as a simple 2D image layer. You are forbidden from re-rendering, re-interpreting, or changing the 3D perspective of this layer.
- The layer's pixels **MUST** maintain their original spatial relationship. The original camera perspective must be perfectly preserved.
- The layer must not be rotated, flipped, stretched, skewed, or distorted.
- **ACTION:** After isolating and enhancing (Rule 1 & 2), you will simply composite this exact 2D layer onto the new background (Rule 4).
- **FAILURE CONDITION:** The output shows the jewelry from a perspective or angle even slightly different from the input image. This is a critical failure.

**RULE 4: FINAL COMPOSITION**
- Create a new, **perfectly square (1:1 aspect ratio)** canvas. This is a mandatory requirement.
- Fill the canvas with a solid background color: hex code #B0C4DE (foggy blue).
- Place the processed jewelry 2D layer (which has strictly followed Rule 3) onto the center of this background.
- The final output is this composite image. It must be square.

**SUMMARY OF CRITICAL FAILURE CONDITIONS (REJECT IF ANY ARE TRUE):**
1.  **PERSPECTIVE IS ALTERED:** The jewelry's camera angle, shape, orientation, or aspect ratio is different from the original.
2.  **ELEMENTS ADDED/REMOVED:** Parts are added that weren't visible, or parts that were visible are cropped or deleted.
3.  **INCORRECT COLORS:** Silver appears yellow/gold, or gemstone colors are changed.
4.  **INCORRECT ASPECT RATIO:** The final output image is not a perfect 1:1 square.

Output ONLY the final, edited, 1:1 square image data.`;
    
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
TASK: You are a jewelry photography expert. Isolate ALL jewelry items from the input image and place them on a new, subtle, photorealistic background.
THEME: "{{THEME}}"
STYLE: "{{STYLE_GUIDANCE}}"

CRITICAL RULES:
1.  **Preserve the Entire Piece/Set:** This is the most important rule. If the input image shows a pair of earrings, the output **MUST** show both earrings. If it shows a necklace and pendant, both must be included. Do not remove any part of the original jewelry.
2.  **Jewelry is the HERO:** The background must be simple, clean, and heavily blurred (strong bokeh) to not distract.
3.  **Preserve Form & Color:** DO NOT alter the jewelry's shape, orientation, proportions, or original gemstone colors. The arrangement of the items relative to each other should be preserved.
4.  **Enhance Materials:** Apply professional studio lighting. Make silver look like clean, bright silver. Enhance gem clarity and sparkle.
5.  **Natural Integration:** The final composition must look like a single, cohesive photograph.
6.  **Output Format:** The final output **MUST** be a single, perfectly square image (1:1 aspect ratio). This is a mandatory, non-negotiable rule. Do not output any text.
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
    
    const generatedImages: string[] = [];
    for (const prompt of prompts) {
        try {
            const response = await ai.models.generateContent({
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
            });
            const enhancedImageBase64 = extractBase64FromResponse(response);
            generatedImages.push(enhancedImageBase64);
        } catch (error) {
            console.error('Failed to generate one of the thematic images:', error);
            // Continue to the next image even if one fails
        }
    }

    return generatedImages;
}

/**
 * Generates a promotional banner by adding text to a source image.
 */
export async function generateBannerImage(base64Image: string, promoText: string): Promise<string[]> {
    const ai = getAi();
    const prompt = `
You are a professional graphic designer AI specializing in e-commerce and social media advertising.

**TASK:** Your task is to take an existing product image and add a promotional text overlay to create a compelling, visually appealing banner. The result must look professional, legible, and aesthetically integrated.

**INPUT:**
1.  A base image of a jewelry product.
2.  A promotional text string: "${promoText}"

**CRITICAL RULES & PROCESS:**

1.  **Analyze the Base Image:** Before adding any text, analyze the composition of the input image. Identify:
    *   The main subject(s) and their location.
    *   Areas of negative space or simple background textures.
    *   The overall color palette and mood (e.g., festive, minimalist, elegant).

2.  **Intelligent Text Placement:**
    *   Place the promotional text in the most effective location. This is typically in an area of negative space where it does not obscure the primary jewelry product.
    *   The text must be easily readable. Avoid placing text over complex, "busy" parts of the image.
    *   The placement must balance the overall composition.

3.  **Typography & Style:**
    *   Select a font style that complements the theme of the image and the product. For luxury jewelry, consider elegant serif or clean sans-serif fonts.
    *   Select a text color that has high contrast with the background behind it, ensuring maximum legibility. The color should also fit the image's color palette.
    *   You may add subtle effects like a soft drop shadow or a faint outer glow if it enhances readability, but do not be overly decorative. The goal is elegance and clarity.

4.  **Preserve the Original Image:**
    *   Do not alter, crop, or change the colors of the original base image. You are only adding a text layer on top of it.

5.  **Final Output:**
    *   The final output **MUST** be a single, perfectly square (1:1 aspect ratio) image.
    *   The output image should be the same dimensions and aspect ratio as the input.
    *   Do not output any text, only the final image data.

**FAILURE CONDITIONS (DO NOT DO THIS):**
*   Placing text directly over the main jewelry product.
*   Choosing a font or color that is difficult to read.
*   Altering the background image in any way (other than adding the text overlay).
*   Outputting an image that is not a 1:1 square.

Create the promotional banner now.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: 'image/jpeg', // Thematic images are jpegs
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

    const bannerImageBase64 = extractBase64FromResponse(response);
    return [bannerImageBase64]; // Returning an array to be consistent
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
            return { status: 'done', videoUrl: downloadLink, operation: updatedOperation };
        } else {
            console.error('Video operation is done but no download URI was found.', updatedOperation);
            return { status: 'done_no_uri', operation: updatedOperation };
        }
    }

    return { status: 'processing', operation: updatedOperation };
}
