import React, { useReducer, useCallback, useMemo, useState, useEffect } from 'react';
import { UploadIcon, DownloadIcon, SparklesIcon, ArrowPathIcon, PhotoIcon, VideoCameraIcon, XMarkIcon, KeyIcon, StopIcon } from './components/icons';
import { resizeImage } from './utils';
import ApiKeyModal from './components/ApiKeyModal';

// --- CONSTANTS ---
// Esta clave es para autorizar las peticiones del frontend a tu backend en Vercel.
// Debe coincidir EXACTAMENTE con el valor de la variable de entorno `SERVER_API_KEY` que configures en Vercel.
const SERVER_API_KEY = 'xPPkpdDu4A_fRL8PBRNfwKFqwsrrYXqEz3G7uVUL!xCFtT2jm_T3avo3zCPrP';

// --- TYPE DEFINITIONS ---
type ImageFile = {
  base64: string;
  mimeType: string;
  name: string;
};

type JobStatus = 'pending_selection' | 'awaiting_theme' | 'processing' | 'success' | 'error' | 'awaiting_video_prompt' | 'processing_video' | 'success_video';
type VideoJobStatus = 'idle' | 'starting' | 'processing' | 'done' | 'error';


type ImageJob = {
  id: string;
  originalImage: ImageFile;
  status: JobStatus;
  processedImages: string[];
  processedVideoUrl: string | null;
  error: string | null;
  theme: string;
  videoPrompt: string;
  videoOperation: any | null;
  videoStatus: VideoJobStatus;
};

type State = {
  jobs: ImageJob[];
};

type Action =
  | { type: 'UPLOAD_BATCH'; payload: ImageFile[] }
  | { type: 'SELECT_MODE'; payload: { jobId: string; mode: 'catalog' | 'thematic' } }
  | { type: 'SELECT_VIDEO_MODE'; payload: { jobId: string } }
  | { type: 'SET_JOB_THEME'; payload: { jobId: string; theme: string } }
  | { type: 'SET_VIDEO_PROMPT'; payload: { jobId: string; prompt: string } }
  | { type: 'PROCESS_JOB_START'; payload: { jobId: string } }
  | { type: 'PROCESS_VIDEO_START'; payload: { jobId: string } }
  | { type: 'PROCESS_JOB_SUCCESS'; payload: { jobId: string; processedImages: string[] } }
  | { type: 'PROCESS_VIDEO_SUCCESS'; payload: { jobId: string; videoUrl: string } }
  | { type: 'PROCESS_JOB_ERROR'; payload: { jobId: string; error: string } }
  | { type: 'UPDATE_VIDEO_OPERATION'; payload: { jobId: string; operation: any } }
  | { type: 'UPDATE_VIDEO_STATUS'; payload: { jobId: string; status: VideoJobStatus } }
  | { type: 'RETRY_JOB'; payload: { jobId: string } }
  | { type: 'RESET' };

// --- API HELPER ---

async function apiFetch(body: Record<string, any>) {
    const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVER_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'La respuesta de la red no fue correcta.' }));
        throw new Error(errorData.error || `Error HTTP: ${response.status}`);
    }
    return response.json();
}

// --- STATE MANAGEMENT ---

const initialState: State = {
  jobs: [],
};

function appReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'UPLOAD_BATCH':
      return {
        ...state,
        jobs: action.payload.map(file => ({
          id: crypto.randomUUID(),
          originalImage: file,
          status: 'pending_selection',
          processedImages: [],
          processedVideoUrl: null,
          error: null,
          theme: 'Navidad',
          videoPrompt: 'Una toma elegante en cámara lenta de la joya, con efectos de luz brillante.',
          videoOperation: null,
          videoStatus: 'idle',
        })),
      };
    case 'SELECT_MODE':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId
            ? { ...job, status: action.payload.mode === 'thematic' ? 'awaiting_theme' : job.status }
            : job
        ),
      };
    case 'SELECT_VIDEO_MODE':
      return {
        ...state,
        jobs: state.jobs.map(job => job.id === action.payload.jobId ? { ...job, status: 'awaiting_video_prompt' } : job),
      };
    case 'SET_JOB_THEME':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, theme: action.payload.theme } : job
        ),
      };
    case 'SET_VIDEO_PROMPT':
      return {
        ...state,
        jobs: state.jobs.map(job => job.id === action.payload.jobId ? { ...job, videoPrompt: action.payload.prompt } : job),
      };
    case 'PROCESS_JOB_START':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'processing', error: null } : job
        ),
      };
    case 'PROCESS_VIDEO_START':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'processing_video', error: null, videoStatus: 'starting' } : job
        ),
      };
    case 'PROCESS_JOB_SUCCESS':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'success', processedImages: action.payload.processedImages } : job
        ),
      };
    case 'PROCESS_VIDEO_SUCCESS':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'success_video', videoStatus: 'done', processedVideoUrl: action.payload.videoUrl, videoOperation: null } : job
        ),
      };
    case 'PROCESS_JOB_ERROR':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'error', videoStatus: 'error', error: action.payload.error } : job
        ),
      };
    case 'UPDATE_VIDEO_OPERATION':
        return {
            ...state,
            jobs: state.jobs.map(job =>
                job.id === action.payload.jobId ? { ...job, videoOperation: action.payload.operation } : job
            ),
        };
    case 'UPDATE_VIDEO_STATUS':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? {...job, videoStatus: action.payload.status} : job
        ),
      };
    case 'RETRY_JOB':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'pending_selection', error: null, processedImages: [], processedVideoUrl: null, videoOperation: null, videoStatus: 'idle' } : job
        ),
      };
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
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Estudio de Fotografía de Joyería con IA</h1>
    </div>
  </header>
);

const ImageUploader: React.FC<{ onImageUpload: (files: File[]) => void; disabled: boolean }> = ({ onImageUpload, disabled }) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const handleFileChange = (files: FileList | null) => files && files.length > 0 && onImageUpload(Array.from(files));

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    else if (e.type === "dragleave") setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFileChange(e.dataTransfer.files);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
      <label
        htmlFor="file-upload"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`flex justify-center w-full h-48 px-6 pt-5 pb-6 border-2 ${isDragging ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300'} border-dashed rounded-md transition-colors duration-200 ease-in-out ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <div className="space-y-1 text-center self-center">
          <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-indigo-600">Sube tus archivos</span> o arrastra y suelta
          </p>
          <p className="text-xs text-slate-500">PNG, JPG, GIF hasta 10MB</p>
        </div>
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          className="sr-only"
          multiple
          accept="image/*"
          disabled={disabled}
          onChange={(e) => handleFileChange(e.target.files)}
        />
      </label>
    </div>
  );
};

const VideoPollingComponent: React.FC<{ job: ImageJob; dispatch: React.Dispatch<Action> }> = ({ job, dispatch }) => {
    useEffect(() => {
        if (job.status !== 'processing_video' || !job.videoOperation) return;

        dispatch({ type: 'UPDATE_VIDEO_STATUS', payload: { jobId: job.id, status: 'processing' } });
        const intervalId = setInterval(async () => {
            try {
                const result = await apiFetch({ mode: 'video_check', operation: job.videoOperation });
                if (result.status === 'done') {
                    dispatch({ type: 'PROCESS_VIDEO_SUCCESS', payload: { jobId: job.id, videoUrl: result.videoUrl } });
                    clearInterval(intervalId);
                } else if (result.status === 'processing') {
                    dispatch({ type: 'UPDATE_VIDEO_OPERATION', payload: { jobId: job.id, operation: result.operation } });
                } else {
                     throw new Error('El procesamiento del video finalizó sin una URL válida.');
                }
            } catch (error: any) {
                dispatch({ type: 'PROCESS_JOB_ERROR', payload: { jobId: job.id, error: error.message } });
                clearInterval(intervalId);
            }
        }, 10000); // Poll every 10 seconds

        return () => clearInterval(intervalId);
    }, [job.id, job.status, job.videoOperation, dispatch]);

    const getStatusMessage = () => {
        switch (job.videoStatus) {
            case 'starting': return 'Iniciando la generación de video...';
            case 'processing': return 'Procesando video, esto puede tardar unos minutos...';
            default: return 'Preparando para procesar...';
        }
    };

    return (
        <div className="text-center p-4">
            <ArrowPathIcon className="mx-auto h-8 w-8 text-indigo-600 animate-spin" />
            <p className="mt-2 text-sm text-slate-600">{getStatusMessage()}</p>
            <p className="text-xs text-slate-500 mt-1">Puedes dejar esta página abierta.</p>
             <button
                onClick={() => {
                  // Basic stop functionality
                   dispatch({ type: 'RETRY_JOB', payload: { jobId: job.id } })
                }}
                className="mt-4 w-full bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <StopIcon className="w-5 h-5" />
                <span>Cancelar</span>
              </button>
        </div>
    );
};


const JobCard: React.FC<{ job: ImageJob; dispatch: React.Dispatch<Action>; onProcess: (jobId: string, mode: 'catalog' | 'thematic') => void; onGenerateVideo: (jobId:string) => void; }> = ({ job, dispatch, onProcess, onGenerateVideo }) => {
  const { id, originalImage, status, processedImages, processedVideoUrl, error, theme, videoPrompt } = job;

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_JOB_THEME', payload: { jobId: id, theme: e.target.value } });
  };
  
  const handleVideoPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch({ type: 'SET_VIDEO_PROMPT', payload: { jobId: id, prompt: e.target.value } });
  };

  const renderContent = () => {
    switch (status) {
      case 'pending_selection':
      case 'awaiting_theme':
      case 'awaiting_video_prompt':
        return (
          <div className="p-4 flex flex-col items-center">
            {status === 'pending_selection' && (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                    <button onClick={() => onProcess(id, 'catalog')} className="flex items-center justify-center gap-2 w-full bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-700 transition-colors">
                        <PhotoIcon className="w-5 h-5" /> Catálogo
                    </button>
                    <button onClick={() => dispatch({ type: 'SELECT_MODE', payload: { jobId: id, mode: 'thematic' } })} className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                        <SparklesIcon className="w-5 h-5" /> Temática
                    </button>
                    <button onClick={() => dispatch({ type: 'SELECT_VIDEO_MODE', payload: { jobId: id } })} className="flex items-center justify-center gap-2 w-full bg-rose-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-rose-700 transition-colors">
                        <VideoCameraIcon className="w-5 h-5" /> Video
                    </button>
                </div>
            )}
            {status === 'awaiting_theme' && (
                 <div className="w-full">
                    <input type="text" value={theme} onChange={handleThemeChange} placeholder="Ej: 'Boda en la playa', 'Otoño'" className="w-full border-slate-300 rounded-md shadow-sm mb-2 focus:ring-indigo-500 focus:border-indigo-500"/>
                    <button onClick={() => onProcess(id, 'thematic')} className="w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                        Generar "Temática"
                    </button>
                </div>
            )}
            {status === 'awaiting_video_prompt' && (
                <div className="w-full">
                   <textarea value={videoPrompt} onChange={handleVideoPromptChange} rows={3} className="w-full border-slate-300 rounded-md shadow-sm mb-2 focus:ring-rose-500 focus:border-rose-500" />
                   <button onClick={() => onGenerateVideo(id)} className="w-full bg-rose-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-rose-700 transition-colors">
                       Generar Video
                   </button>
                </div>
            )}
          </div>
        );
      case 'processing':
        return <div className="text-center p-4 flex items-center justify-center gap-2"><ArrowPathIcon className="w-5 h-5 animate-spin" /> Procesando imagen...</div>;
      case 'processing_video':
        return <VideoPollingComponent job={job} dispatch={dispatch} />;
      case 'success':
        return (
          <div className="grid grid-cols-1 gap-2 p-2">
            {processedImages.map((img, index) => (
              <a key={index} href={`data:image/jpeg;base64,${img}`} download={`${originalImage.name.split('.')[0]}_enhanced_${index}.jpg`} className="relative group">
                <img src={`data:image/jpeg;base64,${img}`} alt={`Resultado ${index}`} className="w-full h-auto rounded-md" />
                 <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <DownloadIcon className="w-8 h-8 text-white"/>
                </div>
              </a>
            ))}
          </div>
        );
      case 'success_video':
        return (
             <div className="p-4">
                <video src={processedVideoUrl ?? ''} controls className="w-full rounded-lg" />
                <a href={processedVideoUrl ?? ''} download={`${originalImage.name.split('.')[0]}_video.mp4`} className="mt-2 flex items-center justify-center gap-2 w-full bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-700 transition-colors">
                    <DownloadIcon className="w-5 h-5" /> Descargar Video
                </a>
             </div>
        );
      case 'error':
        return <div className="text-center p-4 text-red-600">Error: {error}</div>;
      default:
        return null;
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
      <div className="p-2 border-b flex justify-between items-center bg-slate-50">
        <p className="text-sm font-medium text-slate-700 truncate">{originalImage.name}</p>
        {(status === 'success' || status === 'error' || status === 'success_video') && (
          <button onClick={() => dispatch({ type: 'RETRY_JOB', payload: { jobId: id } })} className="text-slate-500 hover:text-indigo-600">
            <ArrowPathIcon className="w-5 h-5"/>
          </button>
        )}
      </div>
      <div className="flex-grow flex flex-col justify-center items-center">
         <img src={`data:${originalImage.mimeType};base64,${originalImage.base64}`} alt="Original" className="max-h-48 w-auto object-contain p-2" />
      </div>
      <div className="bg-slate-50 border-t min-h-[96px]">
        {renderContent()}
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [isApiKeyModalOpen, setApiKeyModalOpen] = useState(false);

  const handleImageUpload = useCallback(async (files: File[]) => {
    const imagePromises = files.map(file => resizeImage(file, 1024).then(resized => ({ ...resized, name: file.name })));
    const resizedImages = await Promise.all(imagePromises);
    dispatch({ type: 'UPLOAD_BATCH', payload: resizedImages });
  }, []);

  const handleProcessJob = useCallback(async (jobId: string, mode: 'catalog' | 'thematic') => {
    const job = state.jobs.find(j => j.id === jobId);
    if (!job) return;

    dispatch({ type: 'PROCESS_JOB_START', payload: { jobId } });

    try {
        const body = {
            mode,
            base64Image: job.originalImage.base64,
            mimeType: job.originalImage.mimeType,
            ...(mode === 'thematic' && { userTheme: job.theme }),
        };
        const data = await apiFetch(body);
        dispatch({ type: 'PROCESS_JOB_SUCCESS', payload: { jobId, processedImages: data.enhancedImages } });
    } catch (error: any) {
      dispatch({ type: 'PROCESS_JOB_ERROR', payload: { jobId, error: error.message } });
    }
  }, [state.jobs]);

  const handleGenerateVideo = useCallback(async (jobId: string) => {
    const job = state.jobs.find(j => j.id === jobId);
    if (!job) return;
    
    const hasKey = typeof (window as any).aistudio?.hasSelectedApiKey === 'function' ? await (window as any).aistudio.hasSelectedApiKey() : false;
    if (!hasKey) {
        setApiKeyModalOpen(true);
        return;
    }

    dispatch({ type: 'PROCESS_VIDEO_START', payload: { jobId } });

    try {
        const body = {
            mode: 'video_start',
            base64Image: job.originalImage.base64,
            mimeType: job.originalImage.mimeType,
            prompt: job.videoPrompt,
        };
        const data = await apiFetch(body);
        dispatch({ type: 'UPDATE_VIDEO_OPERATION', payload: { jobId, operation: data.operation } });
    } catch (error: any) {
        dispatch({ type: 'PROCESS_JOB_ERROR', payload: { jobId, error: error.message } });
    }
  }, [state.jobs]);


  const isAnyJobActive = useMemo(() => state.jobs.some(job => ['processing', 'processing_video'].includes(job.status)), [state.jobs]);

  return (
    <div className="bg-slate-100 min-h-screen font-sans">
      <Header />
      <main>
        <ImageUploader onImageUpload={handleImageUpload} disabled={isAnyJobActive} />

        {state.jobs.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {state.jobs.map(job => (
                <JobCard key={job.id} job={job} dispatch={dispatch} onProcess={handleProcessJob} onGenerateVideo={handleGenerateVideo} />
              ))}
            </div>
            <div className="text-center mt-8">
                <button onClick={() => dispatch({ type: 'RESET' })} className="text-sm text-slate-500 hover:text-red-600 transition-colors">
                    Limpiar todo
                </button>
            </div>
          </div>
        )}
      </main>
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onKeySelected={() => {
            setApiKeyModalOpen(false);
            const jobToRetry = state.jobs.find(j => j.status === 'awaiting_video_prompt');
            if (jobToRetry) {
                handleGenerateVideo(jobToRetry.id);
            }
        }}
      />
    </div>
  );
}
