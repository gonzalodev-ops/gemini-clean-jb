
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
  ArrowPathIcon,
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
  const [theme, setTheme] = useState('Tropical Summer');
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
    <div className="bg-slate-100 min-h-screen font-sans text-slate-800">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Estudio de Fotografía de Joyería con IA</h1>
          <p className="mt-4 text-lg text-slate-600">Transforma tus fotos de productos con el poder de Gemini.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* --- INPUT & CONTROLS --- */}
          {jobs.length === 0 ? (
            <div className="lg:col-span-2 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-12 text-center bg-white">
              <UploadIcon className="w-12 h-12 text-slate-400" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">Sube tus fotos de producto</h3>
              <p className="mt-1 text-sm text-slate-500">Puedes seleccionar varios archivos a la vez para procesarlos en lote.</p>
              <button onClick={triggerFileSelect} className="mt-6 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                Seleccionar Archivos
              </button>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
            </div>
          ) : (
            <>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 self-start space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-slate-900">Imagen Original</h2>
                    <button onClick={handleClearAll} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5">
                      <ArrowPathIcon className="w-4 h-4" /> Empezar de nuevo
                    </button>
                  </div>
                  <div className="aspect-square bg-slate-100 rounded-lg overflow-hidden">
                    <img src={jobs[0].source.url} alt="Producto principal" className="w-full h-full object-cover" />
                  </div>
                </div>

                <div className="space-y-4">
                   {isAnyJobProcessing && (
                    <div className="pt-2">
                        <button onClick={handleStopGeneration} className="w-full bg-red-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                            <StopIcon className="w-5 h-5" />
                            Detener Generación
                        </button>
                    </div>
                   )}
                  {/* Catalog Section */}
                  <div className="border-t border-slate-200 pt-5">
                      <div className="flex items-start gap-4">
                          <div className="text-indigo-600 flex-shrink-0"><PhotoIcon className="w-6 h-6"/></div>
                          <div>
                              <h3 className="font-semibold text-slate-800">Foto de Catálogo</h3>
                              <p className="text-sm text-slate-500 mt-1 mb-3">Genera una imagen limpia y profesional sobre un fondo neutro, perfecta para tu tienda online.</p>
                          </div>
                      </div>
                      <button onClick={handleGenerateCatalog} disabled={isAnyJobProcessing} className="w-full bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                          <SparklesIcon className="w-5 h-5"/>
                          {jobs.some(j => j.loading.catalog) ? 'Generando...' : 'Generar'}
                      </button>
                  </div>

                  {/* Thematic Section */}
                  <div className="border-t border-slate-200 pt-5">
                      <div className="flex items-start gap-4">
                          <div className="text-amber-500 flex-shrink-0"><SparklesIcon className="w-6 h-6"/></div>
                          <div>
                              <h3 className="font-semibold text-slate-800">Fotos de Temporada</h3>
                              <p className="text-sm text-slate-500 mt-1">Crea 3 imágenes creativas y temáticas para tus campañas de marketing o redes sociales.</p>
                          </div>
                      </div>
                      <div className="mt-3">
                        <ThemeSelector theme={theme} setTheme={setTheme} disabled={isAnyJobProcessing} />
                      </div>
                      <button onClick={handleGenerateThematic} disabled={isAnyJobProcessing} className="w-full mt-3 bg-amber-500 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-amber-600 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                          <SparklesIcon className="w-5 h-5"/>
                          {jobs.some(j => j.loading.thematic) ? 'Generando...' : 'Generar 3 Estilos'}
                      </button>
                  </div>

                  {/* Video Section */}
                  <div className="border-t border-slate-200 pt-5">
                      <div className="flex items-start gap-4">
                          <div className="text-slate-500 flex-shrink-0"><VideoCameraIcon className="w-6 h-6"/></div>
                          <div>
                              <h3 className="font-semibold text-slate-800">Video de Presentación</h3>
                              <p className="text-sm text-slate-500 mt-1">Crea un video corto y dinámico para destacar tu producto.</p>
                          </div>
                      </div>
                      <div className="mt-3">
                        <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} disabled={isAnyJobProcessing} rows={2} className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"></textarea>
                      </div>
                      <button onClick={handleGenerateVideo} disabled={isAnyJobProcessing} className="w-full mt-3 bg-slate-800 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-slate-900 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                          <VideoCameraIcon className="w-5 h-5"/>
                          {jobs.some(j => j.loading.video) ? 'Generando...' : 'Generar Video'}
                      </button>
                  </div>
                </div>
              </div>

              {/* --- RESULTS --- */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Resultados Generados</h2>
                {jobs.every(j => !j.catalogImage && j.thematicImages.length === 0 && !j.videoResult && !isAnyJobProcessing) ? (
                  <div className="bg-slate-50 rounded-lg flex items-center justify-center text-center h-[500px]">
                    <p className="text-slate-500">Tus imágenes y videos aparecerán aquí.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {jobs.map(job => <ResultCard key={job.id} job={job} totalJobs={jobs.length} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

// --- SUB-COMPONENTS ---
const ResultCard: React.FC<{ job: ImageJob; totalJobs: number }> = ({ job, totalJobs }) => {
    // FIX: Extract filename robustly. `job.id` is `filename-timestamp`.
    const filename = job.id.slice(0, job.id.lastIndexOf('-'));
    return (
    <div className="border-b border-slate-200 pb-8 last:border-b-0 last:pb-0">
         <div className="flex items-center gap-3 mb-4">
            <img src={job.source.url} className="w-16 h-16 rounded-md object-cover flex-shrink-0" />
            <div className='min-w-0'>
              {/* FIX: Display the actual filename instead of a blob URL's UUID. */}
              <h3 className="font-semibold text-slate-700 truncate text-sm">{filename}</h3>
              {/* FIX: `jobs` is not in scope here. Use `totalJobs` prop. The original sub-text was redundant with filename in title. */}
              {totalJobs > 1 && <p className="text-xs text-slate-500">Procesando...</p>}
            </div>
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
};

const ResultSection: React.FC<{ title: string, isLoading: boolean, children: React.ReactNode }> = ({ title, isLoading, children }) => {
    const hasContent = React.Children.count(children) > 0;
    if (!isLoading && !hasContent) {
        return null;
    }
    return (
      <div>
          <h4 className="text-md font-semibold text-slate-600 mb-2">{title}</h4>
          {isLoading && <LoadingSpinner />}
          {!isLoading && children}
      </div>
    );
};

const ImageResult: React.FC<{ src: string, alt: string }> = ({ src, alt }) => (
    <div className="group relative">
        <img src={src} alt={alt} className="w-full rounded-lg shadow-md" />
        <a href={src} download={`${alt.replace(/\s+/g, '_')}.png`} className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100">
            <DownloadIcon className="w-5 h-5" />
        </a>
    </div>
);

const VideoResultPlayer: React.FC<{url: string}> = ({url}) => (
    <div className="relative group">
        <video src={url} controls autoPlay loop className="w-full rounded-lg shadow-md"></video>
         <a href={url} download="presentacion_producto.mp4" className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100">
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