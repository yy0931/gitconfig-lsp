import fs from "fs"
import fetch from "node-fetch"
import jsdom from "jsdom"
import assert from "assert"
import TurndownService from "turndown"
import path from "path"

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

export type Documentations = Record<string, { deprecated: boolean, documentation: string, autocomplete: boolean }>
const parseDl = (dl: HTMLElement) => {
    const result: Documentations = {}

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

(async () => {
    const dom = new jsdom.JSDOM(await fetch("https://git-scm.com/docs/git-config").then((res) => res.text()))
    let result: Documentations = {}
    for (const dl of querySelector(dom.window.document.body, "#_variables")!.parentElement!.querySelectorAll<HTMLDivElement>(":scope > div.dlist > dl")) {
        result = { ...result, ...parseDl(dl) }
    }
    fs.writeFileSync(path.join(__dirname, "../git/Documentation/config.json"), JSON.stringify(result, null, "    "))
})().catch(console.error)
