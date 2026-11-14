
const { BrowserWindow, Menu, app, ipcMain } = require("electron");
const { spawn } = require('child_process');
const path = require("path");
const fs = require("fs");

const file = path.join(__dirname, "src-app/disabled");

if (fs.existsSync(file)) {
    const disables = fs.readFileSync(file, "utf8").split("\n").map(l => l.trim()).filter(l => l !== "");
    disables.forEach(flags => app.commandLine.appendSwitch(flags));
}

let fenetre;
const lck = app.requestSingleInstanceLock();

if (!lck) {
    process.exit(0);
} else {
    app.on('second-instance', () => {
        if (fenetre) {
            if (fenetre.isMinimized()) fenetre.restore();
            fenetre.show();
            fenetre.focus();
        }
    });

    Menu.setApplicationMenu(null);

    function crWindow() {
        fenetre = new BrowserWindow({
            icon: path.join(__dirname, './src-app/pvz.ico'),
            title: 'Plant VS Zombies',
            width: 1000,
            height: 700,
            minWidth: 800,
            minHeight: 550,

            webPreferences: {

                preload: path.join(__dirname, './src-app', 'preload.js'),

                contextIsolation: true,
                webSecurity: true,
                backgroundThrottling: true,

                sandbox: false,
                nodeIntegration: false,
                enableRemoteModule: false,
                webviewTag: false,
                nodeIntegrationInSubFrames: false,
                allowRunningInsecureContent: false,
                experimentalFeatures: false,
                offscreen: false
            }
        });

        fenetre.loadFile('./index.html');
        fenetre.webContents.on('did-finish-load', startmute);
        fenetre.on('page-title-updated', e => e.preventDefault()); 
    }

    app.whenReady().then(async () => {
        crWindow();
    });

    'use strict';
    let native;

    try {
    native = require('./src-app/xldecoder.node');
    } catch (e) {
    const alt = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'xldecoder.node');
    native = require(alt);
    }

    function deinterleave({ samples, channels }) {
    const frames = samples.length / channels;
    const out = Array.from({ length: channels }, () => new Float32Array(frames));
    for (let c = 0; c < channels; c++) {
        const dst = out[c];
        for (let i = 0, j = c; i < frames; i++, j += channels) dst[i] = samples[j];
    }
    return out;
    }

    function toAudioBuffer(audioContext, decoded) {
    const planar = deinterleave(decoded);
    const buf = audioContext.createBuffer(decoded.channels, planar[0].length, decoded.sampleRate);
    planar.forEach((p, c) => buf.copyToChannel(p, c));
    return buf;
    }

    module.exports = { ...native, deinterleave, toAudioBuffer };

    const configPath = app.isPackaged
        ? path.join(app.getPath('userData'), 'config-app.json')
        : path.join(app.getAppPath(), 'config-app.json');

    const configParDefaut = { app: { mute: false } };

    function copieDefaut() {
        return JSON.parse(JSON.stringify(configParDefaut));
    }

    function ecrireConfig(config) {
        try {
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
            return true;
        } catch (err) {
            console.error('[config] Impossible d\'écrire le fichier :', err);
            return false;
        }
    }

    function chargerConfig() {
        try {
            if (!fs.existsSync(configPath)) {
                const config = copieDefaut();
                ecrireConfig(config);
                return config;
            }
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

            if (typeof config !== 'object' || config === null) {
                throw new Error('Le contenu du JSON n\'est pas un objet');
            }
            if (typeof config.app !== 'object' || config.app === null) {
                config.app = {};
            }
            if (typeof config.app.mute !== 'boolean') {
                config.app.mute = false;
            }

            return config;
        } catch (err) {
            const config = copieDefaut();
            ecrireConfig(config);
            return config;
        }
    }

    let configEnMemoire = null;

    function getConfig() {
        if (configEnMemoire === null) {
            configEnMemoire = chargerConfig();
        }
        return configEnMemoire;
    }

    function startmute() {
        if (!fenetre || fenetre.isDestroyed()) return;
        const muted = getConfig().app.mute;
        fenetre.webContents.setAudioMuted(muted);
        console.log('[config] Mute appliqué :', muted);
    }

    ipcMain.handle('audio:toggle-mute', () => {
        const config = getConfig();
        config.app.mute = !config.app.mute;

        if (fenetre && !fenetre.isDestroyed()) {
            fenetre.webContents.setAudioMuted(config.app.mute);
        }

        ecrireConfig(config);
        console.log('[config] Mute changé :', config.app.mute);
        return config.app.mute;
    });

    ipcMain.handle('audio:is-muted', () => getConfig().app.mute);
}