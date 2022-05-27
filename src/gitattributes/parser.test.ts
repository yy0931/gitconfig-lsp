import { assert } from "chai"
import * as parser from "./parser"

describe("sectionHeaderParser", () => {
    it("pattern", () => {
        assert.deepStrictEqual(parser.GitattributesParser.parse("*.py key1 key2=value2")?.map((v) => v.type === "pattern" && v.pattern.text), ["*.py"])
    })
    it("keys", () => {
        assert.deepStrictEqual(parser.GitattributesParser.parse("*.py key1 key2=value2")?.flatMap((v) => v.type === "pattern" ? v.attrs.map((a) => a.key.text) : []), ["key1", "key2"])
    })
})
