import { assert } from "chai"
import type { PeggyLocation } from "../parser-base"
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
    describe("newline characters", () => {
        test(`[a\nb]`, undefined)
        test(`[a "b\n"]`, undefined)
    })
})

describe("variableAssignmentParser", () => {
    const test = (l: string, r: [string, string | undefined] | null) => {
        it(JSON.stringify(l), () => {
            const m = parser.variableAssignmentParser.parse(l)
            assert.deepStrictEqual(m === null ? null : [m.name.text, m.value?.text], r)
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
    test(`X = "y # z"`, ["x", "y # z"])
    test(`x = "a\nb"`, null)
    test(`x = a"b`, null)
    test(`x = a "b" c`, ["x", `a b c`])
    test(`x = a \\"b\\" c`, ["x", `a "b" c`])
})

describe("looseGitConfigParser", () => {
    it("test case 1", () => {
        const x = parser.looseGitConfigParser.parse(`
# a
# b
[c] # d
e # f
# g`)
        if (x === null) {
            assert.fail()
        }

        const test = (l: { location: PeggyLocation }, start: number, end: number) => {
            assert.strictEqual(l.location.start.offset, start)
            assert.strictEqual(l.location.end.offset, end)
        }

        test(x.headerComments[0], 1, 4)
        test(x.headerComments[1], 5, 8)
        test(x.sections[0].sectionHeader, 9, 12)
        test(x.sections[0].comments[0], 13, 16)
        test(x.sections[0].variableAssignments[0].assignment, 17, 19)
        test(x.sections[0].variableAssignments[0].comments[0], 19, 22)
    })
})

describe("gitConfigParser", () => {
    const result = parser.gitConfigParser.parse(`
\t 
[a.b] c = d # comment
[e.f "g.h"]
    i = j
# comment
# comment
k = l  
    [m]
`)
    it("0.sectionHeader", () => { assert.deepStrictEqual(result!.sections[0].sectionHeader.ast?.parts.map((v) => v.text), ["a", "b"]) })
    it("0.variableAssignments", () => { assert.deepStrictEqual(result!.sections[0].variableAssignments.map((v) => [v.ast?.name?.text, v.ast?.value?.text]), [["c", "d"]]) })

    it("1.sectionHeader", () => { assert.deepStrictEqual(result!.sections[1].sectionHeader.ast?.parts.map((v) => v.text), ["e", "f", "g", "h"]) })
    it("1.variableAssignments", () => { assert.deepStrictEqual(result!.sections[1].variableAssignments.map((v) => [v.ast?.name?.text, v.ast?.value?.text]), [["i", "j"], ["k", "l"]]) })

    it("2.sectionHeader", () => { assert.deepStrictEqual(result!.sections[2].sectionHeader.ast?.parts.map((v) => v.text), ["m"]) })
    it("2.variableAssignments", () => { assert.deepStrictEqual(result!.sections[2].variableAssignments.length, 0) })
})

describe("valueParser", () => {
    const test = (l: string, r: NonNullable<ReturnType<typeof parser.valueParser.parse>>["type"] | null) => {
        it(JSON.stringify(l), () => {
            assert.strictEqual(parser.valueParser.parse(l)?.type ?? null, r)
        })
    }
    test("yes", "true")
    test("true", "true")
    test("no", "false")
    test("false", "false")
    test("10", "integer")
    test("-0x10k", "integer")

    for (const fore of ["green", "brightgreen"]) {
        test(`${fore}`, "color")
        test(`bold ${fore}`, "color")
        test(`nobold ${fore}`, "color")
        test(`no-bold ${fore}`, "color")
        test(`${fore} bold`, "color")
        test(`${fore} nobold`, "color")
        test(`${fore} no-bold`, "color")
    }
    for (const back of ["green", "brightgreen"]) {
        test(`red ${back}`, "color")
        test(`red ${back} bold`, "color")
        test(`bold red ${back}`, "color")
        test(`red ${back} bold no-bold`, "color")  // interpreted as `no-bold red ${back}`
    }
    test(`#ff0000`, "color")
    test(`#FF0000`, "color")
    test(`#ff0000 bold`, "color")
    test(`#ff0000 #00ff00 bold`, "color")

    test(`red red red`, null)

    it("location of basic colors", () => {
        const x = parser.valueParser.parse("red dim brightred")
        if (x?.type !== "color") { assert.fail() }
        assert.strictEqual(x.fore!.location.start.offset, 0)
        assert.strictEqual(x.fore!.location.end.offset, 3)
        assert.strictEqual(x.back!.location.start.offset, 8)
        assert.strictEqual(x.back!.location.end.offset, 17)
    })
    it("location of hex colors", () => {
        const x = parser.valueParser.parse("#ff0000 dim #00ff00")
        if (x?.type !== "color") { assert.fail() }
        assert.strictEqual(x.fore!.location.start.offset, 0)
        assert.strictEqual(x.fore!.location.end.offset, 7)
        assert.strictEqual(x.back!.location.start.offset, 12)
        assert.strictEqual(x.back!.location.end.offset, 19)
    })
})

describe("gitLFSParser", () => {
    const test = (l: string, r: ReturnType<typeof parser.gitLFSParser.parse>) => {
        it(JSON.stringify(l), () => {
            assert.deepStrictEqual(parser.gitLFSParser.parse(l), r)
        })
    }
    test(`\
* \`key1\`

  help 1

  help 2

* \`key2\`

  help 1
`,
        [
            { header: ["key1"], help: "help 1\n\nhelp 2" },
            { header: ["key2"], help: "help 1" },
        ],
    )
})

describe("refspecParser", () => {
    it("+refs/heads/*:refs/remotes/origin/*", () => {
        const v = parser.refspecParser.parse("+refs/heads/*:refs/remotes/origin/*")
        assert.strictEqual(v?.src.plus, "+")
        assert.strictEqual(v?.src.text, "refs/heads/*")
        assert.strictEqual(v?.dst.text, "refs/remotes/origin/*")
    })
})

describe("gitSourceParser", () => {
    it("bool", () => {
        assert.deepStrictEqual(parser.gitSourceParser.parse(`\
	if (strcmp(var, "foo.bar") == 0) {
		x = git_config_bool(var, value);
		return 0;
	}
`), { name: "foo.bar", type: "bool" })
    })
    it("int", () => {
        assert.deepStrictEqual(parser.gitSourceParser.parse(`\
		if (strcmp(var, "foo.bar") == 0) {
			x = git_config_int(var, value);
			return 0;
		}
`), { name: "foo.bar", type: "int" })
    })
    it("pathname", () => {
        assert.deepStrictEqual(parser.gitSourceParser.parse(`\
		if (strcmp(var, "foo.bar") == 0) {
			x = git_config_pathname(var, value);
			return 0;
		}
`), { name: "foo.bar", type: "pathname" })
    })
    it("string", () => {
        assert.deepStrictEqual(parser.gitSourceParser.parse(`\
        if (strcmp(var, "foo.bar") == 0)
            return git_config_string(&x, var, value);
`), { name: "foo.bar", type: "string" })
    })
    it("x->y =", () => {
        assert.deepStrictEqual(parser.gitSourceParser.parse(`\
        if (strcmp(var, "foo.bar") == 0) {
            x->y = git_config_bool(var, value);
            return 0;
        }
`), { name: "foo.bar", type: "bool" })
    })
    it("!strcmp", () => {
        assert.deepStrictEqual(parser.gitSourceParser.parse(`\
        if (!strcmp(var, "foo.bar")) {
            x = git_config_bool(var, value);
            return 0;
        }
`), { name: "foo.bar", type: "bool" })
    })
    it("uint", () => {
        assert.deepStrictEqual(parser.gitSourceParser.parse(`\
        if (strcmp(var, "foo.bar") == 0) {
            x = git_config_int(var, value);
            if (x < 0)
                return -1;
            return 0;
        }
`), { name: "foo.bar", type: "uint" })
    })
})
