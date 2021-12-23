import { assert } from "chai"
import * as parser from "./parser"

describe("sectionHeaderParser", () => {
    const test = (l: string, r: string[] | undefined) => {
        it(JSON.stringify(l), () => {
            assert.deepStrictEqual(parser.sectionHeaderParser.parse(l)?.parts.map((v) => v.text), r)
        })
    }

    describe("simple cases", () => {
        test(`[a]`, ["a"])
        test("[a.b.c]", ["a", "b", "c"])
        test(`[a.b.c "d.e"]`, ["a", "b", "c", "d", "e"])
        test(`[ab.cd "ef.gh"]`, ["ab", "cd", "ef", "gh"])
        test(`[foo "bar"]`, ["foo", "bar"])
    })
    describe("whitespace characters", () => {
        test(`[ foo "bar"]`, ["foo", "bar"])
        test(`[foo "bar" ]`, ["foo", "bar"])
        test(`[foo"bar"]`, undefined)
        test(`[ foo "bar"]`, ["foo", "bar"])
        test(`  [foo "bar"]  `, ["foo", "bar"])
        test(`\t[foo "bar"]\t`, ["foo", "bar"])
    })
    describe("line comments", () => {
        test(`[foo "bar"] # foo`, ["foo", "bar"])
        test(`[foo "bar"] ; foo`, ["foo", "bar"])
    })
    describe("escape sequences", () => {
        test(`[a "a\\""]`, ["a", `a"`])
        test(`[a "a\\t"]`, ["a", `at`])
        test(`[a "a\\\\"]`, ["a", `a\\`])
    })
    describe("case sensitivity", () => {
        test("[A.B]", ["a", "b"])
        test(`[A "B"]`, ["a", "B"])
    })
})

describe("variableAssignmentParser", () => {
    const test = (l: string, r: [string, string | undefined]) => {
        it(JSON.stringify(l), () => {
            assert.deepStrictEqual(parser.variableAssignmentParser.parse(l)?.map((v) => v?.text), r)
        })
    }

    test("x = y", ["x", "y"])
    test("yes", ["yes", undefined])
    test("foo = bar", ["foo", "bar"])
    test(" x = y ", ["x", "y"])
    test(" x =  y  ", ["x", "y"])
    test("\tx\t=\ty\t", ["x", "y"])
    test("x=y", ["x", "y"])
    test("X = y", ["x", "y"])
    test("X = y\\\nz", ["x", "yz"])
})

describe("gitConfigParser", () => {
    const result = parser.gitConfigParser.parse(`
\t 
[a.b] c = d
[e.f "g.h"]
    i = j
k = l  
    [m]
`)
    it("0.sectionHeader", () => { assert.deepStrictEqual(result![0].sectionHeader.ast?.parts.map((v) => v.text), ["a", "b"]) })
    it("0.variableAssignments", () => { assert.deepStrictEqual(result![0].variableAssignments.map((v) => v.ast?.map((v) => v?.text)), [["c", "d"]]) })

    it("1.sectionHeader", () => { assert.deepStrictEqual(result![1].sectionHeader.ast?.parts.map((v) => v.text), ["e", "f", "g", "h"]) })
    it("1.variableAssignments", () => { assert.deepStrictEqual(result![1].variableAssignments.map((v) => v.ast?.map((v) => v?.text)), [["i", "j"], ["k", "l"]]) })

    it("2.sectionHeader", () => { assert.deepStrictEqual(result![2].sectionHeader.ast?.parts.map((v) => v.text), ["m"]) })
    it("2.variableAssignments", () => { assert.deepStrictEqual(result![2].variableAssignments.length, 0) })
})

describe("valueParser", () => {
    const test = (l: string, r: ReturnType<typeof parser.valueParser.parse>) => {
        it(JSON.stringify(l), () => {
            assert.strictEqual(parser.valueParser.parse(l), r)
        })
    }
    test("yes", "true")
    test("true", "true")
    test("no", "false")
    test("false", "false")
    test("10", "integer")
    test("-0x10k", "integer")
    test("noboldbrightred", "color")
    test("boldbrightgreen", "color")
    test("boldgreen", "color")
    test("brightboldgreen", "color")
    test("boldgreen", "color")
})
