import type peggy from "peggy"
import { Parser, Token, PeggyLocation, setOffset } from "../parser-base"

export const sectionHeaderParser = new Parser<{
    parts: [Token, ...Token[]]
    location: PeggyLocation
    subsectionLocation: PeggyLocation | null
}>("gitconfig/config.peggy", "SectionHeader")

export const variableAssignmentParser = new Parser<{
    name: Token
    value: Token | null
}>("gitconfig/config.peggy", "VariableAssignment")

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
}>("gitconfig/config.peggy", "LooseGitConfig")

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

export const valueParser = new Parser<{ type: "true" | "false" | "integer" } | { type: "color", fore: Token | null, back: Token | null }>("gitconfig/value.peggy", undefined)
export const gitLFSParser = new Parser<{ header: string[], help: string }[]>("gitconfig/git-lfs.peggy", undefined)
export const refspecParser = new Parser<{ src: Token & { plus: "+" | null }, dst: Token }>("gitconfig/refspec.peggy", undefined)
export type ConfigType = "bool" | "int" | "uint" | "pathname" | "string"
export const gitSourceParser = new Parser<{ name: string, type: ConfigType }>("gitconfig/git-source.peggy", undefined)
