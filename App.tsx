import React, { useReducer, useCallback, useMemo, useRef, useState } from 'react';
import { enhanceJewelryImage } from './services/geminiService';
import { UploadIcon, DownloadIcon, SparklesIcon, XMarkIcon, ArrowPathIcon, KeyIcon, PhotoIcon, StopIcon } from './components/icons';
import { resizeImage } from './utils';

// --- TYPE DEFINITIONS & GLOBAL DECLARATIONS ---

type ImageFile = {
  base64: string;
  mimeType: string;
  name: string;
};

type ImageJob = {
  id: string;
  originalImage: ImageFile;
  status: 'pending' | 'processing' | 'processing_more' | 'success' | 'error';
  processedImages: string[];
  error: string | null;
};

type State = {
  jobs: ImageJob[];
  backgroundPrompt: string;
  isBatchProcessing: boolean;
};

type Action =
  | { type: 'UPLOAD_BATCH'; payload: ImageFile[] }
  | { type: 'SET_BACKGROUND_PROMPT'; payload: string }
  | { type: 'PROCESS_JOB_START'; payload: { jobId: string } }
  | { type: 'PROCESS_JOB_MORE_START'; payload: { jobId: string } }
  | { type: 'PROCESS_JOB_SUCCESS'; payload: { jobId: string; processedImages: string[] } }
  | { type: 'PROCESS_JOB_ERROR'; payload: { jobId: string; error: string } }
  | { type: 'START_BATCH_PROCESS' }
  | { type: 'END_BATCH_PROCESS' }
  | { type: 'RESET' };

// --- STATE MANAGEMENT ---

const initialState: State = {
  jobs: [],
  backgroundPrompt: '',
  isBatchProcessing: false,
};

function appReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'UPLOAD_BATCH':
      return {
        ...initialState,
        backgroundPrompt: state.backgroundPrompt,
        jobs: action.payload.map(file => ({
          id: crypto.randomUUID(),
          originalImage: file,
          status: 'pending',
          processedImages: [],
          error: null,
        })),
      };
    case 'SET_BACKGROUND_PROMPT':
      return { ...state, backgroundPrompt: action.payload };
    case 'PROCESS_JOB_START':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'processing', error: null } : job
        ),
      };
    case 'PROCESS_JOB_MORE_START':
        return {
            ...state,
            jobs: state.jobs.map(job =>
                job.id === action.payload.jobId ? { ...job, status: 'processing_more', error: null } : job
            ),
        };
    case 'PROCESS_JOB_SUCCESS':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'success', processedImages: action.payload.processedImages } : job
        ),
      };
    case 'PROCESS_JOB_ERROR':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'error', error: action.payload.error } : job
        ),
      };
    case 'START_BATCH_PROCESS':
      return { ...state, isBatchProcessing: true };
    case 'END_BATCH_PROCESS':
      return { ...state, isBatchProcessing: false };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// --- UI COMPONENTS ---

const Header: React.FC = () => (
  <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-20">
    <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center gap-3">
      <div className="p-2 bg-slate-800 rounded-lg">
        <SparklesIcon className="w-6 h-6 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
        Joyería Premium Enhancer
      </h1>
    </div>
  </header>
);

const ImageUploader: React.FC<{ onImageUpload: (files: File[]) => void; disabled: boolean }> = ({ onImageUpload, disabled }) => {
  const [isDragging, setIsDragging] = React.useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      onImageUpload(Array.from(files));
    }
  };

  const commonDragProps = {
    onDragEnter: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    },
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (!disabled) handleFileChange(e.dataTransfer.files);
    },
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg max-w-5xl mx-auto">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-300 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50/50'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-400'}`}
        {...commonDragProps}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input id="file-input" type="file" multiple className="hidden" accept="image/png, image/jpeg, image/webp" onChange={(e) => handleFileChange(e.target.files)} disabled={disabled} />
        <div className="flex flex-col items-center justify-center space-y-4 text-slate-600">
          <UploadIcon className="w-12 h-12 text-slate-400" />
          <p className="text-lg font-medium"><span className="text-blue-600 font-semibold">Sube una o más imágenes</span> o arrástralas aquí</p>
          <p className="text-sm text-slate-500">PNG, JPG, WEBP son soportados. Las imágenes grandes serán redimensionadas a 1024px.</p>
        </div>
      </div>
    </div>
  );
};

const JobCard: React.FC<{ job: ImageJob; onGenerateMore: (jobId: string) => void; onProcessJob: (jobId: string) => void; disabled: boolean; }> = ({ job, onGenerateMore, onProcessJob, disabled }) => {
  const originalImageSrc = useMemo(() => `data:${job.originalImage.mimeType};base64,${job.originalImage.base64}`, [job.originalImage]);

  const handleDownload = (base64Image: string, index: number) => {
    const link = document.createElement('a');
    const [name] = job.originalImage.name.split('.');
    link.href = base64Image;
    link.download = `${name}-enhanced-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="bg-white p-5 rounded-2xl shadow-lg relative overflow-hidden transition-all duration-300">
       <div className="flex flex-col md:flex-row gap-5">
            <div className="w-full md:w-1/4 flex-shrink-0">
                <div className="aspect-square bg-slate-100 rounded-xl overflow-hidden shadow-md flex items-center justify-center">
                    <img src={originalImageSrc} alt="Original" className="max-w-full max-h-full object-contain" />
                </div>
                <div className="mt-2 text-center">
                    <p className="text-sm font-medium truncate text-slate-800" title={job.originalImage.name}>{job.originalImage.name}</p>
                     <span className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                        job.status === 'pending' ? 'bg-slate-200 text-slate-700' :
                        job.status === 'processing' || job.status === 'processing_more' ? 'bg-yellow-100 text-yellow-800' :
                        job.status === 'success' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                    }`}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1).replace('_', ' ')}
                    </span>
                </div>
            </div>
            <div className="w-full md:w-3/4">
                {(job.status === 'processing' || job.status === 'processing_more') && (
                    <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 rounded-xl">
                        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="mt-3 text-slate-600 font-medium">{job.status === 'processing' ? 'Generando imagen principal...' : 'Generando variaciones...'}</p>
                    </div>
                )}
                {job.status === 'error' && (
                    <div className="h-full flex flex-col items-center justify-center bg-red-50/50 rounded-xl p-4">
                        <p className="font-bold text-red-700">Ocurrió un Error</p>
                        <p className="text-sm mt-1 text-red-600 text-center">{job.error}</p>
                        <button
                          onClick={() => onProcessJob(job.id)}
                          disabled={disabled}
                          className="mt-4 inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                        >
                          <ArrowPathIcon className="w-4 h-4 mr-1" />
                          Reintentar
                        </button>
                    </div>
                )}
                {job.status === 'success' && job.processedImages.length > 0 && (
                     <div className="flex flex-col h-full">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow">
                            {job.processedImages.map((imgSrc, index) => (
                               <div key={index} className="flex flex-col">
                                    <div className="relative w-full aspect-square bg-slate-100 rounded-xl overflow-hidden shadow-md flex items-center justify-center group">
                                        <img src={imgSrc} alt={`Resultado ${index + 1}`} className="max-w-full max-h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleDownload(imgSrc, index)} className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors" aria-label="Descargar imagen">
                                                <DownloadIcon className="w-6 h-6 text-white" />
                                            </button>
                                        </div>
                                    </div>
                                    <span className="text-center text-xs font-semibold mt-2 text-slate-600">Opción {index + 1}</span>
                               </div>
                            ))}
                        </div>
                        {job.processedImages.length < 3 && (
                            <div className="mt-4 text-center">
                                <button
                                    onClick={() => onGenerateMore(job.id)}
                                    disabled={disabled}
                                    className="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    <SparklesIcon className="-ml-1 mr-2 h-5 w-5" />
                                    Generar más opciones
                                </button>
                            </div>
                        )}
                    </div>
                )}
                 {job.status === 'pending' && (
                    <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 rounded-xl p-4">
                      <PhotoIcon className="h-8 w-8 text-slate-400" />
                      <p className="mt-3 text-slate-600 font-medium text-center">Listo para realzar</p>
                      <button
                        onClick={() => onProcessJob(job.id)}
                        disabled={disabled}
                        className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
                      >
                          <SparklesIcon className="w-5 h-5 mr-2" />
                          Realzar
                      </button>
                    </div>
                 )}
            </div>
       </div>
    </div>
  )
};

// --- MAIN APP ---

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { jobs, backgroundPrompt, isBatchProcessing } = state;
  const cancelBatchRef = useRef(false);

  const isLoading = useMemo(() => jobs.some(j => j.status === 'processing' || j.status === 'processing_more'), [jobs]);
  const pendingJobsCount = useMemo(() => jobs.filter(j => j.status === 'pending').length, [jobs]);

  const handleImageUpload = useCallback(async (files: File[]) => {
    const imageFiles: Promise<ImageFile>[] = files.map(async file => {
        const { base64, mimeType } = await resizeImage(file, 1024);
        return { base64, mimeType, name: file.name };
    });

    try {
        const results = await Promise.all(imageFiles);
        dispatch({ type: 'UPLOAD_BATCH', payload: results });
    } catch (error) {
        console.error("Error resizing images:", error);
        // You could dispatch an error to show in the UI here
    }
  }, []);
  
  const handleReset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const handleSetPrompt = useCallback((prompt: string) => dispatch({ type: 'SET_BACKGROUND_PROMPT', payload: prompt }), []);
  
  const handleProcessJob = useCallback(async (jobId: string) => {
    const job = state.jobs.find(j => j.id === jobId);
    if (!job || !backgroundPrompt.trim() || job.status === 'processing' || job.status === 'processing_more') return;

    dispatch({ type: 'PROCESS_JOB_START', payload: { jobId } });
    try {
      const results = await enhanceJewelryImage(job.originalImage.base64, job.originalImage.mimeType, backgroundPrompt, [0]);
      dispatch({ type: 'PROCESS_JOB_SUCCESS', payload: { jobId, processedImages: results.map(r => `data:image/png;base64,${r}`) } });
    } catch (e: any) {
      console.error(e);
      dispatch({ type: 'PROCESS_JOB_ERROR', payload: { jobId, error: e.message } });
    }
  }, [state.jobs, backgroundPrompt]);

  const handleGenerateMore = useCallback(async (jobId: string) => {
    const job = state.jobs.find(j => j.id === jobId);
    if (!job || isLoading || !backgroundPrompt.trim() || job.processedImages.length === 0) return;

    dispatch({ type: 'PROCESS_JOB_MORE_START', payload: { jobId }});
    try {
        const additionalResults = await enhanceJewelryImage(job.originalImage.base64, job.originalImage.mimeType, backgroundPrompt, [1, 2]);
        const allImages = [
            ...job.processedImages,
            ...additionalResults.map(r => `data:image/png;base64,${r}`)
        ];
        dispatch({ type: 'PROCESS_JOB_SUCCESS', payload: { jobId, processedImages: allImages }});
    } catch (e: any) {
        console.error(e);
        dispatch({ type: 'PROCESS_JOB_ERROR', payload: { jobId, error: e.message }});
    }
  }, [state.jobs, backgroundPrompt, isLoading]);

  const handleProcessAllJobs = useCallback(async () => {
    if (!backgroundPrompt.trim() || isLoading) return;
    
    cancelBatchRef.current = false;
    dispatch({ type: 'START_BATCH_PROCESS' });

    const pendingJobs = state.jobs.filter(j => j.status === 'pending');
    for (const job of pendingJobs) {
      if (cancelBatchRef.current) {
        console.log("Batch processing cancelled by user.");
        break;
      }
      await handleProcessJob(job.id);
      await new Promise(res => setTimeout(res, 5000));
    }
    
    dispatch({ type: 'END_BATCH_PROCESS' });
  }, [state.jobs, backgroundPrompt, isLoading, handleProcessJob]);

  const handleCancelBatch = () => {
    cancelBatchRef.current = true;
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <Header />
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Eleva la Presentación de tus Joyas</h2>
          <p className="mt-4 text-lg text-slate-600 max-w-3xl mx-auto">
            Sube tus fotos, describe el fondo que deseas y nuestra IA generará opciones para cada pieza.
          </p>
        </div>

        {jobs.length === 0 ? (
            <ImageUploader onImageUpload={handleImageUpload} disabled={isLoading} />
        ) : (
          <div>
            <div className="bg-white p-6 rounded-2xl shadow-lg max-w-3xl mx-auto mb-8">
              <label htmlFor="background-prompt" className="block text-lg font-semibold text-slate-800 text-center mb-4">
                Paso 1: Describe el fondo deseado
              </label>
               <input
                  type="text"
                  id="background-prompt"
                  value={backgroundPrompt}
                  onChange={(e) => handleSetPrompt(e.target.value)}
                  disabled={isLoading}
                  placeholder="Ej: Mármol blanco con vetas doradas, tela de seda..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow disabled:bg-slate-100"
                  aria-label="Tema para los fondos"
                />
            </div>

            <div className="text-center my-10">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Paso 2: Inicia el proceso de realce</h3>
                <p className="text-slate-500 mb-6 max-w-xl mx-auto">Puedes realzar las imágenes una por una o procesar todas las pendientes en un lote.</p>
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={handleProcessAllJobs}
                        disabled={isLoading || !backgroundPrompt.trim() || pendingJobsCount === 0 || isBatchProcessing}
                        className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-semibold rounded-full shadow-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all transform hover:scale-105"
                    >
                        <SparklesIcon className="-ml-1 mr-3 h-6 w-6" />
                        Realzar Todas ({pendingJobsCount})
                    </button>
                    {isBatchProcessing && (
                      <button
                        onClick={handleCancelBatch}
                        className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-full shadow-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        aria-label="Detener el procesamiento por lotes"
                      >
                        <StopIcon className="mr-2 h-5 w-5" />
                        Detener
                      </button>
                    )}
                </div>
            </div>

            <div className="space-y-6">
              {jobs.map(job => (
                <JobCard 
                  key={job.id} 
                  job={job}
                  onGenerateMore={handleGenerateMore}
                  onProcessJob={handleProcessJob}
                  disabled={isLoading || !backgroundPrompt.trim()}
                />
              ))}
            </div>

             <div className="mt-12 text-center">
                <button
                    onClick={handleReset}
                    className="inline-flex items-center justify-center px-6 py-3 border border-slate-300 text-base font-medium rounded-full shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                    <ArrowPathIcon className="-ml-1 mr-2 h-5 w-5" />
                    Empezar de nuevo
                </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}