'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  total?: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  total,
}: PaginationProps) {
  // Calculate the range of items shown on the current page
  const startItem = total !== undefined && total > 0 ? (page - 1) * (pageSize || 10) + 1 : 0;
  const endItem = total !== undefined ? Math.min(page * (pageSize || 10), total) : 0;

  // Build page numbers to display (max 5, with ellipsis for large page counts)
  function getPageNumbers(): (number | '...')[] {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | '...')[] = [];

    if (page <= 3) {
      // Near the start: show 1 2 3 4 ... last
      pages.push(1, 2, 3, 4, '...', totalPages);
    } else if (page >= totalPages - 2) {
      // Near the end: show 1 ... last-3 last-2 last-1 last
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      // In the middle: show 1 ... prev current next ... last
      pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
    }

    return pages;
  }

  const pageNumbers = getPageNumbers();

  if (totalPages <= 1 && !onPageSizeChange) {
    return null;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3">
      {/* Showing X-Y of Z */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {total !== undefined && total > 0 ? (
          <span>
            Showing <span className="font-medium text-gray-900 dark:text-gray-100">{startItem}</span>
            {' '}-{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{endItem}</span>
            {' '}of{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{total}</span>
          </span>
        ) : (
          <span>No results</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Page size selector */}
        {onPageSizeChange && pageSize && (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="page-size" className="text-gray-600 dark:text-gray-400">
              Per page:
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation buttons */}
        {totalPages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            {/* Previous button */}
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center rounded px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="Previous page"
            >
              <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Prev
            </button>

            {/* Page number buttons */}
            {pageNumbers.map((p, idx) =>
              p === '...' ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400"
                >
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  disabled={p === page}
                  className={`inline-flex items-center justify-center rounded px-3 py-1 text-sm font-medium transition-colors ${
                    p === page
                      ? 'bg-blue-600 text-white dark:bg-blue-500'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ),
            )}

            {/* Next button */}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex items-center rounded px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="Next page"
            >
              Next
              <svg className="h-4 w-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
