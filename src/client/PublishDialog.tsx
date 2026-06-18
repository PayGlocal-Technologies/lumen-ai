"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
  Input,
  Textarea,
} from "@payglocal_ui/flux-ui";
import { Icon } from "./icon.js";
import type { AgentPublishResult } from "../types/index.js";

export function PublishDialog({ apiBasePath = "/api/lumen" }: { apiBasePath?: string }) {
  const [feature, setFeature] = useState("");
  const [summary, setSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AgentPublishResult | null>(null);

  const submit = async () => {
    if (!feature.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBasePath}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, summary }),
      });
      setResult((await res.json()) as AgentPublishResult);
    } catch {
      setResult({ branch: "", pushed: false, message: "Could not reach the server. Try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Request integration">
          <Icon name="git-pull-request" className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md z-[2147483647]" overlayClassName="z-[2147483646]">
        <DialogTitle>Request integration</DialogTitle>
        <DialogDescription>
          Sends your work to engineering as a pull request for review.
        </DialogDescription>

        <div className="flex flex-col gap-3 py-2">
          <Field>
            <FieldLabel>Feature name</FieldLabel>
            <Input
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              placeholder="e.g. Payment Links"
            />
          </Field>
          <Field>
            <FieldLabel>What changed (optional)</FieldLabel>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="A short summary for the reviewer"
              rows={3}
            />
          </Field>

          {result && (
            <div className="rounded-md bg-muted p-2 text-xs">
              <p>{result.message}</p>
              {result.prUrl && (
                <a
                  href={result.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-primary"
                >
                  <Icon name="arrow-up-right" className="h-3 w-3" /> View pull request
                </a>
              )}
            </div>
          )}

          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || !feature.trim()}
            leftIcon={
              <Icon
                name={submitting ? "loader" : "git-pull-request"}
                className={submitting ? "animate-spin" : ""}
              />
            }
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
