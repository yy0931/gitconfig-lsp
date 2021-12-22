const { execFileSync } = require("child_process")
const fs = require("fs")
const path = require("path")

try {
    console.log(execFileSync(path.join(__dirname, "download-docs.sh")).toString())
} catch (/** @type {any} */err) {
    console.log(`exit code: ${err.status} stdout: ${JSON.stringify(err.stderr?.toString())}, stdout: ${JSON.stringify(err.stdout?.toString())}`)
    throw err
}

/** @typedef {Record<string, { deprecated: boolean, documentation: string }>} Documentations */
/** @type {Documentations} */
const result = {}
for (const file of fs.readdirSync("git/Documentation/config")) {
    const content = fs.readFileSync(path.join("git/Documentation/config", file)).toString()
    /** @type {string | null} */
    let heading = null
    for (const line of content.split("\n")) {
        /** @type {RegExpExecArray | null} */
        let m = null

        if ((m = /^(\w[^:]*)::$/.exec(line)) !== null) {
            if (m[1].endsWith(" (deprecated)")) {
                heading = m[1].slice(0, -" (deprecated)".length)
                result[heading] = { deprecated: true, documentation: "(deprecated)" }
            } else {
                heading = m[1]
                result[heading] = { deprecated: false, documentation: "" }
            }
            continue
        }

        if (heading !== null) {
            if (result[heading].documentation !== "") {
                result[heading].documentation += " "
            }
            result[heading].documentation += line.trimStart()
        } else if (line.trim() !== "") {
            console.log(`warning: ignored floating ${JSON.stringify(line)}`)
        }
    }
}

// TODO: parse * and <param>
fs.writeFileSync("docs.json", JSON.stringify(result, null, "    "))
