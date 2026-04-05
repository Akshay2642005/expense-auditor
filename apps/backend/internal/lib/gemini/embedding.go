package gemini

import (
	"context"
	"fmt"

	"google.golang.org/genai"
)

const (
	embeddingModel    = "gemini-embedding-2-preview"
	maxEmbeddingBatch = 20 // Gemini API hard limit per batch request
)

var embeddingOutputDim int32 = 768

func normalizeEmbedding(values []float32) ([]float32, error) {
	expected := int(embeddingOutputDim)
	if len(values) == expected {
		return values, nil
	}
	if len(values) > expected {
		return values[:expected], nil
	}
	return nil, fmt.Errorf("gemini: embedding dims %d smaller than expected %d", len(values), expected)
}

// EmbedText returns a 768-dimensional embedding vector for a single text string.
func (c *Client) EmbedText(ctx context.Context, text string) ([]float32, error) {
	contents := []*genai.Content{
		{
			Role: "user",
			Parts: []*genai.Part{
				{Text: text},
			},
		},
	}

	resp, err := c.gc.Models.EmbedContent(ctx, embeddingModel, contents, &genai.EmbedContentConfig{
		OutputDimensionality: &embeddingOutputDim,
	})
	if err != nil {
		return nil, fmt.Errorf("gemini: embed text: %w", err)
	}
	if len(resp.Embeddings) == 0 {
		return nil, fmt.Errorf("gemini: embed text: no embeddings returned")
	}
	normalized, err := normalizeEmbedding(resp.Embeddings[0].Values)
	if err != nil {
		return nil, err
	}

	return normalized, nil
}

// EmbedBatch embeds up to maxEmbeddingBatch (20) texts in a single API call.
// The returned slice is in the same order as the input texts.
// Callers should prefer EmbedAll which handles batching automatically.
func (c *Client) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	if len(texts) > maxEmbeddingBatch {
		return nil, fmt.Errorf("gemini: embed batch: input length %d exceeds max %d; use EmbedAll", len(texts), maxEmbeddingBatch)
	}

	contents := make([]*genai.Content, len(texts))
	for i, t := range texts {
		contents[i] = &genai.Content{
			Role: "user",
			Parts: []*genai.Part{
				{Text: t},
			},
		}
	}

	resp, err := c.gc.Models.EmbedContent(ctx, embeddingModel, contents, &genai.EmbedContentConfig{
		OutputDimensionality: &embeddingOutputDim,
	})
	if err != nil {
		return nil, fmt.Errorf("gemini: embed batch: %w", err)
	}
	if len(resp.Embeddings) != len(texts) {
		return nil, fmt.Errorf("gemini: embed batch: expected %d embeddings, got %d", len(texts), len(resp.Embeddings))
	}

	out := make([][]float32, len(texts))
	for i, e := range resp.Embeddings {
		normalized, err := normalizeEmbedding(e.Values)
		if err != nil {
			return nil, err
		}
		out[i] = normalized
	}
	return out, nil
}

// EmbedAll embeds an arbitrary number of texts, chunking into batches of 20
// automatically. The returned slice is in the same order as the input.
func (c *Client) EmbedAll(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	results := make([][]float32, 0, len(texts))

	for start := 0; start < len(texts); start += maxEmbeddingBatch {
		end := min(start+maxEmbeddingBatch, len(texts))

		batch, err := c.EmbedBatch(ctx, texts[start:end])
		if err != nil {
			return nil, fmt.Errorf("gemini: embed all (batch starting at %d): %w", start, err)
		}
		results = append(results, batch...)
	}

	return results, nil
}
