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

export const sectionHeaderParser = new Parser<{
    parts: [Token, ...Token[]]
    location: PeggyLocation
    subsectionLocation: PeggyLocation | null
}>("config.peggy", "SectionHeader")
export const variableAssignmentParser = new Parser<{
    name: Token
    value: Token | null
}>("config.peggy", "VariableAssignment")
export const looseGitConfigParser = new Parser<{
    headerComments: Token[]
    sections: {
        sectionHeader: { location: PeggyLocation }
        comments: Token[]
        variableAssignments: {
            assignment: { location: PeggyLocation }
            comments: Token[]
        }[]
    }[]
}>("config.peggy", "LooseGitConfig")

export const setOffset = <T>(x: T, start: { offset: number, line: number, column: number }): T => {
    if (Array.isArray(x)) {
        x.forEach((v) => setOffset(v, start))
    } else if (typeof x === "object" && x !== null) {
        if ("offset" in x && "line" in x && "column" in x) {
            const obj = x as any as { offset: number, line: number, column: number }
            obj.offset += start.offset - 1
            if (obj.line === 1) {
                obj.column += start.column - 1
            }
            obj.line += start.line - 1
        }
        Object.values(x).forEach((v) => setOffset(v, start))
    }
    return x
}

export const gitConfigParser = {
    parse: (input: string) => {
        const f = looseGitConfigParser.parse(input)
        if (f === null) { return null }
        return {
            headerComments: f.headerComments,
            sections: f.sections.map(({ sectionHeader: { location }, comments, variableAssignments }) => ({
                sectionHeader: {
                    location,
                    ast: setOffset(sectionHeaderParser.parse(input.slice(location.start.offset, location.end.offset)), location.start),
                },
                comments,
                variableAssignments: variableAssignments.map(({ assignment: { location }, comments }) => ({
                    location,
                    ast: setOffset(variableAssignmentParser.parse(input.slice(location.start.offset, location.end.offset)), location.start),
                    comments,
                })),
            }))
        }
    },
    check: (input: string) => {
        const f = looseGitConfigParser.parseOrError(input)
        if ("err" in f) { return [f.err] }
        return f.ok.sections.flatMap(({ sectionHeader: { location: { start, end } }, variableAssignments }) => [
            setOffset(sectionHeaderParser.check(input.slice(start.offset, end.offset)), start),
            ...variableAssignments.map(({ assignment: { location: { start, end } } }) => setOffset(variableAssignmentParser.check(input.slice(start.offset, end.offset)), start)),
        ]).filter((v) => v !== null) as peggy.parser.SyntaxError[]
    },
} as const

export const valueParser = new Parser<"true" | "false" | "integer" | "color">("value.peggy", undefined)
export const gitLFSParser = new Parser<{ header: string[], help: string }[]>("git-lfs.peggy", undefined)
export const refspecParser = new Parser<{ src: Token & { plus: "+" | null }, dst: Token }>("refspec.peggy", undefined)
export type ConfigType = "bool" | "int" | "uint" | "pathname" | "string"
export const gitSourceParser = new Parser<{ name: string, type: ConfigType }>("git-source.peggy", undefined)
