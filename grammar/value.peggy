// https://git-scm.com/docs/git-config#_values
Value = TextStyle / True / False / Integer  // otherwise a string

True = ("yes" / "on" / "true") { return { type: "true" } }
False = ("no" / "off" / "false") { return { type: "false" } }
Integer = "-"? "0x"? d+ [kmg]? { return { type: "integer" } }  // https://github.com/git/git/blob/cd3e606211bb1cf8bc57f7d76bab98cc17a150bc/config.c#L1023-L1023 and https://en.cppreference.com/w/c/string/byte/strtoimax
TextStyle = (TextAttribute _)* fore:Color (_ TextAttribute)* back:(_ @Color (_ TextAttribute)*)?
      { return { type: "color", fore, back } }
Color
  = "normal"
    { return null }
  / "bright"?
    ("black" / "red" / "green" / "yellow" / "blue" / "magenta" / "cyan" / "white")
    { return { text: text(), location: location() } }
  / "#" h h h h h h
    { return { text: text(), location: location() } }
TextAttribute = ("no-" / "no")? ("bold" / "dim" / "ul" / "blink" / "reverse" / "italic" / "strike")

d = [0-9]
h = [0-9a-fA-F]
_ = [ \t]+
