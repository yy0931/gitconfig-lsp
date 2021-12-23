// https://git-scm.com/docs/git-config#_values
Value = Color / True / False / Integer  // otherwise a string

True = ("yes" / "on" / "true") { return "true" }
False = ("no" / "off" / "false") { return "false" }
Integer = "-"? "0x"? d+ [kmg]? { return "integer" }  // https://github.com/git/git/blob/cd3e606211bb1cf8bc57f7d76bab98cc17a150bc/config.c#L1023-L1023 and https://en.cppreference.com/w/c/string/byte/strtoimax
Color = TextAttributes? ("normal" / ("bright" TextAttributes?)? BasicColors / "#" d d d d d d) TextAttributes?
      { return "color" }

BasicColors = "black" / "red" / "green" / "yellow" / "blue" / "magenta" / "cyan" / "white"
TextAttributes = ("no" / "no-")? ("bold" / "dim" / "ul" / "blink" / "reverse" / "italic" / "strike")

d = [0-9]
