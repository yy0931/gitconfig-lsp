import * as lsp from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import * as parser from "./parser"
import _docs from "../../git/Documentation/gitattributes.json"
import type { GitattributesDocumentation } from '../../generate-docs'
import { toLSPRange, containsPosition, escapeMarkdown, EasySemanticTokensBuilder, isBefore, isBeforeOrEqual } from '../server-base'

const docs: GitattributesDocumentation = _docs

const conn = lsp.createConnection(lsp.ProposedFeatures.all)
const documents: lsp.TextDocuments<TextDocument> = new lsp.TextDocuments(TextDocument)

const legend: lsp.SemanticTokensLegend = {
    tokenTypes: ["number", "gitconfigProperty", "string", "comment", "keyword"],
    tokenModifiers: [],
}
const tokenTypeMap = new Map<string, number>([...legend.tokenTypes.values()].map((v, i) => [v, i]))

conn.onInitialize((params) => {
    return {
        capabilities: {
            textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
            semanticTokensProvider: { documentSelector: [{ language: "gitattributes" }, { language: "properties" }], legend, full: true, range: false },
            hoverProvider: true,
            completionProvider: { triggerCharacters: [" ", "-", "!"] },
        }
    }
})

const isGitattributesFile = (textDocument: TextDocument) =>
    textDocument.uri.endsWith(`.gitattributes`) || textDocument.languageId === "gitattributes"

const check = (textDocument: TextDocument) => {
    if (!isGitattributesFile(textDocument)) {
        conn.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] })
    } else {
        const err = parser.GitattributesParser.check(textDocument.getText())
        conn.sendDiagnostics({
            uri: textDocument.uri,
            diagnostics: err === null ? [] : [{ range: toLSPRange(err.location), message: err.message, severity: lsp.DiagnosticSeverity.Error }]
        })
    }
}

documents.onDidOpen(({ document }) => { check(document) })
documents.onDidChangeContent(({ document }) => { check(document) })

conn.languages.semanticTokens.on(({ textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitattributesFile(textDocument)) { return new lsp.SemanticTokensBuilder().build() }
    const text = textDocument.getText()
    const lines = text.split("\n")
    const builder = new EasySemanticTokensBuilder(lines, tokenTypeMap)

    const f = parser.GitattributesParser.parse(text)
    if (f !== null) {
        for (const line of f) {
            if (line.type === "pattern") {
                for (const attr of line.attrs) {
                    builder.push(toLSPRange(attr.key.location), docs.find((d) => d.title === attr.key.text) ? "gitconfigProperty" : "keyword")
                    if (attr.value !== null) {
                        builder.push(toLSPRange(attr.value.location), "string")
                    }
                }
            } else if (line.type === "comment") {
                builder.push(toLSPRange(line.comment.location), "comment")
            } else {
                const _: "macro" = line.type
                builder.push(toLSPRange(line.header.location), "keyword")
            }
        }
    }

    return builder.build()
})

conn.onHover(({ position, textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitattributesFile(textDocument)) { return }
    const f = parser.GitattributesParser.parse(textDocument.getText())
    if (f === null) { return }
    const newHover = (value: string, range: lsp.Range): lsp.Hover => ({ contents: { kind: lsp.MarkupKind.Markdown, value }, range })
    for (const line of f) {
        if (line.type === "pattern") {
            for (const attr of line.attrs) {
                const range = toLSPRange(attr.key.location)
                if (containsPosition(range, position)) {
                    if (attr.key.text === "binary") {
                        // built-in macro
                        return newHover(`\`\`\`\n${escapeMarkdown(attr.key.text)} (built-in macro)\n\`\`\`\n\n---\nExpands to \`-text -diff\``, range)
                    }
                    const documentation = docs.find((d) => d.title === attr.key.text)
                    if (documentation !== undefined) {
                        // built-in attribute
                        return newHover(`\`\`\`\n${escapeMarkdown(attr.key.text)}\n\`\`\`\n\n---\n${documentation.documentation}`, range)
                    }
                    // user-defined macro
                    // TODO: expand user-defined macros
                    return newHover(`\`\`\`\n${escapeMarkdown(attr.key.text)} (macro)\n\`\`\`\n`, range)
                }
            }
        } else if (line.type === "comment") {
        } else {
            const _: "macro" = line.type
        }
    }
})

conn.onCompletion(({ position, textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitattributesFile(textDocument)) { return }
    const text = textDocument.getText()
    const f = parser.GitattributesParser.parse(text)

    if (f !== null) {
        for (const line of f) {
            if (!containsPosition(toLSPRange(line.location), position)) { continue }
            if (line.type === "pattern") {
                if (isBeforeOrEqual(position, toLSPRange(line.pattern.location).end)) { return }
                for (const attr of line.attrs) {
                    if (attr.value !== null && containsPosition(toLSPRange(attr.value.location), position)) {
                        return
                    }
                }
                return [
                    ...docs.map((d): lsp.CompletionItem => ({ label: d.title, kind: lsp.CompletionItemKind.Property, documentation: d.documentation })),
                    { label: "binary", kind: lsp.CompletionItemKind.Keyword, documentation: "Expands  to `-text -diff`" }
                ]
            } else if (line.type === "comment") {
            } else {
                const _: "macro" = line.type
            }
        }
    }
})

documents.listen(conn)
conn.listen()
