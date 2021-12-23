import * as lsp from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import * as parser from "./parser"
import docs from "../git/Documentation/config.json"
import path from "path"

// a.<name> === a.b
const matchVariable = (doc: string, code: string) => {
    const l = doc.toLowerCase().split(".")
    const r = code.split(".")
    return l.length === r.length && l.every((v, i) => v.startsWith("<") || r[i].startsWith("<") || v === r[i])
}

const getDocument = (key: string) => {
    for (const [k, v] of Object.entries(docs)) {
        if (matchVariable(k, key)) { return v }
    }
    return null
}

const conn = lsp.createConnection(lsp.ProposedFeatures.all)
const documents: lsp.TextDocuments<TextDocument> = new lsp.TextDocuments(TextDocument)

const legend: lsp.SemanticTokensLegend = {
    tokenTypes: ["gitconfigSection", "number", "gitconfigProperty", "gitconfigBool", "gitconfigColor", "string"],
    tokenModifiers: [],
}
const tokenTypeMap = new Map<string, number>([...legend.tokenTypes.values()].map((v, i) => [v, i]))

conn.onInitialize((params) => {
    return {
        capabilities: {
            textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
            semanticTokensProvider: { documentSelector: [{ language: "gitconfig" }, { language: "properties" }], legend, full: true, range: false },
            hoverProvider: {},
            completionProvider: { triggerCharacters: ["["] },
        }
    }
})

const isGitConfigFile = (textDocument: TextDocument) =>
    textDocument.uri.endsWith(`.git${path.sep}config`) || textDocument.languageId === "gitconfig"

const toLSPPosition = (range: { readonly line: number, readonly column: number }): lsp.Position =>
    ({ line: range.line - 1, character: range.column - 1 })

const toLSPRange = (range: { start: { readonly line: number, readonly column: number }, end: { readonly line: number, readonly column: number } }): lsp.Range =>
    ({ start: toLSPPosition(range.start), end: toLSPPosition(range.end) })

const check = (textDocument: TextDocument) => {
    if (!isGitConfigFile(textDocument)) {
        conn.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] })
    } else {
        conn.sendDiagnostics({
            uri: textDocument.uri,
            diagnostics: parser.gitConfigParser.check(textDocument.getText())
                .map((err) => ({ range: toLSPRange(err.location), message: err.message, severity: lsp.DiagnosticSeverity.Error }))
        })
    }
}

documents.onDidOpen(({ document }) => { check(document) })
documents.onDidChangeContent(({ document }) => { check(document) })

const isBefore = (self: lsp.Position, other: lsp.Position) => self.line < other.line || other.line === self.line && self.character < other.character;
const containsPosition = (self: lsp.Range, other: lsp.Position) => !isBefore(other, self.start) && !isBefore(self.end, other)
const containsRange = (a: lsp.Range, b: lsp.Range) => containsPosition(a, b.start) && containsPosition(a, b.end)

conn.languages.semanticTokens.on(({ textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    const builder = new lsp.SemanticTokensBuilder()
    if (textDocument === undefined || !isGitConfigFile(textDocument)) { return builder.build() }
    const text = textDocument.getText()
    const lines = text.split("\n")

    const pushRange = (range: lsp.Range, tokenTypeName: string, tokenModifiers: number = 0) => {
        const tokenType = tokenTypeMap.get(tokenTypeName)
        if (tokenType === undefined) { throw new Error(`Undeclared token type ${tokenTypeName}`) }
        let character = range.start.character
        for (let line = range.start.line; line <= range.end.line; line++) {
            builder.push(line, character, Math.max(0, (line === range.end.line ? range.end.character : (lines[line]?.length ?? 0)) - character), tokenType, tokenModifiers)
            character = 0
        }
    }

    const f = parser.gitConfigParser.parse(text)
    if (f !== null) {
        for (const section of f) {
            if (section.sectionHeader.ast !== null) {
                const subsectionLocation = section.sectionHeader.ast.subsectionLocation !== null ? toLSPRange(section.sectionHeader.ast.subsectionLocation) : null
                for (const v of section.sectionHeader.ast.parts) {
                    const range = toLSPRange(v.location)
                    if (subsectionLocation !== null && containsRange(subsectionLocation, range)) { continue }
                    pushRange(range, "gitconfigSection")
                }
                if (subsectionLocation !== null) {
                    pushRange(subsectionLocation, "string")
                }
            }
            for (const assignment of section.variableAssignments) {
                if (assignment.ast === null) { continue }
                const [name, value] = assignment.ast
                pushRange(toLSPRange(name.location), "gitconfigProperty")
                if (value !== null) {
                    // https://git-scm.com/docs/git-config#_values
                    switch (parser.valueParser.parse(value.text)) {
                        case "true": case "false": pushRange(toLSPRange(value.location), "gitconfigBool"); break
                        case "color": pushRange(toLSPRange(value.location), "gitconfigColor"); break
                        case "integer": pushRange(toLSPRange(value.location), "number"); break
                        default: pushRange(toLSPRange(value.location), "string"); break
                    }
                }
            }
        }
    }
    return builder.build()
})

const escapeMarkdown = (s: string) => s.replace(/\*/g, "\\&").replace(/</g, "&lt;").replace(/>/g, "&gt;")

conn.onHover(({ position, textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitConfigFile(textDocument)) { return }
    const f = parser.gitConfigParser.parse(textDocument.getText())
    if (f === null) { return }
    const newHover = (value: string, range: lsp.Range): lsp.Hover => ({ contents: { kind: lsp.MarkupKind.Markdown, value }, range })
    for (const section of f) {
        if (section.sectionHeader.ast === null) { continue }
        {
            const range = toLSPRange(section.sectionHeader.location)
            if (containsPosition(range, position)) {
                const sectionName = section.sectionHeader.ast.parts.map((v) => v.text).join(".")
                const documentation = Object.entries(docs).find((v) => v[0].endsWith(".*") && matchVariable(v[0].slice(0, -".*".length), sectionName))?.[1].documentation
                return newHover(documentation ? `${escapeMarkdown(sectionName)}\n\n---\n${documentation}` : escapeMarkdown(sectionName), range)
            }
        }
        for (const assignment of section.variableAssignments) {
            if (assignment.ast === null) { continue }
            const [name, value] = assignment.ast
            const range = toLSPRange(name.location)
            if (containsPosition(range, position)) {
                const key = section.sectionHeader.ast.parts.map((v) => v.text).join(".") + "." + name.text
                const documentation = getDocument(key)?.documentation
                return newHover(documentation ? `${escapeMarkdown(key)}\n\n---\n${documentation}` : escapeMarkdown(key), range)
            }
        }
    }
})

conn.onCompletion(({ position, textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitConfigFile(textDocument)) { return }
    const text = textDocument.getText()
    const f = parser.gitConfigParser.parse(text)
    let currentSection: string | null = null
    if (f !== null) {
        for (const section of f) {
            const range = toLSPRange(section.sectionHeader.location)
            if (containsPosition(range, position)) {
                return [] // the cursor is in a section header
            }
            if (isBefore(range.end, position)) {
                currentSection =
                    section.sectionHeader.ast === null ? null :
                        section.sectionHeader.ast.parts.map((v) => v.text).join(".")
            }
        }
    }

    return Object.entries(docs).flatMap(([k, v]) => {
        if (!v.autocomplete) { return [] }

        const item: lsp.CompletionItem = { label: k, kind: lsp.CompletionItemKind.Property }
        const parts = k.split(".")

        let i = 1
        const sectionHeader = currentSection === parts.slice(0, -1).join(".") ? "" :
            (`[${parts[0]}${parts.length >= 3 ? ` "${parts.slice(1, -1).join(".").replaceAll("\\", "\\\\").replaceAll(`"`, `\\"`)}"` : ""}]\n\t`)
                .replace(/<([^>]+)>/g, (_, m) => `\${${i++}:${m}}`)

        let variable = parts[parts.length - 1]
        if (variable === "*") {
            variable = `\${${i++}:name}`
        }

        item.insertText = `${sectionHeader}${variable} = $${i}`
        item.insertTextFormat = lsp.InsertTextFormat.Snippet

        if (v.deprecated) {
            item.tags = [lsp.CompletionItemTag.Deprecated]
        }

        item.documentation = { kind: lsp.MarkupKind.Markdown, value: v.documentation }
        return [item]
    })
})

documents.listen(conn)
conn.listen()
