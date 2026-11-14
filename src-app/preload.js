const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioAPI', {
  toggleMute: () => ipcRenderer.invoke('audio:toggle-mute'),
  isMuted: () => ipcRenderer.invoke('audio:is-muted')
});