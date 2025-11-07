import React, { useState, useCallback, useRef, useEffect } from 'react';
import { resizeImage } from './utils';
import ThemeSelector from './components/ThemeSelector';
import {
  UploadIcon,
  SparklesIcon,
  DownloadIcon,
  XMarkIcon,
  PhotoIcon,
  VideoCameraIcon,
  TrashIcon,
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

type ImageJob = {
  id: string;
  source: SourceImage;
  catalogImage: string | null;
  thematicImages: string[];
  videoResult: VideoResult | null;
  loading: LoadingState;
  error: string | null;
};

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [theme, setTheme] = useState('Navidad');
  const [videoPrompt, setVideoPrompt] = useState('Una animación cinematográfica y elegante del producto, con suaves movimientos de cámara e iluminación de estudio.');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoCheckIntervalsRef = useRef<Map<string, number>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const isAnyJobProcessing = jobs.some(j => j.loading.catalog || j.loading.thematic || j.loading.video);

  // --- JOB MANAGEMENT UTILITIES ---
  const updateJob = useCallback((id: string, updates: Partial<Omit<ImageJob, 'id' | 'source'>>) => {
    setJobs(prevJobs =>
      prevJobs.map(job => (job.id === id ? { ...job, ...updates } : job))
    );
  }, []);

  // --- EFFECTS ---
   useEffect(() => {
    const intervals = videoCheckIntervalsRef.current;
    
    const checkVideoStatus = async (job: ImageJob) => {
      if (!job.videoResult?.operation) return;
      try {
        const response = await fetch('/api/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: job.videoResult.operation }),
        });
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        
        const result = await response.json();

        if (result.status === 'done') {
            updateJob(job.id, { videoResult: { status: 'done', videoUrl: result.videoUrl }, loading: { ...job.loading, video: false }});
        } else if (result.status === 'done_no_uri' || result.status === 'failed') {
            updateJob(job.id, { error: 'La generación del video finalizó, pero no se pudo obtener el resultado.', videoResult: null, loading: { ...job.loading, video: false }});
        } else {
            updateJob(job.id, { videoResult: { ...job.videoResult, operation: result.operation } as VideoResult });
        }
      } catch (e: any) {
        updateJob(job.id, { error: `Error al verificar el estado del video: ${e.message}`, videoResult: null, loading: { ...job.loading, video: false }});
      }
    };

    jobs.forEach(job => {
      if (job.videoResult?.status === 'processing' && !intervals.has(job.id)) {
        const intervalId = window.setInterval(() => checkVideoStatus(job), 10000);
        intervals.set(job.id, intervalId);
      } else if (job.videoResult?.status !== 'processing' && intervals.has(job.id)) {
        clearInterval(intervals.get(job.id));
        intervals.delete(job.id);
      }
    });

    return () => {
      intervals.forEach(intervalId => clearInterval(intervalId));
    };
  }, [jobs, updateJob]);


  // --- HANDLERS ---
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newJobsPromises = Array.from(files).map(async (file: File) => {
      try {
        const { base64, mimeType } = await resizeImage(file, 1024);
        const newJob: ImageJob = {
          id: `${file.name}-${Date.now()}`,
          source: { url: URL.createObjectURL(file), base64, mimeType },
          catalogImage: null,
          thematicImages: [],
          videoResult: null,
          loading: { catalog: false, thematic: false, video: false },
          error: null,
        };
        return newJob;
      } catch (err) {
        console.error("Error processing file:", file.name, err);
        return null;
      }
    });
    
    const settledJobs = (await Promise.all(newJobsPromises)).filter(Boolean) as ImageJob[];
    setJobs(prev => [...prev, ...settledJobs]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);
  
  const handleClearAll = useCallback(() => {
    jobs.forEach(job => URL.revokeObjectURL(job.source.url));
    videoCheckIntervalsRef.current.forEach(id => clearInterval(id));
    videoCheckIntervalsRef.current.clear();
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();
    setJobs([]);
  }, [jobs]);

  const handleRemoveJob = useCallback((idToRemove: string) => {
    setJobs(prev => {
        const jobToRemove = prev.find(j => j.id === idToRemove);
        if (jobToRemove) {
            URL.revokeObjectURL(jobToRemove.source.url);
            const intervalId = videoCheckIntervalsRef.current.get(idToRemove);
            if(intervalId) {
                clearInterval(intervalId);
                videoCheckIntervalsRef.current.delete(idToRemove);
            }
            const controller = abortControllersRef.current.get(idToRemove);
            if (controller) {
                controller.abort();
                abortControllersRef.current.delete(idToRemove);
            }
        }
        return prev.filter(job => job.id !== idToRemove);
    });
  }, []);

  const handleStopGeneration = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();
    setJobs(prev => prev.map(j => ({
      ...j,
      loading: { catalog: false, thematic: false, video: false }
    })));
  }, []);

  const createApiHandler = (
    type: keyof LoadingState,
    apiEndpoint: string,
    getBody: (job: ImageJob) => Record<string, any>,
    resultUpdater: (job: ImageJob, result: any) => Partial<ImageJob>
  ) => async () => {
    jobs.forEach(async (job) => {
      const controller = new AbortController();
      abortControllersRef.current.set(job.id, controller);

      updateJob(job.id, {
        loading: { ...job.loading, [type]: true },
        error: null,
        ...(type === 'catalog' && { catalogImage: null }),
        ...(type === 'thematic' && { thematicImages: [] }),
        ...(type === 'video' && { videoResult: null }),
      });

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getBody(job)),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Server responded with ${response.status}`);
        }
        
        const result = await response.json();
        const update = resultUpdater(job, result);
        updateJob(job.id, { ...update, loading: { ...job.loading, [type]: false } });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log(`Generation for job ${job.id} was cancelled.`);
          updateJob(job.id, { error: 'Generación cancelada.', loading: { ...job.loading, [type]: false }});
        } else {
          console.error(`Error processing job ${job.id} for ${type}:`, err);
          updateJob(job.id, { error: `Error en ${type}: ${err.message}`, loading: { ...job.loading, [type]: false } });
        }
      } finally {
         abortControllersRef.current.delete(job.id);
      }
    });
  };

  const handleGenerateCatalog = createApiHandler(
    'catalog',
    '/api/catalog',
    (job) => ({ base64Image: job.source.base64, mimeType: job.source.mimeType }),
    (_, result) => ({ catalogImage: result.images[0] })
  );

  const handleGenerateThematic = createApiHandler(
    'thematic',
    '/api/thematic',
    (job) => ({ base64Image: job.source.base64, mimeType: job.source.mimeType, theme }),
    (_, result) => ({ thematicImages: result.images })
  );

  const handleGenerateVideo = createApiHandler(
    'video',
    '/api/video-generate',
    (job) => ({ base64Image: job.source.base64, mimeType: job.source.mimeType, prompt: videoPrompt }),
    (_, result) => ({ videoResult: { status: 'processing', operation: result.operation } })
  );

  const triggerFileSelect = () => fileInputRef.current?.click();

  // --- RENDER LOGIC ---
  return (
    <>
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
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 self-start">
              {jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-12 text-center">
                  <UploadIcon className="w-12 h-12 text-slate-400" />
                  <h3 className="mt-4 text-lg font-medium text-slate-900">Sube tus fotos de producto</h3>
                  <p className="mt-1 text-sm text-slate-500">Puedes seleccionar varios archivos a la vez.</p>
                  <button onClick={triggerFileSelect} className="mt-4 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                    Seleccionar Archivos
                  </button>
                  <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-semibold text-slate-800">Imágenes Cargadas ({jobs.length})</h2>
                      <button onClick={handleClearAll} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                          <TrashIcon className="w-4 h-4" /> Limpiar Todo
                      </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-6">
                    {jobs.map(job => (
                      <div key={job.id} className="relative group">
                        <img src={job.source.url} alt="Producto" className="aspect-square w-full rounded-md object-cover" />
                        <button onClick={() => handleRemoveJob(job.id)} className="absolute top-1 right-1 bg-black bg-opacity-50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {jobs.length > 0 && (
                <div className="space-y-6">
                   {isAnyJobProcessing && (
                    <div className="mt-4">
                        <button onClick={handleStopGeneration} className="w-full bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                            <StopIcon className="w-5 h-5" />
                            Detener Generación
                        </button>
                    </div>
                   )}
                  <ControlPanel
                    title="Foto de Catálogo"
                    icon={<PhotoIcon className="w-5 h-5 text-slate-500"/>}
                    description="Genera una imagen limpia con fondo neutro, perfecta para tu tienda online."
                    onGenerate={handleGenerateCatalog}
                    buttonText="Generar Catálogo"
                    isProcessing={jobs.some(j => j.loading.catalog)}
                    isDisabled={isAnyJobProcessing}
                  />
                  <ControlPanel
                    title="Fotos de Temporada"
                    icon={<SparklesIcon className="w-5 h-5 text-slate-500"/>}
                    description="Crea composiciones creativas para campañas de marketing y redes sociales."
                    onGenerate={handleGenerateThematic}
                    buttonText="Generar 3 Estilos"
                    isProcessing={jobs.some(j => j.loading.thematic)}
                    isDisabled={isAnyJobProcessing}
                  >
                    <ThemeSelector theme={theme} setTheme={setTheme} disabled={isAnyJobProcessing} />
                  </ControlPanel>
                  <ControlPanel
                    title="Video de Presentación"
                    icon={<VideoCameraIcon className="w-5 h-5 text-slate-500"/>}
                    description="Crea un video corto y dinámico para destacar tu producto."
                    onGenerate={handleGenerateVideo}
                    buttonText="Generar Video"
                    isProcessing={jobs.some(j => j.loading.video)}
                    isDisabled={isAnyJobProcessing}
                  >
                    <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} disabled={isAnyJobProcessing} rows={2} className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"></textarea>
                  </ControlPanel>
                </div>
              )}
            </div>

            {/* --- RESULTS --- */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Resultados</h2>
                {jobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                        <PhotoIcon className="w-16 h-16 text-slate-300"/>
                        <p className="mt-4">Los resultados de tus generaciones aparecerán aquí.</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {jobs.map(job => <ResultCard key={job.id} job={job} />)}
                    </div>
                )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

// --- SUB-COMPONENTS ---

const ControlPanel: React.FC<{
  title: string,
  icon: React.ReactNode,
  description: string,
  onGenerate: () => void,
  buttonText: string,
  isProcessing: boolean,
  isDisabled: boolean,
  children?: React.ReactNode
}> = ({ title, icon, description, onGenerate, buttonText, isProcessing, isDisabled, children }) => (
    <div className="p-4 border border-slate-200 rounded-lg">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">{icon} {title}</h3>
                <p className="text-sm text-slate-500 mt-1 mb-3">{description}</p>
            </div>
        </div>
        {children}
        <button onClick={onGenerate} disabled={isDisabled} className="w-full mt-3 bg-slate-800 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-900 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {isProcessing ? 'Procesando...' : buttonText}
        </button>
    </div>
);

const ResultCard: React.FC<{ job: ImageJob }> = ({ job }) => (
    <div className="border-b border-slate-200 pb-8 last:border-b-0">
         <div className="flex items-center gap-3 mb-4">
            <img src={job.source.url} className="w-16 h-16 rounded-md object-cover" />
            <h3 className="font-semibold text-slate-700 truncate">{job.source.url.split('/').pop()}</h3>
        </div>

        {job.error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded-md mb-4 text-sm" role="alert">
                <p><strong className="font-bold">Error:</strong> {job.error}</p>
            </div>
        )}
        
        <div className="space-y-4">
            <ResultSection title="Catálogo" isLoading={job.loading.catalog}>
                {job.catalogImage && <ImageResult src={`data:image/png;base64,${job.catalogImage}`} alt="Imagen de catálogo" />}
            </ResultSection>

            <ResultSection title="Temporada" isLoading={job.loading.thematic}>
                {job.thematicImages.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {job.thematicImages.map((img, i) => <ImageResult key={i} src={`data:image/png;base64,${img}`} alt={`Imagen de temporada ${i + 1}`} />)}
                    </div>
                )}
            </ResultSection>

            <ResultSection title="Video" isLoading={job.loading.video}>
                {job.videoResult?.status === 'done' && job.videoResult.videoUrl && (
                    <VideoResultPlayer url={job.videoResult.videoUrl} />
                )}
                 {job.loading.video && <p className="text-sm text-slate-500 text-center">La generación de video puede tardar varios minutos...</p>}
            </ResultSection>
        </div>
    </div>
);

const ResultSection: React.FC<{ title: string, isLoading: boolean, children: React.ReactNode }> = ({ title, isLoading, children }) => (
    <div>
        <h4 className="text-md font-semibold text-slate-600 mb-2">{title}</h4>
        {isLoading && <LoadingSpinner />}
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

const VideoResultPlayer: React.FC<{url: string}> = ({url}) => (
    <div className="relative">
        <video src={url} controls autoPlay loop className="w-full rounded-lg shadow-md"></video>
         <a href={url} download="presentacion_producto.mp4" className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-colors">
            <DownloadIcon className="w-5 h-5" />
        </a>
    </div>
);

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center h-24 bg-slate-100 rounded-lg">
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Procesando...</span>
    </div>
);

export default App;
