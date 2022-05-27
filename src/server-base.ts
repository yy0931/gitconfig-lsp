import * as lsp from 'vscode-languageserver/node'

export const toLSPPosition = (range: { readonly line: number, readonly column: number }): lsp.Position =>
    ({ line: range.line - 1, character: range.column - 1 })

export const toLSPRange = (range: { start: { readonly line: number, readonly column: number }, end: { readonly line: number, readonly column: number } }): lsp.Range =>
    ({ start: toLSPPosition(range.start), end: toLSPPosition(range.end) })

export const isBefore = (self: lsp.Position, other: lsp.Position) => self.line < other.line || other.line === self.line && self.character < other.character;
export const isBeforeOrEqual = (self: lsp.Position, other: lsp.Position) => self.line < other.line || other.line === self.line && self.character <= other.character;
export const containsPosition = (self: lsp.Range, other: lsp.Position) => !isBefore(other, self.start) && !isBefore(self.end, other)
export const containsRange = (a: lsp.Range, b: lsp.Range) => containsPosition(a, b.start) && containsPosition(a, b.end)

export const escapeMarkdown = (s: string) => s.replace(/\*/g, "\\*").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export class EasySemanticTokensBuilder {
    private builder = new lsp.SemanticTokensBuilder()

    constructor(private lines: string[], private tokenTypeMap: Map<string, number>) { }

    push(range: lsp.Range, tokenTypeName: string, tokenModifiers: number = 0) {
        const tokenType = this.tokenTypeMap.get(tokenTypeName)
        if (tokenType === undefined) { throw new Error(`Undeclared token type ${tokenTypeName}`) }
        let character = range.start.character
        for (let line = range.start.line; line <= range.end.line; line++) {
            this.builder.push(line, character, Math.max(0, (line === range.end.line ? range.end.character : (this.lines[line]?.length ?? 0)) - character), tokenType, tokenModifiers)
            character = 0
        }
    }

    build() {
        return this.builder.build()
    }
}
