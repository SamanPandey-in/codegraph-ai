import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import * as Sentry from '@sentry/react';
import { store } from '@/app/store';
import App from './App.jsx';
import './index.css';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
