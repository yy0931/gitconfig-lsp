import * as lsp from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import * as parser from "./parser"
import docs1 from "../../git/Documentation/gitconfig.json"
import docs2 from "../../git-lfs/docs/man/git-lfs-config.5.conn.json"
import * as vscodeUri from "vscode-uri"
import type { GitconfigDocumentation } from '../../generate-docs'
import { setOffset } from '../parser-base'
import { toLSPRange, containsRange, containsPosition, isBefore, escapeMarkdown, EasySemanticTokensBuilder, toLSPPosition, replaceWhitespaceLeft, replaceWhitespaceRight } from '../server-base'

const docs: GitconfigDocumentation = {
    ...docs1,
    ...docs2,
}

// matchVariable('a.<name>, 'a.b') === true
// matchVariable('a.*', 'a.b') === true
// matchVariable('a.fooBar', 'a.foobar') === true
const matchVariable = (doc: string, code: string) => {
    const l = doc.toLowerCase().split(".")
    const r = code.split(".")
    return l.length === r.length &&
        l.every((li, i) => li.startsWith("<") || li === "*" || li === r[i])
}

const conn = lsp.createConnection(lsp.ProposedFeatures.all)
const documents: lsp.TextDocuments<TextDocument> = new lsp.TextDocuments(TextDocument)

const legend: lsp.SemanticTokensLegend = {
    tokenTypes: ["gitconfigSection", "number", "gitconfigProperty", "gitconfigBool", "gitconfigColor", "string", "comment"],
    tokenModifiers: [],
}
const tokenTypeMap = new Map<string, number>([...legend.tokenTypes.values()].map((v, i) => [v, i]))

conn.onInitialize((params) => {
    return {
        capabilities: {
            textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
            semanticTokensProvider: { documentSelector: [{ language: "gitconfig" }, { language: "properties" }], legend, full: true, range: false },
            hoverProvider: true,
            completionProvider: { triggerCharacters: ["["] },
            definitionProvider: true,
            documentFormattingProvider: true,
        }
    }
})

const isGitConfigFile = (textDocument: TextDocument) =>
    textDocument.uri.endsWith(`.git/config`) || textDocument.languageId === "gitconfig"

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

conn.languages.semanticTokens.on(({ textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitConfigFile(textDocument)) { return new lsp.SemanticTokensBuilder().build() }
    const text = textDocument.getText()
    const builder = new EasySemanticTokensBuilder(text.split("\n"), tokenTypeMap)

    const f = parser.gitConfigParser.parse(text)
    if (f !== null) {
        for (const comment of f.headerComments) {
            builder.push(toLSPRange(comment.location), "comment")
        }
        for (const section of f.sections) {
            if (section.sectionHeader.ast !== null) {
                const subsectionLocation = section.sectionHeader.ast.subsectionLocation !== null ? toLSPRange(section.sectionHeader.ast.subsectionLocation) : null
                for (const v of section.sectionHeader.ast.parts) {
                    const range = toLSPRange(v.location)
                    if (subsectionLocation !== null && containsRange(subsectionLocation, range)) { continue }
                    builder.push(range, "gitconfigSection")
                }
                if (subsectionLocation !== null) {
                    builder.push(subsectionLocation, "string")
                }
                for (const comment of section.comments) {
                    builder.push(toLSPRange(comment.location), "comment")
                }
            }
            for (const assignment of section.variableAssignments) {
                if (assignment.ast === null) { continue }
                const { name, value } = assignment.ast
                builder.push(toLSPRange(name.location), "gitconfigProperty")
                if (value !== null) {
                    // https://git-scm.com/docs/git-config#_values
                    switch (parser.valueParser.parse(value.text)?.type) {
                        case "true": case "false": builder.push(toLSPRange(value.location), "gitconfigBool"); break
                        case "color": builder.push(toLSPRange(value.location), "gitconfigColor"); break
                        case "integer": builder.push(toLSPRange(value.location), "number"); break
                        default: builder.push(toLSPRange(value.location), "string"); break
                    }
                }
                for (const comment of assignment.comments) {
                    builder.push(toLSPRange(comment.location), "comment")
                }
            }
        }
    }
    return builder.build()
})

conn.onDocumentFormatting(({ options, textDocument: { uri } }): lsp.TextEdit[] | null => {
    const tab = options.insertSpaces ? " ".repeat(options.tabSize) : "\t"

    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitConfigFile(textDocument)) { return null }
    const text = textDocument.getText()
    const f = parser.gitConfigParser.parse(text)
    if (f === null) { return null }

    const edits: lsp.TextEdit[] = []

    for (const section of f.sections) {
        // `  [section]` -> `[section]`
        edits.push(...replaceWhitespaceLeft(toLSPPosition(section.sectionHeader.location.start).offset, "", text, textDocument))

        // `[ section  "subsections" ]` -> `[section "subsections"]`
        if (section.sectionHeader.ast !== null) {
            if (section.sectionHeader.ast.subsectionLocation !== null) {
                edits.push(...replaceWhitespaceLeft(toLSPPosition(section.sectionHeader.ast.parts[0].location.start).offset, "", text, textDocument))
                edits.push(...replaceWhitespaceRight(toLSPPosition(section.sectionHeader.ast.subsectionLocation.end).offset, "", text, textDocument))
                edits.push(...replaceWhitespaceRight(toLSPPosition(section.sectionHeader.ast.subsectionLocation.start).offset, " ", text, textDocument))
            }
        }

        for (const assignment of section.variableAssignments) {
            if (assignment.ast === null) { continue }
            // ` name  =  value ` -> `name = value`
            edits.push(...replaceWhitespaceLeft(toLSPPosition(assignment.ast.name.location.start).offset, tab, text, textDocument))
            edits.push(...replaceWhitespaceRight(toLSPPosition(assignment.ast.name.location.end).offset, " ", text, textDocument))
            if (assignment.ast.value !== null) {
                edits.push(...replaceWhitespaceLeft(toLSPPosition(assignment.ast.value.location.start).offset, " ", text, textDocument))
                edits.push(...replaceWhitespaceLeft(toLSPPosition(assignment.ast.value.location.end).offset, "", text, textDocument))
            }
        }
    }

    return edits
})

conn.onHover(({ position, textDocument: { uri } }) => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitConfigFile(textDocument)) { return }
    const f = parser.gitConfigParser.parse(textDocument.getText())
    if (f === null) { return }
    const newHover = (value: string, range: lsp.Range): lsp.Hover => ({ contents: { kind: lsp.MarkupKind.Markdown, value }, range })
    for (const section of f.sections) {
        if (section.sectionHeader.ast === null) { continue }
        {
            const range = toLSPRange(section.sectionHeader.location)
            if (containsPosition(range, position)) {
                const sectionName = section.sectionHeader.ast.parts.map((v) => v.text).join(".")
                const documentation = Object.entries(docs).find((v) => v[0].endsWith(".*") && matchVariable(v[0].slice(0, -".*".length), sectionName))
                if (documentation === undefined) { return }
                return newHover(`${escapeMarkdown(documentation[0])}\n\n---\n${documentation[1].documentation}`, range)
            }
        }
        for (const assignment of section.variableAssignments) {
            if (assignment.ast === null) { continue }
            const { name } = assignment.ast
            const range = toLSPRange(name.location)
            if (containsPosition(range, position)) {
                const key = section.sectionHeader.ast.parts.map((v) => v.text).join(".") + "." + name.text
                for (const [k, v] of Object.entries(docs)) {
                    if (matchVariable(k, key)) {
                        return newHover(`${escapeMarkdown(k)}\n\n---\n${v.documentation}`, range)
                    }
                }
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
        for (const section of f.sections) {
            const range = toLSPRange(section.sectionHeader.location)
            if (containsPosition(range, position)) { // if the cursor is on a section header
                return []
            }
            if (isBefore(range.end, position)) {
                if (section.sectionHeader.ast === null) {
                    currentSection = null
                } else {
                    currentSection = section.sectionHeader.ast.parts.map((v) => v.text).join(".")
                }
            }
            for (const assignment of section.variableAssignments) {
                if (assignment.ast === null) { continue }
                const { value } = assignment.ast
                if (value === null) { continue }
                if (containsPosition(toLSPRange(value.location), position)) {  // if the cursor is on a value
                    if (section.sectionHeader.ast?.parts[0].text === "color") { // color.*.*
                        const items: lsp.CompletionItem[] = [{ label: "normal", kind: lsp.CompletionItemKind.Color }]
                        for (const label of ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"].flatMap((v) => [v, `bright${v}`])) {
                            items.push({ label, kind: lsp.CompletionItemKind.Color })
                        }
                        for (const label of ["bold", "dim", "ul", "blink", "reverse", "italic", "strike"].flatMap((v) => [v, `no${v}`, `no-${v}`])) {
                            items.push({ label, kind: lsp.CompletionItemKind.Keyword })
                        }
                        return items
                    }
                    return []
                }
            }
        }
    }

    // the cursor is neither in a section header nor on a value
    return Object.entries(docs).flatMap(([k, v]) => {
        if (!v.autocomplete) { return [] }
        if (uri.endsWith(".lfsconfig") && !k.startsWith("lfs.") && !k.endsWith(".lfsurl")) { return [] }  // https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.5.ronn#lfsconfig

        const item: lsp.CompletionItem = { label: k, kind: lsp.CompletionItemKind.Property }
        const parts = k.split(".")

        let i = 1
        let sectionHeader = ""
        if (currentSection === null || !matchVariable(k.split(".").slice(0, -1).join("."), currentSection)) {
            item.additionalTextEdits = [
                {
                    newText: "",
                    range: {
                        start: { line: position.line, character: 0 },
                        end: position,
                    }
                }
            ]
            if (parts.length >= 3) {
                sectionHeader += `[${parts[0]} "${parts.slice(1, -1).join(".").replaceAll("\\", "\\\\").replaceAll(`"`, `\\"`)}"]\n\t`
            } else {
                sectionHeader += `[${parts[0]}]\n\t`
            }
            sectionHeader = sectionHeader.replace(/<([^>]+)>/g, (_, m) => `\${${i++}:${m}}`)
        }

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

const getGitRepositoryUri = (uri: string) => {
    const parent = vscodeUri.Utils.dirname(vscodeUri.URI.parse(uri))
    if (vscodeUri.Utils.basename(parent) === ".git") {
        return parent
    } else {
        return vscodeUri.Utils.joinPath(parent, ".git")
    }
}

conn.onDefinition(({ textDocument: { uri }, position }): lsp.DefinitionLink[] | undefined => {
    const textDocument = documents.get(uri)
    if (textDocument === undefined || !isGitConfigFile(textDocument)) { return }
    const f = parser.gitConfigParser.parse(textDocument.getText())
    if (f === null) { return }

    const link = (originSelectionRange: lsp.Range, targetUri: string): lsp.DefinitionLink[] => {
        const targetRange: lsp.Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
        return [{ originSelectionRange, targetUri, targetRange, targetSelectionRange: targetRange }]
    }

    for (const section of f.sections) {
        for (const assignment of section.variableAssignments) {
            if (assignment.ast === null) { continue }
            const { value } = assignment.ast
            if (value === null) { continue }
            const range = toLSPRange(value.location)
            if (!containsPosition(range, position)) { continue }

            // refspec
            const v = setOffset(parser.refspecParser.parse(value.text), value.location.start)
            if (v !== null) { // +refs/heads/*:refs/remotes/origin/*
                const dstRange = toLSPRange(v.dst.location)
                const srcRange = toLSPRange(v.src.location)
                if (containsPosition(dstRange, position)) {
                    return link(dstRange, vscodeUri.Utils.joinPath(getGitRepositoryUri(uri), v.dst.text).toString())
                } else if (containsPosition(srcRange, position)) {
                    return link(srcRange, vscodeUri.Utils.joinPath(getGitRepositoryUri(uri), v.src.text).toString())
                }
            } else if (value.text.startsWith("refs/")) {  // refs/...
                return link(range, vscodeUri.Utils.joinPath(getGitRepositoryUri(uri), value.text).toString())
            } else if (value.text.startsWith("+refs/")) { // +refs/...
                return link(range, vscodeUri.Utils.joinPath(getGitRepositoryUri(uri), value.text.slice("+".length)).toString())
            }

            // hash
            if (/^[0-9a-f]{40}$/.test(value.text)) {
                return link(range, vscodeUri.Utils.joinPath(getGitRepositoryUri(uri), "objects", value.text.slice(0, 2), value.text.slice(2)).toString())
            }
        }
    }
})

documents.listen(conn)
conn.listen()
