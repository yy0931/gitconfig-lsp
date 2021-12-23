// ==== File ====
LooseGitConfig =
  sections:(
    _s LooseSectionHeader
    (_s LooseVariableAssignment)*
  )*
  _s
  { return sections.map((v) => ({ sectionHeader: v[1], variableAssignments: v[2].map((v) => v[1])})) }

_s "whitespace" = [\n \t]*

// ==== Section Header ====
// [foo.bar "foo.bar"]
// SectionHeader ⊂ LooseSectionHeader
LooseSectionHeader =
  _t
  "["
  [^"\]]*  // section
  ('"' ("\\" . / [^"\\])* '"')?  // subsection
  "]"
  _t
  LineComment?
  { return { location: location() } }

SectionHeader =
  _t
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
      head:SubsectionIdent 
      tail:("." SubsectionIdent)* 
      '"'
      { return [head, ...tail.map((v) => v[1])] }
    )
    { return { parts: strLiteral, location: location() } }
  )?
  _
  "]"
  _t
  LineComment?
  { return { parts: [...section, ...(subsection ? subsection.parts : [])], location: location(), subsectionLocation: subsection ? subsection.location : null } }

// foo
SectionIdent "identifier" =
  ident:$[a-zA-Z0-9\-]+
  { return { text: text().toLowerCase(), location: location() } } // case-insensitive

// "foo"
SubsectionIdent =
  str:("\\" escaped:. { return escaped } / [^".\\])*
  { return { text: str.join(""), location: location() } }  // case-sensitive

// ==== Variable Assignment ====
// foo = bar
// VariableAssignment ⊂ LooseVariableAssignment
LooseVariableAssignment =
  _t
  [^\[] ("\\\n" / [^\n])*
  LineComment?
  { return { location: location() } }

VariableAssignment =
  _t
  name:(
    ident:$[a-zA-Z0-9][a-zA-Z0-9\-]*
    { return { text: text().toLowerCase(), location: location() } } // case-insensitive
  )
  _t
  value:(
    "="
    _t
    value:(
      value:("\\\n" { return "" } / [^\n] { return text() })*
      { return { text: value.join("").trim(), location: location() } }
    )
    { return value }
  )?
  LineComment?
  { return [name, value] }

// ==== Common ====
_ "whitespace" = [ ]*
_t "whitespace" = [ \t]*
LineComment = [;#][^\n\r]+
