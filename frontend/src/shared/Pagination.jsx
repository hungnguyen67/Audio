import { useEffect } from 'react';
import { Select } from './Select';

function getPageItems(page, pageCount) {
  if (pageCount <= 3) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 2) return [1, 2, 3, 'ellipsis-right'];
  if (page >= pageCount - 2) return ['ellipsis-left', pageCount - 2, pageCount - 1, pageCount];
  return [1, 'ellipsis-left', page, 'ellipsis-right', pageCount];
}

export function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canPrevious = page > 1;
  const canNext = page < pageCount;

  useEffect(() => {
    if (page > pageCount) onPageChange(pageCount);
  }, [page, pageCount, onPageChange]);

  const goTo = (nextPage) => onPageChange(Math.min(pageCount, Math.max(1, nextPage)));

  return (
    <div className="pagination-bar">
      <div className="page-size-control">
        <Select
          className="page-size-select"
          value={pageSize}
          options={[5, 10, 20].map((size) => ({ value: size, label: size }))}
          onChange={(value) => onPageSizeChange(Number(value))}
          ariaLabel="Số dòng mỗi trang"
        />
        <span>Rows per page</span>
      </div>

      <div className="page-navigation" aria-label="Phân trang">
        <span className="page-summary">Page {page} of {pageCount}</span>
        <button type="button" aria-label="Trang đầu" disabled={!canPrevious} onClick={() => goTo(1)}>«</button>
        <button type="button" aria-label="Trang trước" disabled={!canPrevious} onClick={() => goTo(page - 1)}>‹</button>
        {getPageItems(page, pageCount).map((item) => item.startsWith?.('ellipsis')
          ? <span className="page-ellipsis" key={item}>...</span>
          : <button
              type="button"
              className={item === page ? 'page-current' : ''}
              aria-current={item === page ? 'page' : undefined}
              key={item}
              onClick={() => goTo(item)}
            >
              {item}
            </button>
        )}
        <button type="button" aria-label="Trang sau" disabled={!canNext} onClick={() => goTo(page + 1)}>›</button>
        <button type="button" aria-label="Trang cuối" disabled={!canNext} onClick={() => goTo(pageCount)}>»</button>
      </div>
    </div>
  );
}
