import vscode from "vscode"
import * as parser from "./parser"
import docs from "../docs.json"

const toVSCodePosition = (range: { readonly line: number, readonly column: number }) => {
    return new vscode.Position(range.line - 1, range.column - 1)
}
const toVSCodeRange = (range: { start: { readonly line: number, readonly column: number }, end: { readonly line: number, readonly column: number } }) => {
    return new vscode.Range(toVSCodePosition(range.start), toVSCodePosition(range.end))
}

const getDocument = (key: string) => {
    for (const [k, v] of Object.entries(docs)) {
        if (k.toLowerCase() === key) { return v }
    }
    return null
}

export const activate = async (context: vscode.ExtensionContext) => {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("gitconfig")

    context.subscriptions.push(
        diagnosticCollection,
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (document.languageId !== "gitconfig") { diagnosticCollection.delete(document.uri); return }
            const err = parser.gitConfigParser.check(document.getText())
            diagnosticCollection.set(document.uri, err === null ? [] : [new vscode.Diagnostic(toVSCodeRange(err.location), err.message, vscode.DiagnosticSeverity.Error)])
        }),
        vscode.workspace.onDidChangeTextDocument(({ document }) => {
            if (document.languageId !== "gitconfig") { diagnosticCollection.delete(document.uri); return }
            const err = parser.gitConfigParser.check(document.getText())
            diagnosticCollection.set(document.uri, err === null ? [] : [new vscode.Diagnostic(toVSCodeRange(err.location), err.message, vscode.DiagnosticSeverity.Error)])
        }),
        vscode.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri)
        }),
        vscode.languages.registerHoverProvider({ language: "gitconfig" }, {
            provideHover(document, position) {
                try {
                    const f = parser.gitConfigParser.parse(document.getText())
                    if (f === null) { return }
                    for (const section of f) {
                        {
                            const range = new vscode.Range(
                                toVSCodePosition(section.sectionHeader[0].location.start),
                                toVSCodePosition(section.sectionHeader[section.sectionHeader.length - 1]!.location.end),
                            )
                            if (range.contains(position)) {
                                return new vscode.Hover(section.sectionHeader.map((v) => v.text).join("."), range)
                            }
                        }
                        for (const [name, value] of section.variableAssignments) {
                            const range = toVSCodeRange(name.location)
                            if (range.contains(position)) {
                                const key = section.sectionHeader.map((v) => v.text).join(".") + "." + name.text
                                return new vscode.Hover(new vscode.MarkdownString(`${key}\n\n---\n`).appendMarkdown(getDocument(key)?.documentation ?? key), range)
                            }
                        }
                    }
                } catch (err) {
                    console.error(err)
                }
            }
        }),
        vscode.languages.registerCompletionItemProvider({ language: "gitconfig" }, {
            provideCompletionItems(document, position) {
                try {
                    const f = parser.gitConfigParser.parse(document.getText())
                    let currentSection: string | null = null
                    if (f !== null) {
                        for (const section of f) {
                            const range = new vscode.Range(
                                toVSCodePosition(section.sectionHeader[0].location.start),
                                toVSCodePosition(section.sectionHeader[section.sectionHeader.length - 1]!.location.end),
                            )
                            if (range.contains(position)) {
                                return [] // the cursor is in a section header
                            }
                            if (range.end.isBefore(position)) {
                                currentSection = section.sectionHeader.map((v) => v.text).join(".")
                                console.log(currentSection)
                            }
                        }
                    }

                    return Object.entries(docs).flatMap(([k, v]) => {
                        const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Property)
                        const parts = k.split(".")
                        const variable = parts[parts.length - 1]

                        const sectionHeader = currentSection === parts.slice(0, -1).join(".") ? "" : `[${parts[0]}${parts.length >= 3 ? ` "${parts.slice(1, -1).join(".").replaceAll("\\", "\\\\").replaceAll(`"`, `\\"`)}"` : ""}]\n`
                        item.insertText = new vscode.SnippetString(`${sectionHeader}\t${variable} = $1`)
                        if (v.deprecated) {
                            item.tags = [vscode.CompletionItemTag.Deprecated]
                        }

                        item.documentation = new vscode.MarkdownString(v.documentation)  // TODO: Translate from asciidoc to markdown
                        return [item]
                    })
                } catch (err) {
                    console.error(err)
                    throw err
                }
            }
        }, "["),
    )
}
