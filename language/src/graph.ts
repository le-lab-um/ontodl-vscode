// Mermaid draws the picture in the editor preview. A concept is an
// ellipse, an individual is a box, and a value is a box. An arrow is
// iof, a triple, or a property value.

import { type SymbolTable } from './symbols.js';

export function ontologyGraph(table: SymbolTable): string {
	const lines = ['flowchart LR'];
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
		lines.push(`  ${id}(("${text(concept.name)}"))`);
	}
	for (const individual of table.individuals.values()) {
		const id = node(`individual:${individual.name}`);
		lines.push(`  ${id}["${text(individual.name)}"]`);
	}
	for (const fact of table.facts) {
		const from = endpoint(table, fact.subject);
		const to = endpoint(table, fact.object);
		if (!from || !to) {
			continue;
		}
		const label = text(fact.relation);
		lines.push(`  ${node(from)} -->|"${label}"| ${node(to)}`);
	}
	for (const item of table.assignments) {
		const from = endpoint(table, item.owner);
		if (!from) {
			continue;
		}
		const id = node(`value:${item.start}`);
		const label = text(`${item.attribute}=${item.value}`);
		lines.push(`  ${id}["${label}"]`);
		lines.push(`  ${node(from)} -->|"properties"| ${id}`);
	}

	const diagram = ['```mermaid', ...lines, '```'].join('\n');
	const title = table.ontology?.name;
	return title ? `# ${title}\n\n${diagram}\n` : `${diagram}\n`;
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
	return value.replaceAll('"', '#quot;').replaceAll('|', '/');
}
