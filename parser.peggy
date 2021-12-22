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
      (
        '"'
        head:SubsectionIdent 
        tail:("." SubsectionIdent)* 
        '"'
        { return [head, ...tail.map((v) => v[1])] }
      )
    )?
    _
    "]"
    _t
    LineComment?
  { return [...section, ...(subsection ? subsection[1] : [])] }

// foo
SectionIdent "identifier"
  = ident:$[a-zA-Z0-9\-]+
  { return { text: text().toLowerCase(), range: range() } } // case-insensitive

// "foo"
SubsectionIdent
  = str:("\\" escaped:. { return escaped } / [^".\\])*
  { return { text: str.join(""), range: range() } }  // case-sensitive

// ==== Variable Assignment ====
// foo = bar
VariableAssignment
  = _t
    name:(
      ident:$[a-zA-Z0-9][a-zA-Z0-9\-]*
      { return { text: text().toLowerCase(), range: range() } } // case-insensitive
    )
    _t
    "="
    _t
    value:(
      value:("\\\n" { return "" } / [^\n] { return text() } )*
      { return { text: value.join("").trim(), range: range() } }
    )
    LineComment?
  { return [name, value] }

// ==== Common ====
_ "whitespace"
  = [ ]*

_t "whitespace"
  = [ \t]*

LineComment
  = [;#][^\n\r]+
