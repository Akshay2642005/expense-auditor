package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// TTLs
const (
	TTLClaimList    = 2 * time.Minute
	TTLClaim        = 5 * time.Minute
	TTLAudit        = 10 * time.Minute
	TTLPolicyActive = 10 * time.Minute
	TTLPolicyList   = 5 * time.Minute
	TTLPolicy       = 5 * time.Minute
)

// Key builders — all keys namespaced under "epau:"
func KeyClaimList(userID string) string   { return fmt.Sprintf("epau:claims:user:%s", userID) }
func KeyClaim(claimID string) string      { return fmt.Sprintf("epau:claim:%s", claimID) }
func KeyAudit(claimID string) string      { return fmt.Sprintf("epau:audit:claim:%s", claimID) }
func KeyPolicyActive(orgID string) string { return fmt.Sprintf("epau:policy:active:%s", orgID) }
func KeyPolicyList(orgID string) string   { return fmt.Sprintf("epau:policy:list:%s", orgID) }
func KeyPolicy(policyID string) string    { return fmt.Sprintf("epau:policy:%s", policyID) }

// Client wraps redis.Client with typed JSON helpers.
type Client struct {
	rdb *redis.Client
}

func New(rdb *redis.Client) *Client {
	return &Client{rdb: rdb}
}

// Get deserialises a cached value into T. Returns (nil, false, nil) on cache miss.
func Get[T any](ctx context.Context, c *Client, key string) (*T, bool, error) {
	raw, err := c.rdb.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, false, nil // cache miss
	}
	if err != nil {
		return nil, false, fmt.Errorf("cache get %q: %w", key, err)
	}
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		// Corrupt entry — treat as miss, let caller repopulate
		_ = c.rdb.Del(ctx, key) // evict corrupt entry
		return nil, false, nil
	}
	return &v, true, nil // cache hit
}

// Set serialises v and stores it with the given TTL.
func Set[T any](ctx context.Context, c *Client, key string, v T, ttl time.Duration) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("cache marshal %q: %w", key, err)
	}
	if err := c.rdb.Set(ctx, key, raw, ttl).Err(); err != nil {
		return fmt.Errorf("cache set %q: %w", key, err)
	}
	return nil
}

// Del removes one or more exact keys atomically.
func Del(ctx context.Context, c *Client, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	if err := c.rdb.Del(ctx, keys...).Err(); err != nil {
		return fmt.Errorf("cache del: %w", err)
	}
	return nil
}

// InvalidatePattern deletes all keys matching a glob pattern via SCAN + DEL batches.
// Prefer exact-key Del where possible; use this only for collection invalidation.
func InvalidatePattern(ctx context.Context, c *Client, pattern string) error {
	var cursor uint64
	for {
		keys, next, err := c.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return fmt.Errorf("cache scan %q: %w", pattern, err)
		}
		if len(keys) > 0 {
			if err := c.rdb.Del(ctx, keys...).Err(); err != nil {
				return fmt.Errorf("cache del pattern %q: %w", pattern, err)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}
