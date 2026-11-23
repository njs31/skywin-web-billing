import { test } from "node:test";
import assert from "node:assert/strict";
import { broadcastRoute, broadcastText, checkBroadcast, pushPreview, safeWebUrl, youtubeVideoId } from "./field-broadcast-rules";

test("YouTube links of every shape give the video id", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
  ]) assert.equal(youtubeVideoId(url), "dQw4w9WgXcQ", url);
  assert.equal(youtubeVideoId("https://vimeo.com/123"), null);
  assert.equal(youtubeVideoId("https://evil.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeVideoId("not a link"), null);
});

test("links must be web addresses", () => {
  assert.equal(safeWebUrl("skywin.qwicksapp.com/offers"), "https://skywin.qwicksapp.com/offers");
  assert.equal(safeWebUrl("javascript:alert(1)"), null);
  assert.equal(safeWebUrl("intent://x"), null);
  assert.equal(safeWebUrl("http://example.com"), "http://example.com/");
  assert.equal(safeWebUrl("nodot"), null);
});

test("checks a message", () => {
  assert.deepEqual(checkBroadcast({ titleEn: "" }).errors, ["Write the heading in English."]);
  assert.ok(checkBroadcast({ titleEn: "x".repeat(66) }).errors[0].includes("longer than 65"));
  assert.ok(checkBroadcast({ titleEn: "Hi", bodyTa: "வணக்கம்" }).errors.includes("Add a Tamil heading for the Tamil message."));
  assert.ok(checkBroadcast({ titleEn: "Hi", videoUrl: "https://vimeo.com/1" }).errors[0].startsWith("The video must be a YouTube link"));
  assert.ok(checkBroadcast({ titleEn: "Hi", linkUrl: "javascript:alert(1)" }).errors[0].startsWith("The link must be"));
  assert.ok(checkBroadcast({ titleEn: "Hi", imageUrl: "http://example.com/a.png" }).errors.includes("The image must be uploaded from this page."));
  const ok = checkBroadcast({ titleEn: "  New   stock ", bodyEn: "Line 1\r\n\r\n\r\nLine 2  ", videoUrl: "https://youtu.be/dQw4w9WgXcQ" });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.titleEn, "New stock");
  assert.equal(ok.value.bodyEn, "Line 1\n\nLine 2");
  assert.equal(ok.value.videoUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(ok.value.titleTa, null);
});

test("Tamil phones get Tamil when there is a Tamil heading", () => {
  const b = { titleEn: "New stock", titleTa: "புதிய சரக்கு", bodyEn: "Come today", bodyTa: null };
  assert.deepEqual(broadcastText(b, "ta"), { lang: "ta", title: "புதிய சரக்கு", body: "Come today" });
  assert.deepEqual(broadcastText(b, "en"), { lang: "en", title: "New stock", body: "Come today" });
  assert.deepEqual(broadcastText({ ...b, titleTa: null }, "ta"), { lang: "en", title: "New stock", body: "Come today" });
  assert.equal(broadcastText(b, null).lang, "en");
});

test("push text is short, or asks to open media", () => {
  assert.equal(pushPreview("a  b\nc", false, "en"), "a b c");
  assert.equal(pushPreview("x".repeat(300), false, "en").length, 178);
  assert.equal(pushPreview("", true, "en"), "Tap to open");
  assert.equal(pushPreview("", true, "ta"), "திறந்து பார்க்கவும்");
  assert.equal(pushPreview("", false, "en"), "");
  assert.equal(broadcastRoute("1642f3fb-09c2-4403-a59b-c409ddc2ecc6"), "/news/1642f3fb-09c2-4403-a59b-c409ddc2ecc6");
});
