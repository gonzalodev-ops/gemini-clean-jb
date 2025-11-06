import React from 'react';
import { XMarkIcon, KeyIcon } from './icons';

type ApiKeyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onKeySelected: () => void;
};

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onKeySelected }) => {
  if (!isOpen) return null;

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume success and let the parent component handle the logic
      onKeySelected(); 
    } catch (error) {
      console.error("Error opening API key selection:", error);
      // Handle error if needed, e.g., show a message to the user
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center" aria-modal="true" role="dialog">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full m-4">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800">Se requiere una clave de API</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-orange-100">
              <KeyIcon className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">
                La generación de video con el modelo Veo es una función avanzada que requiere que selecciones tu propia clave de API de Google AI Studio.
              </p>
              <p className="text-sm text-slate-600 mt-2">
                Esto asegura que el uso se asocie a tu cuenta. Se pueden aplicar cargos. Para más detalles, consulta la{' '}
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline font-medium"
                >
                  documentación de facturación
                </a>.
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 rounded-b-lg flex justify-end">
          <button
            onClick={handleSelectKey}
            className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Seleccionar Clave de API
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;