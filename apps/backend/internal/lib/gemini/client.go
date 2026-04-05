package gemini

import (
	"context"
	"fmt"

	"google.golang.org/genai"
)

// Client wraps the Gemini generative AI SDK and exposes:
//   - GenerativeModel calls (OCR via ExtractReceiptData)
//   - EmbeddingModel calls (gemini-embedding-001 via EmbedText / EmbedAll)
//   - Files API calls (PDF extraction via ExtractPDFText)
//
// A single *Client is safe for concurrent use and should be shared across
// all job handlers.
type Client struct {
	gc *genai.Client
}

// NewClient initialises a Gemini client targeting the public Gemini API
// (not Vertex AI). apiKey is the value of EPAU_AI__GEMINI_API_KEY.
func NewClient(ctx context.Context, apiKey string) (*Client, error) {
	gc, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("gemini: create client: %w", err)
	}
	return &Client{gc: gc}, nil
}
