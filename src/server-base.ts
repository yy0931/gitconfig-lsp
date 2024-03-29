import * as lsp from 'vscode-languageserver/node'
import type { TextDocument } from 'vscode-languageserver-textdocument'

export const toLSPPosition = (range: { readonly line: number, readonly column: number, readonly offset: number }): lsp.Position & { offset: number } =>
    ({ line: range.line - 1, character: range.column - 1, offset: range.offset })

export const toLSPRange = (range: { start: { readonly line: number, readonly column: number, readonly offset: number }, end: { readonly line: number, readonly column: number, readonly offset: number } }): lsp.Range & { start: { offset: number }, end: { offset: number } } =>
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

/** Equivalent to `text = text.slice(0, offset).replace(/[ \t]+$/g, "") + replacement + text.slice(offset)` */
export const replaceWhitespaceLeft = (offset: number, replacement: string, text: string, textDocument: TextDocument): lsp.TextEdit[] => {
    const space = /[ \t]*$/.exec(text.slice(0, offset))! // TODO: This regexp pattern is known to be slow; /[ \t]+$/.exec(" ".repeat(100000) + "a")
    if (space[0] === replacement) { return [] }
    return [{
        range: { start: textDocument.positionAt(space.index), end: textDocument.positionAt(offset) },
        newText: replacement,
    }]
}

/** Equivalent to `text = text.slice(0, offset) + replacement + text.slice(offset).replace(/^[ \t]+/g, "")` */
export const replaceWhitespaceRight = (offset: number, replacement: string, text: string, textDocument: TextDocument): lsp.TextEdit[] => {
    const space = /^[ \t]*/.exec(text.slice(offset))!
    if (space[0] === replacement) { return [] }
    return [{
        range: { start: textDocument.positionAt(offset), end: textDocument.positionAt(offset + space[0].length) },
        newText: replacement,
    }]
}