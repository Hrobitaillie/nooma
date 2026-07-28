// Contexte d'estimations : clé du fichier courant + données extraites au runtime.
import { createContext } from 'preact';
import { estimationsData } from './data.js?v=1';

export const EstContext = createContext({ fileKey: null, data: estimationsData });

import { html } from 'htm/preact';
export function EstimationsProvider({ fileKey, children }) {
  return html`<${EstContext.Provider} value=${{ fileKey, data: estimationsData }}>${children}<//>`;
}
