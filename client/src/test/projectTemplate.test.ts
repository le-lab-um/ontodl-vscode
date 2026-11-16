import * as assert from 'node:assert/strict';

import { createOntologySource, validateProjectName } from '../projectTemplate';

suite('OntoDL+ project template', () => {
	test('accepts valid project names', () => {
		const names = ['MyOntology', 'Mapa-2026', 'Conceitos_1', 'Ligação'];
		for (const name of names) {
			assert.equal(validateProjectName(name), undefined, name);
		}
	});

	test('rejects unsafe names and invalid identifiers', () => {
		for (const name of [
			'', '.', '..', '../outside', 'a/b', 'a\\b',
			'with space', '2start', 'CON', 'lpt1', 'a'.repeat(81)
		]) {
			assert.notEqual(validateProjectName(name), undefined, name);
		}
	});

	test('generates a complete ontology using the project name', () => {
		const source = createOntologySource('Mapa-2026');
		assert.ok(source.startsWith('Ontologia Projeto_Mapa-2026\n'));
		assert.ok(source.includes('conceitos {'));
		assert.ok(source.includes('relacoes {'));
		assert.ok(source.includes('triplos {'));
		assert.ok(source.endsWith('}.\n'));
	});
});
