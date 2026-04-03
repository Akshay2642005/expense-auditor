package job

import (
	"testing"

	"github.com/Akshay2642005/expense-auditor/internal/lib/gemini"
)

func TestShouldReviewBusinessPurposeMismatch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		check *gemini.BusinessPurposeCheck
		want  bool
	}{
		{
			name: "high confidence mismatch requires review",
			check: &gemini.BusinessPurposeCheck{
				Verdict:    "mismatch",
				Confidence: 0.82,
			},
			want: true,
		},
		{
			name: "low confidence mismatch does not auto-review",
			check: &gemini.BusinessPurposeCheck{
				Verdict:    "mismatch",
				Confidence: 0.51,
			},
			want: false,
		},
		{
			name: "consistent verdict does not require review",
			check: &gemini.BusinessPurposeCheck{
				Verdict:    "consistent",
				Confidence: 0.95,
			},
			want: false,
		},
		{
			name:  "nil check does not require review",
			check: nil,
			want:  false,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := shouldReviewBusinessPurposeMismatch(tc.check)
			if got != tc.want {
				t.Fatalf("shouldReviewBusinessPurposeMismatch() = %v, want %v", got, tc.want)
			}
		})
	}
}
