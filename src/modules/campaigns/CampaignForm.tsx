import { useEffect, useId, useState, type FormEvent } from "react";
import { listSubfolders } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import { useCampaignStore } from "./store";
import type { Campaign, CampaignInput } from "./types";
import { validateCampaignInput } from "./validation";

interface CampaignFormProps {
  /** Edit this campaign; create a new one when omitted. */
  campaign?: Campaign;
  /** Used to suggest systems from the library's top-level folders. */
  libraryRoot: string | null;
  onClose: () => void;
}

function useSystemSuggestions(libraryRoot: string | null): string[] {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const [folders, setFolders] = useState<string[]>([]);

  useEffect(() => {
    if (!libraryRoot) return;
    let cancelled = false;
    listSubfolders(libraryRoot)
      .then((names) => !cancelled && setFolders(names))
      .catch(() => !cancelled && setFolders([]));
    return () => {
      cancelled = true;
    };
  }, [libraryRoot]);

  const all = new Set([...folders, ...campaigns.map((c) => c.system)]);
  return [...all].sort((a, b) => a.localeCompare(b, "ru"));
}

export function CampaignForm({ campaign, libraryRoot, onClose }: CampaignFormProps) {
  const create = useCampaignStore((s) => s.create);
  const update = useCampaignStore((s) => s.update);
  const systems = useSystemSuggestions(libraryRoot);
  const listId = useId();

  const [input, setInput] = useState<CampaignInput>({
    name: campaign?.name ?? "",
    system: campaign?.system ?? "",
    description: campaign?.description ?? "",
  });
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = validateCampaignInput(input);
  const visible = showErrors ? errors : [];
  const nameError = visible.find((e) => e.startsWith("name"));
  const systemError = visible.find((e) => e.startsWith("system"));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (errors.length > 0) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (campaign) await update(campaign.id, input);
      else await create(input);
      onClose();
    } catch (error) {
      setSaveError(String(error));
      setBusy(false);
    }
  }

  const field = (key: keyof CampaignInput) => ({
    value: input[key],
    onChange: (e: { target: { value: string } }) => setInput({ ...input, [key]: e.target.value }),
  });

  return (
    <Modal
      title={campaign ? ru.campaign.edit : ru.campaign.new}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button type="submit" form="campaign-form" className="primary" disabled={busy}>
            {campaign ? ru.common.save : ru.common.create}
          </button>
        </>
      }
    >
      <form id="campaign-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>{ru.campaign.name}</span>
          <input {...field("name")} autoFocus maxLength={200} />
          {nameError && <small className="error">{ru.campaign.errors[nameError]}</small>}
        </label>
        <label className="field">
          <span>{ru.campaign.system}</span>
          <input {...field("system")} list={listId} />
          <datalist id={listId}>
            {systems.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {systemError ? (
            <small className="error">{ru.campaign.errors[systemError]}</small>
          ) : (
            <small className="hint">{ru.campaign.systemHint}</small>
          )}
        </label>
        <label className="field">
          <span>{ru.campaign.description}</span>
          <textarea {...field("description")} rows={4} />
        </label>
        {saveError && <p className="error">{saveError}</p>}
      </form>
    </Modal>
  );
}
