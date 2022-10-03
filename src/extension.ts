import vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

export const activate = (context: vscode.ExtensionContext) => {
    {
        const serverModule = context.asAbsolutePath('dist/gitconfig/server.js')
        const client = new LanguageClient(
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
        )
        context.subscriptions.push(client)
        client.start()
    }
    {
        const serverModule = context.asAbsolutePath('dist/gitattributes/server.js')
        const client = new LanguageClient(
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
        )
        context.subscriptions.push(client)
        client.start()
    }
}

export const deactivate = () => { }
