// FIX: Imported `useEffect` to resolve 'Cannot find name' error.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { resizeImage } from './utils';
import ThemeSelector from './components/ThemeSelector';
import { UploadIcon, SparklesIcon, XMarkIcon, ArrowPathIcon, KeyIcon, PhotoIcon, VideoCameraIcon, DownloadIcon, StopIcon, TrashIcon } from './components/icons';

type OriginalImage = {
  file: File;
  preview: string;
  base64: string;
  mimeType: string;
};

type JobStatus = 'pending' | 'loading' | 'success' | 'error';

type Job = {
  id: string;
  originalImage: OriginalImage;
  catalogResult: { images: string[], status: JobStatus };
  thematicResult: { images: string[], status: JobStatus };
  videoResult: { url: string | null, status: JobStatus, message: string };
  abortController: AbortController;
};


// Define window.aistudio for TypeScript
// FIX: The original declaration caused a type conflict. By defining a named interface `AIStudio` and using it, we align with the expected type and resolve the error.
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}
declare global {
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [theme, setTheme] = useState('Navidad');
  const [videoPrompt, setVideoPrompt] = useState('Crea un video de presentación cinematográfico de 5 segundos para este producto.');
  
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [apiKeySelected, setApiKeySelected] = useState(false);
  
  const pollingIntervalsRef = useRef<Map<string, number>>(new Map());

  // Check for API key on mount
  useState(() => {
    const checkApiKey = async () => {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setApiKeySelected(true);
      }
    };
    checkApiKey();
  });
  
  // Cleanup polling intervals on unmount
  useEffect(() => {
    const intervals = pollingIntervalsRef.current;
    return () => {
      intervals.forEach(intervalId => clearInterval(intervalId));
    };
  }, []);


  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    // Cleanup previous jobs
    jobs.forEach(job => URL.revokeObjectURL(job.originalImage.preview));
    pollingIntervalsRef.current.forEach(id => clearInterval(id));
    pollingIntervalsRef.current.clear();
    
    setGlobalError(null);

    const newJobsPromises = acceptedFiles.map(async (file): Promise<Job> => {
      const { base64, mimeType } = await resizeImage(file, 1024);
      return {
        id: `${file.name}-${file.lastModified}`,
        originalImage: {
          file,
          preview: URL.createObjectURL(file),
          base64,
          mimeType,
        },
        catalogResult: { images: [], status: 'pending' },
        thematicResult: { images: [], status: 'pending' },
        videoResult: { url: null, status: 'pending', message: '' },
        abortController: new AbortController(),
      };
    });

    try {
        const newJobs = await Promise.all(newJobsPromises);
        setJobs(newJobs);
        setActiveIndex(0);
    } catch (err) {
        console.error(err);
        setGlobalError('Error al procesar una o más imágenes. Inténtalo de nuevo.');
    }
  }, [jobs]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.webp'] },
    multiple: true,
  });

  const clearJobs = () => {
    jobs.forEach(job => {
        URL.revokeObjectURL(job.originalImage.preview)
        job.abortController.abort();
    });
    pollingIntervalsRef.current.forEach(id => clearInterval(id));
    pollingIntervalsRef.current.clear();
    setJobs([]);
    setActiveIndex(0);
    setGlobalError(null);
  };
  
  const removeJob = (id: string) => {
    setJobs(prevJobs => {
        const jobToRemove = prevJobs.find(j => j.id === id);
        if(jobToRemove) {
            URL.revokeObjectURL(jobToRemove.originalImage.preview);
            jobToRemove.abortController.abort();
            const pollingId = pollingIntervalsRef.current.get(id);
            if (pollingId) {
                clearInterval(pollingId);
                pollingIntervalsRef.current.delete(id);
            }
        }
        
        const remainingJobs = prevJobs.filter(j => j.id !== id);
        if (activeIndex >= remainingJobs.length) {
            setActiveIndex(Math.max(0, remainingJobs.length - 1));
        }
        return remainingJobs;
    });
  };

  const updateJobState = (jobId: string, updates: Partial<Job>) => {
    setJobs(prev => prev.map(job => job.id === jobId ? { ...job, ...updates } : job));
  };
  
  const updateJobFromResult = (jobId: string, type: 'catalog' | 'thematic' | 'video', status: JobStatus, data: any) => {
    setJobs(prevJobs => prevJobs.map(job => {
        if (job.id === jobId) {
            const updatedJob = { ...job };
            if (type === 'catalog') {
                updatedJob.catalogResult = { images: data.images || [], status };
            } else if (type === 'thematic') {
                updatedJob.thematicResult = { images: data.images || [], status };
            } else if (type === 'video') {
                 updatedJob.videoResult = { ...updatedJob.videoResult, ...data, status };
            }
            return updatedJob;
        }
        return job;
    }));
};

  const isAnyJobLoading = jobs.some(j => 
    j.catalogResult.status === 'loading' || 
    j.thematicResult.status === 'loading' || 
    j.videoResult.status === 'loading'
  );

  const stopAllGenerations = () => {
    jobs.forEach(job => job.abortController.abort());
    // The fetch calls will throw an error which will be caught, setting the status to 'error'
  };
  
  const createApiCall = async (endpoint: string, job: Job, body: object, type: 'catalog' | 'thematic' | 'video') => {
      try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: job.abortController.signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ocurrió un error en el servidor.');
        }

        const data = await response.json();
        updateJobFromResult(job.id, type, 'success', data);
        return data; // Return data for follow-up actions like polling

      } catch (err: any) {
          if (err.name === 'AbortError') {
              console.log(`Request for job ${job.id} was aborted.`);
              // Reset status to pending or keep as error
              const currentStatus = jobs.find(j=>j.id === job.id)?.catalogResult.status;
              if (currentStatus === 'loading') {
                updateJobFromResult(job.id, type, 'pending', {});
              }
          } else {
              updateJobFromResult(job.id, type, 'error', { error: err.message });
              if (endpoint === '/api/video-generate' && err.message.includes('Requested entity was not found')) {
                  setGlobalError('La clave de API no es válida o no tiene los permisos necesarios. Por favor, selecciona una clave válida.');
                  setApiKeySelected(false);
              }
          }
      }
  };

  const handleGenerateCatalog = () => {
    jobs.forEach(job => {
      updateJobFromResult(job.id, 'catalog', 'loading', {});
      createApiCall('/api/catalog', job, { 
        base64Image: job.originalImage.base64, 
        mimeType: job.originalImage.mimeType 
      }, 'catalog');
    });
  };

  const handleGenerateThematic = () => {
    jobs.forEach(job => {
      updateJobFromResult(job.id, 'thematic', 'loading', {});
      createApiCall('/api/thematic', job, { 
        base64Image: job.originalImage.base64, 
        mimeType: job.originalImage.mimeType, 
        theme 
      }, 'thematic');
    });
  };

  const pollVideoStatus = useCallback((operation: any, job: Job) => {
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch('/api/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation }),
        });
        const result = await response.json();

        if (result.error) throw new Error(result.error);
        
        if (result.status === 'done') {
          clearInterval(intervalId);
          pollingIntervalsRef.current.delete(job.id);
          updateJobFromResult(job.id, 'video', 'success', { url: result.videoUrl, message: '' });
        } else {
          updateJobFromResult(job.id, 'video', 'loading', { message: 'El video se está procesando...' });
        }
      } catch (err: any) {
        clearInterval(intervalId);
        pollingIntervalsRef.current.delete(job.id);
        updateJobFromResult(job.id, 'video', 'error', { message: `Error al verificar: ${err.message}` });
      }
    }, 10000);
    pollingIntervalsRef.current.set(job.id, intervalId);
  }, []);

  const handleGenerateVideo = () => {
    const messages = [
        "Preparando la magia del video...",
        "Consultando a los duendes de la renderización...",
        "Esto puede tardar unos minutos...",
        "Ajustando los píxeles para la toma perfecta...",
    ];
    
    jobs.forEach(async (job) => {
      updateJobFromResult(job.id, 'video', 'loading', { message: messages[Math.floor(Math.random() * messages.length)] });
      const data = await createApiCall('/api/video-generate', job, { 
        base64Image: job.originalImage.base64, 
        mimeType: job.originalImage.mimeType, 
        prompt: videoPrompt 
      }, 'video');

      if (data && data.operation) {
        pollVideoStatus(data.operation, job);
      }
    });
  };
  
  const handleSelectApiKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        setApiKeySelected(true);
        setGlobalError(null);
      } catch (e) {
        console.error("Error opening API key selection dialog", e);
        setGlobalError("No se pudo abrir el selector de clave de API.");
      }
    }
  };

  const activeJob = jobs[activeIndex];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <main className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Estudio de Fotografía de Joyería con IA</h1>
          <p className="text-lg text-slate-600 mt-2">Transforma tus fotos de productos con el poder de Gemini.</p>
        </header>

        {jobs.length === 0 ? (
          <div {...getRootProps()} className={`w-full max-w-3xl mx-auto p-10 border-4 border-dashed rounded-xl cursor-pointer transition-colors text-center ${isDragActive ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 bg-white'}`}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center gap-4">
              <UploadIcon className="w-12 h-12 text-slate-400" />
              <p className="text-slate-500">
                {isDragActive ? "Suelta las imágenes aquí..." : "Arrastra y suelta imágenes de tus productos aquí, o haz clic para seleccionarlas"}
              </p>
               <p className="text-xs text-slate-400">Puedes seleccionar múltiples archivos</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Panel */}
              <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Imágenes Originales ({activeIndex + 1}/{jobs.length})</h2>
                    <button onClick={clearJobs} className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold">
                        <ArrowPathIcon className="w-4 h-4" />
                        Empezar de nuevo
                    </button>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col gap-4">
                    <div className="aspect-square w-full relative group bg-slate-100 rounded-lg">
                      {activeJob && <img src={activeJob.originalImage.preview} alt={`Producto ${activeIndex + 1}`} className="w-full h-full object-contain rounded-lg" />}
                    </div>
                    {/* Thumbnails */}
                    {jobs.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {jobs.map((job, index) => (
                          <div key={job.id} className="relative flex-shrink-0" onClick={() => setActiveIndex(index)}>
                            <img 
                              src={job.originalImage.preview} 
                              alt={`Miniatura ${index + 1}`} 
                              className={`w-20 h-20 object-cover rounded-md cursor-pointer border-2 transition-all ${activeIndex === index ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'}`}
                            />
                             <button 
                                onClick={(e) => { e.stopPropagation(); removeJob(job.id); }} 
                                className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-700"
                                title="Eliminar imagen"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
              </div>

              {/* Right Panel */}
              <div className="flex flex-col gap-4">
                <h2 className="text-2xl font-bold">Herramientas de Generación</h2>
                 <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col gap-6">
                    {globalError && <div className="p-4 bg-red-100 text-red-700 border border-red-200 rounded-md">{globalError}</div>}
                    
                    {/* Catalog Section */}
                    <section>
                      <div className="flex items-center gap-3">
                        <PhotoIcon className="w-7 h-7 text-indigo-600" />
                        <h3 className="text-lg font-semibold">Foto de Catálogo</h3>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">Genera una imagen limpia y profesional sobre un fondo neutro, perfecta para tu tienda online.</p>
                      <button onClick={handleGenerateCatalog} disabled={isAnyJobLoading} className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors">
                        <SparklesIcon className="w-5 h-5" />
                        <span>Generar para {jobs.length} imágen(es)</span>
                      </button>
                    </section>

                    {/* Thematic Section */}
                    <section>
                      <div className="flex items-center gap-3">
                        <SparklesIcon className="w-7 h-7 text-amber-500" />
                        <h3 className="text-lg font-semibold">Fotos de Temporada</h3>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">Crea 3 imágenes creativas y temáticas para tus campañas de marketing o redes sociales.</p>
                      <div className="mt-4">
                        <ThemeSelector theme={theme} setTheme={setTheme} disabled={isAnyJobLoading} />
                      </div>
                      <button onClick={handleGenerateThematic} disabled={isAnyJobLoading} className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-md font-semibold hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed transition-colors">
                        <SparklesIcon className="w-5 h-5" />
                        <span>Generar 3 Estilos para {jobs.length} imágen(es)</span>
                      </button>
                    </section>
                    
                    {/* Stop Button */}
                    {isAnyJobLoading && (
                        <button onClick={stopAllGenerations} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700 transition-colors">
                            <StopIcon className="w-5 h-5" />
                            Detener Generación
                        </button>
                    )}
                 </div>
              </div>
            </div>

            {/* Results Section */}
            <div className="mt-12">
                <h2 className="text-2xl font-bold mb-4 text-center">Resultados Generados</h2>
                 {jobs.length > 0 ? (
                    <div className="space-y-8">
                        {jobs.map(job => <ResultCard key={job.id} job={job} />)}
                    </div>
                ) : (
                    <div className="text-center py-10 px-6 bg-white rounded-xl shadow-lg">
                        <p className="text-slate-500">Los resultados de tus imágenes aparecerán aquí una vez que inicies la generación.</p>
                    </div>
                )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
};


const ResultCard: React.FC<{ job: Job }> = ({ job }) => {
    
    const downloadImage = (base64: string, filename: string) => {
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${base64}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderResultGroup = (title: string, result: { images: string[], status: JobStatus }, type: 'catalog' | 'thematic') => (
        <div>
            <h4 className="font-semibold text-slate-800">{title}</h4>
            {result.status === 'loading' && <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                {Array.from({length: type === 'catalog' ? 1 : 3}).map((_, i) => <div key={i} className="aspect-square bg-slate-200 rounded-lg animate-pulse"></div>)}
            </div>}
            {result.status === 'error' && <p className="text-sm text-red-600 mt-2">Hubo un error al generar esta imagen.</p>}
            {result.status === 'success' && (
                <div className={`grid gap-4 mt-2 ${type === 'catalog' ? 'grid-cols-1 max-w-xs' : 'grid-cols-2 md:grid-cols-3'}`}>
                    {result.images.map((img, i) => (
                        <div key={i} className="relative group aspect-square">
                            <img src={`data:image/jpeg;base64,${img}`} alt={`${title} ${i + 1}`} className="w-full h-full object-cover rounded-lg shadow-md" />
                            <button
                                onClick={() => downloadImage(img, `${job.originalImage.file.name.split('.')[0]}-${type}-${i+1}.jpg`)}
                                className="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Descargar imagen"
                            >
                                <DownloadIcon className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            <div className="flex items-center gap-4 border-b pb-4 mb-4">
                <img src={job.originalImage.preview} className="w-20 h-20 rounded-md object-cover" />
                <div>
                    <h3 className="font-bold text-lg">{job.originalImage.file.name}</h3>
                    <p className="text-sm text-slate-500">Resultados de la generación</p>
                </div>
            </div>
            <div className="space-y-6">
                {renderResultGroup('Catálogo', job.catalogResult, 'catalog')}
                {renderResultGroup('Temporada', job.thematicResult, 'thematic')}
                {/* Video results can be added here in a similar fashion */}
            </div>
        </div>
    );
}

export default App;