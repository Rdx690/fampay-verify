import React from 'react';
import ReactDOM from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import './index.css';

// Import route definitions
import { Route as rootRoute } from './routes/__root';
import { Route as indexRoute } from './routes/index';
import { Route as docsRoute } from './routes/docs';
import { Route as keysRoute } from './routes/keys';
import { Route as appPasswordRoute } from './routes/app-password';
import { Route as aboutRoute } from './routes/about';
import { Route as loginRoute } from './routes/login';
import { Route as registerRoute } from './routes/register';
import { Route as dashboardRoute } from './routes/dashboard';
import { Route as adminRoute } from './routes/admin';

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  docsRoute,
  keysRoute,
  appPasswordRoute,
  aboutRoute,
  loginRoute,
  registerRoute,
  dashboardRoute,
  adminRoute,
]);

// Instantiate router
const router = createRouter({ routeTree });

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
