import { createRoot } from 'react-dom/client';
import React from 'react';

import Main from './ui/Main.js';

(async function () {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Cannot find element with ID "root".');
  }

  const root = createRoot(rootElement);

  root.render(<Main />);
})();
