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
}

export type Ident = {
    text: string
    range: {
        start: 9
        end: 14
    }
}

export type File = {
    sectionHeader: [Ident, ...Ident[]]
    variableAssignments: [Ident, Ident][]
}[]

export const sectionHeaderParser = new Parser<[Ident, ...Ident[]]>("SectionHeader")
export const variableAssignmentParser = new Parser<[Ident, Ident]>("VariableAssignment")
export const gitConfigParser = new Parser<File>("File")
