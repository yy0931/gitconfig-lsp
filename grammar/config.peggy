// ==== File ====
LooseGitConfig =
  headerComments:LineComments
  sections:(
    sectionHeader:LooseSectionHeader
    comments1:LineComments
    variableAssignments:(
      assignment:LooseVariableAssignment comments2:LineComments
      { return { assignment, comments: comments2 } }
    )*
    { return { sectionHeader, comments: comments1, variableAssignments: variableAssignments } }
  )*
  { return { headerComments, sections } }

// ==== Section Header ====
// [foo.bar "foo.bar"]
// L(SectionHeader) ⊂ L(LooseSectionHeader)
LooseSectionHeader =
  _t
  "["
  [^"\]\n]*  // section
  ('"' ("\\" . / [^"\\\n])* '"')?  // subsection
  "]"
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
  { return { parts: [...section, ...(subsection ? subsection.parts : [])], location: location(), subsectionLocation: subsection ? subsection.location : null } }

// foo
SectionIdent "identifier" =
  ident:$[a-zA-Z0-9\-]+
  { return { text: text().toLowerCase(), location: location() } } // case-insensitive

// "foo"
SubsectionIdent =
  str:("\\" escaped:. { return escaped } / [^".\\\n])*
  { return { text: str.join(""), location: location() } }  // case-sensitive

// ==== Variable Assignment ====
// foo = bar
// L(VariableAssignment) ⊂ L(LooseVariableAssignment)
LooseVariableAssignment =
  _t
  [^\[]
  (
      "\\\n" { return "" }
    / [^\n";#]
    / '"' ("\\" . / [^"\\\n])* '"'
  )*
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
      value:(
          "\\\n" { return "" }
        / [^\n";#]
        / '"' @$("\\" escaped:. { return escaped } / [^"\\\n])* '"'
      )*
      { return { text: value.join("").trim(), location: location() } }
    )
    { return value }
  )?
  { return { name, value } }

// ==== Common ====
_ "whitespace" = [ ]*
_t "whitespace" = [ \t]*
_s "whitespace" = [\n \t]*

LineComment = text:$([;#][^\n\r]*)
  { return { text, location: location() } }

LineComments = _s comments:(LineComment _s (@LineComment _s)*)?
  { return comments === null ? [] : [comments[0], ...comments[2]] }
