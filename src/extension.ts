import vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

export const activate = (context: vscode.ExtensionContext) => {
    {
        const serverModule = context.asAbsolutePath('dist/gitconfig/server.js')
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
    {
        const serverModule = context.asAbsolutePath('dist/gitattributes/server.js')
        context.subscriptions.push(new LanguageClient(
            'gitattributes',
            'gitattributes',
            {
                run: { module: serverModule, transport: TransportKind.ipc },
                debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6010'] } }
            },
            {
                documentSelector: [
                    { language: "properties" },
                    { language: "gitattributes" }
                ],
            },
        ).start())
    }
}

export const deactivate = () => { }
