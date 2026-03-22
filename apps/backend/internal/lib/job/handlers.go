package job

// handlers.go wires together all asynq task handlers.
//
// Design note: handlers use direct SQL (pgxpool) rather than the repository/service
// layers to avoid circular imports (job → service → job).
//
// Phase 2 additions:
//   - InitPolicyHandlers   — stores clients needed for policy ingestion
//   - handlePolicyIngestionTask — downloads PDF, extracts text, chunks, embeds, stores
//   - retrieveAndSavePolicy — called inline by the OCR handler after OCR succeeds

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/rs/zerolog"

	"github.com/Akshay2642005/expense-auditor/internal/config"
	"github.com/Akshay2642005/expense-auditor/internal/lib/email"
	"github.com/Akshay2642005/expense-auditor/internal/lib/gemini"
	"github.com/Akshay2642005/expense-auditor/internal/lib/pdf"
	"github.com/Akshay2642005/expense-auditor/internal/lib/storage"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

var emailClient *email.Client

var (
	ocrGeminiClient     *gemini.Client
	ocrGCSClient        *storage.GCSClient
	ocrPool             *pgxpool.Pool
	ocrDateMismatchDays int
)

var (
	policyGeminiClient *gemini.Client
	policyGCSClient    *storage.GCSClient
	policyPool         *pgxpool.Pool
)

func (j *JobService) InitHandlers(cfg *config.Config, logger *zerolog.Logger) {
	emailClient = email.NewClient(cfg, logger)
}

func (j *JobService) InitOCRHandlers(g *gemini.Client, gcs *storage.GCSClient, pool *pgxpool.Pool, dateMismatchDays int) {
	ocrGeminiClient = g
	ocrGCSClient = gcs
	ocrPool = pool
	ocrDateMismatchDays = dateMismatchDays
}

func (j *JobService) InitPolicyHandlers(g *gemini.Client, gcs *storage.GCSClient, pool *pgxpool.Pool) {
	policyGeminiClient = g
	policyGCSClient = gcs
	policyPool = pool
}

func (j *JobService) handleOCRReceiptTask(ctx context.Context, t *asynq.Task) error {
	var payload OCRPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("unmarshal ocr payload: %w", err)
	}
	claimID := payload.ClaimID
	log := j.logger.With().Str("claim_id", claimID.String()).Logger()

	if err := setClaimStatus(ctx, ocrPool, claimID, model.ClaimStatusProcessing); err != nil {
		log.Error().Err(err).Msg("failed to set status=processing")
		return err
	}

	fileBytes, mimeType, err := ocrGCSClient.Download(ctx, payload.GCSPath)
	if err != nil {
		log.Error().Err(err).Msg("failed to download receipt from gcs")
		_ = failClaim(ctx, ocrPool, claimID, "failed to read uploaded file")
		return fmt.Errorf("ocr: gcs download: %w", err)
	}

	result, err := ocrGeminiClient.ExtractReceiptData(ctx, fileBytes, mimeType)
	if err != nil {
		log.Error().Err(err).Msg("gemini OCR failed")
		_ = failClaim(ctx, ocrPool, claimID, fmt.Sprintf("OCR failed: %v", err))
		return fmt.Errorf("ocr: gemini extract: %w", err)
	}

	status := model.ClaimStatusOCRComplete
	if result.Confidence < 0.5 {
		status = model.ClaimStatusNeedsReview
	}

	dateMismatch := false
	claimedDate, parseErr := time.Parse(time.RFC3339, payload.ClaimedDate)
	if parseErr == nil && result.Date != "" {
		receiptDate, dateErr := time.Parse("2006-01-02", result.Date)
		if dateErr == nil {
			diff := claimedDate.Sub(receiptDate)
			diffDays := math.Abs(diff.Hours() / 24)
			threshold := float64(ocrDateMismatchDays)
			if threshold == 0 {
				threshold = 7
			}
			if diffDays > threshold {
				dateMismatch = true
				status = model.ClaimStatusNeedsReview
			}
		}
	}

	if err := saveOCRResult(ctx, ocrPool, claimID, result, status, dateMismatch); err != nil {
		log.Error().Err(err).Msg("failed to save OCR result")
		return err
	}

	policyErr := j.retrieveAndSavePolicy(ctx, claimID)
	if policyErr != nil {
		log.Warn().Err(policyErr).Msg("policy retrieval failed — claim remains at OCR terminal status")
	}

	return nil
}

func (j *JobService) retrieveAndSavePolicy(ctx context.Context, claimID uuid.UUID) error {
	const minPolicyMatchScore = 0.55
	log := j.logger.With().Str("claim_id", claimID.String()).Logger()

	// Fetch the claim's org_id so we scope the policy lookup to the right org.
	var orgID string
	err := policyPool.QueryRow(ctx,
		`SELECT org_id FROM claims WHERE id = $1`, claimID,
	).Scan(&orgID)
	if err != nil {
		return fmt.Errorf("fetch claim org_id: %w", err)
	}

	var policyID uuid.UUID
	err = policyPool.QueryRow(ctx,
		`SELECT id FROM policies WHERE status = 'active' AND org_id = $1 ORDER BY created_at DESC LIMIT 1`,
		orgID,
	).Scan(&policyID)
	if err != nil {
		// No active policy for this org — nothing to do.
		return nil
	}

	var (
		category        string
		merchantName    *string
		amount          *float64
		currency        *string
		businessPurpose string
	)

	err = policyPool.QueryRow(ctx,
		`SELECT expense_category, merchant_name, amount, currency, business_purpose
		 FROM claims WHERE id = $1`, claimID,
	).Scan(&category, &merchantName, &amount, &currency, &businessPurpose)
	if err != nil {
		return fmt.Errorf("fetch claim fields for retrieval: %w", err)
	}

	queryParts := []string{category}
	if amount != nil && currency != nil {
		queryParts = append(queryParts, fmt.Sprintf("%.2f %s", *amount, *currency))
	}
	if merchantName != nil {
		queryParts = append(queryParts, *merchantName)
	}
	if len(businessPurpose) > 100 {
		businessPurpose = businessPurpose[:100]
	}
	queryParts = append(queryParts, businessPurpose)

	queryText := joinStrings(queryParts, " ")

	// 3. Embed the query
	queryVec, err := policyGeminiClient.EmbedText(ctx, queryText)
	if err != nil {
		return fmt.Errorf("embed retrieval query: %w", err)
	}

	// 4. pgvector cosine search — top 5
	const limit = 5
	rows, err := policyPool.Query(ctx, `
		SELECT chunk_text, category, page_num,
		       1 - (embedding <=> $1::vector) AS score
		FROM policy_chunks
		WHERE policy_id = $2
		ORDER BY embedding <=> $1::vector
		LIMIT $3`,
		pgvector.NewVector(queryVec), policyID, limit,
	)
	if err != nil {
		return fmt.Errorf("vector search: %w", err)
	}
	defer rows.Close()

	var retrieved []model.RetrievedChunk
	for rows.Next() {
		var rc model.RetrievedChunk
		if err := rows.Scan(&rc.ChunkText, &rc.Category, &rc.PageNum, &rc.Score); err != nil {
			return fmt.Errorf("scan retrieved chunk: %w", err)
		}
		retrieved = append(retrieved, rc)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows error: %w", err)
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

	chunksJSON, err := model.MarshalRetrievedChunks(retrieved)
	if err != nil {
		return fmt.Errorf("marshal retrieved chunks: %w", err)
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
		allChunks, err := loadPolicyChunks(ctx, policyID)
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
	if amount != nil {
		switch category {
		case string(model.ExpenseCategoryMeals):
			if mealsCap != nil && *amount > *mealsCap {
				nextStatus = model.ClaimStatusFlagged
				log.Info().
					Float64("amount", *amount).
					Float64("cap", *mealsCap).
					Msg("meals expense exceeds policy cap; flagging")
			} else if mealsCap == nil {
				nextStatus = model.ClaimStatusNeedsReview
				log.Info().Msg("meals cap not found in policy text; marking as needs_review")
			}
		case string(model.ExpenseCategoryLodging):
			if lodgingCap != nil && *amount > *lodgingCap {
				nextStatus = model.ClaimStatusFlagged
				log.Info().
					Float64("amount", *amount).
					Float64("cap", *lodgingCap).
					Msg("lodging expense exceeds policy cap; flagging")
			} else if lodgingCap == nil {
				nextStatus = model.ClaimStatusNeedsReview
				log.Info().Msg("lodging cap not found in policy text; marking as needs_review")
			}
		}
	}

	_, err = policyPool.Exec(ctx, `
		UPDATE claims
		SET status              = $4,
		    policy_id           = $1,
		    policy_chunks_used  = $2
		WHERE id = $3`,
		policyID, chunksJSON, claimID, nextStatus,
	)
	return err
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
		if _, err := policyPool.Exec(ctx,
			`UPDATE policies SET status = $1, chunk_count = $2 WHERE id = $3`,
			status, chunkCount, policyID,
		); err != nil {
			log.Error().Err(err).Msg("update policy status failed")
		}
	}
	failPolicy := func(reason string) error {
		log.Error().Str("reason", reason).Msg("policy ingestion failed")
		setStatus(model.PolicyStatusFailed, 0)
		return fmt.Errorf("policy ingestion failed (%s): %s", policyID, reason)
	}

	setStatus(model.PolicyStatusIngesting, 0)

	// 1. Download PDF from GCS
	log.Info().Str("gcs_path", payload.GCSPath).Msg("downloading policy PDF")
	pdfBytes, _, err := policyGCSClient.Download(ctx, payload.GCSPath)
	if err != nil {
		return failPolicy(fmt.Sprintf("download: %v", err))
	}

	// 2. Extract text via Gemini Files API
	log.Info().Int("bytes", len(pdfBytes)).Msg("extracting PDF text via Gemini Files API")
	pages, err := policyGeminiClient.ExtractPDFText(ctx, pdfBytes)
	if err != nil {
		log.Error().Err(err).Msg("policy pdf text extraction failed")
		return failPolicy(fmt.Sprintf("extract text: %v", err))
	}
	log.Info().Int("pages", len(pages)).Msg("PDF text extracted")

	// 3. Chunk
	rawChunks := pdf.ChunkPages(pages)
	log.Info().Int("chunks", len(rawChunks)).Msg("text chunked")

	if len(rawChunks) == 0 {
		return failPolicy("no text could be extracted from the PDF")
	}

	// 4. Embed all chunks (batched 20 at a time)
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

	// 5. Build insert slice
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

	// 6. Archive any currently active policies, then bulk insert + activate
	tx, err := policyPool.Begin(ctx)
	if err != nil {
		return failPolicy(fmt.Sprintf("begin tx: %v", err))
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `UPDATE policies SET status = 'archived' WHERE status = 'active' AND id != $1 AND org_id = (SELECT org_id FROM policies WHERE id = $1)`, policyID); err != nil {
		return failPolicy(fmt.Sprintf("archive active policies: %v", err))
	}

	// Insert chunks (small batch sizes; avoids COPY/vector encoding issues)
	for _, ins := range inserts {
		if _, err := tx.Exec(
			ctx,
			`INSERT INTO policy_chunks (policy_id, chunk_text, embedding, category, page_num, chunk_index)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			ins.PolicyID,
			ins.ChunkText,
			pgvector.NewVector(ins.Embedding),
			ins.Category,
			ins.PageNum,
			ins.ChunkIndex,
		); err != nil {
			return failPolicy(fmt.Sprintf("insert chunk: %v", err))
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE policies SET status = 'active', chunk_count = $1 WHERE id = $2`,
		len(inserts), policyID,
	); err != nil {
		return failPolicy(fmt.Sprintf("activate policy: %v", err))
	}

	if err := tx.Commit(ctx); err != nil {
		return failPolicy(fmt.Sprintf("commit: %v", err))
	}

	log.Info().
		Int("chunks", len(inserts)).
		Msg("policy ingestion complete — policy is now active")

	return nil
}

// ---------- OCR DB helpers (unchanged from Phase 1) ----------

func setClaimStatus(ctx context.Context, pool *pgxpool.Pool, claimID interface{ String() string }, status model.ClaimStatus) error {
	_, err := pool.Exec(ctx, `UPDATE claims SET status = $1 WHERE id = $2`, status, claimID.String())
	if err != nil {
		return fmt.Errorf("set claim status: %w", err)
	}
	return nil
}

func failClaim(ctx context.Context, pool *pgxpool.Pool, claimID interface{ String() string }, reason string) error {
	_, _ = pool.Exec(ctx,
		`UPDATE claims SET status = 'ocr_failed', ocr_error = $1 WHERE id = $2`, reason, claimID.String())
	return fmt.Errorf("claim %s failed: %s", claimID, reason)
}

func saveOCRResult(
	ctx context.Context,
	pool *pgxpool.Pool,
	claimID interface{ String() string },
	result *gemini.OCRResult,
	status model.ClaimStatus,
	dateMismatch bool,
) error {
	var merchantName *string
	if result.MerchantName != "" {
		merchantName = &result.MerchantName
	}

	var receiptDate *time.Time
	if result.Date != "" {
		d, err := time.Parse("2006-01-02", result.Date)
		if err == nil {
			receiptDate = &d
		}
	}

	var amount *float64
	if result.TotalAmount > 0 {
		amount = &result.TotalAmount
	}

	var currency *string
	if result.Currency != "" {
		currency = &result.Currency
	}

	var rawJSON *string
	if result.RawJSON != "" {
		rawJSON = &result.RawJSON
	}

	_, err := pool.Exec(ctx, `
		UPDATE claims SET
			status        = $1,
			merchant_name = $2,
			receipt_date  = $3,
			amount        = $4,
			currency      = $5,
			ocr_raw_json  = $6::jsonb,
			date_mismatch = $7,
			updated_at    = now()
		WHERE id = $8
	`, string(status), merchantName, receiptDate, amount, currency, rawJSON, dateMismatch, claimID.String())

	return err
}

// ---------- misc helpers ----------

// ExtractCapsFromChunks scans retrieved policy chunks for spending caps.
// It returns the meals cap (per day) and lodging cap (per night) as pointers;
// nil means the cap was not found in the provided chunks.
//
// NOTE: all patterns use raw string literals (backticks), so regex metacharacters
// like \s, \d, \$ must NOT be double-escaped.
func ExtractCapsFromChunks(chunks []model.RetrievedChunk) (*float64, *float64) {
	var mealsCap *float64
	var lodgingCap *float64

	// Patterns matched against the normalised (whitespace-collapsed) chunk text.
	mealRegexes := []*regexp.Regexp{
		// "up to a maximum of $75 per day" / "up to a maximum of $75/day"
		regexp.MustCompile(`(?i)up\s+to\s+(?:a\s+)?maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)?day`),
		// "maximum of $75 per day" / "maximum of $75/day"
		regexp.MustCompile(`(?i)maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)?day`),
		// "$75 per day" near food/meal keywords
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s+per\s+day.{0,80}(?:food|meal|dining|lunch|dinner|breakfast)`),
		// "$75/day" near food/meal keywords
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s*/\s*day.{0,80}(?:food|meal|dining|lunch|dinner|breakfast)`),
		// food/meal keywords followed by "$75 per day" / "$75/day"
		regexp.MustCompile(`(?i)(?:food|meal|dining|lunch|dinner|breakfast).{0,80}\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)day`),
		// "daily meal/food allowance/limit/cap of $75"
		regexp.MustCompile(`(?i)(?:daily\s+)?(?:meal|food|dining)\s+(?:allowance|limit|cap|maximum|ceiling)\s+(?:of\s+|is\s+|:\s*)?\$?([0-9]+(?:\.[0-9]+)?)`),
		// "meals? capped at $75 per day" / "meals? limited to $75"
		regexp.MustCompile(`(?i)meals?\s+(?:capped|limited)\s+(?:at|to)\s+\$?([0-9]+(?:\.[0-9]+)?)`),
		// "per diem of $75" / "per diem: $75"
		regexp.MustCompile(`(?i)per\s+diem\s+(?:of\s+|is\s+|:\s*)?\$?([0-9]+(?:\.[0-9]+)?)`),
		// receipt-anchored: "receipts ... maximum of $75 per day"
		regexp.MustCompile(`(?i)receipts?.{0,120}?maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:/|per\s*)?day`),
	}

	lodgingRegexes := []*regexp.Regexp{
		// "no more than $150 per night" / "no more than $150/night"
		regexp.MustCompile(`(?i)no\s+more\s+than\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
		// "up to $150 per night"
		regexp.MustCompile(`(?i)up\s+to\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
		// "maximum of $150 per night"
		regexp.MustCompile(`(?i)maximum\s+of\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
		// "hotel/lodging/accommodation rate of $150" / "nightly rate of $150"
		regexp.MustCompile(`(?i)(?:hotel|lodging|accommodation|nightly)\s+(?:rate|limit|cap|maximum|ceiling)\s+(?:of\s+|is\s+|:\s*)?\$?([0-9]+(?:\.[0-9]+)?)`),
		// "$150 per night" anywhere
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s+per\s+night`),
		// "$150/night" anywhere
		regexp.MustCompile(`(?i)\$?([0-9]+(?:\.[0-9]+)?)\s*/\s*night`),
		// "under $150 per night"
		regexp.MustCompile(`(?i)under\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(?:per\s+night|/night)`),
	}

	// Compact patterns run against the whitespace-stripped lowercase text to catch
	// cases where Gemini collapses spaces during PDF extraction.
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

func loadPolicyChunks(ctx context.Context, policyID uuid.UUID) ([]model.RetrievedChunk, error) {
	rows, err := policyPool.Query(ctx, `
		SELECT chunk_text, category, page_num
		FROM policy_chunks
		WHERE policy_id = $1
	`, policyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chunks []model.RetrievedChunk
	for rows.Next() {
		var rc model.RetrievedChunk
		if err := rows.Scan(&rc.ChunkText, &rc.Category, &rc.PageNum); err != nil {
			return nil, err
		}
		chunks = append(chunks, rc)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return chunks, nil
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
