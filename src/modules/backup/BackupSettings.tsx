import { useState } from "react";
import { CircleAlert, Download, Info, Upload, X } from "lucide-react";
import { pickFile, pickSavePath, readChosenFile, writeChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Button, IconButton } from "../../shared/ui";
import { useCampaignStore } from "../campaigns";
import { BackupError, backupFileName } from "./domain/format";
import { exportCampaign, importCampaign, type ImportReport } from "./service";

const t = ru.backup;
const FILTERS = [{ name: t.filter, extensions: ["json"] }];
/** Missing art paths listed in the report; the rest is summed up. */
const LISTED_PATHS = 10;

type Message = { kind: "info"; text: string } | { kind: "error"; text: string };

function ReportView({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  const found = report.arts - report.artsNotFound.length;
  const listed = report.artsNotFound.slice(0, LISTED_PATHS);
  return (
    <div className="notice backup-report">
      <Info aria-hidden />
      <div>
        <p>{t.imported(report.campaign.name)}</p>
        <p>{t.importSummary(report.characters, report.events, report.maps, report.notes)}</p>
        {report.mapsSkipped > 0 && <p>{t.mapsSkipped(report.mapsSkipped)}</p>}
        {report.arts > 0 && <p>{t.artsFound(found, report.arts, report.artsByHash)}</p>}
        {listed.length > 0 && (
          <>
            <p>{t.artsNotFound}</p>
            <ul>
              {listed.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
              {report.artsNotFound.length > listed.length && (
                <li>{ru.catalog.andMore(report.artsNotFound.length - listed.length)}</li>
              )}
            </ul>
          </>
        )}
      </div>
      <IconButton icon={X} size="sm" label={ru.common.close} onClick={onClose} />
    </div>
  );
}

/** Export of one campaign to a JSON file and import of such a file as a new campaign. */
export function BackupSettings({ libraryRoot }: { libraryRoot: string | null }) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const activeId = useCampaignStore((s) => s.activeId);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const campaign =
    campaigns.find((c) => c.id === chosenId) ??
    campaigns.find((c) => c.id === activeId) ??
    campaigns[0];

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    setReport(null);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const doExport = () =>
    run(async () => {
      if (!campaign) return;
      const path = await pickSavePath(
        t.exportTitle,
        backupFileName(campaign.name, new Date()),
        FILTERS,
      );
      if (!path) return;
      try {
        const json = await exportCampaign(campaign);
        await writeChosenFile(path, new TextEncoder().encode(json));
        setMessage({ kind: "info", text: t.exported(path) });
      } catch (e) {
        console.error(e);
        setMessage({ kind: "error", text: t.exportFailed });
      }
    });

  const doImport = () =>
    run(async () => {
      const path = await pickFile(t.importTitle, FILTERS);
      if (!path) return;
      try {
        const text = new TextDecoder().decode(await readChosenFile(path));
        const result = await importCampaign(text, libraryRoot);
        setChosenId(result.campaign.id);
        setReport(result);
      } catch (e) {
        console.error(e);
        const text = e instanceof BackupError ? t.errors[e.kind] : t.errors.failed;
        setMessage({ kind: "error", text });
      }
    });

  return (
    <div className="backup-settings">
      <div className="backup-row">
        {campaign && (
          <label className="field field-inline">
            <span>{t.campaign}</span>
            <select
              value={campaign.id}
              onChange={(e) => setChosenId(e.target.value)}
              disabled={busy}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button icon={Download} onClick={() => void doExport()} disabled={busy || !campaign}>
          {t.export}
        </Button>
        <Button icon={Upload} onClick={() => void doImport()} disabled={busy}>
          {t.import}
        </Button>
      </div>
      {message && (
        <div className={message.kind === "error" ? "notice error" : "notice"}>
          {message.kind === "error" ? <CircleAlert aria-hidden /> : <Info aria-hidden />}
          <span>{message.text}</span>
          <IconButton icon={X} size="sm" label={ru.common.close} onClick={() => setMessage(null)} />
        </div>
      )}
      {report && <ReportView report={report} onClose={() => setReport(null)} />}
    </div>
  );
}
