// https://git-scm.com/book/en/v2/Git-Internals-The-Refspec

// +refs/heads/*:refs/remotes/origin/*
Main = src:Src ":" dst:Dst { return { src, dst } }

Src =
  plus:"+"? 
  t:("refs/heads/" @$[^:]+
        / "heads/" @$[^:]+
                 / @$[^:]+)
  { return { plus, text: "refs/heads/" + t, location: location() } }

Dst =
  t:("refs/remotes/" @$[^:]+
        / "remotes/" @$[^:]+
                 / @$[^:]+)
  { return { text: "refs/remotes/" + t, location: location() } }
