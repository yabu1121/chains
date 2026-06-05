package friend

import "github.com/google/uuid"

// Edge is one accepted friendship as an undirected pair of user IDs. The column
// tags let GORM scan `requester_id AS source, addressee_id AS target` straight
// into this shape (see Repository.AcceptedEdges).
type Edge struct {
	Source uuid.UUID `gorm:"column:source"`
	Target uuid.UUID `gorm:"column:target"`
}

// BridgeInfo describes a newly-accepted friendship that united two previously
// separate clusters of the friendship graph — the moment one person "chains"
// two worlds together. YourSide/TheirSide are the sizes of the two components
// the new edge joined; each count includes its own endpoint, so the smallest
// possible bridge (a brand-new user's first friend) is {1, n}.
type BridgeInfo struct {
	YourSide  int `json:"your_side"`
	TheirSide int `json:"their_side"`
}

// detectBridge reports whether adding the edge (u, v) to the accepted-friendship
// graph in `edges` would join two previously-separate connected components — i.e.
// whether (u, v) is a *bridge*.
//
// The key equivalence: a new edge is a bridge exactly when its endpoints were in
// different components beforehand (removing it would split them apart again). If
// they were already reachable from each other, the new edge merely closes a
// cycle and is not a bridge.
//
// `edges` must NOT already contain (u, v) — callers pass a snapshot of the graph
// taken before the friendship is accepted. Returns nil for the cycle case, and a
// populated BridgeInfo (with both component sizes) for the bridge case.
func detectBridge(edges []Edge, u, v uuid.UUID) *BridgeInfo {
	// Build an undirected adjacency list. Each edge contributes both directions.
	adj := make(map[uuid.UUID][]uuid.UUID, len(edges)*2)
	for _, e := range edges {
		adj[e.Source] = append(adj[e.Source], e.Target)
		adj[e.Target] = append(adj[e.Target], e.Source)
	}

	// from returns every node reachable from start (start included), via BFS.
	from := func(start uuid.UUID) map[uuid.UUID]struct{} {
		seen := map[uuid.UUID]struct{}{start: {}}
		queue := []uuid.UUID{start}
		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			for _, next := range adj[cur] {
				if _, ok := seen[next]; ok {
					continue
				}
				seen[next] = struct{}{}
				queue = append(queue, next)
			}
		}
		return seen
	}

	uSide := from(u)
	if _, connected := uSide[v]; connected {
		return nil // u and v already share a component → cycle, not a bridge
	}
	// Different components, so from(u) and from(v) are disjoint by definition —
	// no node is double-counted across the two sizes.
	return &BridgeInfo{YourSide: len(uSide), TheirSide: len(from(v))}
}
