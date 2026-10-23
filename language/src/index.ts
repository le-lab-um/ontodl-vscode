export type DiagnosticSeverity = 'error' | 'warning';

export interface LanguageDiagnostic {
	message: string;
	start: number;
	end: number;
	severity: DiagnosticSeverity;
}

export interface AnalysisResult {
	diagnostics: LanguageDiagnostic[];
}

import {
	ANTLRErrorListener,
	ATNSimulator,
	BaseErrorListener,
	CharStream,
	CommonTokenStream,
	RecognitionException,
	Recognizer,
	Token
} from 'antlr4ng';

import { OntoDLPlusLexer } from './generated/OntoDLPlusLexer.js';
import { OntoDLPlusParser } from './generated/OntoDLPlusParser.js';

class DiagnosticListener extends BaseErrorListener implements ANTLRErrorListener {
	public readonly diagnostics: LanguageDiagnostic[] = [];

	public constructor(private readonly source: string) {
		super();
	}

	public override syntaxError<T extends ATNSimulator>(
		_recognizer: Recognizer<T>,
		offendingSymbol: Token | null,
		line: number,
		column: number,
		message: string,
		_error: RecognitionException | null
	): void {
		const tokenStart = offendingSymbol?.start ?? -1;
		const tokenStop = offendingSymbol?.stop ?? -1;
		const start = tokenStart >= 0
			? tokenStart
			: this.offsetAt(line, column);
		const end = tokenStop >= start
			? tokenStop + 1
			: Math.min(start + 1, this.source.length);

		this.diagnostics.push({
			severity: 'error',
			start,
			end,
			message
		});
	}

	private offsetAt(line: number, column: number): number {
		let offset = 0;
		let currentLine = 1;

		while (currentLine < line) {
			const lineEnd = this.source.indexOf('\n', offset);
			if (lineEnd < 0) {
				return this.source.length;
			}
			offset = lineEnd + 1;
			currentLine++;
		}

		return Math.min(offset + column, this.source.length);
	}
}

export function analyze(source: string): AnalysisResult {
	const listener = new DiagnosticListener(source);
	const lexer = new OntoDLPlusLexer(CharStream.fromString(source));
	lexer.removeErrorListeners();
	lexer.addErrorListener(listener);

	const tokens = new CommonTokenStream(lexer);
	const parser = new OntoDLPlusParser(tokens);
	parser.removeErrorListeners();
	parser.addErrorListener(listener);
	parser.ontology();

	return { diagnostics: listener.diagnostics };
}