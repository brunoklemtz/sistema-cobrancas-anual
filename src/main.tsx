import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import TenantIntakeForm from './components/TenantIntakeForm.tsx';
import './index.css';

/** Link fixo do formulário do locatário. */
function isFixedFichaRoute(): boolean {
  const path = (window.location.pathname || '').replace(/\/$/, '') || '/';
  if (path === '/ficha' || path === '/formulario') return true;
  const hash = window.location.hash || '';
  return hash === '#/ficha' || hash === '#ficha' || hash === '#/formulario';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isFixedFichaRoute() ? <TenantIntakeForm /> : <App />}
  </StrictMode>,
);
