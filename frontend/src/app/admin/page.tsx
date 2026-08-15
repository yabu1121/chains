"use client";

import { Guard } from "@/components/Guard";
import { Select } from "@/components/Select";
import { ApiError } from "@/lib/api";
import { setReportStatus, useAdminReports } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;

export default function AdminPage() {
  return (
    <Guard>
      <AdminReports />
    </Guard>
  );
}

function AdminReports() {
  const { t } = useI18n();
  const { reports, error, isLoading } = useAdminReports();

  const forbidden = error instanceof ApiError && error.status === 403;

  return (
    <main className="public-profile">
      <div className="card">
        <h1 className="section-title mt-0">{t.admin.title}</h1>
        {forbidden ? (
          <p className="muted">{t.admin.notAuthorized}</p>
        ) : isLoading ? (
          <p className="empty">{t.common.loading}</p>
        ) : reports.length === 0 ? (
          <p className="empty">{t.admin.empty}</p>
        ) : (
          <div className="flex flex-col gap-3 mt-2">
            {reports.map((r) => (
              <div key={r.id} className="border border-border rounded-[10px] p-3">
                <div className="text-sm">
                  <b>@{r.reported_username}</b> ·{" "}
                  {t.report.reasons[
                    r.reason as keyof typeof t.report.reasons
                  ] ?? r.reason}
                </div>
                <div className="muted text-[13px]">
                  by @{r.reporter_username} ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                </div>
                {r.details ? (
                  <p className="text-sm mt-1 whitespace-pre-wrap">{r.details}</p>
                ) : null}
                <div className="mt-2 w-[180px]">
                  <Select
                    fullWidth
                    value={r.status}
                    onChange={(v) => setReportStatus(r.id, v)}
                    ariaLabel={t.admin.statusLabel}
                    options={STATUSES.map((s) => ({
                      value: s,
                      label: t.admin.statuses[s],
                    }))}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
