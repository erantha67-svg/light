
import React, { createContext, useContext, useState, useCallback } from 'react';
import { ToastMessage } from '../types';

type ToastContextType = {
  addToast: (message: string, type: ToastMessage['type']) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastMessage['type']) => {
    const id = Date.now();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
    setTimeout(() => {
      setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
};

const ToastContainer: React.FC<{ toasts: ToastMessage[] }> = ({ toasts }) => {
  const toastColors = {
    success: 'bg-green-500',
    info: 'bg-blue-500',
    error: 'bg-red-500',
  };

  return (
    <div className="fixed bottom-0 right-0 p-4 space-y-2 w-full max-w-xs z-50">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`
            w-full p-4 text-white rounded-lg shadow-lg transition-all duration-300
            ${toastColors[toast.type]}
          `}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
};
