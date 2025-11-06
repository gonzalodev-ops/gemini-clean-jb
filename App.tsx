
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { resizeImage } from './utils';
import ThemeSelector from './components/ThemeSelector';
import ApiKeyModal from './components/ApiKeyModal';
import {
  UploadIcon,
  SparklesIcon,
  DownloadIcon,
  XMarkIcon,
  ArrowPathIcon,
  KeyIcon,
  PhotoIcon,
  VideoCameraIcon,
  StopIcon,
} from './components/icons';

// --- TYPE DEFINITIONS ---
type SourceImage = {
  url: string;
  base64: string;
  mimeType: string;
};

type LoadingState = {
  catalog: boolean;
  thematic: boolean;
  video: boolean;
};

type VideoOperation = any; 

type VideoResult = {
  status: 'processing' | 'done' | 'done_no_uri' | 'failed';
  videoUrl?: string;
  operation?: VideoOperation;
};

// --- HELPER FUNCTIONS ---
async function callApi(body: object) {
    // This key is used to authenticate the frontend with its own backend serverless function.
    // It should be configured as an environment variable (e.g., REACT_APP_SERVER_API_KEY).
    const serverApiKey = process.env.REACT_APP_SERVER_API_KEY;
    if (!serverApiKey) {
        console.error("Server API key is not configured on the client.");
        throw new Error("La configuración del cliente es inválida. No se puede contactar al servidor.");
    }

    const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serverApiKey}`,
        },
        body: JSON.stringify(body),
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }
    
    return response.json();
}

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
    // --- STATE MANAGEMENT ---
    const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
    const [catalogImage, setCatalogImage] = useState<string | null>(null);
    const [thematicImages, setThematicImages] = useState<string[]>([]);
    const [videoResult, setVideoResult] = useState<VideoResult | null>(null);
    
    const [theme, setTheme] = useState('Navidad');
    const [videoPrompt, setVideoPrompt] = useState('Una animación cinematográfica y elegante del producto, con suaves movimientos de cámara e iluminación de estudio.');

    const [loading, setLoading] = useState<LoadingState>({ catalog: false, thematic: false, video: false });
    const [error, setError] = useState<string | null>(null);
    
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [hasApiKey, setHasApiKey] = useState<boolean | undefined>(undefined);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoCheckIntervalRef = useRef<number | null>(null);

    const isProcessing = loading.catalog || loading.thematic || loading.video;

    // --- EFFECTS ---
    useEffect(() => {
        const checkKey = async () => {
            if (typeof window.aistudio?.hasSelectedApiKey === 'function') {
                try {
                    const keyStatus = await window.aistudio.hasSelectedApiKey();
                    setHasApiKey(keyStatus);
                } catch (e) {
                    console.error("Error checking for API key:", e);
                    setHasApiKey(false);
                }
            } else {
                console.warn("aistudio API not found.");
                setHasApiKey(false);
            }
        };
        checkKey();
    }, []);

    useEffect(() => {
        const checkStatus = async () => {
            if (videoResult?.status === 'processing' && videoResult.operation) {
                try {
                    const result = await callApi({ mode: 'video_check', operation: videoResult.operation });
                    if (result.status === 'done') {
                        setVideoResult({ status: 'done', videoUrl: result.videoUrl });
                        setLoading(prev => ({ ...prev, video: false }));
                    } else if (result.status === 'done_no_uri' || result.status === 'failed') {
                         setError('La generación del video finalizó, pero no se pudo obtener el resultado. Inténtalo de nuevo.');
                         setVideoResult(null);
                         setLoading(prev => ({ ...prev, video: false }));
                    } else {
                        setVideoResult(prev => prev ? { ...prev, operation: result.operation } : null);
                    }
                } catch (e: any) {
                    setError(`Error al verificar el estado del video: ${e.message}`);
                    setLoading(prev => ({ ...prev, video: false }));
                    setVideoResult(null);
                }
            }
        };

        if (videoResult?.status === 'processing') {
            videoCheckIntervalRef.current = window.setInterval(checkStatus, 10000);
        }

        return () => {
            if (videoCheckIntervalRef.current) {
                clearInterval(videoCheckIntervalRef.current);
                videoCheckIntervalRef.current = null;
            }
        };
    }, [videoResult]);

    // --- HANDLERS ---
    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        handleReset();
        setError(null);

        try {
            const { base64, mimeType } = await resizeImage(file, 1024);
            setSourceImage({ url: URL.createObjectURL(file), base64, mimeType });
        } catch (err) {
            setError("Error al procesar la imagen. Por favor, intenta con otro archivo.");
            console.error(err);
        }
    }, []);

    const handleReset = useCallback(() => {
        setSourceImage(null);
        setCatalogImage(null);
        setThematicImages([]);
        setVideoResult(null);
        setError(null);
        setLoading({ catalog: false, thematic: false, video: false });
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (videoCheckIntervalRef.current) clearInterval(videoCheckIntervalRef.current);
    }, []);

    const handleGenerateCatalog = async () => {
        if (!sourceImage) return;
        setLoading(prev => ({ ...prev, catalog: true }));
        setError(null);
        setCatalogImage(null);
        try {
            const { enhancedImages } = await callApi({ mode: 'catalog', base64Image: sourceImage.base64, mimeType: sourceImage.mimeType });
            setCatalogImage(enhancedImages[0]);
        } catch (err: any) { setError(`Error al generar imagen de catálogo: ${err.message}`); } 
        finally { setLoading(prev => ({ ...prev, catalog: false })); }
    };
    
    const handleGenerateThematic = async () => {
        if (!sourceImage) return;
        setLoading(prev => ({ ...prev, thematic: true }));
        setError(null);
        setThematicImages([]);
        try {
            const { enhancedImages } = await callApi({ mode: 'thematic', base64Image: sourceImage.base64, mimeType: sourceImage.mimeType, userTheme: theme });
            setThematicImages(enhancedImages);
        } catch (err: any) { setError(`Error al generar imágenes de temporada: ${err.message}`); }
        finally { setLoading(prev => ({ ...prev, thematic: false })); }
    };

    const handleGenerateVideo = async () => {
        if (!sourceImage) return;
        if (hasApiKey === undefined) return;
        if (!hasApiKey) { setIsApiKeyModalOpen(true); return; }

        setLoading(prev => ({ ...prev, video: true }));
        setError(null);
        setVideoResult(null);
        try {
            const { operation } = await callApi({ mode: 'video_start', base64Image: sourceImage.base64, mimeType: sourceImage.mimeType, prompt: videoPrompt });
            setVideoResult({ status: 'processing', operation });
        } catch (err: any) {
             if (err.message?.toLowerCase().includes('not found') || err.message?.toLowerCase().includes('api key not valid')) { 
                setHasApiKey(false);
                setError("La clave de API no fue encontrada o no es válida. Por favor, selecciona una clave de nuevo.");
                setIsApiKeyModalOpen(true);
            } else { setError(`Error al iniciar la generación de video: ${err.message}`); }
            setLoading(prev => ({ ...prev, video: false }));
        }
    };
    
    const handleApiKeySelected = () => {
        setIsApiKeyModalOpen(false);
        setHasApiKey(true);
        // Automatically trigger video generation after key selection
        handleGenerateVideo();
    };

    const triggerFileSelect = () => fileInputRef.current?.click();

    // --- RENDER LOGIC ---
    return (
      <>
        <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} onKeySelected={handleApiKeySelected} />
        <div className="bg-slate-50 min-h-screen font-sans">
          <header className="bg-white border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
              <SparklesIcon className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-slate-800">Estudio de Productos con IA</h1>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* --- INPUT & CONTROLS --- */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                {!sourceImage ? (
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
                    <UploadIcon className="w-12 h-12 text-slate-400" />
                    <h3 className="mt-4 text-lg font-medium text-slate-900">Sube tu foto de producto</h3>
                    <p className="mt-1 text-sm text-slate-500">Arrastra y suelta un archivo o haz clic para seleccionar.</p>
                    <button onClick={triggerFileSelect} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                      Seleccionar Archivo
                    </button>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-slate-800">Tu Imagen</h2>
                        <button onClick={handleReset} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            <ArrowPathIcon className="w-4 h-4" /> Cambiar Imagen
                        </button>
                    </div>
                    <img src={sourceImage.url} alt="Producto original" className="w-full rounded-lg shadow-md" />
                  </div>
                )}
                
                {sourceImage && (
                  <div className="mt-6 space-y-6">
                    {/* Catalog Generation */}
                    <div className="p-4 border border-slate-200 rounded-lg">
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2"><PhotoIcon className="w-5 h-5 text-slate-500"/> Foto de Catálogo</h3>
                      <p className="text-sm text-slate-500 mt-1 mb-3">Genera una imagen limpia con fondo neutro, perfecta para tu tienda online.</p>
                      <button onClick={handleGenerateCatalog} disabled={isProcessing} className="w-full bg-slate-800 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-900 transition-colors disabled:bg-slate-400 disabled:cursor-wait flex items-center justify-center gap-2">
                        {loading.catalog ? 'Procesando...' : 'Generar'}
                      </button>
                    </div>
                    
                    {/* Thematic Generation */}
                    <div className="p-4 border border-slate-200 rounded-lg">
                       <h3 className="font-semibold text-slate-800 flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-slate-500"/> Fotos de Temporada</h3>
                       <p className="text-sm text-slate-500 mt-1 mb-3">Crea composiciones creativas para campañas de marketing y redes sociales.</p>
                       <ThemeSelector theme={theme} setTheme={setTheme} disabled={isProcessing} />
                       <button onClick={handleGenerateThematic} disabled={isProcessing} className="w-full mt-3 bg-slate-800 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-900 transition-colors disabled:bg-slate-400 disabled:cursor-wait flex items-center justify-center gap-2">
                        {loading.thematic ? 'Procesando...' : 'Generar 3 Estilos'}
                       </button>
                    </div>
                    
                    {/* Video Generation */}
                    <div className="p-4 border border-slate-200 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><VideoCameraIcon className="w-5 h-5 text-slate-500"/> Video de Presentación</h3>
                          <p className="text-sm text-slate-500 mt-1 mb-3">Crea un video corto y dinámico para destacar tu producto.</p>
                        </div>
                        {!hasApiKey && hasApiKey !== undefined && (
                          <button onClick={() => setIsApiKeyModalOpen(true)} className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full hover:bg-orange-200">
                            <KeyIcon className="w-3 h-3"/> Se requiere clave
                          </button>
                        )}
                      </div>
                      <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} disabled={isProcessing} rows={2} className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"></textarea>
                      <button onClick={handleGenerateVideo} disabled={isProcessing} className="w-full mt-3 bg-slate-800 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-900 transition-colors disabled:bg-slate-400 disabled:cursor-wait flex items-center justify-center gap-2">
                        {loading.video ? 'Generando Video...' : 'Generar Video'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* --- RESULTS --- */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-8">
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                        <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
                            <XMarkIcon className="w-5 h-5 cursor-pointer" />
                        </span>
                    </div>
                )}

                <ResultSection title="Resultado de Catálogo" isLoading={loading.catalog}>
                    {catalogImage && <ImageResult src={`data:image/png;base64,${catalogImage}`} alt="Imagen de catálogo" />}
                </ResultSection>

                <ResultSection title="Resultados de Temporada" isLoading={loading.thematic}>
                    {thematicImages.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {thematicImages.map((img, i) => <ImageResult key={i} src={`data:image/png;base64,${img}`} alt={`Imagen de temporada ${i + 1}`} />)}
                        </div>
                    )}
                </ResultSection>

                <ResultSection title="Resultado de Video" isLoading={loading.video}>
                    {videoResult?.status === 'done' && videoResult.videoUrl && (
                        <div className="relative">
                            <video src={videoResult.videoUrl} controls autoPlay loop className="w-full rounded-lg shadow-md"></video>
                             <a href={videoResult.videoUrl} download="presentacion_producto.mp4" className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-colors">
                                <DownloadIcon className="w-5 h-5" />
                            </a>
                        </div>
                    )}
                    {loading.video && <p className="text-sm text-slate-500 text-center">La generación de video puede tardar varios minutos. Gracias por tu paciencia.</p>}
                </ResultSection>
              </div>
            </div>
          </main>
        </div>
      </>
    );
};

// --- SUB-COMPONENTS ---
const ResultSection: React.FC<{ title: string, isLoading: boolean, children: React.ReactNode }> = ({ title, isLoading, children }) => (
    <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">{title}</h3>
        {isLoading && (
            <div className="flex justify-center items-center h-48 bg-slate-100 rounded-lg">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Procesando...</span>
            </div>
        )}
        {!isLoading && children}
    </div>
);

const ImageResult: React.FC<{ src: string, alt: string }> = ({ src, alt }) => (
    <div className="group relative">
        <img src={src} alt={alt} className="w-full rounded-lg shadow-md" />
        <a href={src} download={`${alt.replace(/\s+/g, '_')}.png`} className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
            <DownloadIcon className="w-5 h-5" />
        </a>
    </div>
);


export default App;
