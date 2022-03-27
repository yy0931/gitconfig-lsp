import fs from "fs"
import fetch from "node-fetch"
import jsdom from "jsdom"
import assert from "assert"
import TurndownService from "turndown"
import path from "path"
import * as parser from "./src/parser"

const turndown = new TurndownService({ headingStyle: "setext" })
const htmlToMarkdown = (html: string) => {
    return turndown.turndown(html).replace(/\(\/docs\/([\w\-]+)\)/g, "(https://git-scm.com/docs/$1)")
}

const querySelector = (el: Element, query: string) => {
    const x = el.querySelector(query)
    if (x === null) {
        throw new Error(`Parse error: query = ${query}\n${el.innerHTML}`)
    }
    return x
}

export type Documentation = Record<string, { deprecated: boolean, documentation: string, autocomplete: boolean }>

const generateGitDocumentation = async () => {
    const parseDl = (dl: HTMLElement) => {
        const result: Documentation = {}

        const set = (key: string, documentation: string) => {
            if (key.endsWith(" (deprecated)")) {
                result[key.slice(0, -" (deprecated)".length)] = { deprecated: true, documentation: "(deprecated) " + documentation, autocomplete: true }
            } else {
                result[key] = { deprecated: false, documentation, autocomplete: true }
            }
        }

        const children = dl.children as HTMLCollectionOf<HTMLElement>
        for (let i = 0; i < children.length;) {
            assert(children[i].tagName === "DT")
            const header = children[i].textContent!.trim()
            i++
            if (i >= children.length || children[i].tagName === "DT") { // <dt>foo.bar</dt>
                set(header, "")
            } else if (children[i]!.tagName === "DD") {
                if (header.endsWith(".*") && children[i].querySelector("div.dlist") !== null) { // <dt>foo.bar</dt><dd><p>help</p><div><div><div class="dlist"><dl>...children</dl></div></div></div></dd>
                    result[header] = { deprecated: false, documentation: [...children[i]!.querySelectorAll(":scope > p")].map((v) => htmlToMarkdown(v.innerHTML)).join("\n"), autocomplete: false }
                    for (const [k, v] of Object.entries(parseDl(querySelector(children[i]!, ":scope > div > div > div.dlist > dl") as HTMLElement))) {
                        result[header.replace("*", k)] = v
                    }
                } else { // <dt>foo.bar</dt><dd>help</dd>
                    set(header, htmlToMarkdown(children[i].innerHTML))
                }
                i++
            } else {
                throw new Error("parse error")
            }
        }
        return result
    }

    {
        const dom = new jsdom.JSDOM(await fetch("https://git-scm.com/docs/git-config").then((res) => res.text()))
        let result: Documentation = {}
        for (const dl of querySelector(dom.window.document.body, "#_variables")!.parentElement!.querySelectorAll<HTMLDivElement>(":scope > div.dlist > dl")) {
            result = { ...result, ...parseDl(dl) }
        }
        result["include.path"] = result["includeIf.<condition>.path"] = { autocomplete: true, deprecated: false, documentation: dom.window.document.querySelector("#_includes")!.parentElement!.textContent!.trim() }

        fs.writeFileSync(path.join(__dirname, "git/Documentation/config.json"), JSON.stringify(result, null, "    "))
    }
}

const generateGitLFSDocumentation = async () => {
    const markdown = await fetch("https://raw.githubusercontent.com/git-lfs/git-lfs/main/docs/man/git-lfs-config.5.ronn").then((res) => res.text())
    const result: Documentation = {}

    let buf = null
    for (const line of markdown.split("\n")) {
        if (!line.startsWith("  ") && line.trim() !== "") {
            if (buf !== null) {
                for (const { header, help } of parser.gitLFSParser.mustParse(buf.trimEnd() + "\n")) {
                    for (const key of header) {
                        if (/^[A-Z_]+$/.test(key)) { // environment variables
                            continue
                        }
                        result[key] = { documentation: help, autocomplete: true, deprecated: false }
                    }
                }
                buf = null
            }
            if (line.startsWith("* `")) {
                buf = line + "\n"
            }
        } else {
            if (buf !== null) {
                buf += line + "\n"
            }
        }
    }
    fs.writeFileSync(path.join(__dirname, "git-lfs/docs/man/git-lfs-config.5.conn.json"), JSON.stringify(result, null, "    "))
}

generateGitDocumentation().catch(console.error)
generateGitLFSDocumentation().catch(console.error)
