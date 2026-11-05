import * as fs from 'node:fs';
import * as path from 'node:path';

import { type SourceSpan } from './symbols.js';

export interface ExpandProblem {
	message: string;
	start: number;
	end: number;
	severity: 'warning';
}

export interface MappedSpan extends SourceSpan {
	file?: string;
}

interface ExpandHit {
	start: number;
	end: number;
	path: string;
}

interface Piece {
	start: number;
	end: number;
	origin: number;
	anchor?: SourceSpan;
	file?: string;
}

export function expandSource(source: string, filePath: string): {
	text: string;
	problems: ExpandProblem[];
	mapSpan: (start: number, end: number) => MappedSpan;
	mapPoint: (offset: number) => number;
} {
	const hits = findExpands(source);
	if (hits.length === 0) {
		return {
			text: source,
			problems: [],
			mapSpan: (start, end) => ({ start, end }),
			mapPoint: offset => offset
		};
	}

	const directory = path.dirname(filePath);
	const stack = [path.resolve(filePath)];
	const problems: ExpandProblem[] = [];
	const pieces: Piece[] = [];
	let text = '';
	let cursor = 0;

	const push = (
		chunk: string,
		origin: number,
		anchor?: SourceSpan,
		file?: string
	): void => {
		if (chunk.length === 0) {
			return;
		}
		const start = text.length;
		text += chunk;
		pieces.push({
			start,
			end: text.length,
			origin,
			anchor,
			file
		});
	};

	for (const hit of hits) {
		push(source.slice(cursor, hit.start), cursor);
		const loaded = load(hit.path, directory, stack);
		const anchor = { start: hit.start, end: hit.end };
		if ('error' in loaded) {
			problems.push({
				severity: 'warning',
				message: loaded.error,
				...anchor
			});
			push(source.slice(hit.start, hit.end), hit.start);
		} else {
			push(loaded.text, hit.start, anchor, hit.path);
		}
		cursor = hit.end;
	}
	push(source.slice(cursor), cursor);
	if (pieces.length === 0) {
		return {
			text,
			problems,
			mapSpan: (start, end) => ({ start, end }),
			mapPoint: offset => offset
		};
	}

	const pieceAt = (offset: number): Piece => {
		const index = offset >= text.length
			? Math.max(text.length - 1, 0)
			: offset;
		return pieces.find(piece =>
			index >= piece.start && index < piece.end
		) ?? pieces[0];
	};

	const mapPoint = (offset: number): number => {
		const piece = pieceAt(offset);
		if (piece.anchor) {
			return piece.anchor.start;
		}
		return piece.origin + (offset - piece.start);
	};

	const mapSpan = (start: number, end: number): MappedSpan => {
		const piece = pieceAt(start);
		if (piece.anchor) {
			return { ...piece.anchor, imported: true, file: piece.file };
		}
		const last = Math.max(start, end - 1);
		const endPiece = pieceAt(last);
		const mappedLast = endPiece.anchor
			? endPiece.anchor.end - 1
			: endPiece.origin + (last - endPiece.start);
		return { start: mapPoint(start), end: mappedLast + 1 };
	};

	return { text, problems, mapSpan, mapPoint };
}

function load(
	rel: string,
	directory: string,
	stack: string[]
): { text: string } | { error: string } {
	const file = path.resolve(directory, rel);
	if (stack.includes(file)) {
		return { error: `expand cycle at ${rel}` };
	}
	let text: string;
	try {
		text = fs.readFileSync(file, 'utf8');
	} catch {
		return { error: `cannot read ${rel}` };
	}
	return {
		text: inline(text, path.dirname(file), [...stack, file])
	};
}

function inline(source: string, directory: string, stack: string[]): string {
	const hits = findExpands(source);
	if (hits.length === 0) {
		return source;
	}
	let out = '';
	let cursor = 0;
	for (const hit of hits) {
		out += source.slice(cursor, hit.start);
		const loaded = load(hit.path, directory, stack);
		out += 'text' in loaded ? loaded.text : '';
		cursor = hit.end;
	}
	return out + source.slice(cursor);
}

function findExpands(source: string): ExpandHit[] {
	const hits: ExpandHit[] = [];
	let i = 0;
	while (i < source.length) {
		const char = source[i];
		if (char === '%') {
			const newline = source.indexOf('\n', i);
			i = newline < 0 ? source.length : newline + 1;
			continue;
		}
		if (char === '"' || char === '\'') {
			i++;
			while (
				i < source.length
				&& source[i] !== char
				&& source[i] !== '\n'
			) {
				i++;
			}
			i++;
			continue;
		}
		if (isExpand(source, i)) {
			const hit = readPath(source, i);
			if (hit) {
				hits.push(hit);
				i = hit.end;
				continue;
			}
		}
		i++;
	}
	return hits;
}

function isExpand(source: string, index: number): boolean {
	return source.startsWith('expand', index)
		&& !isIdent(source[index - 1])
		&& isSpace(source[index + 'expand'.length]);
}

function readPath(source: string, keyword: number): ExpandHit | undefined {
	let index = keyword + 'expand'.length;
	while (isSpace(source[index])) {
		index++;
	}
	const pathStart = index;
	while (
		index < source.length
		&& !isSpace(source[index])
		&& source[index] !== ';'
	) {
		index++;
	}
	const file = source.slice(pathStart, index);
	while (isSpace(source[index])) {
		index++;
	}
	if (!file || source[index] !== ';') {
		return undefined;
	}
	return { start: keyword, end: index + 1, path: file };
}

function isSpace(char: string | undefined): boolean {
	return char === ' '
		|| char === '\t'
		|| char === '\n'
		|| char === '\r';
}

function isIdent(char: string | undefined): boolean {
	return char !== undefined
		&& /[A-Za-z0-9_\u00C0-\u024F/-]/u.test(char);
}
