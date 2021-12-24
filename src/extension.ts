import path from 'path'
import vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import { execFileSync } from "child_process"
import fs from "fs"
import mustache from "mustache"

const escapeHTML = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
const git = (cwd: vscode.Uri, ...args: string[]) => {
    try {
        return execFileSync("git", args, { cwd: path.dirname(cwd.fsPath) }).toString()
    } catch (err: any) {
        throw err
    }
}

const hashPattern = /(?<![\da-f])[\da-f]{40}(?![\da-f])/g

// returns file:**/.git/objects/xx/xxx...xx or file:**/.git/objects/pack/pack-.*?xxxxx..xx
const locateGitObject = (originUri: vscode.Uri, hash: string): vscode.Uri | null => {
    let gitUri = originUri
    for (let i = 0; !gitUri.path.endsWith(".git"); i++) {
        if (!gitUri.path.includes(".git") || i > 256) { return null }
        gitUri = vscode.Uri.joinPath(gitUri, "..")
    }

    const raw = vscode.Uri.joinPath(gitUri, "objects", hash.slice(0, 2), hash.slice(2))
    if (fs.existsSync(raw.fsPath)) {
        return raw
    }

    const packfileDir = vscode.Uri.joinPath(gitUri, "objects", "pack")
    for (const filename of fs.readdirSync(packfileDir.fsPath)) {
        const entry = vscode.Uri.joinPath(packfileDir, filename)
        if (git(packfileDir, "verify-pack", "-v", entry.fsPath).split("\n").some((line) => line.startsWith(hash))) {
            return entry.with({ query: hash })
        }
    }

    return null
}

const openObject = (repo: vscode.Uri, hash: string) => {
    const uri = locateGitObject(repo, hash)
    if (uri === null) { return null }
    return vscode.commands.executeCommand("vscode.openWith", uri, "gitconfig-lsp.cat-file")
}

type DocumentLink = vscode.DocumentLink | vscode.DocumentLink & { uri: vscode.Uri, hash: string }

export const activate = (context: vscode.ExtensionContext) => {
    const renderWebview = (webview: vscode.Webview, repo: vscode.Uri, view: { title: string, code: string, language: string }) => {
        const extensionUri = webview.asWebviewUri(context.extensionUri).toString()
        webview.options = webpackOptions
        webview.html = mustache.render(fs.readFileSync(vscode.Uri.joinPath(context.extensionUri, "webview/custom-editor.html").fsPath).toString(), { extensionUri, ...view })
        webview.onDidReceiveMessage((hash: string) => { openObject(repo, hash) })
    }

    const webpackOptions: vscode.WebviewOptions = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview")],
    }

    const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'))
    context.subscriptions.push(
        new LanguageClient(
            'gitconfig',
            'gitconfig',
            {
                run: { module: serverModule, transport: TransportKind.ipc },
                debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6009'] } }
            },
            {
                documentSelector: [
                    { language: "properties" },
                    { language: "gitconfig" }
                ],
            },
        ).start(),
        vscode.window.registerCustomEditorProvider("gitconfig-lsp.cat-file", {
            openCustomDocument(uri) {
                if (uri.scheme !== "file" || !fs.existsSync(uri.fsPath)) { return undefined }
                return { uri, dispose: () => { } }
            }, // **/objects/xx/xx..xx **/pack/pack-.*?xxx
            async resolveCustomEditor(document, webviewPanel) {
                try {
                    const hash = document.uri.query || document.uri.path.split("/").slice(-2).join("")
                    const content = escapeHTML(git(document.uri, "cat-file", "-p", hash))
                    switch (git(document.uri, "cat-file", "-t", hash).trim()) {
                        case "commit":
                        case "tree":
                            renderWebview(webviewPanel.webview, document.uri, { title: hash, code: content.replace(hashPattern, (x) => `<a href="#">${x}</a>`), language: "" })
                            break
                        default:// "blob"
                            renderWebview(webviewPanel.webview, document.uri, { title: hash, code: content, language: "language-txt" })
                    }
                } catch (err: any) {
                    vscode.window.showErrorMessage(err.stack)
                    throw err
                }
            },
        } as vscode.CustomReadonlyEditorProvider, { supportsMultipleEditorsPerDocument: true, webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true } }),
        vscode.window.registerCustomEditorProvider("gitconfig-lsp.ls-files--stage", {
            openCustomDocument(uri) {
                if (uri.scheme !== "file" || !fs.existsSync(uri.fsPath)) { return undefined }
                return { uri, dispose: () => { } }
            },
            async resolveCustomEditor(document, webviewPanel) {
                try {
                    renderWebview(webviewPanel.webview, document.uri, {
                        title: path.basename(document.uri.path),
                        code: git(document.uri, "ls-files", "--stage").replace(hashPattern, (x) => `<a href="#">${x}</a>`),
                        language: "",
                    })
                } catch (err: any) {
                    vscode.window.showErrorMessage(err.stack)
                    throw err
                }
            },
        } as vscode.CustomReadonlyEditorProvider, { supportsMultipleEditorsPerDocument: true, webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true } }),
        vscode.window.registerCustomEditorProvider("gitconfig-lsp.verify-pack-v", {
            openCustomDocument(uri) {
                if (uri.scheme !== "file" || !fs.existsSync(uri.fsPath)) { return undefined }
                return { uri, dispose: () => { } }
            },
            async resolveCustomEditor(document, webviewPanel) {
                try {
                    renderWebview(webviewPanel.webview, document.uri, {
                        title: path.basename(document.uri.path),
                        code: git(document.uri, "verify-pack", "-v", document.uri.fsPath).replace(hashPattern, (x) => `<a href="#">${x}</a>`),
                        language: "",
                    })
                } catch (err: any) {
                    vscode.window.showErrorMessage(err.stack)
                    throw err
                }
            },
        } as vscode.CustomReadonlyEditorProvider, { supportsMultipleEditorsPerDocument: true, webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true } }),
        vscode.languages.registerDocumentLinkProvider("git-internals", {
            provideDocumentLinks(textDocument) {
                try {
                    let uri = textDocument.uri
                    for (let i = 0; ; i++) {
                        if (!textDocument.uri.path.includes(".git") || i > 256) { return }
                        uri = vscode.Uri.joinPath(uri, "..")
                        if (uri.path.endsWith(".git")) { break }
                    }

                    const links = new Array<DocumentLink>()

                    // hash
                    const text = textDocument.getText()
                    for (const match of text.matchAll(hashPattern)) {
                        if (match.index === undefined) { continue }
                        links.push({
                            range: new vscode.Range(textDocument.positionAt(match.index), textDocument.positionAt(match.index + 40)),
                            uri,
                            hash: match[0].trim(),
                        })
                    }

                    // ref
                    for (const match of text.matchAll(/refs(\/[^ \n\t\/]+)+/g)) {
                        if (match.index === undefined) { continue }
                        links.push({
                            range: new vscode.Range(textDocument.positionAt(match.index), textDocument.positionAt(match.index + match[0].length)),
                            target: vscode.Uri.joinPath(uri, match[0].trim())
                        })
                    }

                    return links
                } catch (err: any) {
                    vscode.window.showErrorMessage(err.stack)
                    throw err
                }
            },
            resolveDocumentLink(link) {
                if ("uri" in link) {
                    const uri = locateGitObject(link.uri, link.hash)
                    if (uri === null) { return }
                    link.target = uri
                }
                return link
            }
        } as vscode.DocumentLinkProvider<DocumentLink>),
    )
}

export const deactivate = () => { }
