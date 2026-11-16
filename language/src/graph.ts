// Graphviz dot draws the picture. A concept is an ellipse, an
// individual is a box, and a value is a box. An arrow is iof, a
// triple, or a property value.

import { type SymbolTable } from './symbols.js';

export function ontologyGraph(table: SymbolTable): string {
	const lines = ['digraph {'];
	const name = table.ontology?.name;
	if (name) {
		lines.push(`  label="${text(name)}";`, '  labelloc=t;');
	}
	lines.push('  rankdir=LR;');
	const ids = new Map<string, string>();
	let next = 0;
	const node = (key: string): string => {
		const existing = ids.get(key);
		if (existing) {
			return existing;
		}
		const created = `n${next}`;
		next += 1;
		ids.set(key, created);
		return created;
	};

	for (const concept of table.concepts.values()) {
		const id = node(`concept:${concept.name}`);
		lines.push(
			`  ${id} [label="${text(concept.name)}", shape=ellipse];`
		);
	}
	for (const individual of table.individuals.values()) {
		const id = node(`individual:${individual.name}`);
		lines.push(
			`  ${id} [label="${text(individual.name)}", shape=box];`
		);
	}
	for (const fact of table.facts) {
		const from = endpoint(table, fact.subject);
		const to = endpoint(table, fact.object);
		if (!from || !to) {
			continue;
		}
		const label = text(fact.relation);
		lines.push(
			`  ${node(from)} -> ${node(to)} [label="${label}"];`
		);
	}
	for (const item of table.assignments) {
		const from = endpoint(table, item.owner);
		if (!from) {
			continue;
		}
		const id = node(`value:${item.start}`);
		const label = text(`${item.attribute}=${item.value}`);
		lines.push(`  ${id} [label="${label}", shape=box];`);
		lines.push(
			`  ${node(from)} -> ${id} [label="properties"];`
		);
	}

	lines.push('}');
	return `${lines.join('\n')}\n`;
}

function endpoint(table: SymbolTable, name: string): string | undefined {
	if (table.individuals.has(name)) {
		return `individual:${name}`;
	}
	if (table.concepts.has(name)) {
		return `concept:${name}`;
	}
	return undefined;
}

function text(value: string): string {
	return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
