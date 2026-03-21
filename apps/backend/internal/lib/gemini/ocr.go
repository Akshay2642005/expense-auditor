package gemini

type OCRResult struct {
	MerchantName string  `json:"merchant_name"`
	Date         string  `json:"date"`
	TotalAmount  float64 `json:"total_amount"`
	Currency     string  `json:"currency"`
	Confidence   float64 `json:"confidence"`
	RawJSON      string  `json:"-"`
}

const ocrPrompt = `Extract information from this receipt image and return ONLY a valid JSON object with no markdown, no backticks, and no explanation:
{
  "merchant_name": "name of the store, restaurant, or vendor",
  "date": "YYYY-MM-DD format, or empty string if not found",
  "total_amount": numeric value only (e.g. 45.50), or 0 if not found,
  "currency": "3-letter ISO 4217 currency code (e.g. USD, EUR, GBP, INR), or empty string if not found",
  "confidence": a number from 0.0 to 1.0 indicating overall extraction confidence
}
Use null for any field that cannot be determined. Return raw JSON only.`
