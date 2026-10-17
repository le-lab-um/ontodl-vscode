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

/**
 * Analyzes OntoDL+ source without depending on VS Code or the LSP protocol.
 *
 * The current rule is kept from the sample server while the grammar parser is
 * being integrated. Its result type is already independent from LSP and can
 * be extended with an AST and semantic diagnostics later.
 */
export function analyze(source: string, maxDiagnostics = 1000): AnalysisResult {
	const diagnostics: LanguageDiagnostic[] = [];
	const pattern = /\b[A-Z]{2,}\b/g;
	let match: RegExpExecArray | null;

	while (diagnostics.length < maxDiagnostics && (match = pattern.exec(source))) {
		diagnostics.push({
			severity: 'warning',
			start: match.index,
			end: match.index + match[0].length,
			message: `${match[0]} is all uppercase.`
		});
	}

	return { diagnostics };
}