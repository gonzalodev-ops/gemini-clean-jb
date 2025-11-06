
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  UploadIcon,
  DownloadIcon,
  SparklesIcon,
  XMarkIcon,
  ArrowPathIcon,
  KeyIcon,
  PhotoIcon,
  VideoCameraIcon,
  StopIcon,
} from './components/icons';
import ApiKeyModal from './components/ApiKeyModal';
import { resizeImage } from './utils';

// Types
type ImageFile = {
  file: File;
  preview: string;
  base64: string;
  mimeType: string;
};
type Mode = 'catalog' | 'thematic' | 'video';
type Result = { type: 'image'; url: string } | { type: 'video'; url: string };
type VideoStatus = 'idle' | 'starting' | 'processing' | 'done' | 'error';

// This would typically be in a .env file, but is included here for demonstration.
// IMPORTANT: This key is for authenticating with YOUR OWN serverless function backend,
// NOT the Google GenAI API key. It must match the SERVER_API_KEY environment
// variable configured on your Vercel/serverless deployment.
const SERVER_API_KEY = 'xPPkpdDu4A_fRL8PBRNfwKFqwsrrYXqEz3G7uVUL!xCFtT2jm_T3avo3zCPrP';

// Helper component for mode selection
const ModeButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 p-3 text-sm font-semibold rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);


const App: React.FC = () => {
  const [image, setImage] = useState<ImageFile | null>(null);
  const [mode, setMode] = useState<Mode>('catalog');
  const [thematicTheme, setThematicTheme] = useState<string>('Navidad');
  const [videoPrompt, setVideoPrompt] = useState<string>('Una toma elegante en cámara lenta de la joya, con efectos de luz brillante.');
  const [results, setResults] = useState<Result[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Video-specific state
  const [isApiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [hasSelectedApiKey, setHasSelectedApiKey] = useState<boolean | null>(null);
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('idle');
  const videoOperationRef = useRef<any>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkApiKey = useCallback(async (showAlert = false) => {
    // The `window.aistudio` object is injected by the environment (e.g., Google AI Studio).
    if (typeof (window as any).aistudio?.hasSelectedApiKey !== 'function') {
      if (showAlert) {
        setError("La funcionalidad de clave API no está disponible en este entorno.");
      }
      setHasSelectedApiKey(false);
      return false;
    }
    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setHasSelectedApiKey(hasKey);
      return hasKey;
    } catch (e) {
      console.error("Error checking for API key:", e);
      if (showAlert) {
        setError("Error al verificar la clave de API.");
      }
      setHasSelectedApiKey(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (mode === 'video') {
      checkApiKey();
    }
  }, [mode, checkApiKey]);

  const clearPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearPolling();
  }, []);

  const handleFileChange = useCallback(async (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Por favor, selecciona un archivo de imagen válido (JPEG, PNG, etc.).');
      return;
    }
    setError(null);
    setResults([]);
    setVideoStatus('idle');
    clearPolling();

    try {
      const { base64, mimeType } = await resizeImage(file, 1024);
      setImage({
        file,
        preview: URL.createObjectURL(file),
        base64,
        mimeType,
      });
    } catch (err) {
      console.error("Error resizing image:", err);
      setError('No se pudo procesar la imagen seleccionada.');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }, [handleFileChange]);

  const clearImage = useCallback(() => {
    if (image) {
      URL.revokeObjectURL(image.preview);
    }
    setImage(null);
    setResults([]);
    setError(null);
    setVideoStatus('idle');
    clearPolling();
  }, [image]);

  const pollVideoStatus = useCallback(async (operation: any) => {
    setVideoStatus('processing');
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/enhance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVER_API_KEY}`,
          },
          body: JSON.stringify({ mode: 'video_check', operation }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Fallo al verificar el estado del video.');
        }

        const data = await res.json();
        
        if (data.status === 'done') {
          setResults([{ type: 'video', url: data.videoUrl }]);
          setVideoStatus('done');
          videoOperationRef.current = null;
          clearPolling();
        } else if (data.status === 'done_no_uri') {
          throw new Error('La generación de video se completó pero no se encontró la URL.');
        } else {
          videoOperationRef.current = data.operation; // Update operation for next poll
        }
      } catch (err: any) {
        setError(`Error durante el sondeo del video: ${err.message}`);
        setVideoStatus('error');
        clearPolling();
      }
    }, 10000); // Poll every 10 seconds
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!image) return;

    if (mode === 'video') {
      const hasKey = await checkApiKey(true);
      if (!hasKey) {
        setApiKeyModalOpen(true);
        return;
      }
    }
    
    setProcessing(true);
    setResults([]);
    setError(null);
    if(mode === 'video') setVideoStatus('starting');
    
    try {
      const apiMode = mode === 'video' ? 'video_start' : mode;
      const body: any = {
        mode: apiMode,
        base64Image: image.base64,
        mimeType: image.mimeType,
      };
      if (mode === 'thematic') body.userTheme = thematicTheme;
      if (mode === 'video') body.prompt = videoPrompt;

      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVER_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || `Error del servidor: ${response.status}`;
        if (mode === 'video' && errorMessage.toLowerCase().includes('requested entity was not found')) {
            setError("La clave de API no es válida o no tiene acceso al modelo Veo. Por favor, selecciona una clave diferente.");
            setHasSelectedApiKey(false); // Reset key state so user is prompted again
            setApiKeyModalOpen(true);
        } else {
            throw new Error(errorMessage);
        }
      } else {
        const data = await response.json();
        if (apiMode === 'video_start') {
          videoOperationRef.current = data.operation;
          pollVideoStatus(data.operation);
        } else {
          setResults(data.enhancedImages.map((img: string) => ({
            type: 'image',
            url: `data:image/jpeg;base64,${img}`
          })));
        }
      }
    } catch (err: any) {
      setError(err.message);
      if(mode === 'video') setVideoStatus('error');
    } finally {
      setProcessing(false);
    }
  }, [image, mode, thematicTheme, videoPrompt, checkApiKey, pollVideoStatus]);

  const handleApiKeySelected = () => {
    setApiKeyModalOpen(false);
    setHasSelectedApiKey(true); // Assume success, let handleGenerate re-verify if needed
    handleGenerate(); // Retry generation
  };

  const stopVideoGeneration = () => {
    clearPolling();
    setProcessing(false);
    setVideoStatus('idle');
    videoOperationRef.current = null;
    setError('Generación de video cancelada por el usuario.');
  };
    
  const isGenerating = processing || videoStatus === 'starting' || videoStatus === 'processing';

  return (
    <div className="bg-slate-100 min-h-screen font-sans text-slate-800">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-slate-900">Estudio Fotográfico de Joyería con IA</h1>
          <p className="text-sm text-slate-600">Sube una foto de tu producto para generar imágenes de catálogo, temáticas o videos de presentación.</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls Column */}
          <div className="bg-white p-6 rounded-xl shadow-lg">
            {!image ? (
                <div 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center"
                >
                    <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
                    <label htmlFor="file-upload" className="mt-4 text-sm text-slate-600">
                        <span className="font-semibold text-indigo-600 cursor-pointer hover:underline">Sube un archivo</span> o arrástralo y suéltalo aquí
                    </label>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={(e) => handleFileChange(e.target.files?.[0] || null)} />
                    <p className="text-xs text-slate-500 mt-1">PNG, JPG, GIF hasta 10MB</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div>
                        <h2 className="font-semibold text-lg mb-2">Imagen Original</h2>
                        <div className="relative">
                            <img src={image.preview} alt="Vista previa de la joya" className="w-full rounded-lg object-contain max-h-60" />
                            <button onClick={clearImage} className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1.5 hover:bg-opacity-75 transition-colors" aria-label="Limpiar imagen">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold mb-3">1. Elige un modo de generación</h3>
                      <div className="flex gap-2">
                        <ModeButton label="Catálogo" icon={<PhotoIcon className="w-5 h-5" />} isActive={mode === 'catalog'} onClick={() => setMode('catalog')} />
                        <ModeButton label="Temática" icon={<SparklesIcon className="w-5 h-5" />} isActive={mode === 'thematic'} onClick={() => setMode('thematic')} />
                        <ModeButton label="Video" icon={<VideoCameraIcon className="w-5 h-5" />} isActive={mode === 'video'} onClick={() => setMode('video')} />
                      </div>
                    </div>
                    
                    {mode === 'thematic' && (
                        <div>
                            <label htmlFor="theme" className="block text-sm font-medium text-slate-700 mb-1">2. Introduce un tema</label>
                            <input type="text" id="theme" value={thematicTheme} onChange={(e) => setThematicTheme(e.target.value)} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ej: Verano, Boda, Vintage" />
                        </div>
                    )}

                    {mode === 'video' && (
                        <div>
                            <label htmlFor="prompt" className="block text-sm font-medium text-slate-700 mb-1">2. Describe el video</label>
                            <textarea id="prompt" value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} rows={3} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ej: Un acercamiento lento a la joya sobre un fondo de terciopelo." />
                            <button onClick={() => checkApiKey(true)} className={`mt-2 text-sm flex items-center gap-1.5 ${hasSelectedApiKey ? 'text-green-600' : 'text-orange-600'}`}>
                                <KeyIcon className="w-4 h-4" />
                                {hasSelectedApiKey === null ? 'Verificando clave...' : hasSelectedApiKey ? 'Clave de API seleccionada' : 'Se requiere clave de API'}
                            </button>
                        </div>
                    )}

                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <>
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                          <span>Generando...</span>
                        </>
                      ) : (
                        'Generar'
                      )}
                    </button>
                    {videoStatus === 'processing' && (
                        <button
                          onClick={stopVideoGeneration}
                          className="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <StopIcon className="w-5 h-5" />
                            <span>Detener Generación de Video</span>
                        </button>
                    )}
                </div>
            )}
          </div>

          {/* Results Column */}
          <div className="bg-white p-6 rounded-xl shadow-lg">
            <h2 className="font-semibold text-lg mb-4">Resultados</h2>
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert"><p>{error}</p></div>}
            
            {isGenerating && !results.length && (
                <div className="text-center py-10">
                    <ArrowPathIcon className="mx-auto h-10 w-10 text-indigo-600 animate-spin" />
                    <p className="mt-4 text-slate-600">
                        {videoStatus === 'starting' ? 'Iniciando la generación de video...' : videoStatus === 'processing' ? 'Procesando video, esto puede tardar unos minutos...' : 'Procesando tu solicitud...'}
                    </p>
                </div>
            )}

            {results.length > 0 && (
              <div className={`grid gap-4 ${results.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {results.map((result, index) => (
                    <div key={index} className="relative group">
                        {result.type === 'image' ? (
                            <img src={result.url} alt={`Resultado generado ${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                            <video src={result.url} controls autoPlay loop className="w-full rounded-lg" />
                        )}
                        <a href={result.url} download={`resultado-${mode}-${index + 1}.${result.type === 'image' ? 'jpg' : 'mp4'}`} className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Descargar">
                            <DownloadIcon className="w-5 h-5" />
                        </a>
                    </div>
                ))}
              </div>
            )}

            {!isGenerating && results.length === 0 && !image && (
                <div className="text-center text-slate-500 py-10">
                    <p>Sube una imagen para comenzar.</p>
                </div>
            )}
            {!isGenerating && results.length === 0 && image && (
                <div className="text-center text-slate-500 py-10">
                    <p>Tus imágenes o videos generados aparecerán aquí.</p>
                </div>
            )}
          </div>
        </div>
      </main>
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onKeySelected={handleApiKeySelected}
      />
    </div>
  );
};

export default App;
