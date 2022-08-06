import peggy from "peggy"
import fs from "fs"
import path from "path"

export class Parser<T> {
    private readonly parser: peggy.Parser
    constructor(filename: string, startRule: string | undefined) {
        this.parser = peggy.generate(fs.readFileSync(path.join(__dirname, "../grammar", filename)).toString(), startRule === undefined ? {} : { allowedStartRules: [startRule] })
    }
    mustParse(input: string): T {
        return this.parser.parse(input)
    }
    parseOrError(input: string): { ok: T } | { err: peggy.parser.SyntaxError } {
        try {
            return { ok: this.parser.parse(input) }
        } catch (err) {
            if (err instanceof (this.parser.SyntaxError as any as typeof peggy.parser.SyntaxError)) {
                return { err }
            }
            throw err
        }
    }
    parse(input: string): T | null {
        const v = this.parseOrError(input)
        return "ok" in v ? v.ok : null
    }
    check(input: string): peggy.parser.SyntaxError | null {
        const v = this.parseOrError(input)
        return "err" in v ? v.err : null
    }
}

export type PeggyLocation = {
    start: { offset: number, line: number, column: number }
    end: { offset: number, line: number, column: number }
}

export type Token = {
    text: string
    location: PeggyLocation
}

export const setOffset = <T>(x: T, start: { offset: number, line: number, column: number }): T => {
    if (Array.isArray(x)) {
        x.forEach((v) => setOffset(v, start))
    } else if (typeof x === "object" && x !== null) {
        if ("offset" in x && "line" in x && "column" in x) {
            const obj = x as any as { offset: number, line: number, column: number }
            obj.offset += start.offset
            if (obj.line === 1) {
                obj.column += start.column - 1
            }
            obj.line += start.line - 1
        }
        Object.values(x).forEach((v) => setOffset(v, start))
    }
    return x
}
