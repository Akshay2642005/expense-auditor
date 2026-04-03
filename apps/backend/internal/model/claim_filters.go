package model

import (
	"strings"
	"time"
)

type AdminClaimFlagFilter string
type AdminClaimDateField string
type AdminClaimSortBy string
type ClaimSortDirection string

const (
	AdminClaimFlagFilterAll       AdminClaimFlagFilter = "all"
	AdminClaimFlagFilterFlagged   AdminClaimFlagFilter = "flagged"
	AdminClaimFlagFilterUnflagged AdminClaimFlagFilter = "unflagged"
)

const (
	AdminClaimDateFieldSubmitted AdminClaimDateField = "submitted"
	AdminClaimDateFieldClaimed   AdminClaimDateField = "claimed"
)

const (
	AdminClaimSortBySubmittedDate AdminClaimSortBy = "submittedDate"
	AdminClaimSortByClaimedDate   AdminClaimSortBy = "claimedDate"
	AdminClaimSortByAmount        AdminClaimSortBy = "amount"
	AdminClaimSortByStatus        AdminClaimSortBy = "status"
	AdminClaimSortByMerchant      AdminClaimSortBy = "merchant"
)

const (
	ClaimSortDirectionAsc  ClaimSortDirection = "asc"
	ClaimSortDirectionDesc ClaimSortDirection = "desc"
)

type AdminClaimFilters struct {
	Query          string
	Statuses       []ClaimStatus
	UploaderUserID string
	FlaggedFilter  AdminClaimFlagFilter
	DateField      AdminClaimDateField
	DateFrom       *time.Time
	DateTo         *time.Time
	SortBy         AdminClaimSortBy
	SortDirection  ClaimSortDirection
}

func DefaultAdminClaimFilters() AdminClaimFilters {
	return AdminClaimFilters{
		FlaggedFilter: AdminClaimFlagFilterAll,
		DateField:     AdminClaimDateFieldSubmitted,
		SortBy:        AdminClaimSortBySubmittedDate,
		SortDirection: ClaimSortDirectionDesc,
	}
}

func (f AdminClaimFilters) Normalized() AdminClaimFilters {
	normalized := f

	normalized.Query = strings.TrimSpace(normalized.Query)
	normalized.UploaderUserID = strings.TrimSpace(normalized.UploaderUserID)

	if normalized.FlaggedFilter == "" {
		normalized.FlaggedFilter = AdminClaimFlagFilterAll
	}
	if normalized.DateField == "" {
		normalized.DateField = AdminClaimDateFieldSubmitted
	}
	if normalized.SortBy == "" {
		normalized.SortBy = AdminClaimSortBySubmittedDate
	}
	if normalized.SortDirection == "" {
		normalized.SortDirection = ClaimSortDirectionDesc
	}

	if len(normalized.Statuses) == 0 {
		normalized.Statuses = nil
	}

	return normalized
}

func (f AdminClaimFilters) IsDefault() bool {
	normalized := f.Normalized()
	defaults := DefaultAdminClaimFilters()

	return normalized.Query == "" &&
		len(normalized.Statuses) == 0 &&
		normalized.UploaderUserID == "" &&
		normalized.FlaggedFilter == defaults.FlaggedFilter &&
		normalized.DateField == defaults.DateField &&
		normalized.DateFrom == nil &&
		normalized.DateTo == nil &&
		normalized.SortBy == defaults.SortBy &&
		normalized.SortDirection == defaults.SortDirection
}
