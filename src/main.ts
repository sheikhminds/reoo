import './style.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Reoo: #app mount point is missing');
}

new App(root);

// Surface unexpected failures instead of failing silently.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Reoo: unhandled rejection', event.reason);
});
