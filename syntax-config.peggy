// ==== File ====
File
  = sections:(
      _s SectionHeader
      (_s VariableAssignment)*
    )*
    _s
    { return sections.map((v) => ({ sectionHeader: v[1], variableAssignments: v[2].map((v) => v[1])})) }

_s "whitespace"
  = [\n \t]*

// ==== Section Header ====
// [foo.bar "foo.bar"]
SectionHeader
  = _t
    "["
    _
    section:(
      head:SectionIdent
      tail:("." ident:SectionIdent)*
      { return [head, ...tail.map((v) => v[1])] }
    )
    subsection:(
      [ \t]+
      strLiteral:(
        '"'
        SubsectionIdent 
        ("." SubsectionIdent)* 
        '"'
      )
      { return { parts: [strLiteral[1], ...strLiteral[2].map((v) => v[1])], location: location() } }
    )?
    _
    "]"
    _t
    LineComment?
  { return { parts: [...section, ...(subsection ? subsection.parts : [])], location: location(), subsectionLocation: subsection ? subsection.location : null } }

// foo
SectionIdent "identifier"
  = ident:$[a-zA-Z0-9\-]+
  { return { text: text().toLowerCase(), location: location() } } // case-insensitive

// "foo"
SubsectionIdent
  = str:("\\" escaped:. { return escaped } / [^".\\])*
  { return { text: str.join(""), location: location() } }  // case-sensitive

// ==== Variable Assignment ====
// foo = bar
VariableAssignment
  = _t
    name:(
      ident:$[a-zA-Z0-9][a-zA-Z0-9\-]*
      { return { text: text().toLowerCase(), location: location() } } // case-insensitive
    )
    _t
    value:(
      "="
      _t
      value:(
        value:("\\\n" { return "" } / [^\n] { return text() } )*
        { return { text: value.join("").trim(), location: location() } }
      )
      { return value }
    )?
    LineComment?
  { return [name, value] }

InvalidVariableAssignment
  = ("\\\n" { return "" } / [^\n] { return text() } )*
  { return { error: "invalid", location: location() } }

// ==== Common ====
_ "whitespace"
  = [ ]*

_t "whitespace"
  = [ \t]*

LineComment
  = [;#][^\n\r]+
