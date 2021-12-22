import peggy from "peggy"
import fs from "fs"
import path from "path"

class Parser<T> {
    private readonly parser: peggy.Parser
    constructor(startRule: string) {
        this.parser = peggy.generate(fs.readFileSync(path.join(__dirname, "../parser.peggy")).toString(), { allowedStartRules: [startRule] })
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

export type Ident = {
    text: string
    location: {
        start: { offset: number, line: number, column: number }
        end: { offset: number, line: number, column: number }
    }
}

type SectionHeader = [Ident, ...Ident[]]
type VariableAssignment = [Ident, Ident | null]
export type File = {
    sectionHeader: SectionHeader
    variableAssignments: VariableAssignment[]
}[]

export const sectionHeaderParser = new Parser<SectionHeader>("SectionHeader")
export const variableAssignmentParser = new Parser<VariableAssignment>("VariableAssignment")
export const gitConfigParser = new Parser<File>("File")
