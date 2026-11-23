import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBroadcast } from "@/lib/field-broadcast";
import { broadcastText, youtubeVideoId } from "@/lib/field-broadcast-rules";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, { lang }] = await Promise.all([params, searchParams]);
  const b = await getBroadcast(id);
  if (!b) return { title: "SkyWin" };
  return { title: `${broadcastText(b, lang).title} · SkyWin`, robots: { index: false, follow: false } };
}

/** Turns bare web addresses in the message into links (http/https only). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} rel="noopener noreferrer" className="break-all font-semibold text-[#245B3E] underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * A message SkyWin sent to app users. The app opens this in its in-app browser; it needs no
 * sign-in (every app user receives the same message). ?lang=ta shows the Tamil copy if there is one.
 */
export default async function NewsPage({ params, searchParams }: Props) {
  const [{ id }, { lang }] = await Promise.all([params, searchParams]);
  const b = await getBroadcast(id);
  if (!b) notFound();
  const text = broadcastText(b, lang);
  const video = youtubeVideoId(b.videoUrl);
  const when = new Intl.DateTimeFormat(text.lang === "ta" ? "ta-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(b.createdAt);

  return (
    <article lang={text.lang} className="mx-auto max-w-2xl px-5 pb-16 pt-8 text-[#1E3317]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3E5E2F]">SkyWin</p>
      <h1 className="mt-2 text-2xl font-bold leading-snug">{text.title}</h1>
      <p className="mt-1 text-sm text-[#5E6B62]">{when}</p>

      {b.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.imageUrl} alt="" className="mt-6 w-full rounded-2xl border border-[#1E3317]/10 bg-white object-contain" />
      ) : null}

      {text.body ? (
        <div className="mt-6 whitespace-pre-wrap text-[17px] leading-8 text-[#29332C]">
          <Linkified text={text.body} />
        </div>
      ) : null}

      {video ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video}?rel=0&playsinline=1`}
            title={text.title}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : null}
      {video ? (
        <a
          href={`https://www.youtube.com/watch?v=${video}`}
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-sm font-semibold text-[#245B3E] underline"
        >
          {text.lang === "ta" ? "YouTube-இல் பார்க்கவும்" : "Watch on YouTube"}
        </a>
      ) : null}

      {b.linkUrl ? (
        <a
          href={b.linkUrl}
          rel="noopener noreferrer"
          className="mt-8 flex h-12 items-center justify-center rounded-xl bg-[#1E3317] px-5 text-base font-semibold text-white"
        >
          {text.lang === "ta" ? "மேலும் அறிய" : "Learn more"}
        </a>
      ) : null}
    </article>
  );
}
