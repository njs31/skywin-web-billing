/**
 * Rules for notifications managers send to every Field app user (Field → Notifications).
 * Pure: shared by the dashboard form, the server and tests (lib/field-broadcast-rules.test.ts).
 */

export type BroadcastInput = {
  titleEn: string;
  titleTa?: string;
  bodyEn?: string;
  bodyTa?: string;
  imageUrl?: string;
  linkUrl?: string;
  videoUrl?: string;
};

export type CleanBroadcast = {
  titleEn: string;
  titleTa: string | null;
  bodyEn: string;
  bodyTa: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  videoUrl: string | null;
};

export const BROADCAST_LIMITS = { title: 65, body: 1000 } as const;

const oneLine = (s: string | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();
const multiLine = (s: string | undefined) =>
  String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** YouTube video id from watch, youtu.be, shorts, embed and live links; null otherwise. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  const text = String(url ?? "").trim();
  if (!text) return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** http(s) only, so a link can never run script or open another app scheme. */
export function safeWebUrl(url: string | null | undefined): string | null {
  const text = String(url ?? "").trim();
  if (!text) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Checks and tidies a broadcast. Returns the errors (empty when it can be sent). */
export function checkBroadcast(input: BroadcastInput): { value: CleanBroadcast; errors: string[] } {
  const errors: string[] = [];
  const titleEn = oneLine(input.titleEn);
  const titleTa = oneLine(input.titleTa);
  const bodyEn = multiLine(input.bodyEn);
  const bodyTa = multiLine(input.bodyTa);
  if (!titleEn) errors.push("Write the heading in English.");
  if (titleEn.length > BROADCAST_LIMITS.title) errors.push(`The English heading is longer than ${BROADCAST_LIMITS.title} characters.`);
  if (titleTa.length > BROADCAST_LIMITS.title) errors.push(`The Tamil heading is longer than ${BROADCAST_LIMITS.title} characters.`);
  if (bodyEn.length > BROADCAST_LIMITS.body) errors.push(`The English message is longer than ${BROADCAST_LIMITS.body} characters.`);
  if (bodyTa.length > BROADCAST_LIMITS.body) errors.push(`The Tamil message is longer than ${BROADCAST_LIMITS.body} characters.`);
  if (bodyTa && !titleTa) errors.push("Add a Tamil heading for the Tamil message.");

  const imageRaw = String(input.imageUrl ?? "").trim();
  const imageParsed = imageRaw ? safeWebUrl(imageRaw) : null;
  // https only (a phone won't load http images); http://localhost is a developer's own machine.
  const imageUrl = imageParsed && (imageParsed.startsWith("https://") || /^http:\/\/localhost[:/]/.test(imageParsed)) ? imageParsed : null;
  if (imageRaw && !imageUrl) errors.push("The image must be uploaded from this page.");

  const linkRaw = String(input.linkUrl ?? "").trim();
  const linkUrl = linkRaw ? safeWebUrl(linkRaw) : null;
  if (linkRaw && !linkUrl) errors.push("The link must be a web address, like https://skywin.in/offer.");

  const videoRaw = String(input.videoUrl ?? "").trim();
  const videoId = videoRaw ? youtubeVideoId(videoRaw) : null;
  if (videoRaw && !videoId) errors.push("The video must be a YouTube link (youtube.com/watch?v=… or youtu.be/…).");

  return {
    value: {
      titleEn,
      titleTa: titleTa || null,
      bodyEn,
      bodyTa: bodyTa || null,
      imageUrl,
      linkUrl,
      videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    },
    errors,
  };
}

/** Heading and text in the phone's language: Tamil when there is a Tamil heading, else English. */
export function broadcastText(b: { titleEn: string; titleTa: string | null; bodyEn: string; bodyTa: string | null }, lang: string | null | undefined) {
  const tamil = lang === "ta" && !!b.titleTa;
  return {
    lang: (tamil ? "ta" : "en") as "en" | "ta",
    title: tamil ? b.titleTa! : b.titleEn,
    body: tamil ? b.bodyTa || b.bodyEn : b.bodyEn,
  };
}

/** The push's short text: the message's first line(s), or a hint to open it when it only has media. */
export function pushPreview(body: string, hasMedia: boolean, lang: "en" | "ta") {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat) return flat.length > 178 ? `${flat.slice(0, 177).trimEnd()}…` : flat;
  if (hasMedia) return lang === "ta" ? "திறந்து பார்க்கவும்" : "Tap to open";
  return "";
}

/** In-app route a broadcast opens. */
export function broadcastRoute(id: string) {
  return `/news/${encodeURIComponent(id)}`;
}
