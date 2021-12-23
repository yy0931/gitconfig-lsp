import * as path from 'path'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import { execFileSync } from "child_process"

export const activate = (context: vscode.ExtensionContext) => {
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
        vscode.window.registerCustomEditorProvider("gitconfig-lsp.git-cat-file", {
            openCustomDocument(uri) {
                return { uri, dispose: () => { } }
            },
            resolveCustomEditor(document, webviewPanel) {
                try {
                    const escapeHTML = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
                    const hash = document.uri.path.split("/").slice(-2).join("")
                    const content = escapeHTML(execFileSync("git", ["cat-file", "-p", hash], { cwd: path.dirname(document.uri.fsPath) }).toString())
                    webviewPanel.webview.options = {
                        enableScripts: true,
                        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview")],
                    }
                    const template = (options: { head: string, body: string }) => `\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>git-cat-file</title>
    ${options.head}
</head>
<body>
    ${options.body}
</body>
</html>
`
                    switch (execFileSync("git", ["cat-file", "-t", hash], { cwd: path.dirname(document.uri.fsPath) }).toString().trim()) {
                        case "commit":
                        case "tree":
                            webviewPanel.webview.html = template({
                                head: ``,
                                body: `<pre><code style="color: var(--vscode-editor-foreground);">${content.replace(/[\da-f]{40}/g, (x) => `<a href="#">${x}</a>`)}</code></pre>` +
                                    `<script>const vscode = acquireVsCodeApi(); for (const a of document.querySelectorAll("a")) { a.addEventListener("click", (e) => { e.preventDefault(); vscode.postMessage(e.currentTarget.innerText) }) }</script>`,
                            })
                            webviewPanel.webview.onDidReceiveMessage((hash: string) => {
                                vscode.commands.executeCommand("vscode.openWith", vscode.Uri.joinPath(document.uri, "../..", hash.slice(0, 2), hash.slice(2)), "gitconfig-lsp.git-cat-file");
                            })
                            break
                        default:// "blob"
                            webviewPanel.webview.html = template({
                                head: `<link href="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "webview/prism.css"))}" rel="stylesheet" />`,
                                body: `<pre><code class="language-txt">${content}</code></pre>` +
                                    `<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "webview/prism.js"))}"></script>`,
                            })
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(err + "")
                }
            },
        } as vscode.CustomReadonlyEditorProvider, { supportsMultipleEditorsPerDocument: true, webviewOptions: { enableFindWidget: true, retainContextWhenHidden: true } }),
    )
}

export const deactivate = () => { }
