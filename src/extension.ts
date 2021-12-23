import vscode from "vscode"
import * as parser from "./parser"
import docs from "../git/Documentation/config.json"
import path from "path"

const toVSCodePosition = (range: { readonly line: number, readonly column: number }) => {
    return new vscode.Position(range.line - 1, range.column - 1)
}
const toVSCodeRange = (range: { start: { readonly line: number, readonly column: number }, end: { readonly line: number, readonly column: number } }) => {
    return new vscode.Range(toVSCodePosition(range.start), toVSCodePosition(range.end))
}

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

const isGitConfigFile = (document: vscode.TextDocument) => {
    return document.uri.fsPath.endsWith(`.git${path.sep}config`) || document.languageId === "gitconfig"
}

export const activate = async (context: vscode.ExtensionContext) => {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("gitconfig")
    const hoverProvider: vscode.HoverProvider = {
        provideHover(document, position) {
            if (!isGitConfigFile(document)) { return }
            try {
                const f = parser.gitConfigParser.parse(document.getText())
                if (f === null) { return }
                for (const section of f) {
                    if (section.sectionHeader.ast === null) { continue }
                    {
                        const range = toVSCodeRange(section.sectionHeader.location)
                        if (range.contains(position)) {
                            const sectionName = section.sectionHeader.ast.parts.map((v) => v.text).join(".")
                            const documentation = Object.entries(docs).find((v) => v[0].endsWith(".*") && matchVariable(v[0].slice(0, -".*".length), sectionName))?.[1].documentation
                            return new vscode.Hover(documentation ? new vscode.MarkdownString().appendText(sectionName).appendMarkdown(`\n\n---\n`).appendMarkdown(documentation) : new vscode.MarkdownString().appendText(sectionName), range)
                        }
                    }
                    for (const assignment of section.variableAssignments) {
                        if (assignment.ast === null) { continue }
                        const [name, value] = assignment.ast
                        const range = toVSCodeRange(name.location)
                        if (range.contains(position)) {
                            const key = section.sectionHeader.ast.parts.map((v) => v.text).join(".") + "." + name.text
                            const documentation = getDocument(key)?.documentation
                            return new vscode.Hover(documentation ? new vscode.MarkdownString().appendText(key).appendMarkdown(`\n\n---\n`).appendMarkdown(documentation) : new vscode.MarkdownString().appendText(key), range)
                        }
                    }
                }
            } catch (err) {
                console.error(err)
            }
        }
    }
    const completionItemProvider: vscode.CompletionItemProvider = {
        provideCompletionItems(document, position) {
            if (!isGitConfigFile(document)) { return }
            try {
                const f = parser.gitConfigParser.parse(document.getText())
                let currentSection: string | null = null
                if (f !== null) {
                    for (const section of f) {
                        const range = toVSCodeRange(section.sectionHeader.location)
                        if (range.contains(position)) {
                            return [] // the cursor is in a section header
                        }
                        if (range.end.isBefore(position)) {
                            currentSection =
                                section.sectionHeader.ast === null ? null :
                                    section.sectionHeader.ast.parts.map((v) => v.text).join(".")
                        }
                    }
                }

                return Object.entries(docs).flatMap(([k, v]) => {
                    if (!v.autocomplete) { return [] }

                    const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Property)
                    const parts = k.split(".")

                    let i = 1
                    const sectionHeader = (currentSection === parts.slice(0, -1).join(".") ? "" : `[${parts[0]}${parts.length >= 3 ? ` "${parts.slice(1, -1).join(".").replaceAll("\\", "\\\\").replaceAll(`"`, `\\"`)}"` : ""}]\n`)
                        .replace(/<([^>]+)>/g, (_, m) => `\${${i++}:${m}}`)

                    let variable = parts[parts.length - 1]
                    if (variable === "*") {
                        variable = `\${${i++}:name}`
                    }

                    item.insertText = new vscode.SnippetString(`${sectionHeader}\t${variable} = $${i}`)
                    if (v.deprecated) {
                        item.tags = [vscode.CompletionItemTag.Deprecated]
                    }

                    item.documentation = new vscode.MarkdownString(v.documentation)
                    return [item]
                })
            } catch (err) {
                console.error(err)
                throw err
            }
        }
    }
    const legend = new vscode.SemanticTokensLegend(["gitconfigSection", "number", "gitconfigProperty", "gitconfigBool", "gitconfigColor", "string"])
    const documentSemanticTokensProvider: vscode.DocumentSemanticTokensProvider = {
        provideDocumentSemanticTokens(document) {
            if (!isGitConfigFile(document)) { diagnosticCollection.delete(document.uri); return }
            const edit = new vscode.SemanticTokensBuilder(legend)
            const f = parser.gitConfigParser.parse(document.getText())
            if (f !== null) {
                for (const section of f) {
                    if (section.sectionHeader.ast !== null) {
                        const subsectionLocation = section.sectionHeader.ast.subsectionLocation !== null ? toVSCodeRange(section.sectionHeader.ast.subsectionLocation) : null
                        if (subsectionLocation !== null) {
                            edit.push(subsectionLocation, "string")
                        }
                        for (const v of section.sectionHeader.ast.parts) {
                            const range = toVSCodeRange(v.location)
                            if (subsectionLocation !== null && subsectionLocation.contains(range)) { continue }
                            edit.push(range, "gitconfigSection")
                        }
                    }
                    for (const assignment of section.variableAssignments) {
                        if (assignment.ast === null) { continue }
                        const [name, value] = assignment.ast
                        edit.push(toVSCodeRange(name.location), "gitconfigProperty")
                        if (value !== null) {
                            // https://git-scm.com/docs/git-config#_values
                            switch (parser.valueParser.parse(value.text)) {
                                case "true": case "false": edit.push(toVSCodeRange(value.location), "gitconfigBool"); break
                                case "color": edit.push(toVSCodeRange(value.location), "gitconfigColor"); break
                                case "integer": edit.push(toVSCodeRange(value.location), "number"); break
                                default: edit.push(toVSCodeRange(value.location), "string"); break
                            }
                        }
                    }
                }
            }
            return edit.build()
        }
    }

    const check = (document: vscode.TextDocument) => {
        if (!isGitConfigFile(document)) { diagnosticCollection.delete(document.uri); return }
        diagnosticCollection.set(document.uri, parser.gitConfigParser.check(document.getText()).map((err) => new vscode.Diagnostic(toVSCodeRange(err.location), err.message, vscode.DiagnosticSeverity.Error)))
    }
    context.subscriptions.push(
        diagnosticCollection,
        vscode.workspace.onDidOpenTextDocument((document) => { check(document) }),
        vscode.workspace.onDidChangeTextDocument(({ document }) => { check(document) }),
        vscode.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri)
        }),
        vscode.languages.registerDocumentSemanticTokensProvider({ language: "properties" }, documentSemanticTokensProvider, legend),
        vscode.languages.registerDocumentSemanticTokensProvider({ language: "gitconfig" }, documentSemanticTokensProvider, legend),
        vscode.languages.registerHoverProvider({ language: "properties" }, hoverProvider),
        vscode.languages.registerHoverProvider({ language: "gitconfig" }, hoverProvider),
        vscode.languages.registerCompletionItemProvider({ language: "properties" }, completionItemProvider, "["),
        vscode.languages.registerCompletionItemProvider({ language: "gitconfig" }, completionItemProvider, "["),
    )
}
