/**
 * ESLint configuration for the project.
 *
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import oxlint from 'eslint-plugin-oxlint';

export default tseslint.config(
	{
		ignores: [
			'**/.vscode-test',
			'**/out',
			'language/src/generated/**'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylistic,
	stylistic.configs.customize({
		indent: 'tab',
		quotes: 'single',
		semi: true,
		commaDangle: 'never',
		braceStyle: '1tbs'
	}),
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mjs']
				},
				tsconfigRootDir: import.meta.dirname
			}
		},
		plugins: {
			'@stylistic': stylistic
		},
		rules: {
			'curly': 'warn',
			'@stylistic/linebreak-style': ['warn', 'unix'],
			'@stylistic/max-len': ['warn', {
				code: 80,
				tabWidth: 4,
				ignoreUrls: true,
				ignorePattern: String.raw`^\s*'.*',?$`,
				ignoreTemplateLiterals: true,
				ignoreRegExpLiterals: true
			}],
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					selector: 'import',
					format: ['camelCase', 'PascalCase']
				}
			],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_'
				}
			]
		}
	},
	...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
	{
		files: ['eslint.config.mjs'],
		extends: [tseslint.configs.disableTypeChecked]
	}
);
