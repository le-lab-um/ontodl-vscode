// Limit project names to safe directory names and valid OntoDL+ identifiers.
const PROJECT_NAME = /^[A-Za-z\u00C0-\u024F][A-Za-z0-9_\u00C0-\u024F-]*$/u;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function validateProjectName(name: string): string | undefined {
	if (!name) {
		return 'Enter a project name.';
	}
	if (name.length > 80 || !PROJECT_NAME.test(name)
		|| WINDOWS_RESERVED_NAME.test(name)) {
		return 'Start with a letter. Then use only letters, numbers, _ or -.';
	}
	return undefined;
}

// The prefixed ontology identifier cannot conflict with reserved keywords.
export function createOntologySource(name: string): string {
	return `Ontologia Projeto_${name}

conceitos {
	Pessoa
}

individuos {
	exemplo
}

relacoes {
	conhece
}

triplos {
	exemplo = iof => Pessoa
}.
`;
}
