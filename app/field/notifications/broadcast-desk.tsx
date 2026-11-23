"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ImagePlus, Link2, Megaphone, PlayCircle, Send, Smartphone, Trash2 } from "lucide-react";
import type { FieldBroadcast } from "@/db/schema";
import { sendFieldBroadcast } from "@/lib/actions/field";
import { BROADCAST_LIMITS, broadcastText, checkBroadcast, pushPreview, youtubeVideoId } from "@/lib/field-broadcast-rules";
import { Badge, Notice, PageHeader, StatCard, StatGrid, buttonClass, inputClass, labelClass } from "@/components/field/kit";
import { Modal } from "@/components/field/modal";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function BroadcastDesk({ sent, audience }: { sent: FieldBroadcast[]; audience: { devices: number; phones: number } }) {
  const t = useFieldText();
  const n = t.notify;
  const locale = fieldLocale(useFieldLang());
  const router = useRouter();
  const [titleEn, setTitleEn] = useState("");
  const [titleTa, setTitleTa] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyTa, setBodyTa] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const [previewLang, setPreviewLang] = useState<"en" | "ta">("en");
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // While a message is still going out, refresh its counts every few seconds.
  const sending = sent.some((b) => b.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [sending, router]);

  const input = { titleEn, titleTa, bodyEn, bodyTa, imageUrl, linkUrl, videoUrl };
  const check = checkBroadcast(input);
  const preview = broadcastText(check.value, previewLang);
  const hasMedia = !!(check.value.imageUrl || check.value.linkUrl || check.value.videoUrl);

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setErrors([]);
    if (!IMAGE_TYPES.includes(file.type)) return setErrors([n.imageType]);
    if (file.size > 5 * 1024 * 1024) return setErrors([n.imageTooBig]);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/field/media", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || n.imageFailed);
      setImageUrl(json.url);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : n.imageFailed]);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function review() {
    setDone("");
    if (check.errors.length) {
      setErrors(check.errors);
      return;
    }
    setErrors([]);
    setConfirm(true);
  }

  function send() {
    start(async () => {
      try {
        await sendFieldBroadcast(input);
        setConfirm(false);
        setTitleEn("");
        setTitleTa("");
        setBodyEn("");
        setBodyTa("");
        setImageUrl("");
        setLinkUrl("");
        setVideoUrl("");
        setDone(n.sentNotice);
        router.refresh();
      } catch (err) {
        setConfirm(false);
        setErrors([err instanceof Error ? err.message : n.sendFailed]);
      }
    });
  }

  const when = (d: Date | string | null) =>
    d ? new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d)) : "—";
  const counter = (text: string, max: number) => (
    <span className={cn("text-[11px] tabular-nums", text.length > max ? "font-semibold text-[#8E3B34]" : "text-[#5E6B62]")}>
      {text.length}/{max}
    </span>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title={n.title} description={n.subtitle} />

      <StatGrid cols={3}>
        <StatCard icon={<Smartphone />} label={n.statDevices} value={audience.devices.toLocaleString("en-IN")} sub={fmt(n.statDevicesSub, { n: audience.phones.toLocaleString("en-IN") })} />
        <StatCard icon={<Megaphone />} label={n.statSent} value={sent.length.toLocaleString("en-IN")} sub={n.statSentSub} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard dark icon={<BellRing />} label={n.statLast} value={sent[0] ? when(sent[0].createdAt) : "—"} sub={sent[0] ? broadcastText(sent[0], "en").title : n.none} />
        </div>
      </StatGrid>

      {done ? <Notice tone="green">{done}</Notice> : null}
      {errors.length ? (
        <div role="alert" className="rounded-xl bg-[#FBEAE8] px-4 py-3 text-sm text-[#8E3B34]">
          <ul className="list-disc space-y-1 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <form
          noValidate
          className="space-y-5 rounded-2xl border border-[#1E3317]/10 bg-white p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-bold text-[#1E3317]">{n.heading}</legend>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="bc-title-en" className={labelClass}>
                  {n.titleEn} <span className="text-[#8E3B34]">*</span>
                </label>
                {counter(titleEn, BROADCAST_LIMITS.title)}
              </div>
              <input id="bc-title-en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className={inputClass} placeholder={n.titleEnPh} />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="bc-title-ta" className={labelClass}>
                  {n.titleTa}
                </label>
                {counter(titleTa, BROADCAST_LIMITS.title)}
              </div>
              <input id="bc-title-ta" lang="ta" value={titleTa} onChange={(e) => setTitleTa(e.target.value)} className={inputClass} placeholder={n.titleTaPh} />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="bc-body-en" className={labelClass}>
                  {n.bodyEn}
                </label>
                {counter(bodyEn, BROADCAST_LIMITS.body)}
              </div>
              <textarea id="bc-body-en" rows={5} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} className={cn(inputClass, "h-auto py-2")} />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="bc-body-ta" className={labelClass}>
                  {n.bodyTa}
                </label>
                {counter(bodyTa, BROADCAST_LIMITS.body)}
              </div>
              <textarea id="bc-body-ta" lang="ta" rows={5} value={bodyTa} onChange={(e) => setBodyTa(e.target.value)} className={cn(inputClass, "h-auto py-2")} />
            </div>
            <p className="text-xs text-[#5E6B62] sm:col-span-2">{n.langHelp}</p>
          </fieldset>

          <fieldset className="space-y-4 border-t border-[#1E3317]/8 pt-5">
            <legend className="mb-3 text-sm font-bold text-[#1E3317]">{n.extras}</legend>
            <div>
              <span className={labelClass}>{n.image}</span>
              <div className="flex flex-wrap items-center gap-3">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-20 w-32 rounded-lg border border-[#1E3317]/10 object-cover" />
                ) : null}
                <input ref={fileInput} id="bc-image" type="file" accept={IMAGE_TYPES.join(",")} className="sr-only" onChange={(e) => void uploadImage(e.target.files?.[0])} />
                <label htmlFor="bc-image" className={cn(buttonClass("secondary", "sm"), uploading && "pointer-events-none opacity-60")}>
                  <ImagePlus aria-hidden /> {uploading ? n.uploading : imageUrl ? n.changeImage : n.addImage}
                </label>
                {imageUrl ? (
                  <button type="button" onClick={() => setImageUrl("")} className={buttonClass("ghost", "sm")}>
                    <Trash2 aria-hidden /> {t.common.remove}
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <label htmlFor="bc-link" className={labelClass}>
                <Link2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {n.link}
              </label>
              <input id="bc-link" type="url" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={inputClass} placeholder="https://" />
            </div>
            <div>
              <label htmlFor="bc-video" className={labelClass}>
                <PlayCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {n.video}
              </label>
              <input id="bc-video" type="url" inputMode="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={inputClass} placeholder="https://www.youtube.com/watch?v=…" />
              {videoUrl.trim() && !youtubeVideoId(videoUrl) ? <p className="mt-1 text-xs text-[#8E3B34]">{n.videoBad}</p> : null}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2 border-t border-[#1E3317]/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#5E6B62]">{fmt(n.willReach, { n: audience.devices.toLocaleString("en-IN") })}</p>
            <button type="submit" disabled={pending || uploading} className={buttonClass("primary")}>
              <Send aria-hidden /> {n.review}
            </button>
          </div>
        </form>

        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1E3317]">{n.preview}</h2>
            <div className="flex gap-1 rounded-full border border-[#1E3317]/10 bg-white p-1 text-xs" role="group" aria-label={n.preview}>
              {(["en", "ta"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={previewLang === l}
                  onClick={() => setPreviewLang(l)}
                  className={cn("rounded-full px-3 py-1 font-semibold", previewLang === l ? "bg-[#1E3317] text-white" : "text-[#3E5E2F]")}
                >
                  {l === "en" ? "English" : "தமிழ்"}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-[#1E3317] p-4 shadow-sm">
            <div className="rounded-xl bg-white/95 p-3">
              <p className="text-[11px] font-semibold text-[#5E6B62]">SkyWin Field · {n.now}</p>
              <p className="mt-1 text-sm font-bold text-[#1E3317]">{preview.title || n.titleEnPh}</p>
              <p className="mt-0.5 line-clamp-3 text-sm text-[#29332C]">{pushPreview(preview.body, hasMedia, preview.lang) || " "}</p>
              {check.value.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={check.value.imageUrl} alt="" className="mt-2 max-h-40 w-full rounded-lg object-cover" />
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-5 text-white/70">{n.previewHelp}</p>
          </div>
        </aside>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[#1E3317]">{n.history}</h2>
        {sent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#1E3317]/15 bg-white px-5 py-10 text-center text-sm text-[#5E6B62]">{n.historyEmpty}</p>
        ) : (
          <ul className="divide-y divide-[#1E3317]/8 overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm">
            {sent.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-[#1E3317]">{b.titleEn}</p>
                  {b.titleTa ? <p className="text-sm text-[#3E5E2F]" lang="ta">{b.titleTa}</p> : null}
                  {b.bodyEn ? <p className="mt-1 line-clamp-2 text-sm text-[#5E6B62]">{b.bodyEn}</p> : null}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-[#5E6B62]">
                    <span>{when(b.createdAt)}</span>
                    {b.createdBy ? <span>{fmt(n.by, { name: b.createdBy })}</span> : null}
                    {b.imageUrl ? <span>{n.hasImage}</span> : null}
                    {b.linkUrl ? <span>{n.hasLink}</span> : null}
                    {b.videoUrl ? <span>{n.hasVideo}</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <Badge tone={b.status === "sending" ? "amber" : b.status === "failed" || (b.devices > 0 && b.delivered === 0) ? "red" : "green"}>
                    {b.status === "sending"
                      ? n.statusSending
                      : b.status === "failed"
                        ? n.statusFailed
                        : b.devices > 0 && b.delivered === 0
                          ? n.statusNoPhone
                          : n.statusSent}
                  </Badge>
                  <span className="text-xs tabular-nums text-[#5E6B62]">
                    {fmt(n.counts, { delivered: b.delivered.toLocaleString("en-IN"), devices: b.devices.toLocaleString("en-IN") })}
                    {b.failed ? ` · ${fmt(n.failedCount, { n: b.failed })}` : ""}
                  </span>
                  <a href={`/news/${b.id}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#245B3E] hover:underline">
                    {n.open}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirm ? (
        <Modal title={n.confirmTitle} description={fmt(n.confirmBody, { n: audience.devices.toLocaleString("en-IN") })} onClose={() => setConfirm(false)} busy={pending} closeLabel={t.common.close}>
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1E3317]/10 p-3 text-sm">
              <p className="font-bold text-[#1E3317]">{check.value.titleEn}</p>
              {check.value.titleTa ? <p className="text-[#3E5E2F]" lang="ta">{check.value.titleTa}</p> : null}
            </div>
            <p className="text-xs text-[#8A5A00]">{n.cantUndo}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirm(false)} disabled={pending} className={buttonClass("secondary", "sm")}>
                {t.common.cancel}
              </button>
              <button type="button" onClick={send} disabled={pending} className={buttonClass("primary", "sm")}>
                <Send aria-hidden /> {pending ? n.sending : n.sendNow}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
