/**
 * The toolbar's bridge to the main process (only the toolbar has it, not the app's pages): window.demo,
 * the calls of ToolbarApi over IPC.
 */
import { contextBridge, ipcRenderer } from 'electron';

import { CHANNELS, type ToolbarApi, type ToolbarState } from './toolbarApi';

const api: ToolbarApi = {
  setLayout: (layout) => ipcRenderer.send(CHANNELS.layout, layout),
  setStudent: (student) => ipcRenderer.send(CHANNELS.student, student),
  setPrompt: (prompt) => ipcRenderer.send(CHANNELS.prompt, prompt),
  reset: () => ipcRenderer.send(CHANNELS.reset),
  onState: (listener) => {
    ipcRenderer.on(CHANNELS.state, (_event, state: ToolbarState) => listener(state));
    // The state of now, also when the toolbar loads after the main process has set it.
    ipcRenderer.send(CHANNELS.ready);
  },
};

contextBridge.exposeInMainWorld('demo', api);
