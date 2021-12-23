Main
  = head:Section tail:("\n" @Section)*
  { return [head, ...tail] }

// * `foo.bar`
// 
//   help
Section
  = header:Header
    helpHead:Paragraph helpTail:("\n" @Paragraph)* "\n"
  { return { header, help: [helpHead, ...helpTail].join("\n\n") } }

Paragraph
  = p:("\n  " @$[^\n]+)+
  { return p.join("") }

// * `key1` / `key2`
//   `key3`
Header
  = "* " head:Key tail:((" / " / ", " / "\n  ") Key)*
    "\n"
  { return [head, ...tail.map((v) => v[1])] }

// `foo.bar`, `FOO_BAR` or FOO_BAR
Key
  = "`" @$[a-zA-Z0-9.-<>_]+ "`"
  / $[A-Z0-9_]+
