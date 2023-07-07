Main = Section|1.., "\n"|

// * `foo.bar`
// 
//   help
Section
  = header:Header
    help:Paragraph|1.., "\n"| "\n"
  { return { header, help: help.join("\n\n") } }

Paragraph
  = p:("\n  " @$[^\n]+)+
  { return p.join("") }

// * `key1` / `key2`
//   `key3`
Header = "* " @Key|1.., (" / " / ", " / "\n  ")| "\n"

// `foo.bar`, `FOO_BAR` or FOO_BAR
Key
  = "`" @$[a-zA-Z0-9.-<>_]+ "`"
  / $[A-Z0-9_]+
