import { Parser, PeggyLocation, Token } from "../parser-base"

export const GitattributesParser = new Parser<(
    (
        | {
            type: "pattern"
            pattern: Token
            attrs: { operator: Token | null, key: Token, value: Token | null }[]
        }
        | {
            type: "macro"
            header: Token
            name: Token
            body: Token
        }
        | {
            type: "comment"
            comment: Token
        }
    ) & {
        location: PeggyLocation
    }
)[]>("gitattributes/gitattributes.peggy", "File")
