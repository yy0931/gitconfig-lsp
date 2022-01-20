import path from 'path'
import vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

export const activate = (context: vscode.ExtensionContext) => {
    const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'))
    context.subscriptions.push(new LanguageClient(
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
    ).start())
}

export const deactivate = () => { }
