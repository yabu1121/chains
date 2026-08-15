package friend

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDetectBridge(t *testing.T) {
	// Five named nodes so the graph shapes below are easy to read.
	a, b, c, d, e := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()

	t.Run("joins two multi-node clusters", func(t *testing.T) {
		// Cluster {a,b} and cluster {c,d,e}, no link between them yet.
		edges := []Edge{{a, b}, {c, d}, {d, e}}
		got := detectBridge(edges, b, c) // b–c would connect the two clusters
		require.NotNil(t, got)
		require.Equal(t, 2, got.YourSide)  // {a, b}
		require.Equal(t, 3, got.TheirSide) // {c, d, e}
	})

	t.Run("first friend of a brand-new user", func(t *testing.T) {
		// d has no edges yet; befriending a (who is in {a,b,c}) bridges {d} in.
		edges := []Edge{{a, b}, {b, c}}
		got := detectBridge(edges, d, a)
		require.NotNil(t, got)
		require.Equal(t, 1, got.YourSide)  // {d}
		require.Equal(t, 3, got.TheirSide) // {a, b, c}
	})

	t.Run("closing a cycle is not a bridge", func(t *testing.T) {
		// a–b–c already connected; a–c just closes the triangle.
		edges := []Edge{{a, b}, {b, c}}
		require.Nil(t, detectBridge(edges, a, c))
	})

	t.Run("empty graph: two strangers", func(t *testing.T) {
		got := detectBridge(nil, a, b)
		require.NotNil(t, got)
		require.Equal(t, 1, got.YourSide)
		require.Equal(t, 1, got.TheirSide)
	})
}
