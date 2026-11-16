import * as vscode from 'vscode';

import { createOntologySource, validateProjectName } from './projectTemplate';

export function registerProjectCommands(
	context: vscode.ExtensionContext
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('ontodl.createProject', createProject),
		vscode.window.registerTreeDataProvider('ontodl.projectView', {
			getTreeItem: (item: vscode.TreeItem) => item,
			getChildren: () => []
		})
	);
}

async function createProject(): Promise<void> {
	const name = await vscode.window.showInputBox({
		prompt: 'Name your new OntoDL+ project',
		placeHolder: 'MyOntology',
		validateInput: validateProjectName
	});
	if (name === undefined) {
		return;
	}

	const [parent] = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: 'Select Parent Folder',
		defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
	}) ?? [];
	if (!parent) {
		return;
	}

	const project = vscode.Uri.joinPath(parent, name);
	const sourceFile = vscode.Uri.joinPath(project, 'main.odlp');

	try {
		await vscode.workspace.fs.stat(project);
		void vscode.window.showErrorMessage(
			`A file or folder named "${name}" already exists in that location.`
		);
		return;
	} catch (error) {
		if (!(error instanceof vscode.FileSystemError)
			|| error.code !== 'FileNotFound') {
			void vscode.window.showErrorMessage(
				`Cannot check the project location: ${String(error)}`
			);
			return;
		}
	}

	try {
		await vscode.workspace.fs.createDirectory(project);
		await vscode.workspace.fs.writeFile(
			sourceFile,
			new TextEncoder().encode(createOntologySource(name))
		);
	} catch (error) {
		void vscode.window.showErrorMessage(
			`Cannot create the OntoDL+ project: ${String(error)}`
		);
		return;
	}

	const selection = await vscode.window.showInformationMessage(
		`OntoDL+ project "${name}" created.`,
		'Open Project',
		'Open main.odlp'
	);
	if (selection === 'Open Project') {
		await vscode.commands.executeCommand('vscode.openFolder', project);
	} else if (selection === 'Open main.odlp') {
		await vscode.window.showTextDocument(sourceFile);
	}
}
