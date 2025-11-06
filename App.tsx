import React, { useReducer, useCallback, useMemo } from 'react';
import { generateCatalogImage, generateThematicImages } from './services/geminiService';
import { UploadIcon, DownloadIcon, SparklesIcon, ArrowPathIcon, PhotoIcon } from './components/icons';
import { resizeImage } from './utils';

// --- TYPE DEFINITIONS ---

type ImageFile = {
  base64: string;
  mimeType: string;
  name: string;
};

type ImageJob = {
  id: string;
  originalImage: ImageFile;
  status: 'pending_selection' | 'awaiting_theme' | 'processing' | 'success' | 'error';
  processedImages: string[];
  error: string | null;
  theme: string;
};

type State = {
  jobs: ImageJob[];
};

type Action =
  | { type: 'UPLOAD_BATCH'; payload: ImageFile[] }
  | { type: 'SELECT_MODE'; payload: { jobId: string; mode: 'catalog' | 'thematic' } }
  | { type: 'SET_JOB_THEME'; payload: { jobId: string; theme: string } }
  | { type: 'PROCESS_JOB_START'; payload: { jobId: string } }
  | { type: 'PROCESS_JOB_SUCCESS'; payload: { jobId: string; processedImages: string[] } }
  | { type: 'PROCESS_JOB_ERROR'; payload: { jobId: string; error: string } }
  | { type: 'RETRY_JOB'; payload: { jobId: string } }
  | { type: 'RESET' };

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
          error: null,
          theme: '',
        })),
      };
    case 'SELECT_MODE':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId
            ? { ...job, status: action.payload.mode === 'thematic' ? 'awaiting_theme' : 'pending_selection' }
            : job
        ),
      };
    case 'SET_JOB_THEME':
       return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, theme: action.payload.theme } : job
        ),
      };
    case 'PROCESS_JOB_START':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'processing', error: null } : job
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
    case 'RETRY_JOB':
       return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.jobId ? { ...job, status: 'pending_selection', error: null, processedImages: [] } : job
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
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Joyería Premium Enhancer</h1>
    </div>
  </header>
);

const ImageUploader: React.FC<{ onImageUpload: (files: File[]) => void; disabled: boolean }> = ({ onImageUpload, disabled }) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const handleFileChange = (files: FileList | null) => files && files.length > 0 && onImageUpload(Array.from(files));
  const commonDragProps = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setIsDragging(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (!disabled) handleFileChange(e.dataTransfer.files); },
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg max-w-5xl mx-auto">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-300 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50/50'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-400'}`}
        {...commonDragProps}
        onClick={() => (document.getElementById('file-input') as HTMLInputElement)?.click()}
      >
        <input id="file-input" type="file" multiple className="hidden" accept="image/png, image/jpeg, image/webp" onChange={(e) => handleFileChange(e.target.files)} disabled={disabled} />
        <div className="flex flex-col items-center justify-center space-y-4 text-slate-600">
          <UploadIcon className="w-12 h-12 text-slate-400" />
          <p className="text-lg font-medium"><span className="text-blue-600 font-semibold">Sube una o más imágenes</span> o arrástralas aquí</p>
          <p className="text-sm text-slate-500">PNG, JPG, WEBP. Las imágenes grandes serán redimensionadas a 1024px.</p>
        </div>
      </div>
    </div>
  );
};

const JobCard: React.FC<{ job: ImageJob; dispatch: React.Dispatch<Action>; isLoading: boolean; }> = ({ job, dispatch, isLoading }) => {
  const originalImageSrc = useMemo(() => `data:${job.originalImage.mimeType};base64,${job.originalImage.base64}`, [job.originalImage]);

  const handleProcessThematic = useCallback(() => {
    if (!job.theme.trim()) {
      alert("Por favor, ingresa un tema para el modo Temporada Creativa.");
      return;
    }
    dispatch({ type: 'PROCESS_JOB_START', payload: { jobId: job.id } });
  }, [job.id, job.theme, dispatch]);
  
  const handleProcessCatalog = useCallback(() => {
      dispatch({ type: 'PROCESS_JOB_START', payload: { jobId: job.id } });
  }, [job.id, dispatch]);

  const handleDownload = (base64Image: string, index: number) => {
    const link = document.createElement('a');
    const [name] = job.originalImage.name.split('.');
    link.href = `data:image/png;base64,${base64Image}`;
    link.download = `${name}-enhanced-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="bg-white p-5 rounded-2xl shadow-lg transition-all duration-300">
       <div className="flex flex-col md:flex-row gap-5">
            <div className="w-full md:w-1/4 flex-shrink-0">
                <div className="aspect-square bg-slate-100 rounded-xl overflow-hidden shadow-md flex items-center justify-center">
                    <img src={originalImageSrc} alt="Original" className="max-w-full max-h-full object-contain" />
                </div>
                <p className="mt-2 text-sm text-center font-medium truncate text-slate-800" title={job.originalImage.name}>{job.originalImage.name}</p>
            </div>
            <div className="w-full md:w-3/4 flex flex-col">
                {job.status === 'processing' && (
                    <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 rounded-xl">
                        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <p className="mt-3 text-slate-600 font-medium">Procesando con IA... Puede tardar un momento.</p>
                    </div>
                )}
                {job.status === 'error' && (
                    <div className="h-full flex flex-col items-center justify-center bg-red-50/50 rounded-xl p-4">
                        <p className="font-bold text-red-700">Ocurrió un Error</p>
                        <p className="text-sm mt-1 text-red-600 text-center">{job.error}</p>
                        <button onClick={() => dispatch({type: 'RETRY_JOB', payload: {jobId: job.id}})} disabled={isLoading} className="mt-4 inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50">
                            <ArrowPathIcon className="w-4 h-4 mr-1" />Reintentar
                        </button>
                    </div>
                )}
                {job.status === 'success' && (
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {job.processedImages.map((imgBase64, index) => (
                           <div key={index} className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden shadow-md group">
                                <img src={`data:image/png;base64,${imgBase64}`} alt={`Resultado ${index + 1}`} className="w-full h-full object-contain" />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDownload(imgBase64, index)} className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors" aria-label="Descargar imagen">
                                        <DownloadIcon className="w-6 h-6 text-white" />
                                    </button>
                                </div>
                           </div>
                        ))}
                    </div>
                )}
                {job.status === 'pending_selection' && (
                    <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 rounded-xl p-4 space-y-4">
                      <p className="font-semibold text-slate-700">Elige un modo de procesamiento:</p>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={handleProcessCatalog} disabled={isLoading} className="inline-flex items-center justify-center px-6 py-3 border border-slate-300 text-base font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50">
                            📸 Catálogo Estándar
                        </button>
                        <button onClick={() => dispatch({type: 'SELECT_MODE', payload: {jobId: job.id, mode: 'thematic'}})} disabled={isLoading} className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400">
                            🎨 Temporada Creativa
                        </button>
                      </div>
                    </div>
                )}
                {job.status === 'awaiting_theme' && (
                    <div className="h-full flex flex-col justify-center p-4 space-y-3">
                        <label htmlFor={`theme-${job.id}`} className="font-semibold text-slate-700">Describe el tema para la Temporada:</label>
                        <input
                            id={`theme-${job.id}`}
                            type="text"
                            value={job.theme}
                            onChange={(e) => dispatch({type: 'SET_JOB_THEME', payload: {jobId: job.id, theme: e.target.value}})}
                            placeholder="Ej: Mármol blanco con vetas doradas"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-3">
                             <button onClick={handleProcessThematic} disabled={isLoading || !job.theme.trim()} className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400">
                                <SparklesIcon className="w-5 h-5 mr-2" />Realzar con Tema
                            </button>
                             <button onClick={() => dispatch({type: 'RETRY_JOB', payload: {jobId: job.id}})} disabled={isLoading} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                                Volver
                            </button>
                        </div>
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
  const { jobs } = state;

  const isLoading = useMemo(() => jobs.some(j => j.status === 'processing'), [jobs]);

  const handleImageUpload = useCallback(async (files: File[]) => {
    const imageFiles = await Promise.all(
        files.map(file => resizeImage(file, 1024).then(resized => ({ ...resized, name: file.name })))
    );
    dispatch({ type: 'UPLOAD_BATCH', payload: imageFiles });
  }, []);
  
  const handleReset = useCallback(() => dispatch({ type: 'RESET' }), []);

  // Effect to process jobs when their status changes to 'processing'
  React.useEffect(() => {
    const processJob = async (job: ImageJob) => {
        try {
            let results: string[];
            const isThematic = job.status === 'awaiting_theme' || job.theme; // A bit of a heuristic
            
            // This logic is tricky. Let's simplify. The parent component will trigger the API call.
            // The effect is not the right place for this. Let's move the API call logic to the JobCard or a handler in App.
            // Let's refactor: The API call will be triggered from App, based on a dispatch.
        } catch (e: any) {
            dispatch({ type: 'PROCESS_JOB_ERROR', payload: { jobId: job.id, error: e.message } });
        }
    };
    jobs.filter(j => j.status === 'processing').forEach(processJob);
  }, [jobs]);


  // New, cleaner handler for processing jobs.
  const processJobApiCall = useCallback(async (job: ImageJob) => {
     if (job.status !== 'processing') return;

     try {
       let results: string[];
       
       // Heuristic to decide which mode was chosen. A better way would be to store the mode in the job state.
       // Let's assume if a theme is present, it's thematic. Otherwise, it must be catalog.
       if(job.theme.trim()){
         results = await generateThematicImages(job.originalImage.base64, job.originalImage.mimeType, job.theme);
       } else {
         results = await generateCatalogImage(job.originalImage.base64, job.originalImage.mimeType);
       }
       
       dispatch({ type: 'PROCESS_JOB_SUCCESS', payload: { jobId: job.id, processedImages: results } });
     } catch (e: any) {
       console.error(e);
       dispatch({ type: 'PROCESS_JOB_ERROR', payload: { jobId: job.id, error: e.message } });
     }
  }, []);

  React.useEffect(() => {
    const jobToProcess = jobs.find(j => j.status === 'processing');
    if (jobToProcess) {
      processJobApiCall(jobToProcess);
    }
  }, [jobs, processJobApiCall]);
  

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <Header />
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {jobs.length === 0 ? (
          <>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Eleva la Presentación de tus Joyas</h2>
              <p className="mt-4 text-lg text-slate-600 max-w-3xl mx-auto">
                Sube tus fotos para generar imágenes de catálogo estandarizadas o creativas composiciones de temporada.
              </p>
            </div>
            <ImageUploader onImageUpload={handleImageUpload} disabled={isLoading} />
          </>
        ) : (
          <div>
            <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-slate-800">Tus Imágenes Cargadas</h3>
                <p className="text-slate-500 mt-2">Procesa cada imagen individualmente para Catálogo o Temporada.</p>
            </div>

            <div className="space-y-6">
              {jobs.map(job => (
                <JobCard 
                  key={job.id} 
                  job={job}
                  dispatch={dispatch}
                  isLoading={isLoading}
                />
              ))}
            </div>

             <div className="mt-12 text-center">
                <button onClick={handleReset} className="inline-flex items-center justify-center px-6 py-3 border border-slate-300 text-base font-medium rounded-full shadow-sm text-slate-700 bg-white hover:bg-slate-50">
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
