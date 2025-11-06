
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  UploadIcon,
  SparklesIcon,
  XMarkIcon,
  ArrowPathIcon,
  PhotoIcon,
  VideoCameraIcon,
  DownloadIcon,
} from './components/icons';
import ApiKeyModal from './components/ApiKeyModal';
import { resizeImage } from './utils';

// Define types for state
type ImageFile = {
  base64: string;
  mimeType: string;
  name: string;
};

type ProcessedAsset = {
  type: 'image' | 'video';
  url: string;
};

type LoadingState = 'idle' | 'catalog' | 'thematic' | 'video_start' | 'video_processing';

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<ImageFile | null>(null);
  const [processedAssets, setProcessedAssets] = useState<ProcessedAsset[]>([]);
  const [isLoading, setIsLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>('Tropical Summer');
  const [videoPrompt, setVideoPrompt] = useState<string>('A gentle zoom-in on the jewelry, with sparkling light effects.');
  
  // Video-specific state
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [videoOperation, setVideoOperation] = useState<any | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const handleReset = useCallback(() => {
    setOriginalImage(null);
    setProcessedAssets([]);
    setIsLoading('idle');
    setError(null);
    setTheme('Tropical Summer');
    setVideoPrompt('A gentle zoom-in on the jewelry, with sparkling light effects.');
    setVideoOperation(null);
    clearPolling();
  }, []);
  
  const callApi = async (endpoint: string, body: object) => {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response.' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    return response.json();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleReset();
      try {
        const { base64, mimeType } = await resizeImage(file, 1024);
        setOriginalImage({ base64, mimeType, name: file.name });
      } catch (err) {
        setError('Error al procesar la imagen. Por favor, intente con otro archivo.');
        console.error(err);
      }
    }
  };

  const handleGenerateCatalog = async () => {
    if (!originalImage) return;
    setIsLoading('catalog');
    setError(null);
    setProcessedAssets([]);
    try {
      const { enhancedImages } = await callApi('/api/enhance', {
        mode: 'catalog',
        base64Image: originalImage.base64,
        mimeType: originalImage.mimeType,
      });
      setProcessedAssets(enhancedImages.map((img: string) => ({
        type: 'image',
        url: `data:image/jpeg;base64,${img}`
      })));
    } catch (err: any) {
      setError(err.message || 'Error al generar la imagen de catálogo.');
    } finally {
      setIsLoading('idle');
    }
  };

  const handleGenerateThematic = async () => {
    if (!originalImage || !theme.trim()) return;
    setIsLoading('thematic');
    setError(null);
    setProcessedAssets([]);
    try {
      const { enhancedImages } = await callApi('/api/enhance', {
        mode: 'thematic',
        base64Image: originalImage.base64,
        mimeType: originalImage.mimeType,
        userTheme: theme,
      });
      setProcessedAssets(enhancedImages.map((img: string) => ({
        type: 'image',
        url: `data:image/jpeg;base64,${img}`
      })));
    } catch (err: any) {
      setError(err.message || 'Error al generar las imágenes de temporada.');
    } finally {
      setIsLoading('idle');
    }
  };

  const checkVideoStatus = useCallback(async (op: any) => {
    try {
      const result = await callApi('/api/enhance', { mode: 'video_check', operation: op });
      if (result.status === 'done') {
        setProcessedAssets([{ type: 'video', url: result.videoUrl }]);
        setIsLoading('idle');
        setVideoOperation(null);
        clearPolling();
      } else if (result.status === 'processing') {
        setVideoOperation(result.operation); // Update operation state with the latest from polling
      } else if (result.status === 'done_no_uri') {
         setError('La generación del video finalizó, pero no se pudo obtener el video. Por favor, inténtelo de nuevo.');
         setIsLoading('idle');
         clearPolling();
      }
    } catch (err: any) {
      setError(err.message || 'Error al verificar el estado del video.');
      setIsLoading('idle');
      clearPolling();
    }
  }, []);

  useEffect(() => {
    if (videoOperation && isLoading === 'video_processing') {
      pollingIntervalRef.current = window.setInterval(() => {
        checkVideoStatus(videoOperation);
      }, 10000); // Poll every 10 seconds
    }
    return () => clearPolling();
  }, [videoOperation, isLoading, checkVideoStatus]);

  const startVideoGeneration = async () => {
    if (!originalImage || !videoPrompt.trim()) return;

    setIsLoading('video_start');
    setError(null);
    setProcessedAssets([]);

    try {
      const { operation } = await callApi('/api/enhance', {
        mode: 'video_start',
        base64Image: originalImage.base64,
        mimeType: originalImage.mimeType,
        prompt: videoPrompt,
      });
      setVideoOperation(operation);
      setIsLoading('video_processing');
    } catch (err: any) {
      const errorMessage = err.message || 'Error al iniciar la generación de video.';
       if (errorMessage.toLowerCase().includes('requested entity was not found') || errorMessage.toLowerCase().includes('api key not valid')) {
          setError("Clave de API no válida o no encontrada. Por favor, seleccione una clave de API válida.");
          setApiKeySelected(false); // Reset key selection state to re-trigger modal
      } else {
          setError(errorMessage);
      }
      setIsLoading('idle');
    }
  };

  const handleGenerateVideo = async () => {
    if ((window as any).aistudio) {
        try {
            const hasKey = await (window as any).aistudio.hasSelectedApiKey();
            if (hasKey || apiKeySelected) {
                setApiKeySelected(true); // Ensure state is true if hasKey is true
                await startVideoGeneration();
            } else {
                setIsApiKeyModalOpen(true);
            }
        } catch (e) {
            setError("No se pudo verificar la clave de API. La generación de video está deshabilitada.");
        }
    } else {
        setError("El entorno de AI Studio no está disponible. La generación de video está deshabilitada.");
    }
  };

  const renderUpload = () => (
    <div className="w-full max-w-lg">
      <label htmlFor="file-upload" className="relative block w-full h-64 border-2 border-slate-300 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 hover:bg-slate-50 transition-colors">
        <div className="flex flex-col items-center justify-center h-full">
          <UploadIcon className="w-12 h-12 text-slate-400" />
          <span className="mt-2 block text-sm font-semibold text-slate-600">Subir una imagen de producto</span>
          <span className="mt-1 block text-xs text-slate-500">PNG, JPG, WEBP hasta 10MB</span>
        </div>
        <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
      </label>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
        <main className="container mx-auto px-4 py-8">
            <header className="text-center mb-8">
                <h1 className="text-4xl font-bold text-slate-900">Estudio de Fotografía de Joyería con IA</h1>
                <p className="mt-2 text-lg text-slate-600">Transforma tus fotos de productos con el poder de Gemini.</p>
            </header>
            
            {error && (
                <div className="max-w-4xl mx-auto bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{error}</span>
                </div>
            )}

            <div className="flex justify-center">
              {!originalImage && renderUpload()}
            </div>
            
            {originalImage && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-7xl mx-auto">
                    {/* Panel de Control */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Imagen Original</h2>
                             <button onClick={handleReset} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                <ArrowPathIcon className="w-4 h-4" />
                                Empezar de nuevo
                            </button>
                        </div>

                        <div className="mb-6">
                            <img src={`data:${originalImage.mimeType};base64,${originalImage.base64}`} alt={originalImage.name} className="w-full h-auto object-contain rounded-lg border max-h-80" />
                        </div>
                        
                        <div className="space-y-6">
                            {/* Catálogo */}
                            <div className="p-4 border rounded-lg">
                                <h3 className="font-bold flex items-center gap-2"><PhotoIcon className="w-5 h-5 text-indigo-500" /> Foto de Catálogo</h3>
                                <p className="text-sm text-slate-500 my-2">Genera una imagen limpia y profesional sobre un fondo neutro, perfecta para tu tienda online.</p>
                                <button
                                    onClick={handleGenerateCatalog}
                                    disabled={isLoading !== 'idle'}
                                    className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-slate-400 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isLoading === 'catalog' ? 'Procesando...' : <> <SparklesIcon className="w-5 h-5"/> Generar </>}
                                </button>
                            </div>
                            
                            {/* Temporada */}
                            <div className="p-4 border rounded-lg">
                                <h3 className="font-bold flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-amber-500" /> Fotos de Temporada</h3>
                                <p className="text-sm text-slate-500 my-2">Crea 3 imágenes creativas y temáticas para tus campañas de marketing o redes sociales.</p>
                                <input
                                    type="text"
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value)}
                                    placeholder="Ej: Navidad, Boda, Verano"
                                    className="w-full p-2 border border-slate-300 rounded-md mb-3"
                                />
                                <button
                                    onClick={handleGenerateThematic}
                                    disabled={isLoading !== 'idle'}
                                    className="w-full bg-amber-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-600 disabled:bg-slate-400 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isLoading === 'thematic' ? 'Procesando...' : <> <SparklesIcon className="w-5 h-5"/> Generar 3 Estilos </>}
                                </button>
                            </div>

                            {/* Video */}
                            <div className="p-4 border rounded-lg">
                                <h3 className="font-bold flex items-center gap-2"><VideoCameraIcon className="w-5 h-5 text-rose-500" /> Video de Presentación</h3>
                                <p className="text-sm text-slate-500 my-2">Genera un video corto a partir de tu imagen con un simple prompt. Requiere tu propia clave API.</p>
                                <input
                                    type="text"
                                    value={videoPrompt}
                                    onChange={(e) => setVideoPrompt(e.target.value)}
                                    placeholder="Ej: Un zoom suave con destellos"
                                    className="w-full p-2 border border-slate-300 rounded-md mb-3"
                                />
                                <button
                                    onClick={handleGenerateVideo}
                                    disabled={isLoading !== 'idle'}
                                    className="w-full bg-rose-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-rose-600 disabled:bg-slate-400 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isLoading.startsWith('video') ? 'Procesando...' : <> <VideoCameraIcon className="w-5 h-5"/> Generar Video </>}
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Panel de Resultados */}
                    <div className="bg-white p-6 rounded-lg shadow-md flex flex-col">
                        <h2 className="text-xl font-bold mb-4">Resultados Generados</h2>
                        <div className="flex-grow flex items-center justify-center bg-slate-100 rounded-lg p-4 min-h-[400px]">
                            {isLoading !== 'idle' ? (
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
                                    <p className="mt-4 font-semibold">Generando...</p>
                                    {isLoading === 'video_processing' && <p className="text-sm text-slate-500">Esto puede tomar varios minutos.</p>}
                                </div>
                            ) : processedAssets.length === 0 ? (
                                <p className="text-slate-500">Tus imágenes y videos aparecerán aquí.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full auto-rows-min">
                                    {processedAssets.map((asset, index) => (
                                        <div key={index} className={`relative group ${processedAssets.length > 1 ? '' : 'sm:col-span-2'}`}>
                                            {asset.type === 'image' ? (
                                                <img src={asset.url} alt={`Generated asset ${index + 1}`} className="w-full h-auto object-contain rounded-lg" />
                                            ) : (
                                                <video src={asset.url} controls className="w-full h-auto rounded-lg" />
                                            )}
                                            <a
                                                href={asset.url}
                                                download={`generated_asset_${index + 1}.${asset.type === 'image' ? 'jpg' : 'mp4'}`}
                                                className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Download"
                                            >
                                                <DownloadIcon className="w-5 h-5" />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ApiKeyModal 
              isOpen={isApiKeyModalOpen}
              onClose={() => setIsApiKeyModalOpen(false)}
              onKeySelected={() => {
                setApiKeySelected(true);
                setIsApiKeyModalOpen(false);
                startVideoGeneration();
              }}
            />
        </main>
    </div>
  );
};

export default App;
