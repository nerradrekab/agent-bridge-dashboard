import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { createDataSource } from './data';
import { applyTheme, readTheme } from './lib/theme';

applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App dataSource={createDataSource()} />
  </StrictMode>,
);
