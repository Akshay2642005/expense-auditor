// Package pdf contains utilities for processing policy PDF content.
// PDF text extraction itself is handled by the Gemini Files API (see lib/gemini/document.go).
// This package only handles in-memory text chunking after extraction.
package pdf

import (
	"strings"
)

const (
	// TargetChunkChars is the approximate character size per chunk (~400 tokens at 4 chars/token).
	TargetChunkChars = 1600
	// OverlapChars is how many characters are repeated from the end of the previous chunk
	// at the start of the next one to preserve context across boundaries (~50 tokens).
	OverlapChars = 200
)

// Chunk is a single text segment produced by the chunker.
type Chunk struct {
	Text     string
	PageNum  int
	Index    int    // global sequential index across all pages
	Category string // "meals" | "transport" | "lodging" | "general"
}

// ChunkPages converts a page-number→text map (from Gemini extraction) into a flat
// slice of overlapping Chunks ready for embedding.
// Pages are processed in ascending page-number order.
func ChunkPages(pages map[int]string) []Chunk {
	// Sort page numbers
	keys := sortedKeys(pages)

	var chunks []Chunk
	globalIndex := 0
	prevOverlap := ""

	for _, pageNum := range keys {
		text := pages[pageNum]
		if strings.TrimSpace(text) == "" {
			continue
		}
		pageChunks := chunkText(text, pageNum, &globalIndex, prevOverlap)
		if len(pageChunks) > 0 {
			last := pageChunks[len(pageChunks)-1]
			prevOverlap = tailChars(last.Text, OverlapChars)
		}
		chunks = append(chunks, pageChunks...)
	}
	return chunks
}

// chunkText splits a single page's text into chunks, prepending prevOverlap to the
// first chunk so cross-page context is not lost.
func chunkText(text string, pageNum int, globalIndex *int, prevOverlap string) []Chunk {
	paragraphs := splitParagraphs(text)
	var chunks []Chunk
	current := prevOverlap

	flush := func() {
		trimmed := strings.TrimSpace(current)
		if trimmed == "" {
			return
		}
		chunks = append(chunks, Chunk{
			Text:     trimmed,
			PageNum:  pageNum,
			Index:    *globalIndex,
			Category: DetectCategory(trimmed),
		})
		*globalIndex++
		current = tailChars(trimmed, OverlapChars)
	}

	for _, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}

		if len(current)+len(para)+2 <= TargetChunkChars {
			if current != "" {
				current += "\n\n"
			}
			current += para
		} else {
			// Para alone fits in a fresh chunk — flush what we have first
			if len(current) > 0 {
				flush()
			}
			// Para exceeds target size by itself — sentence-split it
			if len(para) > TargetChunkChars {
				sentences := splitSentences(para)
				for _, sent := range sentences {
					sent = strings.TrimSpace(sent)
					if sent == "" {
						continue
					}
					if len(current)+len(sent)+2 <= TargetChunkChars {
						if current != "" {
							current += " "
						}
						current += sent
					} else {
						if len(current) > 0 {
							flush()
						}
						current += sent
					}
				}
			} else {
				current += para
			}
		}
	}
	if len(strings.TrimSpace(current)) > 0 {
		flush()
	}
	return chunks
}

// DetectCategory assigns a rough policy category to a chunk using keyword scanning.
// Exported so job handlers can call it without importing the full chunker.
func DetectCategory(text string) string {
	lower := strings.ToLower(text)
	switch {
	case containsAny(lower, "meal", "food", "dinner", "lunch", "breakfast", "restaurant",
		"dining", "catering", "per diem", "subsistence"):
		return "meals"
	case containsAny(lower, "transport", "taxi", "uber", "lyft", "flight", "airline",
		"train", "bus", "mileage", "fuel", "parking", "toll", "car hire", "rental car"):
		return "transport"
	case containsAny(lower, "hotel", "lodging", "accommodation", "motel", "inn", "resort",
		"room rate", "nightly rate", "stay", "check-in", "check-out"):
		return "lodging"
	default:
		return "general"
	}
}

// --- helpers ---

func splitParagraphs(text string) []string {
	return strings.Split(text, "\n\n")
}

func splitSentences(text string) []string {
	// Naive split on ". " — good enough for policy documents.
	parts := strings.Split(text, ". ")
	sentences := make([]string, 0, len(parts))
	for i, p := range parts {
		if i < len(parts)-1 {
			sentences = append(sentences, p+".")
		} else {
			sentences = append(sentences, p)
		}
	}
	return sentences
}

func tailChars(s string, n int) string {
	if len(s) <= n {
		return s
	}
	// Snap to a word boundary to avoid splitting mid-word
	tail := s[len(s)-n:]
	if idx := strings.Index(tail, " "); idx >= 0 {
		tail = tail[idx+1:]
	}
	return tail
}

func containsAny(s string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}

func sortedKeys(m map[int]string) []int {
	keys := make([]int, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Simple insertion sort — page counts are small
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}
