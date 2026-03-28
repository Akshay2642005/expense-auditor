package job

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/Akshay2642005/expense-auditor/internal/lib/pdf"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
)

func (j *JobService) retrieveAndSavePolicy(ctx context.Context, claimID uuid.UUID) error {
	const minPolicyMatchScore = 0.55

	log := j.logger.With().Str("claim_id", claimID.String()).Logger()

	claim, err := j.claimService.GetClaimForJob(ctx, claimID)
	if err != nil {
		return fmt.Errorf("fetch claim for policy match: %w", err)
	}

	policy, err := j.policyService.GetActivePolicyForJob(ctx, claim.OrgID)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("fetch active policy: %w", err)
		}
		// org_id is empty (non-admin member without active org session) — fall back
		// to finding the policy by the claim owner's user_id
		if claim.OrgID == "" {
			policy, err = j.policyService.GetActivePolicyForUser(ctx, claim.UserID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					log.Warn().Msg("no active policy found for user; claim stays at OCR terminal status")
					return nil
				}
				return fmt.Errorf("fetch active policy by user: %w", err)
			}
		} else {
			log.Warn().Str("org_id", claim.OrgID).Msg("no active policy for org; claim stays at OCR terminal status")
			return nil
		}
	}
	if policy == nil {
		return nil
	}
	policyID := policy.ID

	// If the claim was stored with an empty org_id, backfill it now that we know the org
	if claim.OrgID == "" && policy.OrgID != "" {
		if err := j.claimService.SetClaimOrgID(ctx, claim.ID, policy.OrgID); err != nil {
			log.Warn().Err(err).Msg("failed to backfill org_id on claim")
		} else {
			claim.OrgID = policy.OrgID
		}
	}

	// Build a rich semantic query for vector search
	queryParts := []string{
		fmt.Sprintf("%s expense policy rules limits reimbursement", string(claim.ExpenseCategory)),
	}
	if claim.Amount != nil && claim.Currency != nil {
		queryParts = append(queryParts, fmt.Sprintf("amount %.2f %s cap maximum allowance", *claim.Amount, *claim.Currency))
	}
	if claim.MerchantName != nil && *claim.MerchantName != "" {
		queryParts = append(queryParts, *claim.MerchantName)
	}
	businessPurpose := claim.BusinessPurpose
	if len(businessPurpose) > 150 {
		businessPurpose = businessPurpose[:150]
	}
	queryParts = append(queryParts, businessPurpose)

	queryText := strings.Join(queryParts, " ")

	queryVec, err := policyGeminiClient.EmbedText(ctx, queryText)
	if err != nil {
		return fmt.Errorf("embed retrieval query: %w", err)
	}

	const limit = 8
	retrieved, err := j.policyService.SearchRelevantPolicyChunks(ctx, policyID, queryVec, limit)
	if err != nil {
		return fmt.Errorf("vector search: %w", err)
	}
	if len(retrieved) == 0 {
		return nil
	}

	bestScore := retrieved[0].Score
	if bestScore < minPolicyMatchScore {
		log.Info().
			Float64("best_score", bestScore).
			Float64("threshold", minPolicyMatchScore).
			Msg("policy match below threshold; skipping")
		return nil
	}

	mealsCap, lodgingCap := ExtractCapsFromChunks(retrieved)
	if mealsCap != nil || lodgingCap != nil {
		event := log.Info()
		if mealsCap != nil {
			event = event.Float64("meals_cap", *mealsCap)
		}
		if lodgingCap != nil {
			event = event.Float64("lodging_cap", *lodgingCap)
		}
		event.Msg("policy caps extracted from retrieved chunks")
	}

	if mealsCap == nil || lodgingCap == nil {
		allChunks, err := j.policyService.GetPolicyChunksForJob(ctx, policyID)
		if err != nil {
			log.Warn().Err(err).Msg("failed to load full policy chunks for cap extraction")
		} else {
			allMealsCap, allLodgingCap := ExtractCapsFromChunks(allChunks)
			if mealsCap == nil {
				mealsCap = allMealsCap
			}
			if lodgingCap == nil {
				lodgingCap = allLodgingCap
			}
			if mealsCap != nil || lodgingCap != nil {
				event := log.Info()
				if mealsCap != nil {
					event = event.Float64("meals_cap", *mealsCap)
				}
				if lodgingCap != nil {
					event = event.Float64("lodging_cap", *lodgingCap)
				}
				event.Msg("policy caps extracted from full policy text")
			}
		}
	}

	nextStatus := model.ClaimStatusPolicyMatched
	if claim.Amount != nil {
		switch string(claim.ExpenseCategory) {
		case string(model.ExpenseCategoryMeals):
			if mealsCap != nil && *claim.Amount > *mealsCap {
				nextStatus = model.ClaimStatusFlagged
				log.Info().
					Float64("amount", *claim.Amount).
					Float64("cap", *mealsCap).
					Msg("meals expense exceeds policy cap; flagging")
			} else if mealsCap == nil {
				nextStatus = model.ClaimStatusNeedsReview
				log.Info().Msg("meals cap not found in policy text; marking as needs_review")
			}
		case string(model.ExpenseCategoryLodging):
			if lodgingCap != nil && *claim.Amount > *lodgingCap {
				nextStatus = model.ClaimStatusFlagged
				log.Info().
					Float64("amount", *claim.Amount).
					Float64("cap", *lodgingCap).
					Msg("lodging expense exceeds policy cap; flagging")
			} else if lodgingCap == nil {
				nextStatus = model.ClaimStatusNeedsReview
				log.Info().Msg("lodging cap not found in policy text; marking as needs_review")
			}
		}
	}

	if err := j.claimService.SaveClaimPolicyMatch(ctx, claimID, policyID, retrieved, nextStatus); err != nil {
		return fmt.Errorf("save policy match: %w", err)
	}

	if nextStatus == model.ClaimStatusPolicyMatched {
		EnqueueAuditJob(claimID)
	}

	return nil
}

func (j *JobService) RecomputePolicyMatch(ctx context.Context, claimID uuid.UUID) error {
	return j.retrieveAndSavePolicy(ctx, claimID)
}

func (j *JobService) handlePolicyIngestionTask(ctx context.Context, t *asynq.Task) error {
	var payload PolicyIngestionPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("unmarshal policy ingestion payload: %w", err)
	}

	policyID, err := uuid.Parse(payload.PolicyID)
	if err != nil {
		return fmt.Errorf("parse policy id: %w", err)
	}

	log := j.logger.With().Str("policy_id", policyID.String()).Logger()

	setStatus := func(status model.PolicyStatus, chunkCount int) {
		if err := j.policyService.SetPolicyJobStatus(ctx, policyID, status, chunkCount); err != nil {
			log.Error().Err(err).Msg("update policy status failed")
		}
	}
	failPolicy := func(reason string) error {
		log.Error().Str("reason", reason).Msg("policy ingestion failed")
		setStatus(model.PolicyStatusFailed, 0)
		return fmt.Errorf("policy ingestion failed (%s): %s", policyID, reason)
	}

	setStatus(model.PolicyStatusIngesting, 0)

	log.Info().Str("gcs_path", payload.GCSPath).Msg("downloading policy PDF")
	pdfBytes, _, err := policyGCSClient.Download(ctx, payload.GCSPath)
	if err != nil {
		return failPolicy(fmt.Sprintf("download: %v", err))
	}

	log.Info().Int("bytes", len(pdfBytes)).Msg("extracting PDF text via Gemini Files API")
	pages, err := policyGeminiClient.ExtractPDFText(ctx, pdfBytes)
	if err != nil {
		log.Error().Err(err).Msg("policy pdf text extraction failed")
		return failPolicy(fmt.Sprintf("extract text: %v", err))
	}
	log.Info().Int("pages", len(pages)).Msg("PDF text extracted")

	rawChunks := pdf.ChunkPages(pages)
	log.Info().Int("chunks", len(rawChunks)).Msg("text chunked")

	if len(rawChunks) == 0 {
		return failPolicy("no text could be extracted from the PDF")
	}

	texts := make([]string, len(rawChunks))
	for i, c := range rawChunks {
		texts[i] = c.Text
	}

	log.Info().Int("batches", (len(texts)+19)/20).Msg("embedding chunks")
	vectors, err := policyGeminiClient.EmbedAll(ctx, texts)
	if err != nil {
		log.Error().Err(err).Msg("policy embedding failed")
		return failPolicy(fmt.Sprintf("embed: %v", err))
	}
	if len(vectors) > 0 {
		minDim := len(vectors[0])
		maxDim := len(vectors[0])
		for _, v := range vectors {
			if len(v) < minDim {
				minDim = len(v)
			}
			if len(v) > maxDim {
				maxDim = len(v)
			}
		}
		log.Info().
			Int("embedding_min_dim", minDim).
			Int("embedding_max_dim", maxDim).
			Msg("policy embedding dimensions")
	}

	inserts := make([]model.PolicyChunkInsert, len(rawChunks))
	for i, c := range rawChunks {
		inserts[i] = model.PolicyChunkInsert{
			PolicyID:   policyID,
			ChunkText:  c.Text,
			Embedding:  vectors[i],
			Category:   c.Category,
			PageNum:    c.PageNum,
			ChunkIndex: c.Index,
		}
	}

	if err := j.policyService.ActivatePolicyChunks(ctx, policyID, inserts); err != nil {
		return failPolicy(fmt.Sprintf("activate policy: %v", err))
	}

	log.Info().
		Int("chunks", len(inserts)).
		Msg("policy ingestion complete; policy is now active")

	return nil
}

func ExtractCapsFromChunks(chunks []model.RetrievedChunk) (*float64, *float64) {
	var mealsCap *float64
	var lodgingCap *float64

	mealRegexes := []*regexp.Regexp{
		regexp.MustCompile(`(?i)up\s+to\s+(?:a\s+)?maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)?day`),
		regexp.MustCompile(`(?i)maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)?day`),
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s+per\s+day.{0,80}(?:food|meal|dining|lunch|dinner|breakfast)`),
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s*/\s*day.{0,80}(?:food|meal|dining|lunch|dinner|breakfast)`),
		regexp.MustCompile(`(?i)(?:food|meal|dining|lunch|dinner|breakfast).{0,80}\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)day`),
		regexp.MustCompile(`(?i)(?:daily\s+)?(?:meal|food|dining)\s+(?:allowance|limit|cap|maximum|ceiling)\s+(?:of\s+|is\s+|:\s*)?\$?([0-9]+(?:\.[0-9]+)?)`),
		regexp.MustCompile(`(?i)meals?\s+(?:capped|limited)\s+(?:at|to)\s+\$?([0-9]+(?:\.[0-9]+)?)`),
		regexp.MustCompile(`(?i)per\s+diem\s+(?:of\s+|is\s+|:\s*)?\$?([0-9]+(?:\.[0-9]+)?)`),
		regexp.MustCompile(`(?i)receipts?.{0,120}?maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)?day`),
	}

	lodgingRegexes := []*regexp.Regexp{
		regexp.MustCompile(`(?i)no\s+more\s+than\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
		regexp.MustCompile(`(?i)up\s+to\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
		regexp.MustCompile(`(?i)maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
		regexp.MustCompile(`(?i)(?:hotel|lodging|accommodation|nightly)\s+(?:rate|limit|cap|maximum|ceiling)\s+(?:of\s+|is\s+|:\s*)?\$?([0-9]+(?:\.[0-9]+)?)`),
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s+per\s+night`),
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s*/\s*night`),
		regexp.MustCompile(`(?i)under\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
	}

	mealCompactRegexes := []*regexp.Regexp{
		regexp.MustCompile(`(?i)uptoamaximumof\$?([0-9]+(?:\.[0-9]+)?)/day`),
		regexp.MustCompile(`(?i)maximumof\$?([0-9]+(?:\.[0-9]+)?)/day`),
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)/day.{0,40}(?:food|meal)`),
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)perday.{0,40}(?:food|meal)`),
		regexp.MustCompile(`(?i)(?:food|meal).{0,40}\$?([0-9]+(?:\.[0-9]+)?)(?:/day|perday)`),
	}
	lodgingCompactRegexes := []*regexp.Regexp{
		regexp.MustCompile(`(?i)nomorethan\$?([0-9]+(?:\.[0-9]+)?)(?:pernight|/night)`),
		regexp.MustCompile(`(?i)upto\$?([0-9]+(?:\.[0-9]+)?)(?:pernight|/night)`),
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)(?:pernight|/night)`),
	}

	for _, chunk := range chunks {
		text := strings.ReplaceAll(chunk.ChunkText, "\n", " ")
		text = strings.ReplaceAll(text, "\r", " ")
		text = strings.NewReplacer(
			"\u2215", "/",
			"\u2044", "/",
			"\u00A0", " ",
			"\u202F", " ",
		).Replace(text)
		text = strings.Join(strings.Fields(text), " ")
		compact := strings.ToLower(strings.ReplaceAll(text, " ", ""))

		for _, re := range mealRegexes {
			if m := re.FindStringSubmatch(text); len(m) > 1 {
				if val, err := strconv.ParseFloat(m[1], 64); err == nil {
					if mealsCap == nil || val > *mealsCap {
						v := val
						mealsCap = &v
					}
				}
			}
		}
		for _, re := range lodgingRegexes {
			if lodgingCap == nil {
				if m := re.FindStringSubmatch(text); len(m) > 1 {
					if val, err := strconv.ParseFloat(m[1], 64); err == nil {
						v := val
						lodgingCap = &v
					}
				}
			}
		}
		for _, re := range mealCompactRegexes {
			if m := re.FindStringSubmatch(compact); len(m) > 1 {
				if val, err := strconv.ParseFloat(m[1], 64); err == nil {
					if mealsCap == nil || val > *mealsCap {
						v := val
						mealsCap = &v
					}
				}
			}
		}
		for _, re := range lodgingCompactRegexes {
			if lodgingCap == nil {
				if m := re.FindStringSubmatch(compact); len(m) > 1 {
					if val, err := strconv.ParseFloat(m[1], 64); err == nil {
						v := val
						lodgingCap = &v
					}
				}
			}
		}
		if mealsCap != nil && lodgingCap != nil {
			break
		}
	}

	return mealsCap, lodgingCap
}

func joinStrings(parts []string, sep string) string {
	result := ""
	for i, p := range parts {
		if p == "" {
			continue
		}
		if i > 0 && result != "" {
			result += sep
		}
		result += p
	}
	return result
}
