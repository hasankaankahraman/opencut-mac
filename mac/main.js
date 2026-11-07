// OpenCut for Mac: runs the Next.js standalone server on loopback and shows it
// in a Chromium window. Media never leaves the machine: projects and files live
// in this app's IndexedDB/OPFS storage under ~/Library/Application Support.

const { app, BrowserWindow, Menu, dialog, shell, session, utilityProcess } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

// Fixed on purpose: browser storage is keyed by origin, so a different port
// would open an empty project list.
const HOST = "127.0.0.1";
const PORT = 47321;
const ORIGIN = `http://${HOST}:${PORT}`;
const START_PATH = "/projects";
const BLOCKED_HOSTS = ["databuddy.cc"]; // analytics bundled with the web build

let server = null;
let mainWindow = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});
	app.whenReady().then(start);
}

function serverDir() {
	return app.isPackaged
		? path.join(process.resourcesPath, "server", "apps", "web")
		: path.join(__dirname, "..", "apps", "web", ".next", "standalone", "apps", "web");
}

// A per-install auth secret, so none is baked into the app bundle.
function authSecret() {
	const file = path.join(app.getPath("userData"), "auth-secret");
	try {
		return fs.readFileSync(file, "utf8").trim();
	} catch {
		const secret = crypto.randomBytes(32).toString("hex");
		fs.writeFileSync(file, secret, { mode: 0o600 });
		return secret;
	}
}

function portIsFree() {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.once("error", () => resolve(false));
		probe.once("listening", () => probe.close(() => resolve(true)));
		probe.listen(PORT, HOST);
	});
}

function startServer() {
	const logPath = path.join(app.getPath("logs"), "server.log");
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
	const log = fs.createWriteStream(logPath, { flags: "a" });

	// The editor runs entirely in the browser. These values only satisfy the
	// web app's env validation; the services behind them (accounts, feedback,
	// sound search) are not available offline.
	const env = {
		...process.env,
		NODE_ENV: "production",
		NEXT_TELEMETRY_DISABLED: "1",
		PORT: String(PORT),
		HOSTNAME: HOST,
		NEXT_PUBLIC_SITE_URL: ORIGIN,
		NEXT_PUBLIC_MARBLE_API_URL: "https://api.marblecms.com",
		DATABASE_URL: "postgresql://opencut:opencut@127.0.0.1:5432/opencut",
		BETTER_AUTH_SECRET: authSecret(),
		UPSTASH_REDIS_REST_URL: "http://127.0.0.1:8079",
		UPSTASH_REDIS_REST_TOKEN: "offline",
		MARBLE_WORKSPACE_KEY: "offline",
		FREESOUND_CLIENT_ID: "offline",
		FREESOUND_API_KEY: "offline",
	};

	const dir = serverDir();
	server = utilityProcess.fork(path.join(dir, "server.js"), [], {
		cwd: dir,
		env,
		stdio: "pipe",
		serviceName: "OpenCut Server",
	});
	server.stdout.pipe(log);
	server.stderr.pipe(log);
	server.on("exit", (code) => {
		server = null;
		if (quitting) return;
		dialog.showErrorBox(
			"OpenCut",
			`The editor server stopped unexpectedly (code ${code}).\nLog: ${logPath}`,
		);
		app.quit();
	});
}

async function waitForServer(timeoutMs = 30000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${ORIGIN}/api/health`);
			if (res.ok) return true;
		} catch {}
		await new Promise((r) => setTimeout(r, 200));
	}
	return false;
}

function isLocal(url) {
	try {
		return new URL(url).origin === ORIGIN;
	} catch {
		return false;
	}
}

function hardenSession() {
	const ses = session.defaultSession;

	ses.webRequest.onBeforeRequest((details, callback) => {
		let host = "";
		try {
			host = new URL(details.url).hostname;
		} catch {}
		const blocked = BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
		callback({ cancel: blocked });
	});

	// Grant permissions (persistent storage, clipboard, fullscreen…) only to
	// the local editor.
	ses.setPermissionRequestHandler((wc, _permission, callback, details) => {
		callback(isLocal(details.requestingUrl || wc.getURL()));
	});
	ses.setPermissionCheckHandler((_wc, _permission, requestingOrigin) => requestingOrigin === ORIGIN);
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 600,
		title: "OpenCut",
		backgroundColor: "#0a0a0a",
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	mainWindow.once("ready-to-show", () => mainWindow.show());
	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	// Links to other sites open in the default browser, not in the app.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (isLocal(url)) return { action: "allow" };
		if (/^https?:/.test(url)) shell.openExternal(url);
		return { action: "deny" };
	});
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (isLocal(url)) return;
		event.preventDefault();
		if (/^https?:/.test(url)) shell.openExternal(url);
	});

	mainWindow.loadURL(`${ORIGIN}${START_PATH}`);
}

function buildMenu() {
	const template = [
		{ role: "appMenu" },
		{ role: "fileMenu" },
		{ role: "editMenu" },
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{ role: "windowMenu" },
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start() {
	buildMenu();
	hardenSession();

	if (!(await portIsFree())) {
		dialog.showErrorBox(
			"OpenCut",
			`Port ${PORT} is already in use by another program.\nOpenCut needs it to keep your projects at the same address. Close that program and try again.`,
		);
		app.quit();
		return;
	}

	startServer();
	if (!(await waitForServer())) {
		dialog.showErrorBox(
			"OpenCut",
			`The editor server did not start.\nLog: ${path.join(app.getPath("logs"), "server.log")}`,
		);
		app.quit();
		return;
	}

	createWindow();

	app.on("activate", () => {
		if (!mainWindow) createWindow();
	});
}

// Keep the server alive while the app sits in the Dock with no windows, like
// other Mac apps; it stops on Quit.
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
	quitting = true;
	if (server) server.kill();
});
