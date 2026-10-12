#!/bin/zsh
# PROTOTYPE: snapshot every repo's issues into snapshot.json (one-off, not the real refresh).
cd "${0:A:h}"
F=number,title,url,labels,createdAt,updatedAt,closedAt,body,comments,state,stateReason,closedByPullRequestsReferences
echo '{' > snapshot.json; first=1
grep -v '^#' ../../repos.txt | grep . | while read r; do
  o=$(gh issue list --repo $r --state all --limit 500 --json $F 2>/dev/null) || o='{"error":true}'
  [[ $first = 1 ]] || echo ',' >> snapshot.json; first=0
  printf '"%s": %s\n' $r "$o" >> snapshot.json
done
echo '}' >> snapshot.json
