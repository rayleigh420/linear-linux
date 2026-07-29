const {
    app,
    BrowserWindow,
    WebContentsView,
    ipcMain,
    session,
    shell,
} = require('electron');
const fs = require('fs');
const path = require('path');

const TAB_HEIGHT = 38;

let mainWindow = null;
let tabBarView = null;
const tabs = [];
let activeTabIndex = -1;
let stateFilePath;

// ── window state ──────────────────────────────────────────────────────────────

function loadWindowState() {
    if (!stateFilePath) return {};
    try {
        const { width, height, x, y } = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        if (Number.isFinite(width) && Number.isFinite(height)) {
            return {
                width, height,
                x: Number.isFinite(x) ? x : undefined,
                y: Number.isFinite(y) ? y : undefined,
            };
        }
    } catch (_) {}
    return {};
}

function saveWindowState(bounds) {
    if (!stateFilePath || !bounds) return;
    try {
        fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
        fs.writeFileSync(stateFilePath, JSON.stringify(bounds), 'utf8');
    } catch (_) {}
}

// ── layout ────────────────────────────────────────────────────────────────────

function relayout() {
    if (!mainWindow) return;
    const { width, height } = mainWindow.getContentBounds();
    tabBarView.setBounds({ x: 0, y: 0, width, height: TAB_HEIGHT });
    tabs.forEach((tab, i) => {
        if (i === activeTabIndex) {
            tab.view.setBounds({ x: 0, y: TAB_HEIGHT, width, height: height - TAB_HEIGHT });
        } else {
            tab.view.setBounds({ x: -(width + 10), y: TAB_HEIGHT, width, height: height - TAB_HEIGHT });
        }
    });
}

// ── tab bar sync ──────────────────────────────────────────────────────────────

function syncTabBar() {
    if (!tabBarView || tabBarView.webContents.isDestroyed()) return;
    tabBarView.webContents.send('tabs-updated', tabs.map((t, i) => ({
        index: i,
        title: t.title,
        active: i === activeTabIndex,
    })));
}

// ── tabs ──────────────────────────────────────────────────────────────────────

function attachInputHandler(view) {
    view.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const mod = process.platform === 'darwin' ? input.meta : input.control;
        if (!mod) return;

        if (input.key === 't') {
            event.preventDefault();
            createTab();
        } else if (input.key === 'w') {
            event.preventDefault();
            closeTab(activeTabIndex);
        } else if (input.key === 'Tab') {
            event.preventDefault();
            const dir = input.shift ? -1 : 1;
            switchToTab((activeTabIndex + dir + tabs.length) % tabs.length);
        } else {
            const num = parseInt(input.key);
            if (num >= 1 && num <= 9) {
                event.preventDefault();
                switchToTab(num - 1);
            }
        }
    });
}

function createTab(url = 'https://linear.app') {
    const view = new WebContentsView({
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    mainWindow.contentView.addChildView(view);

    const tab = { view, title: 'Linear' };
    tabs.push(tab);

    view.webContents.on('page-title-updated', (_, title) => {
        tab.title = title || 'Linear';
        syncTabBar();
    });

    view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
        if (openUrl.startsWith('https://linear.app')) {
            setImmediate(() => createTab(openUrl));
        } else {
            shell.openExternal(openUrl);
        }
        return { action: 'deny' };
    });

    attachInputHandler(view);
    view.webContents.loadURL(url);
    switchToTab(tabs.length - 1);
}

function switchToTab(index) {
    if (index < 0 || index >= tabs.length) return;
    activeTabIndex = index;
    relayout();
    syncTabBar();
    tabs[index].view.webContents.focus();
}

function closeTab(index) {
    if (index < 0 || index >= tabs.length) return;
    if (tabs.length === 1) { app.quit(); return; }

    const [removed] = tabs.splice(index, 1);
    mainWindow.contentView.removeChildView(removed.view);
    removed.view.webContents.close();

    activeTabIndex = -1;
    switchToTab(Math.min(index, tabs.length - 1));
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.on('tab-create', () => createTab());
ipcMain.on('tab-close', (_, i) => closeTab(i));
ipcMain.on('tab-switch', (_, i) => switchToTab(i));

// ── main window ───────────────────────────────────────────────────────────────

function createWindow() {
    const state = loadWindowState();

    mainWindow = new BrowserWindow({
        width: state.width || 1280,
        height: state.height || 800,
        ...(Number.isFinite(state.x) && Number.isFinite(state.y) ? { x: state.x, y: state.y } : {}),
    });
    mainWindow.setMenu(null);

    tabBarView = new WebContentsView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'tabbar-preload.js'),
        },
    });
    mainWindow.contentView.addChildView(tabBarView);
    tabBarView.webContents.loadFile(path.join(__dirname, 'tabbar.html'));

    createTab();

    mainWindow.on('resize', relayout);
    mainWindow.on('close', () => saveWindowState(mainWindow.getBounds()));
}

// ── app lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

    session.defaultSession.setPermissionRequestHandler((_, permission, callback, details) => {
        const isLinear = (details?.requestingUrl || '').startsWith('https://linear.app');
        callback(permission === 'notifications' && isLinear);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
