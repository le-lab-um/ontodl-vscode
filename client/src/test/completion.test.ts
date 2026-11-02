/* -----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 * -------------------------------------------------------------------------- */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should do completion', () => {
	const docUri = getDocUri('completion.txt');

	test('Completes OntoDL+ keywords and declared names', async () => {
		await activate(docUri);

		const value = await vscode.commands.executeCommand(
			'vscode.executeCompletionItemProvider',
			docUri,
			new vscode.Position(0, 0)
		);
		assert.ok(isCompletionList(value));
		const labels = value.items.map(item =>
			typeof item.label === 'string' ? item.label : item.label.label
		);

		assert.ok(labels.includes('conceitos'));
		assert.ok(labels.includes('City'));
		assert.ok(labels.includes('links'));
		assert.equal(labels.includes('JavaScript'), false);
		assert.equal(labels.includes('TypeScript'), false);
	});
});

function isCompletionList(value: unknown): value is vscode.CompletionList {
	return typeof value === 'object'
		&& value !== null
		&& 'items' in value
		&& Array.isArray(value.items);
}
