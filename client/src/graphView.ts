import {
	commands,
	type ExtensionContext,
	window,
	workspace
} from 'vscode';
import { type LanguageClient } from 'vscode-languageclient/node';

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
		const markdown = await client.sendRequest<string>('ontodl/graph', {
			uri: editor.document.uri.toString()
		});
		const diagram = await workspace.openTextDocument({
			language: 'markdown',
			content: markdown
		});
		await commands.executeCommand(
			'markdown.showPreviewToSide',
			diagram.uri
		);
	} catch (error) {
		const message = error instanceof Error
			? error.message
			: 'Could not build the graph';
		void window.showErrorMessage(message);
	}
}
