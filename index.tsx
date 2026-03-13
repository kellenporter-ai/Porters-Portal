
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './style.css'; // REQUIRED: This triggers Tailwind processing
import { patchDomForTranslateExtensions } from './lib/patchDomForTranslateExtensions';

// Prevent crashes from Google Translate and similar browser extensions that
// mutate the DOM (replacing text nodes with <font> tags) while React is managing it.
patchDomForTranslateExtensions();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
