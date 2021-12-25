Main
  = &IfNoBlock @IfNoBlock
  / IfBlock

IfNoBlock =
    _ name:IfBegin "\n" _
    "return" _ "git_config_string(&" Ident ", var, value);"
    .*
    { return { name, type: "string" } }

IfBlock =
    _ name:IfBegin " {\n" _
    l1:LValue _ "=" _ "git_config_" type:("bool" / "int" / "pathname") "(var, value);\n" _
    unsigned:("if (" l2:LValue &{ return l1 == l2 } " < 0)\n" _ "return -1;\n" _)?
    "return 0;\n" _
    "}"
    .*
    {
        if (unsigned !== null) {
            if (type !== "int") { throw new Error("unsigned but not int") }
            return { name, type: "uint" }
        }
        return { name, type }
    }

IfBegin
  = "if (strcmp(var, \"" @$[^"]+ "\") == 0)"
  / "if (!strcmp(var, \"" @$[^"]+ "\"))"

LValue = head:Ident tail:("->" Ident)* { return [head, ...tail.map((v) => v[1])].join("") }
Ident = $[a-zA-Z0-9_]+
_ = $[ \t]*
