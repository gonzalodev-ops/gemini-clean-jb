import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const model = 'gemini-2.5-flash-image';

const prompt = `You are a robotic image processor. Your only function is to execute a precise, non-creative, technical workflow. You must follow these instructions verbatim. DO NOT interpret, create, or "improve" beyond the defined steps.

**--- CORE DIRECTIVE: REPLICATE EXACTLY ---**
The jewelry item in the output image MUST be the IDENTICAL object from the input. It is a critical failure to alter the object's form or perspective in any way.

**--- STRICT PROHIBITIONS (ZERO TOLERANCE) ---**
1.  **DO NOT ADD GEOMETRY:** Do not invent or add parts that are not clearly visible in the original photo (e.g., do not add earring posts if they are not visible).
2.  **DO NOT REMOVE GEOMETRY:** Do not crop, shorten, or delete any part of the jewelry that is visible in the original photo (e.g., do not remove visible earring posts).
3.  **DO NOT CHANGE PERSPECTIVE:** The jewelry must maintain its original orientation, angle, and perspective. If the original is at a 3/4 angle, the output MUST be at the exact same 3/4 angle. Do not "straighten" or "flatten" the object to face the camera. Replicate the original perspective.
4.  **DO NOT TRANSFORM:** Do not rotate, flip, resize, or distort the object's original aspect ratio.

**--- TECHNICAL PROCESSING WORKFLOW ---**

**Step 1: MASK GENERATION**
- Create a pixel-perfect mask of the jewelry item exactly as it appears in the source image. This mask is a direct cutout.

**Step 2: ENHANCEMENT OF ISOLATED ITEM**
- Isolate the jewelry using the mask.
- On the isolated item, perform the following:
    - **Metal Color Correction:** Neutralize and remove any yellow/gold color cast from all SILVER surfaces. The metal must appear as clean, bright, neutral-toned silver.
    - **Preserve Gem Colors:** Do NOT alter the hue of gemstones or enameled parts.
    - **Detail Enhancement:** Apply a subtle sharpening and clarity adjustment to improve detail. Gently boost specular highlights for "sparkle".

**Step 3: FINAL COMPOSITION**
- Create a new square (1:1 aspect ratio) canvas.
- Fill the canvas with a solid background color: hex code #B0C4DE.
- Place the enhanced, isolated jewelry item in the center of the canvas. The item must be exactly as it was in the original photo in terms of its angle and orientation.

Output ONLY the final, processed image data. Do not output any text.`;

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