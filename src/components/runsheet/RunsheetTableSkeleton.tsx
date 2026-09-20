'use client';

interface RunsheetTableSkeletonProps {
  columnCount?: number;
  rowCount?: number;
}

export function RunsheetTableSkeleton({ columnCount = 6, rowCount = 6 }: RunsheetTableSkeletonProps) {
  return (
    <div
      data-testid="runsheet-table-skeleton"
      role="status"
      aria-label="Loading runsheet"
      aria-live="polite"
      aria-busy="true"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <table aria-label="Loading runsheet table" className="w-full">
        <thead>
          <tr>
            {Array.from({ length: columnCount }, (_, index) => (
              <th key={index} className="p-3">
                <span className="block h-3 animate-pulse rounded bg-slate-200" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <tr key={rowIndex} className="border-t border-slate-100">
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <td key={columnIndex} className="p-3">
                  <span
                    className={`block h-4 animate-pulse rounded bg-slate-100 ${columnIndex === 0 ? 'w-3/4' : 'w-full'}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
