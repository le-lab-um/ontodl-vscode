/* -----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 * -------------------------------------------------------------------------- */
import {
	createConnection,
	TextDocuments,
	CompletionItem,
	CompletionItemKind,
	Definition,
	Diagnostic,
	DiagnosticSeverity,
	DocumentDiagnosticReportKind,
	DocumentSymbol,
	FoldingRange,
	FoldingRangeKind,
	Hover,
	InitializeParams,
	InitializeResult,
	ErrorCodes,
	Location,
	MarkupKind,
	ProposedFeatures,
	ResponseError,
	SymbolKind,
	TextDocumentSyncKind,
	WorkspaceEdit,
	type DocumentDiagnosticReport,
	type Position
} from 'vscode-languageserver/node';

import { fileURLToPath } from 'node:url';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import {
	analyze,
	completions,
	describe,
	emptySymbolTable,
	outline,
	references,
	renameRejection,
	symbolAt,
	type CompletionEntry,
	type OutlineKind,
	type OutlineNode,
	type SymbolHit
} from '@ontodl/language';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {
				resolveProvider: false
			},
			definitionProvider: true,
			documentSymbolProvider: true,
			foldingRangeProvider: true,
			hoverProvider: true,
			referencesProvider: true,
			renameProvider: {
				prepareProvider: true
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(() => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

connection.languages.diagnostics.on((params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

/**
 * Adapts diagnostics produced by the language analyzer to the LSP format.
 *
 * The analyzer reports offsets into the document text, while LSP expects
 * line-and-character positions. Keeping this conversion here prevents the
 * language package from depending on VS Code or the LSP protocol.
 */
function analysisOf(document: TextDocument) {
	const text = document.getText();
	if (!document.uri.startsWith('file:')) {
		return analyze(text);
	}
	return analyze(text, fileURLToPath(document.uri));
}

function validateTextDocument(textDocument: TextDocument): Diagnostic[] {
	const result = analysisOf(textDocument);

	const allDiagnostics = result.diagnostics.concat(
		result.semanticDiagnostics
	);

	return allDiagnostics.map((diagnostic) => {
		const lspDiagnostic: Diagnostic = {
			severity: diagnostic.severity === 'error'
				? DiagnosticSeverity.Error
				: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(diagnostic.start),
				end: textDocument.positionAt(diagnostic.end)
			},
			message: diagnostic.message,
			source: 'ontodl'
		};

		return lspDiagnostic;
	});
}

connection.onDidChangeWatchedFiles(() => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

connection.onCompletion((params): CompletionItem[] => {
	const document = documents.get(params.textDocument.uri);
	const table = document
		? analysisOf(document).symbols
		: emptySymbolTable();
	return completions(table).map((entry) => {
		const item: CompletionItem = {
			label: entry.label,
			kind: completionKind(entry.kind)
		};
		if (entry.detail) {
			item.detail = entry.detail;
		}
		return item;
	});
});

connection.onHover((params): Hover | null => {
	const found = locate(params.textDocument.uri, params.position);
	if (!found) {
		return null;
	}
	return {
		contents: {
			kind: MarkupKind.PlainText,
			value: describe(found.symbol)
		},
		range: rangeOf(found.document, found.start, found.end)
	};
});

connection.onDefinition((params): Definition | null => {
	const found = locate(params.textDocument.uri, params.position);
	if (!found) {
		return null;
	}
	return {
		uri: found.document.uri,
		range: rangeOf(
			found.document,
			found.symbol.start,
			found.symbol.end
		)
	};
});

connection.onReferences((params): Location[] | null => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return null;
	}
	const spans = references(
		analysisOf(document).symbols,
		document.offsetAt(params.position),
		params.context.includeDeclaration
	);
	if (!spans) {
		return null;
	}
	return spans.map(span => ({
		uri: document.uri,
		range: rangeOf(document, span.start, span.end)
	}));
});

connection.onPrepareRename((params) => {
	const found = locate(params.textDocument.uri, params.position);
	if (!found) {
		return null;
	}
	return {
		range: rangeOf(found.document, found.start, found.end),
		placeholder: found.symbol.name
	};
});

connection.onRenameRequest((params): WorkspaceEdit => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		throw new ResponseError(
			ErrorCodes.InvalidRequest,
			'Document is not open'
		);
	}
	const table = analysisOf(document).symbols;
	const offset = document.offsetAt(params.position);
	const problem = renameRejection(table, offset, params.newName);
	if (problem) {
		throw new ResponseError(ErrorCodes.InvalidParams, problem);
	}
	const spans = references(table, offset, true) ?? [];
	return {
		changes: {
			[document.uri]: spans.map(span => ({
				range: rangeOf(document, span.start, span.end),
				newText: params.newName
			}))
		}
	};
});

connection.onDocumentSymbol((params): DocumentSymbol[] => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	return outline(analysisOf(document).symbols)
		.map(node => toDocumentSymbol(document, node));
});

connection.onFoldingRanges((params): FoldingRange[] => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
	return foldingRanges(
		document,
		outline(analysisOf(document).symbols)
	);
});

function locate(uri: string, position: Position): LocatedSymbol | undefined {
	const document = documents.get(uri);
	if (!document) {
		return undefined;
	}
	const hit = symbolAt(
		analysisOf(document).symbols,
		document.offsetAt(position)
	);
	if (!hit) {
		return undefined;
	}
	return { document, ...hit };
}

function rangeOf(document: TextDocument, start: number, end: number) {
	return {
		start: document.positionAt(start),
		end: document.positionAt(Math.min(end, document.getText().length))
	};
}

function toDocumentSymbol(
	document: TextDocument,
	node: OutlineNode
): DocumentSymbol {
	const symbol: DocumentSymbol = {
		name: node.name,
		kind: outlineKind(node.kind),
		range: rangeOf(document, node.start, node.end),
		selectionRange: rangeOf(
			document,
			node.selectionStart,
			node.selectionEnd
		),
		children: node.children.map(child =>
			toDocumentSymbol(document, child)
		)
	};
	if (node.detail) {
		symbol.detail = node.detail;
	}
	return symbol;
}

function foldingRanges(
	document: TextDocument,
	nodes: OutlineNode[]
): FoldingRange[] {
	const ranges: FoldingRange[] = [];
	const visit = (node: OutlineNode): void => {
		const start = document.positionAt(node.start);
		const end = document.positionAt(
			Math.min(node.end, document.getText().length)
		);
		if (end.line > start.line) {
			ranges.push({
				startLine: start.line,
				endLine: end.line,
				kind: FoldingRangeKind.Region
			});
		}
		node.children.forEach(visit);
	};
	nodes.forEach(visit);
	return ranges;
}

function completionKind(kind: CompletionEntry['kind']): CompletionItemKind {
	if (kind === 'keyword') {
		return CompletionItemKind.Keyword;
	}
	if (kind === 'concept') {
		return CompletionItemKind.Class;
	}
	if (kind === 'individual') {
		return CompletionItemKind.Constant;
	}
	if (kind === 'relation') {
		return CompletionItemKind.Interface;
	}
	return CompletionItemKind.Field;
}

function outlineKind(kind: OutlineKind): SymbolKind {
	if (kind === 'ontology') {
		return SymbolKind.Module;
	}
	if (kind === 'section') {
		return SymbolKind.Namespace;
	}
	if (kind === 'concept') {
		return SymbolKind.Class;
	}
	if (kind === 'individual') {
		return SymbolKind.Constant;
	}
	if (kind === 'relation') {
		return SymbolKind.Interface;
	}
	return SymbolKind.Field;
}

interface LocatedSymbol extends SymbolHit {
	document: TextDocument;
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
