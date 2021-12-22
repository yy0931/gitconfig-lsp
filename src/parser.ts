import peggy from "peggy"
import fs from "fs"
import path from "path"

class Parser<T> {
    private readonly parser: peggy.Parser
    constructor(filename: string, startRule: string | undefined) {
        this.parser = peggy.generate(fs.readFileSync(path.join(__dirname, "../", filename)).toString(), startRule === undefined ? {} : { allowedStartRules: [startRule] })
    }
    parse(input: string): T | null {
        try {
            return this.parser.parse(input)
        } catch (err) {
            if (err instanceof (this.parser.SyntaxError as any as typeof peggy.parser.SyntaxError)) {
                return null
            }
            throw err
        }
    }
    check(input: string): peggy.parser.SyntaxError | null {
        try {
            this.parser.parse(input)
            return null
        } catch (err) {
            if (err instanceof (this.parser.SyntaxError as any as typeof peggy.parser.SyntaxError)) {
                return err
            }
            throw err
        }
    }
}

type PeggyLocation = {
    start: { offset: number, line: number, column: number }
    end: { offset: number, line: number, column: number }
}
export type Ident = {
    text: string
    location: PeggyLocation
}

type SectionHeader = { parts: [Ident, ...Ident[]], location: PeggyLocation, subsectionLocation: PeggyLocation | null }
type VariableAssignment = [Ident, Ident | null]
export type File = {
    sectionHeader: SectionHeader
    variableAssignments: VariableAssignment[]
}[]

export const sectionHeaderParser = new Parser<SectionHeader>("syntax-config.peggy", "SectionHeader")
export const variableAssignmentParser = new Parser<VariableAssignment>("syntax-config.peggy", "VariableAssignment")
export const gitConfigParser = new Parser<File>("syntax-config.peggy", "File")

export const valueParser = new Parser<"true" | "false" | "integer" | "color">("syntax-value.peggy", undefined)
