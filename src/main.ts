import './style.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Reoo: #app mount point is missing');
}

new App(root);

// Offline support: registered only for production builds, where the service
// worker file is shipped as-is from public/. Dev keeps hot reload untouched.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.warn('Reoo: offline support unavailable', error);
    });
  });
}

// Surface unexpected failures instead of failing silently.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Reoo: unhandled rejection', event.reason);
});
