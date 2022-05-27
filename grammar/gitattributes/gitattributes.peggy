File =
  _s
  @(
    head:Line
    tail:(newline @Line [ \t]*)*
    [\n\r \t]*
    { return [head, ...tail].filter((line) => line !== null) }
  )?

Line =
  data:(
      MacroDefinition
    / @PatternAndAttrs
    / "#" $[^\r\n]*
      { return { type: "comment", comment: { text: text(), location: location() } } }
  )
  [ \t]*
  { return { ...data, location: location() } }

MacroDefinition =
  header:("[attr]"  { return { text: text(), location: location() } })
  space*
  name:($[^ \t\r\n]+ { return { text: text(), location: location() } })
  space+
  body:($[^\r\n]+ { return { text: text(), location: location() } })
  { return { type: "macro", header, name, body } }

PatternAndAttrs =
  pattern: (
      '"'
      str:$(
          "\\" escaped:. { return escaped }
        / [^"\\\r\n]
      )*
      '"'
      { return { text: str, location: location() } }
    / $[^ \t#\r\n]+
      { return { text: text(), location: location() } }
  )
  attrs:(
    space+
    operator:((
        "-"  // unset
      / "!"  // unspecified
    ) { return { text: text(), location: location() } })?
    key:(
      $[^ \t\r\n=]+
      { return { text: text(), location: location() } }
    )
    value:(
      "="
      @(
        $[^ \t\r\n]*
        { return { text: text(), location: location() } }
      )
    )?
    { return { operator, key, value } }
  )*
  { return { type: "pattern", pattern, attrs } }

space = [ \t]
_s "whitespace" = [\r\n \t]*
newline = [\r \t]* "\n" [\n\r \t]*
