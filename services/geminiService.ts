import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const model = 'gemini-2.5-flash-image';

const prompt = `You are a precision digital imaging specialist for e-commerce. Your sole function is to prepare product photos of silver jewelry for a high-end catalog according to a strict technical specification. The goal is technical perfection and consistency, NOT artistic interpretation.

Follow this sequence of operations exactly:

**Step 1: MASKING & ISOLATION**
- Create a perfect, pixel-precise mask of the *entire* jewelry piece.
- This mask MUST include every single part visible in the original image, especially thin chains, clasps, and any other delicate components.
- **Under no circumstances is any part of the jewelry, no matter how small, to be excluded or cropped.**

- **SPECIAL INSTRUCTION FOR EARRINGS:** Pay extreme attention to the earring posts (the straight or curved metal part that goes through the ear, sometimes called the 'little leg'). It is a critical error to crop, shorten, or alter the shape of these posts. The mask must trace their full, original length and shape with maximum precision. Treat the posts as an essential part of the jewelry.

**Step 2: COLOR CORRECTION (METAL ONLY)**
- The jewelry is made of silver.
- Your primary task is to **completely neutralize and remove any yellow, gold, or warm color casts** from the metallic parts.
- The final metal must look like clean, bright, neutral silver.
- **CRITICAL: Do NOT alter the original hue of any gemstones.**

**Step 3: ENHANCEMENT**
- Apply subtle sharpening and clarity enhancements to the entire isolated piece to improve detail.
- Gently increase the specular highlights (sparkle) on gemstones without oversaturating them or changing their color.

**Step 4: COMPOSITION & EXPORT**
- Create a new square canvas (1:1 aspect ratio).
- Fill this canvas with the solid color with hex code #B0C4DE (foggy blue).
- Place the fully processed jewelry piece from the previous steps perfectly in the center of this canvas.
- **The jewelry MUST retain its original orientation and aspect ratio. Do not rotate, flip, or distort it in any way.**
- Ensure there is a balanced, visually pleasing margin of the blue background around the entire piece.

**CRITICAL FAILURE CONDITIONS (AVOID AT ALL COSTS):**
1.  **Cropping:** ANY part of the original jewelry is missing. This specifically includes cutting off or shortening earring posts.
2.  **Rotation:** The orientation of the jewelry is changed.
3.  **Color Error:** Golden/yellow tints remain on the silver, or gemstone colors are altered.

Return ONLY the final, edited image data.`;

export async function enhanceJewelryImage(base64Image: string, mimeType: string): Promise<string | null> {
    try {
        const response = await ai.models.generateContent({
            model: model,
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
        
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return part.inlineData.data;
            }
        }

        return null;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to enhance image. Please check the console for more details.");
    }
}