// Preload – minimale, sichere Brücke zwischen Renderer und Hauptprozess.
// contextIsolation ist aktiv; wir legen nur wenige, unkritische Infos offen.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('leco', {
  desktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
