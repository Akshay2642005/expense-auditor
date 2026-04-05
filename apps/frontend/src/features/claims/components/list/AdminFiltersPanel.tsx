import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  AdminClaimDateField,
  AdminClaimFlagFilter,
  AdminClaimSortBy,
  AdminClaimSortDir,
  ClaimStatus,
} from "@auditor/zod";
import { FilterX, Search, SlidersHorizontal } from "lucide-react";

import {
  adminStatusFilterOptions,
  formatClaimStatus,
  type UploaderOption,
} from "./claim-list-utils";

type AdminFiltersPanelProps = {
  adminSearchText: string;
  setAdminSearchText: (value: string) => void;
  statusFilterLabel: string;
  selectedStatuses: ClaimStatus[];
  toggleStatusFilter: (status: ClaimStatus) => void;
  selectedUploaderUserId: string;
  setSelectedUploaderUserId: (value: string) => void;
  uploaderOptions: UploaderOption[];
  flaggedFilter: AdminClaimFlagFilter;
  setFlaggedFilter: (value: AdminClaimFlagFilter) => void;
  activeFilterCount: number;
  clearAdminFilters: () => void;
  dateField: AdminClaimDateField;
  setDateField: (value: AdminClaimDateField) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
  sortBy: AdminClaimSortBy;
  setSortBy: (value: AdminClaimSortBy) => void;
  sortDir: AdminClaimSortDir;
  setSortDir: (value: AdminClaimSortDir) => void;
  className?: string;
};

export function AdminFiltersPanel({
  adminSearchText,
  setAdminSearchText,
  statusFilterLabel,
  selectedStatuses,
  toggleStatusFilter,
  selectedUploaderUserId,
  setSelectedUploaderUserId,
  uploaderOptions,
  flaggedFilter,
  setFlaggedFilter,
  activeFilterCount,
  clearAdminFilters,
  dateField,
  setDateField,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  className,
}: AdminFiltersPanelProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-card/70 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <CardContent className="flex flex-col px-0 py-0">
        <div className="px-4 pb-3 pt-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Review Filters</p>
              {activeFilterCount > 0 && (
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2 py-0.5 text-[11px]"
                  >
                    {activeFilterCount}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={clearAdminFilters}
                  >
                    <FilterX className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Search the queue and tighten the results.
            </p>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label
              htmlFor="admin-claim-search"
              className="text-xs text-muted-foreground"
            >
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-claim-search"
                value={adminSearchText}
                onChange={(event) => setAdminSearchText(event.target.value)}
                placeholder="Merchant, purpose, OCR note, or claim ID"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 pb-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{statusFilterLabel}</span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {adminStatusFilterOptions.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={selectedStatuses.includes(status)}
                    onCheckedChange={() => toggleStatusFilter(status)}
                  >
                    {formatClaimStatus(status)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Uploader</Label>
            <Select
              value={selectedUploaderUserId || "all"}
              onValueChange={(value) =>
                setSelectedUploaderUserId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="All uploaders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All uploaders</SelectItem>
                {uploaderOptions.map((option) => (
                  <SelectItem key={option.userId} value={option.userId}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Flagged</Label>
              <Select
                value={flaggedFilter}
                onValueChange={(value: AdminClaimFlagFilter) =>
                  setFlaggedFilter(value)
                }
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Flagged filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All claims</SelectItem>
                  <SelectItem value="flagged">Flagged only</SelectItem>
                  <SelectItem value="unflagged">Exclude flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Date field
              </Label>
              <Select
                value={dateField}
                onValueChange={(value: AdminClaimDateField) =>
                  setDateField(value)
                }
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted date</SelectItem>
                  <SelectItem value="claimed">Claimed date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem] lg:grid-cols-1">
              <Select
                value={sortBy}
                onValueChange={(value: AdminClaimSortBy) => setSortBy(value)}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submittedDate">Submitted date</SelectItem>
                  <SelectItem value="claimedDate">Claimed date</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="merchant">Merchant</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sortDir}
                onValueChange={(value: AdminClaimSortDir) => setSortDir(value)}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

