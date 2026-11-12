import {
	commands,
	ViewColumn,
	workspace,
	type ExtensionContext,
	type Uri,
	type WebviewPanel,
	window
} from 'vscode';
import { type LanguageClient } from 'vscode-languageclient/node';

let panel: WebviewPanel | undefined;
let suggested: Uri | undefined;
let engine: Promise<{
	dot(source: string, format?: string): string;
}> | undefined;

export function registerGraph(
	context: ExtensionContext,
	client: LanguageClient,
	starting: PromiseLike<void>
): void {
	context.subscriptions.push(
		commands.registerCommand('ontodl.showGraph', () => {
			void show(client, starting);
		})
	);
}

async function show(
	client: LanguageClient,
	starting: PromiseLike<void>
): Promise<void> {
	const editor = window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'ontodlp') {
		void window.showInformationMessage(
			'Open an OntoDL+ file to show its graph.'
		);
		return;
	}
	try {
		await starting;
		const dot = await client.sendRequest<string>('ontodl/graph', {
			uri: editor.document.uri.toString()
		});
		engine ??= import('@hpcc-js/wasm-graphviz')
			.then(mod => mod.Graphviz.load());
		const svg = (await engine).dot(dot, 'svg');
		const start = svg.indexOf('<svg');
		const image = start >= 0 ? svg.slice(start) : svg;
		suggested = editor.document.uri.with({
			path: editor.document.uri.path.replace(/\.[^.]+$/, '.png')
		});
		open().webview.html = page(image);
	} catch (error) {
		engine = undefined;
		const message = error instanceof Error
			? error.message
			: 'Could not build the graph';
		void window.showErrorMessage(message);
	}
}

function open(): WebviewPanel {
	if (panel) {
		panel.reveal(ViewColumn.Beside);
		return panel;
	}
	panel = window.createWebviewPanel(
		'ontodl.graph',
		'OntoDL+ Graph',
		ViewColumn.Beside,
		{ enableScripts: true }
	);
	const messages = panel.webview.onDidReceiveMessage((markup: unknown) => {
		void save(markup);
	});
	panel.onDidDispose(() => {
		messages.dispose();
		panel = undefined;
	});
	return panel;
}

async function save(markup: unknown): Promise<void> {
	if (typeof markup !== 'string') {
		return;
	}
	const encoded = markup.split(',')[1];
	if (!encoded) {
		return;
	}
	const uri = await window.showSaveDialog({
		defaultUri: suggested,
		filters: { 'PNG image': ['png'] }
	});
	if (!uri) {
		return;
	}
	try {
		await workspace.fs.writeFile(
			uri,
			Buffer.from(encoded, 'base64')
		);
	} catch (error) {
		const message = error instanceof Error
			? error.message
			: 'Could not save the graph';
		void window.showErrorMessage(message);
	}
}

function page(image: string): string {
	return `<!DOCTYPE html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  html, body { margin: 0; height: 100%; background: #fff; overflow: hidden; }
  button { position: fixed; top: 8px; left: 8px; z-index: 1; }
  svg { transform-origin: 0 0; visibility: hidden; }
</style>
		<button type="button">Save</button>` + image + `<script>
const vscode = acquireVsCodeApi();
const svg = document.querySelector('svg');
const source = svg.outerHTML;
const box = svg.viewBox.baseVal;
svg.style.width = box.width + 'px';
svg.style.height = box.height + 'px';
let x = 0, y = 0, s = 1, drag;
const draw = () => {
  svg.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
};
const fit = () => {
  s = Math.min(innerWidth / box.width, innerHeight / box.height);
  x = (innerWidth - box.width * s) / 2;
  y = (innerHeight - box.height * s) / 2;
  draw();
  svg.style.visibility = 'visible';
};
addEventListener('wheel', (event) => {
  event.preventDefault();
  const n = Math.min(Math.max(s * Math.exp(-event.deltaY * 0.0015), 0.02), 8);
  x = event.clientX - (event.clientX - x) * (n / s);
  y = event.clientY - (event.clientY - y) * (n / s);
  s = n;
  draw();
}, { passive: false });
onpointerdown = (event) => {
  if (event.button || event.target.closest('button')) return;
  drag = { x: event.clientX, y: event.clientY, ox: x, oy: y };
};
onpointermove = (event) => {
  if (!drag) return;
  x = drag.ox + event.clientX - drag.x;
  y = drag.oy + event.clientY - drag.y;
  draw();
};
onpointerup = onpointercancel = () => { drag = undefined; };
ondblclick = (event) => {
  if (!event.target.closest('button')) fit();
};
onresize = fit;
document.querySelector('button').onclick = () => {
  const canvas = document.createElement('canvas');
  canvas.width = box.width * 2;
  canvas.height = box.height * 2;
  const ctx = canvas.getContext('2d');
  const image = new Image();
  image.onload = () => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    vscode.postMessage(canvas.toDataURL('image/png'));
  };
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
};
fit();
</script>`;
}
