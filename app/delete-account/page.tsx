import type { Metadata } from "next";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Delete your SkyWin Field account",
  description: "How to ask SKYWIN BIOTECH to delete a SkyWin Field account or some of the data in it.",
};

export default function DeleteAccountPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 text-[#1E3317] sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2E4A22]/60">
        {BUSINESS.name} · SkyWin Field
      </p>
      <h1 className="mt-2 text-3xl font-bold">Delete your SkyWin Field account</h1>
      <p className="mt-4 text-[15px] leading-7">
        SkyWin Field is the mobile app from {BUSINESS.name}. Use the steps below to ask us to delete
        the account for a registered mobile number, or to delete only some of the data we hold.
      </p>

      <section className="mt-8 space-y-3 text-[15px] leading-7">
        <h2 className="text-xl font-semibold">How to request account deletion</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Email{" "}
            <a className="underline" href={`mailto:${BUSINESS.email}?subject=Delete%20SkyWin%20Field%20account`}>
              {BUSINESS.email}
            </a>
            .
          </li>
          <li>Use the subject line “Delete SkyWin Field account”.</li>
          <li>Include the 10-digit mobile number registered in the app.</li>
          <li>Say whether the account is a field officer or a farmer.</li>
          <li>We will reply to confirm, then delete the account.</li>
        </ol>
        <p>There is no delete button inside the app. Email is the way to make this request.</p>
      </section>

      <section className="mt-8 space-y-3 text-[15px] leading-7">
        <h2 className="text-xl font-semibold">What we delete</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>The sign-in link between that mobile number and SkyWin Field.</li>
          <li>The profile: name, phone numbers, village, territory, address, and PIN code.</li>
          <li>The farmer photo, farm details, saved farm location, crops, and reward points.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3 text-[15px] leading-7">
        <h2 className="text-xl font-semibold">What we keep, and for how long</h2>
        <p>
          Invoices, payment references, and other tax or accounting records are kept for as long as
          Indian tax law requires. That is commonly at least 6 years after the end of the relevant
          financial year. Delivery details already passed to a courier stay with that courier under
          its own policy. We also keep a short record that the deletion was requested.
        </p>
      </section>

      <section id="data" className="mt-8 space-y-3 text-[15px] leading-7">
        <h2 className="text-xl font-semibold">Delete some data without deleting the account</h2>
        <p>
          You can ask us to delete part of a record and keep the account. Email {BUSINESS.email} with
          the subject “Delete SkyWin Field data”, the registered mobile number, and what should be
          removed, such as a photo, an address, or a farm. The same tax and accounting records
          described above are kept when the law requires it.
        </p>
      </section>

      <section className="mt-8 space-y-2 text-[15px] leading-7">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          {BUSINESS.name}
          <br />
          {BUSINESS.address}
          <br />
          Phone: {BUSINESS.phone}
          <br />
          Email: <a className="underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        </p>
      </section>
    </article>
  );
}
