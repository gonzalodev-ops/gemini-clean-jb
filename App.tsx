
import React, { useState, useCallback, useMemo } from 'react';
import { enhanceJewelryImage } from './services/geminiService';
import { UploadIcon, DownloadIcon, SparklesIcon, XMarkIcon } from './components/icons';

type ImageFile = {
  base64: string;
  mimeType: string;
  name: string;
};

const Header: React.FC = () => (
  <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-10">
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

const ImageUploader: React.FC<{ onImageUpload: (file: ImageFile) => void; disabled: boolean }> = ({ onImageUpload, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        onImageUpload({ base64, mimeType: file.type, name: file.name });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!disabled) {
      const files = e.dataTransfer.files;
      handleFileChange(files);
    }
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-300 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50/50'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-400'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        accept="image/png, image/jpeg, image/webp"
        onChange={(e) => handleFileChange(e.target.files)}
        disabled={disabled}
      />
      <div className="flex flex-col items-center justify-center space-y-4 text-slate-600">
        <UploadIcon className="w-12 h-12 text-slate-400" />
        <p className="text-lg font-medium">
          <span className="text-blue-600 font-semibold">Sube una imagen</span> o arrástrala aquí
        </p>
        <p className="text-sm text-slate-500">PNG, JPG, WEBP son soportados</p>
      </div>
    </div>
  );
};

const Loader: React.FC = () => (
    <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-xl">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-700 font-medium text-lg">Mejorando tu joya, por favor espera...</p>
        <p className="text-sm text-slate-500">Este proceso puede tardar un momento.</p>
    </div>
);

const ImagePreview: React.FC<{ src: string; label: string; name: string; onClear?: () => void; onDownload?: () => void; isResult?: boolean }> = ({ src, label, name, onClear, onDownload, isResult }) => (
    <div className="relative w-full aspect-square bg-slate-200 rounded-xl overflow-hidden shadow-md">
        <img src={src} alt={label} className="w-full h-full object-contain" />
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-3 flex justify-between items-center">
            <div>
                <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">{label}</span>
                <p className="text-sm font-medium truncate mt-1">{name}</p>
            </div>
            {onDownload && (
                <button onClick={onDownload} className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors">
                    <DownloadIcon className="w-5 h-5 text-white" />
                </button>
            )}
        </div>
        {onClear && (
            <button onClick={onClear} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 hover:bg-black/60 transition-colors">
                <XMarkIcon className="w-5 h-5 text-white" />
            </button>
        )}
    </div>
);


export default function App() {
  const [originalImage, setOriginalImage] = useState<ImageFile | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = useCallback((file: ImageFile) => {
    setOriginalImage(file);
    setProcessedImage(null);
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setOriginalImage(null);
    setProcessedImage(null);
    setError(null);
  }, []);

  const handleProcessImage = useCallback(async () => {
    if (!originalImage) return;

    setIsLoading(true);
    setError(null);
    setProcessedImage(null);

    try {
      const resultBase64 = await enhanceJewelryImage(originalImage.base64, originalImage.mimeType);
      if (resultBase64) {
        setProcessedImage(`data:${originalImage.mimeType};base64,${resultBase64}`);
      } else {
        throw new Error("La API no devolvió una imagen procesada.");
      }
    } catch (e: any) {
      console.error(e);
      setError(`Ocurrió un error al procesar la imagen: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [originalImage]);
  
  const handleDownload = useCallback(() => {
    if (!processedImage || !originalImage) return;
    const link = document.createElement('a');
    const fileNameParts = originalImage.name.split('.');
    const extension = fileNameParts.pop();
    const name = fileNameParts.join('.');
    link.download = `${name}-enhanced.${extension}`;
    link.href = processedImage;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [processedImage, originalImage]);

  const originalImageSrc = useMemo(() => {
      return originalImage ? `data:${originalImage.mimeType};base64,${originalImage.base64}` : null;
  }, [originalImage]);


  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <Header />
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Eleva la Presentación de tus Joyas</h2>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
            Sube una foto de tu joyería de plata. Nuestra IA eliminará el fondo, lo reemplazará por un elegante azul niebla y realzará el brillo de la pieza.
          </p>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg max-w-5xl mx-auto">
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6" role="alert">
              <p className="font-bold">Error</p>
              <p>{error}</p>
            </div>
          )}

          <div className="relative">
            {isLoading && <Loader />}
            
            {!originalImage && <ImageUploader onImageUpload={handleImageUpload} disabled={isLoading} />}
            
            {originalImage && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {originalImageSrc && 
                    <ImagePreview src={originalImageSrc} label="Original" name={originalImage.name} onClear={!isLoading ? handleClear : undefined} />
                }

                {processedImage ? (
                  <ImagePreview src={processedImage} label="Resultado" name={originalImage.name} onDownload={handleDownload} isResult />
                ) : (
                  <div className="w-full aspect-square bg-slate-200 rounded-xl flex items-center justify-center shadow-md">
                     <div className="text-center p-4">
                        <SparklesIcon className="w-16 h-16 mx-auto text-slate-400" />
                        <p className="mt-2 text-slate-600 font-medium">La imagen mejorada aparecerá aquí.</p>
                     </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {originalImage && (
            <div className="mt-8 text-center">
              <button
                onClick={handleProcessImage}
                disabled={isLoading || !!processedImage}
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-medium rounded-full shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Procesando...
                  </>
                ) : processedImage ? '¡Procesado con Éxito!' : (
                    <>
                        <SparklesIcon className="-ml-1 mr-3 h-6 w-6" />
                        Realzar Joya Ahora
                    </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="mt-12 text-center text-sm text-slate-500">
            <p>Potenciado por la IA de Google. Creado con ❤️ para joyeros.</p>
        </div>
      </main>
    </div>
  );
}
