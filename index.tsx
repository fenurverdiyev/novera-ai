import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import { LoadingScreen } from './components/LoadingScreen';

const rootElement = document.getElementById('root');
const loadingScreenElement = document.getElementById('loading-screen');

if (!rootElement || !loadingScreenElement) {
  throw new Error("Could not find root elements to mount to");
}

const queryClient = new QueryClient();
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Render loading screen first
const loadingRoot = ReactDOM.createRoot(loadingScreenElement);
loadingRoot.render(<LoadingScreen />);

// Then render the main app
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);