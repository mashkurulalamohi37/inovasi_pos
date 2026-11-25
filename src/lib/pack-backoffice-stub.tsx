import { createFileRoute } from "@tanstack/react-router";
import { BackOfficePage } from "@/components/pulse/BackOfficePage";
import { SectionCard } from "@/components/pulse/primitives";
import { PACK_STUB_TABLES, formatStubCell } from "@/lib/pack-stub-data";

export function createPackBackOfficeRoute(path: string, title: string, eyebrow: string) {
  const table = PACK_STUB_TABLES[path];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createFileRoute as (p: string) => ReturnType<typeof createFileRoute>)(path)({
    component: function PackBackOfficeStub() {
      return (
        <BackOfficePage title={title} eyebrow={eyebrow} subtitle={`${table?.rows.length ?? 0} records · demo catalog data`}>
          <SectionCard title={title} description={`Manage ${title.toLowerCase()} for your ${eyebrow} pack`}>
            {table ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {table.columns.map(col => (
                        <th
                          key={col.key}
                          className={`px-5 py-2.5 ${col.align === "right" ? "text-right" : "text-left"}`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {table.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-secondary/30">
                        {table.columns.map(col => (
                          <td
                            key={col.key}
                            className={`px-5 py-3 ${col.align === "right" ? "text-right tabular" : ""} ${col.key === "sku" ? "font-mono text-xs" : ""}`}
                          >
                            {formatStubCell(col.key, row[col.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5 text-sm text-muted-foreground">No catalog data configured for this module.</div>
            )}
          </SectionCard>
        </BackOfficePage>
      );
    },
  });
}
